/** @typedef {{
 *   schemas?: string[]
 *   activeSchema?: string
 *   tables?: string[]
 *   columnsByTable?: Record<string, string[]>
 * }} SqlSchemaHints */

// ── Keywords ─────────────────────────────────────────────────────────────────
// Single-word only — multi-word entries (e.g. "NOT NULL") don't align with
// Monaco's word-boundary detection and produce broken completions.

const PG_KEYWORDS = [
  // DML
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'RETURNING',
  // FROM / joins
  'FROM', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'CROSS', 'OUTER', 'LATERAL', 'ON', 'USING',
  // WHERE / predicates
  'WHERE', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE', 'IS', 'NULL', 'TRUE', 'FALSE',
  // Grouping / sorting
  'GROUP', 'ORDER', 'BY', 'HAVING', 'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST',
  // Pagination
  'LIMIT', 'OFFSET', 'FETCH',
  // Set ops
  'UNION', 'ALL', 'EXCEPT', 'INTERSECT', 'DISTINCT',
  // DML clauses
  'INTO', 'VALUES', 'SET', 'AS',
  // CTE
  'WITH', 'RECURSIVE',
  // CASE
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  // Window
  'OVER', 'PARTITION', 'ROWS', 'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING',
  // DDL
  'CREATE', 'TABLE', 'VIEW', 'INDEX', 'ALTER', 'DROP', 'TRUNCATE',
  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'DEFAULT', 'CONSTRAINT', 'CHECK',
  // Transactions
  'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
  // Query tools
  'EXPLAIN', 'ANALYZE', 'VACUUM',
  // Misc
  'CAST', 'COALESCE', 'FILTER', 'WITHIN',
]

// ── Functions ─────────────────────────────────────────────────────────────────
// sig: snippet body (with $1/$2 tab-stops)
// doc: one-line description shown in the detail panel

/** @type {Array<{label:string, sig:string, doc:string}>} */
const PG_FUNCTIONS = [
  // Aggregates
  { label: 'count',          sig: 'count(${1:*})',                                    doc: 'Count rows. count(*) counts all rows; count(col) excludes NULLs.' },
  { label: 'sum',            sig: 'sum(${1:expression})',                              doc: 'Sum of a numeric column, ignoring NULLs.' },
  { label: 'avg',            sig: 'avg(${1:expression})',                              doc: 'Arithmetic mean, ignoring NULLs.' },
  { label: 'min',            sig: 'min(${1:expression})',                              doc: 'Minimum value in the column.' },
  { label: 'max',            sig: 'max(${1:expression})',                              doc: 'Maximum value in the column.' },
  { label: 'string_agg',    sig: "string_agg(${1:expression}, ${2:', '})",            doc: "Concatenate non-NULL values with a delimiter. e.g. string_agg(name, ', ')" },
  { label: 'array_agg',     sig: 'array_agg(${1:expression})',                        doc: 'Collect values into a PostgreSQL array.' },
  { label: 'json_agg',      sig: 'json_agg(${1:expression})',                         doc: 'Collect values as a JSON array.' },
  { label: 'jsonb_agg',     sig: 'jsonb_agg(${1:expression})',                        doc: 'Collect values as a JSONB array.' },
  { label: 'bool_and',      sig: 'bool_and(${1:expression})',                         doc: 'True only if all boolean values are true.' },
  { label: 'bool_or',       sig: 'bool_or(${1:expression})',                          doc: 'True if any boolean value is true.' },
  // Window
  { label: 'row_number',    sig: 'row_number()',                                      doc: 'Unique sequential integer for each row in its partition. No ties.' },
  { label: 'rank',          sig: 'rank()',                                             doc: 'Rank with gaps for ties: 1, 1, 3, ...' },
  { label: 'dense_rank',    sig: 'dense_rank()',                                      doc: 'Rank without gaps for ties: 1, 1, 2, ...' },
  { label: 'ntile',         sig: 'ntile(${1:buckets})',                               doc: 'Distribute rows into n buckets, returns bucket number 1–n.' },
  { label: 'lag',           sig: 'lag(${1:value}, ${2:1})',                           doc: 'Value from a previous row. lag(col) = 1 row back, lag(col, 2) = 2 rows back.' },
  { label: 'lead',          sig: 'lead(${1:value}, ${2:1})',                          doc: 'Value from a following row.' },
  { label: 'first_value',   sig: 'first_value(${1:expression})',                      doc: 'First value in the current window frame.' },
  { label: 'last_value',    sig: 'last_value(${1:expression})',                       doc: 'Last value in the current window frame.' },
  { label: 'percent_rank',  sig: 'percent_rank()',                                    doc: 'Relative rank as a fraction between 0 and 1.' },
  // String
  { label: 'lower',         sig: 'lower(${1:string})',                                doc: 'Convert string to lowercase.' },
  { label: 'upper',         sig: 'upper(${1:string})',                                doc: 'Convert string to uppercase.' },
  { label: 'trim',          sig: 'trim(${1:string})',                                 doc: 'Remove leading and trailing whitespace.' },
  { label: 'ltrim',         sig: 'ltrim(${1:string})',                                doc: 'Remove leading (left) whitespace.' },
  { label: 'rtrim',         sig: 'rtrim(${1:string})',                                doc: 'Remove trailing (right) whitespace.' },
  { label: 'length',        sig: 'length(${1:string})',                               doc: 'Number of characters in the string.' },
  { label: 'char_length',   sig: 'char_length(${1:string})',                          doc: 'Character length (same as length()).' },
  { label: 'substr',        sig: 'substr(${1:string}, ${2:from}, ${3:count})',        doc: 'Extract substring starting at position from, up to count chars.' },
  { label: 'substring',     sig: 'substring(${1:string} from ${2:1} for ${3:n})',    doc: 'Extract part of a string. substring(str from start for length).' },
  { label: 'left',          sig: 'left(${1:string}, ${2:n})',                         doc: 'First n characters of a string.' },
  { label: 'right',         sig: 'right(${1:string}, ${2:n})',                        doc: 'Last n characters of a string.' },
  { label: 'split_part',    sig: "split_part(${1:string}, ${2:'.'}, ${3:1})",        doc: 'Split by delimiter and return the nth part (1-based index).' },
  { label: 'replace',       sig: "replace(${1:string}, ${2:'from'}, ${3:'to'})",     doc: 'Replace all occurrences of a substring.' },
  { label: 'regexp_replace',sig: "regexp_replace(${1:string}, ${2:'pattern'}, ${3:'replacement'})", doc: 'Replace matches of a POSIX regex. Add flag g for all matches.' },
  { label: 'concat',        sig: 'concat(${1:val1}, ${2:val2})',                      doc: 'Concatenate values, ignoring NULLs.' },
  { label: 'concat_ws',     sig: "concat_ws(${1:', '}, ${2:val1}, ${3:val2})",       doc: "Concatenate with separator, skipping NULLs. e.g. concat_ws(', ', first, last)" },
  { label: 'lpad',          sig: "lpad(${1:string}, ${2:length}, ${3:' '})",         doc: 'Left-pad string to length with fill character.' },
  { label: 'rpad',          sig: "rpad(${1:string}, ${2:length}, ${3:' '})",         doc: 'Right-pad string to length with fill character.' },
  { label: 'initcap',       sig: 'initcap(${1:string})',                              doc: 'Capitalize the first letter of each word.' },
  { label: 'md5',           sig: 'md5(${1:string})',                                  doc: 'MD5 hash of the string, returned as hex.' },
  { label: 'format',        sig: "format(${1:'%s'}, ${2:arg})",                       doc: "Format a string with printf-style substitutions. %s = text, %I = identifier, %L = literal." },
  { label: 'encode',        sig: "encode(${1:data}, ${2:'hex'})",                     doc: "Encode binary data. Formats: 'base64', 'hex', 'escape'." },
  // Numeric
  { label: 'abs',           sig: 'abs(${1:n})',                                       doc: 'Absolute value of n.' },
  { label: 'ceil',          sig: 'ceil(${1:n})',                                      doc: 'Round up to the nearest integer.' },
  { label: 'ceiling',       sig: 'ceiling(${1:n})',                                   doc: 'Round up to the nearest integer (same as ceil).' },
  { label: 'floor',         sig: 'floor(${1:n})',                                     doc: 'Round down to the nearest integer.' },
  { label: 'round',         sig: 'round(${1:n}, ${2:0})',                             doc: 'Round to d decimal places. round(3.145, 2) → 3.15.' },
  { label: 'trunc',         sig: 'trunc(${1:n})',                                     doc: 'Truncate fractional part toward zero.' },
  { label: 'mod',           sig: 'mod(${1:dividend}, ${2:divisor})',                  doc: 'Remainder after integer division.' },
  { label: 'power',         sig: 'power(${1:base}, ${2:exponent})',                   doc: 'Base raised to the power of exponent.' },
  { label: 'sqrt',          sig: 'sqrt(${1:n})',                                      doc: 'Square root of n.' },
  { label: 'random',        sig: 'random()',                                          doc: 'Random float between 0.0 and 1.0.' },
  { label: 'greatest',      sig: 'greatest(${1:val1}, ${2:val2})',                    doc: 'Largest of the provided values, ignoring NULLs.' },
  { label: 'least',         sig: 'least(${1:val1}, ${2:val2})',                       doc: 'Smallest of the provided values, ignoring NULLs.' },
  { label: 'sign',          sig: 'sign(${1:n})',                                      doc: 'Sign of n: -1, 0, or 1.' },
  // Date / time
  { label: 'now',           sig: 'now()',                                             doc: 'Current date and time with timezone (same as current_timestamp).' },
  { label: 'current_date',  sig: 'current_date',                                     doc: 'Current date (no time component).' },
  { label: 'current_time',  sig: 'current_time',                                     doc: 'Current time with timezone.' },
  { label: 'date_trunc',    sig: "date_trunc(${1:'month'}, ${2:timestamp})",         doc: "Truncate to a time unit. Units: 'year' 'quarter' 'month' 'week' 'day' 'hour' 'minute' 'second'." },
  { label: 'date_part',     sig: "date_part(${1:'month'}, ${2:timestamp})",          doc: "Extract a date/time field as a number. e.g. date_part('year', created_at)." },
  { label: 'extract',       sig: 'extract(${1:year} FROM ${2:timestamp})',            doc: "Extract a date/time field. e.g. extract(year from created_at) → 2024." },
  { label: 'age',           sig: 'age(${1:timestamp})',                               doc: 'Interval elapsed from timestamp to now. age(birth_date) gives a person\'s age.' },
  { label: 'to_char',       sig: "to_char(${1:value}, ${2:'YYYY-MM-DD'})",           doc: "Format a date or number as text. Patterns: YYYY MM DD HH24 MI SS. e.g. to_char(now(), 'Mon DD, YYYY')." },
  { label: 'to_timestamp',  sig: "to_timestamp(${1:string}, ${2:'YYYY-MM-DD'})",     doc: 'Parse a text string into a timestamptz.' },
  { label: 'to_date',       sig: "to_date(${1:string}, ${2:'YYYY-MM-DD'})",          doc: 'Parse a text string into a date.' },
  { label: 'make_interval', sig: 'make_interval(${1:years => 0, months => 0, days => 0})', doc: 'Build an interval from named fields.' },
  // JSON / JSONB
  { label: 'json_build_object',  sig: "json_build_object(${1:'key'}, ${2:value})",   doc: 'Build a JSON object from alternating key/value arguments.' },
  { label: 'jsonb_build_object', sig: "jsonb_build_object(${1:'key'}, ${2:value})",  doc: 'Build a JSONB object from alternating key/value arguments.' },
  { label: 'json_build_array',   sig: 'json_build_array(${1:val1}, ${2:val2})',      doc: 'Build a JSON array from arguments.' },
  { label: 'jsonb_set',     sig: "jsonb_set(${1:target}, ${2:'{key}'}::text[], ${3:new_value}::jsonb)", doc: 'Replace value at path in a JSONB document.' },
  { label: 'jsonb_strip_nulls', sig: 'jsonb_strip_nulls(${1:object})',               doc: 'Remove all null-valued keys from a JSONB object (recursively).' },
  { label: 'row_to_json',   sig: 'row_to_json(${1:row})',                             doc: 'Convert a table row to a JSON object.' },
  { label: 'to_jsonb',      sig: 'to_jsonb(${1:expression})',                         doc: 'Convert any SQL value to JSONB.' },
  // Null / conditional
  { label: 'coalesce',      sig: 'coalesce(${1:val1}, ${2:val2})',                    doc: 'Return the first non-NULL argument. coalesce(col, 0) replaces NULL with 0.' },
  { label: 'nullif',        sig: 'nullif(${1:val1}, ${2:val2})',                      doc: 'Return NULL if val1 = val2, otherwise return val1. Useful to avoid division by zero.' },
  // Array
  { label: 'array_length',  sig: 'array_length(${1:array}, ${2:1})',                 doc: 'Length of the nth array dimension (1 = outermost).' },
  { label: 'array_agg',     sig: 'array_agg(${1:expression})',                       doc: 'Aggregate values into an array.' },
  { label: 'unnest',        sig: 'unnest(${1:array})',                                doc: 'Expand an array to a set of rows. Great in a lateral JOIN.' },
  { label: 'generate_series', sig: 'generate_series(${1:start}, ${2:stop})',         doc: 'Generate a series of values. generate_series(1, 10) → rows 1 through 10.' },
  // Casting / type
  { label: 'cast',          sig: 'cast(${1:expression} AS ${2:type})',                doc: 'Explicit type cast. Equivalent to expression::type.' },
  // Utility
  { label: 'pg_size_pretty', sig: 'pg_size_pretty(${1:bytes})',                      doc: 'Format a byte count as a human-readable string (KB, MB, GB).' },
  { label: 'pg_typeof',     sig: 'pg_typeof(${1:expression})',                        doc: 'Return the data type of an expression as text.' },
]

// ── Snippets ───────────────────────────────────────────────────────────────────
/** @type {Array<{label:string, body:string, detail:string}>} */
const SQL_SNIPPETS = [
  { label: 'sel',   body: 'SELECT ${1:*} FROM ${2:table}',                                                      detail: 'SELECT … FROM' },
  { label: 'selw',  body: 'SELECT ${1:*} FROM ${2:table}\nWHERE ${3:condition}',                                detail: 'SELECT … WHERE' },
  { label: 'selj',  body: 'SELECT ${1:*}\nFROM ${2:table} t1\nINNER JOIN ${3:other} t2 ON t1.${4:id} = t2.${5:id}', detail: 'SELECT … JOIN' },
  { label: 'selg',  body: 'SELECT ${1:col}, COUNT(*) AS count\nFROM ${2:table}\nGROUP BY ${1:col}\nORDER BY count DESC', detail: 'GROUP BY + COUNT(*)' },
  { label: 'selct', body: 'SELECT COUNT(*) FROM ${1:table}',                                                    detail: 'Count all rows' },
  { label: 'ins',   body: 'INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values})',                        detail: 'INSERT INTO' },
  { label: 'insr',  body: 'INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values})\nRETURNING *',           detail: 'INSERT … RETURNING' },
  { label: 'upd',   body: 'UPDATE ${1:table}\nSET ${2:column} = ${3:value}\nWHERE ${4:id} = ${5:1}',           detail: 'UPDATE … SET … WHERE' },
  { label: 'del',   body: 'DELETE FROM ${1:table}\nWHERE ${2:id} = ${3:1}',                                    detail: 'DELETE … WHERE' },
  { label: 'cte',   body: 'WITH ${1:cte} AS (\n  ${2:SELECT 1}\n)\nSELECT * FROM ${1:cte}',                   detail: 'WITH … AS (CTE)' },
  { label: 'case',  body: 'CASE\n  WHEN ${1:condition} THEN ${2:result}\n  ELSE ${3:default}\nEND',             detail: 'CASE WHEN … END' },
  { label: 'win',   body: '${1:ROW_NUMBER}() OVER (PARTITION BY ${2:col} ORDER BY ${3:col} DESC)',              detail: 'Window function' },
  { label: 'lim',   body: 'LIMIT ${1:100} OFFSET ${2:0}',                                                      detail: 'LIMIT … OFFSET' },
  { label: 'expl',  body: 'EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)\n${1:SELECT * FROM table}',                  detail: 'EXPLAIN ANALYZE' },
]

// ── Context detection ─────────────────────────────────────────────────────────
// Determines whether cursor is in a position expecting a TABLE name or a
// COLUMN name, so we can surface the most relevant items first.

const TABLE_CONTEXT_KWS = new Set(['FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE', 'EXISTS', 'TRUNCATE'])
const COLUMN_CONTEXT_KWS = new Set([
  'SELECT', 'WHERE', 'ON', 'HAVING', 'SET', 'RETURNING', 'BY',
  'BETWEEN', 'LIKE', 'ILIKE', 'AND', 'OR', 'THEN', 'ELSE', 'WHEN',
])

/**
 * @param {string} textBeforeCursor
 * @returns {'table' | 'column' | 'any'}
 */
function detectContext(textBeforeCursor) {
  const normalized = textBeforeCursor
    .replace(/--[^\n]*/g, ' ')          // strip line comments
    .replace(/\/\*[\s\S]*?\*\//g, ' ')  // strip block comments
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trimEnd()

  // Split on whitespace + common delimiters to get individual tokens
  const tokens = normalized.split(/[\s,;()\[\]]+/).filter(Boolean)

  // Walk backwards: first clause keyword wins
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    if (TABLE_CONTEXT_KWS.has(t)) return 'table'
    if (COLUMN_CONTEXT_KWS.has(t)) return 'column'
  }
  return 'any'
}

// ── Identifier quoting ────────────────────────────────────────────────────────

/** @param {string} name */
function quoteIdent(name) {
  return /^[a-z_][a-z0-9_$]*$/i.test(name) ? name : `"${name.replace(/"/g, '""')}"`
}

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * @param {typeof import('monaco-editor')} monaco
 * @param {() => SqlSchemaHints} getHints
 */
export function registerMonacoSqlCompletion(monaco, getHints) {
  if (registerMonacoSqlCompletion.done) return
  registerMonacoSqlCompletion.done = true

  monaco.languages.setLanguageConfiguration('sql', {
    comments: { lineComment: '--', blockComment: ['/*', '*/'] },
    brackets: [['(', ')'], ['[', ']']],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '"', close: '"', notIn: ['string', 'comment'] },
    ],
    surroundingPairs: [
      { open: '(', close: ')' },
      { open: "'", close: "'" },
      { open: '"', close: '"' },
    ],
  })

  monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ' ', '\n'],
    provideCompletionItems(model, position) {
      const hints = getHints()
      const schemas = hints.schemas ?? []
      const activeSchema = hints.activeSchema ?? 'public'
      const tables = hints.tables ?? []
      const columnsByTable = hints.columnsByTable ?? {}

      // Current word being typed
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(
        position.lineNumber, word.startColumn,
        position.lineNumber, word.endColumn,
      )

      // Text from line start to cursor — used for dot completion
      const linePrefix = model.getValueInRange({
        startLineNumber: position.lineNumber, startColumn: 1,
        endLineNumber: position.lineNumber, endColumn: position.column,
      })

      // Full document text before cursor — used for context detection
      const docBeforeCursor = model.getValueInRange({
        startLineNumber: 1, startColumn: 1,
        endLineNumber: position.lineNumber, endColumn: position.column,
      })

      const partial = word.word.toLowerCase()
      const ctx = detectContext(docBeforeCursor)

      /** @type {import('monaco-editor').languages.CompletionItem[]} */
      const suggestions = []
      const Kind = monaco.languages.CompletionItemKind
      const InsertAsSnippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet

      // ── 1. Dot completion: schema.table or table.column ────────────────
      const dotMatch = linePrefix.match(/(?:["']([^"']+)["']|([\w$]+))\.["']?([\w$]*)$/)
      if (dotMatch) {
        const left = dotMatch[1] || dotMatch[2] || ''
        const leftLower = left.toLowerCase()

        if (schemas.some((s) => s.toLowerCase() === leftLower)) {
          for (const table of tables) {
            if (partial && !table.toLowerCase().startsWith(partial)) continue
            suggestions.push({
              label: table,
              kind: Kind.Class,
              insertText: quoteIdent(table),
              range,
              detail: `table in ${left}`,
              sortText: `0_${table}`,
            })
          }
          return { suggestions }
        }

        const colKeys = [left, `${activeSchema}.${left}`, leftLower, `${activeSchema}.${leftLower}`]
        const cols = new Set()
        for (const key of colKeys) {
          for (const c of columnsByTable[key] ?? []) cols.add(c)
        }
        for (const col of cols) {
          if (partial && !col.toLowerCase().startsWith(partial)) continue
          suggestions.push({
            label: col,
            kind: Kind.Field,
            insertText: quoteIdent(col),
            range,
            detail: `column in ${left}`,
            sortText: `0_${col}`,
          })
        }
        if (suggestions.length) return { suggestions }
      }

      // ── 2. Context-based priority sort prefixes ────────────────────────
      // table context:  tables='0_', schemas='1_', columns='7_', fns='8_', kws='9_'
      // column context: cols='0_',  fns='1_',     tables='6_', kws='7_',  schemas='8_'
      // any context:    schemas='1_', tables='2_', cols='3_', fns='4_', kws='5_', snippets='6_'
      const sortTable  = ctx === 'table'  ? '0_' : ctx === 'column' ? '6_' : '2_'
      const sortSchema = ctx === 'table'  ? '1_' : ctx === 'column' ? '8_' : '1_'
      const sortCol    = ctx === 'column' ? '0_' : ctx === 'table'  ? '7_' : '3_'
      const sortFn     = ctx === 'column' ? '1_' : ctx === 'table'  ? '8_' : '4_'
      const sortKw     = ctx === 'table'  ? '9_' : ctx === 'column' ? '7_' : '5_'
      const sortSnip   = '6_'

      // ── 3. Schemas ──────────────────────────────────────────────────────
      for (const schema of schemas) {
        if (partial && !schema.toLowerCase().startsWith(partial)) continue
        suggestions.push({
          label: schema,
          kind: Kind.Module,
          insertText: `${quoteIdent(schema)}.`,
          range,
          detail: 'schema',
          sortText: `${sortSchema}${schema}`,
        })
      }

      // ── 4. Tables ───────────────────────────────────────────────────────
      for (const table of tables) {
        if (partial && !table.toLowerCase().startsWith(partial)) continue
        suggestions.push({
          label: table,
          kind: Kind.Class,
          insertText: quoteIdent(table),
          range,
          detail: `table · ${activeSchema}`,
          documentation: ctx === 'table'
            ? `SELECT * FROM ${quoteIdent(table)} LIMIT 100`
            : undefined,
          sortText: `${sortTable}${table}`,
        })
      }

      // ── 5. Columns (from all known tables) ─────────────────────────────
      const seenCols = new Set()
      for (const [tbl, cols] of Object.entries(columnsByTable)) {
        const tblShort = tbl.includes('.') ? tbl.split('.').pop() ?? tbl : tbl
        for (const col of cols) {
          if (!col) continue
          const key = `${tblShort}.${col}`
          if (seenCols.has(key)) continue
          seenCols.add(key)
          if (partial && !col.toLowerCase().startsWith(partial)) continue
          suggestions.push({
            label: col,
            kind: Kind.Field,
            insertText: quoteIdent(col),
            range,
            detail: `column · ${tblShort}`,
            sortText: `${sortCol}${col}`,
          })
        }
      }

      // ── 6. Functions ────────────────────────────────────────────────────
      for (const fn of PG_FUNCTIONS) {
        if (partial && !fn.label.toLowerCase().startsWith(partial)) continue
        suggestions.push({
          label: fn.label,
          kind: Kind.Function,
          insertText: fn.sig,
          insertTextRules: InsertAsSnippet,
          range,
          detail: fn.sig.replace(/\$\{\d+:?([^}]*)\}/g, '$1').replace(/\$\d+/g, ''),
          documentation: { value: fn.doc },
          sortText: `${sortFn}${fn.label}`,
        })
      }

      // ── 7. Keywords ─────────────────────────────────────────────────────
      for (const kw of PG_KEYWORDS) {
        if (partial && !kw.toLowerCase().startsWith(partial)) continue
        suggestions.push({
          label: kw,
          kind: Kind.Keyword,
          insertText: kw,
          range,
          detail: 'keyword',
          sortText: `${sortKw}${kw}`,
        })
      }

      // ── 8. Snippets ─────────────────────────────────────────────────────
      for (const snip of SQL_SNIPPETS) {
        if (partial && !snip.label.toLowerCase().startsWith(partial)) continue
        suggestions.push({
          label: snip.label,
          kind: Kind.Snippet,
          insertText: snip.body,
          insertTextRules: InsertAsSnippet,
          range,
          detail: snip.detail,
          documentation: { value: `\`\`\`sql\n${snip.body.replace(/\$\{\d+:?([^}]*)\}/g, '$1')}\n\`\`\`` },
          sortText: `${sortSnip}${snip.label}`,
        })
      }

      return { suggestions }
    },
  })
}

registerMonacoSqlCompletion.done = false
