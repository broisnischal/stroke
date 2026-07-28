/**
 * Virtual column expression evaluator.
 *
 * Expression syntax:
 *   String template : {col_name}  →  plain substitution, fast path
 *   Full expression : UPPER({col}), {price} + {tax}, IF({a} > 0, "yes", "no"), …
 *
 * Built-in functions available in expressions:
 *   UPPER, LOWER, TRIM, LEN/LENGTH, CONCAT, SUBSTR
 *   ROUND, ABS, FLOOR, CEIL, MAX, MIN
 *   COALESCE, IF, NULL, TRUE, FALSE
 */

// ── Built-in function scope ────────────────────────────────────────────────────
const BUILTINS = {
  COALESCE: (...a) => { for (const v of a) if (v !== null && v !== undefined && v !== '') return v; return '' },
  IF:       (c, t, f) => (c ? (t ?? '') : (f ?? '')),
  UPPER:    (s) => String(s ?? '').toUpperCase(),
  LOWER:    (s) => String(s ?? '').toLowerCase(),
  TRIM:     (s) => String(s ?? '').trim(),
  LEN:      (s) => String(s ?? '').length,
  LENGTH:   (s) => String(s ?? '').length,
  CONCAT:   (...a) => a.map(v => v ?? '').join(''),
  SUBSTR:   (s, start, len) => { const str = String(s ?? ''); return len != null ? str.substr(start, len) : str.substr(start) },
  ROUND:    (n, d = 0) => { const x = Number(n); return isNaN(x) ? n : Number(x.toFixed(d)) },
  ABS:      (n) => Math.abs(Number(n)),
  FLOOR:    (n) => Math.floor(Number(n)),
  CEIL:     (n) => Math.ceil(Number(n)),
  MAX:      (...a) => Math.max(...a.map(Number)),
  MIN:      (...a) => Math.min(...a.map(Number)),
  NULL:     null,
  TRUE:     true,
  FALSE:    false,
}
const BUILTIN_NAMES = Object.keys(BUILTINS)
const BUILTIN_VALS  = Object.values(BUILTINS)

// ── Detection ─────────────────────────────────────────────────────────────────
/**
 * Returns true when the expression contains function calls, arithmetic, or
 * comparisons - i.e. it needs the Function evaluator rather than the fast
 * string-concatenation path.
 * @param {string} expr
 */
function needsEval(expr) {
  return (
    /[A-Z_]{2,}\s*\(/.test(expr) ||               // function call: UPPER(
    /\{[^}]+\}\s*[+\-*\/<>=!]/.test(expr) ||      // {col} OP …
    /[+\-*\/<>=!]\s*\{/.test(expr) ||             // … OP {col}
    /[+\-*\/]\s*\d/.test(expr) ||                 // … OP literal number
    /\d\s*[+\-*\/]/.test(expr)                    // literal OP …
  )
}

// ── Simple template fast path ─────────────────────────────────────────────────
const COL_RE = /\{([^}]+)\}/g

/** @param {string} expr @param {Map<string,number>} nameToIdx @returns {(row:unknown[])=>string} */
function bindSimple(expr, nameToIdx) {
  const segments = []
  const indices  = []
  let last = 0, m
  COL_RE.lastIndex = 0
  while ((m = COL_RE.exec(expr)) !== null) {
    segments.push(expr.slice(last, m.index))
    indices.push(nameToIdx.get(m[1].trim()) ?? -1)
    last = m.index + m[0].length
  }
  segments.push(expr.slice(last))
  const n = indices.length
  if (n === 0) { const s = segments[0]; return () => s }
  return function evalSimple(row) {
    let s = segments[0]
    for (let i = 0; i < n; i++) {
      const v = indices[i] >= 0 ? row[indices[i]] : ''
      s += v === null || v === undefined ? '' : String(v)
      s += segments[i + 1]
    }
    return s
  }
}

// ── Full expression evaluator ─────────────────────────────────────────────────
/** @param {string} expr @param {Map<string,number>} nameToIdx @returns {(row:unknown[])=>string} */
function bindComplex(expr, nameToIdx) {
  const colToVar  = new Map()
  const varNames  = []
  const varIndices = []

  COL_RE.lastIndex = 0
  const transformed = expr.replace(COL_RE, (_, col) => {
    col = col.trim()
    if (colToVar.has(col)) return colToVar.get(col)
    const vname = `_v${varNames.length}`
    varNames.push(vname)
    varIndices.push(nameToIdx.get(col) ?? -1)
    colToVar.set(col, vname)
    return vname
  })

  let evalFn
  try {
    evalFn = new Function(
      ...BUILTIN_NAMES, ...varNames,
      `"use strict"; try { const _r = (${transformed}); return _r === null || _r === undefined ? '' : String(_r); } catch(_e) { return ''; }`
    )
  } catch {
    return () => '⚠ syntax error'
  }

  return function evalExpr(row) {
    const colVals = varIndices.map(i => i >= 0 ? (row[i] ?? null) : null)
    try { return evalFn(...BUILTIN_VALS, ...colVals) } catch { return '' }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Compile + bind an expression to resolved column indices.
 * Returns a fast (row: unknown[]) => string evaluator.
 * Safe to call in a canvas draw loop - the expensive compilation happens once.
 * @param {string} expr
 * @param {Map<string,number>} nameToIdx
 * @returns {(row:unknown[])=>string}
 */
export function bindExpr(expr, nameToIdx) {
  if (!expr) return () => ''
  return needsEval(expr) ? bindComplex(expr, nameToIdx) : bindSimple(expr, nameToIdx)
}

/**
 * Return all column names referenced in an expression.
 * @param {string} expr @returns {string[]}
 */
export function templateRefs(expr) {
  const refs = []
  let m
  COL_RE.lastIndex = 0
  while ((m = COL_RE.exec(String(expr))) !== null) refs.push(m[1].trim())
  return refs
}

/** @param {unknown} s */
export function looksLikeUrl(s) {
  if (typeof s !== 'string' || s.length < 8) return false
  return s.startsWith('http://') || s.startsWith('https://')
}

// Keep for backward compat with DataTable imports
export function compileTemplate(expr) {
  const segments = [], refs = []
  let last = 0, m
  COL_RE.lastIndex = 0
  while ((m = COL_RE.exec(String(expr))) !== null) {
    segments.push(expr.slice(last, m.index))
    refs.push(m[1].trim())
    last = m.index + m[0].length
  }
  segments.push(expr.slice(last))
  return { segments, refs }
}
export function bindTemplate(compiled, nameToIdx) {
  let expr = compiled.segments[0]
  for (let i = 0; i < compiled.refs.length; i++) expr += `{${compiled.refs[i]}}` + compiled.segments[i + 1]
  return bindExpr(expr, nameToIdx)
}

/**
 * Function snippets shown in the panel UI.
 * insert: text to splice in. cursor: offset from insert-start where caret lands (-1 = before last char).
 */
export const FN_SNIPPETS = [
  // String
  { group: 'String', label: 'UPPER',   insert: 'UPPER()',                cursor: 6  },
  { group: 'String', label: 'LOWER',   insert: 'LOWER()',                cursor: 6  },
  { group: 'String', label: 'TRIM',    insert: 'TRIM()',                 cursor: 5  },
  { group: 'String', label: 'LEN',     insert: 'LEN()',                  cursor: 4  },
  { group: 'String', label: 'SUBSTR',  insert: 'SUBSTR(, 0, 10)',        cursor: 7  },
  { group: 'String', label: 'CONCAT',  insert: 'CONCAT(, )',             cursor: 7  },
  // Math
  { group: 'Math',   label: '+',       insert: ' + ',                    cursor: null },
  { group: 'Math',   label: '-',       insert: ' - ',                    cursor: null },
  { group: 'Math',   label: '*',       insert: ' * ',                    cursor: null },
  { group: 'Math',   label: '/',       insert: ' / ',                    cursor: null },
  { group: 'Math',   label: 'ROUND',   insert: 'ROUND(, 2)',             cursor: 6  },
  { group: 'Math',   label: 'ABS',     insert: 'ABS()',                  cursor: 4  },
  // Logic
  { group: 'Logic',  label: 'COALESCE',insert: 'COALESCE(, "")',         cursor: 9  },
  { group: 'Logic',  label: 'IF',      insert: 'IF(cond, "yes", "no")',  cursor: 3  },
  { group: 'Logic',  label: 'NULL',    insert: 'null',                   cursor: null },
]
