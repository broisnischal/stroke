/** @typedef {'table' | 'sql' | 'welcome' | 'ai' | 'schema' | 'orm' | 'security' | 'logs' | 'json' | 'charts' | 'dashboard' | 'erd' | 'reltree' | 'diagrams'} StudioTabKind */

/** @typedef {import('$lib/table-query.js').TableSort} TableSort */
/** @typedef {import('$lib/table-query.js').TableFilter} TableFilter */
/** @typedef {import('$lib/foreign-key-nav.js').ForeignKeyInfo} ForeignKeyInfo */

/** @typedef {object} TableTabState
 * @property {string} schema
 * @property {string | null} table
 * @property {'table' | 'view' | 'materialized_view' | 'foreign_table'} [tableKind]
 * @property {number} page
 * @property {number} pageSize
 * @property {string} rowSearch
 * @property {TableSort | null} rowSort
 * @property {TableFilter[]} rowFilters
 * @property {Array<{ name: string, dataType?: string }>} columns
 * @property {string[]} primaryKey
 * @property {ForeignKeyInfo[]} foreignKeys
 * @property {unknown[][]} rows
 * @property {number} total
 * @property {number} queryMs
 * @property {boolean} loadingRows
 * @property {string} error
 * @property {Set<number>} selected
 * @property {number | null} focusedRow
 * @property {number | null} inspectorRow
 * @property {{ rowIdx: number, colIdx: number, draft: string, original: string } | null} editingCell
 * @property {boolean} savingCell
 * @property {Set<string>} hiddenColumns
 * @property {boolean} filterBarOpen
 */

/** @typedef {object} SqlTabState
 * @property {string} sqlText
 * @property {Array<{ name: string, dataType?: string }>} sqlColumns
 * @property {unknown[][]} sqlRows
 * @property {number} sqlQueryMs
 * @property {string} sqlMessage
 * @property {boolean} sqlLoading
 * @property {string} sqlError
 */

/** @typedef {object} StudioTab
 * @property {string} id
 * @property {StudioTabKind} kind
 * @property {string} title
 * @property {TableTabState | SqlTabState | null} state
 */

let tabSeq = 0

export function nextTabId() {
  tabSeq += 1
  return `tab-${tabSeq}`
}

/** @param {TableTabState} state */
export function cloneTableTabState(state) {
  return {
    ...state,
    // Shallow-copy mutable primitives only — rows/columns/foreignKeys are
    // treated as immutable value arrays; no deep clone needed.
    columns: state.columns,
    primaryKey: state.primaryKey,
    foreignKeys: state.foreignKeys,
    rows: state.rows,
    rowFilters: state.rowFilters,
    rowSort: state.rowSort,
    // Sets must be new instances so mutations don't bleed between tabs
    selected: new Set(state.selected),
    hiddenColumns: new Set(state.hiddenColumns),
    editingCell: state.editingCell ? { ...state.editingCell } : null,
  }
}

/** @param {SqlTabState} state */
export function cloneSqlTabState(state) {
  // Arrays are immutable value objects; no copy needed
  return { ...state }
}

/** @returns {TableTabState} */
/** @param {string} [schema] @param {string | null} [table] @param {'table'|'view'|'materialized_view'|'foreign_table'} [tableKind] */
export function createTableTabState(schema = 'public', table = null, tableKind = 'table') {
  return {
    schema,
    table,
    tableKind,
    page: 1,
    pageSize: 50,
    rowSearch: '',
    rowSort: null,
    rowFilters: [],
    columns: [],
    primaryKey: [],
    foreignKeys: [],
    rows: [],
    total: 0,
    queryMs: 0,
    loadingRows: false,
    error: '',
    selected: new Set(),
    focusedRow: null,
    inspectorRow: null,
    editingCell: null,
    savingCell: false,
    hiddenColumns: new Set(),
    filterBarOpen: false,
  }
}

/** @returns {SqlTabState} */
export function createSqlTabState(sqlText = 'SELECT 1;') {
  return {
    sqlText,
    sqlColumns: [],
    sqlRows: [],
    sqlQueryMs: 0,
    sqlMessage: '',
    sqlLoading: false,
    sqlError: '',
  }
}

/** @param {string} [schema] @param {string | null} [table] @param {'table'|'view'|'materialized_view'|'foreign_table'} [tableKind] */
export function createTableTab(schema = 'public', table = null, tableKind = 'table') {
  const state = createTableTabState(schema, table, tableKind)
  return /** @type {StudioTab} */ ({
    id: nextTabId(),
    kind: 'table',
    title: tableTabTitle(state),
    state,
  })
}

/** @param {string} [sqlText] */
export function createSqlTab(sqlText) {
  return /** @type {StudioTab} */ ({
    id: nextTabId(),
    kind: 'sql',
    title: 'Query Editor',
    state: createSqlTabState(sqlText),
  })
}

export function createWelcomeTab() {
  return /** @type {StudioTab} */ ({
    id: nextTabId(),
    kind: 'welcome',
    title: 'New tab',
    state: null,
  })
}

export function createAiTab() {
  return /** @type {StudioTab} */ ({
    id: nextTabId(),
    kind: 'ai',
    title: 'AI Chat',
    state: null,
  })
}

export function createSchemaTab() {
  return /** @type {StudioTab} */ ({
    id: nextTabId(),
    kind: 'schema',
    title: 'Schema Explorer',
    state: null,
  })
}

export function createOrmTab() {
  return /** @type {StudioTab} */ ({
    id: nextTabId(),
    kind: 'orm',
    title: 'ORM Runner',
    state: null,
  })
}

export function createSecurityTab() {
  return /** @type {StudioTab} */ ({
    id: nextTabId(),
    kind: 'security',
    title: 'Security',
    state: null,
  })
}

export function createLogsTab() {
  return /** @type {StudioTab} */ ({
    id: nextTabId(),
    kind: 'logs',
    title: 'Activity Log',
    state: null,
  })
}

/** @param {StudioTab[]} tabs */
export function findAiTab(tabs) {
  return tabs.find((t) => t.kind === 'ai') ?? null
}

/** @param {StudioTab[]} tabs */
export function findSchemaTab(tabs) {
  return tabs.find((t) => t.kind === 'schema') ?? null
}

/** @param {StudioTab[]} tabs */
export function findOrmTab(tabs) {
  return tabs.find((t) => t.kind === 'orm') ?? null
}

/** @param {StudioTab[]} tabs */
export function findSecurityTab(tabs) {
  return tabs.find((t) => t.kind === 'security') ?? null
}

/** @param {StudioTab[]} tabs */
export function findLogsTab(tabs) {
  return tabs.find((t) => t.kind === 'logs') ?? null
}

export function createBackupTab() {
  return /** @type {StudioTab} */ ({
    id: nextTabId(),
    kind: 'backup',
    title: 'Backup & Restore',
    state: null,
  })
}

/** @param {StudioTab[]} tabs */
export function findBackupTab(tabs) {
  return tabs.find((t) => t.kind === 'backup') ?? null
}

export function createJsonTab() {
  return /** @type {StudioTab} */ ({
    id: nextTabId(),
    kind: 'json',
    title: 'JSON Viewer',
    state: null,
  })
}

/** @param {StudioTab[]} tabs */
export function findJsonTab(tabs) {
  return tabs.find((t) => t.kind === 'json') ?? null
}

export function createChartsTab() {
  return /** @type {StudioTab} */ ({
    id: nextTabId(),
    kind: 'charts',
    title: 'Charts',
    state: null,
  })
}

/** @param {StudioTab[]} tabs */
export function findChartsTab(tabs) {
  return tabs.find((t) => t.kind === 'charts') ?? null
}

export function createDashboardTab() {
  return /** @type {StudioTab} */ ({
    id: nextTabId(),
    kind: 'dashboard',
    title: 'Dashboard',
    state: null,
  })
}

/** @param {StudioTab[]} tabs */
export function findDashboardTab(tabs) {
  return tabs.find((t) => t.kind === 'dashboard') ?? null
}

export function createRelTreeTab() {
  return /** @type {StudioTab} */ ({
    id: nextTabId(),
    kind: 'reltree',
    title: 'Relation Tree',
    state: null,
  })
}

/** @param {StudioTab[]} tabs */
export function findRelTreeTab(tabs) {
  return tabs.find(t => t.kind === 'reltree') ?? null
}

export function createDiagramsTab() {
  return /** @type {StudioTab} */ ({
    id: nextTabId(),
    kind: 'diagrams',
    title: 'Diagrams',
    state: null,
  })
}

/** @param {StudioTab[]} tabs */
export function findDiagramsTab(tabs) {
  return tabs.find((t) => t.kind === 'diagrams') ?? null
}

export function createErdTab() {
  return /** @type {StudioTab} */ ({
    id: nextTabId(),
    kind: 'erd',
    title: 'ER Diagram',
    state: null,
  })
}

/** @param {StudioTab[]} tabs */
export function findErdTab(tabs) {
  return tabs.find((t) => t.kind === 'erd') ?? null
}

/** @param {TableTabState} state */
export function tableTabTitle(state) {
  if (!state.table) return 'Table'
  return state.table
}

/** @param {StudioTab} tab */
export function tabDisplayTitle(tab) {
  if (tab.kind === 'table' && tab.state) return tableTabTitle(/** @type {TableTabState} */ (tab.state))
  if (tab.kind === 'sql') return 'Query Editor'
  if (tab.kind === 'ai') return 'AI Chat'
  if (tab.kind === 'schema') return 'Schema Explorer'
  if (tab.kind === 'orm') return 'ORM Runner'
  if (tab.kind === 'security') return 'Security'
  if (tab.kind === 'logs') return 'Activity Log'
  if (tab.kind === 'json') return 'JSON Viewer'
  if (tab.kind === 'charts') return 'Charts'
  if (tab.kind === 'dashboard') return 'Dashboard'
  if (tab.kind === 'erd') return 'ER Diagram'
  if (tab.kind === 'reltree') return 'Relation Tree'
  if (tab.kind === 'diagrams') return 'Diagrams'
  return tab.title
}

/** @param {StudioTab[]} tabs @param {string} schema @param {string} table */
export function findTableTab(tabs, schema, table) {
  return tabs.find(
    (t) =>
      t.kind === 'table' &&
      t.state &&
      /** @type {TableTabState} */ (t.state).schema === schema &&
      /** @type {TableTabState} */ (t.state).table === table,
  )
}

/** @param {StudioTab[]} tabs */
export function findSqlTab(tabs) {
  return tabs.find((t) => t.kind === 'sql') ?? null
}

/** @param {StudioTab[]} tabs */
export function findLastTableTab(tabs) {
  for (let i = tabs.length - 1; i >= 0; i -= 1) {
    if (tabs[i].kind === 'table') return tabs[i]
  }
  return null
}

/** @param {StudioTab[]} tabs @param {number} fromIndex @param {1 | -1} direction */
export function cycleTabIndex(tabs, fromIndex, direction) {
  if (tabs.length === 0) return -1
  return (fromIndex + direction + tabs.length) % tabs.length
}
