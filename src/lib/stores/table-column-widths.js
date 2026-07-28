const STORAGE_KEY = 'stroke:column-widths'

/** @type {Record<string, Record<string, number>> | null} */
let _cache = null

/** @returns {Record<string, Record<string, number>>} */
function loadAll() {
  if (_cache) return _cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) { _cache = {}; return _cache }
    const parsed = JSON.parse(raw)
    _cache = (parsed && typeof parsed === 'object') ? parsed : {}
    return _cache
  } catch {
    _cache = {}
    return _cache
  }
}

/** @param {Record<string, Record<string, number>>} all */
function saveAll(all) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    /* quota/private-mode - column widths are non-critical, drop silently */
  }
}

/** @param {string} tableKey @returns {Record<string, number>} */
export function loadColumnWidths(tableKey) {
  if (!tableKey) return {}
  const all = loadAll()
  const widths = all[tableKey]
  if (!widths || typeof widths !== 'object') return {}
  /** @type {Record<string, number>} */
  const out = {}
  for (const [name, w] of Object.entries(widths)) {
    const n = Number(w)
    if (Number.isFinite(n) && n > 0) out[name] = n
  }
  return out
}

/** @param {string} tableKey @param {Record<string, number>} widths */
export function saveColumnWidths(tableKey, widths) {
  if (!tableKey) return
  const all = loadAll()
  all[tableKey] = { ...widths }
  saveAll(all)
}
