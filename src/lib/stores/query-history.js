import { getStudioDb, STORES } from '$lib/stores/studio-db.js'

const HISTORY_STORE = STORES.queryHistory
const SAVED_STORE = STORES.savedQueries
const MAX_HISTORY_PER_CONNECTION = 100

/**
 * @typedef {{
 *   id: string
 *   connectionId: string
 *   sql: string
 *   title: string
 *   executedAt: number
 *   queryMs?: number
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
    ...meta,
  })
  await db.put(HISTORY_STORE, entry)

  const merged = [entry, ...existing].sort((a, b) => b.executedAt - a.executedAt)
  if (merged.length > MAX_HISTORY_PER_CONNECTION) {
    await Promise.all(
      merged.slice(MAX_HISTORY_PER_CONNECTION).map((stale) => db.delete(HISTORY_STORE, stale.id)),
    )
  }
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
