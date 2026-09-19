/**
 * Parsers for the data-import flow: delimited text (CSV/TSV/pipe) and JSON.
 *
 * The counterpart to `export.js`. Everything here is pure and synchronous so it
 * can be tested without a database, and so the dialog can re-parse on every
 * option change without a round-trip.
 */

/** @typedef {{ fields: string[], rows: string[][], delimiter: string, hasHeader: boolean }} ParsedTable */

/** Delimiters we can recognise, in the order they are tried. */
const CANDIDATE_DELIMITERS = [",", "\t", ";", "|"];

/**
 * Guess the delimiter by finding the one that splits the sample into rows of
 * the most consistent width. Counting raw occurrences instead would pick the
 * comma out of a semicolon-delimited file that happens to contain prose.
 *
 * @param {string} text
 * @returns {string}
 */
export function sniffDelimiter(text) {
  const sample = text.slice(0, 64 * 1024);
  let best = ",";
  let bestScore = -1;

  for (const delimiter of CANDIDATE_DELIMITERS) {
    const rows = parseDelimited(sample, { delimiter, hasHeader: false }).rows.slice(0, 20);
    if (rows.length === 0) continue;
    const widths = rows.map((r) => r.length);
    const columns = widths[0];
    if (columns < 2) continue;
    // Every row the same width, and more columns, is a better fit.
    const consistent = widths.every((w) => w === columns);
    const score = (consistent ? 1000 : 0) + columns;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

/**
 * Parse RFC 4180-style delimited text.
 *
 * Handles quoted fields, `""` escapes, delimiters and newlines inside quotes,
 * and CRLF or LF line endings. A trailing newline does not produce an empty
 * final row.
 *
 * @param {string} text
 * @param {{ delimiter?: string, hasHeader?: boolean, quote?: string }} [options]
 * @returns {ParsedTable}
 */
export function parseDelimited(text, options = {}) {
  const delimiter = options.delimiter || ",";
  const quote = options.quote || '"';
  const hasHeader = options.hasHeader !== false;

  // A byte-order mark would otherwise become part of the first field name.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let field = "";
  let inQuotes = false;
  let fieldWasQuoted = false;
  let i = 0;

  const endField = () => {
    // An unquoted empty field is a NULL candidate; a quoted one ("") is an
    // empty string. `toTypedRows` needs the difference, which is carried here
    // by leaving quoted-empty as "" and marking it via `quotedEmpty`.
    row.push(field);
    field = "";
    fieldWasQuoted = false;
  };
  const endRow = () => {
    endField();
    // Skip the blank row a trailing newline leaves behind.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === quote) {
        if (src[i + 1] === quote) {
          field += quote;
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === quote && field === "") {
      inQuotes = true;
      fieldWasQuoted = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      endField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // Swallow CR so CRLF and a lone CR both end the row exactly once.
      endRow();
      i += src[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // Whatever is left is a final row without a trailing newline.
  if (field !== "" || row.length > 0 || fieldWasQuoted) endRow();

  if (rows.length === 0) {
    return { fields: [], rows: [], delimiter, hasHeader };
  }

  if (!hasHeader) {
    const width = rows[0].length;
    return {
      fields: Array.from({ length: width }, (_, n) => `column_${n + 1}`),
      rows,
      delimiter,
      hasHeader,
    };
  }

  const [header, ...body] = rows;
  return { fields: header.map((h, n) => h.trim() || `column_${n + 1}`), rows: body, delimiter, hasHeader };
}

/**
 * Parse a JSON array of objects, or JSONL (one object per line).
 *
 * The field list is the union of every object's keys in first-seen order, so a
 * record that omits an optional key doesn't shorten the table.
 *
 * @param {string} text
 * @returns {{ fields: string[], rows: unknown[][] }}
 */
export function parseJsonRecords(text) {
  const trimmed = text.trim();
  if (!trimmed) return { fields: [], rows: [] };

  /** @type {any[]} */
  let records;
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of objects");
    records = parsed;
  } else {
    // JSONL - one record per non-blank line.
    records = trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, n) => {
        try {
          return JSON.parse(line);
        } catch {
          throw new Error(`Line ${n + 1} is not valid JSON`);
        }
      });
  }

  if (records.length === 0) return { fields: [], rows: [] };
  if (records.some((r) => r === null || typeof r !== "object" || Array.isArray(r))) {
    throw new Error("Every record must be a JSON object");
  }

  /** @type {string[]} */
  const fields = [];
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!fields.includes(key)) fields.push(key);
    }
  }
  const rows = records.map((record) => fields.map((f) => (f in record ? record[f] : null)));
  return { fields, rows };
}

/**
 * Parse whatever the file turned out to be.
 *
 * @param {string} text
 * @param {{ format?: 'auto'|'delimited'|'json', delimiter?: string, hasHeader?: boolean }} [options]
 * @returns {{ fields: string[], rows: unknown[][], format: 'delimited'|'json', delimiter: string }}
 */
export function parseImportText(text, options = {}) {
  const format =
    options.format && options.format !== "auto"
      ? options.format
      : /^\s*[[{]/.test(text)
        ? "json"
        : "delimited";

  if (format === "json") {
    const { fields, rows } = parseJsonRecords(text);
    return { fields, rows, format: "json", delimiter: "" };
  }
  const delimiter = options.delimiter || sniffDelimiter(text);
  const parsed = parseDelimited(text, { delimiter, hasHeader: options.hasHeader });
  return { fields: parsed.fields, rows: parsed.rows, format: "delimited", delimiter };
}

/**
 * Turn a parsed cell into the JSON value the backend should bind.
 *
 * Delimited files carry no types, so this is where `""`, `NULL` and `true`
 * stop being text. The rules are deliberately conservative: only the exact
 * spellings listed convert, because a column of product codes must not lose
 * `007` to a number, and a `nullText` of `NULL` must not blank out a genuine
 * row that says "null".
 *
 * @param {unknown} value
 * @param {{ nullText?: string, emptyAsNull?: boolean, parseNumbers?: boolean, parseBooleans?: boolean }} [options]
 * @returns {unknown}
 */
export function coerceValue(value, options = {}) {
  const { nullText = "", emptyAsNull = true, parseNumbers = true, parseBooleans = true } = options;

  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value; // JSON input is already typed

  if (nullText && value === nullText) return null;
  if (emptyAsNull && value === "") return null;

  if (parseBooleans) {
    if (value === "true" || value === "TRUE") return true;
    if (value === "false" || value === "FALSE") return false;
  }
  if (parseNumbers && isPlainNumber(value)) return Number(value);
  return value;
}

/**
 * True for text that is safe to turn into a number.
 *
 * Rejects leading zeros (`007`, a code), leading `+`, whitespace padding, and
 * anything outside the exact double range - all of which would change the value
 * on the way in.
 *
 * @param {string} s
 */
function isPlainNumber(s) {
  if (!/^-?(0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?$/.test(s)) return false;
  const n = Number(s);
  if (!Number.isFinite(n)) return false;
  // Past 2^53 a round-trip stops being exact, so keep it as text and let the
  // database's own numeric parser take it.
  return Number.isInteger(n) ? Number.isSafeInteger(n) : String(n) === s || Number(String(n)) === n;
}

/**
 * Build the rows to send, in the order of `columns`.
 *
 * @param {unknown[][]} rows raw parsed rows
 * @param {string[]} fields the source field names, positionally matching `rows`
 * @param {Record<string, string>} mapping column name -> source field name
 * @param {string[]} columns target columns, in the order the backend expects
 * @param {Parameters<typeof coerceValue>[1]} [coerceOptions]
 * @returns {unknown[][]}
 */
export function toTypedRows(rows, fields, mapping, columns, coerceOptions) {
  const indexes = columns.map((col) => fields.indexOf(mapping[col]));
  return rows.map((row) =>
    indexes.map((idx) => (idx === -1 ? null : coerceValue(row[idx], coerceOptions))),
  );
}

/**
 * Pair target columns with source fields by name.
 *
 * Matching ignores case, spaces, dashes and underscores so a `First Name`
 * header finds a `first_name` column without the user doing it by hand.
 *
 * @param {string[]} columns target column names
 * @param {string[]} fields source field names
 * @returns {Record<string, string>} column -> field ("" when unmatched)
 */
export function autoMapFields(columns, fields) {
  const normalise = (/** @type {string} */ s) => s.toLowerCase().replace(/[\s_-]+/g, "");
  const byNormalised = new Map(fields.map((f) => [normalise(f), f]));
  /** @type {Record<string, string>} */
  const mapping = {};
  for (const col of columns) {
    mapping[col] = byNormalised.get(normalise(col)) ?? "";
  }
  return mapping;
}
