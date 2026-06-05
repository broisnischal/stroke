const STORAGE_KEY = 'stroke:connections'
const LAST_ID_KEY  = 'stroke:last-connection-id'

/**
 * @typedef {'postgres' | 'sqlite' | 'd1'} DbType
 *
 * @typedef {{
 *   id: string
 *   type: DbType
 *   name: string
 *   lastConnectedAt?: number
 *   host?: string
 *   port?: number
 *   database?: string
 *   user?: string
 *   password?: string
 *   ssl?: boolean
 *   filePath?: string
 *   accountId?: string
 *   databaseId?: string
 *   apiToken?: string
 * }} SavedConnection
 */

export function newConnectionId() {
  return crypto.randomUUID()
}

/** @returns {SavedConnection[]} */
export function loadSavedConnections() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((c) => ({
      ...c,
      id:   c.id   ?? newConnectionId(),
      type: c.type ?? 'postgres',
      port: c.port != null ? Number(c.port) : 5432,
    }))
  } catch {
    return []
  }
}

/** @param {SavedConnection[]} connections */
export function saveConnections(connections) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connections))
}

/** @param {SavedConnection} conn */
export function upsertConnection(conn) {
  const list = loadSavedConnections()
  const idx  = list.findIndex((c) => c.id === conn.id)
  if (idx >= 0) list[idx] = conn
  else list.push(conn)
  saveConnections(list)
  return list
}

/** @param {string} id */
export function removeConnection(id) {
  const list = loadSavedConnections().filter((c) => c.id !== id)
  saveConnections(list)
  return list
}

// ── Last-connection helpers ───────────────────────────────────────────────────

/** @returns {string | null} */
export function getLastConnectionId() {
  try { return localStorage.getItem(LAST_ID_KEY) } catch { return null }
}

/** @param {string | null} id */
export function setLastConnectionId(id) {
  try {
    if (id) localStorage.setItem(LAST_ID_KEY, id)
    else    localStorage.removeItem(LAST_ID_KEY)
  } catch {}
}

/** Returns the last-used connection if it still exists in the saved list. */
export function getLastConnection() {
  const id = getLastConnectionId()
  if (!id) return null
  return loadSavedConnections().find((c) => c.id === id) ?? null
}
