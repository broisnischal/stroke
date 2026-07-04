/**
 * In-memory cache of staged (unsaved) table changes, keyed by table key
 * (`"schema.table"`). DataTable unmounts when you switch to a non-table tab
 * (SQL/AI) or another table, which would otherwise drop its staged edits and
 * deletes. This module-level cache outlives the component so the changes are
 * restored when you return to the table.
 *
 * Row-index based: only valid while the underlying row set is unchanged. Callers
 * clear the entry whenever rows are refetched/reordered (page, filter, sort).
 *
 * @typedef {{ rowIdx: number, colIdx: number, value: unknown, original: unknown }} StagedEdit
 * @typedef {{ edits: Map<string, StagedEdit>, deletes: Set<number> }} StagedChanges
 */

/** @type {Map<string, StagedChanges>} */
const cache = new Map()

/**
 * @param {string} key
 * @param {Map<string, StagedEdit>} edits
 * @param {Set<number>} deletes
 */
export function savePendingChanges(key, edits, deletes) {
  if (!key) return
  const hasEdits = (edits?.size ?? 0) > 0
  const hasDeletes = (deletes?.size ?? 0) > 0
  if (!hasEdits && !hasDeletes) {
    cache.delete(key)
    return
  }
  cache.set(key, { edits: new Map(edits), deletes: new Set(deletes) })
}

/**
 * @param {string} key
 * @returns {StagedChanges} A fresh copy (empty when nothing cached).
 */
export function loadPendingChanges(key) {
  const v = key ? cache.get(key) : null
  return { edits: new Map(v?.edits ?? []), deletes: new Set(v?.deletes ?? []) }
}

/** @param {string} key */
export function clearPendingChanges(key) {
  if (key) cache.delete(key)
}

/** @param {string} key @returns {number} Count of staged changes for the key. */
export function pendingChangesCount(key) {
  const v = key ? cache.get(key) : null
  return (v?.edits.size ?? 0) + (v?.deletes.size ?? 0)
}

/** @returns {boolean} True if any table has cached staged changes. */
export function anyPendingChanges() {
  return cache.size > 0
}
