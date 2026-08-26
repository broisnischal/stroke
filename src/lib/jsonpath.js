/**
 * JSONPath evaluator and rich completion engine.
 *
 * Supported syntax:
 *   $           root
 *   .key        child property
 *   [n]         array index (negative supported)
 *   [*]         all array items
 *   [0:3]       slice (start:end, step optional)
 *   ["key"]     quoted property (handles keys with spaces/dots)
 *   ..key       recursive descent
 *   [?(@.k)]    filter - truthy check
 *   [?(@.k op v)] filter - ==, !=, >, >=, <, <=
 */

// ── Helpers ─────────────────────────────────────────────────────────────────

/** @param {unknown} v @returns {'object'|'array'|'string'|'number'|'boolean'|'null'|'undefined'} */
function typeOf(v) {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (Array.isArray(v)) return 'array'
  return /** @type {any} */ (typeof v)
}

/** Short human-readable type label with array-item type info */
function typeLabel(v) {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (Array.isArray(v)) {
    if (v.length === 0) return 'array'
    const t = typeOf(v[0])
    const allSame = v.every(x => typeOf(x) === t)
    return allSame ? `${t}[]` : 'array'
  }
  if (typeof v === 'object') {
    const n = Object.keys(v).length
    return `object`  // brief
  }
  return typeof v
}

/** Very short value preview for the suggestion detail column */
function valuePreview(v) {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') {
    const s = v.replace(/\s+/g, ' ')
    return s.length > 28 ? `"${s.slice(0, 28)}…"` : `"${s}"`
  }
  if (Array.isArray(v)) return `[${v.length} item${v.length !== 1 ? 's' : ''}]`
  if (typeof v === 'object') {
    const n = Object.keys(v).length
    return `{${n} key${n !== 1 ? 's' : ''}}`
  }
  return ''
}

/**
 * What one key looks like across the elements of an array. `sample` is the first
 * non-null value, so a null first row cannot decide the type; `distinct` goes
 * null once the key holds objects, which are not worth hashing on a keystroke.
 * @typedef {{
 *   sample: unknown,
 *   types: Set<string>,
 *   distinct: Set<string> | null,
 *   capped: boolean,
 *   count: number,
 *   scanned: number,
 *   total: number,
 * }} KeyStats
 */

/** How many array elements a key's type and spread are measured over. Bounded
 *  because completion runs on every keystroke, and a JSON column can hold tens
 *  of thousands of rows. */
const KEY_SCAN_LIMIT = 200
/** Distinct values tracked per key before it just reports "many". */
const DISTINCT_LIMIT = 64

/**
 * Measure every key across the elements of an array, for the completion list.
 * @param {unknown[]} node
 * @returns {Map<string, KeyStats>}
 */
function scanArrayKeys(node) {
  /** @type {Map<string, KeyStats>} */
  const stats = new Map()
  const scanned = Math.min(node.length, KEY_SCAN_LIMIT)
  for (let i = 0; i < scanned; i++) {
    const item = node[i]
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    for (const [k, v] of Object.entries(/** @type {object} */ (item))) {
      let st = stats.get(k)
      if (!st) {
        st = { sample: v, types: new Set(), distinct: new Set(), capped: false, count: 0, scanned, total: node.length }
        stats.set(k, st)
      }
      st.count++
      st.types.add(typeOf(v))
      if ((st.sample === null || st.sample === undefined) && v !== null && v !== undefined) st.sample = v
      if (st.distinct) {
        // Objects and arrays are not worth hashing on a keystroke, so a key
        // holding them stops reporting distinctness rather than guessing at it.
        if (v !== null && typeof v === 'object') st.distinct = null
        else if (st.distinct.size >= DISTINCT_LIMIT) st.capped = true
        else st.distinct.add(`${typeOf(v)}:${String(v)}`)
      }
    }
  }
  return stats
}

/** `string`, or `string | null` when the key is not one type across the scan.
 *  @param {KeyStats} st */
function spreadTypeLabel(st) {
  const types = [...st.types].filter((t) => t !== 'undefined')
  return types.length > 1 ? types.sort().join(' | ') : typeLabel(st.sample)
}

/**
 * What the rest of the elements do with this key, in three words or so. It is
 * the honest answer to "why does this preview never change": either the value
 * really is the same in every element, or it is one of many and the sample was
 * only ever a sample.
 * @param {KeyStats} st
 */
function spreadNote(st) {
  if (st.count <= 1) return ''
  const scope = st.scanned < st.total ? `first ${st.scanned.toLocaleString()}` : `all ${st.count.toLocaleString()}`
  if (!st.distinct) return `${st.count.toLocaleString()} values`
  if (st.distinct.size === 1 && !st.capped) return `same in ${scope}`
  return `${st.distinct.size.toLocaleString()}${st.capped ? '+' : ''} distinct`
}

/** @param {unknown} node @param {string} key @returns {unknown[]} */
function collectRecursive(node, key) {
  /** @type {unknown[]} */
  const results = []
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

/** Evaluate a simple filter comparison */
function matchesFilter(item, expr) {
  // Truthy check: @.key or @["key"]
  const truthyMatch = expr.match(/^@\.([a-zA-Z_$][a-zA-Z0-9_$]*)$/) ||
                      expr.match(/^@\["([^"]+)"\]$/)
  if (truthyMatch) {
    const key = truthyMatch[1]
    return !!(item && typeof item === 'object' && /** @type {any} */ (item)[key])
  }

  // Comparison: @.key op value
  const cmpMatch = expr.match(/^@\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(==|!=|>=|<=|>|<)\s*(.+)$/)
  if (!cmpMatch) return false

  const [, key, op, rawVal] = cmpMatch
  if (!item || typeof item !== 'object') return false
  const actual = /** @type {any} */ (item)[key]

  // Parse the expected value
  let expected
  const trimmed = rawVal.trim()
  if (trimmed === 'null') expected = null
  else if (trimmed === 'true') expected = true
  else if (trimmed === 'false') expected = false
  else if (/^".*"$/.test(trimmed)) expected = trimmed.slice(1, -1)
  else if (/^'.*'$/.test(trimmed)) expected = trimmed.slice(1, -1)
  else if (!isNaN(Number(trimmed))) expected = Number(trimmed)
  else expected = trimmed

  switch (op) {
    case '==': return actual == expected  // eslint-disable-line eqeqeq
    case '!=': return actual != expected  // eslint-disable-line eqeqeq
    case '>':  return actual > expected
    case '>=': return actual >= expected
    case '<':  return actual < expected
    case '<=': return actual <= expected
    default:   return false
  }
}

// ── Evaluator ─────────────────────────────────────────────────────────────────

/**
 * Evaluate a JSONPath expression.
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
    // When true, `cur` is an array whose elements are being projected over, so
    // a following accessor (index/slice/filter) maps across items rather than
    // operating on the projection array itself.
    let projected = false

    while (rest.length > 0) {
      // ── Recursive descent: ..key ────────────────────────────────────────
      if (rest.startsWith('..')) {
        const m = rest.match(/^\.\.([a-zA-Z_$][a-zA-Z0-9_$]*)/)
        if (!m) return { ok: false, error: 'Expected property name after ".."' }
        cur = collectRecursive(cur, m[1])
        rest = rest.slice(m[0].length)
        continue
      }

      // ── Dot accessor: .key ───────────────────────────────────────────────
      if (rest.startsWith('.')) {
        rest = rest.slice(1)
        const m = rest.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/)
        if (!m) return { ok: false, error: 'Expected property name after "."' }
        const key = m[1]
        rest = rest.slice(key.length)
        cur = Array.isArray(cur)
          ? cur.map(x => x && typeof x === 'object' ? /** @type {any} */ (x)[key] : undefined)
          : cur && typeof cur === 'object' ? /** @type {any} */ (cur)[key] : undefined
        continue
      }

      // ── Bracket accessor ─────────────────────────────────────────────────
      if (rest.startsWith('[')) {
        // Find the closing `]`, but if the content starts with a quote scan to
        // the matching closing quote first so keys containing `]` aren't split.
        let end
        const q = rest[1]
        if (q === '"' || q === "'") {
          let i = 2
          while (i < rest.length && rest[i] !== q) i++
          if (i >= rest.length) return { ok: false, error: 'Unclosed quote in bracket' }
          end = rest.indexOf(']', i + 1)
        } else {
          end = rest.indexOf(']')
        }
        if (end === -1) return { ok: false, error: 'Unclosed [' }
        const inner = rest.slice(1, end).trim()
        rest = rest.slice(end + 1)

        // [*] - all items: mark projection so following accessors map over items
        if (inner === '*') {
          if (!Array.isArray(cur)) return { ok: false, error: '[*] requires an array' }
          projected = true
          continue
        }

        // [n] - numeric index
        if (/^-?\d+$/.test(inner)) {
          const idx = parseInt(inner)
          const at = (/** @type {unknown} */ a) => {
            if (!Array.isArray(a)) return undefined
            return idx < 0 ? a[a.length + idx] : a[idx]
          }
          if (projected) {
            if (!Array.isArray(cur)) return { ok: false, error: `[${inner}] requires an array` }
            cur = cur.map(at)
            projected = false
            continue
          }
          if (!Array.isArray(cur)) return { ok: false, error: `[${inner}] requires an array` }
          cur = at(cur)
          continue
        }

        // [start:end] or [start:end:step] - slice
        if (/^-?\d*:-?\d*(:-?\d*)?$/.test(inner)) {
          if (!Array.isArray(cur)) return { ok: false, error: 'Slice requires an array' }
          const parts = inner.split(':')
          /** @param {unknown[]} a */
          const slice = (a) => {
            const len = a.length
            const s = parts[0] === '' ? 0 : parseInt(parts[0])
            const e = parts[1] === '' ? len : parseInt(parts[1])
            const step = parts[2] === undefined || parts[2] === '' ? 1 : parseInt(parts[2])
            const start = s < 0 ? Math.max(0, len + s) : Math.min(len, s)
            const end2  = e < 0 ? Math.max(0, len + e) : Math.min(len, e)
            const result = []
            for (let i = start; step > 0 ? i < end2 : i > end2; i += step) result.push(a[i])
            return result
          }
          if (projected) {
            // Map the slice over each projected item and flatten; stays projected.
            const out = []
            for (const item of cur) if (Array.isArray(item)) out.push(...slice(item))
            cur = out
            continue
          }
          cur = slice(cur)
          continue
        }

        // ["key"] or ['key'] - quoted property
        const quotedMatch = inner.match(/^["'](.+)["']$/)
        if (quotedMatch) {
          const key = quotedMatch[1]
          cur = Array.isArray(cur)
            ? cur.map(x => x && typeof x === 'object' ? /** @type {any} */ (x)[key] : undefined)
            : cur && typeof cur === 'object' ? /** @type {any} */ (cur)[key] : undefined
          continue
        }

        // [?(expr)] - filter
        const filterMatch = inner.match(/^\?\((.+)\)$/)
        if (filterMatch) {
          if (!Array.isArray(cur)) return { ok: false, error: 'Filter [?(...)] requires an array' }
          const expr = filterMatch[1].trim()
          if (projected) {
            // Filter within each projected item's array and flatten; stays projected.
            const out = []
            for (const item of cur) {
              if (Array.isArray(item)) out.push(...item.filter(x => matchesFilter(x, expr)))
            }
            cur = out
            continue
          }
          cur = cur.filter(item => matchesFilter(item, expr))
          continue
        }

        return { ok: false, error: `Unsupported bracket expression: [${inner}]` }
      }

      return { ok: false, error: `Unexpected character: ${rest[0]}` }
    }

    return { ok: true, value: cur }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// ── Completion engine ─────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   insert: string,
 *   label: string,
 *   kind: 'object'|'array'|'string'|'number'|'boolean'|'null'|'wildcard'|'index'|'filter'|'slice',
 *   detail: string,
 *   preview: string,
 *   spread?: string,
 * }} CompletionItem
 */

/**
 * Split a typed path into the part that is settled and the fragment still being
 * typed. Exported so the completion widget can bold the characters you actually
 * typed inside each suggestion - matching without showing the match is what made
 * the old list read as unrelated noise.
 * @param {string} path @returns {{ prefix: string, token: string }}
 */
export function splitPath(path) {
  if (!path || path === '$') return { prefix: '$', token: '' }
  for (let i = path.length - 1; i >= 1; i--) {
    const ch = path[i]
    const prev = path[i - 1]
    const prevOk = prev === '$' || prev === ']' || /[a-zA-Z0-9_$]/.test(prev)
    if (ch === '.' && prevOk) return { prefix: path.slice(0, i), token: path.slice(i) }
    if (ch === '[' && prevOk) {
      const closing = path.indexOf(']', i)
      if (closing === -1) return { prefix: path.slice(0, i), token: path.slice(i) }
    }
  }
  return { prefix: '$', token: path.startsWith('$') ? path.slice(1) : path }
}

/**
 * Return rich completion items for the VSCode-style autocomplete widget.
 * @param {unknown} parsedJson
 * @param {string} typedPath
 * @returns {CompletionItem[]}
 */
export function getCompletionItems(parsedJson, typedPath) {
  if (!parsedJson) return []

  const { prefix, token } = splitPath(typedPath)
  const result = evalJsonPath(parsedJson, prefix || '$')
  if (!result.ok) return []

  const node = result.value
  /** @type {CompletionItem[]} */
  const items = []

  if (Array.isArray(node)) {
    // [*] wildcard
    items.push({
      insert: '[*]',
      label: '[*]',
      kind: 'wildcard',
      detail: `all · ${node.length} item${node.length !== 1 ? 's' : ''}`,
      preview: '',
    })

    // numeric indices
    const maxIdx = Math.min(node.length, 8)
    for (let i = 0; i < maxIdx; i++) {
      items.push({
        insert: `[${i}]`,
        label: `[${i}]`,
        kind: 'index',
        detail: typeLabel(node[i]),
        preview: valuePreview(node[i]),
      })
    }

    // [:n] slice shorthand
    if (node.length > 1) {
      items.push({
        insert: `[0:${Math.min(node.length, 5)}]`,
        label: `[0:${Math.min(node.length, 5)}]`,
        kind: 'slice',
        detail: 'slice',
        preview: `first ${Math.min(node.length, 5)} items`,
      })
    }

    // Property keys from array items. A key under an array prefix describes
    // EVERY element, so reading element 0 alone was wrong twice over: it
    // mislabelled the type whenever the first row happened to be null, and its
    // preview never moved, which reads as "this value is the same for all of
    // them" without ever having checked. Scan a bounded window instead and say
    // what is actually true of the key across it.
    const keyMap = scanArrayKeys(node)
    for (const [k, st] of keyMap) {
      const kind = typeOf(st.sample)
      items.push({
        insert: `.${k}`,
        label: k,
        kind: kind === 'undefined' ? 'null' : /** @type {any} */ (kind),
        detail: spreadTypeLabel(st),
        spread: spreadNote(st),
        preview: valuePreview(st.sample),
      })
    }

    // filter template
    if (keyMap.size > 0) {
      const firstKey = /** @type {string} */ (keyMap.keys().next().value)
      items.push({
        insert: `[?(@.${firstKey})]`,
        label: `[?(@.${firstKey})]`,
        kind: 'filter',
        detail: 'filter',
        preview: 'truthy check',
      })
    }
  } else if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(/** @type {object} */ (node))) {
      items.push({
        insert: `.${k}`,
        label: k,
        kind: typeOf(v) === 'undefined' ? 'null' : /** @type {any} */ (typeOf(v)),
        detail: typeLabel(v),
        preview: valuePreview(v),
      })
    }
  }

  // Filter by typed token
  if (!token) return items

  const t = token.toLowerCase()
  return items.filter(item => {
    if (token.startsWith('[')) return item.insert.startsWith('[') && item.insert.toLowerCase().includes(t)
    if (token.startsWith('.')) return item.insert.startsWith('.') && item.label.toLowerCase().startsWith(t.slice(1))
    return item.label.toLowerCase().startsWith(t) || item.insert.toLowerCase().startsWith(t)
  })
}

/** @param {unknown} parsedJson @param {string} typedPath @returns {string[]} */
export function getCompletions(parsedJson, typedPath) {
  return getCompletionItems(parsedJson, typedPath).map(i => i.insert)
}

/** @param {string} typedPath @param {string} completion @returns {string} */
export function applyCompletion(typedPath, completion) {
  const { prefix } = splitPath(typedPath)
  return (prefix === '$' ? '$' : prefix) + completion
}

/** @param {unknown} value @returns {string} */
export function describeResult(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'item' : 'items'}`
  if (typeof value === 'object') return `${Object.keys(/** @type {object} */ (value)).length} keys`
  if (typeof value === 'string') return `"${value.slice(0, 40)}${value.length > 40 ? '…' : ''}"`
  return String(value)
}
