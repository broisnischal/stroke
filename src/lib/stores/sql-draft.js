/**
 * Per-connection SQL editor draft.
 *
 * Persists the Query Editor buffer so closing and reopening the tab — or
 * restarting the app — restores the last query text for that connection instead
 * of resetting to the default. Keyed by connection id, with defensive try/catch
 * so a quota/serialization failure never throws into the editor flow.
 */

const KEY = 'stroke:sql-drafts'

/** @returns {Record<string, string>} */
function loadAll() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * The saved draft for a connection, or null when there's nothing meaningful to
 * restore (missing or whitespace-only).
 * @param {string | null | undefined} connId
 * @returns {string | null}
 */
export function loadSqlDraft(connId) {
  const all = loadAll()
  const v = all[connId || '_default']
  return typeof v === 'string' && v.trim() ? v : null
}

/**
 * Persist (or clear, when blank) the draft for a connection.
 * @param {string | null | undefined} connId
 * @param {string} text
 */
export function saveSqlDraft(connId, text) {
  try {
    const all = loadAll()
    const key = connId || '_default'
    if (text && text.trim()) all[key] = text
    else delete all[key]
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // Quota/serialization failure must not throw into the editor flow.
  }
}
