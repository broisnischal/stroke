const STORAGE_KEY = 'stroke:connections'
const LAST_ID_KEY  = 'stroke:last-connection-id'

/**
 * @typedef {'postgres' | 'sqlite' | 'd1' | 'mysql' | 'mariadb' | 'cockroachdb' | 'libsql' | 'clickhouse' | 'duckdb' | 'mssql'} DbType
 *
 * @typedef {{ host: string, port?: number, username: string, privateKeyPath?: string }} SshConfig
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
 *   secure?: boolean
 *   encrypt?: boolean
 *   trustCert?: boolean
 *   filePath?: string
 *   accountId?: string
 *   databaseId?: string
 *   apiToken?: string
 *   ssh?: SshConfig
 *   readOnly?: boolean
 *   environment?: 'prod' | 'staging' | 'dev' | null
 * }} SavedConnection
 */

export function newConnectionId() {
  return crypto.randomUUID()
}

/**
 * Maps a saved connection `type` to the underlying engine family that drives
 * capability flags and dialect-specific behavior. Wire-compatible aliases
 * (MariaDB → MySQL, CockroachDB → PostgreSQL) collapse to their base so every
 * `dbType === 'mysql'` / `'postgres'` check keeps working unchanged.
 * @param {string | undefined | null} type
 * @returns {DbType}
 */
export function engineFamily(type) {
  if (type === 'mariadb') return 'mysql'
  if (type === 'cockroachdb') return 'postgres'
  return /** @type {DbType} */ (type ?? 'postgres')
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(connections))
  } catch (err) {
    // Quota/serialization failure must not throw into connect/disconnect flows.
    console.error('Failed to persist connections:', err)
  }
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
