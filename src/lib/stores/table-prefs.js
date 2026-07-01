// Persisted per-table / UI preferences backed by localStorage.
//
// Extracted from StudioShell.svelte so persisted state lives under stores/* (per
// the project convention) instead of being inlined in the main component. All
// reads/writes are defensively guarded so a disabled/full localStorage never
// throws into the UI.

const AI_MODE_KEY = 'stroke:ai-mode'
const QUERY_HISTORY_OPEN_KEY = 'stroke:query-history-open'
const INFINITE_SCROLL_KEY = 'stroke:infiniteScroll'

// ── AI mode (full-screen chat) ────────────────────────────────────────────────

export function loadAiMode() {
  try { return localStorage.getItem(AI_MODE_KEY) === '1' } catch { return false }
}

/** @param {boolean} v */
export function saveAiMode(v) {
  try { localStorage.setItem(AI_MODE_KEY, v ? '1' : '0') } catch { /* ignore */ }
}

// ── Hidden columns (per connection + schema + table) ──────────────────────────

/** @param {string} connId @param {string} schema @param {string} table */
export function hiddenColsKey(connId, schema, table) {
  return `stroke:hidden-cols:${connId}:${schema}.${table}`
}

/** @param {string} connId @param {string} schema @param {string} table @returns {Set<string>} */
export function loadHiddenCols(connId, schema, table) {
  try {
    const v = localStorage.getItem(hiddenColsKey(connId, schema, table))
    if (v) return new Set(JSON.parse(v))
  } catch { /* ignore */ }
  return new Set()
}

/** @param {string} connId @param {string} schema @param {string} table @param {Set<string>} cols */
export function saveHiddenCols(connId, schema, table, cols) {
  try {
    localStorage.setItem(hiddenColsKey(connId, schema, table), JSON.stringify([...cols]))
  } catch { /* ignore */ }
}

// ── Query-history panel visibility ────────────────────────────────────────────

export function loadQueryHistoryPref() {
  try { return localStorage.getItem(QUERY_HISTORY_OPEN_KEY) === '1' } catch { return false }
}

/** @param {boolean} v */
export function saveQueryHistoryPref(v) {
  try { localStorage.setItem(QUERY_HISTORY_OPEN_KEY, v ? '1' : '0') } catch { /* ignore */ }
}

// ── Infinite scroll toggle ────────────────────────────────────────────────────

export function loadInfiniteScroll() {
  try { return localStorage.getItem(INFINITE_SCROLL_KEY) === '1' } catch { return false }
}

/** @param {boolean} v */
export function saveInfiniteScroll(v) {
  try { localStorage.setItem(INFINITE_SCROLL_KEY, v ? '1' : '0') } catch { /* ignore */ }
}
