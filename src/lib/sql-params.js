/**
 * Named-parameter (`:name`) support for the SQL console.
 *
 * Parameters are located with a small scanner rather than a bare regex so that
 * quoted strings ('…', "…", `…`), dollar-quoted strings ($tag$…$tag$), line and
 * block comments, and Postgres `::type` casts never produce false positives.
 * Before execution the values are inlined as escaped SQL literals - the
 * substituted text is what runs and what lands in query history, so a run is
 * always reproducible.
 */

/** @typedef {'auto' | 'text' | 'raw' | 'null'} SqlParamMode */
/** @typedef {{ value: string, mode: SqlParamMode }} SqlParamValue */
/** @typedef {{ name: string, positions: Array<{ start: number, end: number }> }} SqlParam */

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*/

/**
 * All `:name` parameters in the SQL, in first-appearance order.
 * @param {string} sql
 * @returns {SqlParam[]}
 */
export function extractSqlParams(sql) {
  /** @type {Map<string, SqlParam>} */
  const found = new Map()
  const s = String(sql ?? '')
  const n = s.length
  let i = 0
  while (i < n) {
    const c = s[i]
    if (c === '-' && s[i + 1] === '-') {
      const nl = s.indexOf('\n', i)
      i = nl === -1 ? n : nl + 1
      continue
    }
    if (c === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2)
      i = end === -1 ? n : end + 2
      continue
    }
    if (c === "'") {
      i++
      while (i < n) {
        if (s[i] === "'") {
          if (s[i + 1] === "'") { i += 2; continue }
          i++
          break
        }
        i++
      }
      continue
    }
    if (c === '"' || c === '`') {
      const q = c
      i++
      while (i < n && s[i] !== q) i++
      i++
      continue
    }
    if (c === '$') {
      // Postgres dollar-quoted string: $tag$ … $tag$
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(s.slice(i))
      if (m) {
        const close = s.indexOf(m[0], i + m[0].length)
        i = close === -1 ? n : close + m[0].length
        continue
      }
    }
    if (c === ':') {
      // `::type` casts and `a:b` slice colons never start a parameter
      if (s[i + 1] === ':' || s[i - 1] === ':') {
        i += s[i + 1] === ':' ? 2 : 1
        continue
      }
      const m = NAME_RE.exec(s.slice(i + 1))
      if (m) {
        const name = m[0]
        const entry = found.get(name) ?? { name, positions: [] }
        entry.positions.push({ start: i, end: i + 1 + name.length })
        found.set(name, entry)
        i += 1 + name.length
        continue
      }
    }
    i++
  }
  return [...found.values()]
}

/**
 * Render one parameter value as a SQL literal.
 * - null  → NULL
 * - raw   → inserted verbatim (expressions, column refs - user's responsibility)
 * - auto  → numbers / TRUE / FALSE / NULL pass through, everything else quoted
 * - text  → always a quoted string
 * @param {string} raw @param {SqlParamMode} mode
 */
export function formatParamLiteral(raw, mode) {
  if (mode === 'null') return 'NULL'
  const v = String(raw ?? '')
  if (mode === 'raw') return v
  if (mode === 'auto') {
    const t = v.trim()
    if (/^(true|false)$/i.test(t)) return t.toUpperCase()
    if (/^null$/i.test(t)) return 'NULL'
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) return t
  }
  return "'" + v.replace(/'/g, "''") + "'"
}

/**
 * Parameters that still need a value before the SQL can run.
 * `text` (explicit empty string) and `null` are always satisfied.
 * @param {string} sql @param {Record<string, SqlParamValue>} values
 */
export function missingSqlParams(sql, values) {
  return extractSqlParams(sql).filter((p) => {
    const v = values[p.name]
    if (!v) return true
    if (v.mode === 'null' || v.mode === 'text') return false
    return v.value.trim() === ''
  })
}

/**
 * Inline every `:name` occurrence with its formatted literal. Parameters
 * without a value entry are left untouched.
 * @param {string} sql @param {Record<string, SqlParamValue>} values
 */
export function substituteSqlParams(sql, values) {
  const repls = extractSqlParams(sql)
    .filter((p) => values[p.name])
    .flatMap((p) => p.positions.map((pos) => ({ ...pos, name: p.name })))
    .sort((a, b) => b.start - a.start)
  let out = String(sql ?? '')
  for (const r of repls) {
    const v = values[r.name]
    out = out.slice(0, r.start) + formatParamLiteral(v.value, v.mode) + out.slice(r.end)
  }
  return out
}

// ── Last-used values (remembered across sessions, keyed by param name) ───────

const STORAGE_KEY = 'stroke:sql-param-values'

/** @returns {Record<string, SqlParamValue>} */
export function loadStoredParamValues() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const obj = raw ? JSON.parse(raw) : {}
    return obj && typeof obj === 'object' ? obj : {}
  } catch {
    return {}
  }
}

/** @param {Record<string, SqlParamValue>} values */
export function saveStoredParamValues(values) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values))
  } catch {
    // localStorage unavailable - values just won't persist
  }
}
