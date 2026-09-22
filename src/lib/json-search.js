/**
 * Find text inside a parsed JSON value.
 *
 * The cell dock shows JSON as a tree, and a tree is the one shape you cannot
 * scan with your eyes: the thing you are looking for is behind a chevron three
 * levels down. So the search walks the whole value once, collects the paths that
 * match, and hands back the ancestors of those matches too - which is what lets
 * the tree open exactly the branches that lead somewhere and leave the rest
 * closed.
 *
 * One walk per query, not one per node. A node asking "does anything under me
 * match?" for itself would be O(n) each and O(n²) over the document.
 *
 * Paths are JSON Pointer-ish: `/items/0/name`. Segments are joined raw rather
 * than escaped, because these are compared against each other and never parsed
 * back apart - the only requirement is that two different nodes never produce
 * the same string, which holding the full ancestor chain guarantees.
 */

/** @typedef {{ paths: Set<string>, open: Set<string>, count: number, truncated: boolean }} JsonSearchResult */

/**
 * How many nodes a single search will look at.
 *
 * A cell can hold a multi-megabyte document, and the walk runs on every
 * keystroke. Past this the result says `truncated` and the caller can say so
 * rather than pretending the count is the whole answer.
 */
export const SEARCH_NODE_BUDGET = 200_000

/** The empty result, shared - a falsy query searches nothing. */
const EMPTY = { paths: new Set(), open: new Set(), count: 0, truncated: false }

/** Text of a primitive leaf, as the tree prints it (minus the quoting). */
function leafText(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'string') return v
  return String(v)
}

/**
 * Walk `value`, collecting the paths whose key or primitive value contains
 * `query` (case-insensitive), plus every ancestor of those paths.
 *
 * A container that matches on its own key counts as a match: searching `user`
 * should find the `user` object, not only the strings inside it.
 *
 * @param {unknown} value
 * @param {string} query
 * @param {{ budget?: number }} [opts]
 * @returns {JsonSearchResult}
 */
export function searchJson(value, query, { budget = SEARCH_NODE_BUDGET } = {}) {
  const q = (query ?? '').toLowerCase()
  if (!q) return EMPTY

  /** @type {Set<string>} */
  const paths = new Set()
  /** @type {Set<string>} */
  const open = new Set()
  let seen = 0
  let truncated = false

  /**
   * @param {unknown} node
   * @param {string} path
   * @param {string | null} key
   * @param {string[]} ancestors
   */
  function walk(node, path, key, ancestors) {
    if (seen >= budget) { truncated = true; return }
    seen++

    const keyHit = key !== null && key.toLowerCase().includes(q)
    const isArr = Array.isArray(node)
    const isObj = !isArr && node !== null && typeof node === 'object'
    const valueHit = !isArr && !isObj && leafText(node).toLowerCase().includes(q)

    if (keyHit || valueHit) {
      paths.add(path)
      // Every ancestor has to open for this row to be reachable.
      for (const a of ancestors) open.add(a)
    }

    if (isArr || isObj) {
      const next = [...ancestors, path]
      if (isArr) {
        const arr = /** @type {unknown[]} */ (node)
        for (let i = 0; i < arr.length; i++) {
          if (seen >= budget) { truncated = true; return }
          walk(arr[i], `${path}/${i}`, String(i), next)
        }
      } else {
        for (const k in /** @type {Record<string, unknown>} */ (node)) {
          if (seen >= budget) { truncated = true; return }
          walk(/** @type {Record<string, unknown>} */ (node)[k], `${path}/${k}`, k, next)
        }
      }
    }
  }

  walk(value, '', null, [])
  return { paths, open, count: paths.size, truncated }
}

/**
 * Split `text` into runs, marking the ones that match `query`, so a row can
 * highlight the hit rather than merely being the row that contains it.
 *
 * Returns a single unmarked run when there is nothing to mark, which is the
 * common case and costs one array.
 *
 * @param {string} text
 * @param {string} query
 * @returns {Array<{ t: string, hit: boolean }>}
 */
export function splitHighlight(text, query) {
  const s = String(text ?? '')
  const q = query ?? ''
  if (!q || !s) return [{ t: s, hit: false }]
  const hay = s.toLowerCase()
  const needle = q.toLowerCase()
  /** @type {Array<{ t: string, hit: boolean }>} */
  const out = []
  let i = 0
  for (;;) {
    const at = hay.indexOf(needle, i)
    if (at < 0) break
    if (at > i) out.push({ t: s.slice(i, at), hit: false })
    out.push({ t: s.slice(at, at + needle.length), hit: true })
    i = at + needle.length
  }
  if (!out.length) return [{ t: s, hit: false }]
  if (i < s.length) out.push({ t: s.slice(i), hit: false })
  return out
}

/**
 * Every offset of `query` in `text`, for stepping through matches in the raw
 * pane - a textarea cannot be highlighted, but it can be selected.
 * @param {string} text
 * @param {string} query
 * @returns {number[]}
 */
export function matchOffsets(text, query) {
  const s = String(text ?? '')
  const q = query ?? ''
  if (!q || !s) return []
  const hay = s.toLowerCase()
  const needle = q.toLowerCase()
  /** @type {number[]} */
  const out = []
  let i = 0
  for (;;) {
    const at = hay.indexOf(needle, i)
    if (at < 0) break
    out.push(at)
    i = at + needle.length
  }
  return out
}
