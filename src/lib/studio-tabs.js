/** @typedef {'table' | 'sql' | 'welcome' | 'ai' | 'schema' | 'orm' | 'security' | 'logs'} StudioTabKind */

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
    columns: [...state.columns],
    primaryKey: [...state.primaryKey],
    foreignKeys: state.foreignKeys.map((fk) => ({
      columns: [...fk.columns],
      referencedColumns: [...(fk.referencedColumns ?? fk.referenced_columns ?? [])],
      referencedSchema: fk.referencedSchema ?? fk.referenced_schema ?? '',
      referencedTable: fk.referencedTable ?? fk.referenced_table ?? '',
    })),
    rows: [...state.rows],
    rowFilters: state.rowFilters.map((f) => ({ ...f })),
    rowSort: state.rowSort ? { ...state.rowSort } : null,
    selected: new Set(state.selected),
    editingCell: state.editingCell ? { ...state.editingCell } : null,
    hiddenColumns: new Set(state.hiddenColumns),
  }
}

/** @param {SqlTabState} state */
export function cloneSqlTabState(state) {
  return {
    ...state,
    sqlColumns: [...state.sqlColumns],
    sqlRows: [...state.sqlRows],
  }
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
    title: 'SQL',
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

/** @param {TableTabState} state */
export function tableTabTitle(state) {
  if (!state.table) return 'Table'
  return state.table
}

/** @param {StudioTab} tab */
export function tabDisplayTitle(tab) {
  if (tab.kind === 'table' && tab.state) return tableTabTitle(/** @type {TableTabState} */ (tab.state))
  if (tab.kind === 'sql') return 'SQL'
  if (tab.kind === 'ai') return 'AI Chat'
  if (tab.kind === 'schema') return 'Schema Explorer'
  if (tab.kind === 'orm') return 'ORM Runner'
  if (tab.kind === 'security') return 'Security'
  if (tab.kind === 'logs') return 'Activity Log'
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
