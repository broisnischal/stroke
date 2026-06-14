<script>
  import { onMount, onDestroy, untrack, tick } from 'svelte'
  import Logo from './Logo.svelte'
  import Database from '@lucide/svelte/icons/database'
  import Terminal from '@lucide/svelte/icons/terminal'
  import Table2 from '@lucide/svelte/icons/table-2'
  import Bot from '@lucide/svelte/icons/bot'
  import LayoutTemplate from '@lucide/svelte/icons/layout-template'
  import Command from '@lucide/svelte/icons/command'
  import Lightbulb from '@lucide/svelte/icons/lightbulb'
  import Code2 from '@lucide/svelte/icons/code-2'
  import ShieldCheck from '@lucide/svelte/icons/shield-check'
  import ScrollText from '@lucide/svelte/icons/scroll-text'
  import BarChart2 from '@lucide/svelte/icons/bar-chart-2'
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard'
  import GitBranch from '@lucide/svelte/icons/git-branch'
  import Blocks from '@lucide/svelte/icons/blocks'
  import GitCompare from '@lucide/svelte/icons/git-compare'
  import History from '@lucide/svelte/icons/history'
  import Plus from '@lucide/svelte/icons/plus'
  import { createHotkey, createHotkeySequence } from '@tanstack/svelte-hotkeys'
  import { cycleTheme, restorePreviousTheme, isCurrentThemeDark } from '$lib/stores/settings.js'
  import { pickRandomTip } from '$lib/insider-tips.js'
  import { toast } from 'svelte-sonner'
  import Sidebar from './Sidebar.svelte'
  import TabBar from './TabBar.svelte'
  import TabLoading from './TabLoading.svelte'
  import TableToolbar from './TableToolbar.svelte'
  import StructureView from './StructureView.svelte'
  import DataTable from './DataTable.svelte'
  import RowDetailPanel from './RowDetailPanel.svelte'
  import CommandPalette from './CommandPalette.svelte'
  // AiChat / AiSidebar (large, pull in marked + shiki) are loaded lazily the first time
  // the AI panel is opened — see the {#await import()} blocks below.
  import AiSettingsDialog from './AiSettingsDialog.svelte'
  import ConnectionModal from './ConnectionModal.svelte'
  import DockerLaunchModal from './DockerLaunchModal.svelte'
  import CreateTableDialog from './CreateTableDialog.svelte'
  import CreateSchemaDialog from './CreateSchemaDialog.svelte'
  import Onboarding from './Onboarding.svelte'
  import SettingsDialog from './SettingsDialog.svelte'
  import KeyboardShortcutsDialog from './KeyboardShortcutsDialog.svelte'
  import DdlDialog from './DdlDialog.svelte'
  import InsiderDialog from './InsiderDialog.svelte'
  import AboutDialog from './AboutDialog.svelte'
  import ReportIssueDialog from './ReportIssueDialog.svelte'
  import UpdateDialog from './UpdateDialog.svelte'
  import StatusBar from './StatusBar.svelte'
  import DisconnectDialog from './DisconnectDialog.svelte'
  // InsertRowDialog removed — replaced by inline draft row in DataTable
  import McpPanel from './McpPanel.svelte'
  import SearchPage from './SearchPage.svelte'
  // NotebookEditor (pulls Monaco via SqlCell + marked via MarkdownCell) is lazy-loaded
  // at its render site so notebooks don't drag those into the startup bundle.
  import SchemaTimelinePage from './SchemaTimelinePage.svelte'
  import SchemaPage from './SchemaPage.svelte'
  import BackupPage from './BackupPage.svelte'
  import LogsPage from './LogsPage.svelte'
  // Monaco-backed pages (DataDiffPage, OrmRunner, SecurityPage, JsonViewerPage, SqlConsole)
  // are loaded lazily at their render sites so the Monaco editor stays out of the
  // startup bundle until the user actually opens a SQL / ORM / JSON / diff / security tab.
  // Heavy feature pages (echarts / mermaid / swapy / xyflow+dagre) are loaded lazily
  // the first time their tab is opened — see the {#await import()} blocks below.
  // This keeps those large libraries out of the startup bundle and idle memory.
  import { Button } from '$lib/components/ui/button/index.js'
  import AlertTriangle from '@lucide/svelte/icons/triangle-alert'
  import X from '@lucide/svelte/icons/x'
  import {
    disconnectPostgres,
    listSchemas,
    listTables,
    getTableRows,
    getTableColumnStructure,
    getIncomingForeignKeys,
    executeSql,
    executeSqlMulti,
    executeDdl,
    updateTableCell,
    deleteTableRows,
    insertTableRow,
    toggleDevtools,
    mcpStart,
    mcpStop,
    mcpUpdateConnections,
  } from '$lib/api.js'
  import {
    createTableTab,
    createSqlTab,
    createWelcomeTab,
    createAiTab,
    createSchemaTab,
    createOrmTab,
    createSecurityTab,
    createLogsTab,
    createExtensionsTab,
    findExtensionsTab,
    createJsonTab,
    createBackupTab,
    createChartsTab,
    createDashboardTab,
    createErdTab,
    findErdTab,
    createDiagramsTab,
    findDiagramsTab,
    createSearchTab,
    findSearchTab,
    createNotebookTab,
    createSchemaTimelineTab,
    findSchemaTimelineTab,
    createDataDiffTab,
    findDataDiffTab,
    findTableTab,
    findSqlTab,
    findAiTab,
    findSchemaTab,
    findOrmTab,
    findSecurityTab,
    findLogsTab,
    findBackupTab,
    findJsonTab,
    findChartsTab,
    findDashboardTab,
    findLastTableTab,
    tableTabTitle,
    cycleTabIndex,
    cloneTableTabState,
    cloneSqlTabState,
  } from '$lib/studio-tabs.js'
  import { createNotebook, deserializeNotebook, titleFromPath } from '$lib/notebook.js'
  import { openNotebookFile } from '$lib/api.js'
  import { formatCompactCount, normalizeTableRowCount } from '$lib/table-list.js'
  import {
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    PAGE_SIZE_ALL,
    activeFilters,
    filtersApiSignature,
    filtersForApi,
    sortForApi,
  } from '$lib/table-query.js'
  import {
    buildForeignKeyFilters,
    buildReverseForeignKeyFilters,
    findForeignKeyForColumn,
    normalizeForeignKeys,
  } from '$lib/foreign-key-nav.js'
  import { loadLayout, saveLayout } from '$lib/stores/layout.js'
  import {
    getLastConnection,
    loadSavedConnections,
    setLastConnectionId,
    upsertConnection,
    engineFamily,
  } from '$lib/stores/connections.js'
  import {
    connectPostgres,
    connectSqlite,
    connectD1,
    connectLibSql,
    connectMysql,
    connectClickhouse,
    connectDuckdb,
    connectMssql,
    listIndexes,
    listEnums,
    listTriggers,
    listSequences,
    truncateTable,
    dropTable,
    initSampleDb,
    getTableDdl,
  } from '$lib/api.js'
  import {
    remapNullableRowIndex,
    remapRowIndexSet,
  } from '$lib/table-row-indices.js'
  import { rowsToCsv, rowsToJson, saveExportFile, buildExportFilename } from '$lib/export.js'
  import {
    recordQueryExecution,
    listQueryHistory,
    listSavedQueries,
    createSavedQuery,
  } from '$lib/stores/query-history.js'
  import { recordActivity } from '$lib/stores/activity-log.js'
  import { loadRecentTabs, pushRecentTab, removeRecentTab, clearRecentTabs } from '$lib/stores/recent-tabs.js'
  import { installInputShortcuts } from '$lib/input-shortcuts.js'
  import TitleBar from './TitleBar.svelte'
  import { savedCharts, updateChart, switchChartsConnection } from '$lib/stores/saved-charts.js'
  import { switchDiagramsConnection } from '$lib/stores/saved-diagrams.js'
  import { dashboards, activeDashboardId, switchDashboardsConnection } from '$lib/stores/dashboards.js'
  import { buildOption } from '$lib/chart-utils.js'
  import { get } from 'svelte/store'

  /** @typedef {import('$lib/studio-tabs.js').StudioTab} StudioTab */
  /** @typedef {import('$lib/studio-tabs.js').TableTabState} TableTabState */
  /** @typedef {import('$lib/studio-tabs.js').SqlTabState} SqlTabState */
  /** @typedef {import('$lib/table-query.js').TableSort} TableSort */
  /** @typedef {import('$lib/table-query.js').TableFilter} TableFilter */
  /** @typedef {import('$lib/foreign-key-nav.js').ForeignKeyInfo} ForeignKeyInfo */

  const SEARCH_DEBOUNCE_MS = 150
  const COLUMNS_CACHE_MAX = 60

  /** @param {Map<string, unknown>} map @param {string} key @param {unknown} value */
  function lruSet(map, key, value) {
    if (map.has(key)) map.delete(key)
    map.set(key, value)
    if (map.size > COLUMNS_CACHE_MAX) map.delete(/** @type {string} */ (map.keys().next().value))
  }

  const ONBOARDING_KEY = 'stroke:onboarded'
  const SAMPLE_SEEDED_KEY = 'stroke:sample-seeded'
  const SAMPLE_DB_ID = 'stroke:sample-sqlite'
  let showOnboarding = $state(false)

  // Dev-only: Alt+Shift+O resets and re-shows the onboarding. Dead code in prod.
  if (import.meta.env.DEV) {
    createHotkey('Alt+Shift+O', () => {
      try { localStorage.removeItem(ONBOARDING_KEY) } catch {}
      showOnboarding = true
    })
  }

  let connection = $state(null)
  let autoConnecting = $state(false)
  let showConnectionModal = $state(false)
  let showDockerModal = $state(false)
  let dockerInitialDb = $state(/** @type {string | null} */ (null))
  let showCreateTableDialog = $state(false)
  let showCreateSchemaDialog = $state(false)
  let savedConnections = $state(loadSavedConnections())
  let showSettingsModal = $state(false)
  let showShortcutsModal = $state(false)
  let showInsiderModal = $state(false)
  let showAboutModal = $state(false)
  let showReportIssueDialog = $state(false)
  let showDisconnectDialog = $state(false)
  let showAiModelSettings = $state(false)
  let ddlDialogOpen = $state(false)
  let ddlDialogTable = $state('')
  let ddlDialogSql = $state('')
  let commandOpen = $state(false)
  let commandPage = $state(/** @type {'root'|'docker'|'connections'|'tables'} */ ('root'))

  // ── DB-type capability flags ───────────────────────────────────────────────
  // Normalize wire-compatible aliases (mariadb → mysql, cockroachdb → postgres)
  // so every capability/dialect check below keeps working unchanged.
  const dbType = $derived(engineFamily(connection?.type))
  /** Schema Explorer is useful for postgres + mysql; sqlite/d1 have no meaningful schema pages. */
  const hasSchemaExplorer = $derived(dbType === 'postgres' || dbType === 'mysql')
  /** Security (RLS, policies, roles) is PostgreSQL-only. */
  const hasSecurity = $derived(dbType === 'postgres')
  /** @type {import('./UpdateDialog.svelte').default | null} */
  let updateDialog = $state(null)
  let statusBarHasUpdate = $state(false)
  let sidebarOpen = $state(loadLayout().navSidebarOpen)
  let sidebarEverOpened = $state(loadLayout().navSidebarOpen)
  let aiSidebarOpen = $state(loadLayout().aiSidebarOpen)
  let aiSidebarEverOpened = $state(loadLayout().aiSidebarOpen)

  /** @type {StudioTab[]} */
  let tabs = $state([])
  let activeTabId = $state(/** @type {string | null} */ (null))

  // ── Tab navigation history (back/forward) ────────────────────────────────
  /** @type {string[]} */
  let navHistory = $state([])
  let navIndex = $state(-1)
  let _navigating = false  // prevent history push during back/forward jumps

  const canGoBack    = $derived(navIndex > 0)
  const canGoForward = $derived(navIndex < navHistory.length - 1)
  /** @type {import('$lib/stores/recent-tabs.js').RecentTab[]} */
  let recentTabs = $state([])

  let schemas = $state([])
  let activeSchema = $state('public')
  let tables = $state([])
  let indexes = $state([])
  /** @type {{ name: string, values: string[] }[]} */
  let enums = $state([])
  /** @type {{ name: string, tableName: string, timing: string, events: string, functionName: string, enabled: boolean }[]} */
  let triggers = $state([])
  /** @type {{ name: string, dataType: string, startValue: number, minValue: number, maxValue: number, increment: number, cycle: boolean, ownedBy: string|null }[]} */
  let sequences = $state([])
  /** @type {'data' | 'structure'} */
  let tableViewMode = $state('data')
  /** @type {import('$lib/api.js').ColumnStructureRow[] | null} — loaded on demand when switching to structure view */
  let structureColumns = $state(/** @type {any[]} */ ([]))
  let loadingStructure = $state(false)
  let structureSearch = $state('')
  let activeTable = $state(/** @type {string | null} */ (null))
  // Pre-filtered to the active table so the DataTable/StructureView props don't
  // recreate a filtered array on every StudioShell re-render (was a per-render
  // cost on each tab switch and keystroke).
  const activeTableIndexes = $derived(activeTable ? indexes.filter((i) => i.tableName === activeTable) : [])
  const activeTableTriggers = $derived(activeTable ? triggers.filter((t) => t.tableName === activeTable) : [])
  let tableFilter = $state('')
  let loadingTables = $state(false)

  // AI Mode — full-screen chat, hides sidebar and tabs
  function loadAiMode() { try { return localStorage.getItem('stroke:ai-mode') === '1' } catch { return false } }
  function saveAiMode(v) { try { localStorage.setItem('stroke:ai-mode', v ? '1' : '0') } catch {} }

  // Hidden columns — persisted per connection+schema+table
  /** @param {string} connId @param {string} schema @param {string} table */
  function hiddenColsKey(connId, schema, table) { return `stroke:hidden-cols:${connId}:${schema}.${table}` }
  /** @param {string} connId @param {string} schema @param {string} table @returns {Set<string>} */
  function loadHiddenCols(connId, schema, table) {
    try { const v = localStorage.getItem(hiddenColsKey(connId, schema, table)); if (v) return new Set(JSON.parse(v)) } catch {}
    return new Set()
  }
  /** @param {string} connId @param {string} schema @param {string} table @param {Set<string>} cols */
  function saveHiddenCols(connId, schema, table, cols) {
    try { localStorage.setItem(hiddenColsKey(connId, schema, table), JSON.stringify([...cols])) } catch {}
  }
  let aiMode = $state(loadAiMode())
  let aiEverOpened = $state(loadAiMode())
  $effect(() => { if (aiMode) aiEverOpened = true })
  $effect(() => { if (sidebarOpen) sidebarEverOpened = true })
  $effect(() => { if (aiSidebarOpen) aiSidebarEverOpened = true })

  // Keep Monaco-heavy tabs mounted once opened so the editor isn't destroyed on tab switch.
  let sqlEverOpened = $state(false)
  let ormEverOpened = $state(false)
  let securityEverOpened = $state(false)
  let logsEverOpened = $state(false)
  let extensionsEverOpened = $state(false)
  let jsonEverOpened = $state(false)
  let backupEverOpened = $state(false)
  let chartsEverOpened = $state(false)
  let dashboardEverOpened = $state(false)
  let erdEverOpened     = $state(false)
  let diagramsEverOpened = $state(false)
  let searchEverOpened = $state(false)
  let schemaTimelineEverOpened = $state(false)
  let dataDiffEverOpened = $state(false)
  /** @type {{ focusEditor: () => void } | null} */
  let sqlConsoleRef = $state(null)

  // Auto-focus the SQL editor whenever the SQL tab becomes active. Uses whenRefReady
  // so focus still lands on the first open while the lazy SqlConsole chunk mounts.
  $effect(() => {
    if (activeTab?.kind !== 'sql') return
    whenRefReady(() => sqlConsoleRef, (r) => { if (activeTab?.kind === 'sql') r.focusEditor?.() })
  })

  $effect(() => {
    if (activeTab?.kind === 'sql') sqlEverOpened = true
    if (activeTab?.kind === 'orm') ormEverOpened = true
    if (activeTab?.kind === 'security') securityEverOpened = true
    if (activeTab?.kind === 'logs') logsEverOpened = true
    if (activeTab?.kind === 'extensions') extensionsEverOpened = true
    if (activeTab?.kind === 'json') jsonEverOpened = true
    if (activeTab?.kind === 'backup') backupEverOpened = true
    if (activeTab?.kind === 'charts') chartsEverOpened = true
    if (activeTab?.kind === 'dashboard') dashboardEverOpened = true
    if (activeTab?.kind === 'erd') erdEverOpened = true
    if (activeTab?.kind === 'diagrams') diagramsEverOpened = true
    if (activeTab?.kind === 'search') searchEverOpened = true
    if (activeTab?.kind === 'schema-timeline') schemaTimelineEverOpened = true
    if (activeTab?.kind === 'data-diff') dataDiffEverOpened = true
  })

  let columns = $state([])
  /** @type {Set<string>} */
  let hiddenColumns = $state(new Set())
  /** @type {Map<string, typeof columns>} */
  let tableColumnsCache = $state(new Map())
  let primaryKey = $state([])
  /** @type {ForeignKeyInfo[]} */
  let foreignKeys = $state([])
  /** Cache of incoming (reverse) FKs, keyed by "schema.table". Loaded once per table open. */
  let incomingFkCache = $state(/** @type {Map<string,any[]>} */ (new Map()))
  /** Incoming FKs for the active table, read from cache. */
  const incomingForeignKeys = $derived(
    (activeSchema && activeTable) ? (incomingFkCache.get(`${activeSchema}.${activeTable}`) ?? []) : []
  )
  /** Virtual rel column labels for the toolbar columns dropdown.
   *  Must enumerate ALL incoming FK tables — no cap — so every rel column
   *  the DataTable can ever render is always reachable in the show/hide panel.
   *  (DataTable caps visible columns at MAX_VIRTUAL_COLS=5 but fills that
   *   quota from whatever isn't hidden, so capping here makes it impossible
   *   to hide the "overflow" tables that get promoted into view.) */
  const virtualRelColumnsForToolbar = $derived.by(() => {
    const seen = new Set()
    const result = []
    for (const fk of incomingForeignKeys) {
      const label =
        (fk.fromSchema && fk.fromSchema !== activeSchema)
          ? `${fk.fromSchema}.${fk.fromTable}`
          : fk.fromTable
      if (seen.has(label)) continue
      seen.add(label)
      result.push({ label })
    }
    return result
  })
  
  let rows = $state([])
  let savingCell = $state(false)
  let deletingRows = $state(false)
  let insertingRow = $state(false)
  let tableReadonly = $state(false)
  /** Bound from DataTable — triggers the inline new-row draft. */
  let dtBeginInsertRow = $state(/** @type {() => void} */ (() => {}))
  let showMcpPanel = $state(false)
  let mcpRunning = $state(false)
  /** @type {{ rowIdx: number, colIdx: number, draft: string } | null} */
  let editingCell = $state(null)
  // ── Staged (unsaved) cell edits — surfaced as Apply/Reset in the StatusBar ──
  let pendingEditCount = $state(0)
  /** @type {() => void | Promise<void>} */
  let applyEdits = $state(() => {})
  /** @type {() => void} */
  let resetEdits = $state(() => {})
  // ── Table scroll controls (StatusBar go-to-top / go-to-bottom) ──
  /** @type {() => void} */
  let scrollTableTop = $state(() => {})
  /** @type {() => void} */
  let scrollTableBottom = $state(() => {})
  // Read/restore the data grid's scroll so horizontal (+ vertical) position is
  // preserved across tab switches.
  /** @type {() => { left: number, top: number }} */
  let tableGetScroll = $state(() => ({ left: 0, top: 0 }))
  /** @type {(pos: { left?: number, top?: number }) => void} */
  let tableApplyScroll = $state(() => {})
  /** @type {{ refresh: () => void } | null} */
  let securityPageRef = $state(null)
  /** @type {{ sendMessage: (text: string) => void } | null} */
  let aiSidebarRef = $state(null)

  /**
   * Run `fn` once a lazily-mounted component ref becomes available. These panels
   * (SQL console, AI sidebar, …) are now loaded via dynamic import, so their
   * `bind:this` ref is null for the first few frames after opening — a single
   * tick/microtask isn't enough. Polls a bounded number of animation frames so
   * the action still fires on first open without ever spinning forever.
   * @template T @param {() => T | null} getRef @param {(ref: T) => void} fn @param {number} [frames]
   */
  function whenRefReady(getRef, fn, frames = 90) {
    const ref = getRef()
    if (ref) { fn(ref); return }
    if (frames <= 0) return
    requestAnimationFrame(() => whenRefReady(getRef, fn, frames - 1))
  }

  let total = $state(0)
  let queryMs = $state(0)
  let loadingRows = $state(false)
  let loadingMore = $state(false)
  let page = $state(1)
  let pageSize = $state(DEFAULT_PAGE_SIZE)
  let rawOffset = $state(/** @type {number | null} */ (null))
  // When "All rows" sentinel is active, always fetch from offset 0.
  const currentOffset = $derived(
    pageSize === PAGE_SIZE_ALL ? 0 : (rawOffset ?? (page - 1) * pageSize),
  )
  // Bumped whenever a fresh page of rows is applied (page/filter/sort/search).
  // The DataTable watches it to jump its scroll + virtual window back to the
  // top, so a reload never leaves the view stranded mid-table.
  let reloadToken = $state(0)
  // Monotonic id so an out-of-order / superseded row fetch can't clobber a
  // newer one when the user pages rapidly.
  let _loadSeq = 0
  // Infinite scroll — accumulated rows across all "load more" fetches.
  let _infiniteRows = $state(/** @type {any[]} */ ([]))
  let infiniteScroll = $state((() => { try { return localStorage.getItem('stroke:infiniteScroll') === '1' } catch { return false } })())
let rowSearch = $state('')
  let rowSort = $state(/** @type {TableSort | null} */ (null))
  let rowFilters = $state(/** @type {TableFilter[]} */ ([]))
  let filterBarOpen = $state(false)
  /** @type {{ focusRowSearch?: () => void, clearRowSearch?: () => void } | null} */
  let tableToolbar = $state(null)
  /** @type {ReturnType<typeof setTimeout> | null} */
  let filterDebounceTimer = null
  /** @type {ReturnType<typeof setTimeout> | null} */
  let searchDebounceTimer = null
  onDestroy(() => {
    if (filterDebounceTimer) clearTimeout(filterDebounceTimer)
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  })


  /** Tracks which tab IDs currently have an in-flight background fetch. */
  const fetchingTabIds = new Set()
  let error = $state('')
  let selected = $state(new Set())
  /** @type {number | null} */
  let focusedRow = $state(null)
  /** @type {number | null} */
  let inspectorRow = $state(null)

  let sqlText = $state('SELECT 1;')
  let sqlColumns = $state([])
  let sqlRows = $state([])
  let sqlQueryMs = $state(0)
  let sqlMessage = $state('')
  let sqlLoading = $state(false)
  let sqlError = $state('')
  /** @type {any[]} */
  let sqlMultiResults = $state([])

  let ormCode = $state('')
  let ormMode = $state(/** @type {'drizzle' | 'prisma'} */ ('drizzle'))
  let ormColumns = $state([])
  let ormRows = $state([])
  let ormQueryMs = $state(0)
  let ormLoading = $state(false)
  let ormError = $state('')

  const activeTab = $derived(tabs.find((t) => t.id === activeTabId) ?? null)
  /** 'table' | 'view' | 'materialized_view' | 'foreign_table' — for the active table tab */
  const activeTableKind = $derived(
    activeTab?.kind === 'table'
      ? (/** @type {any} */ (activeTab.state))?.tableKind ?? 'table'
      : 'table'
  )
  /** Structure view only makes sense for real tables, not views/materialized views */
  const canShowStructure = $derived(activeTableKind === 'table' || activeTableKind === 'foreign_table')

  let welcomeTip = $state(pickRandomTip())
  let _lastWelcomeTabId = ''
  $effect(() => {
    if (activeTab?.kind === 'welcome' && activeTab.id !== _lastWelcomeTabId) {
      _lastWelcomeTabId = activeTab.id
      welcomeTip = pickRandomTip()
    }
  })

  const activeView = $derived(activeTab?.kind === 'sql' ? 'sql' : 'table')

  // Stable name arrays derived separately so sqlSchemaHints doesn't rebuild
  // on every row fetch — only rebuilds when the column set actually changes.
  const _activeColNames = $derived(columns.map((c) => c.name))
  const _sqlColNames = $derived(sqlColumns.map((c) => c.name))
  const _tableNames = $derived(tables.map((t) => t.name))

  const sqlSchemaHints = $derived.by(() => {
    // Only the SQL editor consumes this, and building columnsByTable iterates the
    // whole table-column cache (dozens of tables). Skip that work entirely unless
    // the SQL view is active — otherwise every table-tab switch paid for hints
    // nothing was showing. When the user opens SQL, activeView flips and this
    // rebuilds fresh from the current caches.
    if (activeView !== 'sql') {
      return { schemas, activeSchema, tables: _tableNames, columnsByTable: /** @type {Record<string, string[]>} */ ({}) }
    }
    /** @type {Record<string, string[]>} */
    const columnsByTable = {}
    for (const [key, cols] of tableColumnsCache) {
      columnsByTable[key] = cols.map((c) => c.name)
    }
    if (activeTable && _activeColNames.length) {
      columnsByTable[activeTable] = _activeColNames
      columnsByTable[`${activeSchema}.${activeTable}`] = _activeColNames
    }
    if (_sqlColNames.length) {
      columnsByTable.__result__ = _sqlColNames
    }
    return { schemas, activeSchema, tables: _tableNames, columnsByTable }
  })

  const connectionId = $derived(
    connection
      ? `${connection.host}:${connection.port}/${connection.database}@${connection.user}`
      : '',
  )

  // ID of the currently-active saved connection (for highlighting in the palette)
  const activeConnectionId = $derived(
    connection
      ? (savedConnections.find((c) => {
          if (c.type === 'sqlite') return c.filePath === connection.filePath
          if (c.type === 'd1') return c.databaseId === connection.databaseId && c.accountId === connection.accountId
          return c.host === connection.host && c.database === connection.database && c.user === connection.user
        })?.id ?? '')
      : '',
  )

  const persistConnectionId = $derived(activeConnectionId || connectionId)

  // Keep MCP layer in sync with saved connections + active connection (no passwords sent).
  $effect(() => {
    void mcpUpdateConnections(savedConnections, activeConnectionId || null)
  })

  const QUERY_HISTORY_OPEN_KEY = 'stroke:query-history-open'
  function loadQueryHistoryPref() {
    try {
      return localStorage.getItem(QUERY_HISTORY_OPEN_KEY) === '1'
    } catch {
      return false
    }
  }

  /** @type {import('$lib/stores/query-history.js').QueryHistoryEntry[]} */
  let queryHistory = $state([])
  /** @type {import('$lib/stores/query-history.js').SavedQuery[]} */
  let savedQueries = $state([])
  let queryHistoryVisible = $state(loadQueryHistoryPref())

  function refreshRecentTabs() {
    recentTabs = persistConnectionId ? loadRecentTabs(persistConnectionId) : []
  }

  async function refreshQueryStores() {
    if (!persistConnectionId) {
      queryHistory = []
      savedQueries = []
      return
    }
    const [history, saved] = await Promise.all([
      listQueryHistory(persistConnectionId),
      listSavedQueries(persistConnectionId),
    ])
    queryHistory = history
    savedQueries = saved
  }

  $effect(() => {
    queryHistoryVisible
    try {
      localStorage.setItem(QUERY_HISTORY_OPEN_KEY, queryHistoryVisible ? '1' : '0')
    } catch {
      /* ignore */
    }
  })

  $effect(() => {
    if (commandOpen && persistConnectionId) void refreshQueryStores()
  })

  $effect(() => {
    // Reload recents, charts, and dashboards whenever the active connection changes
    void persistConnectionId
    refreshRecentTabs()
    switchChartsConnection(persistConnectionId)
    switchDashboardsConnection(persistConnectionId)
    switchDiagramsConnection(persistConnectionId)
  })

  $effect(() => {
    if (!commandOpen) return
    showConnectionModal = false
    showSettingsModal = false
    showShortcutsModal = false
  })

  const _aiActive = $derived(aiMode || aiSidebarOpen)

  // The all-tables column map only changes when the table-column cache changes
  // (a new table is fetched), NOT when the user switches to an already-cached
  // table. Splitting it into its own derived means a table click no longer
  // rebuilds this whole object — that rebuild (Object.fromEntries over every
  // cached table) was a main-thread stall on each table switch while AI was open.
  const _allTableColumns = $derived.by(() => {
    if (!_aiActive) return /** @type {Record<string, { name: string, dataType: string, nullable: boolean, enumValues?: string[] }[]>} */ ({})
    return Object.fromEntries(
      [...tableColumnsCache.entries()].map(([key, cols]) => [
        key,
        cols.map((c) => ({
          name: c.name,
          dataType: c.dataType ?? c.data_type ?? '',
          nullable: c.nullable ?? true,
          enumValues: c.enumValues ?? c.enum_values ?? undefined,
        })),
      ]),
    )
  })

  const aiSchemaContext = $derived.by(() => {
    // Only rebuild the expensive schema context when AI is actually visible.
    // When AI is hidden, return a cheap stable object — components using it
    // are either hidden or inert, so stale data is fine.
    if (!_aiActive) {
      return {
        schemas, activeSchema, tables: _tableNames,
        activeTable, columns: [], primaryKey: [], foreignKeys: [],
        allTableColumns: {}, dbType: engineFamily(connection?.type),
      }
    }
    return {
      schemas,
      activeSchema,
      tables: tables.map((t) => ({ name: t.name, rowCount: t.rowCount })),
      activeTable,
      columns: columns.map((c) => ({
        name: c.name,
        dataType: c.dataType ?? c.data_type ?? '',
        nullable: c.nullable ?? true,
        enumValues: c.enumValues ?? c.enum_values ?? undefined,
      })),
      primaryKey,
      foreignKeys,
      allTableColumns: _allTableColumns,
      /** @type {import('$lib/stores/connections.js').DbType} */
      dbType: engineFamily(connection?.type),
    }
  })

  const inspectorTarget = $derived.by(() => {
    if (activeTab?.kind !== 'table') return null
    if (inspectorRow !== null) {
      return { kind: 'row', rowIdx: inspectorRow }
    }
    return null
  })

  const activeTabIndex = $derived(
    activeTabId ? tabs.findIndex((t) => t.id === activeTabId) : -1,
  )

  /** @returns {TableTabState} */
  function captureTableSnapshot() {
    return {
      schema: activeSchema,
      table: activeTable,
      page,
      pageSize,
      rowSearch,
      rowSort: rowSort ? { ...rowSort } : null,
      rowFilters: rowFilters.map((f) => ({ ...f })),
      columns,
      primaryKey,
      foreignKeys,
      rows,
      total,
      queryMs,
      loadingRows: false,
      error,
      selected: new Set(selected),
      focusedRow,
      inspectorRow,
      editingCell: editingCell ? { ...editingCell } : null,
      savingCell: false,
      hiddenColumns: new Set(hiddenColumns),
      filterBarOpen,
      ...(() => { const s = tableGetScroll(); return { scrollLeft: s.left, scrollTop: s.top } })(),
    }
  }

  /** @param {TableTabState} s */
  function applyTableSnapshot(s) {
    page = s.page
    pageSize = s.pageSize ?? DEFAULT_PAGE_SIZE
    rowSearch = s.rowSearch ?? ''
    rowSort = s.rowSort ? { ...s.rowSort } : null
    rowFilters = (s.rowFilters ?? []).map((f) => ({ ...f }))
    columns = s.columns
    primaryKey = s.primaryKey
    foreignKeys = s.foreignKeys ?? []
    rows = s.rows
    total = s.total
    queryMs = s.queryMs
    loadingRows = s.loadingRows ?? false
    error = s.error
    selected = new Set(s.selected)
    focusedRow = s.focusedRow
    inspectorRow = s.inspectorRow ?? null
    editingCell = s.editingCell ? { ...s.editingCell } : null
    savingCell = false
    activeTable = s.table
    hiddenColumns = new Set(s.hiddenColumns)
    filterBarOpen = s.filterBarOpen ?? false
    // Restore the grid scroll position for this tab (after layout settles).
    tableApplyScroll({ left: s.scrollLeft ?? 0, top: s.scrollTop ?? 0 })
  }

  /** @returns {SqlTabState} */
  function captureSqlSnapshot() {
    return {
      sqlText,
      sqlColumns,
      sqlRows,
      sqlQueryMs,
      sqlMessage,
      sqlLoading: false,
      sqlError,
    }
  }

  /** @param {SqlTabState} s */
  function applySqlSnapshot(s) {
    sqlText = s.sqlText
    sqlColumns = s.sqlColumns
    sqlRows = s.sqlRows
    sqlQueryMs = s.sqlQueryMs
    sqlMessage = s.sqlMessage
    sqlLoading = false
    sqlError = s.sqlError
  }

  function clearTableEditor() {
    activeTable = null
    page = 1
    pageSize = DEFAULT_PAGE_SIZE
    rowSearch = ''
    rowSort = null
    rowFilters = []
    columns = []
    primaryKey = []
    foreignKeys = []
    rows = []
    total = 0
    queryMs = 0
    loadingRows = false
    error = ''
    selected = new Set()
    focusedRow = null
    inspectorRow = null
    editingCell = null
    savingCell = false
  }

  function saveActiveTabState() {
    if (!activeTabId) return
    const idx = tabs.findIndex((t) => t.id === activeTabId)
    if (idx === -1) return
    const t = tabs[idx]
    /** @type {StudioTab | null} */
    let updated = null
    if (t.kind === 'table') {
      const state = cloneTableTabState(captureTableSnapshot())
      updated = { ...t, state, title: tableTabTitle(state) }
    } else if (t.kind === 'sql') {
      updated = { ...t, state: cloneSqlTabState(captureSqlSnapshot()) }
    }
    if (updated) {
      const next = [...tabs]
      next[idx] = updated
      tabs = next
    }
  }

  /** @param {StudioTab} tab */
  async function applyTabToEditor(tab) {
    if (tab.kind === 'welcome' || tab.kind === 'ai' || tab.kind === 'schema' || tab.kind === 'orm') {
      clearTableEditor()
      return
    }
    if (tab.kind === 'sql' && tab.state) {
      clearTableEditor()
      applySqlSnapshot(cloneSqlTabState(/** @type {SqlTabState} */ (tab.state)))
      return
    }
    if (tab.kind === 'table' && tab.state) {
      const raw = /** @type {TableTabState} */ (tab.state)
      if (raw.schema && raw.schema !== activeSchema) {
        activeSchema = raw.schema
        await loadTables()
      }
      if (raw.columns.length === 0) {
        // No cached data — apply lightweight snapshot (no need to clone rows)
        applyTableSnapshot(raw)
        if (raw.table && !fetchingTabIds.has(tab.id)) void fetchRowsForTab(tab.id)
      } else {
        // Has cached data — clone Sets so mutations don't bleed between tabs
        applyTableSnapshot(cloneTableTabState(raw))
      }
    }
  }

  // F12 or Ctrl/Cmd+Shift+I → toggle DevTools (no-op in release builds)
  createHotkey('F12', (e) => { e.preventDefault(); void toggleDevtools() })
  createHotkey('Mod+Shift+I', (e) => { e.preventDefault(); void toggleDevtools() })

  createHotkey('Mod+K', (e) => {
    e.preventDefault()
    commandOpen = true
  })

  createHotkey('Mod+Shift+E', (e) => {
    if (!connection) return
    e.preventDefault()
    if (aiMode) exitAiMode()
    else enterAiMode()
  })

  createHotkey('Mod+F', (e) => {
    if (commandOpen || showConnectionModal || showSettingsModal) return
    if (activeTab?.kind !== 'table' || !activeTable) return
    e.preventDefault()
    tableToolbar?.focusRowSearch?.()
  })

  createHotkey('Mod+Shift+G', (e) => {
    if (!connection) return
    e.preventDefault()
    commandOpen = false
    openSearchTab()
  })

  // Ctrl/Cmd+T when viewing a table: clear the row search (and focus it).
  // This lets the user quickly reset filters without reaching for the mouse.
  createHotkey('Mod+T', (e) => {
    if (commandOpen || showConnectionModal || showSettingsModal) return
    if (activeTab?.kind !== 'table' || !activeTable) return
    e.preventDefault()
    tableToolbar?.clearRowSearch?.()
  })

  createHotkey('Mod+Enter', (e) => {
    if (activeTab?.kind !== 'sql' || !connection) return
    e.preventDefault()
    runSql()
  })

  createHotkey('Mod+W', (e) => {
    if (!connection) return
    e.preventDefault()
    if (aiMode) { exitAiMode(); return }
    if (activeTabId) closeTab(activeTabId)
  })

  // Chord: Ctrl/⌘+K then W → close all tabs. (Mod+K opens the command palette;
  // the W step dismisses it and closes everything.)
  createHotkeySequence(['Mod+K', 'W'], (e) => {
    if (!connection) return
    e.preventDefault()
    commandOpen = false
    void closeAllTabs()
  })

  createHotkey('Mod+N', (e) => {
    if (!connection) return
    e.preventDefault()
    openWelcomeTab()
  })

  createHotkey('Mod+T', (e) => {
    if (!connection) return
    e.preventDefault()
    commandPage = 'tables'
    commandOpen = true
  })

  createHotkey('Mod+Tab', (e) => {
    if (!connection || tabs.length < 2) return
    e.preventDefault()
    cycleTab(1)
  })

  createHotkey('Mod+Shift+Tab', (e) => {
    if (!connection || tabs.length < 2) return
    e.preventDefault()
    cycleTab(-1)
  })

  // Note: Mod+Tab / Mod+Shift+Tab above already map to Ctrl+Tab on Windows/Linux
  // and Cmd+Tab on macOS. No additional Ctrl+Tab registration needed — duplicates
  // cause the "[already registered]" warning from @tanstack/svelte-hotkeys.

  createHotkey('Mod+B', (e) => {
    e.preventDefault()
    toggleSidebar()
  })

  createHotkey('Mod+Shift+L', (e) => {
    e.preventDefault()
    openLogsTab()
  })

  createHotkey('Mod+M', (e) => {
    e.preventDefault()
    cycleTheme()
  })

  createHotkey('Mod+Shift+M', (e) => {
    e.preventDefault()
    restorePreviousTheme()
  })

  createHotkey('Mod+Shift+D', (e) => {
    if (!connection) return
    e.preventDefault()
    void focusDataView()
  })

  createHotkey('Mod+Shift+S', (e) => {
    if (!connection) return
    e.preventDefault()
    void focusSqlView()
  })

  createHotkey('Mod+Shift+O', (e) => {
    if (!connection) return
    e.preventDefault()
    openOrmTab()
  })

  createHotkey('Mod+Shift+F', (e) => {
    if (commandOpen || showConnectionModal || showSettingsModal) return
    e.preventDefault()
    const el = document.querySelector('[data-sidebar-filter]')
    if (el instanceof HTMLElement) {
      if (!sidebarOpen) toggleSidebar()
      el.focus()
    }
  })

  // Table toolbar menus — open the Filter / Sort / Columns menu for the active
  // table tab (data view only). Guarded so they don't fire while typing.
  /** @param {KeyboardEvent} e */
  function tableMenuHotkeyGuard(e) {
    if (activeTab?.kind !== 'table' || tableViewMode !== 'data') return false
    if (commandOpen || showConnectionModal || showSettingsModal) return false
    const el = document.activeElement
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)) return false
    return true
  }

  createHotkey('Alt+Shift+F', (e) => {
    if (!tableMenuHotkeyGuard(e)) return
    e.preventDefault()
    tableToolbar?.openFilterMenu?.()
  })

  createHotkey('Alt+Shift+S', (e) => {
    if (!tableMenuHotkeyGuard(e)) return
    e.preventDefault()
    tableToolbar?.openSortMenu?.()
  })

  createHotkey('Alt+Shift+C', (e) => {
    if (!tableMenuHotkeyGuard(e)) return
    e.preventDefault()
    tableToolbar?.openColumnsMenu?.()
  })

  createHotkey('Escape', (e) => {
    // Close dialogs in reverse z-index order (topmost first).
    // Each branch prevents lower-priority handlers from firing.
    if (commandOpen)           { e.preventDefault(); commandOpen = false;           return }
    if (showShortcutsModal)    { e.preventDefault(); showShortcutsModal = false;    return }
    if (showAiModelSettings)   { e.preventDefault(); showAiModelSettings = false;   return }
    if (showAboutModal)        { e.preventDefault(); showAboutModal = false;        return }
    if (showInsiderModal)      { e.preventDefault(); showInsiderModal = false;      return }
    if (showDisconnectDialog)  { e.preventDefault(); showDisconnectDialog = false;  return }
    if (showCreateTableDialog) { e.preventDefault(); showCreateTableDialog = false; return }
    if (showDockerModal)       { e.preventDefault(); showDockerModal = false;       return }
    if (showMcpPanel)          { e.preventDefault(); showMcpPanel = false;          return }
    if (showConnectionModal)   { e.preventDefault(); showConnectionModal = false;   return }
    if (showSettingsModal)     { e.preventDefault(); showSettingsModal = false;     return }
    if (editingCell) {
      e.preventDefault()
      editingCell = null
      return
    }
    if (filterBarOpen) { e.preventDefault(); filterBarOpen = false; return }
    if (!inspectorTarget) return
    e.preventDefault()
    closeInspector()
  })

  createHotkey('Mod+Backspace', (e) => {
    if (commandOpen || showConnectionModal || showSettingsModal) return
    // Ctrl+Backspace is the word-delete shortcut in inputs/textareas — don't steal it
    const el = document.activeElement
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLElement && el.isContentEditable)
    ) return
    if (activeTab?.kind !== 'table' || !activeTable || selected.size === 0) return
    e.preventDefault()
    void deleteSelectedRows()
  })

  createHotkey('Mod+R', (e) => {
    if (!connection) return
    if (commandOpen || showConnectionModal || showSettingsModal) return
    e.preventDefault()
    void handleModRefresh()
  })

  // Ctrl+Arrow (Windows/Linux) or Cmd+Arrow (Mac) for pagination and scroll.
  // Uses a raw listener instead of createHotkey because:
  //   1. macOS intercepts Ctrl+Arrow at the OS level for Mission Control.
  //   2. Raw listeners read current reactive signal values at call time.
  $effect(() => {
    /** @param {KeyboardEvent} e */
    function onArrowKey(e) {
      const mod = e.ctrlKey || e.metaKey
      if (!mod || e.altKey) return
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
      if (commandOpen || showConnectionModal || showSettingsModal) return
      const el = document.activeElement
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) return

      // Ctrl/Cmd+Up → scroll table to top; Ctrl/Cmd+Down → scroll table to bottom
      if (e.key === 'ArrowUp' && !e.shiftKey) {
        e.preventDefault()
        scrollTableTop()
        return
      }
      if (e.key === 'ArrowDown' && !e.shiftKey) {
        e.preventDefault()
        scrollTableBottom()
        return
      }

      // Left/Right: pagination (table tabs only)
      if (activeTab?.kind !== 'table' || !activeTable) return
      if (e.shiftKey) {
        // Ctrl/Cmd+Shift+Left → first page, Ctrl/Cmd+Shift+Right → last page
        if (e.key === 'ArrowLeft') {
          if (page <= 1) return
          e.preventDefault()
          void handlePageChange(1)
        } else {
          const lastPage = Math.max(1, Math.ceil(total / effectivePageSize))
          if (page >= lastPage) return
          e.preventDefault()
          void handlePageChange(lastPage)
        }
      } else {
        if (e.key === 'ArrowLeft') {
          if (page <= 1) return
          e.preventDefault()
          void handlePageChange(page - 1)
        } else {
          if (page * effectivePageSize >= total) return
          e.preventDefault()
          void handlePageChange(page + 1)
        }
      }
    }
    document.addEventListener('keydown', onArrowKey)
    return () => document.removeEventListener('keydown', onArrowKey)
  })

  // F11 (all platforms) and Cmd+Ctrl+F (macOS standard) for fullscreen toggle.
  $effect(() => {
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    if (!isTauri) return
    /** @param {KeyboardEvent} e */
    async function onFullscreenKey(e) {
      const isF11 = e.key === 'F11' && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
      const isMacFullscreen = e.key === 'f' && e.metaKey && e.ctrlKey && !e.shiftKey && !e.altKey
      if (!isF11 && !isMacFullscreen) return
      e.preventDefault()
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const win = getCurrentWindow()
        const current = await win.isFullscreen()
        await win.setFullscreen(!current)
      } catch { /* ignore */ }
    }
    document.addEventListener('keydown', onFullscreenKey)
    return () => document.removeEventListener('keydown', onFullscreenKey)
  })

  createHotkey('?', (e) => {
    if (commandOpen || showConnectionModal || showSettingsModal || showShortcutsModal) return
    const tag = document.activeElement?.tagName ?? ''
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    e.preventDefault()
    showShortcutsModal = true
  })

  createHotkey('Mod+,', (e) => {
    if (commandOpen || showConnectionModal || showShortcutsModal) return
    e.preventDefault()
    showSettingsModal = !showSettingsModal
  })

  createHotkey('Mod+I', (e) => {
    if (!connection) return
    if (commandOpen || showConnectionModal || showSettingsModal) return
    e.preventDefault()
    toggleAiSidebar()
  })

  createHotkey('Alt+I', (e) => {
    if (commandOpen || showConnectionModal || showSettingsModal) return
    e.preventDefault()
    showInsiderModal = !showInsiderModal
  })

  /** @returns {boolean} */
  function isFocusInRegion(region) {
    const el = document.activeElement
    if (!el || !(el instanceof HTMLElement)) return false
    return !!el.closest(`[data-studio-region="${region}"]`)
  }

  async function handleModRefresh() {
    if (isFocusInRegion('sidebar')) {
      await loadTables()
      return
    }
    if (activeTab?.kind === 'sql') {
      await runSql()
      return
    }
    if (activeTab?.kind === 'table' && activeTable) {
      await loadRows()
      return
    }
    if (activeTab?.kind === 'schema') {
      await loadSchemas()
      await loadTables()
      return
    }
    if (activeTab?.kind === 'security') {
      securityPageRef?.refresh()
      return
    }
    if (activeTab?.kind === 'dashboard') {
      await refreshDashboardCharts()
      return
    }
    await loadTables()
  }

  async function refreshDashboardCharts() {
    const dash = get(dashboards).find((d) => d.id === get(activeDashboardId))
    if (!dash) return
    const charts = get(savedCharts)
    const isDark = get(isCurrentThemeDark)
    await Promise.all(
      dash.items.map(async (item) => {
        const chart = charts.find((c) => c.id === item.chartId)
        if (!chart?.sql) return
        try {
          const result = await executeSql(chart.sql)
          const cols = result.columns ?? []
          const rows = result.rows ?? []
          const option = buildOption({
            type: chart.config.type,
            columns: cols,
            rows,
            xCol: chart.config.xCol,
            yCol: chart.config.yCol,
            zCol: chart.config.zCol,
            groupCol: chart.config.groupCol,
            isDark,
            title: chart.config.title,
          })
          updateChart(chart.id, { previewOption: option })
        } catch {
          // silently skip failed charts
        }
      })
    )
  }

  function closeInspector() {
    focusedRow = null
    inspectorRow = null
    selected = new Set()
    editingCell = null
  }

  function toggleSidebar() {
    if (!connection) return
    sidebarOpen = !sidebarOpen
    saveLayout({ navSidebarOpen: sidebarOpen })
  }


  function toggleAiSidebar() {
    if (!connection) return
    aiSidebarOpen = !aiSidebarOpen
    saveLayout({ aiSidebarOpen })
  }

  /**
   * Route "Fix with AI" from SqlConsole into the AI sidebar.
   * Opens the sidebar if hidden, then sends the composed message.
   * @param {{ error: string, sql: string }} detail
   */
  function handleFixWithAi({ error, sql }) {
    if (!connection) return
    // Ensure sidebar is visible
    if (!aiSidebarOpen) {
      aiSidebarOpen = true
      aiSidebarEverOpened = true
      saveLayout({ aiSidebarOpen: true })
    }
    const msg =
      `Fix this SQL error.\n\nError:\n${error}\n\nSQL:\n\`\`\`sql\n${sql}\n\`\`\`\n\n` +
      `Return the corrected SQL in a \`\`\`sql block and a brief explanation.`
    // Wait for the (lazily-imported) sidebar to mount before sending, so the very
    // first "Fix with AI" use doesn't drop the message while the chunk loads.
    whenRefReady(() => aiSidebarRef, (r) => r.sendMessage(msg))
  }

  /** Context-aware Accept from the AI sidebar — routes into the right editor. */
  /** @param {{ kind: 'sql' | 'code', lang?: string, content: string }} detail */
  async function handleAiSidebarAccept(detail) {
    if (detail.kind === 'code' && activeTab?.kind === 'orm') {
      const lang = (detail.lang ?? '').toLowerCase()
      if (lang === 'prisma' || /\bprisma\./.test(detail.content)) ormMode = 'prisma'
      else if (lang === 'drizzle' || /\bdb\.(select|insert|update|delete)\b/.test(detail.content)) ormMode = 'drizzle'
      ormCode = detail.content
      openOrmTab()
      toast.success(`Inserted into ${ormMode} editor`)
      return
    }
    await openQueryInEditor(detail.content)
    toast.success('Inserted into SQL editor')
  }

  /** @param {1 | -1} direction */
  function cycleTab(direction) {
    const idx = cycleTabIndex(tabs, activeTabIndex, direction)
    if (idx < 0) return
    void activateTab(tabs[idx].id)
  }

  function resetTabs() {
    tabs = []
    activeTabId = null
    clearTableEditor()
    sqlText = 'SELECT 1;'
    sqlColumns = []
    sqlRows = []
    sqlQueryMs = 0
    sqlMessage = ''
    sqlLoading = false
    sqlError = ''
    sqlMultiResults = []
  }

  function openWelcomeTab() {
    const existing = tabs.find((t) => t.kind === 'welcome')
    if (existing) {
      activeTabId = existing.id
      clearTableEditor()
      return
    }
    saveActiveTabState()
    const tab = createWelcomeTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  function dropWelcomeTabs() {
    tabs = tabs.filter((t) => t.kind !== 'welcome')
  }

  function openSqlTab() {
    saveActiveTabState()
    dropWelcomeTabs()
    const existing = findSqlTab(tabs)
    if (existing) {
      void activateTab(existing.id)
      return
    }
    // If SqlConsole is already mounted (keep-alive), seed the new tab with the
    // current active content so applySqlSnapshot doesn't overwrite Q2/Q3/etc.
    const tab = createSqlTab(sqlEverOpened ? sqlText : undefined)
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
    applySqlSnapshot(cloneSqlTabState(/** @type {SqlTabState} */ (tab.state)))
  }

  function openAiTab() {
    enterAiMode()
  }

  function openSchemaTab() {
    if (!hasSchemaExplorer) return
    const existing = findSchemaTab(tabs)
    if (existing) {
      void activateTab(existing.id)
      return
    }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = createSchemaTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  function openOrmTab() {
    const existing = findOrmTab(tabs)
    if (existing) {
      void activateTab(existing.id)
      return
    }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = createOrmTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  function openSecurityTab() {
    if (!hasSecurity) return
    const existing = findSecurityTab(tabs)
    if (existing) {
      void activateTab(existing.id)
      return
    }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = createSecurityTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  function openBackupTab() {
    const existing = findBackupTab(tabs)
    if (existing) { void activateTab(existing.id); return }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = createBackupTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  function openLogsTab() {
    const existing = findLogsTab(tabs)
    if (existing) {
      void activateTab(existing.id)
      return
    }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = createLogsTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  function openExtensionsTab() {
    const existing = findExtensionsTab(tabs)
    if (existing) {
      void activateTab(existing.id)
      return
    }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = createExtensionsTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  function openJsonTab() {
    const existing = findJsonTab(tabs)
    if (existing) {
      void activateTab(existing.id)
      return
    }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = createJsonTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  function openChartsTab() {
    const existing = findChartsTab(tabs)
    if (existing) {
      void activateTab(existing.id)
      return
    }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = createChartsTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  function openDashboardTab() {
    const existing = findDashboardTab(tabs)
    if (existing) {
      void activateTab(existing.id)
      return
    }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = createDashboardTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  function openErdTab() {
    const existing = findErdTab(tabs)
    if (existing) { void activateTab(existing.id); return }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = createErdTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  function openDiagramsTab() {
    const existing = findDiagramsTab(tabs)
    if (existing) { activateTab(existing.id); return }
    const tab = createDiagramsTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
  }

  function openSearchTab() {
    const existing = findSearchTab(tabs)
    if (existing) {
      void activateTab(existing.id)
      return
    }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = createSearchTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  function openNewNotebookTab() {
    saveActiveTabState()
    dropWelcomeTabs()
    const nb = createNotebook()
    const tab = createNotebookTab(nb, null)
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  async function openNotebookFromFile() {
    try {
      const result = await openNotebookFile()
      if (!result) return
      const nb = deserializeNotebook(result.content)
      saveActiveTabState()
      dropWelcomeTabs()
      const tab = createNotebookTab(nb, result.path)
      tabs = [...tabs, tab]
      activeTabId = tab.id
      clearTableEditor()
    } catch (err) {
      toast.error(`Failed to open notebook: ${/** @type {Error} */ (err).message}`)
    }
  }

  function openSchemaTimelineTab() {
    const existing = findSchemaTimelineTab(tabs)
    if (existing) { void activateTab(existing.id); return }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = createSchemaTimelineTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  function openDataDiffTab() {
    const existing = findDataDiffTab(tabs)
    if (existing) { void activateTab(existing.id); return }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = createDataDiffTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  /**
   * Update the state of a notebook tab (called by NotebookEditor via onupdate).
   * @param {string} tabId
   * @param {{ notebook?: import('$lib/notebook.js').Notebook, filePath?: string | null, dirty?: boolean, title?: string }} updates
   */
  function updateNotebookTab(tabId, updates) {
    tabs = tabs.map((t) => {
      if (t.id !== tabId || t.kind !== 'notebook') return t
      const next = { ...t }
      if (updates.title) next.title = updates.title
      next.state = { .../** @type {any} */ (t.state) }
      if (updates.notebook !== undefined) next.state.notebook = updates.notebook
      if (updates.filePath !== undefined) next.state.filePath = updates.filePath
      if (updates.dirty !== undefined) next.state.dirty = updates.dirty
      return next
    })
  }

  /** @param {{ sql: string, mode: string }} detail */
  async function runOrm(detail) {
    if (!connection || !detail.sql.trim()) return
    ormLoading = true
    ormError = ''
    ormColumns = []
    ormRows = []
    try {
      const data = await executeSql(detail.sql)
      ormColumns = data.columns ?? []
      ormRows = data.rows ?? []
      ormQueryMs = data.queryMs ?? data.query_ms ?? 0
    } catch (e) {
      ormError = String(e)
    } finally {
      ormLoading = false
    }
  }

  /** @param {string} id */
  async function activateTab(id) {
    if (id === activeTabId) return
    saveActiveTabState()
    activeTabId = id

    // Push to nav history unless we're mid back/forward jump
    if (!_navigating) {
      const trimmed = navHistory.slice(0, navIndex + 1)
      // Don't duplicate consecutive same id
      if (trimmed[trimmed.length - 1] !== id) {
        navHistory = [...trimmed, id].slice(-50) // cap at 50
        navIndex = navHistory.length - 1
      }
    }

    const tab = tabs.find((t) => t.id === id)
    if (tab) await applyTabToEditor(tab)
  }

  async function navBack() {
    if (!canGoBack) return
    _navigating = true
    navIndex -= 1
    const id = navHistory[navIndex]
    // Skip ids for tabs that no longer exist
    if (!tabs.find(t => t.id === id)) {
      navHistory = navHistory.filter((_, i) => i !== navIndex)
      navIndex = Math.max(0, navIndex - 1)
      _navigating = false
      return
    }
    await activateTab(id)
    _navigating = false
  }

  async function navForward() {
    if (!canGoForward) return
    _navigating = true
    navIndex += 1
    const id = navHistory[navIndex]
    if (!tabs.find(t => t.id === id)) {
      navHistory = navHistory.filter((_, i) => i !== navIndex)
      navIndex = Math.min(navHistory.length - 1, navIndex)
      _navigating = false
      return
    }
    await activateTab(id)
    _navigating = false
  }

  /** @param {string} id */
  async function closeTab(id) {
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx < 0) return
    const nextTabs = tabs.filter((t) => t.id !== id)
    if (nextTabs.length === 0) {
      tabs = [createWelcomeTab()]
      activeTabId = tabs[0].id
      clearTableEditor()
      return
    }
    tabs = nextTabs
    if (activeTabId === id) {
      const nextIdx = Math.min(idx, nextTabs.length - 1)
      await activateTab(nextTabs[nextIdx].id)
    }
  }

  /** @param {string} id — keep only this tab, close everything else */
  async function closeOtherTabs(id) {
    const keep = tabs.find((t) => t.id === id)
    if (!keep) return
    tabs = [keep]
    await activateTab(keep.id)
  }

  async function closeAllTabs() {
    tabs = [createWelcomeTab()]
    activeTabId = tabs[0].id
    clearTableEditor()
  }

  /**
   * @param {string} schema
   * @param {string} table
   * @param {{ filters?: TableFilter[], resetQuery?: boolean }} [options]
   */
  async function openTableTab(schema, table, options = {}) {
    const { filters = null, resetQuery = false, search = null } = options
    const existing = findTableTab(tabs, schema, table)
    if (existing) {
      tableViewMode = 'data'
      structureColumns = []
      await activateTab(existing.id)
      if (filters || search !== null) {
        if (resetQuery) {
          rowSearch = ''
          rowSort = null
        }
        if (search !== null) rowSearch = search
        if (filters) {
          rowFilters = filters.map((f) => ({ ...f }))
          filterBarOpen = filters.length > 0
        }
        page = 1
        await loadRows()
      } else if (activeTable === table && columns.length === 0) {
        await loadRows()
      }
      return
    }
    saveActiveTabState()
    dropWelcomeTabs()
    const tableKind = tables.find((t) => t.name === table)?.kind ?? 'table'
    if (persistConnectionId) {
      pushRecentTab(persistConnectionId, { schema, table, tableKind: /** @type {any} */ (tableKind) })
      refreshRecentTabs()
    }
    const tab = createTableTab(schema, table, /** @type {any} */ (tableKind))
    // Pre-bake any filters/search into the tab state before fetching
    if (tab.state) {
      if (filters) /** @type {TableTabState} */ (tab.state).rowFilters = filters.map((f) => ({ ...f }))
      if (search !== null) /** @type {TableTabState} */ (tab.state).rowSearch = search
    }
    tabs = [...tabs, tab]
    activeTabId = tab.id
    activeTable = table
    tableViewMode = 'data'
    structureColumns = []
    structureSearch = ''
    page = 1
    pageSize = DEFAULT_PAGE_SIZE
    rowSearch = search ?? ''
    rowSort = null
    rowFilters = filters ? filters.map((f) => ({ ...f })) : []
    filterBarOpen = filters ? filters.length > 0 : false
    columns = []
    primaryKey = []
    foreignKeys = []
    rows = []
    total = 0
    queryMs = 0
    error = ''
    selected = new Set()
    focusedRow = null
    inspectorRow = null
    editingCell = null
    hiddenColumns = loadHiddenCols(persistConnectionId, schema, table)
    if (schema !== activeSchema) {
      activeSchema = schema
      await loadTables()
    }
    // Fire the fetch in background — caller can open more tabs without waiting
    void fetchRowsForTab(tab.id)
    // Load reverse FKs once per table (cached — not re-fetched on page/sort changes)
    void loadIncomingForeignKeys(schema, table)
  }

  /** Cap on the incoming-FK cache so long sessions across many tables don't grow it unbounded. */
  const INCOMING_FK_CACHE_MAX = 120
  /** @param {string} key @param {any[]} value */
  function setIncomingFkCache(key, value) {
    const next = new Map(incomingFkCache)
    next.set(key, value)
    // FIFO eviction — Map preserves insertion order, so drop the oldest entries.
    while (next.size > INCOMING_FK_CACHE_MAX) {
      const oldest = next.keys().next().value
      if (oldest === undefined) break
      next.delete(oldest)
    }
    incomingFkCache = next
  }

  /** Load incoming FKs for a table into the cache (no-op if already cached). */
  async function loadIncomingForeignKeys(schema, table) {
    const key = `${schema}.${table}`
    if (incomingFkCache.has(key)) return
    try {
      const result = await getIncomingForeignKeys(schema, table)
      setIncomingFkCache(key, result ?? [])
    } catch {
      setIncomingFkCache(key, [])
    }
  }

  /**
   * Fetch related rows for an FK sub-view panel.
   * kind='forward': follow this table's FK to the referenced table.
   * kind='reverse': query a referencing table filtered to this row.
   */
  async function handleFetchRelatedRows(detail) {
    try {
      if (detail.kind === 'forward') {
        const filters = buildForeignKeyFilters(detail.fk, columns, detail.row)
        if (!filters) return { columns: [], rows: [], error: 'FK value is NULL' }
        const refSchema = detail.fk.referencedSchema || detail.fk.referenced_schema || activeSchema
        const refTable  = detail.fk.referencedTable  || detail.fk.referenced_table  || ''
        if (!refTable) return { columns: [], rows: [], error: 'No referenced table' }
        const data = await getTableRows(refSchema, refTable, 50, 0, { filters: filtersForApi(filters) })
        return { columns: data.columns ?? [], rows: data.rows ?? [] }
      } else {
        const revFilters = buildReverseForeignKeyFilters(detail, columns, detail.row)
        if (!revFilters) return { columns: [], rows: [], error: 'Cannot build filter — value may be NULL' }
        const fromSchema = detail.fromSchema || activeSchema
        const data = await getTableRows(fromSchema, detail.fromTable, 50, 0, { filters: filtersForApi(revFilters) })
        return { columns: data.columns ?? [], rows: data.rows ?? [] }
      }
    } catch (e) {
      return { columns: [], rows: [], error: String(e) }
    }
  }

  /** @param {{ rowIdx: number, colIdx: number, reverseRel?: any, row?: unknown[] }} detail */
  async function handleFollowForeignKey({ rowIdx, colIdx, reverseRel, row: detailRow }) {
    // Reverse FK: navigate to the referencing table with the correct filter
    if (reverseRel?.fromTable) {
      const row = detailRow ?? rows[rowIdx]
      if (!row) return
      const fromSchema = reverseRel.fromSchema || activeSchema
      const revFilters = buildReverseForeignKeyFilters(reverseRel, columns, row)
      if (!revFilters) {
        toast.error('Cannot open reference', { description: 'Could not build filter.' })
        return
      }
      await openTableTab(fromSchema, reverseRel.fromTable, { filters: filtersForApi(revFilters), resetQuery: true })
      return
    }
    // Forward FK: standard navigation
    const col = columns[colIdx]
    if (!col) return
    const fk = findForeignKeyForColumn(foreignKeys, col.name)
    if (!fk) return
    const row = rows[rowIdx]
    if (!row) return
    const filters = buildForeignKeyFilters(fk, columns, row)
    if (!filters) {
      toast.error('Cannot open reference', {
        description: 'Foreign key value is NULL or incomplete.',
      })
      return
    }
    const refSchema = fk.referencedSchema || activeSchema
    await openTableTab(refSchema, fk.referencedTable, { filters, resetQuery: true })
  }

  async function loadSchemas() {
    const list = await listSchemas()
    schemas = list
    if (list.length === 0) {
      activeSchema = ''
      return
    }
    if (!list.includes(activeSchema)) {
      activeSchema = list.includes('public') ? 'public' : list[0]
    }
  }

  async function loadIndexes() {
    if (!activeSchema) { indexes = []; return }
    try {
      const list = await listIndexes(activeSchema)
      indexes = list
        .map((i) => ({
          name: i.name ?? '',
          tableName: i.tableName ?? i.table_name ?? '',
          columns: i.columns ?? '',
          indexType: i.indexType ?? i.index_type ?? 'btree',
          isUnique: i.isUnique ?? i.is_unique ?? false,
          isPrimary: i.isPrimary ?? i.is_primary ?? false,
          condition: i.condition ?? null,
          comment: i.comment ?? null,
        }))
        .filter((i) => i.name)
    } catch {
      indexes = []
    }
  }

  async function loadStructure() {
    if (!activeSchema || !activeTable) { structureColumns = []; return }
    loadingStructure = true
    const targetSchema = activeSchema
    const targetTable  = activeTable
    const driver       = dbType  // 'postgres' | 'mysql' | 'sqlite' | 'd1'
    try {
      const s = targetSchema.replace(/'/g, "''")
      const t = targetTable.replace(/'/g, "''")
      let rows = /** @type {unknown[][]} */ ([])

      // ── PostgreSQL / Supabase ─────────────────────────────────────────
      // pg_catalog is 10-100× faster than information_schema on hosted PG.
      if (driver === 'postgres') {
        const r = await executeSql(`
          SELECT
            a.attnum::int,
            a.attname,
            CASE
              WHEN t.typtype = 'b' AND t.typelem <> 0 AND t.typname LIKE '\\_%'
                THEN (SELECT bt.typname FROM pg_catalog.pg_type bt WHERE bt.oid = t.typelem) || '[]'
              WHEN a.atttypmod > 0 AND t.typname IN ('varchar','bpchar')
                THEN t.typname || '(' || (a.atttypmod - 4)::text || ')'
              WHEN a.atttypmod > 0 AND t.typname = 'numeric' AND a.atttypmod <> -1
                THEN 'numeric(' || (((a.atttypmod - 4) >> 16) & 65535)::text
                  || ',' || ((a.atttypmod - 4) & 65535)::text || ')'
              WHEN a.atttypmod > 0 AND t.typname IN ('bit','varbit')
                THEN t.typname || '(' || a.atttypmod::text || ')'
              ELSE t.typname
            END,
            NOT a.attnotnull,
            pg_get_expr(ad.adbin, ad.adrelid),
            (
              SELECT rn.nspname || '.' || rc.relname || '.' || ra.attname
              FROM pg_catalog.pg_constraint  pc
              JOIN pg_catalog.pg_class        rc ON rc.oid  = pc.confrelid
              JOIN pg_catalog.pg_namespace    rn ON rn.oid  = rc.relnamespace
              JOIN pg_catalog.pg_attribute    ra ON ra.attrelid = rc.oid AND ra.attnum = pc.confkey[1]
              WHERE pc.contype = 'f' AND pc.conrelid = a.attrelid AND pc.conkey[1] = a.attnum
              LIMIT 1
            ),
            (
              SELECT pc.conname FROM pg_catalog.pg_constraint pc
              WHERE pc.contype = 'f' AND pc.conrelid = a.attrelid AND pc.conkey[1] = a.attnum
              LIMIT 1
            ),
            col_description(a.attrelid, a.attnum)
          FROM pg_catalog.pg_attribute  a
          JOIN pg_catalog.pg_class      c  ON c.oid = a.attrelid
          JOIN pg_catalog.pg_namespace  n  ON n.oid = c.relnamespace
          JOIN pg_catalog.pg_type       t  ON t.oid = a.atttypid
          LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
          WHERE n.nspname = '${s}' AND c.relname = '${t}'
            AND a.attnum > 0 AND NOT a.attisdropped
          ORDER BY a.attnum
        `)
        rows = r?.rows ?? []

      // ── MySQL ─────────────────────────────────────────────────────────
      } else if (driver === 'mysql') {
        const r = await executeSql(`
          SELECT
            c.ORDINAL_POSITION,
            c.COLUMN_NAME,
            c.COLUMN_TYPE,
            c.IS_NULLABLE = 'YES',
            c.COLUMN_DEFAULT,
            CASE WHEN kcu.REFERENCED_TABLE_NAME IS NOT NULL
              THEN CONCAT(kcu.REFERENCED_TABLE_SCHEMA,'.',kcu.REFERENCED_TABLE_NAME,'.',kcu.REFERENCED_COLUMN_NAME)
              ELSE NULL END,
            kcu.CONSTRAINT_NAME,
            c.COLUMN_COMMENT
          FROM information_schema.COLUMNS c
          LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
            ON kcu.TABLE_SCHEMA = c.TABLE_SCHEMA AND kcu.TABLE_NAME = c.TABLE_NAME
           AND kcu.COLUMN_NAME = c.COLUMN_NAME AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
          WHERE c.TABLE_SCHEMA = '${s}' AND c.TABLE_NAME = '${t}'
          ORDER BY c.ORDINAL_POSITION
        `)
        rows = r?.rows ?? []

      // ── SQLite / D1 ───────────────────────────────────────────────────
      } else {
        const [colR, fkR] = await Promise.all([
          executeSql(`PRAGMA table_info('${t}')`),
          executeSql(`PRAGMA foreign_key_list('${t}')`),
        ])
        /** @type {Map<string, string>} */
        const fkMap = new Map()
        for (const fkRow of fkR?.rows ?? []) {
          const fromCol = String(fkRow[3] ?? '')
          const toTable = String(fkRow[2] ?? '')
          const toCol   = String(fkRow[4] ?? '')
          if (fromCol && !fkMap.has(fromCol)) fkMap.set(fromCol, `${toTable}.${toCol}`)
        }
        rows = (colR?.rows ?? []).map((row) => [
          Number(row[0]) + 1,  // cid → 1-based ordinal
          row[1],              // name
          row[2],              // type
          !(row[3] === 1 || row[3] === '1' || row[3] === true),  // notnull→nullable
          row[4],              // dflt_value
          fkMap.get(String(row[1] ?? '')) ?? null,
          null,
          null,
        ])
      }

      if (activeTable === targetTable && activeSchema === targetSchema) {
        structureColumns = rows.map((row) => ({
          ordinalPosition:  Number(row[0]) || 0,
          name:             String(row[1] ?? ''),
          dataType:         String(row[2] ?? ''),
          isNullable:       row[3] === true || row[3] === 't' || String(row[3]).toLowerCase() === 'true',
          columnDefault:    row[4] != null ? String(row[4]) : null,
          foreignKey:       row[5] != null ? String(row[5]) : null,
          fkConstraintName: row[6] != null ? String(row[6]) : null,
          comment:          row[7] != null ? String(row[7]) : null,
        }))
      }
    } catch (e) {
      toast.error('Could not load table structure', { description: String(e) })
      if (activeTable === targetTable) structureColumns = []
    } finally {
      loadingStructure = false
    }
  }

  // Auto-reset structure mode when navigating to a view/materialized_view.
  $effect(() => {
    if (!canShowStructure && tableViewMode === 'structure') {
      tableViewMode = 'data'
      structureColumns = []
    }
  })

  // Auto-load structure when the view is in structure mode, a table is active,
  // and there is an active connection.
  $effect(() => {
    if (connection && tableViewMode === 'structure' && activeTable && canShowStructure) {
      void loadStructure()
    }
  })

  async function loadEnums() {
    if (!activeSchema) { enums = []; return }
    try {
      const list = await listEnums(activeSchema)
      enums = list.map((e) => ({ name: e.name ?? '', values: e.values ?? [] }))
    } catch {
      enums = []
    }
  }

  async function loadTriggers() {
    if (!activeSchema) { triggers = []; return }
    try {
      const list = await listTriggers(activeSchema)
      triggers = list.map((t) => ({
        name: t.name ?? '',
        tableName: t.tableName ?? t.table_name ?? '',
        timing: t.timing ?? 'AFTER',
        events: t.events ?? '',
        functionName: t.functionName ?? t.function_name ?? '',
        enabled: t.enabled ?? true,
      })).filter((t) => t.name)
    } catch {
      triggers = []
    }
  }

  async function loadSequences() {
    if (!activeSchema) { sequences = []; return }
    try {
      const list = await listSequences(activeSchema)
      sequences = list.map((s) => ({
        name: s.name ?? '',
        dataType: s.dataType ?? s.data_type ?? 'bigint',
        startValue: s.startValue ?? s.start_value ?? 1,
        minValue: s.minValue ?? s.min_value ?? 1,
        maxValue: s.maxValue ?? s.max_value ?? 9007199254740991,
        increment: s.increment ?? 1,
        cycle: s.cycle ?? false,
        ownedBy: s.ownedBy ?? s.owned_by ?? null,
      })).filter((s) => s.name)
    } catch {
      sequences = []
    }
  }

  async function loadTables() {
    if (!activeSchema) {
      tables = []
      return
    }
    loadingTables = true
    error = ''
    try {
      const list = await listTables(activeSchema)
      tables = list
        .map((t) => ({
          name: t.name ?? t.table_name ?? '',
          rowCount: normalizeTableRowCount(t.rowCount ?? t.row_count),
          kind: t.kind ?? 'table',
          rlsEnabled: t.rlsEnabled ?? null,
        }))
        .filter((t) => t.name)
      if (activeTable && !tables.find((t) => t.name === activeTable)) {
        activeTable = tables[0]?.name ?? null
      }
    } catch (e) {
      error = String(e)
      tables = []
    } finally {
      loadingTables = false
    }
    void loadIndexes()
    void loadEnums()
    void loadTriggers()
    void loadSequences()
  }

  async function reloadTableFromQuery(resetPage = true) {
    if (resetPage) { page = 1; rawOffset = null }
    await loadRows()
  }

  /** @param {string} value */
  function handleRowSearchChange(value) {
    rowSearch = value
    page = 1
    rawOffset = null
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => {
      searchDebounceTimer = null
      void loadRows()
    }, SEARCH_DEBOUNCE_MS)
  }

  /** @param {TableFilter[]} filters */
  function handleRowFiltersChange(filters) {
    const prevSig = filtersApiSignature(rowFilters)
    rowFilters = filters
    const nextSig = filtersApiSignature(filters)
    if (prevSig === nextSig) return

    page = 1
    if (filterDebounceTimer) clearTimeout(filterDebounceTimer)
    filterDebounceTimer = setTimeout(() => {
      filterDebounceTimer = null
      void loadRows()
    }, SEARCH_DEBOUNCE_MS)
  }

  /** @param {TableSort | null} sort */
  async function handleRowSortChange(sort) {
    rowSort = sort
    await reloadTableFromQuery(true)
  }

  /** @param {number} size */
  async function handlePageSizeChange(size) {
    if (!Number.isFinite(size)) return
    if (size === PAGE_SIZE_ALL) {
      pageSize = PAGE_SIZE_ALL
    } else {
      if (size <= 0) return
      pageSize = Math.min(size, MAX_PAGE_SIZE)
    }
    await reloadTableFromQuery(true)
  }

  /** Resolve the effective fetch limit for the current pageSize. */
  const effectivePageSize = $derived(
    pageSize === PAGE_SIZE_ALL ? (total > 0 ? total : MAX_PAGE_SIZE) : pageSize,
  )

  /** @param {number} nextPage */
  async function handlePageChange(nextPage) {
    rawOffset = null
    page = nextPage
    await loadRows()
  }

  /** @param {number} limit @param {number} offset */
  async function handleLimitOffsetChange(limit, offset) {
    const clampedLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE)
    pageSize = clampedLimit
    rawOffset = offset
    page = Math.max(1, Math.floor(offset / clampedLimit) + 1)
    await loadRows()
  }

  /**
   * Fetch rows for any tab in the background.
   * Writes results into that tab's state; if the tab is still active when the
   * fetch resolves, also syncs to the global editor state so the UI updates.
   * @param {string} tabId
   */
  async function fetchRowsForTab(tabId) {
    if (fetchingTabIds.has(tabId)) return
    fetchingTabIds.add(tabId)

    const getTab = () => tabs.find((t) => t.id === tabId)
    const tab = getTab()
    if (!tab || tab.kind !== 'table' || !tab.state) {
      fetchingTabIds.delete(tabId)
      return
    }
    const s = /** @type {TableTabState} */ (tab.state)
    if (!s.table) {
      fetchingTabIds.delete(tabId)
      return
    }

    // Single helper to patch the tab state — avoids multiple tabs.map() calls per fetch
    /** @param {Partial<TableTabState>} patch */
    function patchTab(patch) {
      const i = tabs.findIndex((t) => t.id === tabId)
      if (i === -1) return
      const next = [...tabs]
      next[i] = { ...next[i], state: { .../** @type {TableTabState} */ (next[i].state), ...patch } }
      tabs = next
    }

    // Mark loading — one tabs write
    patchTab({ loadingRows: true, error: '' })
    if (tabId === activeTabId) { loadingRows = true; error = '' }

    try {
      const offset = (s.page - 1) * s.pageSize
      const { sortColumn, sortDirection } = sortForApi(s.rowSort)
      const data = await getTableRows(s.schema, s.table, s.pageSize, offset, {
        search: s.rowSearch,
        sortColumn,
        sortDirection,
        filters: filtersForApi(s.rowFilters),
      })

      const result = {
        columns: data.columns ?? [],
        primaryKey: data.primaryKey ?? data.primary_key ?? [],
        foreignKeys: normalizeForeignKeys(data.foreignKeys ?? data.foreign_keys),
        rows: data.rows ?? [],
        total: Number(data.total ?? 0),
        queryMs: Number(data.queryMs ?? data.query_ms ?? 0),
        loadingRows: false,
        error: '',
        selected: new Set(),
        focusedRow: null,
        inspectorRow: null,
        editingCell: null,
      }

      // Persist result to tab — one tabs write
      patchTab(result)

      // Update AI schema cache (LRU, capped)
      lruSet(tableColumnsCache, `${s.schema}.${s.table}`, result.columns)

      // Sync to global state only if this tab is still active
      if (tabId === activeTabId) {
        columns = result.columns
        primaryKey = result.primaryKey
        foreignKeys = result.foreignKeys
        rows = result.rows
        total = result.total
        queryMs = result.queryMs
        loadingRows = false
        error = ''
      }
    } catch (e) {
      const errStr = String(e)
      patchTab({ loadingRows: false, error: errStr, columns: [], rows: [], total: 0 })
      if (tabId === activeTabId) {
        loadingRows = false
        error = errStr
        columns = []
        primaryKey = []
        foreignKeys = []
        rows = []
        total = 0
      }
    } finally {
      fetchingTabIds.delete(tabId)
    }
  }

  async function loadRows() {
    if (!activeTable) {
      columns = []
      rows = []
      _infiniteRows = []
      total = 0
      return
    }
    const seq = ++_loadSeq
    loadingRows = true
    _infiniteRows = []
    selected = new Set()
    focusedRow = null
    inspectorRow = null
    editingCell = null
    error = ''
    try {
      const offset = currentOffset
      const { sortColumn, sortDirection } = sortForApi(rowSort)
      const data = await getTableRows(activeSchema, activeTable, effectivePageSize, offset, {
        search: rowSearch,
        sortColumn,
        sortDirection,
        filters: filtersForApi(rowFilters, columns),
      })
      if (seq !== _loadSeq) return
      const nextColumns = data.columns ?? []
      if (!sameColumnShape(columns, nextColumns)) columns = nextColumns
      if (activeTable) {
        lruSet(tableColumnsCache, `${activeSchema}.${activeTable}`, columns)
      }
      primaryKey = data.primaryKey ?? data.primary_key ?? []
      foreignKeys = normalizeForeignKeys(data.foreignKeys ?? data.foreign_keys)
      const fetched = data.rows ?? []
      rows = fetched
      _infiniteRows = fetched
      total = Number(data.total ?? 0)
      queryMs = Number(data.queryMs ?? data.query_ms ?? 0)
      reloadToken++
      const maxPage = Math.max(1, Math.ceil(total / effectivePageSize) || 1)
      if (page > maxPage) page = maxPage
    } catch (e) {
      if (seq !== _loadSeq) return
      error = String(e)
      columns = []
      primaryKey = []
      foreignKeys = []
      rows = []
      _infiniteRows = []
      total = 0
      recordActivity({ type: 'row_fetch', title: `Failed to load ${activeTable}`, schema: activeSchema, table: activeTable ?? undefined, success: false, error: String(e) })
    } finally {
      if (seq === _loadSeq) loadingRows = false
    }
  }

  async function handleLoadMore() {
    if (!infiniteScroll || !activeTable || loadingRows || loadingMore) return
    if (_infiniteRows.length >= total) return
    loadingMore = true
    try {
      const offset = _infiniteRows.length
      const { sortColumn, sortDirection } = sortForApi(rowSort)
      const data = await getTableRows(activeSchema, activeTable, effectivePageSize, offset, {
        search: rowSearch,
        sortColumn,
        sortDirection,
        filters: filtersForApi(rowFilters, columns),
      })
      const fetched = data.rows ?? []
      if (!fetched.length) return
      _infiniteRows = [..._infiniteRows, ...fetched]
      rows = _infiniteRows
      total = Number(data.total ?? total)
    } catch (e) {
      error = String(e)
    } finally {
      loadingMore = false
    }
  }

  function toggleInfiniteScroll() {
    infiniteScroll = !infiniteScroll
    try { localStorage.setItem('stroke:infiniteScroll', infiniteScroll ? '1' : '0') } catch {}
    if (infiniteScroll) {
      // reset to page 1 with current pageSize so infinite starts from the top
      page = 1; rawOffset = null
      void loadRows()
    } else {
      // switching off: go back to normal page view (already on page 1)
      void loadRows()
    }
  }

/**
   * Whether two column lists describe the same shape (name + type, in order).
   * Used to preserve the array reference across page fetches of the same table.
   * @param {any[]} a @param {any[]} b
   */
  function sameColumnShape(a, b) {
    if (a === b) return true
    if (!a || !b || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i]?.name !== b[i]?.name) return false
      if ((a[i]?.dataType ?? a[i]?.data_type) !== (b[i]?.dataType ?? b[i]?.data_type)) return false
    }
    return true
  }

  /** @param {'csv' | 'json'} format */
  async function handleExport(format) {
    const exportRows = selected.size > 0
      ? [...selected].sort((a, b) => a - b).map((i) => rows[i]).filter(Boolean)
      : rows
    const content = format === 'csv' ? rowsToCsv(columns, exportRows) : rowsToJson(columns, exportRows)
    const filename = buildExportFilename(activeTable, format)
    await saveExportFile(content, filename, format)
    recordActivity({ type: 'export', title: `Exported ${activeTable} as ${format.toUpperCase()}`, schema: activeSchema, table: activeTable ?? undefined, rowCount: exportRows.length, success: true, detail: filename })
  }

  async function runSql() {
    if (!connection || !sqlText.trim()) return
    sqlLoading = true
    sqlError = ''
    sqlMessage = ''
    sqlColumns = []
    sqlRows = []
    sqlMultiResults = []
    const sqlRan = sqlText
    try {
      const results = await executeSqlMulti(sqlRan)
      sqlMultiResults = results.length > 1 ? results : []
      const data = results.length > 0 ? results[results.length - 1] : {}
      sqlColumns = data.columns ?? []
      sqlRows = data.rows ?? []
      sqlQueryMs = data.query_ms ?? data.queryMs ?? 0
      sqlMessage = data.message ?? ''
      if (!sqlMessage && data.row_count != null && sqlColumns.length === 0) {
        sqlMessage = `${formatCompactCount(data.row_count)} row(s) affected`
      }
    } catch (e) {
      sqlError = String(e)
      sqlMultiResults = []
    } finally {
      sqlLoading = false
      recordActivity({ type: 'sql_exec', title: sqlRan.trim().slice(0, 80) + (sqlRan.trim().length > 80 ? '…' : ''), detail: sqlRan, durationMs: sqlQueryMs, rowCount: sqlRows.length || undefined, success: !sqlError, error: sqlError || undefined })
      if (persistConnectionId && !sqlError) {
        await recordQueryExecution(persistConnectionId, sqlRan, {
          success: true,
          queryMs: sqlQueryMs,
        })
        await refreshQueryStores()
      }
    }
  }

  async function onConnected(conn, savedId) {
    recordActivity({ type: 'connect', title: `Connected to ${conn.name ?? conn.database ?? conn.filePath ?? 'database'}`, success: true })
    connection = conn
    savedConnections = loadSavedConnections()
    // Persist last-used ID and bump timestamp
    if (savedId) {
      setLastConnectionId(savedId)
      upsertConnection({ ...conn, id: savedId, lastConnectedAt: Date.now() })
    }
    tableFilter = ''
    error = ''
    activeTable = null
    tables = []
    schemas = []
    activeSchema = 'public'
    // Retry loop — backend may not be fully ready immediately after connect
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 700))
      await loadSchemas()
      if (schemas.length > 0) break
    }
    await loadTables()
    // If tables came back empty despite a valid schema, give the backend one more chance
    if (tables.length === 0 && schemas.length > 0) {
      await new Promise(r => setTimeout(r, 1000))
      await loadTables()
    }
    tabs = []
    openWelcomeTab()
    await refreshQueryStores()
    try {
      const { loadSettings } = await import('$lib/stores/settings.js')
      if (loadSettings().mcpAutoStart) {
        const s = await mcpStart()
        mcpRunning = s.running
      }
    } catch { /* ignore */ }
  }

  onMount(() => installInputShortcuts())

  onMount(async () => {
    // Seed the sample SQLite database once on first launch (any install, any user).
    // Uses a sentinel key so re-seeding is skipped if the user later deletes the connection.
    try {
      if (!localStorage.getItem(SAMPLE_SEEDED_KEY)) {
        const filePath = await initSampleDb()
        upsertConnection({ id: SAMPLE_DB_ID, type: 'sqlite', name: 'Sample Database', filePath })
        savedConnections = loadSavedConnections()
        localStorage.setItem(SAMPLE_SEEDED_KEY, '1')
      }
    } catch {
      // Non-critical — don't block app start if Tauri backend unavailable (browser dev)
    }

    // First-time user — show onboarding instead of bare connection modal
    try {
      if (!localStorage.getItem(ONBOARDING_KEY)) {
        showOnboarding = true
        return
      }
    } catch {}

    const last = getLastConnection()
    if (!last) { showConnectionModal = true; return }
    autoConnecting = true
    try {
      if (last.type === 'sqlite') await connectSqlite(last)
      else if (last.type === 'd1') await connectD1(last)
      else if (last.type === 'libsql') await connectLibSql(last)
      else if (last.type === 'mysql' || last.type === 'mariadb') await connectMysql(last)
      else if (last.type === 'clickhouse') await connectClickhouse(last)
      else if (last.type === 'duckdb') await connectDuckdb(last)
      else if (last.type === 'mssql') await connectMssql(last)
      else await connectPostgres(last)
      await onConnected(last, last.id)
      await refreshQueryStores()
    } catch {
      showConnectionModal = true
    } finally {
      autoConnecting = false
    }
  })

  async function handleSchemaChange(schema) {
    if (!schema || schema === activeSchema) return
    activeSchema = schema
    activeTable = null
    page = 1
    tableFilter = ''
    columns = []
    rows = []
    await loadTables()
    if (activeTab?.kind === 'table') {
      if (tables.length) {
        activeTable = tables[0].name
        await loadRows()
      } else {
        saveActiveTabState()
      }
    }
  }

  async function handleTableSelect(name) {
    recordActivity({ type: 'table_open', title: `Opened ${name}`, schema: activeSchema, table: name, success: true })
    await openTableTab(activeSchema, name)
  }

  function enterAiMode() {
    if (!connection) return
    aiMode = true
    saveAiMode(true)
  }

  function exitAiMode() {
    aiMode = false
    saveAiMode(false)
  }

  function requestDisconnect() {
    showDisconnectDialog = true
  }

  /** Reset all connection-scoped UI state to blank. */
  function clearConnectionState() {
    schemas = []
    tables = []
    indexes = []
    enums = []
    triggers = []
    sequences = []
    activeSchema = 'public'
    activeTable = null
    tableFilter = ''
    tableViewMode = 'data'
    structureColumns = []
    structureSearch = ''
    loadingStructure = false
    recentTabs = []
    resetTabs()
  }

  async function handleDisconnect() {
    recordActivity({ type: 'disconnect', title: `Disconnected from ${connection?.name ?? 'database'}`, success: true })
    try { await disconnectPostgres() } catch { /* ignore */ }
    try { await mcpStop() } catch { /* ignore */ }
    mcpRunning = false
    connection = null
    clearConnectionState()
    showConnectionModal = true
  }

  /** @param {{ db_type: string, host: string, port: number, user: string, password: string, database: string, name: string }} info */
  async function handleDockerConnect(info) {
    const conn = /** @type {import('$lib/stores/connections.js').SavedConnection} */ ({
      id: crypto.randomUUID(),
      type: info.db_type === 'mysql' ? 'mysql' : 'postgres',
      name: info.name,
      host: info.host,
      port: info.port,
      user: info.user,
      password: info.password,
      database: info.database,
      ssl: false,
    })
    upsertConnection(conn)
    await disconnectPostgres().catch(() => {})
    connection = null
    clearConnectionState()
    autoConnecting = true
    try {
      if (conn.type === 'mysql' || conn.type === 'mariadb') await connectMysql(conn)
      else await connectPostgres(conn)
      await onConnected(conn, conn.id)
      showDockerModal = false
    } catch (e) {
      error = String(e)
      showDockerModal = false
      showConnectionModal = true
    } finally {
      autoConnecting = false
    }
  }

  async function handleSampleConnect() {
    await disconnectPostgres().catch(() => {})
    connection = null
    clearConnectionState()
    autoConnecting = true
    try {
      const filePath = await initSampleDb()
      const sample = /** @type {import('$lib/stores/connections.js').SavedConnection} */ ({
        id: SAMPLE_DB_ID, type: 'sqlite', name: 'Sample Database', filePath,
      })
      upsertConnection(sample)
      savedConnections = loadSavedConnections()
      localStorage.setItem(SAMPLE_SEEDED_KEY, '1')
      await connectSqlite(sample)
      await onConnected(sample, sample.id)
    } catch (e) {
      error = String(e)
      showConnectionModal = true
    } finally {
      autoConnecting = false
    }
  }

  /** @param {import('$lib/stores/connections.js').SavedConnection} conn */
  async function handleSwitchDatabase(conn) {
    // Disconnect current before connecting to the new one to avoid the race
    // where set_conn(None) could fire after connect_* sets the new connection.
    await disconnectPostgres().catch(() => {})
    connection = null
    clearConnectionState()
    // Connect to the chosen saved connection
    autoConnecting = true
    try {
      const { connectPostgres, connectSqlite, connectD1, connectLibSql, connectMysql, connectClickhouse, connectDuckdb, connectMssql } = await import('$lib/api.js')
      if (conn.type === 'sqlite') await connectSqlite(conn)
      else if (conn.type === 'd1') await connectD1(conn)
      else if (conn.type === 'libsql') await connectLibSql(conn)
      else if (conn.type === 'mysql' || conn.type === 'mariadb') await connectMysql(conn)
      else if (conn.type === 'clickhouse') await connectClickhouse(conn)
      else if (conn.type === 'duckdb') await connectDuckdb(conn)
      else if (conn.type === 'mssql') await connectMssql(conn)
      else await connectPostgres(conn)
      await onConnected(conn, conn.id)
    } catch (e) {
      error = String(e)
      showConnectionModal = true
    } finally {
      autoConnecting = false
    }
  }

  async function handleRefresh() {
    await loadSchemas()
    await loadTables()
    if (activeTab?.kind === 'table' && activeTable) {
      await loadRows()
    }
  }

  /** @param {string} tableName */
  async function handleTruncateTable(tableName) {
    try {
      await truncateTable(activeSchema, tableName)
      toast.success(`Truncated "${tableName}"`)
      if (activeTable === tableName) await loadRows()
    } catch (err) {
      toast.error('Truncate failed', { description: String(err) })
    }
  }

  /**
   * @param {string} tableName
   * @param {boolean} [cascade]
   */
  async function handleDropTable(tableName, cascade = false) {
    try {
      await dropTable(activeSchema, tableName, cascade)
      toast.success(`Dropped table "${tableName}"`)
      await loadTables()
      if (activeTable === tableName) {
        activeTable = null
      }
    } catch (err) {
      toast.error('Drop failed', { description: String(err) })
    }
  }

  /** @param {string} tableName */
  async function handleViewDdl(tableName) {
    try {
      const ddl = await getTableDdl(activeSchema, tableName)
      ddlDialogTable = tableName
      ddlDialogSql = ddl
      ddlDialogOpen = true
    } catch (e) {
      toast.error('Could not load DDL', { description: String(e) })
    }
  }

  /** @param {string} tableName */
  async function handleExportSql(tableName) {
    try {
      toast.info('Preparing SQL export…')
      const [ddl, result] = await Promise.all([
        getTableDdl(activeSchema, tableName),
        getTableRows(activeSchema, tableName, 100000, 0),
      ])
      const cols = result.columns ?? []
      const rows = result.rows ?? []

      const inserts = rows.map((row) => {
        const vals = cols.map((col, i) => {
          const v = row[i]
          if (v === null || v === undefined) return 'NULL'
          if (typeof v === 'number' || typeof v === 'boolean') return String(v)
          if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`
          return `'${String(v).replace(/'/g, "''")}'`
        })
        return `INSERT INTO "${tableName}" (${cols.map((c) => `"${c.name}"`).join(', ')}) VALUES (${vals.join(', ')});`
      }).join('\n')

      const sql = inserts.length ? `${ddl}\n\n${inserts}` : ddl
      const filename = `${tableName}_${new Date().toISOString().slice(0, 10)}.sql`
      await saveExportFile(sql, filename, 'sql')
    } catch (e) {
      toast.error('Export failed', { description: String(e) })
    }
  }

  /** @param {string} tableName */
  async function handleExportData(tableName) {
    try {
      toast.info('Preparing CSV export…')
      const result = await getTableRows(activeSchema, tableName, 100000, 0)
      const cols = result.columns ?? []
      const rows = result.rows ?? []
      const csv = rowsToCsv(cols, rows)
      const filename = buildExportFilename(tableName, 'csv')
      await saveExportFile(csv, filename, 'csv')
    } catch (e) {
      toast.error('Export failed', { description: String(e) })
    }
  }

  /** @param {string} tableName */
  async function handleGenerateTestData(tableName) {
    try {
      const cols = await getTableColumnStructure(activeSchema, tableName)
      const colNames = cols.map((c) => `"${c.name}"`).join(',\n  ')
      const colPlaceholders = cols.map((c) => {
        const t = (c.dataType ?? c.data_type ?? '').toLowerCase()
        if (t.includes('int') || t.includes('serial')) return '0'
        if (t.includes('bool')) return 'true'
        if (t.includes('date') || t.includes('timestamp')) return `'${new Date().toISOString().slice(0, 10)}'`
        if (t.includes('numeric') || t.includes('float') || t.includes('double') || t.includes('decimal')) return '0.0'
        return `'sample_${c.name}'`
      }).join(',\n  ')
      const sql = `-- Generated test data template for ${tableName}\nINSERT INTO "${tableName}" (\n  ${colNames}\n) VALUES (\n  ${colPlaceholders}\n);`
      await openQueryInEditor(sql)
    } catch (e) {
      toast.error('Could not generate test data', { description: String(e) })
    }
  }

  /** @param {number} rowIdx */
  function primaryKeyForRow(rowIdx) {
    const row = rows[rowIdx]
    if (!row) return null

    /** @type {Record<string, unknown>} */
    const pk = {}
    for (const key of primaryKey) {
      const keyIdx = columns.findIndex((c) => c.name === key)
      if (keyIdx < 0) throw new Error(`Primary key column not found: ${key}`)
      pk[key] = row[keyIdx]
    }
    return pk
  }

  /** @param {number[]} rowIndices */
  async function handleDeleteRows(rowIndices) {
    if (!activeTable || !primaryKey.length || rowIndices.length === 0) return

    const removed = [...new Set(rowIndices)].sort((a, b) => a - b)
    const primaryKeys = removed
      .map((idx) => primaryKeyForRow(idx))
      .filter((pk) => pk !== null)

    if (primaryKeys.length === 0) return

    deletingRows = true
    const _deleteStart = Date.now()
    try {
      const deleted = await deleteTableRows(activeSchema, activeTable, primaryKeys)
      if (deleted === 0) {
        throw new Error('No rows deleted (they may have changed)')
      }
      recordActivity({ type: 'row_delete', title: `Deleted ${deleted} row${deleted === 1 ? '' : 's'} from ${activeTable}`, schema: activeSchema, table: activeTable, rowCount: deleted, durationMs: Date.now() - _deleteStart, success: true })

      const removedSet = new Set(removed)
      rows = rows.filter((_, i) => !removedSet.has(i))
      total = Math.max(0, total - deleted)

      selected = remapRowIndexSet(selected, removed)
      focusedRow = remapNullableRowIndex(focusedRow, removed)
      inspectorRow = remapNullableRowIndex(inspectorRow, removed)

      if (editingCell && removedSet.has(editingCell.rowIdx)) {
        editingCell = null
      } else if (editingCell) {
        editingCell = {
          ...editingCell,
          rowIdx: remapNullableRowIndex(editingCell.rowIdx, removed) ?? editingCell.rowIdx,
        }
      }

      saveActiveTabState()
    } finally {
      deletingRows = false
    }
  }

  /** @param {{ rowIndices: number[] }} detail */
  async function handleDeleteRow(detail) {
    await handleDeleteRows(detail.rowIndices)
  }

  async function deleteSelectedRows() {
    if (selected.size === 0) return
    const n = selected.size
    try {
      await handleDeleteRows([...selected])
      toast.success(n === 1 ? 'Row deleted' : `${formatCompactCount(n)} rows deleted`)
    } catch (err) {
      toast.error('Delete failed', { description: String(err) })
    }
  }

  /** @param {Record<string, unknown>} values */
  async function handleInsertRow(values) {
    if (!activeTable) return

    insertingRow = true
    const _insertStart = Date.now()
    try {
      const { row } = await insertTableRow(activeSchema, activeTable, values)
      recordActivity({ type: 'row_insert', title: `Inserted row into ${activeTable}`, schema: activeSchema, table: activeTable, durationMs: Date.now() - _insertStart, success: true })

      const hasActiveFilters =
        rowSearch.trim() !== '' || activeFilters(rowFilters).length > 0

      if (!hasActiveFilters && page === 1) {
        rows = [row, ...rows]
        if (rows.length > effectivePageSize) {
          rows = rows.slice(0, effectivePageSize)
        }
        total += 1
        saveActiveTabState()
        toast.success('Row inserted')
      } else {
        await loadRows()
        toast.success('Row inserted', {
          description: hasActiveFilters
            ? 'Refresh filters or go to page 1 if the row is not visible'
            : undefined,
        })
      }
    } catch (err) {
      toast.error('Insert failed', { description: String(err) })
    } finally {
      insertingRow = false
    }
  }

  /** @param {{ rowIdx: number, colIdx: number, value: unknown }} detail */
  async function handleSaveCell(detail) {
    if (!activeTable || !primaryKey.length) return

    const col = columns[detail.colIdx]
    if (!col) return

    const row = rows[detail.rowIdx]
    if (!row) return

    /** @type {Record<string, unknown>} */
    const pk = {}
    for (const key of primaryKey) {
      const keyIdx = columns.findIndex((c) => c.name === key)
      if (keyIdx < 0) throw new Error(`Primary key column not found: ${key}`)
      pk[key] = row[keyIdx]
    }

    savingCell = true
    const _saveStart = Date.now()
    try {
      await updateTableCell(activeSchema, activeTable, pk, col.name, detail.value)
      rows[detail.rowIdx] = rows[detail.rowIdx].map(
        (cell, j) => (j === detail.colIdx ? detail.value : cell),
      )
      saveActiveTabState()
      recordActivity({ type: 'row_save', title: `Updated ${col.name} in ${activeTable}`, schema: activeSchema, table: activeTable, durationMs: Date.now() - _saveStart, success: true })
    } catch (e) {
      recordActivity({ type: 'row_save', title: `Failed to update ${col.name} in ${activeTable}`, schema: activeSchema, table: activeTable, success: false, error: String(e) })
      throw e
    } finally {
      savingCell = false
    }
  }

  /** Write SQL into the SQL editor and focus it. */
  /** @param {string} sql */
  async function openQueryInEditor(sql) {
    await focusSqlView()
    sqlText = sql
  }

  async function openQueryHistory() {
    await focusSqlView()
    queryHistoryVisible = true
  }

  /** @param {string} name @param {string} sql */
  async function handleSaveQuery(name, sql) {
    if (!persistConnectionId) return
    await createSavedQuery(persistConnectionId, name, sql)
    await refreshQueryStores()
    toast.success('Query saved')
  }

  async function handleAiWriteSql(sql) {
    await openQueryInEditor(sql)
  }

  /** Run SQL from AI chat — writes to editor and executes. */
  async function handleAiRunSql(sql) {
    await focusSqlView()
    sqlText = sql
    await runSql()
  }

  async function focusSqlView() {
    const existing = findSqlTab(tabs)
    if (existing) {
      await activateTab(existing.id)
      return
    }
    openSqlTab()
  }

  async function focusDataView() {
    if (activeTab?.kind === 'table') return
    if (activeTable) {
      const existing = findTableTab(tabs, activeSchema, activeTable)
      if (existing) {
        await activateTab(existing.id)
        return
      }
      await openTableTab(activeSchema, activeTable)
      return
    }
    const tableTab = findLastTableTab(tabs)
    if (tableTab) {
      await activateTab(tableTab.id)
      return
    }
    if (activeTab?.kind === 'sql') {
      openWelcomeTab()
    }
  }

  /** @param {'table' | 'sql'} view */
  async function handleSidebarViewChange(view) {
    if (view === 'sql') {
      await focusSqlView()
      return
    }
    await focusDataView()
  }
</script>

<Onboarding bind:open={showOnboarding} onconnect={() => (showConnectionModal = true)} onsample={handleSampleConnect} />
<ConnectionModal bind:open={showConnectionModal} onconnected={(conn, id) => onConnected(conn, id)} />
<DisconnectDialog bind:open={showDisconnectDialog} connectionName={connection ? (connection.name || connection.database || connection.host || connection.filePath || 'Connected') : ''} ondisconnect={handleDisconnect} />
<CreateTableDialog
  bind:open={showCreateTableDialog}
  {activeSchema}
  dbType={dbType}
  onexecute={async (sql) => { await executeSql(sql) }}
  oncreated={async () => { await loadTables() }}
/>
<CreateSchemaDialog
  bind:open={showCreateSchemaDialog}
  existingSchemas={schemas}
  onexecute={async (sql) => {
    try { await executeDdl(sql) }
    catch (e) { toast.error(String(e)); throw e }
  }}
  oncreated={async (schemaName) => {
    toast.success(`Schema "${schemaName}" created`)
    await loadSchemas()
    await handleSchemaChange(schemaName)
  }}
/>
<DockerLaunchModal
  bind:open={showDockerModal}
  initialDbType={dockerInitialDb}
  onconnect={handleDockerConnect}
/>

<McpPanel bind:open={showMcpPanel} connected={!!connection} />

<SettingsDialog
  bind:open={showSettingsModal}
  onopenmcp={() => (showMcpPanel = true)}
  onopenmodelconfiguration={() => (showAiModelSettings = true)}
  onopenabout={() => (showAboutModal = true)}
  onopenextensions={() => openExtensionsTab()}
/>

<AiSettingsDialog bind:open={showAiModelSettings} />

<KeyboardShortcutsDialog bind:open={showShortcutsModal} />

<DdlDialog bind:open={ddlDialogOpen} tableName={ddlDialogTable} ddl={ddlDialogSql} />

<InsiderDialog bind:open={showInsiderModal} />

<AboutDialog bind:open={showAboutModal} onopenreport={() => (showReportIssueDialog = true)} />
<ReportIssueDialog bind:open={showReportIssueDialog} />

<UpdateDialog bind:this={updateDialog} onupdatefound={() => (statusBarHasUpdate = true)} />


<CommandPalette
  bind:open={commandOpen}
  bind:page={commandPage}
  connected={!!connection}
  {schemas}
  {tables}
  {activeSchema}
  {savedConnections}
  {activeConnectionId}
  ontableselect={(name) => { if (aiMode) exitAiMode(); void handleTableSelect(name) }}
  onschemachange={(schema) => { if (aiMode) exitAiMode(); handleSchemaChange(schema) }}
  onopensql={() => { if (aiMode) exitAiMode(); void focusSqlView() }}
  onopentable={() => { if (aiMode) exitAiMode(); void focusDataView() }}
  onopensettings={() => (showSettingsModal = true)}
  onopenconnection={() => (showConnectionModal = true)}
  ondisconnect={requestDisconnect}
  onrefresh={handleRefresh}
  onopenai={() => openAiTab()}
  onopenaisidebar={() => { if (aiMode) exitAiMode(); toggleAiSidebar() }}
  {aiMode}
  ontoggleaimode={() => aiMode ? exitAiMode() : enterAiMode()}
  onopenorm={() => { if (aiMode) exitAiMode(); openOrmTab() }}
  onopenerd={() => { if (aiMode) exitAiMode(); openErdTab() }}
  onopenbackup={() => { if (aiMode) exitAiMode(); openBackupTab() }}
  onopenSchema={() => { if (aiMode) exitAiMode(); openSchemaTab() }}
  onopensecurity={() => { if (aiMode) exitAiMode(); openSecurityTab() }}
  onopenlogs={() => { if (aiMode) exitAiMode(); openLogsTab() }}
  onopenextensions={() => { if (aiMode) exitAiMode(); openExtensionsTab() }}
  {hasSchemaExplorer}
  {hasSecurity}
  onopenJsonViewer={() => { if (aiMode) exitAiMode(); openJsonTab() }}
  onopenshortcuts={() => (showShortcutsModal = true)}
  onopenabout={() => (showAboutModal = true)}
  onopenreport={() => (showReportIssueDialog = true)}
  oncheckupdate={() => void updateDialog?.checkNow()}
  ondockerlaunch={(dbType) => { commandOpen = false; dockerInitialDb = dbType; showDockerModal = true }}
  onswitchdatabase={handleSwitchDatabase}
  {queryHistory}
  {savedQueries}
  onqueryselect={(sql) => { if (aiMode) exitAiMode(); void openQueryInEditor(sql) }}
  onopenqueryhistory={() => { if (aiMode) exitAiMode(); void openQueryHistory() }}
  onglobalsearch={() => { commandOpen = false; openSearchTab() }}
  onopennotebook={() => { commandOpen = false; openNewNotebookTab() }}
  onopennotebookfile={() => { commandOpen = false; void openNotebookFromFile() }}
  openschematimeline={() => { commandOpen = false; openSchemaTimelineTab() }}
  opendatadiff={() => { commandOpen = false; openDataDiffTab() }}
/>


{#if autoConnecting}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-background/90">
    <div class="flex flex-col items-center gap-3 text-muted-foreground">
      <span class="inline-flex gap-1">
        <span class="size-2 animate-bounce rounded-full bg-muted-foreground" style="animation-delay:0ms"></span>
        <span class="size-2 animate-bounce rounded-full bg-muted-foreground" style="animation-delay:150ms"></span>
        <span class="size-2 animate-bounce rounded-full bg-muted-foreground" style="animation-delay:300ms"></span>
      </span>
      <p class="text-sm">Reconnecting…</p>
    </div>
  </div>
{/if}


<div class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
<TitleBar
  title={connection?.database ?? connection?.filePath ?? connection?.name ?? 'studio'}
  {sidebarOpen}
  connected={!!connection}
  {aiMode}
  {aiSidebarOpen}
  {canGoBack}
  {canGoForward}
  ontogglesidebar={toggleSidebar}
  ontoggleaimode={() => { if (aiMode) exitAiMode(); else openAiTab() }}
  ontoggleaisidebar={() => { if (aiMode) exitAiMode(); toggleAiSidebar() }}
  ongoback={() => void navBack()}
  ongoforward={() => void navForward()}
/>
<div class="flex min-h-0 flex-1 overflow-hidden">
  {#if sidebarEverOpened}
    <div
      style={sidebarOpen && !aiMode && connection ? '' : 'display:none'}
      inert={!sidebarOpen || aiMode || !connection || undefined}
    >
      <Sidebar
        connectionName={connection ? (connection.name || connection.database || connection.host || connection.filePath || 'Connected') : ''}
        {schemas}
        {tables}
        bind:activeSchema
        {activeTable}
        {activeView}
        {tableFilter}
        {loadingTables}
        onschemachange={handleSchemaChange}
        ontableselect={handleTableSelect}
        ontablefilter={(v) => (tableFilter = v)}
        onviewchange={handleSidebarViewChange}
        onrefresh={handleRefresh}
        ondisconnect={requestDisconnect}
        onopensettings={() => (showSettingsModal = true)}
        onopencommand={() => (commandOpen = true)}
        onopenSchema={openSchemaTab}
        onopenorm={openOrmTab}
        onopenbackup={openBackupTab}
        onopendashboard={() => { if (aiMode) exitAiMode(); openDashboardTab() }}
        onopenerd={() => { if (aiMode) exitAiMode(); openErdTab() }}
              {aiMode}
        onopenaimode={() => (aiMode ? exitAiMode() : enterAiMode())}
        {queryHistory}
        onqueryselect={(sql) => { if (aiMode) exitAiMode(); void openQueryInEditor(sql) }}
        onopensecurity={() => { if (aiMode) exitAiMode(); openSecurityTab() }}
        onopenlogs={() => { if (aiMode) exitAiMode(); openLogsTab() }}
        onopenextensions={() => { if (aiMode) exitAiMode(); openExtensionsTab() }}
        {connection}
        onswitchtodb={(dbName) => {
          if (!connection) return
          void handleSwitchDatabase({ ...connection, database: dbName, name: `${connection.host ?? connection.name}/${dbName}` })
        }}
        onnewtable={() => (showCreateTableDialog = true)}
        onnewschema={() => (showCreateSchemaDialog = true)}
        ontruncatetable={handleTruncateTable}
        ondroptable={(t, c) => void handleDropTable(t, c)}
        onviewddl={(t) => void handleViewDdl(t)}
        onexportsql={(t) => void handleExportSql(t)}
        onexportdata={(t) => void handleExportData(t)}
        ongeneratetestdata={(t) => void handleGenerateTestData(t)}
        openTables={tabs.filter((t) => t.kind === 'table' && t.state && /** @type {any} */ (t.state).schema === activeSchema).map((t) => /** @type {any} */ (t.state).table)}
        onclosetable={(name) => {
          const tab = findTableTab(tabs, activeSchema, name)
          if (tab) void closeTab(tab.id)
        }}
        {recentTabs}
        onrecentselect={(schema, table) => { if (aiMode) exitAiMode(); void openTableTab(schema, table) }}
        onrecentremove={(schema, table) => {
          if (persistConnectionId) {
            removeRecentTab(persistConnectionId, schema, table)
            refreshRecentTabs()
          }
        }}
        onrecentclear={() => {
          if (persistConnectionId) {
            clearRecentTabs(persistConnectionId)
            refreshRecentTabs()
          }
        }}
      />
    </div>
  {/if}

  <main class="flex min-h-0 min-w-0 flex-1 flex-col bg-panel" data-studio-region="main">
    {#if !connection}
      <div class="relative flex flex-1 flex-col items-center justify-center gap-8 p-8 text-center">
        <!-- Subtle vignette — kept faint for a flat, crisp surface -->
        <div
          class="pointer-events-none absolute inset-0"
          style="background: radial-gradient(58% 48% at 50% 36%, color-mix(in oklch, var(--primary) 7%, transparent), transparent 72%);"
        ></div>

        <!-- Brand mark -->
        <div class="relative flex size-[72px] items-center justify-center rounded-[20px] border border-border/60 bg-card ring-1 ring-inset ring-white/[0.04] shadow-[0_10px_30px_-14px_rgba(0,0,0,0.7)]">
          <Logo class="size-9" />
        </div>

        <div class="relative flex max-w-md flex-col items-center gap-2.5">
          <h1 class="text-[1.7rem] font-bold leading-tight tracking-tight text-foreground">Connect a database</h1>
          <p class="max-w-[21rem] text-[0.95rem] leading-relaxed text-muted-foreground">
            Browse schemas, edit rows, and run SQL — all in one fast, native window.
          </p>
        </div>

        <!-- Supported engines -->
        <div class="relative flex flex-wrap items-center justify-center gap-2">
          {#each ['PostgreSQL', 'MySQL', 'SQLite', 'Cloudflare D1'] as engine}
            <span class="rounded-full border border-border/50 bg-muted/20 px-3 py-1.5 text-ui-xs font-medium text-muted-foreground/80">
              {engine}
            </span>
          {/each}
        </div>

        <div class="relative flex flex-col items-center gap-4 pt-1">
          <Button
            type="button"
            class="h-10 rounded-xl px-5 text-sm font-semibold shadow-sm"
            onclick={() => (showConnectionModal = true)}
          >
            <Plus class="size-4" />
            Add connection
          </Button>
          <p class="flex items-center gap-1.5 text-ui-xs text-muted-foreground/70">
            or press
            <kbd class="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md border border-border/60 bg-muted/40 px-1.5 font-mono text-[10px] leading-none text-muted-foreground">⌘K</kbd>
            for the command menu
          </p>
        </div>
      </div>
    {:else}
      <!-- Full-window AI chat — kept mounted after first open so state is preserved -->
      {#if aiEverOpened}
        <div
          class={aiMode ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          inert={!aiMode}
        >
          {#await import('./AiChat.svelte')}<TabLoading />{:then { default: AiChat }}
            <AiChat
              schemaContext={{ ...aiSchemaContext, activeTable: null, columns: [], primaryKey: [], foreignKeys: [] }}
              {connectionId}
              isActive={aiMode}
              mode="full"
              onexit={exitAiMode}
              onwritesql={(sql) => void handleAiWriteSql(sql)}
              onopenmodelsettings={() => (showAiModelSettings = true)}
              onopendiagramspage={() => { exitAiMode(); openDiagramsTab() }}
            />
          {/await}
        </div>
      {/if}

      {#if aiMode}
        <!-- AI mode: tabs + content hidden above via always-mounted block -->
      {:else}

      <TabBar
        tabs={tabs.filter((t) => t.kind !== 'ai')}
        {activeTabId}
        onselect={(id) => activateTab(id)}
        onclose={closeTab}
        oncloseothers={closeOtherTabs}
        oncloseall={closeAllTabs}
        onnew={openWelcomeTab}
        {recentTabs}
        onrecentselect={(schema, table) => { if (aiMode) exitAiMode(); void openTableTab(schema, table) }}
      />

      {#snippet tabError(/** @type {unknown} */ error, /** @type {() => void} */ reset)}
        <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <AlertTriangle class="size-8 text-destructive/60" />
          <div class="flex flex-col gap-1">
            <p class="text-ui-sm font-medium text-foreground">This view hit an error</p>
            <p class="max-w-md break-words font-mono text-ui-xs text-muted-foreground">
              {error instanceof Error ? error.message : String(error)}
            </p>
          </div>
          <button
            type="button"
            class="rounded-md border border-border bg-muted/40 px-3 py-1.5 text-ui-xs font-medium transition-colors hover:bg-accent hover:text-foreground"
            onclick={reset}
          >
            Reload this view
          </button>
        </div>
      {/snippet}

      {#if activeTab?.kind === 'ai'}
        <!-- AI is handled via AI mode toggle -->
      {:else if activeTab?.kind === 'schema'}
        <svelte:boundary failed={tabError}>
          <SchemaPage
            schema={activeSchema}
            {indexes}
            {enums}
            {triggers}
            {sequences}
            {tables}
            loading={loadingTables}
            active={activeTab?.kind === 'schema'}
            onrefresh={async () => { await loadSchemas(); await loadTables() }}
          />
        </svelte:boundary>
      {/if}

      <!-- Security tab - mount once, keep alive -->
      {#if securityEverOpened}
        <div
          class={activeTab?.kind === 'security' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          inert={activeTab?.kind !== 'security' || undefined}
        >
          <svelte:boundary failed={tabError}>
            {#await import('./SecurityPage.svelte')}<TabLoading />{:then { default: SecurityPage }}
              <SecurityPage bind:this={securityPageRef} active={activeTab?.kind === 'security'} />
            {/await}
          </svelte:boundary>
        </div>
      {/if}

      <!-- Backup tab -->
      {#if backupEverOpened}
        <div
          class={activeTab?.kind === 'backup' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          inert={activeTab?.kind !== 'backup' || undefined}
        >
          <svelte:boundary failed={tabError}>
            <BackupPage dbType={dbType} activeSchema={activeSchema} {schemas} tables={tables.map((t) => ({ name: t.name, rowCount: t.rowCount }))} />
          </svelte:boundary>
        </div>
      {/if}

      <!-- Logs tab - mount once, keep alive -->
      {#if logsEverOpened}
        <div
          class={activeTab?.kind === 'logs' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          inert={activeTab?.kind !== 'logs' || undefined}
        >
          <svelte:boundary failed={tabError}>
            <LogsPage active={activeTab?.kind === 'logs'} />
          </svelte:boundary>
        </div>
      {/if}

      <!-- Extensions tab - mount once, keep alive -->
      {#if extensionsEverOpened}
        <div
          class={activeTab?.kind === 'extensions' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          inert={activeTab?.kind !== 'extensions' || undefined}
        >
          <svelte:boundary failed={tabError}>
            {#await import('./ExtensionsPage.svelte')}<TabLoading />{:then { default: ExtensionsPage }}
              <ExtensionsPage />
            {/await}
          </svelte:boundary>
        </div>
      {/if}

      <!-- JSON Viewer tab - mount once, keep alive -->
      {#if jsonEverOpened}
        <div
          class={activeTab?.kind === 'json' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          inert={activeTab?.kind !== 'json' || undefined}
        >
          <svelte:boundary failed={tabError}>
            {#await import('./JsonViewerPage.svelte')}<TabLoading />{:then { default: JsonViewerPage }}
              <JsonViewerPage active={activeTab?.kind === 'json'} />
            {/await}
          </svelte:boundary>
        </div>
      {/if}

      <!-- Charts tab - mount once, keep alive -->
      {#if chartsEverOpened}
        <div
          class={activeTab?.kind === 'charts' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          inert={activeTab?.kind !== 'charts' || undefined}
        >
          <svelte:boundary failed={tabError}>
            {#await import('./ChartsPage.svelte')}<TabLoading />{:then { default: ChartsPage }}
              <ChartsPage
                {connection}
                onrunsql={(sql) => { if (aiMode) exitAiMode(); void openQueryInEditor(sql) }}
              />
            {/await}
          </svelte:boundary>
        </div>
      {/if}

      <!-- Diagrams tab - mount once, keep alive -->
      {#if diagramsEverOpened}
        <div
          class={activeTab?.kind === 'diagrams' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          inert={activeTab?.kind !== 'diagrams' || undefined}
        >
          <svelte:boundary failed={tabError}>
            {#await import('./DiagramsPage.svelte')}<TabLoading />{:then { default: DiagramsPage }}
              <DiagramsPage {connection} />
            {/await}
          </svelte:boundary>
        </div>
      {/if}

      <!-- Dashboard tab - mount once, keep alive -->
      {#if dashboardEverOpened}
        <div
          class={activeTab?.kind === 'dashboard' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          inert={activeTab?.kind !== 'dashboard' || undefined}
        >
          <svelte:boundary failed={tabError}>
            {#await import('./DashboardPage.svelte')}<TabLoading />{:then { default: DashboardPage }}
              <DashboardPage {connection} />
            {/await}
          </svelte:boundary>
        </div>
      {/if}

      <!-- ER Diagram tab -->
      {#if erdEverOpened}
        <div
          class={activeTab?.kind === 'erd' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          inert={activeTab?.kind !== 'erd' || undefined}
        >
          <svelte:boundary failed={tabError}>
            {#await import('./EntityRelationPage.svelte')}<TabLoading />{:then { default: EntityRelationPage }}
              <EntityRelationPage
                schema={activeSchema}
                {schemas}
                onopentable={(s, t) => void openTableTab(s, t)}
              />
            {/await}
          </svelte:boundary>
        </div>
      {/if}

      <!-- Search tab - mount once, keep alive -->
      {#if searchEverOpened}
        <div
          class={activeTab?.kind === 'search' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          inert={activeTab?.kind !== 'search' || undefined}
        >
          <svelte:boundary failed={tabError}>
            <SearchPage
              {tables}
              schema={activeSchema}
              onopentable={(tableName, searchTerm) => {
                if (aiMode) exitAiMode()
                void openTableTab(activeSchema, tableName, { search: searchTerm })
              }}
            />
          </svelte:boundary>
        </div>
      {/if}

      <!-- Notebook tabs — one instance per open notebook, kept alive -->
      {#each tabs.filter((t) => t.kind === 'notebook') as nbTab (nbTab.id)}
        {@const nbState = /** @type {import('$lib/studio-tabs.js').NotebookTabState} */ (nbTab.state)}
        <div
          class={activeTab?.id === nbTab.id ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          inert={activeTab?.id !== nbTab.id || undefined}
        >
          <svelte:boundary failed={tabError}>
            {#await import('./NotebookEditor.svelte')}<TabLoading />{:then { default: NotebookEditor }}
              <NotebookEditor
                active={activeTab?.id === nbTab.id}
                notebook={nbState.notebook}
                filePath={nbState.filePath}
                dirty={nbState.dirty}
                onupdate={(updates) => updateNotebookTab(nbTab.id, updates)}
              />
            {/await}
          </svelte:boundary>
        </div>
      {/each}

      <!-- Schema Timeline tab - mount once, keep alive -->
      {#if schemaTimelineEverOpened}
        <div
          class={activeTab?.kind === 'schema-timeline' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          inert={activeTab?.kind !== 'schema-timeline' || undefined}
        >
          <svelte:boundary failed={tabError}>
            <SchemaTimelinePage
              connectionId={persistConnectionId}
              connectionLabel={connection?.name ?? connection?.database ?? connection?.filePath ?? ''}
              dbType={dbType}
              connections={savedConnections}
            />
          </svelte:boundary>
        </div>
      {/if}

      <!-- Data Diff tab - mount once, keep alive -->
      {#if dataDiffEverOpened}
        <div
          class={activeTab?.kind === 'data-diff' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          inert={activeTab?.kind !== 'data-diff' || undefined}
        >
          <svelte:boundary failed={tabError}>
            {#await import('./DataDiffPage.svelte')}<TabLoading />{:then { default: DataDiffPage }}
              <DataDiffPage
                {schemas}
                {tables}
                activeSchema={activeSchema}
                connections={savedConnections}
                currentConnectionId={persistConnectionId}
              />
            {/await}
          </svelte:boundary>
        </div>
      {/if}

      <!-- ORM tab: mount once, keep alive so Monaco is not destroyed on tab switch -->
      {#if ormEverOpened}
        <div
          class={activeTab?.kind === 'orm' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          inert={activeTab?.kind !== 'orm' || undefined}
        >
          <svelte:boundary failed={tabError}>
          {#await import('./OrmRunner.svelte')}<TabLoading />{:then { default: OrmRunner }}
          <OrmRunner
            bind:code={ormCode}
            bind:mode={ormMode}
            columns={ormColumns}
            rows={ormRows}
            loading={ormLoading}
            error={ormError}
            queryMs={ormQueryMs}
            schemaHints={sqlSchemaHints}
            onrun={(d) => void runOrm(d)}
            onmodi={() => { if (connection) toggleAiSidebar() }}
            onmodb={() => { sidebarOpen = !sidebarOpen }}
            onmodw={() => { if (activeTabId) closeTab(activeTabId) }}
            onmodn={() => { if (connection) openWelcomeTab() }}
            onmodm={() => cycleTheme()}
            onmodt={() => { if (connection) { commandPage = 'tables'; commandOpen = true } }}
            onmodshifte={() => { if (connection) aiMode ? exitAiMode() : enterAiMode() }}
            onmodshiftd={() => { if (connection) void focusDataView() }}
          />
          {/await}
          </svelte:boundary>
        </div>
      {/if}

      <!-- SQL tab: mount once, keep alive so Monaco is not destroyed on tab switch -->
      {#if sqlEverOpened}
        <div
          class={activeTab?.kind === 'sql' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          inert={activeTab?.kind !== 'sql' || undefined}
        >
          <svelte:boundary failed={tabError}>
          {#await import('./SqlConsole.svelte')}<TabLoading />{:then { default: SqlConsole }}
          <SqlConsole
            bind:this={sqlConsoleRef}
            active={activeTab?.kind === 'sql'}
            bind:sql={sqlText}
            bind:queryHistoryVisible
            {queryHistory}
            {savedQueries}
            columns={sqlColumns}
            rows={sqlRows}
            queryMs={sqlQueryMs}
            message={sqlMessage}
            loading={sqlLoading}
            error={sqlError}
            multiResults={sqlMultiResults}
            schemaHints={sqlSchemaHints}
            schemaContext={aiSchemaContext}
            onrun={runSql}
            onmodk={() => { commandOpen = true }}
            onmodenter={() => runSql()}
            onmods={() => saveActiveTabState()}
            onmodi={() => { if (connection) toggleAiSidebar() }}
            onmodb={() => { sidebarOpen = !sidebarOpen }}
            onmodw={() => { if (activeTabId) closeTab(activeTabId) }}
            onmodn={() => { if (connection) openWelcomeTab() }}
            onmodm={() => cycleTheme()}
            onmodt={() => { if (connection) { commandPage = 'tables'; commandOpen = true } }}
            onmodshifte={() => { if (connection) aiMode ? exitAiMode() : enterAiMode() }}
            onmodshiftd={() => { if (connection) void focusDataView() }}
            onmodshifto={() => { if (connection) openOrmTab() }}
            onqueryrefresh={refreshQueryStores}
            onhistoryselect={(sql) => void openQueryInEditor(sql)}
            onsavequery={handleSaveQuery}
            onfixwithai={handleFixWithAi}
          />
          {/await}
          </svelte:boundary>
        </div>
      {/if}

      {#if activeTab?.kind === 'table'}
        {#if error}
          <div class="flex shrink-0 items-start gap-2.5 border-b border-destructive/15 bg-destructive/[0.04] px-3 py-2">
            <AlertTriangle class="mt-px size-3.5 shrink-0 text-destructive/70" />
            <p class="min-w-0 flex-1 font-mono text-ui-xs leading-relaxed text-destructive/90">{error}</p>
            <button
              type="button"
              class="mt-px shrink-0 text-destructive/40 transition-colors hover:text-destructive"
              onclick={() => (error = '')}
              title="Dismiss"
            >
              <X class="size-3.5" />
            </button>
          </div>
        {/if}

        {#if !activeTable}
          <div class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <p class="font-mono text-ui text-muted-foreground">
              Select a table from the sidebar or press
              <kbd>⌘K</kbd>
            </p>
          </div>
        {:else if error}
          <div class="flex flex-1 items-center justify-center">
            <p class="font-mono text-ui-sm text-muted-foreground/40">Dismiss the error above to continue.</p>
          </div>
        {:else}
          {#if tableViewMode === 'structure' && canShowStructure}
            <TableToolbar
              bind:this={tableToolbar}
              bind:filterBarOpen
              bind:tableViewMode
              structureAllowed={canShowStructure}
              ontogglestructure={() => { tableViewMode = 'data'; structureColumns = [] }}
              {sidebarOpen}
              queryMs={0}
              page={1}
              pageSize={0}
              offset={0}
              total={0}
              columns={[]}
              rowSearch=""
              rowSort={null}
              rowFilters={[]}
              loading={loadingStructure}
              selectedCount={0}
              hasPrimaryKey={false}
              deleting={false}
                            onrefresh={() => void loadStructure()}
              onprev={() => {}}
              onnext={() => {}}
              {structureSearch}
              onstructuresearchchange={(v) => (structureSearch = v)}
            />
            <StructureView
              schema={activeSchema}
              table={activeTable ?? ''}
              {primaryKey}
              columns={structureColumns}
              indexes={activeTableIndexes}
              triggers={activeTableTriggers}
              {tables}
              {enums}
              columnSearch={structureSearch}
              loading={loadingStructure}
              onrefresh={() => { void loadStructure(); void loadTriggers() }}
            />
          {:else}
          <TableToolbar
            bind:this={tableToolbar}
            bind:filterBarOpen
            bind:tableViewMode
            structureAllowed={canShowStructure}
            ontogglestructure={() => { tableViewMode = 'structure'; if (!structureColumns.length) void loadStructure() }}

            {sidebarOpen}
            {queryMs}
            {page}
            {pageSize}
            offset={currentOffset}
            {total}
            {columns}
            {rowSearch}
            {rowSort}
            {rowFilters}
            loading={loadingRows}
            selectedCount={selected.size}
            hasPrimaryKey={primaryKey.length > 0}
            deleting={deletingRows}
                        onrefresh={loadRows}
            onsearchchange={handleRowSearchChange}
            onfilterschange={(f) => void handleRowFiltersChange(f)}
            onsortchange={(s) => void handleRowSortChange(s)}
            onpagesizechange={(s) => void handlePageSizeChange(s)}
            onpagechange={(p) => void handlePageChange(p)}
            onlimitoffsetchange={(l, o) => void handleLimitOffsetChange(l, o)}
            {infiniteScroll}
            oninfinitescrolltoggle={toggleInfiniteScroll}
            ondeleteselected={() => void deleteSelectedRows()}
            onexport={handleExport}
            onaddrow={() => dtBeginInsertRow?.()}
            readonly={tableReadonly}
            {hiddenColumns}
            virtualRelColumns={virtualRelColumnsForToolbar}
            onhiddencolumnschange={(next) => {
              hiddenColumns = next
              if (activeTable) saveHiddenCols(persistConnectionId, activeSchema, activeTable, next)
            }}
            onprev={async () => {
              if (page <= 1) return
              await handlePageChange(page - 1)
            }}
            onnext={async () => {
              if (page * effectivePageSize >= total) return
              await handlePageChange(page + 1)
            }}
          />

          <div class="flex min-h-0 min-w-0 flex-1">
            <svelte:boundary failed={tabError}>
              <DataTable
                {columns}
                {rows}
                {primaryKey}
                {foreignKeys}
                {incomingForeignKeys}
                onfetchrelatedrows={handleFetchRelatedRows}
                schema={activeSchema}
                tableName={activeTable ?? ''}
                indexes={activeTableIndexes}
                {hiddenColumns}
                {reloadToken}
                columnWidthsKey={activeTable ? `${activeSchema}.${activeTable}` : undefined}
                loading={loadingRows}
                {loadingMore}
                {infiniteScroll}
                onloadmore={handleLoadMore}
                saving={savingCell || deletingRows || insertingRow}
                bind:selected
                bind:focusedRow
                bind:inspectorRow
                bind:editingCell
                bind:pendingEditCount
                bind:applyEdits
                bind:resetEdits
                bind:scrollToTop={scrollTableTop}
                bind:scrollToBottom={scrollTableBottom}
                bind:getScroll={tableGetScroll}
                bind:applyScroll={tableApplyScroll}
                {rowSort}
                onsortchange={(s) => void handleRowSortChange(s)}
                onhidecolumn={(colName) => {
                  const next = new Set(hiddenColumns)
                  next.add(colName)
                  hiddenColumns = next
                  if (activeTable) saveHiddenCols(persistConnectionId, activeSchema, activeTable, next)
                }}
                onfiltercolumn={(colName) => {
                  const newFilter = { id: crypto.randomUUID(), column: colName, op: /** @type {any} */ ('contains'), value: '', conjunct: /** @type {any} */ ('and') }
                  void handleRowFiltersChange([...rowFilters, newFilter])
                  filterBarOpen = true
                  tableToolbar?.focusLastFilter?.()
                }}
                onfilterbyvalue={(colName, value, exclude) => {
                  /** @type {string} */ let op
                  let filterValue = ''
                  if (value === null || value === undefined) {
                    op = exclude ? 'is_not_null' : 'is_null'
                  } else {
                    op = exclude ? 'neq' : 'eq'
                    filterValue = String(value)
                  }
                  const newFilter = { id: crypto.randomUUID(), column: colName, op: /** @type {any} */ (op), value: filterValue, conjunct: /** @type {any} */ ('and') }
                  void handleRowFiltersChange([...rowFilters, newFilter])
                  filterBarOpen = true
                }}
                onsave={handleSaveCell}
                ondelete={handleDeleteRow}
                onfollowforeignkey={(d) => void handleFollowForeignKey(d)}
                oninsertrow={handleInsertRow}
                insertSaving={insertingRow}
                bind:beginInsertRow={dtBeginInsertRow}
                readonly={tableReadonly}
              />
            </svelte:boundary>
            <RowDetailPanel
              {columns}
              {rows}
              {primaryKey}
              target={inspectorTarget}
              onclose={closeInspector}
              onsave={handleSaveCell}
            />
          </div>
          {/if}
        {/if}
      {/if}

      {#if !activeTab || activeTab.kind === 'welcome'}
        {@const isMac = navigator.platform.toUpperCase().includes('MAC')}
        {@const mod = isMac ? '⌘' : 'Ctrl'}
        {@const recentQueries = queryHistory.slice(0, 5)}
        {@const _now = Date.now()}
        {@const relTime = (/** @type {number} */ ts) => {
          const diff = _now - ts, sec = Math.floor(diff / 1000)
          if (sec < 60) return 'just now'
          const min = Math.floor(sec / 60)
          if (min < 60) return `${min}m`
          const hr = Math.floor(min / 60)
          if (hr < 24) return `${hr}h`
          const day = Math.floor(hr / 24)
          return day < 7 ? `${day}d` : new Date(ts).toLocaleDateString()
        }}
        {@const cell = 'group flex flex-col gap-3 rounded-xl border border-border/25 bg-card/50 p-3 text-left transition-all hover:border-border/50 hover:bg-accent/10'}
        {@const iconCls = 'size-3.5 text-muted-foreground/50 transition-colors group-hover:text-foreground/80'}
        {@const labelCls = 'text-[11px] font-medium leading-none text-foreground/50 transition-colors group-hover:text-foreground/80'}
        {@const hotkeyCls = 'text-[9px] tabular-nums text-muted-foreground/20 group-hover:text-muted-foreground/40 transition-colors self-end'}

        <!-- Scroll container keeps top/bottom padding reachable when the content
             outgrows the viewport (e.g. at high zoom); inner wrapper centers when it fits. -->
        <div class="min-h-0 flex-1 overflow-auto">
          <div class="flex min-h-full flex-col items-center justify-center gap-7 px-6 py-10 sm:gap-9 sm:py-12">

          <!-- Header -->
          <div class="flex flex-col items-center gap-3">
            <div class="flex size-11 items-center justify-center rounded-2xl border border-border/40 bg-gradient-to-b from-muted/50 to-muted/10 shadow-sm ring-1 ring-inset ring-white/[0.03]">
              <Logo class="size-6" />
            </div>
            <p class="text-[9px] font-medium uppercase tracking-[0.25em] text-muted-foreground/25">Quick access</p>
            {#if connection}
              <div class="flex items-center gap-2 text-sm font-medium text-foreground/80">
                <span class="size-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                <span class="font-mono">{connection.database ?? connection.filePath?.split('/').at(-1) ?? connection.databaseId ?? 'connected'}</span>
                <span class="text-muted-foreground/30 text-xs">·</span>
                <span class="capitalize text-muted-foreground/50 text-xs font-normal">{dbType}</span>
                {#if tables.length > 0}
                  <span class="text-muted-foreground/30 text-xs">·</span>
                  <span class="text-xs text-muted-foreground/40 font-normal">{tables.length} tables</span>
                {/if}
              </div>
            {/if}
          </div>

          <!-- Action grid — max-w-sm keeps all sections aligned -->
          <div class="grid w-full max-w-sm grid-cols-4 gap-1.5">

            <button onclick={openSqlTab} class={cell}>
              <Terminal class={iconCls} />
              <div class="flex items-end justify-between gap-1">
                <span class={labelCls}>SQL</span>
                <span class={hotkeyCls}>{mod}T</span>
              </div>
            </button>

            <button onclick={openDashboardTab} class={cell}>
              <LayoutDashboard class={iconCls} />
              <span class={labelCls}>Dashboard</span>
            </button>

            <button onclick={openAiTab} class={cell}>
              <Bot class={iconCls} />
              <div class="flex items-end justify-between gap-1">
                <span class={labelCls}>AI</span>
                <span class={hotkeyCls}>{mod}⇧E</span>
              </div>
            </button>

            <button onclick={openOrmTab} class={cell}>
              <Code2 class={iconCls} />
              <div class="flex items-end justify-between gap-1">
                <span class={labelCls}>ORM</span>
                <span class={hotkeyCls}>{mod}⇧O</span>
              </div>
            </button>

            {#if hasSchemaExplorer}
              <button onclick={openSchemaTab} class={cell}>
                <LayoutTemplate class={iconCls} />
                <span class={labelCls}>Schema</span>
              </button>
            {/if}

            {#if hasSecurity}
              <button onclick={openSecurityTab} class={cell}>
                <ShieldCheck class={iconCls} />
                <span class={labelCls}>Security</span>
              </button>
            {/if}

            <button onclick={openLogsTab} class={cell}>
              <ScrollText class={iconCls} />
              <span class={labelCls}>Logs</span>
            </button>

            <button onclick={openChartsTab} class={cell}>
              <BarChart2 class={iconCls} />
              <span class={labelCls}>Charts</span>
            </button>

            <button onclick={openDiagramsTab} class={cell}>
              <GitBranch class={iconCls} />
              <span class={labelCls}>Diagrams</span>
            </button>

            <button onclick={openSchemaTimelineTab} class={cell}>
              <History class={iconCls} />
              <span class={labelCls}>Timeline</span>
            </button>

            <button onclick={openDataDiffTab} class={cell}>
              <GitCompare class={iconCls} />
              <span class={labelCls}>Data Diff</span>
            </button>

            <button onclick={openExtensionsTab} class={cell}>
              <Blocks class={iconCls} />
              <span class={labelCls}>Extensions</span>
            </button>

            <button onclick={() => (showConnectionModal = true)} class={cell}>
              <Database class={iconCls} />
              <span class={labelCls}>Connect</span>
            </button>
          </div>

          <!-- Recent queries — same max-w-sm as the grid -->
          {#if recentQueries.length > 0}
            <div class="w-full max-w-sm flex flex-col gap-0.5">
              <p class="mb-1 px-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/25">Recent</p>
              {#each recentQueries as q (q.id)}
                <button
                  onclick={() => void openQueryInEditor(q.sql)}
                  class="group flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/25"
                >
                  <History class="size-3 shrink-0 text-muted-foreground/20 transition-colors group-hover:text-muted-foreground/40" />
                  <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground/35 transition-colors group-hover:text-foreground/60">{q.title}</span>
                  <span class="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/20">{relTime(q.executedAt)}</span>
                </button>
              {/each}
            </div>
          {/if}

          <!-- Footer -->
          <div class="flex items-center gap-3 text-[10px] text-muted-foreground/20">
            <button
              onclick={() => showShortcutsModal = true}
              class="flex items-center gap-1 transition-colors hover:text-muted-foreground/40"
            >
              <Command size={9} />
              <span>shortcuts</span>
            </button>
            <span>·</span>
            <span class="font-mono">{mod}B sidebar</span>
            <span>·</span>
            <span class="font-mono">{mod}W close tab</span>
          </div>
          </div>
        </div>
      {/if}
      {/if}
    {/if}
  </main>


  {#if aiSidebarEverOpened && connection}
    <div
      style={aiSidebarOpen && !aiMode ? '' : 'display:none'}
      inert={!aiSidebarOpen || aiMode || undefined}
    >
      {#await import('./AiSidebar.svelte')}<TabLoading />{:then { default: AiSidebar }}
        <AiSidebar
          bind:this={aiSidebarRef}
          schemaContext={aiSchemaContext}
          {connectionId}
          isActive={aiSidebarOpen && !aiMode}
          currentView={activeTab?.kind ?? 'welcome'}
          currentSql={sqlText}
          currentCode={ormCode}
          {ormMode}
          onclose={toggleAiSidebar}
          onaccept={(d) => void handleAiSidebarAccept(d)}
          onopensettings={() => (showAiModelSettings = true)}
        />
      {/await}
    </div>
  {/if}
</div>

<StatusBar
  {connection}
  {savedConnections}
  {activeConnectionId}
  {pendingEditCount}
  onapplyedits={() => void applyEdits()}
  onresetedits={() => resetEdits()}
  showTableNav={activeTab?.kind === 'table'}
  onscrolltabletop={() => scrollTableTop()}
  onscrolltablebottom={() => scrollTableBottom()}
  onswitchconnection={handleSwitchDatabase}
  {mcpRunning}
  hasUpdate={statusBarHasUpdate}
  {activeView}
  onopenmcp={() => (showMcpPanel = true)}
  onconnect={() => (showConnectionModal = true)}
  onswitchtodb={(dbName) => {
    if (!connection) return
    void handleSwitchDatabase({ ...connection, database: dbName, name: `${connection.host ?? connection.name}/${dbName}` })
  }}
  oncheckupdate={() => updateDialog?.checkNow()}
  onopenmodelsettings={() => (showAiModelSettings = true)}
  onviewchange={handleSidebarViewChange}
  {aiMode}
  onopenaimode={() => (aiMode ? exitAiMode() : enterAiMode())}
  onopenSchema={openSchemaTab}
  onopenlogs={() => { if (aiMode) exitAiMode(); openLogsTab() }}
  onopenextensions={() => { if (aiMode) exitAiMode(); openExtensionsTab() }}
  onopensecurity={() => { if (aiMode) exitAiMode(); openSecurityTab() }}
  onopenorm={openOrmTab}
        onopenbackup={openBackupTab}
  onopenchartspage={() => { if (aiMode) exitAiMode(); openChartsTab() }}
  onopendashboard={() => { if (aiMode) exitAiMode(); openDashboardTab() }}
  onopendiagrams={() => { if (aiMode) exitAiMode(); openDiagramsTab() }}
  onopenerd={() => { if (aiMode) exitAiMode(); openErdTab() }}
  onopensettings={() => (showSettingsModal = true)}
  onopencommand={() => (commandOpen = true)}
  bind:readonly={tableReadonly}
  ondisconnect={requestDisconnect}
  oncreatedatabase={async ({ name, owner, encoding, lcCollate, lcCtype, template, connectionLimit }) => {
    const escaped = name.replace(/"/g, '""')
    let sql
    if (dbType === 'mysql') {
      sql = `CREATE DATABASE \`${name.replace(/`/g, '``')}\``
      if (encoding) sql += ` CHARACTER SET ${encoding}`
      if (lcCollate) sql += ` COLLATE ${lcCollate}`
    } else {
      sql = `CREATE DATABASE "${escaped}"`
      if (encoding) sql += `\n  ENCODING '${encoding}'`
      if (template) sql += `\n  TEMPLATE ${template}`
      if (lcCollate) sql += `\n  LC_COLLATE '${lcCollate}'`
      if (lcCtype) sql += `\n  LC_CTYPE '${lcCtype}'`
      if (owner) sql += `\n  OWNER "${owner.replace(/"/g, '""')}"`
      if (connectionLimit != null && connectionLimit !== -1) sql += `\n  CONNECTION LIMIT ${connectionLimit}`
    }
    await executeDdl(sql)
    toast.success(`Database "${name}" created`)
  }}
/>
</div>
