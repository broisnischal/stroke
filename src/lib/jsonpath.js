/**
 * Lightweight JSONPath evaluator and completion engine.
 * Supported syntax: $ . [n] [*] ..key — no filter expressions.
 */

/**
 * @param {unknown} node
 * @param {string} key
 * @returns {unknown[]}
 */
function collectRecursive(node, key) {
  /** @type {unknown[]} */
  const results = []
  /** @param {unknown} v */
  function walk(v) {
    if (!v || typeof v !== 'object') return
    if (Array.isArray(v)) {
      for (const item of v) walk(item)
    } else {
      const obj = /** @type {Record<string, unknown>} */ (v)
      if (key in obj) results.push(obj[key])
      for (const val of Object.values(obj)) walk(val)
    }
  }
  walk(node)
  return results
}

/**
 * Evaluate a JSONPath expression against a parsed value.
 * @param {unknown} root
 * @param {string} path
 * @returns {{ ok: true, value: unknown } | { ok: false, error: string }}
 */
export function evalJsonPath(root, path) {
  const trimmed = path.trim()
  if (!trimmed || trimmed === '$') return { ok: true, value: root }
  try {
    let rest = trimmed.startsWith('$') ? trimmed.slice(1) : trimmed
    /** @type {unknown} */
    let cur = root
    while (rest.length > 0) {
      if (rest.startsWith('..')) {
        const m = rest.match(/^\.\.([^.[]+)/)
        if (!m) return { ok: false, error: 'Invalid recursive descent' }
        cur = collectRecursive(cur, m[1])
        rest = rest.slice(m[0].length)
      } else if (rest.startsWith('.')) {
        rest = rest.slice(1)
        const m = rest.match(/^([^.[]+)/)
        if (!m) return { ok: false, error: 'Expected property name after "."' }
        const key = m[1]
        rest = rest.slice(key.length)
        cur = Array.isArray(cur)
          ? cur.map((x) => (x && typeof x === 'object' ? /** @type {any} */ (x)[key] : undefined))
          : cur && typeof cur === 'object' ? /** @type {any} */ (cur)[key] : undefined
      } else if (rest.startsWith('[')) {
        const end = rest.indexOf(']')
        if (end === -1) return { ok: false, error: 'Unclosed [' }
        const inner = rest.slice(1, end)
        rest = rest.slice(end + 1)
        if (inner === '*') {
          if (!Array.isArray(cur)) return { ok: false, error: '[*] requires an array' }
        } else if (/^-?\d+$/.test(inner)) {
          if (!Array.isArray(cur)) return { ok: false, error: `[${inner}] requires an array` }
          const idx = parseInt(inner)
          cur = idx < 0 ? cur[cur.length + idx] : cur[idx]
        } else {
          return { ok: false, error: `Unsupported: [${inner}]` }
        }
      } else {
        return { ok: false, error: `Unexpected: ${rest[0]}` }
      }
    }
    return { ok: true, value: cur }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/**
 * Split path at the last incomplete segment to get (prefix, activeToken).
 * @param {string} path
 * @returns {{ prefix: string, token: string }}
 */
function splitPath(path) {
  if (!path || path === '$') return { prefix: '$', token: '' }

  // Walk backwards to find the last segment boundary
  for (let i = path.length - 1; i >= 1; i--) {
    const ch = path[i]
    const prev = path[i - 1]
    const prevOk = prev === '$' || prev === ']' || /[a-zA-Z0-9_]/.test(prev)

    if (ch === '.' && prevOk) {
      return { prefix: path.slice(0, i), token: path.slice(i) }
    }
    if (ch === '[' && prevOk) {
      // Only treat as active token if bracket is unclosed
      const closing = path.indexOf(']', i)
      if (closing === -1) return { prefix: path.slice(0, i), token: path.slice(i) }
      // Closed bracket — keep looking backwards
    }
  }

  // No split found; everything after $ is the active token
  return { prefix: '$', token: path.startsWith('$') ? path.slice(1) : path }
}

/**
 * Return candidate completions (as full replacement suffixes, e.g. ".name", "[0]")
 * for the current typing position.
 * @param {unknown} parsedJson
 * @param {string} typedPath
 * @returns {string[]}
 */
export function getCompletions(parsedJson, typedPath) {
  if (!parsedJson) return []

  const { prefix, token } = splitPath(typedPath)
  const result = evalJsonPath(parsedJson, prefix || '$')
  if (!result.ok) return []

  const node = result.value
  /** @type {string[]} */
  const candidates = []

  if (Array.isArray(node)) {
    candidates.push('[*]')
    for (let i = 0; i < Math.min(node.length, 10); i++) candidates.push(`[${i}]`)
    // Union of keys from array items
    const keys = /** @type {Set<string>} */ (new Set())
    for (const item of node) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        for (const k of Object.keys(/** @type {object} */ (item))) keys.add(k)
      }
    }
    for (const k of keys) candidates.push(`.${k}`)
  } else if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const k of Object.keys(/** @type {object} */ (node))) candidates.push(`.${k}`)
  }

  if (!token) return candidates

  const t = token.toLowerCase()
  return candidates.filter((c) => {
    if (token.startsWith('[')) return c.startsWith('[') && c.toLowerCase().startsWith(t)
    if (token.startsWith('.')) return c.startsWith('.') && c.slice(1).toLowerCase().startsWith(t.slice(1))
    return c.slice(1).toLowerCase().startsWith(t)
  })
}

/**
 * Apply a selected completion to the current path.
 * @param {string} typedPath
 * @param {string} completion e.g. ".name" or "[0]"
 * @returns {string}
 */
export function applyCompletion(typedPath, completion) {
  const { prefix } = splitPath(typedPath)
  return (prefix === '$' ? '$' : prefix) + completion
}

/**
 * Describe the result value for display in the path bar.
 * @param {unknown} value
 * @returns {string}
 */
export function describeResult(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `${value.length} items`
  if (typeof value === 'object') return `${Object.keys(/** @type {object} */ (value)).length} keys`
  return typeof value
}
