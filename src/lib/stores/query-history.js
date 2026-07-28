import { getStudioDb, STORES } from '$lib/stores/studio-db.js'
import { loadSettings, DEFAULT_MAX_QUERY_HISTORY } from '$lib/stores/settings.js'

const HISTORY_STORE = STORES.queryHistory
const SAVED_STORE = STORES.savedQueries

/** How many history entries to keep per connection - configurable in Settings → Database. */
function maxHistoryPerConnection() {
  const n = loadSettings().maxQueryHistory
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_QUERY_HISTORY
}

/**
 * @typedef {{
 *   id: string
 *   connectionId: string
 *   sql: string
 *   title: string
 *   executedAt: number
 *   queryMs?: number
 *   runCount?: number
 *   favorite?: boolean
 * }} QueryHistoryEntry
 */

/**
 * @typedef {{
 *   id: string
 *   connectionId: string
 *   name: string
 *   sql: string
 *   createdAt: number
 *   updatedAt: number
 * }} SavedQuery
 */

/** @param {string} sql */
export function queryTitle(sql) {
  const line =
    sql
      .split('\n')
      .find((l) => l.trim() && !l.trim().startsWith('--')) ?? sql
  const t = line.trim().replace(/\s+/g, ' ')
  return t.slice(0, 80) + (t.length > 80 ? '…' : '')
}

/**
 * @param {string} connectionId
 * @param {string} sql
 * @param {{ queryMs?: number }} [meta]
 */
export async function recordQueryExecution(connectionId, sql, meta = {}) {
  const trimmed = sql.trim()
  if (!connectionId || !trimmed) return

  const db = await getStudioDb()
  const existing = await db.getAllFromIndex(HISTORY_STORE, 'connectionId', connectionId)
  const latest = existing.sort((a, b) => b.executedAt - a.executedAt)[0]

  if (latest?.sql === trimmed) {
    await db.put(HISTORY_STORE, {
      ...latest,
      executedAt: Date.now(),
      title: queryTitle(trimmed),
      runCount: (latest.runCount ?? 1) + 1,
      ...meta,
    })
    return
  }

  const entry = /** @type {QueryHistoryEntry} */ ({
    id: crypto.randomUUID(),
    connectionId,
    sql: trimmed,
    title: queryTitle(trimmed),
    executedAt: Date.now(),
    runCount: 1,
    ...meta,
  })
  await db.put(HISTORY_STORE, entry)

  // Cap the ring buffer - but favorites are pinned and never evicted.
  const merged = [entry, ...existing].sort((a, b) => b.executedAt - a.executedAt)
  const evictable = merged.filter((e) => !e.favorite)
  const cap = maxHistoryPerConnection()
  if (evictable.length > cap) {
    await Promise.all(
      evictable.slice(cap).map((stale) => db.delete(HISTORY_STORE, stale.id)),
    )
  }
}

/** @param {string} id @param {boolean} favorite */
export async function setQueryHistoryFavorite(id, favorite) {
  const db = await getStudioDb()
  const entry = await db.get(HISTORY_STORE, id)
  if (entry) await db.put(HISTORY_STORE, { ...entry, favorite })
}

/** @param {string} connectionId @returns {Promise<QueryHistoryEntry[]>} */
export async function listQueryHistory(connectionId) {
  if (!connectionId) return []
  const db = await getStudioDb()
  const all = await db.getAllFromIndex(HISTORY_STORE, 'connectionId', connectionId)
  return all.sort((a, b) => b.executedAt - a.executedAt)
}

/** @param {string} id */
export async function deleteQueryHistoryEntry(id) {
  const db = await getStudioDb()
  await db.delete(HISTORY_STORE, id)
}

/** @param {string} connectionId */
export async function clearQueryHistory(connectionId) {
  if (!connectionId) return
  const db = await getStudioDb()
  const all = await db.getAllFromIndex(HISTORY_STORE, 'connectionId', connectionId)
  await Promise.all(all.map((e) => db.delete(HISTORY_STORE, e.id)))
}

/**
 * @param {string} connectionId
 * @param {string} name
 * @param {string} sql
 * @returns {Promise<SavedQuery>}
 */
export async function createSavedQuery(connectionId, name, sql) {
  const trimmed = sql.trim()
  if (!connectionId || !trimmed) throw new Error('Connection and SQL are required')

  const now = Date.now()
  const saved = /** @type {SavedQuery} */ ({
    id: crypto.randomUUID(),
    connectionId,
    name: name.trim() || queryTitle(trimmed),
    sql: trimmed,
    createdAt: now,
    updatedAt: now,
  })
  const db = await getStudioDb()
  await db.put(SAVED_STORE, saved)
  return saved
}

/** @param {string} connectionId @returns {Promise<SavedQuery[]>} */
export async function listSavedQueries(connectionId) {
  if (!connectionId) return []
  const db = await getStudioDb()
  const all = await db.getAllFromIndex(SAVED_STORE, 'connectionId', connectionId)
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** @param {string} id */
export async function deleteSavedQuery(id) {
  const db = await getStudioDb()
  await db.delete(SAVED_STORE, id)
}
