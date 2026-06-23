/** @typedef {{
 *   schemas?: string[]
 *   activeSchema?: string
 *   tables?: string[]
 *   columnsByTable?: Record<string, string[]>
 *   enumValues?: Record<string, string[]>
 *   userFunctions?: Array<{name: string, signature: string, returnType: string, kind: string}>
 * }} SqlSchemaHints */

// ── Keywords ─────────────────────────────────────────────────────────────────

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

// Keywords that are relevant in TABLE context (after FROM/JOIN)
const TABLE_CTX_KWS = new Set([
  'AS', 'WHERE', 'ON', 'USING',
  'JOIN', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'CROSS', 'OUTER', 'LATERAL',
  'GROUP', 'ORDER', 'BY', 'HAVING', 'LIMIT', 'OFFSET', 'FETCH',
  'UNION', 'INTERSECT', 'EXCEPT', 'ALL',
  'WITH', 'RECURSIVE',
])

// Keywords that are relevant in COLUMN context (after SELECT/WHERE/etc.)
const COLUMN_CTX_KWS = new Set([
  'AS', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE', 'IS', 'NULL', 'TRUE', 'FALSE',
  'DISTINCT', 'ALL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'CAST', 'COALESCE', 'NULLIF', 'GREATEST', 'LEAST',
  'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST',
  'OVER', 'PARTITION', 'BY', 'ROWS', 'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING',
  'FILTER', 'WITHIN', 'RETURNING',
  'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET',
])

// SQL reserved words that should never be treated as table aliases
const SQL_KW_SET = new Set([
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'CROSS', 'OUTER', 'LATERAL',
  'ON', 'USING', 'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'ILIKE', 'IS', 'NULL', 'TRUE', 'FALSE',
  'ORDER', 'GROUP', 'BY', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'INTERSECT', 'EXCEPT',
  'INSERT', 'UPDATE', 'DELETE', 'AS', 'WITH', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'ALL', 'DISTINCT', 'INTO', 'VALUES', 'SET', 'RETURNING', 'EXISTS', 'RECURSIVE',
])

// ── Context detection keywords ─────────────────────────────────────────────

const TABLE_CONTEXT_KWS = new Set(['FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE', 'EXISTS', 'TRUNCATE'])
const COLUMN_CONTEXT_KWS = new Set([
  'SELECT', 'WHERE', 'ON', 'HAVING', 'SET', 'RETURNING', 'BY',
  'BETWEEN', 'LIKE', 'ILIKE', 'AND', 'OR', 'THEN', 'ELSE', 'WHEN',
])

// ── Functions ─────────────────────────────────────────────────────────────────

/** @type {Array<{label:string, sig:string, doc:string}>} */
const PG_FUNCTIONS = [
  // Aggregates
  { label: 'count',          sig: 'count(${1:*})',                                    doc: 'Count rows. count(*) counts all rows; count(col) excludes NULLs.' },
  { label: 'sum',            sig: 'sum(${1:expression})',                              doc: 'Sum of a numeric column, ignoring NULLs.' },
  { label: 'avg',            sig: 'avg(${1:expression})',                              doc: 'Arithmetic mean, ignoring NULLs.' },
  { label: 'min',            sig: 'min(${1:expression})',                              doc: 'Minimum value in the column.' },
  { label: 'max',            sig: 'max(${1:expression})',                              doc: 'Maximum value in the column.' },
  { label: 'string_agg',    sig: "string_agg(${1:expression}, ${2:', '})",            doc: "Concatenate non-NULL values with a delimiter." },
  { label: 'array_agg',     sig: 'array_agg(${1:expression})',                        doc: 'Collect values into a PostgreSQL array.' },
  { label: 'json_agg',      sig: 'json_agg(${1:expression})',                         doc: 'Collect values as a JSON array.' },
  { label: 'jsonb_agg',     sig: 'jsonb_agg(${1:expression})',                        doc: 'Collect values as a JSONB array.' },
  { label: 'bool_and',      sig: 'bool_and(${1:expression})',                         doc: 'True only if all boolean values are true.' },
  { label: 'bool_or',       sig: 'bool_or(${1:expression})',                          doc: 'True if any boolean value is true.' },
  // Window
  { label: 'row_number',    sig: 'row_number()',                                      doc: 'Unique sequential integer for each row in its partition.' },
  { label: 'rank',          sig: 'rank()',                                             doc: 'Rank with gaps for ties: 1, 1, 3, ...' },
  { label: 'dense_rank',    sig: 'dense_rank()',                                      doc: 'Rank without gaps for ties: 1, 1, 2, ...' },
  { label: 'ntile',         sig: 'ntile(${1:buckets})',                               doc: 'Distribute rows into n buckets, returns bucket number 1–n.' },
  { label: 'lag',           sig: 'lag(${1:value}, ${2:1})',                           doc: 'Value from a previous row.' },
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
  { label: 'substr',        sig: 'substr(${1:string}, ${2:from}, ${3:count})',        doc: 'Extract substring starting at position from, up to count chars.' },
  { label: 'substring',     sig: 'substring(${1:string} from ${2:1} for ${3:n})',    doc: 'Extract part of a string.' },
  { label: 'left',          sig: 'left(${1:string}, ${2:n})',                         doc: 'First n characters of a string.' },
  { label: 'right',         sig: 'right(${1:string}, ${2:n})',                        doc: 'Last n characters of a string.' },
  { label: 'split_part',    sig: "split_part(${1:string}, ${2:'.'}, ${3:1})",        doc: 'Split by delimiter and return the nth part (1-based).' },
  { label: 'replace',       sig: "replace(${1:string}, ${2:'from'}, ${3:'to'})",     doc: 'Replace all occurrences of a substring.' },
  { label: 'regexp_replace',sig: "regexp_replace(${1:string}, ${2:'pattern'}, ${3:'replacement'})", doc: 'Replace matches of a POSIX regex.' },
  { label: 'concat',        sig: 'concat(${1:val1}, ${2:val2})',                      doc: 'Concatenate values, ignoring NULLs.' },
  { label: 'concat_ws',     sig: "concat_ws(${1:', '}, ${2:val1}, ${3:val2})",       doc: 'Concatenate with separator, skipping NULLs.' },
  { label: 'lpad',          sig: "lpad(${1:string}, ${2:length}, ${3:' '})",         doc: 'Left-pad string to length with fill character.' },
  { label: 'rpad',          sig: "rpad(${1:string}, ${2:length}, ${3:' '})",         doc: 'Right-pad string to length with fill character.' },
  { label: 'initcap',       sig: 'initcap(${1:string})',                              doc: 'Capitalize the first letter of each word.' },
  { label: 'md5',           sig: 'md5(${1:string})',                                  doc: 'MD5 hash of the string, returned as hex.' },
  { label: 'format',        sig: "format(${1:'%s'}, ${2:arg})",                       doc: 'Format a string with printf-style substitutions.' },
  // Numeric
  { label: 'abs',           sig: 'abs(${1:n})',                                       doc: 'Absolute value of n.' },
  { label: 'ceil',          sig: 'ceil(${1:n})',                                      doc: 'Round up to the nearest integer.' },
  { label: 'floor',         sig: 'floor(${1:n})',                                     doc: 'Round down to the nearest integer.' },
  { label: 'round',         sig: 'round(${1:n}, ${2:0})',                             doc: 'Round to d decimal places.' },
  { label: 'trunc',         sig: 'trunc(${1:n})',                                     doc: 'Truncate fractional part toward zero.' },
  { label: 'mod',           sig: 'mod(${1:dividend}, ${2:divisor})',                  doc: 'Remainder after integer division.' },
  { label: 'power',         sig: 'power(${1:base}, ${2:exponent})',                   doc: 'Base raised to the power of exponent.' },
  { label: 'sqrt',          sig: 'sqrt(${1:n})',                                      doc: 'Square root of n.' },
  { label: 'random',        sig: 'random()',                                          doc: 'Random float between 0.0 and 1.0.' },
  { label: 'greatest',      sig: 'greatest(${1:val1}, ${2:val2})',                    doc: 'Largest of the provided values, ignoring NULLs.' },
  { label: 'least',         sig: 'least(${1:val1}, ${2:val2})',                       doc: 'Smallest of the provided values, ignoring NULLs.' },
  // Date / time
  { label: 'now',           sig: 'now()',                                             doc: 'Current date and time with timezone.' },
  { label: 'current_date',  sig: 'current_date',                                     doc: 'Current date (no time component).' },
  { label: 'current_time',  sig: 'current_time',                                     doc: 'Current time with timezone.' },
  { label: 'date_trunc',    sig: "date_trunc(${1:'month'}, ${2:timestamp})",         doc: "Truncate to a time unit: 'year' 'month' 'week' 'day' 'hour' 'minute'." },
  { label: 'date_part',     sig: "date_part(${1:'month'}, ${2:timestamp})",          doc: "Extract a date/time field as a number." },
  { label: 'extract',       sig: 'extract(${1:year} FROM ${2:timestamp})',            doc: 'Extract a date/time field.' },
  { label: 'age',           sig: 'age(${1:timestamp})',                               doc: 'Interval elapsed from timestamp to now.' },
  { label: 'to_char',       sig: "to_char(${1:value}, ${2:'YYYY-MM-DD'})",           doc: 'Format a date or number as text.' },
  { label: 'to_timestamp',  sig: "to_timestamp(${1:string}, ${2:'YYYY-MM-DD'})",     doc: 'Parse a text string into a timestamptz.' },
  { label: 'to_date',       sig: "to_date(${1:string}, ${2:'YYYY-MM-DD'})",          doc: 'Parse a text string into a date.' },
  // JSON / JSONB
  { label: 'json_build_object',  sig: "json_build_object(${1:'key'}, ${2:value})",   doc: 'Build a JSON object from alternating key/value arguments.' },
  { label: 'jsonb_build_object', sig: "jsonb_build_object(${1:'key'}, ${2:value})",  doc: 'Build a JSONB object from alternating key/value arguments.' },
  { label: 'jsonb_set',     sig: "jsonb_set(${1:target}, ${2:'{key}'}::text[], ${3:new_value}::jsonb)", doc: 'Replace value at path in a JSONB document.' },
  { label: 'row_to_json',   sig: 'row_to_json(${1:row})',                             doc: 'Convert a table row to a JSON object.' },
  { label: 'to_jsonb',      sig: 'to_jsonb(${1:expression})',                         doc: 'Convert any SQL value to JSONB.' },
  // Null / conditional
  { label: 'coalesce',      sig: 'coalesce(${1:val1}, ${2:val2})',                    doc: 'Return the first non-NULL argument.' },
  { label: 'nullif',        sig: 'nullif(${1:val1}, ${2:val2})',                      doc: 'Return NULL if val1 = val2, otherwise return val1.' },
  // Array
  { label: 'array_length',  sig: 'array_length(${1:array}, ${2:1})',                 doc: 'Length of the nth array dimension (1 = outermost).' },
  { label: 'unnest',        sig: 'unnest(${1:array})',                                doc: 'Expand an array to a set of rows.' },
  { label: 'generate_series', sig: 'generate_series(${1:start}, ${2:stop})',         doc: 'Generate a series of values.' },
  // Type
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
  { label: 'ij',    body: 'INNER JOIN ${1:table} ${2:t} ON ${3:t}.${4:id} = ${5:other}.${6:id}',               detail: 'INNER JOIN … ON' },
  { label: 'lj',    body: 'LEFT JOIN ${1:table} ${2:t} ON ${3:t}.${4:id} = ${5:other}.${6:id}',                detail: 'LEFT JOIN … ON' },
  { label: 'ob',    body: 'ORDER BY ${1:column} ${2:DESC}',                                                     detail: 'ORDER BY' },
  { label: 'gb',    body: 'GROUP BY ${1:column}',                                                               detail: 'GROUP BY' },
  { label: 'wb',    body: 'WHERE ${1:column} = ${2:value}',                                                     detail: 'WHERE … =' },
]

// ── Context analysis ──────────────────────────────────────────────────────────

/**
 * Analyzes the SQL before the cursor to determine:
 * - What kind of identifier is expected (table / column / any)
 * - Which tables are already referenced in the query (for column prioritization)
 * - A map of alias → canonical table name (for dot-completion)
 *
 * @param {string} textBeforeCursor
 * @param {string[]} knownTables
 * @returns {{ kind: 'table'|'column'|'any', referencedTables: string[], aliasMap: Record<string,string> }}
 */
function analyzeQuery(textBeforeCursor, knownTables) {
  const cleaned = textBeforeCursor
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const tableSet = new Set(knownTables.map((t) => t.toLowerCase()))
  /** @type {Record<string, string>} */
  const aliasMap = {}

  // Pass 1 — FROM/JOIN tableName [AS] alias
  const joinRe = /\b(?:FROM|JOIN)\s+([\w"]+)(?:\s+(?:AS\s+)?([\w"]+))?/gi
  let m
  while ((m = joinRe.exec(cleaned)) !== null) {
    const tbl = m[1].replace(/"/g, '').toLowerCase()
    if (!tableSet.has(tbl)) continue
    aliasMap[tbl] = tbl
    const cand = (m[2] ?? '').replace(/"/g, '').toLowerCase()
    if (cand && !SQL_KW_SET.has(cand.toUpperCase())) {
      aliasMap[cand] = tbl
    }
  }

  // Pass 2 — comma-separated tables in FROM clause: FROM t1 a1, t2 a2
  const fromPart = cleaned.match(/\bFROM\s+(.*?)(?=\s*\b(?:WHERE|GROUP|ORDER|HAVING|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|JOIN|;|$))/i)
  if (fromPart) {
    const segment = fromPart[1].split(/\b(?:INNER|LEFT|RIGHT|FULL|CROSS|OUTER|LATERAL)?\s*JOIN\b/i)[0]
    for (const part of segment.split(',')) {
      const pm = part.trim().match(/^([\w"]+)(?:\s+(?:AS\s+)?([\w"]+))?/)
      if (!pm) continue
      const tbl = pm[1].replace(/"/g, '').toLowerCase()
      if (!tableSet.has(tbl)) continue
      aliasMap[tbl] = tbl
      const cand = (pm[2] ?? '').replace(/"/g, '').toLowerCase()
      if (cand && !SQL_KW_SET.has(cand.toUpperCase())) {
        aliasMap[cand] = tbl
      }
    }
  }

  const referencedTables = [...new Set(Object.values(aliasMap))]

  // Detect context kind from last clause keyword before cursor
  const upper = cleaned.toUpperCase()
  const tokens = upper.split(/[\s,;()\[\]]+/).filter(Boolean)
  let kind = /** @type {'table'|'column'|'any'} */ ('any')
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]
    if (TABLE_CONTEXT_KWS.has(t)) { kind = 'table'; break }
    if (COLUMN_CONTEXT_KWS.has(t)) { kind = 'column'; break }
  }

  return { kind, referencedTables, aliasMap }
}

// ── Identifier quoting ────────────────────────────────────────────────────────

/** @param {string} name */
function quoteIdent(name) {
  return /^[a-z_][a-z0-9_$]*$/i.test(name) ? name : `"${name.replace(/"/g, '""')}"`
}

/**
 * Sort key that places exact matches before prefix matches within the same tier.
 * @param {string} tier   - e.g. '0_', '1_'
 * @param {string} partial - current partial text (lowercase)
 * @param {string} name    - candidate name (any case)
 */
function sortKey(tier, partial, name) {
  const lower = name.toLowerCase()
  const score = partial && lower === partial ? '0' : '1'
  return `${tier}${score}_${lower}`
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
      const enumValues = hints.enumValues ?? {}
      const userFunctions = hints.userFunctions ?? []

      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(
        position.lineNumber, word.startColumn,
        position.lineNumber, word.endColumn,
      )

      const linePrefix = model.getValueInRange({
        startLineNumber: position.lineNumber, startColumn: 1,
        endLineNumber: position.lineNumber, endColumn: position.column,
      })

      const docBeforeCursor = model.getValueInRange({
        startLineNumber: 1, startColumn: 1,
        endLineNumber: position.lineNumber, endColumn: position.column,
      })

      const partial = word.word.toLowerCase()
      const { kind: ctx, referencedTables, aliasMap } = analyzeQuery(docBeforeCursor, tables)

      /** @type {import('monaco-editor').languages.CompletionItem[]} */
      const suggestions = []
      const Kind = monaco.languages.CompletionItemKind
      const InsertAsSnippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet

      // ── 1. Dot completion: schema.table or alias/table.column ──────────
      const dotMatch = linePrefix.match(/(?:["']([^"']+)["']|([\w$]+))\.["']?([\w$]*)$/)
      if (dotMatch) {
        const left = dotMatch[1] || dotMatch[2] || ''
        const leftLower = left.toLowerCase()

        // Schema dot → tables
        if (schemas.some((s) => s.toLowerCase() === leftLower)) {
          for (const table of tables) {
            if (partial && !table.toLowerCase().startsWith(partial)) continue
            suggestions.push({
              label: table,
              kind: Kind.Class,
              insertText: quoteIdent(table),
              range,
              detail: `table in ${left}`,
              sortText: sortKey('0_', partial, table),
            })
          }
          return { suggestions }
        }

        // Alias or table name dot → columns
        // Resolve alias first, then fall back to direct table name match
        const resolvedTable = aliasMap[leftLower] ?? leftLower
        const colKeys = [
          resolvedTable,
          `${activeSchema}.${resolvedTable}`,
          left,
          `${activeSchema}.${left}`,
        ]
        const cols = new Set()
        for (const key of colKeys) {
          for (const c of columnsByTable[key] ?? []) cols.add(c)
        }
        if (cols.size > 0) {
          for (const col of cols) {
            if (partial && !col.toLowerCase().startsWith(partial)) continue
            suggestions.push({
              label: col,
              kind: Kind.Field,
              insertText: quoteIdent(col),
              range,
              detail: `column · ${resolvedTable}`,
              sortText: sortKey('0_', partial, col),
            })
          }
          return { suggestions }
        }
      }

      // ── Priority tiers by context ──────────────────────────────────────
      // table  → tables=0  schemas=1  fns=7   kws=8   cols=9   snip=6
      // column → cols_ref=0 cols_all=1 fns=2  kws=3   tables=7 snip=6
      // any    → schemas=1  tables=2   cols=3  fns=4   kws=5   snip=0

      const tierTable  = ctx === 'table'  ? '0_' : ctx === 'column' ? '7_' : '2_'
      const tierSchema = ctx === 'table'  ? '1_' : ctx === 'column' ? '8_' : '1_'
      const tierColRef = ctx === 'column' ? '0_' : ctx === 'table'  ? '9_' : '3_' // cols from referenced tables
      const tierColAll = ctx === 'column' ? '1_' : ctx === 'table'  ? '9_' : '3_' // cols from other tables
      const tierFn     = ctx === 'column' ? '2_' : ctx === 'table'  ? '7_' : '4_'
      const tierKw     = ctx === 'table'  ? '8_' : ctx === 'column' ? '3_' : '5_'
      const tierSnip   = ctx === 'any'    ? '0_' : '6_'

      // ── 2. Schemas ─────────────────────────────────────────────────────
      for (const schema of schemas) {
        if (partial && !schema.toLowerCase().startsWith(partial)) continue
        suggestions.push({
          label: schema,
          kind: Kind.Module,
          insertText: `${quoteIdent(schema)}.`,
          range,
          detail: 'schema',
          sortText: sortKey(tierSchema, partial, schema),
        })
      }

      // ── 3. Tables ──────────────────────────────────────────────────────
      for (const table of tables) {
        if (partial && !table.toLowerCase().startsWith(partial)) continue
        suggestions.push({
          label: table,
          kind: Kind.Class,
          insertText: quoteIdent(table),
          range,
          detail: `table · ${activeSchema}`,
          sortText: sortKey(tierTable, partial, table),
        })
      }

      // ── 4. Columns — referenced tables first, then all ─────────────────
      const refTableSet = new Set(referencedTables)
      const seenCols = new Set()

      // First pass: columns from tables already in the query
      for (const refTable of referencedTables) {
        const colKeys = [refTable, `${activeSchema}.${refTable}`]
        for (const key of colKeys) {
          for (const col of columnsByTable[key] ?? []) {
            if (!col) continue
            const ck = `${refTable}.${col}`
            if (seenCols.has(ck)) continue
            seenCols.add(ck)
            if (partial && !col.toLowerCase().startsWith(partial)) continue
            suggestions.push({
              label: col,
              kind: Kind.Field,
              insertText: quoteIdent(col),
              range,
              detail: `column · ${refTable}`,
              sortText: sortKey(tierColRef, partial, col),
            })
          }
        }
      }

      // Second pass: columns from all other tables
      for (const [tbl, cols] of Object.entries(columnsByTable)) {
        const tblShort = tbl.includes('.') ? tbl.split('.').pop() ?? tbl : tbl
        if (refTableSet.has(tblShort)) continue
        for (const col of cols) {
          if (!col) continue
          const ck = `${tblShort}.${col}`
          if (seenCols.has(ck)) continue
          seenCols.add(ck)
          if (partial && !col.toLowerCase().startsWith(partial)) continue
          suggestions.push({
            label: col,
            kind: Kind.Field,
            insertText: quoteIdent(col),
            range,
            detail: `column · ${tblShort}`,
            sortText: sortKey(tierColAll, partial, col),
          })
        }
      }

      // ── 5. Functions ───────────────────────────────────────────────────
      // In table context, skip functions entirely (they don't belong after FROM)
      if (ctx !== 'table') {
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
            sortText: sortKey(tierFn, partial, fn.label),
          })
        }
        // ── 5b. User-defined functions / procedures / aggregates ──────
        for (const ufn of userFunctions) {
          if (partial && !ufn.name.toLowerCase().startsWith(partial)) continue
          suggestions.push({
            label: ufn.name,
            kind: ufn.kind === 'aggregate' ? Kind.Operator : Kind.Function,
            insertText: `${ufn.name}($0)`,
            insertTextRules: InsertAsSnippet,
            range,
            detail: `→ ${ufn.returnType}  [${ufn.kind}]`,
            documentation: { value: `\`\`\`sql\n${ufn.signature}\`\`\`` },
            sortText: sortKey(tierFn, partial, ufn.name),
          })
        }
      }

      // ── 5c. Enum values ────────────────────────────────────────────────
      // Show enum values in column/value context or when partial starts inside quotes
      if (ctx !== 'table') {
        for (const [enumName, values] of Object.entries(enumValues)) {
          for (const val of values) {
            if (partial && !val.toLowerCase().startsWith(partial)) continue
            suggestions.push({
              label: val,
              kind: Kind.Value,
              insertText: `'${val}'`,
              range,
              detail: `enum · ${enumName}`,
              sortText: sortKey('6_', partial, val),
            })
          }
        }
      }

      // ── 6. Keywords (context-filtered) ────────────────────────────────
      const kwSet = ctx === 'table' ? TABLE_CTX_KWS : ctx === 'column' ? COLUMN_CTX_KWS : null
      for (const kw of PG_KEYWORDS) {
        // In table or column context, only show contextually relevant keywords
        if (kwSet && !kwSet.has(kw)) continue
        if (partial && !kw.toLowerCase().startsWith(partial)) continue
        suggestions.push({
          label: kw,
          kind: Kind.Keyword,
          insertText: kw,
          range,
          detail: 'keyword',
          sortText: sortKey(tierKw, partial, kw),
        })
      }

      // ── 7. Snippets ────────────────────────────────────────────────────
      // Show snippets only in 'any' context (statement start) or when partial matches
      if (ctx === 'any' || partial) {
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
            sortText: sortKey(tierSnip, partial, snip.label),
          })
        }
      }

      return { suggestions }
    },
  })
}

registerMonacoSqlCompletion.done = false
