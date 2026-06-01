/**
 * @typedef {{ schema: string, table: string, tableKind: 'table'|'view'|'materialized_view'|'foreign_table', openedAt: number }} RecentTab
 */

const MAX = 10

/** @param {string} connectionId */
function storageKey(connectionId) {
  return `db-studio:recent-tabs:${connectionId}`
}

/**
 * @param {string} connectionId
 * @returns {RecentTab[]}
 */
export function loadRecentTabs(connectionId) {
  if (!connectionId) return []
  try {
    const raw = localStorage.getItem(storageKey(connectionId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * @param {string} connectionId
 * @param {Omit<RecentTab, 'openedAt'>} item
 */
export function pushRecentTab(connectionId, item) {
  if (!connectionId) return
  try {
    const existing = loadRecentTabs(connectionId)
    const deduped = existing.filter(
      (r) => !(r.schema === item.schema && r.table === item.table),
    )
    const updated = [{ ...item, openedAt: Date.now() }, ...deduped].slice(0, MAX)
    localStorage.setItem(storageKey(connectionId), JSON.stringify(updated))
  } catch {}
}

/**
 * @param {string} connectionId
 * @param {string} schema
 * @param {string} table
 */
export function removeRecentTab(connectionId, schema, table) {
  if (!connectionId) return
  try {
    const existing = loadRecentTabs(connectionId)
    const updated = existing.filter((r) => !(r.schema === schema && r.table === table))
    localStorage.setItem(storageKey(connectionId), JSON.stringify(updated))
  } catch {}
}

/**
 * @param {string} connectionId
 */
export function clearRecentTabs(connectionId) {
  if (!connectionId) return
  try {
    localStorage.removeItem(storageKey(connectionId))
  } catch {}
}
