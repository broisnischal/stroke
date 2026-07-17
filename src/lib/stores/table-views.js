// Saved table views — a named combination of search + filters + sort + hidden
// columns + data view mode, persisted per connection + schema + table
// (localStorage, same keying scheme as hidden columns in table-prefs.js).

/**
 * @typedef {object} SavedTableView
 * @property {string} id
 * @property {string} name
 * @property {string} search
 * @property {import('$lib/table-query.js').TableFilter[]} filters
 * @property {import('$lib/table-query.js').TableSort | null} sort
 * @property {import('$lib/table-query.js').TableSort[]} sortMore
 * @property {string[]} hiddenColumns
 * @property {'table' | 'json' | 'record' | 'text'} dataViewMode
 * @property {import('$lib/search-options.js').SearchOptions} [searchOptions]
 */

/** @param {string} connId @param {string} schema @param {string} table */
export function tableViewsKey(connId, schema, table) {
  return `stroke:table-views:${connId}:${schema}.${table}`
}

/** @param {string} connId @param {string} schema @param {string} table @returns {SavedTableView[]} */
export function loadTableViews(connId, schema, table) {
  try {
    const raw = localStorage.getItem(tableViewsKey(connId, schema, table))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** @param {string} connId @param {string} schema @param {string} table @param {SavedTableView[]} views */
export function saveTableViews(connId, schema, table, views) {
  try {
    localStorage.setItem(tableViewsKey(connId, schema, table), JSON.stringify(views))
  } catch {
    // localStorage unavailable/full — views just won't persist
  }
}

/**
 * Short human summary of what a view changes — shown next to its name.
 * @param {SavedTableView} v
 */
export function describeTableView(v) {
  const parts = []
  if (v.filters?.length) parts.push(`${v.filters.length} filter${v.filters.length === 1 ? '' : 's'}`)
  if (v.search?.trim()) parts.push('search')
  if (v.sort) parts.push('sort')
  if (v.hiddenColumns?.length) parts.push(`${v.hiddenColumns.length} hidden`)
  if (v.dataViewMode && v.dataViewMode !== 'table') parts.push(v.dataViewMode)
  return parts.join(' · ')
}
