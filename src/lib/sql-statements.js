/**
 * Lightweight SQL statement splitter used by the SQL editor for
 * statement-at-cursor actions (select / run) and the active-statement gutter.
 *
 * Understands enough SQL lexing to not split inside:
 *  - single/double-quoted strings and backtick identifiers ('' and \' escapes)
 *  - line comments (`-- …`) and block comments
 *  - Postgres dollar-quoted bodies ($$ … $$, $tag$ … $tag$)
 *
 * @typedef {{ text: string, start: number, end: number }} SqlStatement
 *   `start`/`end` are character offsets into the source text; `end` is
 *   exclusive and includes the terminating semicolon when present.
 */

/**
 * @param {string} text
 * @returns {SqlStatement[]}
 */
export function splitSqlStatements(text) {
  /** @type {SqlStatement[]} */
  const out = []
  const n = text.length
  let i = 0
  let start = 0

  /** @param {number} end exclusive boundary (just past the `;` or EOF) */
  function flush(end) {
    let s = start
    let e = end
    while (s < e && /\s/.test(text[s])) s++
    while (e > s && /\s/.test(text[e - 1])) e--
    if (e > s) {
      const t = text.slice(s, e)
      // Skip fragments that are only comments/semicolons
      const meaningful = t.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').replace(/;/g, '').trim()
      if (meaningful) out.push({ text: t, start: s, end: e })
    }
    start = end
  }

  while (i < n) {
    const ch = text[i]
    const next = text[i + 1]
    if (ch === '-' && next === '-') {
      const nl = text.indexOf('\n', i + 2)
      i = nl === -1 ? n : nl + 1
    } else if (ch === '/' && next === '*') {
      const close = text.indexOf('*/', i + 2)
      i = close === -1 ? n : close + 2
    } else if (ch === "'" || ch === '"' || ch === '`') {
      i++
      while (i < n) {
        if (ch === "'" && text[i] === '\\') { i += 2; continue }
        if (text[i] === ch) {
          // '' inside a single-quoted string is an escaped quote, not the end
          if (ch === "'" && text[i + 1] === "'") { i += 2; continue }
          i++
          break
        }
        i++
      }
    } else if (ch === '$') {
      const m = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(text.slice(i))
      if (m) {
        const tag = m[0]
        const close = text.indexOf(tag, i + tag.length)
        i = close === -1 ? n : close + tag.length
      } else {
        i++
      }
    } else if (ch === ';') {
      i++
      flush(i)
    } else {
      i++
    }
  }
  flush(n)
  return out
}

/**
 * Find the statement the cursor is in. When the cursor sits between two
 * statements (blank line after a `;`), prefer the previous statement; before
 * the first statement, return the first.
 *
 * @param {SqlStatement[]} statements
 * @param {number} offset
 * @returns {SqlStatement | null}
 */
export function statementAtOffset(statements, offset) {
  if (statements.length === 0) return null
  let prev = null
  for (const s of statements) {
    if (offset >= s.start && offset <= s.end) return s
    if (s.end < offset) prev = s
    else if (s.start > offset) return prev ?? s
  }
  return prev
}
