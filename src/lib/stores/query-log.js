// Query log — every SQL statement the app runs (table browse, row count, SQL
// console, AI, ORM), captured centrally in api.js with the exact SQL the backend
// executed + its duration. Rendered in the bottom query-log console.

/**
 * @typedef {{
 *   id: string
 *   sql: string
 *   durationMs?: number
 *   schema?: string
 *   table?: string
 *   source?: string
 *   success: boolean
 *   error?: string
 *   timestamp: number
 * }} QueryLogEntry
 */

const MAX_ENTRIES = 300

/** @type {QueryLogEntry[]} */
let _log = []
/** @type {((entries: QueryLogEntry[]) => void)[]} */
let _listeners = []
let _rafId = 0

function scheduleNotify() {
  if (_rafId) return
  _rafId = requestAnimationFrame(() => {
    _rafId = 0
    const snapshot = _log.slice()
    for (const fn of _listeners) fn(snapshot)
  })
}

/**
 * Record one executed query. No-ops on empty SQL so internal probes don't spam.
 * @param {Omit<QueryLogEntry, 'id' | 'timestamp'>} entry
 */
export function recordQuery(entry) {
  const sql = (entry.sql ?? '').trim()
  if (!sql) return
  const full = /** @type {QueryLogEntry} */ ({
    id: (crypto.randomUUID?.() ?? String(Math.random())),
    timestamp: Date.now(),
    ...entry,
    sql,
  })
  _log.unshift(full)
  if (_log.length > MAX_ENTRIES) _log.length = MAX_ENTRIES
  scheduleNotify()
}

export function clearQueryLog() {
  _log = []
  scheduleNotify()
}

/**
 * @param {(entries: QueryLogEntry[]) => void} fn
 * @returns {() => void} unsubscribe
 */
export function subscribeQueryLog(fn) {
  _listeners = [..._listeners, fn]
  fn(_log.slice())
  return () => { _listeners = _listeners.filter((l) => l !== fn) }
}
