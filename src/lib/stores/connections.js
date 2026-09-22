import { saveSqlDraft } from '$lib/stores/sql-draft.js'

const STORAGE_KEY = 'stroke:connections'
const LAST_ID_KEY  = 'stroke:last-connection-id'
const DISCONNECTED_KEY = 'stroke:disconnected'

/**
 * @typedef {'postgres' | 'sqlite' | 'd1' | 'mysql' | 'mariadb' | 'cockroachdb' | 'libsql' | 'clickhouse' | 'duckdb' | 'mssql' | 'redis'} DbType
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
 *   db?: number
 *   tls?: boolean
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
 *   oauth?: boolean
 *   ssh?: SshConfig
 *   readOnly?: boolean
 *   environment?: 'prod' | 'staging' | 'dev' | null
 *   provider?: 'neon' | 'supabase' | 'planetscale' | 'prisma'
 *   group?: string | null
 *   origin?: 'studio' | 'docker'  - discovered locally rather than typed in
 *   tool?: 'prisma' | 'drizzle'
 *   toolLabel?: string
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
    return parsed.map((c) => {
      // Guard per element so one corrupt/null entry is dropped, not the whole
      // list (a throw here would fall through to the catch and wipe everything).
      if (!c || typeof c !== 'object') return null
      const type = c.type ?? 'postgres'
      const conn = {
        ...c,
        id:   c.id   ?? newConnectionId(),
        type,
        // Only Postgres-family connections get 5432 as a fallback; for other
        // engines the per-engine normalizers in api.js fill the right default
        // (3306/6379/8123/1433) when port is left undefined.
        port: c.port != null ? Number(c.port) : (engineFamily(type) === 'postgres' ? 5432 : undefined),
      }
      // Redis connections can carry stale Postgres-ish fields from an earlier
      // edit/clone (a `provider` and a non-numeric `db` like "postgres"), which
      // made the status bar show `db postgres` and open a Postgres db switcher.
      // Normalize once on load so the UI and backend agree on a numeric logical DB.
      if (engineFamily(type) === 'redis') {
        conn.db = Number(conn.db) || 0
        delete conn.provider
      }
      return conn
    }).filter((c) => c != null)
  } catch (err) {
    // The stored value exists but did not parse. Returning [] is safe by itself,
    // but the very next upsert would write that empty list straight back over a
    // payload that was merely unreadable, not gone. Move it aside first so it
    // stays recoverable by hand, and let the app carry on from a clean slate.
    console.error('Saved connections were unreadable:', err)
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) localStorage.setItem(`${STORAGE_KEY}:unreadable`, raw)
    } catch {}
    return []
  }
}

/**
 * @param {SavedConnection[]} connections
 * @returns {boolean} false when the write was rejected (quota exhausted), so the
 * caller can tell the user rather than let them believe the save landed.
 */
export function saveConnections(connections) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(connections))
    return true
  } catch (err) {
    // Quota/serialization failure must not throw into connect/disconnect flows.
    console.error('Failed to persist connections:', err)
    return false
  }
}

/**
 * True when the last `saveConnections` call was rejected. Read it straight after
 * an upsert: a silently dropped write is indistinguishable from a successful one
 * until the app restarts and the connection is gone.
 */
let _persistFailed = false
export function lastPersistFailed() {
  return _persistFailed
}

/** @param {SavedConnection} conn */
export function upsertConnection(conn) {
  const list = loadSavedConnections()
  const idx  = list.findIndex((c) => c.id === conn.id)
  if (idx >= 0) list[idx] = conn
  else list.push(conn)
  _persistFailed = !saveConnections(list)
  return list
}

/** @param {string} id */
export function removeConnection(id) {
  const list = loadSavedConnections().filter((c) => c.id !== id)
  saveConnections(list)
  purgeConnectionData(id)
  return list
}

/**
 * Remove every per-connection artifact a deleted connection leaves behind.
 * Without this, its recents/charts/dashboards/diagrams and per-table prefs
 * accumulate in localStorage forever (eventually exhausting the quota, which
 * makes unrelated persists start failing), and IndexedDB keeps its query
 * history, saved queries, conversations and schema snapshots.
 * @param {string} id
 */
export function purgeConnectionData(id) {
  if (!id) return
  try {
    for (const key of [
      `stroke:recent-tabs:${id}`,
      `stroke:saved-charts:${id}`,
      `stroke:chart-groups:${id}`,
      `stroke:dashboards:${id}`,
      `stroke:active-dashboard:${id}`,
      `stroke:saved-diagrams:${id}`,
      `stroke:last-schema:${id}`,
    ]) localStorage.removeItem(key)
    // Per-table keys carry a `:<schema>.<table>` suffix - match by prefix,
    // iterating backwards because removeItem reindexes localStorage.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith(`stroke:hidden-cols:${id}:`) || key?.startsWith(`stroke:table-views:${id}:`)) {
        localStorage.removeItem(key)
      }
    }
  } catch { /* storage failure must not block deleting the connection */ }
  try { saveSqlDraft(id, '') } catch { /* ditto */ }
  // IndexedDB rows are cleared fire-and-forget (dynamic imports keep this module
  // free of a static cycle via schema-snapshots -> api -> connections). A
  // failure only leaves orphaned rows behind, never an error in the delete flow.
  void (async () => {
    try {
      const { clearQueryHistory, listSavedQueries, deleteSavedQuery } = await import('$lib/stores/query-history.js')
      await clearQueryHistory(id)
      await Promise.all((await listSavedQueries(id)).map((q) => deleteSavedQuery(q.id)))
    } catch { /* ignore */ }
    try {
      const { clearConversations } = await import('$lib/stores/conversations.js')
      await clearConversations(id)
      await clearConversations(id, 'sidebar')
    } catch { /* ignore */ }
    try {
      const { listSnapshots, deleteSnapshot } = await import('$lib/stores/schema-snapshots.js')
      await Promise.all((await listSnapshots(id)).map((s) => deleteSnapshot(s.id)))
    } catch { /* ignore */ }
  })()
}

/**
 * Assigns (or clears) the free-text group/folder a saved connection belongs to.
 * Pass `null`/empty to move it back to Ungrouped. Absent `group` = ungrouped, so
 * connections saved before groups existed need no migration. Returns the full
 * updated list (like `removeConnection`) so callers can refresh their view.
 * @param {string} id
 * @param {string | null} group
 * @returns {SavedConnection[]}
 */
export function setConnectionGroup(id, group) {
  const g = group && String(group).trim() ? String(group).trim() : null
  const list = loadSavedConnections()
  const idx  = list.findIndex((c) => c.id === id)
  if (idx >= 0) {
    if (g) {
      list[idx] = { ...list[idx], group: g }
    } else {
      const { group: _drop, ...rest } = list[idx]
      list[idx] = rest
    }
    saveConnections(list)
  }
  return list
}

/**
 * What a connection actually dials, as one comparable string. Name is not part
 * of it: "prod" and "prod copy" pointing at the same database on the same
 * server as the same user are the case worth catching, and two rows on one
 * database under different logins are genuinely different connections.
 *
 * @param {any} conn
 * @returns {string} '' when there is not enough of a target to compare
 */
export function connectionTargetKey(conn) {
  if (!conn) return ''
  const type = String(conn.type ?? '').toLowerCase()
  const norm = (v) => String(v ?? '').trim()
  if (type === 'sqlite' || type === 'duckdb') {
    const path = norm(conn.filePath)
    // Two `:memory:` databases are two databases - nothing is shared between them.
    return path && path !== ':memory:' ? `${type}|${path}` : ''
  }
  if (type === 'libsql') {
    const url = norm(conn.url).toLowerCase()
    return url ? `libsql|${url}` : ''
  }
  if (type === 'd1') {
    const db = norm(conn.databaseId)
    return db ? `d1|${norm(conn.accountId)}|${db}` : ''
  }
  const host = norm(conn.host).toLowerCase()
  if (!host) return ''
  return [type, host, norm(conn.port), norm(conn.database), norm(conn.user)].join('|')
}

/**
 * The saved connection `conn` would duplicate, or null. `skipId` is the row
 * being edited - a connection is never a duplicate of itself.
 * @param {any} conn
 * @param {any[]} list
 * @param {string | null} [skipId]
 */
export function findDuplicateConnection(conn, list, skipId = null) {
  const key = connectionTargetKey(conn)
  if (!key) return null
  return list.find((c) => c.id !== skipId && connectionTargetKey(c) === key) ?? null
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

/**
 * Did the last session end with a deliberate Disconnect?
 *
 * The last-connection id outlives a disconnect on purpose - the modal still
 * highlights where you were, and reconnecting is one click. But auto-reconnect
 * read that id as "resume this", so quitting while disconnected came back
 * connected on the next launch, which is the one thing Disconnect was asked to
 * prevent. This flag is what tells the two apart.
 * @returns {boolean}
 */
export function wasDisconnected() {
  try { return localStorage.getItem(DISCONNECTED_KEY) === '1' } catch { return false }
}

/** @param {boolean} v */
export function setWasDisconnected(v) {
  try {
    if (v) localStorage.setItem(DISCONNECTED_KEY, '1')
    else   localStorage.removeItem(DISCONNECTED_KEY)
  } catch {}
}

/**
 * Last active schema per connection, so reconnecting lands where the user
 * left off instead of resetting to `public`.
 * @param {string} connectionId
 * @returns {string | null}
 */
export function getLastSchema(connectionId) {
  if (!connectionId) return null
  try { return localStorage.getItem(`stroke:last-schema:${connectionId}`) } catch { return null }
}

/**
 * @param {string} connectionId
 * @param {string} schema
 */
export function setLastSchema(connectionId, schema) {
  if (!connectionId || !schema) return
  try { localStorage.setItem(`stroke:last-schema:${connectionId}`, schema) } catch {}
}

/** Returns the last-used connection if it still exists in the saved list. */
export function getLastConnection() {
  const id = getLastConnectionId()
  if (!id) return null
  return loadSavedConnections().find((c) => c.id === id) ?? null
}
