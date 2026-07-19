<script>
  import { onMount, onDestroy, untrack, tick } from 'svelte'
  import { fade } from 'svelte/transition'
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
  import { cycleTheme, restorePreviousTheme, isCurrentThemeDark, loadSettings, updateSettings, appPaginationMode, appVimMode } from '$lib/stores/settings.js'
  import { isTextEntryTarget, setVimSubMode } from '$lib/vim/vim.js'
  import { normalizeColumn, columnType } from '$lib/column.js'
  import {
    loadAiMode, saveAiMode, loadHiddenCols, saveHiddenCols,
    loadQueryHistoryPref, saveQueryHistoryPref, loadInfiniteScroll, saveInfiniteScroll,
  } from '$lib/stores/table-prefs.js'
  import { pickRandomTip } from '$lib/insider-tips.js'
  import { toast } from '$lib/components/ui/sonner/toast.svelte.js'
  import Sidebar from './Sidebar.svelte'
  import TabBar from './TabBar.svelte'
  import PaneLayout from './PaneLayout.svelte'
  import PaneSnapshot from './PaneSnapshot.svelte'
  import * as PaneTree from '$lib/pane-layout.js'
  import TabLoading from './TabLoading.svelte'
  import TableToolbar from './TableToolbar.svelte'
  import StructureView from './StructureView.svelte'
  import DataTable from './DataTable.svelte'
  import RowDetailPanel from './RowDetailPanel.svelte'
  import TableJsonView from './TableJsonView.svelte'
  import TableRecordView from './TableRecordView.svelte'
  import TableTextView from './TableTextView.svelte'
  import ChartView from './ChartView.svelte'
  import CommandPalette from './CommandPalette.svelte'
  // AiChat / AiSidebar (large, pull in marked + shiki) are loaded lazily the first time
  // the AI panel is opened — see the {#await import()} blocks below.
  import AiSettingsDialog from './AiSettingsDialog.svelte'
  import ConnectionModal from './ConnectionModal.svelte'
  import DbIcon from './DbIcon.svelte'
  import DockerLaunchModal from './DockerLaunchModal.svelte'
  import CreateTableDialog from './CreateTableDialog.svelte'
  import CreateSchemaDialog from './CreateSchemaDialog.svelte'
  import GenerateSqlDialog from './GenerateSqlDialog.svelte'
  import FindReplaceDialog from './FindReplaceDialog.svelte'
  import { genSelectStar } from '$lib/sql-generate.js'
  import { qualifiedTable } from '$lib/dml-preview.js'
  import { pluginState, pluginEnabledIn } from '$lib/stores/plugins.js'
  import { loadTableViews, saveTableViews } from '$lib/stores/table-views.js'
  import { loadSqlDraft, saveSqlDraft } from '$lib/stores/sql-draft.js'
  import { buildBatchUpdateSql } from '$lib/sql-batch-update.js'
  import { buildSearchQuery, searchOptionsSupported } from '$lib/search-options.js'
  import Onboarding from './Onboarding.svelte'
  import SettingsDialog from './SettingsDialog.svelte'
  import KeyboardShortcutsDialog from './KeyboardShortcutsDialog.svelte'
  import DdlDialog from './DdlDialog.svelte'
  import InsiderDialog from './InsiderDialog.svelte'
  import AboutDialog from './AboutDialog.svelte'
  import ReportIssueDialog from './ReportIssueDialog.svelte'
  import UpdateDialog from './UpdateDialog.svelte'
  import StatusBar from './StatusBar.svelte'
  import QueryLogConsole from './QueryLogConsole.svelte'
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
  import InstanceInsightsPage from './InstanceInsightsPage.svelte'
  // Monaco-backed pages (DataDiffPage, OrmRunner, SecurityPage, JsonViewerPage, SqlConsole)
  // are loaded lazily at their render sites so the Monaco editor stays out of the
  // startup bundle until the user actually opens a SQL / ORM / JSON / diff / security tab.
  // Heavy feature pages (echarts / mermaid / swapy / xyflow+dagre) are loaded lazily
  // the first time their tab is opened — see the {#await import()} blocks below.
  // This keeps those large libraries out of the startup bundle and idle memory.
  import { Button } from '$lib/components/ui/button/index.js'
  import AlertTriangle from '@lucide/svelte/icons/triangle-alert'
  import X from '@lucide/svelte/icons/x'
  import Lock from '@lucide/svelte/icons/lock'
  import WifiOff from '@lucide/svelte/icons/wifi-off'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import {
    disconnectPostgres,
    listSchemas,
    listTables,
    getTableRowCounts,
    getTableRows,
    countTableRows,
    liveStart,
    liveStop,
    getTableColumnStructure,
    getIncomingForeignKeys,
    executeSql,
    executeSqlMulti,
    executeDdl,
    updateTableCell,
    deleteTableRows,
    insertTableRow,
    toggleDevtools,
    resetWindow,
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
    createInsightsTab,
    findInsightsTab,
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
    createLicenseTab,
    findLicenseTab,
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
  import {
    pendingChangesCount,
    clearPendingChanges,
    anyPendingChanges,
  } from '$lib/stores/pending-table-edits.js'
  import { createNotebook, deserializeNotebook, titleFromPath } from '$lib/notebook.js'
  import { openNotebookFile } from '$lib/api.js'
  import { formatCompactCount, normalizeTableRowCount } from '$lib/table-list.js'
  import {
    MAX_PAGE_SIZE,
    PAGE_SIZE_ALL,
    DEFAULT_PAGE_SIZE,
    saveDefaultPageSize,
    loadDefaultPageSize,
    activeFilters,
    filtersApiSignature,
    filtersForApi,
    sortForApi,
    buildSelectSql,
    readRowsResponse,
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
  import { hasPro, FREE_CONNECTION_LIMIT } from '$lib/stores/license.js'
  import { engineSupports } from '$lib/db-capabilities.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import KeyRound from '@lucide/svelte/icons/key-round'
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
    listFunctions,
    pingConnection,
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
  import { rowsToCsv, rowsToJson, rowsToCsvAsync, rowsToJsonAsync, saveExportFile, buildExportFilename } from '$lib/export.js'
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
  import { isNetworkError } from '$lib/utils.js'
  import { get } from 'svelte/store'
  import { virtualColumnsStore } from '$lib/stores/virtual-columns.js'

  /** @typedef {import('$lib/studio-tabs.js').StudioTab} StudioTab */
  /** @typedef {import('$lib/studio-tabs.js').TableTabState} TableTabState */
  /** @typedef {import('$lib/studio-tabs.js').SqlTabState} SqlTabState */
  /** @typedef {import('$lib/table-query.js').TableSort} TableSort */
  /** @typedef {import('$lib/table-query.js').TableFilter} TableFilter */
  /** @typedef {import('$lib/foreign-key-nav.js').ForeignKeyInfo} ForeignKeyInfo */

  const SEARCH_DEBOUNCE_MS = 150
  // Per-table column metadata is tiny (an array of column defs), so we can cache a
  // lot of it. A high cap means revisiting a table almost never re-fetches columns
  // on-demand — which is what caused a visible flicker on switch-back when the old
  // 60-entry limit evicted earlier tables in a large schema.
  const COLUMNS_CACHE_MAX = 400

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
  /** @type {boolean} - true when the DB went away mid-session */
  let connectionLost = $state(false)
  let autoConnecting = $state(false)
  let showConnectionModal = $state(false)
  let showDockerModal = $state(false)
  let dockerInitialDb = $state(/** @type {string | null} */ (null))
  /** Bottom query-log console visibility. */
  let queryLogOpen = $state(false)
  /** When set, the ERD tab is scoped to this table + its FK-connected neighbors. */
  let erdFocusTable = $state('')
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
  let showProGate = $state(false)
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
  /** Which side the navigation sidebar docks to. @type {'left' | 'right'} */
  let sidebarSide = $state(loadLayout().navSidebarSide)
  /** @param {'left' | 'right'} s */
  function moveSidebar(s) { sidebarSide = s; saveLayout({ navSidebarSide: s }) }
  let aiSidebarOpen = $state(loadLayout().aiSidebarOpen)
  let aiSidebarEverOpened = $state(loadLayout().aiSidebarOpen)
  let statusBarVisible = $state(loadLayout().statusBarVisible)
  let tabBarVisible = $state(loadLayout().tabBarVisible)
  let tableToolbarVisible = $state(loadLayout().tableToolbarVisible)
  // Width for the loading-fallback shell, so the spinner fills a properly-sized
  // sidebar panel (matching saved width) instead of a zero-width strip while the
  // lazy AiSidebar chunk downloads.
  const aiSidebarFallbackWidth = loadLayout().aiSidebarWidth

  /** @type {StudioTab[]} */
  let tabs = $state([])
  // Recently-closed tabs (most-recent last), for Reopen Closed Tab (Ctrl/⌘+Shift+T).
  // Stores lightweight descriptors, not live tab objects; capped so it can't grow.
  let closedTabStack = $state(/** @type {any[]} */ ([]))
  const CLOSED_TAB_STACK_MAX = 20
  let activeTabId = $state(/** @type {string | null} */ (null))

  // ── Split-pane / editor-group layout ─────────────────────────────────────
  // `paneRoot` is a binary split tree whose leaves ("groups") reference tab ids
  // from the flat `tabs` array above. The FOCUSED group's active tab is kept in
  // sync with the global `activeTabId`, so the existing data pipeline (columns,
  // rows, loadRows, handleSaveCell, …) drives whatever the focused pane shows.
  // Background panes render read-only snapshots from each tab's own `tab.state`.
  /** @type {import('$lib/pane-layout.js').PaneNode | null} */
  let paneRoot = $state(null)
  let activeGroupId = $state(/** @type {string | null} */ (null))
  /** Tab id currently being dragged (drives the split drop targets). */
  let dragTabId = $state(/** @type {string | null} */ (null))
  /** Number of panes (groups) in the layout — drives the focused-pane accent. */
  const paneCount = $derived(paneRoot ? PaneTree.allGroups(paneRoot).length : 0)
  /** Floating drag preview position + label (follows the cursor). */
  let dragGhost = $state(/** @type {{ x: number, y: number, title: string } | null} */ (null))
  /** Current drop target under the cursor: which pane + which edge. */
  let dropTarget = $state(/** @type {{ groupId: string, edge: import('$lib/pane-layout.js').DropEdge } | null} */ (null))

  /** Which edge of a pane the cursor is over (drives the split direction / hint). */
  function edgeFromPoint(/** @type {number} */ x, /** @type {number} */ y, /** @type {DOMRect} */ r) {
    const fx = (x - r.left) / r.width
    const fy = (y - r.top) / r.height
    const E = 0.25
    if (fx < E) return /** @type {const} */ ('left')
    if (fx > 1 - E) return /** @type {const} */ ('right')
    if (fy < E) return /** @type {const} */ ('top')
    if (fy > 1 - E) return /** @type {const} */ ('bottom')
    return /** @type {const} */ ('center')
  }

  /** @param {string} id */
  function beginTabDrag(id) {
    dragTabId = id
    const t = tabs.find((tab) => tab.id === id)
    dragGhost = { x: 0, y: 0, title: t?.title ?? 'Tab' }
    dropTarget = null
  }
  /** @param {number} x @param {number} y */
  function moveTabDrag(x, y) {
    if (!dragTabId) return
    dragGhost = { x, y, title: dragGhost?.title ?? '' }
    const el = /** @type {Element | null} */ (document.elementFromPoint(x, y))
    const group = el?.closest('[data-pane-group]') ?? null
    if (!group) { dropTarget = null; return }
    const groupId = group.getAttribute('data-pane-group')
    if (!groupId) { dropTarget = null; return }
    dropTarget = { groupId, edge: edgeFromPoint(x, y, group.getBoundingClientRect()) }
  }
  function endTabDrag() {
    const target = dropTarget
    // handleDropZone reads dragTabId, so call it before clearing.
    if (target && dragTabId) handleDropZone(target.groupId, target.edge)
    dragTabId = null
    dragGhost = null
    dropTarget = null
  }

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
  /** How the data view renders loaded rows — sticky per tab via snapshots. */
  /** @type {'table' | 'json' | 'record' | 'text' | 'chart'} */
  let dataViewMode = $state(/** @type {any} */ (loadSettings().defaultDataView))
  /** @type {import('$lib/api.js').ColumnStructureRow[] | null} — loaded on demand when switching to structure view */
  let structureColumns = $state(/** @type {any[]} */ ([]))
  let loadingStructure = $state(false)
  let _structureSeq = 0
  let structureSearch = $state('')
  let activeTable = $state(/** @type {string | null} */ (null))
  // Pre-filtered to the active table so the DataTable/StructureView props don't
  // recreate a filtered array on every StudioShell re-render (was a per-render
  // cost on each tab switch and keystroke).
  const activeTableIndexes = $derived(activeTable ? indexes.filter((i) => i.tableName === activeTable) : [])
  const activeTableTriggers = $derived(activeTable ? triggers.filter((t) => t.tableName === activeTable) : [])
  let tableFilter = $state('')
  let loadingTables = $state(false)

  // ── Live mode ─────────────────────────────────────────────────────────────
  // Auto-refresh the active table when its data changes. The backend polls a
  // cheap change signal (Postgres pg_stat counters / SQLite data_version). Off by
  // default; per-session, applies to the active table tab.
  let liveEnabled = $state(false)
  const liveSupported = $derived(connection?.type === 'postgres' || connection?.type === 'sqlite')
  // Stable identity of what should be watched — only changes when the target
  // table changes, so row refetches (which replace the tab object) don't churn it.
  const liveTableKey = $derived.by(() => {
    if (!liveEnabled || !liveSupported) return ''
    const t = activeTab
    if (t?.kind !== 'table') return ''
    const s = /** @type {TableTabState} */ (t.state)
    return s?.table ? JSON.stringify([s.schema, s.table]) : ''
  })
  let _liveRefetchTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null)

  // Start/stop the backend watcher whenever the watched table (or toggle) changes.
  $effect(() => {
    const key = liveTableKey
    if (!key) { void liveStop().catch(() => {}); return }
    const [schema, table] = JSON.parse(key)
    void liveStart(schema, table).catch((e) => {
      liveEnabled = false
      toast.error(`Live mode unavailable: ${String(e)}`)
    })
  })

  // Auto-disable when the connection can't support live mode (switched to MySQL,
  // disconnected, etc.) so the toggle never lingers in an impossible state.
  $effect(() => { if (!liveSupported && liveEnabled) liveEnabled = false })

  /** Refetch the active table (throttled) when the backend reports a change. */
  function onLiveChange(/** @type {{ schema: string, table: string } | undefined} */ payload) {
    if (!liveEnabled || !payload) return
    if (typeof document !== 'undefined' && document.hidden) return
    const t = activeTab
    if (t?.kind !== 'table') return
    const s = /** @type {TableTabState} */ (t.state)
    if (!s || s.schema !== payload.schema || s.table !== payload.table) return
    if (editingCell) return // never clobber an in-progress edit
    if (_liveRefetchTimer) return // coalesce bursts
    _liveRefetchTimer = setTimeout(() => {
      _liveRefetchTimer = null
      // loadRows() (not fetchRowsForTab) so the refresh honours the CURRENT
      // filters/sort/search/page held in global state; keepScroll avoids the
      // grid jumping to the top on every change.
      if (liveEnabled && activeTabId && !editingCell && activeTab?.kind === 'table') {
        void loadRows({ keepScroll: true })
      }
    }, 350)
  }

  onMount(() => {
    let unlisten = () => {}
    void (async () => {
      const { listen } = await import('@tauri-apps/api/event')
      unlisten = await listen('live-change', (e) => onLiveChange(/** @type {any} */ (e.payload)))
    })()
    return () => { unlisten(); if (_liveRefetchTimer) clearTimeout(_liveRefetchTimer) }
  })

  // AI mode, hidden columns, query-history visibility and infinite-scroll prefs
  // are persisted via $lib/stores/table-prefs.js (imported above).
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
  let insightsEverOpened = $state(false)
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
  /** @type {{ focusEditor: () => void, openQuery?: (content: string) => void } | null} */
  let sqlConsoleRef = $state(null)

  /** "Open in SQL editor" — generate a SELECT reflecting the current table view and open it in the SQL editor. */
  // ── Search options (match case / whole word / regex) ──────────────────────
  /** @type {import('$lib/search-options.js').SearchOptions} */
  let searchOptions = $state({ matchCase: false, wholeWord: false, regex: false })
  const searchOptsSupported = $derived(searchOptionsSupported(dbType))

  /** Translate a search term + the active options into API search params. */
  function apiSearch(/** @type {string} */ term) {
    return buildSearchQuery(term, searchOptions, searchOptsSupported)
  }

  /** @param {import('$lib/search-options.js').SearchOptions} next */
  function handleSearchOptionsChange(next) {
    searchOptions = next
    if (rowSearch.trim()) {
      page = 1
      void loadRows()
    }
  }

  // ── Workflow extensions: saved views + find & replace ─────────────────────
  const savedViewsEnabled = $derived(pluginEnabledIn($pluginState, 'saved-views'))
  const findReplaceEnabled = $derived(pluginEnabledIn($pluginState, 'find-replace'))

  /** @type {import('$lib/stores/table-views.js').SavedTableView[]} */
  let savedTableViews = $state([])
  /** @type {string | null} */
  let activeTableViewId = $state(null)
  let findReplaceOpen = $state(false)

  $effect(() => {
    void persistConnectionId
    void activeSchema
    const t = activeTable
    savedTableViews = t ? loadTableViews(persistConnectionId, activeSchema, t) : []
    activeTableViewId = null
  })

  /** @param {string} name */
  function saveCurrentTableView(name) {
    if (!activeTable) return
    const view = {
      id: crypto.randomUUID(),
      name,
      search: rowSearch,
      filters: rowFilters.map((f) => ({ ...f })),
      sort: rowSort ? { ...rowSort } : null,
      sortMore: rowSortMore.map((s) => ({ ...s })),
      hiddenColumns: [...hiddenColumns],
      dataViewMode,
      searchOptions: { ...searchOptions },
    }
    savedTableViews = [...savedTableViews, view]
    saveTableViews(persistConnectionId, activeSchema, activeTable, savedTableViews)
    toast.success(`View "${name}" saved`)
  }

  /** @param {import('$lib/stores/table-views.js').SavedTableView} view */
  function applySavedView(view) {
    searchOptions = { matchCase: false, wholeWord: false, regex: false, .../** @type {any} */ (view).searchOptions }
    rowSearch = view.search ?? ''
    rowFilters = (view.filters ?? []).map((f) => ({ ...f }))
    rowSort = view.sort ? { ...view.sort } : null
    rowSortMore = (view.sortMore ?? []).map((s) => ({ ...s }))
    hiddenColumns = new Set(view.hiddenColumns ?? [])
    if (activeTable) saveHiddenCols(persistConnectionId, activeSchema, activeTable, hiddenColumns)
    dataViewMode = view.dataViewMode ?? /** @type {any} */ (loadSettings().defaultDataView)
    activeTableViewId = view.id
    page = 1
    void loadRows()
  }

  /** Toggle back to the unfiltered default (clears the applied view). */
  function resetTableView() {
    searchOptions = { matchCase: false, wholeWord: false, regex: false }
    rowSearch = ''
    rowFilters = []
    rowSort = null
    rowSortMore = []
    hiddenColumns = new Set()
    if (activeTable) saveHiddenCols(persistConnectionId, activeSchema, activeTable, hiddenColumns)
    dataViewMode = /** @type {any} */ (loadSettings().defaultDataView)
    activeTableViewId = null
    page = 1
    void loadRows()
  }

  /** @param {string} id */
  function deleteSavedView(id) {
    savedTableViews = savedTableViews.filter((v) => v.id !== id)
    if (activeTableViewId === id) activeTableViewId = null
    if (activeTable) saveTableViews(persistConnectionId, activeSchema, activeTable, savedTableViews)
  }

  /**
   * Apply find & replace edits. All edits target one column, so they collapse
   * into chunked single-statement CASE updates keyed by primary key — one or
   * two round-trips instead of one per row. ClickHouse (no standard UPDATE)
   * keeps the per-row pipeline.
   * @param {Array<{ rowIdx: number, colIdx: number, value: string }>} edits
   */
  async function handleFindReplaceApply(edits) {
    if (!activeTable || edits.length === 0) return
    if (dbType === 'clickhouse') {
      let done = 0
      try {
        for (const e of edits) {
          await handleSaveCell(e)
          done++
        }
        toast.success(`Replaced ${done.toLocaleString('en-US')} value${done === 1 ? '' : 's'} in ${activeTable}`)
      } catch (err) {
        toast.error(`Stopped after ${done} of ${edits.length} replacements`, { description: String(err) })
      }
      return
    }

    const CHUNK = 400
    let done = 0
    const _start = Date.now()
    try {
      for (let i = 0; i < edits.length; i += CHUNK) {
        const chunk = edits.slice(i, i + CHUNK)
        const sql = buildBatchUpdateSql({
          dialect: dbType,
          schema: activeSchema,
          table: activeTable,
          columns,
          primaryKey,
          rows,
          colIdx: chunk[0].colIdx,
          edits: chunk,
        })
        await executeSql(sql)
        done += chunk.length
      }
      recordActivity({ type: 'row_save', title: `Replaced ${done} values in ${activeTable}`, schema: activeSchema, table: activeTable, durationMs: Date.now() - _start, success: true })
      toast.success(`Replaced ${done.toLocaleString('en-US')} value${done === 1 ? '' : 's'} in ${activeTable}`)
    } catch (err) {
      recordActivity({ type: 'row_save', title: `Find & replace failed in ${activeTable}`, schema: activeSchema, table: activeTable, success: false, error: String(err) })
      toast.error(done ? `Stopped after ${done.toLocaleString('en-US')} of ${edits.length}` : 'Find & replace failed', { description: String(err) })
    }
    await loadRows({ keepScroll: true })
  }

  /**
   * Reset a table tab to its unfiltered default (tab context menu). Background
   * tabs are activated first so the reset goes through the live state and the
   * rows actually refetch.
   * @param {string} id
   */
  async function resetTableTab(id) {
    const tab = tabs.find((t) => t.id === id)
    if (!tab || tab.kind !== 'table') return
    if (id !== activeTabId) await activateTab(id)
    resetTableView()
  }

  // ── Sidebar table actions: console / generate SQL / count / copy columns ──
  /** @type {string | null} */
  let generateSqlTable = $state(null)
  let generateSqlOpen = $state(false)

  /** @param {string} tableName */
  function handleOpenTableInConsole(tableName) {
    const sql = genSelectStar({ dialect: dbType, schema: activeSchema, table: tableName, columns: [], primaryKey: [] })
    if (aiMode) exitAiMode()
    void openQueryInEditor(sql)
  }

  /** @param {string} tableName */
  function handleGenerateSql(tableName) {
    generateSqlTable = tableName
    generateSqlOpen = true
  }

  /** @param {string} tableName */
  async function handleCountRows(tableName) {
    try {
      let n = await countTableRows(activeSchema, tableName)
      if (n < 0) {
        // The count command is Postgres-only (other engines return -1) — fall
        // back to a portable COUNT(*) through the regular SQL path, which every
        // driver implements. Quoting/qualification follows the grid's rules.
        const tbl = qualifiedTable({ dialect: dbType, schema: activeSchema, table: tableName })
        const res = await executeSql(`SELECT COUNT(*) FROM ${tbl}`)
        n = Number(res?.rows?.[0]?.[0])
      }
      if (!Number.isFinite(n) || n < 0) throw new Error('Count not available on this connection')
      toast.success(tableName, { description: `${n.toLocaleString('en-US')} row${n === 1 ? '' : 's'}` })
    } catch (e) {
      toast.error('Count failed', { description: String(e) })
    }
  }

  /** @param {string} tableName */
  async function handleCopyColumns(tableName) {
    try {
      const cols = await getTableColumnStructure(activeSchema, tableName)
      await navigator.clipboard.writeText(cols.map((c) => c.name).join(', '))
      toast.success(`Copied ${cols.length} column name${cols.length === 1 ? '' : 's'}`)
    } catch (e) {
      toast.error('Copy columns failed', { description: String(e) })
    }
  }

  function openTableInSqlEditor() {
    if (!activeTable) return
    const sql = buildSelectSql({
      schema: activeSchema,
      table: activeTable,
      columns,
      filters: rowFilters,
      search: rowSearch,
      sort: rowSort,
      limit: pageSize,
      engine: connection?.type ?? 'postgres',
    })
    if (aiMode) exitAiMode()
    void (async () => {
      await focusSqlView()
      whenRefReady(() => sqlConsoleRef, (r) => r.openQuery?.(sql))
    })()
  }

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
    if (activeTab?.kind === 'insights') insightsEverOpened = true
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
  /** Bound from DataTable — stages the selected rows for deletion (red diff). */
  let stageDeleteSelectedRows = $state(() => {})

  /** Table key ("schema.table") for a tab, or '' for non-table tabs. */
  function tabTableKey(/** @type {any} */ tab) {
    return tab?.kind === 'table' && tab.state?.table
      ? `${tab.state.schema}.${tab.state.table}`
      : ''
  }

  /** Count of unsaved changes staged in a given tab (live for the active one, cached otherwise). */
  function tabPendingCount(/** @type {any} */ tab) {
    if (!tab) return 0
    if (tab.id === activeTabId) return pendingEditCount
    const key = tabTableKey(tab)
    return key ? pendingChangesCount(key) : 0
  }

  /** True when any table (active or backgrounded) has unsaved staged changes. */
  function hasAnyUnsavedChanges() {
    return pendingEditCount > 0 || anyPendingChanges()
  }

  // In-app confirm dialog. `window.confirm` is blocked in the Tauri webview
  // ("dialog.confirm not allowed"), so route all confirmations through this.
  /** @type {{ message: string, confirmLabel: string, resolve: (v: boolean) => void } | null} */
  let confirmDialog = $state(null)
  /** @param {string} message @param {string} [confirmLabel] @returns {Promise<boolean>} */
  function askConfirm(message, confirmLabel = 'Discard') {
    return new Promise((resolve) => { confirmDialog = { message, confirmLabel, resolve } })
  }
  /** @param {boolean} v */
  function resolveConfirm(v) {
    const d = confirmDialog
    confirmDialog = null
    d?.resolve(v)
  }

  // Confirm before quitting the app while table edits are still unsaved.
  onMount(() => {
    let unlisten = () => {}
    ;(async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const win = getCurrentWindow()
        unlisten = await win.onCloseRequested(async (event) => {
          if (!hasAnyUnsavedChanges()) return
          // Stop the close, ask in-app, then force-close if confirmed. Use destroy()
          // (not close()) so we don't re-enter this handler.
          event.preventDefault()
          const ok = await askConfirm('You have unsaved table changes. Discard them and quit?', 'Discard & quit')
          if (ok) await win.destroy()
        })
      } catch { /* non-Tauri / web preview — no window close event */ }
    })()
    return () => unlisten()
  })
  // ── Table scroll controls (StatusBar go-to-top / go-to-bottom / left / right) ──
  /** @type {() => void} */
  let scrollTableTop = $state(() => {})
  /** @type {() => void} */
  let scrollTableBottom = $state(() => {})
  /** @type {() => void} */
  let scrollTableLeft = $state(() => {})
  /** @type {() => void} */
  let scrollTableRight = $state(() => {})
  /** True when the active grid overflows horizontally (from DataTable). */
  let tableCanScrollH = $state(false)
  /** @type {(name: string) => void} */
  let focusTableColumn = $state(() => {})
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
  let pageSize = $state(loadDefaultPageSize())
  let rawOffset = $state(/** @type {number | null} */ (null))
  // When "All rows" sentinel is active, always fetch from offset 0.
  const currentOffset = $derived(
    pageSize === PAGE_SIZE_ALL ? 0 : (rawOffset ?? (page - 1) * pageSize),
  )

  // ── Keyset / cursor / temporal pagination ────────────────────────────────
  // Cursor for the NEXT fetch (null = first page / offset-0). Set by next/prev.
  let _keysetCursor = $state(/** @type {{ value: unknown, after: boolean } | null} */ (null))
  // Boundary key values of the currently-shown page (for building next/prev cursors).
  let _pageFirstKey = null
  let _pageLastKey = null
  /** Column keyset orders by: single-column PK (cursor/keyset), or a timestamp (temporal). */
  const _keysetKeyCol = $derived.by(() => {
    const mode = $appPaginationMode
    if (mode === 'temporal') {
      const ts = columns.find((c) => /(_at$|created|updated|inserted|timestamp|date)/i.test(c.name) && /(time|date)/i.test(c.dataType ?? c.data_type ?? ''))
        ?? columns.find((c) => /(time|date)/i.test(c.dataType ?? c.data_type ?? ''))
      return ts?.name ?? null
    }
    if (mode === 'cursor' || mode === 'keyset') return primaryKey.length === 1 ? primaryKey[0] : null
    return null
  })
  const _keysetKeyType = $derived.by(() => {
    const col = _keysetKeyCol
    if (!col) return null
    const c = columns.find((x) => x.name === col)
    return c?.dataType ?? c?.data_type ?? null
  })
  /** Temporal is newest-first; keyset/cursor honour the sort dir on the key (default asc). */
  const _keysetDesc = $derived($appPaginationMode === 'temporal' ? true : (rowSort?.column === _keysetKeyCol && rowSort?.direction === 'desc'))
  /** Whether keyset can drive this table right now (else offset — the safe fallback). */
  const _keysetActive = $derived.by(() => {
    if ($appPaginationMode === 'offset') return false
    if (!_keysetKeyCol || !_keysetKeyType) return false
    if (pageSize === PAGE_SIZE_ALL) return false
    if ((connection?.type ?? '') !== 'postgres') return false // keyset is Postgres-only
    if (rowSortMore.length > 0) return false                   // multi-sort → offset
    if (rowSort && rowSort.column !== _keysetKeyCol) return false // sorted by a non-key col → offset
    return true
  })
  const _keyColIndex = $derived(_keysetKeyCol ? columns.findIndex((c) => c.name === _keysetKeyCol) : -1)
  // Bumped whenever a fresh page of rows is applied (page/filter/sort/search).
  // The DataTable watches it to jump its scroll + virtual window back to the
  // top, so a reload never leaves the view stranded mid-table.
  let reloadToken = $state(0)
  // Monotonic id so an out-of-order / superseded row fetch can't clobber a
  // newer one when the user pages rapidly.
  let _loadSeq = 0
  // Infinite scroll — accumulated rows across all "load more" fetches.
  let _infiniteRows = $state(/** @type {any[]} */ ([]))
  let infiniteScroll = $state(loadInfiniteScroll())

  // ── Windowed loading (huge result sets) ──────────────────────────────────
  // For results past WINDOW_THRESHOLD we never hold every row: `rows` becomes a
  // sparse array of length = total with only the windows near the viewport
  // loaded, so 5M rows cost ~tens of MB instead of ~GBs. Absolute indexing is
  // preserved (rows[i] is still row i), so selection / hit-testing / scroll are
  // untouched — only the *data* is windowed. dataVersion bumps trigger a grid
  // redraw after a window is spliced in (rows identity is unchanged).
  const WINDOW_FETCH = 20_000     // rows per window request
  const WINDOW_THRESHOLD = 200_000 // window only above this total
  const WINDOW_KEEP = 4           // windows kept resident on each side of the viewport
  let windowed = $state(false)
  let dataVersion = $state(0)
  let _windowSeq = 0
  /** @type {Set<number>} */
  let _windowLoaded = new Set()
  /** @type {Set<number>} */
  let _windowFetching = new Set()
let rowSearch = $state('')
  let rowSort = $state(/** @type {TableSort | null} */ (null))
  /** Secondary sort keys for multi-column sort (primary is rowSort). @type {TableSort[]} */
  let rowSortMore = $state(/** @type {TableSort[]} */ ([]))
  let rowFilters = $state(/** @type {TableFilter[]} */ ([]))
  let filterBarOpen = $state(false)
  let vcolPanelOpen = $state(false)

  const _vcolTableKey = $derived(`${activeSchema}.${activeTable ?? ''}`)
  const vcolCount = $derived(
    ($virtualColumnsStore[_vcolTableKey] ?? []).filter(c => c.enabled).length
  )
  const virtualExprColsForToolbar = $derived($virtualColumnsStore[_vcolTableKey] ?? [])
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
  /** Fast id → tab lookup for per-group tab-strip rendering. */
  const tabsById = $derived(new Map(tabs.map((t) => [t.id, t])))
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

  // ── Async SQL-completion hints (enums + user functions) ──────────────────────
  // Loaded lazily when the SQL tab becomes active. Stored as reactive state so
  // sqlSchemaHints (a $derived) picks them up automatically once they arrive.
  let _sqlEnumValues = $state(/** @type {Record<string, string[]>} */ ({}))
  let _sqlUserFunctions = $state(/** @type {Array<{name:string,signature:string,returnType:string,kind:string}>} */ ([]))

  $effect(() => {
    if (activeView !== 'sql' || !connection || !activeSchema) return
    const schema = activeSchema
    // Enum/function completion hints are PostgreSQL-only — skip the round-trips
    // (which would just return empty) on every other engine.
    if (engineSupports('enums', connection?.type)) {
      listEnums(schema).then((enums) => {
        /** @type {Record<string, string[]>} */
        const ev = {}
        for (const e of enums) ev[e.name] = e.values
        _sqlEnumValues = ev
      }).catch(() => {})
    } else {
      _sqlEnumValues = {}
    }
    if (engineSupports('functions', connection?.type)) {
      listFunctions(schema).then((fns) => {
        _sqlUserFunctions = fns
      }).catch(() => {})
    } else {
      _sqlUserFunctions = []
    }
  })

  // ── Connection health monitor ─────────────────────────────────────────────────
  // Pings the active DB periodically. On failure it flags the connection as lost
  // (a subtle red dot in the StatusBar) and silently reconnects in place — NO
  // popup. Pings every 30s when healthy; every 6s while lost so recovery is
  // detected fast. Clears itself the moment the connection is back.
  $effect(() => {
    if (!connection) {
      connectionLost = false
      return
    }
    let stopped = false
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer
    const schedule = () => {
      if (stopped) return
      timer = setTimeout(run, connectionLost ? 6_000 : 30_000)
    }
    const run = async () => {
      if (stopped) return
      // Skip the round-trip while the window is hidden (backgrounded/minimized):
      // there's no UI to update, and idle pings only risk waking a sleeping
      // remote connection. The next tick after the window is shown will ping.
      if (typeof document !== 'undefined' && document.hidden) { schedule(); return }
      try {
        await pingConnection()
        if (connectionLost) { connectionLost = false; error = '' }
      } catch {
        if (!connectionLost) connectionLost = true
        // Heal in place instead of showing a Reconnect popup.
        void silentReconnect()
      }
      schedule()
    }
    schedule()
    return () => { stopped = true; if (timer) clearTimeout(timer) }
  })

  // Reconnect the instant the OS reports the network is back, or when the user
  // returns to a backgrounded window — the two moments a dropped remote DB most
  // likely became reachable again. Both are no-ops unless the connection is lost.
  $effect(() => {
    if (typeof window === 'undefined') return
    const kick = () => { if (connection && connectionLost) void silentReconnect() }
    const onVis = () => { if (typeof document !== 'undefined' && !document.hidden) kick() }
    window.addEventListener('online', kick)
    window.addEventListener('focus', kick)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('online', kick)
      window.removeEventListener('focus', kick)
      document.removeEventListener('visibilitychange', onVis)
    }
  })

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
    return { schemas, activeSchema, tables: _tableNames, columnsByTable, enumValues: _sqlEnumValues, userFunctions: _sqlUserFunctions }
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

  // Persist the Query Editor buffer per connection so reopening the tab (or
  // restarting the app) restores where the user left off. Debounced so fast
  // typing doesn't hammer localStorage; gated on `sqlEverOpened` so the initial
  // "SELECT 1;" default can't clobber a real saved draft before the editor is used.
  /** @type {ReturnType<typeof setTimeout> | null} */
  let _sqlDraftTimer = null
  $effect(() => {
    const text = sqlText
    const cid = persistConnectionId
    if (!sqlEverOpened) return
    if (_sqlDraftTimer) clearTimeout(_sqlDraftTimer)
    _sqlDraftTimer = setTimeout(() => saveSqlDraft(cid, text), 400)
  })


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
    saveQueryHistoryPref(queryHistoryVisible)
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
        cols.map(normalizeColumn),
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
        environment: connection?.environment ?? null,
      }
    }
    return {
      schemas,
      activeSchema,
      tables: tables.map((t) => ({ name: t.name, rowCount: t.rowCount })),
      activeTable,
      columns: columns.map(normalizeColumn),
      primaryKey,
      foreignKeys,
      allTableColumns: _allTableColumns,
      /** @type {import('$lib/stores/connections.js').DbType} */
      dbType: engineFamily(connection?.type),
      environment: connection?.environment ?? null,
    }
  })

  const inspectorTarget = $derived.by(() => {
    if (activeTab?.kind !== 'table') return null
    if (inspectorRow !== null) {
      return { kind: 'row', rowIdx: inspectorRow }
    }
    return null
  })

  // Columns/rows narrowed to visible columns for the JSON/text views (the
  // record view filters internally so it can keep original column indices).
  const dataViewColumns = $derived(columns.filter((c) => !hiddenColumns.has(c.name)))
  const dataViewRows = $derived.by(() => {
    if (dataViewMode !== 'json' && dataViewMode !== 'text' && dataViewMode !== 'chart') return []
    if (dataViewColumns.length === columns.length) return rows
    const idxs = columns.map((_, i) => i).filter((i) => !hiddenColumns.has(columns[i].name))
    return rows.map((r) => idxs.map((i) => r[i]))
  })

  const activeTabIndex = $derived(
    activeTabId ? tabs.findIndex((t) => t.id === activeTabId) : -1,
  )

  /** @returns {TableTabState} */
  function captureTableSnapshot() {
    // A windowed result set holds a huge sparse array — never cache it into the
    // tab. Store empty columns/rows so re-activation takes the refetch path
    // (fetchRowsForTab → loadRows) and re-establishes windowing cleanly.
    return {
      schema: activeSchema,
      table: activeTable,
      page,
      pageSize,
      rowSearch,
      rowSort: rowSort ? { ...rowSort } : null,
      rowSortMore: rowSortMore.map((s) => ({ ...s })),
      rowFilters: rowFilters.map((f) => ({ ...f })),
      columns: windowed ? [] : columns,
      primaryKey,
      foreignKeys,
      rows: windowed ? [] : rows,
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
      dataViewMode,
      ...(() => { const s = tableGetScroll(); return { scrollLeft: s.left, scrollTop: s.top } })(),
    }
  }

  /** @param {TableTabState} s */
  function applyTableSnapshot(s) {
    page = s.page
    pageSize = s.pageSize ?? loadDefaultPageSize()
    rowSearch = s.rowSearch ?? ''
    rowSort = s.rowSort ? { ...s.rowSort } : null
    rowSortMore = (s.rowSortMore ?? []).map((x) => ({ ...x }))
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
    // Fresh tabs have no stored view mode — honor Settings → Database → Default view.
    dataViewMode = s.dataViewMode ?? /** @type {any} */ (loadSettings().defaultDataView)
    // Restore the grid scroll position for this tab. Defer one tick so that
    // if DataTable just remounted (switching from a non-table tab), the new
    // applyScroll binding is in place before we call it — otherwise the old
    // closure reads a null tableContainer and the restore is silently dropped.
    const _restoreLeft = s.scrollLeft ?? 0
    const _restoreTop = s.scrollTop ?? 0
    tick().then(() => tableApplyScroll({ left: _restoreLeft, top: _restoreTop }))
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
    pageSize = loadDefaultPageSize()
    rowSearch = ''
    rowSort = null
    rowSortMore = []
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
  // Recover a window stranded off-screen (e.g. after unplugging a monitor).
  createHotkey('Mod+Shift+0', (e) => { e.preventDefault(); void resetWindow() })

  createHotkey('Mod+K', (e) => {
    e.preventDefault()
    commandOpen = true
  })

  createHotkey('Mod+Shift+E', (e) => {
    if (!connection) return
    e.preventDefault()
    if (!$hasPro) { showProGate = true; return }
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

  createHotkey('Mod+Shift+X', (e) => {
    if (!connection) return
    e.preventDefault()
    commandOpen = false
    if (aiMode) exitAiMode()
    openExtensionsTab()
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
    closeActiveTab()
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

  createHotkey('Mod+Shift+B', (e) => {
    e.preventDefault()
    toggleStatusBar()
  })

  // Reopen the most recently closed tab (browser-style).
  createHotkey('Mod+Shift+T', (e) => {
    if (!connection) return
    e.preventDefault()
    reopenLastClosedTab()
  })

  // Tab-bar visibility toggle moved here so Mod+Shift+T can reopen closed tabs.
  createHotkey('Alt+Shift+T', (e) => {
    e.preventDefault()
    toggleTabBar()
  })

  // ── Data views / find & replace / database switching ─────────────────────

  const DATA_VIEW_CYCLE = /** @type {const} */ (['table', 'json', 'record', 'text', 'chart'])

  // Cycle through the table data views (Table → JSON → Record → Text → Chart).
  createHotkey('Mod+Shift+V', (e) => {
    if (!connection || !activeTable || columns.length === 0) return
    e.preventDefault()
    const i = DATA_VIEW_CYCLE.indexOf(/** @type {any} */ (dataViewMode))
    dataViewMode = /** @type {any} */ (DATA_VIEW_CYCLE[(i + 1) % DATA_VIEW_CYCLE.length])
  })

  // Jump straight to a data view: Alt+1 Table, Alt+2 JSON, Alt+3 Record,
  // Alt+4 Text, Alt+5 Chart.
  for (const [i, view] of DATA_VIEW_CYCLE.entries()) {
    createHotkey(`Alt+${i + 1}`, (e) => {
      if (!connection || !activeTable || columns.length === 0) return
      e.preventDefault()
      dataViewMode = /** @type {any} */ (view)
    })
  }

  // Find & replace in the current table — editor-style Ctrl/⌘+H.
  createHotkey('Mod+H', (e) => {
    if (!connection || !activeTable || columns.length === 0 || !findReplaceEnabled) return
    e.preventDefault()
    findReplaceOpen = true
  })

  // Also bind Cmd/Ctrl+Alt+F (VS Code's macOS "replace" shortcut). On macOS the OS
  // swallows Cmd+H to hide the app, so Mod+H never reaches us there — this is the
  // reliable cross-platform binding.
  createHotkey('Mod+Alt+F', (e) => {
    if (!connection || !activeTable || columns.length === 0 || !findReplaceEnabled) return
    e.preventDefault()
    findReplaceOpen = true
  })

  // Switch to saved database connection N (Mod+Alt+1..9) — plain digits, not
  // shifted ones, so the binding survives non-US keyboard layouts.
  for (let n = 1; n <= 9; n++) {
    createHotkey(`Mod+Alt+${n}`, (e) => {
      const conn = savedConnections[n - 1]
      if (!conn) return
      e.preventDefault()
      if (conn.id && conn.id === activeConnectionId) return
      void handleSwitchDatabase(conn)
    })
  }

  // Command palette — VS Code muscle-memory alias for Mod+K.
  createHotkey('Mod+Shift+P', (e) => {
    e.preventDefault()
    commandOpen = true
  })

  // Disconnect the current connection (opens the confirm dialog).
  createHotkey('Mod+Alt+D', (e) => {
    if (!connection) return
    e.preventDefault()
    showDisconnectDialog = true
  })

  // Open the keyboard-shortcuts reference (Ctrl/⌘+/ — same key as Mod+? without shift).
  createHotkey('Mod+/', (e) => {
    if (commandOpen || showConnectionModal || showSettingsModal || showShortcutsModal) return
    e.preventDefault()
    showShortcutsModal = true
  })

  // Jump straight to tab N (Ctrl/⌘+1..8); 9 always jumps to the last tab —
  // the same convention as browsers and editors.
  for (let n = 1; n <= 9; n++) {
    createHotkey(`Mod+${n}`, (e) => {
      if (!connection || tabs.length === 0) return
      e.preventDefault()
      const idx = n === 9 ? tabs.length - 1 : Math.min(n - 1, tabs.length - 1)
      void activateTab(tabs[idx].id)
    })
  }

  createHotkey('Mod+Shift+L', (e) => {
    e.preventDefault()
    openLogsTab()
  })

  // Toggle the bottom query-log console.
  createHotkey('Mod+Shift+K', (e) => {
    e.preventDefault()
    queryLogOpen = !queryLogOpen
  })

  createHotkey('Mod+M', (e) => {
    e.preventDefault()
    cycleTheme()
  })

  createHotkey('Mod+Shift+M', (e) => {
    e.preventDefault()
    restorePreviousTheme()
  })

  // Refresh everything — schemas, table list, and the active table's rows.
  createHotkey('Mod+Shift+R', (e) => {
    if (!connection) return
    e.preventDefault()
    void (async () => {
      await handleRefresh()
      toast.success('Refreshed', { description: 'Schemas, tables, and rows reloaded' })
    })()
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

  // Reset the active table tab to its unfiltered default (clears search, filters,
  // sort, hidden columns, custom view, and resets the data view + page). Works in
  // any table view mode, but not while typing in an input.
  createHotkey('Alt+Shift+R', (e) => {
    if (activeTab?.kind !== 'table' || !activeTable) return
    if (commandOpen || showConnectionModal || showSettingsModal) return
    const el = document.activeElement
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)) return
    e.preventDefault()
    resetTableView()
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
    if (vcolPanelOpen)         { e.preventDefault(); vcolPanelOpen = false;         return }
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
    stageDeleteSelectedRows()
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
      if (!mod) return
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
      if (commandOpen || showConnectionModal || showSettingsModal) return
      const el = document.activeElement
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) return

      // Ctrl/Cmd+Alt+Left/Right → scroll grid to the first / last column.
      if (e.altKey) {
        if (activeTab?.kind !== 'table' || !activeTable) return
        if (e.key === 'ArrowLeft') { e.preventDefault(); scrollTableLeft(); return }
        if (e.key === 'ArrowRight') { e.preventDefault(); scrollTableRight(); return }
        return
      }

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
          if (total >= 0 && page * effectivePageSize >= total) return
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

  // Same panel via a modifier chord (Ctrl/⌘+?), which works even while a text
  // field is focused, unlike the bare "?".
  createHotkey('Mod+?', (e) => {
    if (commandOpen || showConnectionModal || showSettingsModal || showShortcutsModal) return
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
      await loadTables({ force: true })
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
      await loadTables({ force: true })
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
    await loadTables({ force: true })
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

  function toggleStatusBar() {
    statusBarVisible = !statusBarVisible
    saveLayout({ statusBarVisible })
  }

  function toggleTabBar() {
    tabBarVisible = !tabBarVisible
    saveLayout({ tabBarVisible })
  }

  function toggleTableToolbar() {
    tableToolbarVisible = !tableToolbarVisible
    saveLayout({ tableToolbarVisible })
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

  /** Escalate a command-palette quick-ask into the full sidebar chat. */
  /** @param {string} q */
  function handleAskContinue(q) {
    if (!connection || !q) return
    if (!aiSidebarOpen) {
      aiSidebarOpen = true
      aiSidebarEverOpened = true
      saveLayout({ aiSidebarOpen: true })
    }
    whenRefReady(() => aiSidebarRef, (r) => r.sendMessage(q))
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

  // ── Experimental Vim mode — global layer ────────────────────────────────────
  // `:` opens the command palette (command mode); `gt` / `gT` cycle tabs. Only
  // fires on "neutral" surfaces — inputs, Monaco editors, and the data grid own
  // their own Vim handling. A focusin listener keeps the status indicator honest.
  let _vimGPending = false
  let _vimGTimer = /** @type {ReturnType<typeof setTimeout> | 0} */ (0)
  /** @param {KeyboardEvent} e */
  function handleGlobalVimKey(e) {
    if (!$appVimMode || e.metaKey || e.ctrlKey || e.altKey) return
    const el = document.activeElement
    if (isTextEntryTarget(el) || el?.closest?.('[data-canvas-table]')) return
    const k = e.key
    if (_vimGPending) {
      _vimGPending = false
      if (_vimGTimer) { clearTimeout(_vimGTimer); _vimGTimer = 0 }
      if (k === 't') { e.preventDefault(); if (tabs.length > 1) cycleTab(1); return }
      if (k === 'T') { e.preventDefault(); if (tabs.length > 1) cycleTab(-1); return }
    }
    if (k === ':') { e.preventDefault(); commandOpen = true; setVimSubMode('command'); return }
    if (k === 'g') { _vimGPending = true; e.preventDefault(); _vimGTimer = setTimeout(() => { _vimGPending = false }, 700); return }
  }
  function handleVimFocusIn() {
    if (!$appVimMode) return
    const el = document.activeElement
    if (el?.closest?.('.monaco-editor') || el?.closest?.('[data-canvas-table]')) return // owned by their own layers
    const isInput = el instanceof HTMLElement &&
      (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
    setVimSubMode(isInput ? 'insert' : 'normal')
  }
  onMount(() => {
    document.addEventListener('keydown', handleGlobalVimKey, true)
    document.addEventListener('focusin', handleVimFocusIn)
    return () => {
      document.removeEventListener('keydown', handleGlobalVimKey, true)
      document.removeEventListener('focusin', handleVimFocusIn)
    }
  })

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
    // Seed a fresh Query Editor tab. If a SQL tab was already opened this session
    // (keep-alive), reuse the live buffer so we don't clobber Q2/Q3/etc.;
    // otherwise restore the last saved draft for this connection (survives tab
    // close and app restart). Falls back to the default when there's no draft.
    const tab = createSqlTab(
      sqlEverOpened ? sqlText : (loadSqlDraft(persistConnectionId) ?? undefined),
    )
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
    applySqlSnapshot(cloneSqlTabState(/** @type {SqlTabState} */ (tab.state)))
  }

  function openAiTab() {
    if (!$hasPro) { showProGate = true; return }
    enterAiMode()
  }

  // Open a pro-gated singleton tab: focus it if already open, otherwise create,
  // append, and activate it. Replaces ~13 near-identical open*Tab bodies.
  // `capability` gates availability; `capabilityFirst` runs that gate before the
  // pro check (so an unavailable feature returns silently rather than showing the
  // pro upsell) — matching the original per-tab ordering.
  /**
   * @param {{ find: (tabs: any[]) => any, create: () => any, capability?: () => boolean, capabilityFirst?: boolean }} cfg
   */
  function openSingletonTab({ find, create, capability, capabilityFirst = false }) {
    if (capabilityFirst && capability && !capability()) return
    if (!$hasPro) { showProGate = true; return }
    if (!capabilityFirst && capability && !capability()) return
    const existing = find(tabs)
    if (existing) { void activateTab(existing.id); return }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = create()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  function openSchemaTab() {
    openSingletonTab({ find: findSchemaTab, create: createSchemaTab, capability: () => hasSchemaExplorer })
  }

  function openOrmTab() {
    openSingletonTab({ find: findOrmTab, create: createOrmTab })
  }

  function openSecurityTab() {
    openSingletonTab({ find: findSecurityTab, create: createSecurityTab, capability: () => hasSecurity, capabilityFirst: true })
  }

  function openBackupTab() {
    openSingletonTab({ find: findBackupTab, create: createBackupTab })
  }

  function openLogsTab() {
    openSingletonTab({ find: findLogsTab, create: createLogsTab })
  }

  function openInsightsTab() {
    openSingletonTab({ find: findInsightsTab, create: createInsightsTab })
  }

  function openExtensionsTab() {
    openSingletonTab({ find: findExtensionsTab, create: createExtensionsTab })
  }

  /** License activation page. Deliberately NOT via openSingletonTab — that
   *  helper is pro-gated, and this tab exists precisely for non-Pro users. */
  function openLicenseTab() {
    const existing = findLicenseTab(tabs)
    if (existing) { void activateTab(existing.id); return }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = createLicenseTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  /** Close the license tab after a successful activation. */
  function closeLicenseTab() {
    const existing = findLicenseTab(tabs)
    if (existing) void closeTab(existing.id)
  }

  function openJsonTab() {
    openSingletonTab({ find: findJsonTab, create: createJsonTab })
  }

  function openChartsTab() {
    openSingletonTab({ find: findChartsTab, create: createChartsTab })
  }

  function openDashboardTab() {
    openSingletonTab({ find: findDashboardTab, create: createDashboardTab })
  }

  /** @param {string} [focusTable] Scope the ERD to one table + its FK neighbors. */
  function openErdTab(focusTable = '') {
    erdFocusTable = typeof focusTable === 'string' ? focusTable : ''
    openSingletonTab({ find: findErdTab, create: createErdTab })
  }

  function openDiagramsTab() {
    if (!$hasPro) { showProGate = true; return }
    const existing = findDiagramsTab(tabs)
    if (existing) { activateTab(existing.id); return }
    const tab = createDiagramsTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
  }

  function openSearchTab() {
    openSingletonTab({ find: findSearchTab, create: createSearchTab })
  }

  function openNewNotebookTab() {
    if (!$hasPro) { showProGate = true; return }
    saveActiveTabState()
    dropWelcomeTabs()
    const nb = createNotebook()
    const tab = createNotebookTab(nb, null)
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  async function openNotebookFromFile() {
    if (!$hasPro) { showProGate = true; return }
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
    openSingletonTab({ find: findSchemaTimelineTab, create: createSchemaTimelineTab })
  }

  function openDataDiffTab() {
    openSingletonTab({ find: findDataDiffTab, create: createDataDiffTab })
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
  // Background table tabs each pin their full result set. Keep the few most
  // recently viewed ones warm (instant switch) but evict the row arrays of
  // colder, LARGE tabs so N open million-row tables don't retain N× the memory.
  // Eviction just clears rows/columns; switching back refetches (applyTabToEditor
  // treats columns.length === 0 as "no cached data → fetch"). Prefetch only runs
  // on initial open, so this never fights it. Small tabs are left untouched.
  const TAB_ROWS_MRU_MAX = 3
  const TAB_EVICT_ROW_THRESHOLD = 50_000
  let _tabRowsMru = /** @type {string[]} */ ([])
  function evictColdTabRows(activeId) {
    _tabRowsMru = [..._tabRowsMru.filter((x) => x !== activeId), activeId]
    const keep = new Set(_tabRowsMru.slice(-TAB_ROWS_MRU_MAX))
    let changed = false
    const next = tabs.map((t) => {
      if (t.kind !== 'table' || t.id === activeId || keep.has(t.id)) return t
      const st = /** @type {TableTabState} */ (t.state)
      if (st && Array.isArray(st.rows) && st.rows.length > TAB_EVICT_ROW_THRESHOLD) {
        changed = true
        return { ...t, state: { ...st, rows: [], columns: [], selected: new Set() } }
      }
      return t
    })
    if (changed) tabs = next
  }

  async function activateTab(id) {
    if (id === activeTabId) return
    saveActiveTabState()
    activeTabId = id
    evictColdTabRows(id)

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
    // Guard: closing a tab discards its unsaved edits/deletes.
    const closing = tabs[idx]
    const count = tabPendingCount(closing)
    if (count > 0) {
      const ok = await askConfirm(
        `This table has ${count} unsaved change${count === 1 ? '' : 's'}. Close the tab and discard them?`,
        'Close & discard',
      )
      if (!ok) return
      if (id === activeTabId) resetEdits()
      const key = tabTableKey(closing)
      if (key) clearPendingChanges(key)
    }
    rememberClosedTab(closing)
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

  /** Push a closed tab onto the reopen stack (welcome tabs aren't worth restoring). */
  function rememberClosedTab(tab) {
    if (!tab || tab.kind === 'welcome') return
    // Snapshot with a shallow state clone so later edits to the live tree can't
    // mutate what we'll restore. `id`/`pinned` are dropped — reopen mints fresh.
    const { id: _id, pinned: _pinned, ...rest } = tab
    const state = tab.state ? { ...tab.state } : tab.state
    // Drop the bulky payloads — a closed 1M-row tab must not pin its whole result
    // set in memory (20 stacked closed tabs could otherwise retain gigabytes).
    // Reopen restores the query/filters/sort and refetches: applyTabToEditor
    // already treats columns.length === 0 as "no cached data → fetch".
    if (state && tab.kind === 'table') {
      state.rows = []
      state.columns = []
      state.selected = new Set()
    } else if (state && tab.kind === 'sql') {
      state.sqlRows = []
      state.sqlColumns = []
    }
    const snapshot = { ...rest, state }
    closedTabStack = [...closedTabStack, snapshot].slice(-CLOSED_TAB_STACK_MAX)
  }

  /** Ctrl/⌘+Shift+T — reopen the most recently closed tab. */
  function reopenLastClosedTab() {
    const entry = closedTabStack[closedTabStack.length - 1]
    if (!entry) return
    closedTabStack = closedTabStack.slice(0, -1)
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = { ...entry, id: crypto.randomUUID(), pinned: false, state: entry.state ? { ...entry.state } : entry.state }
    tabs = [...tabs, tab]
    void activateTab(tab.id)
  }

  /** @param {string} id — keep this tab (and pinned tabs), close everything else */
  async function closeOtherTabs(id) {
    const keep = tabs.find((t) => t.id === id)
    if (!keep) return
    for (const t of tabs) if (t.id !== id && !t.pinned) rememberClosedTab(t)
    tabs = tabs.filter((t) => t.id === id || t.pinned)
    await activateTab(keep.id)
  }

  async function closeAllTabs() {
    const pinned = tabs.filter((t) => t.pinned)
    for (const t of tabs) if (!t.pinned) rememberClosedTab(t)
    if (pinned.length === 0) {
      tabs = [createWelcomeTab()]
      activeTabId = tabs[0].id
      clearTableEditor()
      return
    }
    tabs = pinned
    if (!pinned.some((t) => t.id === activeTabId)) await activateTab(pinned[0].id)
  }

  /**
   * Close a batch of tabs at once ("Close Tabs to Left/Right"). Pinned tabs are
   * skipped; a single confirm covers all unsaved changes in the batch.
   * @param {string[]} ids @param {string} anchorId — the tab whose menu was used
   */
  async function closeManyTabs(ids, anchorId) {
    saveActiveTabState()
    const idSet = new Set(ids)
    const toClose = tabs.filter((t) => idSet.has(t.id) && !t.pinned)
    if (toClose.length === 0) return
    const pending = toClose.reduce((n, t) => n + tabPendingCount(t), 0)
    if (pending > 0) {
      const ok = await askConfirm(
        `Closing these tabs discards ${pending} unsaved change${pending === 1 ? '' : 's'}. Close and discard?`,
        'Close & discard',
      )
      if (!ok) return
      for (const t of toClose) {
        const key = tabTableKey(t)
        if (key) clearPendingChanges(key)
      }
    }
    const closeSet = new Set(toClose.map((t) => t.id))
    for (const t of toClose) rememberClosedTab(t)
    const wasActiveClosed = activeTabId !== null && closeSet.has(activeTabId)
    tabs = tabs.filter((t) => !closeSet.has(t.id))
    if (wasActiveClosed) await activateTab(anchorId)
  }

  /**
   * Duplicate a table/SQL tab — a fresh tab with a deep-enough copy of the
   * source state, inserted right after the original.
   * @param {string} id
   */
  async function duplicateTab(id) {
    const src = tabs.find((t) => t.id === id)
    if (!src || (src.kind !== 'table' && src.kind !== 'sql')) return
    // Freshen the snapshot first when duplicating the live tab.
    if (id === activeTabId) saveActiveTabState()
    const fresh = tabs.find((t) => t.id === id)
    if (!fresh?.state) return
    const state =
      fresh.kind === 'table'
        ? cloneTableTabState(/** @type {TableTabState} */ (fresh.state))
        : cloneSqlTabState(/** @type {SqlTabState} */ (fresh.state))
    const copy = { id: crypto.randomUUID(), kind: fresh.kind, title: fresh.title, state }
    const idx = tabs.findIndex((t) => t.id === id)
    tabs = [...tabs.slice(0, idx + 1), copy, ...tabs.slice(idx + 1)]
    await activateTab(copy.id)
  }

  // ── Pane-layout reconciliation & group-aware actions ─────────────────────
  // AI tabs live in a full-window overlay, not the tab flow, so they never
  // belong to a group.
  /** @param {StudioTab} t */
  function isGroupable(t) {
    return t.kind !== 'ai'
  }

  /**
   * Keep `paneRoot` / `activeGroupId` consistent with `tabs` + `activeTabId`.
   * Runs from an effect on every tab/active change. Idempotent: it only assigns
   * new references when something actually changed, so it can't loop.
   */
  function reconcilePanes() {
    const ids = tabs.filter(isGroupable).map((t) => t.id)
    const idSet = new Set(ids)
    const root = untrack(() => paneRoot)
    const curGroup = untrack(() => activeGroupId)

    if (ids.length === 0) {
      if (root !== null) paneRoot = null
      if (curGroup !== null) activeGroupId = null
      return
    }

    let next = root
    if (!next) {
      next = PaneTree.makeGroup(ids, activeTabId)
    } else {
      // Drop tab ids that no longer exist and repair each group's active tab.
      next = PaneTree.mapGroups(next, (g) => {
        const kept = g.tabIds.filter((id) => idSet.has(id))
        let active = g.activeTabId
        if (!active || !idSet.has(active)) active = kept[kept.length - 1] ?? null
        if (kept.length === g.tabIds.length && active === g.activeTabId) return g
        return { ...g, tabIds: kept, activeTabId: active }
      })
      next = PaneTree.prune(next)
    }

    // Place brand-new tabs (not yet in any group) into the active group.
    const placed = new Set()
    for (const g of PaneTree.allGroups(next)) for (const id of g.tabIds) placed.add(id)
    const missing = ids.filter((id) => !placed.has(id))
    if (missing.length) {
      let targetId =
        curGroup && PaneTree.findGroup(next, curGroup) ? curGroup : PaneTree.firstGroup(next)?.id ?? null
      if (!targetId || !next) {
        next = PaneTree.makeGroup(missing, activeTabId)
      } else {
        for (const id of missing) next = PaneTree.addTabToGroup(next, targetId, id)
      }
    }

    // Focus follows the global active tab: its holding group becomes active and
    // mirrors `activeTabId`.
    let nextGroup = curGroup
    if (activeTabId && idSet.has(activeTabId)) {
      const holder = PaneTree.groupOfTab(next, activeTabId)
      if (holder) {
        nextGroup = holder.id
        if (holder.activeTabId !== activeTabId) {
          next = PaneTree.updateGroup(next, holder.id, (g) => ({ ...g, activeTabId }))
        }
      }
    }
    if (!nextGroup || !PaneTree.findGroup(next, nextGroup)) {
      nextGroup = PaneTree.firstGroup(next)?.id ?? null
    }

    if (next !== root) paneRoot = next
    if (nextGroup !== curGroup) activeGroupId = nextGroup
  }

  $effect(() => {
    // Depend on tab identity/order + the active tab.
    tabs.map((t) => t.id).join(' ')
    void activeTabId
    reconcilePanes()
  })

  /** Focus a pane (its active tab drives the live pipeline). @param {string} groupId */
  async function focusGroup(groupId) {
    if (groupId === activeGroupId) return
    const g = PaneTree.findGroup(paneRoot, groupId)
    if (!g) return
    activeGroupId = groupId
    if (g.activeTabId && g.activeTabId !== activeTabId) await activateTab(g.activeTabId)
  }

  /** Activate a tab within a specific pane (pane tab-strip click). */
  async function focusTabInGroup(groupId, tabId) {
    activeGroupId = groupId
    paneRoot = PaneTree.updateGroup(paneRoot, groupId, (g) => ({ ...g, activeTabId: tabId }))
    await activateTab(tabId)
  }

  /** Close a tab from a specific pane, keeping focus within that pane. */
  async function closeTabInGroup(groupId, id) {
    const g = PaneTree.findGroup(paneRoot, groupId)
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx < 0) return
    // Guard: closing a tab discards its unsaved edits/deletes (same as closeTab).
    const closing = tabs[idx]
    const pending = tabPendingCount(closing)
    if (pending > 0) {
      const ok = await askConfirm(
        `This table has ${pending} unsaved change${pending === 1 ? '' : 's'}. Close the tab and discard them?`,
        'Close & discard',
      )
      if (!ok) return
      if (id === activeTabId) resetEdits()
      const key = tabTableKey(closing)
      if (key) clearPendingChanges(key)
    }
    // Remember it so Reopen Closed Tab (⌘⇧T) can restore it — mirrors closeTab().
    rememberClosedTab(closing)
    const nextTabs = tabs.filter((t) => t.id !== id)
    if (nextTabs.length === 0) {
      tabs = [createWelcomeTab()]
      activeTabId = tabs[0].id
      clearTableEditor()
      return
    }
    // Pick the next tab to activate *within this group* when closing its active.
    let nextActiveId = /** @type {string | null} */ (null)
    if (id === activeTabId && g) {
      const gi = g.tabIds.indexOf(id)
      const rest = g.tabIds.filter((t) => t !== id)
      if (rest.length) {
        nextActiveId = rest[Math.min(gi, rest.length - 1)]
      } else {
        const other = PaneTree.allGroups(paneRoot).find(
          (gr) => gr.id !== groupId && gr.activeTabId && gr.activeTabId !== id,
        )
        if (other) {
          activeGroupId = other.id
          nextActiveId = other.activeTabId
        }
      }
    }
    tabs = nextTabs
    if (id === activeTabId) {
      if (nextActiveId) await activateTab(nextActiveId)
      else {
        const fallback = nextTabs[Math.min(idx, nextTabs.length - 1)]
        if (fallback) await activateTab(fallback.id)
      }
    }
  }

  /** Close the focused pane's active tab (Mod+W / editor shortcuts). */
  function closeActiveTab() {
    if (!activeTabId) return
    if (activeGroupId) void closeTabInGroup(activeGroupId, activeTabId)
    else void closeTab(activeTabId)
  }

  /** Resize a split node (splitter drag). */
  function handlePaneResize(splitId, sizes) {
    paneRoot = PaneTree.setSizes(paneRoot, splitId, sizes)
  }

  /**
   * Handle a tab dropped on a pane drop-zone: center = move into that group,
   * an edge = split that group and place the tab in the new pane.
   * @param {string} targetGroupId
   * @param {import('$lib/pane-layout.js').DropEdge} edge
   */
  function handleDropZone(targetGroupId, edge) {
    const tabId = dragTabId
    dragTabId = null
    if (!tabId || !paneRoot) return
    const source = PaneTree.groupOfTab(paneRoot, tabId)
    if (!source) return

    if (edge === 'center') {
      if (source.id === targetGroupId) {
        void focusTabInGroup(targetGroupId, tabId)
        return
      }
      let next = PaneTree.removeTab(paneRoot, tabId)
      next = PaneTree.addTabToGroup(next, targetGroupId, tabId)
      paneRoot = PaneTree.prune(next) ?? next
      void focusTabInGroup(targetGroupId, tabId)
      return
    }

    // Splitting the source into itself with only one tab is a no-op.
    if (source.id === targetGroupId && source.tabIds.length <= 1) return
    const newGroup = PaneTree.makeGroup([tabId], tabId)
    let next = PaneTree.removeTab(paneRoot, tabId)
    next = PaneTree.splitGroup(next, targetGroupId, edge, newGroup)
    paneRoot = PaneTree.prune(next) ?? next
    activeGroupId = newGroup.id
    void activateTab(tabId)
  }

  /**
   * "View data structure" from the sidebar — open the table's tab and switch
   * straight to the structure view (the structure auto-load effect fetches it).
   * @param {string} table
   */
  async function openTableStructure(table) {
    if (aiMode) exitAiMode()
    await openTableTab(activeSchema, table)
    tableViewMode = 'structure'
  }

  /** @param {string} id — pin/unpin a tab; pinned tabs group at the front */
  function toggleTabPin(id) {
    const tab = tabs.find((t) => t.id === id)
    if (!tab) return
    tab.pinned = !tab.pinned
    tabs = [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)]
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
          rowSort = null; rowSortMore = []
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
    pageSize = loadDefaultPageSize()
    rowSearch = search ?? ''
    rowSort = null
    rowSortMore = []
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
    const mySeq = ++_structureSeq
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
      if (String(e).includes('Query cancelled')) return
      toast.error('Could not load table structure', { description: String(e) })
      if (activeTable === targetTable) structureColumns = []
    } finally {
      if (mySeq === _structureSeq) loadingStructure = false
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
    if (!activeSchema || !engineSupports('enums', connection?.type)) { enums = []; return }
    try {
      const list = await listEnums(activeSchema)
      // Dedupe values defensively: enum labels are a set, but a bad introspection
      // join could return repeats, and the schema pages key their {#each} on the
      // value — a duplicate would crash the view (each_key_duplicate).
      enums = list.map((e) => ({ name: e.name ?? '', values: [...new Set(e.values ?? [])] }))
    } catch {
      enums = []
    }
  }

  async function loadTriggers() {
    if (!activeSchema || !engineSupports('triggers', connection?.type)) { triggers = []; return }
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
    if (!activeSchema || !engineSupports('sequences', connection?.type)) { sequences = []; return }
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

  // Table-list cache keyed by connection+schema. Rapid navigation (switching
  // between tabs in different schemas, reopening the sidebar) used to re-run the
  // full listTables round-trip — which includes a per-table row count — on every
  // move. A short TTL collapses those repeats while keeping counts near-live;
  // data-changing paths (connect, refresh, DDL) pass { force: true } to bypass it.
  const TABLE_LIST_TTL_MS = 3000
  /** @type {Map<string, { tables: any[], at: number }>} */
  let _tableListCache = new Map()
  // Which connection+schema the catalog sub-state (indexes/enums/triggers/
  // sequences) currently reflects — so a cached table-list hit never leaves it
  // showing another schema's catalog.
  let _catalogLoadedFor = ''

  /** @param {{ force?: boolean }} [opts] */
  async function loadTables({ force = false } = {}) {
    if (!activeSchema) {
      tables = []
      loadingTables = false
      return
    }
    // Captured once: activeSchema can change while the fetch is in flight, and
    // the background count pass must target the schema this list came from.
    const schemaAtCall = activeSchema
    const key = `${persistConnectionId ?? ''}:${schemaAtCall}`
    const cached = force ? null : _tableListCache.get(key)
    if (cached && Date.now() - cached.at < TABLE_LIST_TTL_MS) {
      tables = cached.tables
      loadingTables = false
      if (activeTable && !tables.find((t) => t.name === activeTable)) {
        activeTable = tables[0]?.name ?? null
      }
    } else {
      loadingTables = true
      error = ''
      try {
        const list = await listTables(schemaAtCall)
        tables = list
          .map((t) => ({
            name: t.name ?? t.table_name ?? '',
            rowCount: normalizeTableRowCount(t.rowCount ?? t.row_count),
            kind: t.kind ?? 'table',
            rlsEnabled: t.rlsEnabled ?? null,
          }))
          .filter((t) => t.name)
        _tableListCache.set(key, { tables, at: Date.now() })
        if (activeTable && !tables.find((t) => t.name === activeTable)) {
          activeTable = tables[0]?.name ?? null
        }
      } catch (e) {
        error = String(e)
        tables = []
      } finally {
        loadingTables = false
      }
    }
    // The list arrives with unknown (null) counts so it renders immediately;
    // resolve them with exact COUNT(*)s in the background and patch them in.
    // Covers the cached path too — a list cached mid-resolve may still hold nulls.
    const unresolved = tables.filter((t) => t.rowCount === null).map((t) => t.name)
    if (unresolved.length > 0) void resolveRowCounts(key, schemaAtCall, unresolved)
    // Reload the catalog sub-state only when it doesn't already reflect this
    // connection+schema (or on a forced reload): revisiting a schema skips these
    // four round-trips, but switching schemas still refreshes them.
    if (force || _catalogLoadedFor !== key) {
      _catalogLoadedFor = key
      void loadIndexes()
      void loadEnums()
      void loadTriggers()
      void loadSequences()
    }
  }

  /**
   * Background pass: exact counts for tables whose row count came back unknown
   * from listTables. Patches the sidebar (and the list cache) as results land.
   * Failures are ignored — counts are cosmetic and must never block the catalog.
   * @param {string} key connection:schema cache key at the time of the request
   * @param {string} schema
   * @param {string[]} names
   */
  async function resolveRowCounts(key, schema, names) {
    try {
      const counts = await getTableRowCounts(schema, names)
      if (!counts?.length) return
      // Stale guard: the user may have switched connection/schema meanwhile.
      if (`${persistConnectionId ?? ''}:${activeSchema}` !== key) return
      const byName = new Map(counts.map((c) => [c.name, normalizeTableRowCount(c.rowCount ?? c.row_count)]))
      tables = tables.map((t) => (byName.has(t.name) ? { ...t, rowCount: byName.get(t.name) ?? 0 } : t))
      const cached = _tableListCache.get(key)
      if (cached) _tableListCache.set(key, { tables, at: cached.at })
    } catch {
      /* ignore — counts fill in on the next refresh instead */
    }
  }

  async function reloadTableFromQuery(resetPage = true) {
    if (resetPage) { page = 1; rawOffset = null; _keysetCursor = null }
    await loadRows()
  }

  /** @param {string} value */
  function handleRowSearchChange(value) {
    rowSearch = value
    page = 1
    rawOffset = null
    _keysetCursor = null
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
    _keysetCursor = null
    if (filterDebounceTimer) clearTimeout(filterDebounceTimer)
    filterDebounceTimer = setTimeout(() => {
      filterDebounceTimer = null
      void loadRows()
    }, SEARCH_DEBOUNCE_MS)
  }

  /** @param {TableSort[]} sorts full ordered sort-key list ([] clears; [primary, …secondary]) */
  async function handleRowSortChange(sorts) {
    const list = Array.isArray(sorts) ? sorts.filter((s) => s?.column) : (sorts ? [sorts] : [])
    rowSort = list[0] ?? null
    rowSortMore = list.slice(1)
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
    // Persist as the session-wide default so new tabs open at this size too.
    saveDefaultPageSize(pageSize)
    await reloadTableFromQuery(true)
  }

  /** Resolve the effective fetch limit for the current pageSize. */
  const effectivePageSize = $derived(
    pageSize === PAGE_SIZE_ALL ? Math.min(total > 0 ? total : MAX_PAGE_SIZE, MAX_PAGE_SIZE) : pageSize,
  )

  /** @param {number} nextPage */
  async function handlePageChange(nextPage) {
    // Keyset/cursor/temporal: navigation is next/prev via the page's boundary
    // keys, not an offset jump. page 1 ⇔ no cursor (offset-0 first page).
    if (_keysetActive) {
      if (nextPage <= 1) {
        _keysetCursor = null
        page = 1
      } else if (nextPage > page) {
        _keysetCursor = { value: _pageLastKey, after: true }
        page = nextPage
      } else {
        _keysetCursor = { value: _pageFirstKey, after: false }
        page = nextPage
      }
      await loadRows()
      return
    }
    rawOffset = null
    page = nextPage
    await loadRows()
  }

  /** @param {number} limit @param {number} offset */
  async function handleLimitOffsetChange(limit, offset) {
    const clampedLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE)
    pageSize = clampedLimit
    // A custom limit (e.g. typing 100) also becomes the persisted default.
    saveDefaultPageSize(clampedLimit)
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
    // A fresh fetch replaces the row set, so any row-index-keyed staged changes
    // cached for this table no longer line up — drop them.
    clearPendingChanges(`${s.schema}.${s.table}`)

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

    // "All" on a large table would pull the whole set into this tab. Route the
    // active tab through loadRows (which windows it) and skip prefetch entirely
    // for large background tabs — they window on activation instead.
    if (s.pageSize === PAGE_SIZE_ALL && (s.total > WINDOW_THRESHOLD || s.total <= 0)) {
      fetchingTabIds.delete(tabId)
      if (tabId === activeTabId) await loadRows()
      return
    }

    // Keyset/cursor/temporal: route the active tab's first page through loadRows
    // so it's ordered by the key column (page 1 and cursor pages share one order).
    if (tabId === activeTabId && _keysetActive) {
      fetchingTabIds.delete(tabId)
      _keysetCursor = null
      await loadRows()
      return
    }

    try {
      // Resolve the "All" sentinel — and guard a corrupt/unset value — into a
      // real fetch limit; the backend rejects limit < 1. Mirrors effectivePageSize.
      const limit =
        s.pageSize === PAGE_SIZE_ALL
          ? Math.min(s.total > 0 ? s.total : MAX_PAGE_SIZE, MAX_PAGE_SIZE)
          : (Number.isFinite(s.pageSize) && s.pageSize > 0 ? s.pageSize : DEFAULT_PAGE_SIZE)
      const offset = s.pageSize === PAGE_SIZE_ALL ? 0 : (s.page - 1) * limit
      const { sortColumn, sortDirection, sorts } = sortForApi(s.rowSort, s.rowSortMore)
      const data = await getTableRows(s.schema, s.table, limit, offset, {
        ...apiSearch(s.rowSearch),
        sortColumn,
        sortDirection,
        sorts,
        filters: filtersForApi(s.rowFilters),
        // Paint rows now; the total (readRowsResponse -> -1 on Postgres) fills
        // in via the background count below.
        includeCount: false,
      })

      const result = {
        ...readRowsResponse(data),
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

      // Background count — keeps the tab's row fetch non-blocking. Patches the
      // tab (and global total if still active) when it resolves; -1 (non-PG /
      // failure) leaves the total readRowsResponse already set.
      void (async () => {
        try {
          const n = await countTableRows(s.schema, s.table, {
            ...apiSearch(s.rowSearch),
            filters: filtersForApi(s.rowFilters),
          })
          if (typeof n === 'number' && n >= 0) {
            patchTab({ total: n })
            if (tabId === activeTabId) total = n
          }
        } catch { /* best-effort */ }
      })()
    } catch (e) {
      const errStr = String(e)
      if (isNetworkError(errStr)) { connectionLost = true; void silentReconnect() }
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

  /** Tear down windowing (switching to a normal / small load). */
  function resetWindowing() {
    windowed = false
    _windowSeq++
    _windowLoaded = new Set()
    _windowFetching = new Set()
  }

  /** Build the shared row-query options for the current view (search/sort/filter). */
  function currentRowQuery(includeCount = false) {
    const { sortColumn, sortDirection, sorts } = sortForApi(rowSort, rowSortMore)
    return { ...apiSearch(rowSearch), sortColumn, sortDirection, sorts, filters: filtersForApi(rowFilters, columns), includeMeta: false, includeCount }
  }

  /** Fetch one window and splice it into the sparse `rows` array in place. */
  async function fetchWindow(w) {
    if (!windowed || w < 0 || _windowLoaded.has(w) || _windowFetching.has(w)) return
    const offset = w * WINDOW_FETCH
    if (offset >= total) return
    const seq = _windowSeq
    _windowFetching.add(w)
    try {
      const data = await getTableRows(activeSchema, activeTable, WINDOW_FETCH, offset, currentRowQuery(false))
      if (seq !== _windowSeq) return // table / query changed while in flight
      const fetched = data.rows ?? []
      for (let i = 0; i < fetched.length; i++) rows[offset + i] = fetched[i]
      _windowLoaded.add(w)
      dataVersion++
    } catch {
      // leave unloaded — the next visible-range emit retries
    } finally {
      _windowFetching.delete(w)
    }
  }

  /** Evict resident windows far from the viewport so memory stays bounded. */
  function evictFarWindows(firstW, lastW) {
    if (!windowed) return
    let evicted = false
    for (const w of _windowLoaded) {
      if (w < firstW - WINDOW_KEEP || w > lastW + WINDOW_KEEP) {
        const offset = w * WINDOW_FETCH
        const endI = Math.min(offset + WINDOW_FETCH, total)
        for (let i = offset; i < endI; i++) rows[i] = undefined
        _windowLoaded.delete(w)
        evicted = true
      }
    }
    if (evicted) dataVersion++
  }

  let _visRangeTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null)
  /** DataTable reports its visible row range → load nearby windows, evict far ones.
   *  Debounced so fast scrolling doesn't fire a fetch for every window flown past. */
  function handleVisibleRange(start, end) {
    if (!windowed) return
    if (_visRangeTimer) clearTimeout(_visRangeTimer)
    _visRangeTimer = setTimeout(() => {
      _visRangeTimer = null
      if (!windowed) return
      const firstW = Math.floor(start / WINDOW_FETCH)
      const lastW = Math.floor(end / WINDOW_FETCH)
      for (let w = firstW - 1; w <= lastW + 1; w++) void fetchWindow(w)
      evictFarWindows(firstW, lastW)
    }, 100)
  }

  /** Fetch the full ordered result set in chunks (windowed export/copy path). */
  async function fetchAllRows(onProgress) {
    /** @type {any[]} */
    const out = []
    for (let off = 0; off < total; off += WINDOW_FETCH) {
      const data = await getTableRows(activeSchema, activeTable, WINDOW_FETCH, off, currentRowQuery(false))
      const r = data.rows ?? []
      for (let i = 0; i < r.length; i++) out.push(r[i])
      onProgress?.(out.length)
      if (r.length < WINDOW_FETCH) break
    }
    return out
  }

  /**
   * @param {{ keepScroll?: boolean }} [opts]
   *   keepScroll — used by live refresh: re-run the *current* query (filters,
   *   sort, search, page from global state) but update rows in place without
   *   jumping the grid to the top or closing the row inspector.
   */
  async function loadRows({ keepScroll = false } = {}) {
    if (!activeTable) {
      columns = []
      rows = []
      _infiniteRows = []
      total = 0
      return
    }
    const seq = ++_loadSeq
    _windowSeq++ // discard any window fetches in flight from a prior query
    loadingRows = true
    _infiniteRows = []
    if (!keepScroll) {
      selected = new Set()
      focusedRow = null
      inspectorRow = null
      editingCell = null
    }
    error = ''
    try {
      const offset = currentOffset
      let { sortColumn, sortDirection, sorts } = sortForApi(rowSort, rowSortMore)
      // Keyset/cursor/temporal: force ordering by the key column (so page 1 and
      // subsequent cursor pages share one total order) and send the cursor. When
      // inactive this is all skipped and it's plain OFFSET.
      const ksActive = _keysetActive
      let keysetArg = null
      if (ksActive) {
        sortColumn = _keysetKeyCol
        sortDirection = _keysetDesc ? 'desc' : 'asc'
        sorts = []
        if (_keysetCursor && _keysetCursor.value != null) {
          keysetArg = {
            column: _keysetKeyCol,
            value: String(_keysetCursor.value),
            sqlType: _keysetKeyType,
            after: _keysetCursor.after,
            desc: _keysetDesc,
          }
        }
      }
      // Catalog metadata (pk/fk/enums/nullable) only changes when the table's
      // structure does, so request it only on the first load of a table; repeat
      // fetches (pagination, sort, filter, live) reuse what we already hold,
      // skipping several round-trips per fetch.
      const includeMeta = columns.length === 0
      // Window only in "All" mode on a large set — fixed page sizes still
      // paginate exactly as before. When windowing we cap the first fetch to one
      // window and ask for the count up front (needed to size the sparse array).
      const wantsWindow = pageSize === PAGE_SIZE_ALL && effectivePageSize > WINDOW_THRESHOLD
      const data = await getTableRows(
        activeSchema, activeTable,
        wantsWindow ? WINDOW_FETCH : effectivePageSize,
        wantsWindow ? 0 : offset,
        {
          ...apiSearch(rowSearch),
          sortColumn,
          sortDirection,
          sorts,
          filters: filtersForApi(rowFilters, columns),
          keyset: keysetArg,
          includeMeta,
          // Don't wait on COUNT(*) — paint rows now, count streams in below.
          // Windowed loads need the total immediately to size the sparse array.
          includeCount: wantsWindow,
        })
      if (seq !== _loadSeq) return
      const nextColumns = data.columns ?? []
      // Update column shape whenever it actually changes (e.g. a column was
      // added/dropped) even on a metadata-skipping fetch; otherwise keep the
      // richer existing columns (which carry enum/nullable info).
      if (nextColumns.length && !sameColumnShape(columns, nextColumns)) columns = nextColumns
      if (includeMeta) {
        if (activeTable) {
          lruSet(tableColumnsCache, `${activeSchema}.${activeTable}`, columns)
        }
        primaryKey = data.primaryKey ?? data.primary_key ?? []
        foreignKeys = normalizeForeignKeys(data.foreignKeys ?? data.foreign_keys)
      }
      const fetched = data.rows ?? []
      const windowTotal = wantsWindow ? Number(data.total ?? 0) : 0
      if (wantsWindow && windowTotal > WINDOW_THRESHOLD) {
        // Sparse windowed array: length = total, only window 0 loaded so far.
        _windowSeq++
        _windowLoaded = new Set([0])
        _windowFetching = new Set()
        windowed = true
        const arr = new Array(windowTotal)
        for (let i = 0; i < fetched.length; i++) arr[i] = fetched[i]
        rows = arr
        _infiniteRows = []
        total = windowTotal
        dataVersion++
      } else if (wantsWindow) {
        // Below the windowing bar after counting — load the remainder in full.
        resetWindowing()
        if (windowTotal > fetched.length) {
          const restData = await getTableRows(activeSchema, activeTable, Math.min(windowTotal - fetched.length, MAX_PAGE_SIZE), fetched.length, currentRowQuery(false))
          if (seq !== _loadSeq) return
          rows = [...fetched, ...(restData.rows ?? [])]
        } else {
          rows = fetched
        }
        _infiniteRows = rows
        total = windowTotal
      } else {
        resetWindowing()
        rows = fetched
        _infiniteRows = fetched
        // total = -1 means "counting" (Postgres, non-blocking). Other engines
        // return a real total here; refreshRowCount() then no-ops for them.
        total = Number(data.total ?? 0)
      }
      queryMs = Number(data.queryMs ?? data.query_ms ?? 0)
      // Record this page's boundary key values so next/prev can build cursors.
      if (ksActive && _keyColIndex >= 0) {
        _pageFirstKey = rows.length ? rows[0]?.[_keyColIndex] : null
        _pageLastKey = rows.length ? rows[rows.length - 1]?.[_keyColIndex] : null
      }
      // Live refresh updates in place — only reset scroll for user-driven loads
      // (page/filter/sort/search), where jumping to the top is expected.
      if (!keepScroll) reloadToken++
      if (total >= 0) {
        const maxPage = Math.max(1, Math.ceil(total / effectivePageSize) || 1)
        if (page > maxPage) page = maxPage
      }
      // Fire-and-forget: fill the total in the background so the count never
      // delays the rows. Windowed loads already have a real total from the fetch.
      if (!windowed) void refreshRowCount(seq)
    } catch (e) {
      if (seq !== _loadSeq) return
      const errStr = String(e)
      if (isNetworkError(errStr)) { connectionLost = true; void silentReconnect() }
      error = errStr
      resetWindowing()
      columns = []
      primaryKey = []
      foreignKeys = []
      rows = []
      _infiniteRows = []
      total = 0
      recordActivity({ type: 'row_fetch', title: `Failed to load ${activeTable}`, schema: activeSchema, table: activeTable ?? undefined, success: false, error: errStr })
    } finally {
      if (seq === _loadSeq) loadingRows = false
    }
  }

  /**
   * Background row-count pass for the main grid. Runs after loadRows() has
   * already painted the rows, so COUNT(*) never blocks the initial view. The
   * _loadSeq token drops results from a superseded load (fast tab/filter
   * switches). Returns -1 on non-Postgres engines / failure — in which case the
   * total set by loadRows() is kept untouched.
   * @param {number} seq
   */
  async function refreshRowCount(seq) {
    if (!activeTable) return
    try {
      const n = await countTableRows(activeSchema, activeTable, {
        ...apiSearch(rowSearch),
        filters: filtersForApi(rowFilters, columns),
      })
      if (seq !== _loadSeq) return
      if (typeof n === 'number' && n >= 0) {
        total = n
        const maxPage = Math.max(1, Math.ceil(total / effectivePageSize) || 1)
        if (page > maxPage) page = maxPage
      }
    } catch { /* count is best-effort — leave the current total as-is */ }
  }

  async function handleLoadMore() {
    if (windowed) return // windowed mode loads via handleVisibleRange, not append
    if (!infiniteScroll || !activeTable || loadingRows || loadingMore) return
    if (total >= 0 && _infiniteRows.length >= total) return
    loadingMore = true
    try {
      const offset = _infiniteRows.length
      const { sortColumn, sortDirection, sorts } = sortForApi(rowSort, rowSortMore)
      const data = await getTableRows(activeSchema, activeTable, effectivePageSize, offset, {
        ...apiSearch(rowSearch),
        sortColumn,
        sortDirection,
        sorts,
        filters: filtersForApi(rowFilters, columns),
      })
      const fetched = data.rows ?? []
      if (!fetched.length) return
      // Append in place — spreading the whole accumulated array on every page was
      // O(n) per load (O(n²) over a scroll session). Pages are page-size (small),
      // so push() is cheap and the proxied $state array still notifies the grid.
      for (let i = 0; i < fetched.length; i++) _infiniteRows.push(fetched[i])
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
    saveInfiniteScroll(infiniteScroll)
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
      if (columnType(a[i]) !== columnType(b[i])) return false
    }
    return true
  }

  /** @param {'csv' | 'json'} format */
  let exportingData = $state(false)

  async function handleExport(format) {
    if (exportingData) return
    exportingData = true
    // Windowed results keep only a few resident windows, so read the full
    // ordered set from the server for export instead of the sparse client array.
    let sourceRows = rows
    if (windowed) {
      const fetchId = toast.info('Fetching all rows for export…', { duration: 60 * 60 * 1000 })
      try {
        sourceRows = await fetchAllRows()
      } catch (e) {
        toast.dismiss(fetchId)
        exportingData = false
        toast.error('Export failed', { description: String(e) })
        return
      }
      toast.dismiss(fetchId)
    }
    const exportRows = (selected.size > 0 && selected.size < sourceRows.length)
      ? [...selected].sort((a, b) => a - b).map((i) => sourceRows[i]).filter(Boolean)
      : sourceRows
    // Export only the columns the user has left visible. Rows are positional
    // arrays, so filter the column list AND project each row's cells by the
    // original column index (mirrors dataViewRows for the json/text views).
    const visibleIdxs = columns.map((_, i) => i).filter((i) => !hiddenColumns.has(columns[i].name))
    const exportColumns = visibleIdxs.map((i) => columns[i])
    const exportCells = visibleIdxs.length === columns.length
      ? exportRows
      : exportRows.map((r) => visibleIdxs.map((i) => r[i]))
    const filename = buildExportFilename(activeTable, format)
    const n = exportRows.length
    // Small exports build instantly; only large ones need the async/progress path.
    const LARGE = 20000
    exportingData = true
    // A persistent toast that stays up for the whole build/save, dismissed on completion.
    const toastId = toast.info(`Exporting ${formatCompactCount(n)} rows…`, {
      description: `Preparing ${format.toUpperCase()} — please wait`,
      duration: 60 * 60 * 1000,
    })
    try {
      // Yield once so the toast paints before any heavy synchronous work.
      await new Promise((res) => setTimeout(res, 16))
      /** @type {string} */
      let content
      if (n > LARGE) {
        content = format === 'csv'
          ? await rowsToCsvAsync(exportColumns, exportCells)
          : await rowsToJsonAsync(exportColumns, exportCells)
      } else {
        content = format === 'csv' ? rowsToCsv(exportColumns, exportCells) : rowsToJson(exportColumns, exportCells)
      }
      const saved = await saveExportFile(content, filename, format)
      toast.dismiss(toastId)
      if (saved) {
        toast.success(`Exported ${formatCompactCount(n)} rows`, { description: filename })
        recordActivity({ type: 'export', title: `Exported ${activeTable} as ${format.toUpperCase()}`, schema: activeSchema, table: activeTable ?? undefined, rowCount: n, success: true, detail: filename })
      }
    } catch (e) {
      toast.dismiss(toastId)
      toast.error('Export failed', { description: String(e) })
      recordActivity({ type: 'export', title: `Failed to export ${activeTable} as ${format.toUpperCase()}`, schema: activeSchema, table: activeTable ?? undefined, success: false, error: String(e) })
    } finally {
      exportingData = false
    }
  }

  /**
   * Execute SQL in the editor. With `overrideSql` (run-statement-at-cursor,
   * ⌘R), only that statement runs; otherwise the whole editor buffer runs.
   * @param {string} [overrideSql]
   */
  async function runSql(overrideSql) {
    const sqlRan = typeof overrideSql === 'string' && overrideSql.trim() ? overrideSql : sqlText
    if (!connection || !sqlRan.trim()) return
    if (tableReadonly && /^\s*(insert|update|delete|drop|truncate|alter|create|replace)\b/i.test(sqlRan)) {
      sqlError = 'Connection is read-only — write queries are blocked.'
      return
    }
    sqlLoading = true
    sqlError = ''
    sqlMessage = ''
    sqlColumns = []
    sqlRows = []
    sqlMultiResults = []
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
      if (isNetworkError(sqlError)) { connectionLost = true; void silentReconnect() }
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
    tableReadonly = savedConnections.find(c => c.id === savedId)?.readOnly ?? conn.readOnly ?? false
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
    // The connection is live: render the shell NOW (setting `connection` above
    // dropped the reconnect overlay) with the welcome tab open and the sidebar
    // in its skeleton state, and let the catalog stream in below. This is what
    // makes reconnect feel instant — the overlay no longer waits on the
    // schema/table/row-count round trips.
    tabs = []
    openWelcomeTab()
    loadingTables = true
    // Query history + saved queries only depend on the connection id, not on the
    // catalog, so kick them off concurrently with the schema/table load instead
    // of waiting behind it. Errors are non-fatal (history is best-effort).
    const storesReady = refreshQueryStores().catch(() => {})
    // Schema → tables is a genuine dependency (loadTables needs activeSchema), so
    // this pair stays serial. The retry loop only sleeps when the backend isn't
    // ready yet (schemas come back empty); the happy path succeeds on attempt 0.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 700))
      await loadSchemas()
      if (schemas.length > 0) break
    }
    await loadTables({ force: true })
    // Retry only when the fetch actually failed — an empty database is a valid
    // result and must not pay a 1 s penalty on every connect.
    if (tables.length === 0 && schemas.length > 0 && error) {
      await new Promise(r => setTimeout(r, 1000))
      await loadTables({ force: true })
    }
    // MCP autostart is independent of the catalog — don't block first render on it.
    void (async () => {
      try {
        const { loadSettings } = await import('$lib/stores/settings.js')
        if (loadSettings().mcpAutoStart) {
          const s = await mcpStart()
          mcpRunning = s.running
        }
      } catch { /* ignore */ }
    })()
    await storesReady
  }

  onMount(() => installInputShortcuts())

  // Warm the lazy page/panel chunks during browser idle time so the first
  // navigation to a tab is instant instead of paying a cold chunk fetch+parse.
  // These chunks pull in heavy deps (monaco, echarts, marked+shiki), so we warm
  // ONE per idle slot — never blocking interaction. Ordered by how commonly each
  // is opened; the monaco-backed editors come first since they dominate latency.
  // If the user opens a page sooner, import() dedups to the same promise and
  // resolves immediately. Fire-and-forget; failures are harmless.
  //
  // Keep these specifiers identical to the {#await import('./X.svelte')} blocks
  // below so Vite resolves them to the same chunk.
  onMount(() => {
    const warmers = [
      () => import('./SqlConsole.svelte'),       // monaco
      () => import('./AiSidebar.svelte'),        // marked + shiki
      () => import('./AiChat.svelte'),           // marked + shiki
      () => import('./OrmRunner.svelte'),        // monaco
      () => import('./ChartsPage.svelte'),       // echarts
      () => import('./DashboardPage.svelte'),
      () => import('./SecurityPage.svelte'),
      () => import('./DiagramsPage.svelte'),     // echarts
      () => import('./EntityRelationPage.svelte'),
      () => import('./DataDiffPage.svelte'),     // monaco
      () => import('./NotebookEditor.svelte'),
      () => import('./JsonViewerPage.svelte'),
      () => import('./ExtensionsPage.svelte'),
    ]
    const ric = window.requestIdleCallback ?? ((/** @type {Function} */ fn) => setTimeout(() => fn(), 200))
    const cancel = window.cancelIdleCallback ?? clearTimeout
    let i = 0
    let handle = 0
    const pump = () => {
      if (i >= warmers.length) return
      warmers[i++]().catch(() => {})
      handle = ric(pump, { timeout: 3000 })
    }
    handle = ric(pump, { timeout: 3000 })
    return () => cancel(handle)
  })

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

    // Respect the "auto reconnect on startup" setting — if disabled, go straight
    // to the connection modal instead of re-connecting silently.
    if (!loadSettings().autoReconnectOnStartup) { showConnectionModal = true; return }

    autoConnecting = true
    /** @param {Promise<unknown>} p */
    const withTimeout = (p) => Promise.race([
      p,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timed out')), 5000)),
    ])
    try {
      if (last.type === 'sqlite') await withTimeout(connectSqlite(last))
      else if (last.type === 'd1') await withTimeout(connectD1(last))
      else if (last.type === 'libsql') await withTimeout(connectLibSql(last))
      else if (last.type === 'mysql' || last.type === 'mariadb') await withTimeout(connectMysql(last))
      else if (last.type === 'clickhouse') await withTimeout(connectClickhouse(last))
      else if (last.type === 'duckdb') await withTimeout(connectDuckdb(last))
      else if (last.type === 'mssql') await withTimeout(connectMssql(last))
      else await withTimeout(connectPostgres(last))
      // onConnected already refreshes the query stores (concurrently with the
      // catalog load) — no second fetch needed here.
      await onConnected(last, last.id)
    } catch {
      showConnectionModal = true
    } finally {
      autoConnecting = false
    }
  })

  async function handleSchemaChange(schema) {
    if (!schema || schema === activeSchema) return
    if (connectionLost) await reconnectPool()
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
    // Switching tables should transparently heal a dropped connection.
    if (connectionLost) await reconnectPool()
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

  /**
   * Re-establish the backend pool for a saved connection, dispatched by engine.
   * Shared by the explicit switch flow and the silent auto-reconnect path.
   * @param {import('$lib/stores/connections.js').SavedConnection} conn
   */
  async function connectByType(conn) {
    const { connectPostgres, connectSqlite, connectD1, connectLibSql, connectMysql, connectClickhouse, connectDuckdb, connectMssql } = await import('$lib/api.js')
    if (conn.type === 'sqlite') await connectSqlite(conn)
    else if (conn.type === 'd1') await connectD1(conn)
    else if (conn.type === 'libsql') await connectLibSql(conn)
    else if (conn.type === 'mysql' || conn.type === 'mariadb') await connectMysql(conn)
    else if (conn.type === 'clickhouse') await connectClickhouse(conn)
    else if (conn.type === 'duckdb') await connectDuckdb(conn)
    else if (conn.type === 'mssql') await connectMssql(conn)
    else await connectPostgres(conn)
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
      await connectByType(conn)
      await onConnected(conn, conn.id)
    } catch (e) {
      error = String(e)
      showConnectionModal = true
    } finally {
      autoConnecting = false
    }
  }

  // ── Silent auto-reconnect ──────────────────────────────────────────────────
  // Heals a dropped connection IN PLACE — rebuilds the backend pool for the
  // CURRENT connection config, with no UI teardown, no full-screen overlay, and
  // no toast. The health monitor, an `online` event, a table switch, a refresh,
  // or a failed query can all trigger this, so the app recovers by itself instead
  // of nagging the user with a "Connection lost / Reconnect" popup.
  let _reconnecting = false
  let _lastReconnectAt = 0
  /** Rebuild the pool for the active connection. Returns true on success. */
  async function reconnectPool() {
    const conn = connection
    if (!conn) return false
    try {
      await connectByType(conn)
      connectionLost = false
      return true
    } catch {
      return false
    }
  }
  /** Rate-limited silent reconnect + quiet refetch, for background triggers. */
  async function silentReconnect() {
    if (_reconnecting || !connection) return
    // Coalesce bursts of triggers (online + visibilitychange + ping fire together)
    // and stop a still-unreachable host from hammering connect_* in a tight loop.
    const now = Date.now()
    if (now - _lastReconnectAt < 3000) return
    _lastReconnectAt = now
    _reconnecting = true
    try {
      if (await reconnectPool()) {
        error = ''
        if (activeTab?.kind === 'table' && activeTable) await loadRows().catch(() => {})
        else await loadTables().catch(() => {})
      }
    } finally {
      _reconnecting = false
    }
  }

  async function handleRefresh() {
    // A manual refresh should also recover a dropped connection.
    if (connectionLost) await reconnectPool()
    await loadSchemas()
    await loadTables({ force: true })
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
      toast.error('Could not truncate table', { description: String(err) })
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
      await loadTables({ force: true })
      if (activeTable === tableName) {
        activeTable = null
      }
    } catch (err) {
      toast.error('Could not drop', { description: String(err) })
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
      toast.error('Could not export', { description: String(e) })
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
      toast.error('Could not export', { description: String(e) })
    }
  }

  /** @param {string} tableName */
  async function handleGenerateTestData(tableName) {
    try {
      const cols = await getTableColumnStructure(activeSchema, tableName)
      const colNames = cols.map((c) => `"${c.name}"`).join(',\n  ')
      const colPlaceholders = cols.map((c) => {
        const t = columnType(c)
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
      toast.error('Could not insert row', { description: String(err) })
      throw err
    } finally {
      insertingRow = false
    }
  }

  /**
   * Run raw DML that the user hand-edited in the "Review changes" preview, then
   * refetch the current page so the grid reflects it.
   * @param {string} sql
   */
  async function handleExecuteRawDml(sql) {
    if (!sql.trim()) return
    const _start = Date.now()
    try {
      await executeSqlMulti(sql)
      recordActivity({ type: 'row_save', title: `Applied edited SQL${activeTable ? ` on ${activeTable}` : ''}`, schema: activeSchema, table: activeTable ?? '', durationMs: Date.now() - _start, success: true })
      await loadRows()
      toast.success('Changes applied')
    } catch (err) {
      recordActivity({ type: 'row_save', title: `Failed edited SQL${activeTable ? ` on ${activeTable}` : ''}`, schema: activeSchema, table: activeTable ?? '', success: false, error: String(err) })
      toast.error('Could not apply changes', { description: String(err) })
      throw err
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
<ConnectionModal bind:open={showConnectionModal} onconnected={(conn, id) => onConnected(conn, id)} maxConnections={$hasPro ? Infinity : FREE_CONNECTION_LIMIT} />
<DisconnectDialog bind:open={showDisconnectDialog} connectionName={connection ? (connection.name || connection.database || connection.host || connection.filePath || 'Connected') : ''} ondisconnect={handleDisconnect} />
<CreateTableDialog
  bind:open={showCreateTableDialog}
  {activeSchema}
  dbType={dbType}
  onexecute={async (sql) => { await executeSql(sql) }}
  oncreated={async () => { await loadTables({ force: true }) }}
/>
<CreateSchemaDialog
  bind:open={showCreateSchemaDialog}
  existingSchemas={schemas}
  onexecute={async (sql) => {
    try { await executeDdl(sql) }
    catch (e) { toast.error('Could not create schema', { description: String(e) }); throw e }
  }}
  oncreated={async (schemaName) => {
    toast.success(`Schema "${schemaName}" created`)
    await loadSchemas()
    await handleSchemaChange(schemaName)
  }}
/>
<GenerateSqlDialog
  bind:open={generateSqlOpen}
  schema={activeSchema}
  table={generateSqlTable}
  dialect={dbType}
  onopeninsql={(sql) => { if (aiMode) exitAiMode(); void openQueryInEditor(sql) }}
/>
<FindReplaceDialog
  bind:open={findReplaceOpen}
  {columns}
  {rows}
  tableName={activeTable}
  onapply={handleFindReplaceApply}
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
  onopenlicense={() => openLicenseTab()}
/>

<AiSettingsDialog bind:open={showAiModelSettings} />

<KeyboardShortcutsDialog bind:open={showShortcutsModal} />

<DdlDialog
  bind:open={ddlDialogOpen}
  tableName={ddlDialogTable}
  ddl={ddlDialogSql}
  onopeninsql={(sql) => { if (aiMode) exitAiMode(); void openQueryInEditor(sql) }}
/>

<InsiderDialog bind:open={showInsiderModal} />

<AboutDialog bind:open={showAboutModal} onopenreport={() => (showReportIssueDialog = true)} />
<ReportIssueDialog bind:open={showReportIssueDialog} />

<Dialog.Root bind:open={showProGate} closeOnEscape={true} closeOnOutsideClick={true}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
    <Dialog.Content class="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border/60 bg-popover p-6 shadow-2xl outline-none">
      <div class="mb-5 flex size-10 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10">
        <Lock class="size-5 text-amber-500/80" />
      </div>
      <h2 class="mb-1.5 text-sm font-semibold text-foreground">Stroke Pro required</h2>
      <p class="mb-5 text-[12px] leading-relaxed text-muted-foreground">This feature is not available on the free plan. Upgrade to Stroke Pro to unlock AI, dashboards, ORM runner, schema explorer, and more.</p>
      <div class="flex items-center gap-2">
        <button
          onclick={() => (showProGate = false)}
          class="flex h-8 flex-1 items-center justify-center rounded-lg border border-border/60 bg-muted/50 px-4 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Back
        </button>
        <button
          onclick={() => {
            showProGate = false
            openLicenseTab()
          }}
          class="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground px-4 text-[12px] font-medium text-background transition-colors hover:bg-foreground/90"
        >
          <KeyRound class="size-3" />
          Activate Pro
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

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
  readonly={tableReadonly}
  onreadonlytoggle={() => { tableReadonly = !tableReadonly }}
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
  onopeninsights={() => { if (aiMode) exitAiMode(); openInsightsTab() }}
  ontogglequerylog={() => { commandOpen = false; queryLogOpen = !queryLogOpen }}
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
  schemaContext={aiSchemaContext}
  onaskcontinue={handleAskContinue}
/>


{#if autoConnecting && !connection}
  <!-- Only covers the actual connect handshake: onConnected sets `connection`
       the moment the backend confirms, which drops this overlay and lets the
       catalog (schemas/tables/counts) stream into the sidebar skeletons. -->
  <div
    class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 bg-background"
    out:fade={{ duration: 200 }}
  >
    <!-- Spinning ring + logo -->
    <div class="relative flex size-[88px] items-center justify-center">
      <svg class="absolute inset-0 size-full animate-spin" viewBox="0 0 88 88" fill="none" aria-hidden="true">
        <circle cx="44" cy="44" r="42" stroke="currentColor" stroke-width="1.5"
          stroke-dasharray="44 220" stroke-linecap="round"
          class="text-foreground/20" />
      </svg>
      <div class="flex size-[72px] items-center justify-center rounded-full border border-border/60 bg-card ring-1 ring-inset ring-white/[0.04] shadow-[0_10px_30px_-14px_rgba(0,0,0,0.7)]">
        <Logo class="size-9" />
      </div>
    </div>

    <!-- Text -->
    <div class="flex flex-col items-center gap-1.5 text-center">
      <p class="text-[13px] font-medium text-foreground/70">Reconnecting</p>
      <p class="text-[11px] text-muted-foreground/35">Establishing database connection…</p>
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
      class:order-last={sidebarSide === 'right'}
      style={sidebarOpen && !aiMode && connection ? '' : 'display:none'}
      inert={!sidebarOpen || aiMode || !connection || undefined}
    >
      <svelte:boundary>
        {#snippet failed(err, reset)}
          <div class="flex h-full w-[220px] shrink-0 flex-col items-center justify-center gap-3 border-r border-border/50 bg-sidebar p-4 text-center">
            <AlertTriangle class="size-5 text-destructive/60" />
            <p class="text-ui-xs font-medium text-muted-foreground">Sidebar error</p>
            <button
              type="button"
              class="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-ui-xs font-medium transition-colors hover:bg-accent"
              onclick={reset}
            >Reload</button>
          </div>
        {/snippet}
      <Sidebar
        connectionName={connection ? (connection.name || connection.database || connection.host || connection.filePath || 'Connected') : ''}
        side={sidebarSide}
        onmoveside={moveSidebar}
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
        onviewstructure={(t) => void openTableStructure(t)}
        onexportsql={(t) => void handleExportSql(t)}
        onexportdata={(t) => void handleExportData(t)}
        onopeninconsole={handleOpenTableInConsole}
        ongeneratesql={handleGenerateSql}
        onopentableerd={(t) => { if (aiMode) exitAiMode(); openErdTab(t) }}
        oncountrows={(t) => void handleCountRows(t)}
        oncopycolumns={(t) => void handleCopyColumns(t)}
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
      </svelte:boundary>
    </div>
  {/if}

  <main class="flex min-h-0 min-w-0 flex-1 flex-col bg-panel" data-studio-region="main">
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

        <!-- Supported engines — real brand marks -->
        <div class="relative flex flex-wrap items-center justify-center gap-2">
          {#each [['postgres','PostgreSQL'],['mysql','MySQL'],['sqlite','SQLite'],['clickhouse','ClickHouse'],['d1','Cloudflare D1']] as [id, label]}
            <span class="inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/20 py-1.5 pl-2.5 pr-3.5 text-ui-xs font-medium text-muted-foreground/85 transition-colors hover:border-border hover:text-foreground">
              <DbIcon {id} class="size-4 text-muted-foreground/70" />
              {label}
            </span>
          {/each}
        </div>

        <div class="relative flex flex-col items-center gap-4 pt-1">
          <Button
            type="button"
            class="h-11 rounded-xl px-6 text-sm font-semibold shadow-sm"
            onclick={() => (showConnectionModal = true)}
          >
            <Plus class="size-4" />
            Add connection
          </Button>
          <p class="flex items-center gap-1.5 text-ui-xs text-muted-foreground/70">
            or press
            <kbd>⌘K</kbd>
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
            <svelte:boundary failed={tabError}>
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
            </svelte:boundary>
          {/await}
        </div>
      {/if}

      {#if aiMode}
        <!-- AI mode: tabs + content hidden above via always-mounted block -->
      {:else}

      <!-- Split-pane workspace. A single group renders exactly like the classic
           single-tab layout (the sole focused leaf renders `sharedContent`);
           splitting adds sibling panes. -->
      {#if paneRoot}
        <PaneLayout
          node={paneRoot}
          focusedGroupId={activeGroupId}
          multiPane={paneCount > 1}
          {dropTarget}
          renderGroup={groupPane}
          onresize={handlePaneResize}
          onfocusgroup={(gid) => void focusGroup(gid)}
        />
      {:else}
        {#if tabBarVisible}
          <TabBar
            tabs={tabs.filter((t) => t.kind !== 'ai')}
            {activeTabId}
            onselect={(id) => activateTab(id)}
            onclose={closeTab}
            oncloseothers={closeOtherTabs}
            oncloseall={closeAllTabs}
            onclosemany={(ids, anchorId) => void closeManyTabs(ids, anchorId)}
            onduplicate={(id) => void duplicateTab(id)}
            onresettable={(id) => void resetTableTab(id)}
            onreopenclosed={reopenLastClosedTab}
            canreopenclosed={closedTabStack.length > 0}
            onpintoggle={toggleTabPin}
            onnew={openWelcomeTab}
            {recentTabs}
            onrecentselect={(schema, table) => { if (aiMode) exitAiMode(); void openTableTab(schema, table) }}
          />
        {/if}
        {@render sharedContent()}
      {/if}

      {#snippet groupPane(/** @type {import('$lib/pane-layout.js').GroupNode} */ group, /** @type {boolean} */ isFocused)}
        {#if tabBarVisible}
          <TabBar
            tabs={group.tabIds.map((id) => tabsById.get(id)).filter(Boolean)}
            activeTabId={group.activeTabId}
            onselect={(id) => void focusTabInGroup(group.id, id)}
            onclose={(id) => void closeTabInGroup(group.id, id)}
            oncloseothers={closeOtherTabs}
            oncloseall={closeAllTabs}
            onclosemany={(ids, anchorId) => void closeManyTabs(ids, anchorId)}
            onduplicate={(id) => void duplicateTab(id)}
            onresettable={(id) => void resetTableTab(id)}
            onreopenclosed={reopenLastClosedTab}
            canreopenclosed={closedTabStack.length > 0}
            onpintoggle={toggleTabPin}
            onnew={() => { void focusGroup(group.id); openWelcomeTab() }}
            {recentTabs}
            onrecentselect={(schema, table) => { if (aiMode) exitAiMode(); void focusGroup(group.id).then(() => openTableTab(schema, table)) }}
            ondragtabstart={(id) => beginTabDrag(id)}
            ondragtabmove={(x, y) => moveTabDrag(x, y)}
            ondragtabend={() => endTabDrag()}
          />
        {/if}
        {#if isFocused}
          {@render sharedContent()}
        {:else}
          <PaneSnapshot tab={tabsById.get(group.activeTabId ?? '') ?? null} toolbarSpacer={tableToolbarVisible} />
        {/if}
      {/snippet}

      {#snippet sharedContent()}
      {#if activeTab?.kind === 'ai'}
        <!-- AI is handled via AI mode toggle -->
      {:else if activeTab?.kind === 'schema'}
        <svelte:boundary failed={tabError}>
          <SchemaPage
            schema={activeSchema}
            connectionType={connection?.type ?? null}
            {indexes}
            {enums}
            {triggers}
            {sequences}
            {tables}
            loading={loadingTables}
            active={activeTab?.kind === 'schema'}
            onrefresh={async () => { await loadSchemas(); await loadTables({ force: true }) }}
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
              <SecurityPage bind:this={securityPageRef} active={activeTab?.kind === 'security'} connectionType={connection?.type ?? null} />
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

      <!-- Instance Insights tab - mount once, keep alive -->
      {#if insightsEverOpened}
        <div
          class={activeTab?.kind === 'insights' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          inert={activeTab?.kind !== 'insights' || undefined}
        >
          <svelte:boundary failed={tabError}>
            <InstanceInsightsPage active={activeTab?.kind === 'insights'} connectionName={connection?.name ?? connection?.database ?? ''} {dbType} />
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

      <!-- License tab — rarely opened, no keep-alive needed -->
      {#if activeTab?.kind === 'license'}
        <div class="flex min-h-0 flex-1 flex-col">
          <svelte:boundary failed={tabError}>
            {#await import('./LicensePage.svelte')}<TabLoading />{:then { default: LicensePage }}
              <LicensePage onactivated={closeLicenseTab} />
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
                focusTable={erdFocusTable}
                onclearfocus={() => (erdFocusTable = '')}
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
              dialect={dbType}
              active={activeTab?.kind === 'search'}
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
            onmodw={() => closeActiveTab()}
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
            onmods={() => saveActiveTabState()}
            onmodi={() => { if (connection) toggleAiSidebar() }}
            onmodb={() => { sidebarOpen = !sidebarOpen }}
            onmodw={() => closeActiveTab()}
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
            onprorequired={() => (showProGate = true)}
          />
          {/await}
          </svelte:boundary>
        </div>
      {/if}

      {#if activeTab?.kind === 'table'}
        {#if error}
          {#if isNetworkError(error)}
            <!-- ── Network / offline error — full-area friendly state ── -->
            <div class="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <WifiOff class="size-8 text-muted-foreground/20" />
              <div class="space-y-1">
                <p class="font-mono text-ui font-medium text-foreground/70">Cannot reach database</p>
                <p class="font-mono text-ui-xs text-muted-foreground/50">Check your internet connection or whether the server is reachable.</p>
              </div>
              <button
                type="button"
                class="flex items-center gap-1.5 rounded-md border border-border/30 bg-muted/30 px-3 py-1.5 font-mono text-ui-xs text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground"
                onclick={() => { error = ''; connectionLost = false; void loadRows() }}
              >
                <RefreshCw class="size-3" />
                Retry
              </button>
            </div>
          {:else}
            <!-- ── SQL / application error — compact banner ── -->
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
        {/if}

        {#if !activeTable}
          <div class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <p class="font-mono text-ui text-muted-foreground">
              Select a table from the sidebar or press
              <kbd>⌘K</kbd>
            </p>
          </div>
        {:else if error && !isNetworkError(error)}
          <div class="flex flex-1 items-center justify-center">
            <p class="font-mono text-ui-sm text-muted-foreground/40">Dismiss the error above to continue.</p>
          </div>
        {:else if !error}
          {#if tableViewMode === 'structure' && canShowStructure}
            {#if tableToolbarVisible}
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
            {/if}
            <StructureView
              schema={activeSchema}
              table={activeTable ?? ''}
              connectionType={connection?.type ?? null}
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
          {#if tableToolbarVisible}
          <TableToolbar
            bind:this={tableToolbar}
            bind:filterBarOpen
            bind:tableViewMode
            bind:dataViewMode
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
            {rowSortMore}
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
            keysetMode={_keysetActive}
            keysetHasMore={rows.length >= effectivePageSize}
            onlimitoffsetchange={(l, o) => void handleLimitOffsetChange(l, o)}
            {infiniteScroll}
            oninfinitescrolltoggle={toggleInfiniteScroll}
            live={liveEnabled}
            {searchOptions}
            onsearchoptionschange={handleSearchOptionsChange}
            searchOptionsSupported={searchOptsSupported}
            savedViews={savedTableViews}
            viewsEnabled={savedViewsEnabled}
            activeViewId={activeTableViewId}
            onapplyview={applySavedView}
            onresetview={resetTableView}
            onsaveview={saveCurrentTableView}
            ondeleteview={deleteSavedView}
            {findReplaceEnabled}
            onfindreplace={() => (findReplaceOpen = true)}
            ondeleteselected={() => stageDeleteSelectedRows()}
            onexport={handleExport}
            onaddrow={() => {
              // Row insertion happens on the canvas grid — jump back to it first.
              if (dataViewMode !== 'table') dataViewMode = 'table'
              void tick().then(() => dtBeginInsertRow?.())
            }}
            onopeninsql={openTableInSqlEditor}
            readonly={tableReadonly}
            {hiddenColumns}
            virtualColCount={vcolCount}
            onopenvirtualcols={() => { vcolPanelOpen = !vcolPanelOpen }}
            virtualRelColumns={virtualRelColumnsForToolbar}
            virtualExprCols={virtualExprColsForToolbar}
            ontogglevexpr={(id) => {
              const all = $virtualColumnsStore[_vcolTableKey] ?? []
              const col = all.find(c => c.id === id)
              if (col) virtualColumnsStore.patch(_vcolTableKey, id, { enabled: !col.enabled })
            }}
            onhiddencolumnschange={(next) => {
              hiddenColumns = next
              if (activeTable) saveHiddenCols(persistConnectionId, activeSchema, activeTable, next)
            }}
            onfocuscolumn={(name) => focusTableColumn?.(name)}
            onprev={async () => {
              if (page <= 1) return
              await handlePageChange(page - 1)
            }}
            onnext={async () => {
              if (!_keysetActive && total >= 0 && page * effectivePageSize >= total) return
              await handlePageChange(page + 1)
            }}
          />
          {/if}

          <div class="flex min-h-0 min-w-0 flex-1">
            <svelte:boundary failed={tabError}>
              <!-- The grid stays mounted (hidden) in other view modes so staged
                   edits, selection and scroll position survive mode switches. -->
              <div class={dataViewMode === 'table' ? 'flex min-h-0 min-w-0 flex-1' : 'hidden'}>
              <DataTable
                {columns}
                {rows}
                {primaryKey}
                {foreignKeys}
                {incomingForeignKeys}
                onfetchrelatedrows={handleFetchRelatedRows}
                schema={activeSchema}
                tableName={activeTable ?? ''}
                connectionId={persistConnectionId}
                onrequestsearch={() => tableToolbar?.focusRowSearch?.()}
                dialect={dbType}
                indexes={activeTableIndexes}
                {hiddenColumns}
                {reloadToken}
                {dataVersion}
                {windowed}
                onvisiblerange={handleVisibleRange}
                columnWidthsKey={activeTable ? `${persistConnectionId}\x00${activeSchema}.${activeTable}` : undefined}
                loading={loadingRows}
                {loadingMore}
                {infiniteScroll}
                endOfResults={infiniteScroll && total > 0 && _infiniteRows.length >= total}
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
                bind:scrollToLeft={scrollTableLeft}
                bind:scrollToRight={scrollTableRight}
                bind:canScrollHorizontally={tableCanScrollH}
                bind:focusColumn={focusTableColumn}
                bind:getScroll={tableGetScroll}
                bind:applyScroll={tableApplyScroll}
                bind:vcolPanelOpen
                {rowSort}
                {rowSortMore}
                searchQuery={rowSearch}
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
                onexecutesql={handleExecuteRawDml}
                insertSaving={insertingRow}
                bind:beginInsertRow={dtBeginInsertRow}
                bind:stageDeleteSelected={stageDeleteSelectedRows}
                readonly={tableReadonly}
              />
              </div>
              {#if dataViewMode === 'json'}
                <TableJsonView
                  columns={dataViewColumns}
                  rows={dataViewRows}
                  tableKey={`${activeSchema}.${activeTable}`}
                  onshowtable={() => (dataViewMode = 'table')}
                  ondownload={() => void handleExport('json')}
                />
              {:else if dataViewMode === 'record'}
                <TableRecordView
                  {columns}
                  {rows}
                  {primaryKey}
                  {hiddenColumns}
                  offset={currentOffset}
                  {total}
                  readonly={tableReadonly}
                  initialIndex={focusedRow ?? 0}
                  onindexchange={(i) => (focusedRow = i)}
                  hasPrevPage={!infiniteScroll && page > 1}
                  hasNextPage={!infiniteScroll && (total < 0 || page * effectivePageSize < total)}
                  onprevpage={() => void handlePageChange(page - 1)}
                  onnextpage={() => void handlePageChange(page + 1)}
                  onsave={handleSaveCell}
                />
              {:else if dataViewMode === 'text'}
                <TableTextView columns={dataViewColumns} rows={dataViewRows} tableName={activeTable} />
              {:else if dataViewMode === 'chart'}
                <ChartView columns={dataViewColumns} rows={dataViewRows} connectionId={persistConnectionId} />
              {/if}
            </svelte:boundary>
            {#if dataViewMode === 'table'}
              <RowDetailPanel
                {columns}
                {rows}
                {primaryKey}
                target={inspectorTarget}
                onclose={closeInspector}
                onsave={handleSaveCell}
              />
            {/if}
          </div>
          {/if}
        {/if}
      {/if}

      {#if !activeTab || activeTab.kind === 'welcome'}
        {@const isMac = navigator.platform.toUpperCase().includes('MAC')}
        {@const mod = isMac ? '⌘' : 'Ctrl'}
        {@const cell = 'group relative flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-3 text-left transition-colors hover:border-border hover:bg-accent/40'}
        {@const proCell = 'group relative flex flex-col gap-3 rounded-lg border border-border/40 bg-card/70 p-3 text-left cursor-not-allowed transition-colors hover:border-amber-500/30 hover:bg-amber-500/[0.03]'}
        {@const iconCls = 'size-3.5 text-muted-foreground transition-colors group-hover:text-foreground'}
        {@const proIconCls = 'size-3.5 text-muted-foreground/40'}
        {@const labelCls = 'text-[11px] font-medium leading-none text-foreground/70 transition-colors group-hover:text-foreground'}
        {@const proLabelCls = 'text-[11px] font-medium leading-none text-foreground/35'}
        {@const hotkeyCls = 'text-[9px] tabular-nums text-muted-foreground/50 group-hover:text-muted-foreground transition-colors self-end'}

        <!-- Scroll container keeps top/bottom padding reachable when the content
             outgrows the viewport (e.g. at high zoom); inner wrapper centers when it fits. -->
        <div class="min-h-0 flex-1 overflow-auto">
          <div class="flex min-h-full flex-col items-center justify-center gap-7 px-6 py-10 sm:gap-9 sm:py-12">

          <!-- Header -->
          <div class="flex flex-col items-center gap-3">
            <div class="flex size-11 items-center justify-center rounded-xl border border-border bg-muted">
              <Logo class="size-6" />
            </div>
            <p class="text-[9px] font-medium uppercase tracking-[0.25em] text-muted-foreground/60">Quick access</p>
            {#if connection}
              <div class="flex items-center gap-2 text-sm font-medium text-foreground/80">
                <span class="size-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                <span class="font-mono">{connection.database ?? connection.filePath?.split('/').at(-1) ?? connection.name ?? connection.databaseId ?? 'connected'}</span>
                <span class="text-muted-foreground/50 text-xs">·</span>
                <span class="capitalize text-muted-foreground/70 text-xs font-normal">{dbType}</span>
                {#if tables.length > 0}
                  <span class="text-muted-foreground/50 text-xs">·</span>
                  <span class="text-xs text-muted-foreground/60 font-normal">{tables.length} tables</span>
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

            <button onclick={openDashboardTab} class={$hasPro ? cell : proCell}>
              {#if !$hasPro}<Lock class="absolute right-1.5 top-1.5 size-2.5 text-muted-foreground/20" />{/if}
              <LayoutDashboard class={$hasPro ? iconCls : proIconCls} />
              <span class={$hasPro ? labelCls : proLabelCls}>Dashboard</span>
            </button>

            <button onclick={openAiTab} class={$hasPro ? cell : proCell}>
              {#if !$hasPro}<Lock class="absolute right-1.5 top-1.5 size-2.5 text-muted-foreground/20" />{/if}
              <Bot class={$hasPro ? iconCls : proIconCls} />
              <div class="flex items-end justify-between gap-1">
                <span class={$hasPro ? labelCls : proLabelCls}>AI</span>
                {#if $hasPro}<span class={hotkeyCls}>{mod}⇧E</span>{/if}
              </div>
            </button>

            <button onclick={openOrmTab} class={$hasPro ? cell : proCell}>
              {#if !$hasPro}<Lock class="absolute right-1.5 top-1.5 size-2.5 text-muted-foreground/20" />{/if}
              <Code2 class={$hasPro ? iconCls : proIconCls} />
              <div class="flex items-end justify-between gap-1">
                <span class={$hasPro ? labelCls : proLabelCls}>ORM</span>
                {#if $hasPro}<span class={hotkeyCls}>{mod}⇧O</span>{/if}
              </div>
            </button>

            {#if hasSchemaExplorer}
              <button onclick={openSchemaTab} class={$hasPro ? cell : proCell}>
                {#if !$hasPro}<Lock class="absolute right-1.5 top-1.5 size-2.5 text-muted-foreground/20" />{/if}
                <LayoutTemplate class={$hasPro ? iconCls : proIconCls} />
                <span class={$hasPro ? labelCls : proLabelCls}>Schema</span>
              </button>
            {/if}

            {#if hasSecurity}
              <button onclick={openSecurityTab} class={$hasPro ? cell : proCell}>
                {#if !$hasPro}<Lock class="absolute right-1.5 top-1.5 size-2.5 text-muted-foreground/20" />{/if}
                <ShieldCheck class={$hasPro ? iconCls : proIconCls} />
                <span class={$hasPro ? labelCls : proLabelCls}>Security</span>
              </button>
            {/if}

            <button onclick={openLogsTab} class={$hasPro ? cell : proCell}>
              {#if !$hasPro}<Lock class="absolute right-1.5 top-1.5 size-2.5 text-muted-foreground/20" />{/if}
              <ScrollText class={$hasPro ? iconCls : proIconCls} />
              <span class={$hasPro ? labelCls : proLabelCls}>Logs</span>
            </button>

            <button onclick={openInsightsTab} class={cell}>
              <Database class={iconCls} />
              <span class={labelCls}>Insights</span>
            </button>

            <button onclick={openChartsTab} class={$hasPro ? cell : proCell}>
              {#if !$hasPro}<Lock class="absolute right-1.5 top-1.5 size-2.5 text-muted-foreground/20" />{/if}
              <BarChart2 class={$hasPro ? iconCls : proIconCls} />
              <span class={$hasPro ? labelCls : proLabelCls}>Charts</span>
            </button>

            <button onclick={openDiagramsTab} class={$hasPro ? cell : proCell}>
              {#if !$hasPro}<Lock class="absolute right-1.5 top-1.5 size-2.5 text-muted-foreground/20" />{/if}
              <GitBranch class={$hasPro ? iconCls : proIconCls} />
              <span class={$hasPro ? labelCls : proLabelCls}>Diagrams</span>
            </button>

            <button onclick={openSchemaTimelineTab} class={$hasPro ? cell : proCell}>
              {#if !$hasPro}<Lock class="absolute right-1.5 top-1.5 size-2.5 text-muted-foreground/20" />{/if}
              <History class={$hasPro ? iconCls : proIconCls} />
              <span class={$hasPro ? labelCls : proLabelCls}>Timeline</span>
            </button>

            <button onclick={openDataDiffTab} class={$hasPro ? cell : proCell}>
              {#if !$hasPro}<Lock class="absolute right-1.5 top-1.5 size-2.5 text-muted-foreground/20" />{/if}
              <GitCompare class={$hasPro ? iconCls : proIconCls} />
              <span class={$hasPro ? labelCls : proLabelCls}>Data Diff</span>
            </button>

            <button onclick={openExtensionsTab} class={$hasPro ? cell : proCell}>
              {#if !$hasPro}<Lock class="absolute right-1.5 top-1.5 size-2.5 text-muted-foreground/20" />{/if}
              <Blocks class={$hasPro ? iconCls : proIconCls} />
              <span class={$hasPro ? labelCls : proLabelCls}>Extensions</span>
            </button>

            <button onclick={() => (showConnectionModal = true)} class={cell}>
              <Database class={iconCls} />
              <span class={labelCls}>Connect</span>
            </button>
          </div>


          <!-- Footer -->
          <div class="flex items-center gap-3 text-[10px] text-muted-foreground/50">
            <button
              onclick={() => showShortcutsModal = true}
              class="flex items-center gap-1 transition-colors hover:text-muted-foreground"
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
      {/snippet}
      {/if}
    {/if}
  </main>


  {#if aiSidebarEverOpened && connection}
    <div
      style={aiSidebarOpen && !aiMode ? '' : 'display:none'}
      inert={!aiSidebarOpen || aiMode || undefined}
    >
      {#await import('./AiSidebar.svelte')}
        <div
          class="flex h-full min-h-0 shrink-0 flex-col border-l border-border/50 bg-background"
          style="width: {aiSidebarFallbackWidth}px; min-width: {aiSidebarFallbackWidth}px; max-width: {aiSidebarFallbackWidth}px"
          data-studio-region="ai-sidebar"
        >
          <TabLoading />
        </div>
      {:then { default: AiSidebar }}
        <svelte:boundary>
          {#snippet failed(err, reset)}
            <div class="flex h-full min-h-0 shrink-0 flex-col items-center justify-center gap-3 border-l border-border/50 bg-background p-4 text-center"
              style="width: {aiSidebarFallbackWidth}px; min-width: {aiSidebarFallbackWidth}px; max-width: {aiSidebarFallbackWidth}px">
              <AlertTriangle class="size-5 text-destructive/60" />
              <div class="space-y-1">
                <p class="text-ui-xs font-medium text-foreground">AI sidebar error</p>
                <p class="font-mono text-[10px] text-muted-foreground/60 break-words">{err instanceof Error ? err.message : String(err)}</p>
              </div>
              <button
                type="button"
                class="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-ui-xs font-medium transition-colors hover:bg-accent"
                onclick={reset}
              >Reload</button>
            </div>
          {/snippet}
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
        </svelte:boundary>
      {/await}
    </div>
  {/if}
</div>

{#if queryLogOpen && connection}
  <QueryLogConsole {activeSchema} activeTable={activeTable ?? ''} onclose={() => { queryLogOpen = false }} />
{/if}

{#if statusBarVisible}
<StatusBar
  {connection}
  {connectionLost}
  {savedConnections}
  {activeConnectionId}
  {queryMs}
  {pendingEditCount}
  onapplyedits={() => void applyEdits()}
  onresetedits={() => resetEdits()}
  showTableNav={activeTab?.kind === 'table'}
  onscrolltabletop={() => scrollTableTop()}
  onscrolltablebottom={() => scrollTableBottom()}
  canScrollTableHorizontally={tableCanScrollH}
  onscrolltableleft={() => scrollTableLeft()}
  onscrolltableright={() => scrollTableRight()}
  live={liveEnabled}
  {liveSupported}
  ontogglelive={() => { liveEnabled = !liveEnabled }}
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
  onswitchd1database={({ databaseId, name }) => {
    if (!connection) return
    void handleSwitchDatabase({ ...connection, databaseId, database: name, name })
  }}
  onswitchproviderdb={async ({ provider, dbRef, name }) => {
    if (!connection) return
    try {
      const { providerBuildConnection } = await import('$lib/providers.js')
      const built = await providerBuildConnection(provider, dbRef)
      if (built.needs_password) {
        // Supabase needs a per-project password — can't switch silently, so
        // send the user to the connect dialog to finish it.
        toast.message(`${name} needs its database password — opening the connection dialog.`)
        showConnectionModal = true
        return
      }
      void handleSwitchDatabase({
        ...connection,
        type: built.db_type === 'mysql' ? 'mysql' : 'postgres',
        host: built.host,
        port: built.port,
        user: built.username,
        password: built.password,
        database: built.database,
        ssl: built.ssl,
        name: built.name,
        provider,
      })
    } catch (e) {
      toast.error('Could not switch database', { description: String(e) })
    }
  }}
  oncheckupdate={() => updateDialog?.checkNow()}
  onopenmodelsettings={() => (showAiModelSettings = true)}
  sidebarVisible={sidebarOpen}
  {statusBarVisible}
  {tabBarVisible}
  {tableToolbarVisible}
  ontoggleSidebar={toggleSidebar}
  ontoggletabbar={toggleTabBar}
  ontoggletabletoolbar={toggleTableToolbar}
  ontogglestatusbar={toggleStatusBar}
  onviewchange={handleSidebarViewChange}
  {aiMode}
  onopenaimode={() => (aiMode ? exitAiMode() : openAiTab())}
  hasPro={$hasPro}
  onopenSchema={openSchemaTab}
  onopenlogs={() => { if (aiMode) exitAiMode(); openLogsTab() }}
  onopeninsights={() => { if (aiMode) exitAiMode(); openInsightsTab() }}
  ontogglequerylog={() => { commandOpen = false; queryLogOpen = !queryLogOpen }}
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
{/if}

<!-- Floating tab drag preview (follows the cursor during a split-pane drag) -->
{#if dragGhost}
  <div
    class="pointer-events-none fixed z-[200] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border/60 bg-panel px-3 py-1.5 text-xs font-medium text-foreground opacity-90 shadow-lg"
    style="left:{dragGhost.x}px; top:{dragGhost.y}px"
  >
    {dragGhost.title}
  </div>
{/if}

<!-- In-app confirm (window.confirm is blocked in the Tauri webview) -->
{#if confirmDialog}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
    role="dialog"
    aria-modal="true"
    onclick={(e) => { if (e.target === e.currentTarget) resolveConfirm(false) }}
    onkeydown={(e) => { if (e.key === 'Escape') resolveConfirm(false); if (e.key === 'Enter') resolveConfirm(true) }}
    tabindex="-1"
  >
    <div class="w-full max-w-sm rounded-xl border border-border/60 bg-background p-5 shadow-lg">
      <p class="text-ui-sm text-foreground">{confirmDialog.message}</p>
      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onclick={() => resolveConfirm(false)}
          class="inline-flex h-8 items-center rounded-md px-3 text-ui-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >Cancel</button>
        <button
          type="button"
          onclick={() => resolveConfirm(true)}
          class="inline-flex h-8 items-center rounded-md bg-destructive px-3 text-ui-xs font-medium text-destructive-foreground hover:opacity-90"
        >{confirmDialog.confirmLabel}</button>
      </div>
    </div>
  </div>
{/if}
</div>
