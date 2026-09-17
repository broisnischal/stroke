<script>
  import { untrack } from "svelte";
  import { getAppScale } from '$lib/app-zoom.js';
  import { createHotkey } from "@tanstack/svelte-hotkeys";
  import Icon from "./Icon.svelte";
  import SearchableMenu from "./SearchableMenu.svelte";
  import { listDatabases, canSwitchDatabase, currentDatabaseKey } from "$lib/databases.js";
  import { dbAdminKind, dbActionBlocker } from "$lib/database-admin.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import DangerousActionDialog from "./DangerousActionDialog.svelte";
  import { readOnlyMode, guardWrite, READ_ONLY_HINT } from "$lib/stores/read-only.js";
  import { appNativeScroll } from "$lib/stores/settings.js";
  import { smoothScroll } from "$lib/smooth-scroll.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import PanelRight from "@lucide/svelte/icons/panel-right";
  import PanelLeft from "@lucide/svelte/icons/panel-left";
  import ResizeHandle from "./ResizeHandle.svelte";
  import ConnectionsSidebarPanel from "./ConnectionsSidebarPanel.svelte";
  import ExtensionsSidebarPanel from "./ExtensionsSidebarPanel.svelte";
  import { Button } from '$lib/components/ui/button/index.js'
  import { cn } from "$lib/utils.js";
  import { CRASH_WORD, isMagic, armCrash } from '$lib/games/easter-eggs.js'
  import { t } from "$lib/i18n.js";
  import { visibleRowCount, soleMatch } from "$lib/sidebar-filter.js";
  import { formatTableRowCount } from "$lib/table-list.js";
  import {
    clampNavSidebarWidth,
    loadLayout,
    saveLayout,
  } from "$lib/stores/layout.js";

  const initialLayout = loadLayout();
  let width = $state(initialLayout.navSidebarWidth);
  let resizeStartWidth = initialLayout.navSidebarWidth;
  /** App scale sampled at drag start - `dx` is screen px, `width` is px at 100%. */
  let resizeScale = 1;

  let {
    connectionName = "",
    /** Which sidebar panel is showing: 'tables' | 'connections' | 'extensions'. */
    navSidebarPanel = "tables",
    /** Saved connections list (Connections panel). @type {import('$lib/stores/connections.js').SavedConnection[]} */
    connections = [],
    /** id of the currently live connection (Connections panel highlight). */
    activeConnectionId = "",
    /** @type {(c: import('$lib/stores/connections.js').SavedConnection) => void} */
    onswitchconnection = () => {},
    onaddconnection = () => {},
    /** @type {(id: string) => void} */
    onremoveconnection = () => {},
    /** @type {(id: string, group: string | null) => void} */
    onsetconnectiongroup = () => {},
    ondisconnectconnection = () => {},
    /** Open an extension's detail tab (Extensions panel). @type {(ext: any) => void} */
    onopenextensiondetail = () => {},
    /** Which side the sidebar docks to. @type {'left' | 'right'} */
    side = "left",
    /** Ask the shell to dock the sidebar to the given side. @type {(side: 'left' | 'right') => void} */
    onmoveside = () => {},
    schemas = [],
    tables = [],
    activeSchema = $bindable("public"),
    activeTable = null,
    activeView = "table",
    tableFilter = "",
    loadingTables = false,
    onschemachange = () => {},
    ontableselect = () => {},
    ontablefilter = () => {},
    onrefresh = () => {},
    onnewtable = () => {},
    onnewschema = () => {},
    /** @type {import('$lib/stores/connections.js').SavedConnection | null} */
    connection = null,
    ontruncatetable = /** @type {(table: string) => void} */ (() => {}),
    ondroptable = /** @type {(table: string, cascade: boolean) => void} */ (() => {}),
    /** @type {import('$lib/stores/recent-tabs.js').RecentTab[]} */
    recentTabs = [],
    onrecentselect = /** @type {(schema: string, table: string) => void} */ (() => {}),
    onrecentremove = /** @type {(schema: string, table: string) => void} */ (() => {}),
    onrecentclear = () => {},
    /** Switch the live connection to another database on the same server.
     *  @type {(entry: { key: string, label: string }) => void} */
    onswitchdatabase = () => {},
    onswitchdatabasenow = /** @type {(db: { key: string, label: string }) => void} */ (() => {}),
    /** Open the Create database dialog. */
    onnewdatabase = () => {},
    /** Server-level database actions. Each takes the row's name, plus the full
     *  list so the dialogs can check the new name against it.
     *  @type {(args: { name: string, existing: string[] }) => void} */
    onrenamedatabase = () => {},
    /** @type {(args: { name: string, existing: string[] }) => void} */
    onduplicatedatabase = () => {},
    /** @type {(args: { name: string }) => void} */
    ondropdatabase = () => {},
    /** @type {(args: { name: string }) => void} */
    ondatabaseinfo = () => {},
    /** Close every other session on a database (Postgres). @type {(args: { name: string }) => void} */
    onterminatedbsessions = () => {},
    /** Bumped by the shell to force a refetch of the database list. */
    databasesRefreshKey = 0,
    onviewddl = /** @type {(table: string) => void} */ (() => {}),
    onexportsql = /** @type {(table: string) => void} */ (() => {}),
    onexportdata = /** @type {(table: string) => void} */ (() => {}),
    /** Names of tables that currently have an open tab (current schema). @type {string[]} */
    openTables = [],
    onclosetable = /** @type {(table: string) => void} */ (() => {}),
    /** Open the table with its structure view active. */
    onviewstructure = /** @type {(table: string) => void} */ (() => {}),
    /** Open a SELECT for the table in a SQL console tab. */
    onopeninconsole = /** @type {(table: string) => void} */ (() => {}),
    /** Open the Generate SQL dialog (statement skeletons) for the table. */
    ongeneratesql = /** @type {(table: string) => void} */ (() => {}),
    /** Open the ERD scoped to a table + its FK-connected neighbors. */
    onopentableerd = /** @type {(table: string) => void} */ (() => {}),
    /** Count the table's rows and toast the result. */
    oncountrows = /** @type {(table: string) => void} */ (() => {}),
    /** Copy the table's column names as a comma-separated list. */
    oncopycolumns = /** @type {(table: string) => void} */ (() => {}),
  } = $props();

  const openTableSet = $derived(new Set(openTables))

  // PostgreSQL is the only driver where "schema" is a CREATE SCHEMA namespace.
  // (MySQL schemas are databases; SQLite/D1 have none.) Gate the "New schema" action on it.
  const supportsSchemas = $derived(connection?.type === "postgres")

  let localFilter = $state(untrack(() => tableFilter));
  // Debounced mirror of localFilter that the expensive list filtering derives
  // from. localFilter drives the input (instant typing feedback); the O(n) filter
  // + sort only re-runs once typing settles, not on every keystroke.
  let debouncedFilter = $state(untrack(() => tableFilter));
  let filterEl = $state(/** @type {HTMLInputElement | null} */ (null));
  let filterDebounce = /** @type {ReturnType<typeof setTimeout> | null} */ (
    null
  );

  // Section open/collapsed state - persisted across sidebar toggles
  const SIDEBAR_EXPAND_KEY = 'stroke:sidebar-sections'
  function loadSidebarSections() {
    try {
      const raw = localStorage.getItem(SIDEBAR_EXPAND_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
    return { tables: true, views: false, matViews: false }
  }
  function saveSidebarSection(key, value) {
    try {
      const current = loadSidebarSections()
      localStorage.setItem(SIDEBAR_EXPAND_KEY, JSON.stringify({ ...current, [key]: value }))
    } catch {}
  }

  const databasesOpen = $derived(sidebarTab === 'databases')
  /** @type {import('$lib/databases.js').DatabaseEntry[]} */
  let dbEntries = $state([]);
  let dbEntriesLoading = $state(false);
  let dbEntriesLoaded = $state(false);
  let dbEntriesError = $state('');

  // Listing databases costs a round trip (a catalog query, or a Cloudflare /
  // provider API call), so it waits for the section to be expanded rather than
  // firing on every sidebar mount.
  async function loadDatabases() {
    if (dbEntriesLoading) return
    dbEntriesLoading = true
    dbEntriesError = ''
    try {
      dbEntries = await listDatabases(connection)
      dbEntriesLoaded = true
    } catch (e) {
      dbEntriesError = String(e)
    } finally {
      dbEntriesLoading = false
    }
  }

  // Load whenever the section is open and holds nothing for this connection.
  // Hanging the fetch off the toggle alone missed both cases that matter: the
  // section restoring already-expanded from the persisted prefs, and a
  // connection switch invalidating the list while it stayed open - each showed
  // an "empty" list that had never been fetched.
  $effect(() => {
    const conn = connection
    const isOpen = databasesOpen
    if (!isOpen || !conn) return
    untrack(() => {
      if (!dbEntriesLoaded && !dbEntriesLoading) void loadDatabases()
    })
  })

  // A new connection invalidates the list - drop it so the next expand refetches.
  $effect(() => {
    connection
    dbEntries = []
    dbEntriesLoaded = false
    dbEntriesError = ''
  })

  // The shell bumps this after a create/rename/duplicate/drop, since the list it
  // invalidated lives here. Refetch rather than patch: the statement may have
  // failed halfway, and the server is the only honest source.
  $effect(() => {
    if (databasesRefreshKey === 0) return
    databasesRefreshKey
    untrack(() => { void loadDatabases() })
  })

  const canSwitchDb = $derived(canSwitchDatabase(connection))
  const activeDbKey = $derived(currentDatabaseKey(connection))
  const dbAdmin = $derived(dbAdminKind(connection))
  /** Names of every listed database, for the dialogs' collision checks. */
  const dbNames = $derived(dbEntries.map((d) => d.label))

  /** Menu item state for one database row: enabled, or disabled with a reason.
   *  @param {import('$lib/database-admin.js').AdminAction} action @param {boolean} isCurrent */
  function dbItem(action, isCurrent) {
    if ($readOnlyMode) return { disabled: true, title: READ_ONLY_HINT }
    const blocker = dbActionBlocker(action, connection, { isCurrent })
    return { disabled: !!blocker, title: blocker || undefined }
  }

  // ── Pinned tables ─────────────────────────────────────────────────────────
  const PINNED_KEY = 'stroke:pinned-tables'

  function loadPinnedAll() {
    try {
      const raw = localStorage.getItem(PINNED_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  }

  function savePinnedAll(data) {
    try { localStorage.setItem(PINNED_KEY, JSON.stringify(data)) } catch {}
  }

  let _allPinned = $state(loadPinnedAll())
  const _connKey = $derived(connection?.id ?? '')
  const pinnedTables = $derived(_allPinned[_connKey] ?? [])

  // Only show pinned tables that still exist in the current table list
  const _tableNameSet = $derived(new Set(tables.map((t) => t.name)))
  const _rowCountByName = $derived(new Map(tables.map((t) => [t.name, t.rowCount])))
  const visiblePinnedTables = $derived(pinnedTables.filter((n) => _tableNameSet.has(n)))

  function togglePin(tableName) {
    const current = _allPinned[_connKey] ?? []
    const next = current.includes(tableName)
      ? current.filter((n) => n !== tableName)
      : [...current, tableName]
    _allPinned = { ..._allPinned, [_connKey]: next }
    savePinnedAll(_allPinned)
  }

  function clearAllPins() {
    _allPinned = { ..._allPinned, [_connKey]: [] }
    savePinnedAll(_allPinned)
  }

  // ── Display preferences ───────────────────────────────────────────────────
  const DISPLAY_PREFS_KEY = 'stroke:sidebar-display'
  function loadDisplayPrefs() {
    try {
      const raw = localStorage.getItem(DISPLAY_PREFS_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
    return { showTables: true, showViews: true, showMatViews: true, showRecent: true, showDatabases: true, sortBy: 'name', showPins: true, showRowCount: true, sortDir: 'asc', hideEmpty: false, hideSystem: false }
  }
  function saveDisplayPrefs(prefs) {
    try { localStorage.setItem(DISPLAY_PREFS_KEY, JSON.stringify(prefs)) } catch {}
  }

  const _dp = loadDisplayPrefs()

  /**
   * One list at a time, chosen from the strip at the top of the sidebar.
   *
   * This replaces six independently-collapsible sections stacked in one scroll
   * container. That layout had two problems no amount of styling fixes: the
   * height of everything below a section moved every time one was opened, so
   * nothing in the panel held still; and with several open at once the list you
   * were actually looking for was usually below the fold, which is what the
   * accordion was supposed to prevent. A tab strip costs one fixed row and the
   * list underneath always starts at the same place.
   *
   * Materialized views ride in the Views tab - they are views, and splitting
   * them out is what produced six sections in the first place.
   * @typedef {'tables' | 'views' | 'recent' | 'pins' | 'databases'} SidebarTab
   */
  const SIDEBAR_TAB_KEY = 'stroke:sidebar-tab'
  /** @type {{ id: SidebarTab, label: string, icon: string }[]} */
  const SIDEBAR_TABS = [
    { id: 'tables',    label: 'Tables',    icon: 'table-2' },
    // Second, not last: switching database is a navigation move you make as
    // often as switching schema, and it was sitting behind three lists you visit
    // far less.
    { id: 'databases', label: 'Databases', icon: 'database' },
    { id: 'views',     label: 'Views',     icon: 'table-view' },
    { id: 'recent',    label: 'Recent',    icon: 'clock' },
    { id: 'pins',      label: 'Pins',      icon: 'pin' },
  ]
  function loadSidebarTab() {
    try {
      const raw = localStorage.getItem(SIDEBAR_TAB_KEY)
      if (SIDEBAR_TABS.some((t) => t.id === raw)) return /** @type {SidebarTab} */ (raw)
    } catch {}
    return /** @type {SidebarTab} */ ('tables')
  }
  let sidebarTab = $state(loadSidebarTab())

  /**
   * Keyboard access to the strip. Registered here rather than in StudioShell
   * because the state and the tab list both live here - a hotkey that has to
   * reach across a component boundary to set one field is how that field ends up
   * lifted for no other reason.
   *
   *   ⌘⇧1-5      jump straight to a tab
   *   ⌘⌥← / ⌘⌥→  cycle, wrapping at both ends
   *
   * ⌘1-9 is already "go to editor tab" and ⌘⌥1-9 is "switch saved connection",
   * so neither of those ranges was free.
   */
  const modLabel =
    typeof navigator !== 'undefined' && /mac/i.test(navigator.platform) ? '\u2318' : 'Ctrl+'

  /** @param {number} delta */
  function cycleSidebarTab(delta) {
    const i = SIDEBAR_TABS.findIndex((t) => t.id === sidebarTab)
    const next = (i + delta + SIDEBAR_TABS.length) % SIDEBAR_TABS.length
    sidebarTab = SIDEBAR_TABS[next].id
  }
  SIDEBAR_TABS.forEach((tab, i) => {
    createHotkey(`Mod+Shift+${i + 1}`, (e) => {
      if (!connectionName) return
      e.preventDefault()
      sidebarTab = tab.id
    })
  })
  createHotkey('Mod+Alt+ArrowRight', (e) => {
    if (!connectionName) return
    e.preventDefault()
    cycleSidebarTab(1)
  })
  createHotkey('Mod+Alt+ArrowLeft', (e) => {
    if (!connectionName) return
    e.preventDefault()
    cycleSidebarTab(-1)
  })
  /** Pending single-click database switch, held so a second click can cancel it. */
  let dbClickTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null)
  /** @param {{ key: string, label: string }} db */
  function onDbClick(db) {
    if (dbClickTimer) clearTimeout(dbClickTimer)
    dbClickTimer = setTimeout(() => { dbClickTimer = null; onswitchdatabase(db) }, 220)
  }
  /** @param {{ key: string, label: string }} db */
  function onDbDblClick(db) {
    if (dbClickTimer) { clearTimeout(dbClickTimer); dbClickTimer = null }
    onswitchdatabasenow(db)
  }

  /**
   * What an empty tab says. `filtered` fires when the list has rows but the
   * filter matched none - a different problem from having nothing at all, and
   * one the user can fix by clearing the box rather than by creating anything.
   * @type {Record<SidebarTab, { icon: string, title: string, hint: string }>}
   */
  const TAB_EMPTY = {
    tables:    { icon: 'table-2',    title: 'No tables',    hint: 'Nothing in this schema yet.' },
    views:     { icon: 'table-view', title: 'No views',     hint: 'Views and materialized views show up here.' },
    recent:    { icon: 'clock',      title: 'No recents',   hint: 'Tables you open appear here.' },
    pins:      { icon: 'pin',        title: 'No pins',      hint: 'Right-click a table to pin it here.' },
    databases: { icon: 'database',   title: 'No databases', hint: 'Nothing else on this server.' },
  }
  const tabIsEmpty = $derived(!loadingTables && !!connectionName && tabCounts[sidebarTab] === 0)
  /** True when the tab has rows but the filter hid all of them. */
  const tabEmptyFromFilter = $derived(
    tabIsEmpty &&
      !!debouncedFilter &&
      (sidebarTab === 'tables'
        ? regularTablesUnpinned.length > 0
        : sidebarTab === 'views'
          ? views.length + matViews.length > 0
          : sidebarTab === 'databases'
            ? dbEntries.length > 0
            : sidebarTab === 'pins'
              ? pinnedTables.length > 0
              : recentTables.length > 0),
  )

  /** How many rows each tab holds BEFORE the filter. @type {Record<SidebarTab, number>} */
  const tabTotals = $derived({
    tables: regularTablesUnpinned.length,
    views: views.length + matViews.length,
    // The recents list is capped at 5 rows, so that is the denominator too.
    recent: Math.min(recentTabs.length, 5),
    pins: pinnedTables.length,
    databases: dbEntries.length,
  })

  /** How many rows each tab holds, after the filter. @type {Record<SidebarTab, number>} */
  const tabCounts = $derived({
    tables: filteredRegularTables.length,
    views: filteredViews.length + filteredMatViews.length,
    recent: Math.min(filteredRecent.length, 5),
    pins: visiblePinnedTables.length,
    databases: filteredDbEntries.length,
  })
  $effect(() => { try { localStorage.setItem(SIDEBAR_TAB_KEY, sidebarTab) } catch {} })

  /** The database the sidebar has settled on. Held outside `$state` on purpose:
      it is a bookmark for the effect below, not something the UI reads. */
  let settledDbKey = activeDbKey
  // Switching database lands on Tables. The Databases tab is a switcher, not a
  // destination - once it has done its job, the list still under the cursor
  // belongs to a database you are no longer looking at. Driven off the key
  // rather than off the click so it fires when the switch actually lands: a
  // click that opens the confirm dialog and gets cancelled must not move the tab,
  // and a switch made from the command palette or the context menu must.
  $effect(() => {
    const key = activeDbKey
    // Disconnected. Keep the bookmark - a reconnect puts the same key back, and
    // that is not a switch.
    if (!key) return
    // First connection of the session, so the tab restored from localStorage stands.
    if (!settledDbKey) { settledDbKey = key; return }
    if (key === settledDbKey) return
    settledDbKey = key
    sidebarTab = 'tables'
  })

  // The old per-section visibility flags are now just "is this the open tab".
  // Keeping the names means the ~900 lines of list markup below did not have to
  // be rewritten to ask a different question.
  const showTables    = $derived(sidebarTab === 'tables')
  const showViews     = $derived(sidebarTab === 'views')
  const showMatViews  = $derived(sidebarTab === 'views')
  const showRecent    = $derived(sidebarTab === 'recent')
  const showPins      = $derived(sidebarTab === 'pins')
  const showDatabases = $derived(sidebarTab === 'databases')
  // Nothing collapses any more, so every list in the open tab is open.
  const recentOpen = true, tablesOpen = true, viewsOpen = true, matViewsOpen = true
  let showRowCount = $state(_dp.showRowCount ?? true)
  let hideEmpty = $state(_dp.hideEmpty ?? false)
  let hideSystem = $state(_dp.hideSystem ?? false)
  /** @type {'name' | 'rowCount'} */
  let sortBy = $state(_dp.sortBy ?? 'name')
  /** @type {'asc' | 'desc'} */
  let sortDir = $state(_dp.sortDir ?? 'asc')

  $effect(() => { saveDisplayPrefs({ sortBy, showRowCount, sortDir, hideEmpty, hideSystem }) })

  /** System / migration tables that are usually noise: `_prisma_migrations`, `pg_*`, `sqlite_*`, leading-underscore. */
  function isSystemTable(/** @type {string} */ name) {
    return /^(_|pg_|sql_|sqlite_)/i.test(name)
  }

  // ── Shared context-menu target ────────────────────────────────────────────
  // Each long list owns ONE ContextMenu.Root; the row that was right-clicked is
  // recorded here from the event, the way DataTable does it for the grid. Keeps
  // the per-row cost to a <button>, which is what makes an unwindowed list of a
  // few thousand tables affordable.
  let menuTable = $state('')
  let menuView = $state('')
  let menuMatView = $state('')

  // ── Selection state ───────────────────────────────────────────────────────
  /** @type {Set<string>} */
  let selectedItems = $state(new Set())
  const menuTableSelected = $derived(selectedItems.has(menuTable))
  /** Anchor for shift range-select. @type {string | null} */
  let lastSelectedName = $state(null)

  /** @param {string} name */
  function toggleSelect(name) {
    const next = new Set(selectedItems)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    selectedItems = next
  }

  // ── Bulk actions on the current multi-selection ───────────────────────────
  /** True when every selected table is already pinned. */
  const allSelectedPinned = $derived(
    selectedItems.size > 0 && [...selectedItems].every((n) => pinnedTables.includes(n)),
  )

  /** Pin every selected table (no-op for ones already pinned). */
  function pinSelected() {
    const set = new Set(_allPinned[_connKey] ?? [])
    for (const n of selectedItems) set.add(n)
    _allPinned = { ..._allPinned, [_connKey]: [...set] }
    savePinnedAll(_allPinned)
    clearSelection()
  }

  /** Unpin every selected table. */
  function unpinSelected() {
    const next = (_allPinned[_connKey] ?? []).filter((n) => !selectedItems.has(n))
    _allPinned = { ..._allPinned, [_connKey]: next }
    savePinnedAll(_allPinned)
    clearSelection()
  }

  function copySelectedNames() {
    navigator.clipboard.writeText([...selectedItems].join('\n'))
    clearSelection()
  }

  function clearSelection() {
    selectedItems = new Set()
    lastSelectedName = null
  }

  // ── Dangerous action dialog ───────────────────────────────────────────────
  /** @type {'drop' | 'truncate'} */
  let dangerAction = $state('drop')
  let dangerTable = $state('')
  let dangerCascade = $state(false)
  let dangerOpen = $state(false)

  /** @param {'drop' | 'truncate'} kind @param {string} tableName */
  function openDangerDialog(kind, tableName) {
    // The menu items are disabled in read-only mode, but the guard stays: a
    // keyboard-driven select on a disabled item is one bits-ui version away.
    if (!guardWrite(kind === 'drop' ? 'drop this table' : 'truncate this table')) return
    dangerAction = kind
    dangerTable = tableName
    dangerCascade = false
    dangerOpen = true
  }

  function confirmDanger(cascade) {
    if (dangerAction === 'drop') ondroptable(dangerTable, cascade)
    else ontruncatetable(dangerTable)
  }

  // Alt+Shift+1-5 to focus pinned tables (only existing ones)
  createHotkey('Alt+Shift+1', (e) => { e.preventDefault(); const t = visiblePinnedTables[0]; if (t) ontableselect(t) })
  createHotkey('Alt+Shift+2', (e) => { e.preventDefault(); const t = visiblePinnedTables[1]; if (t) ontableselect(t) })
  createHotkey('Alt+Shift+3', (e) => { e.preventDefault(); const t = visiblePinnedTables[2]; if (t) ontableselect(t) })
  createHotkey('Alt+Shift+4', (e) => { e.preventDefault(); const t = visiblePinnedTables[3]; if (t) ontableselect(t) })
  createHotkey('Alt+Shift+5', (e) => { e.preventDefault(); const t = visiblePinnedTables[4]; if (t) ontableselect(t) })

  // Sync from parent when it resets externally (e.g. connection change)
  $effect(() => {
    localFilter = tableFilter;
    debouncedFilter = tableFilter;
  });

  /** @param {string} value */
  function handleFilterInput(value) {
    // The fake crash. Exact whole-value match, so filtering for a `crash_logs`
    // table still filters - only a bare "crash" is the joke. Handled before the
    // debounce, so the filter never actually runs with it.
    if (isMagic(value, CRASH_WORD)) {
      localFilter = "";
      if (filterDebounce) clearTimeout(filterDebounce);
      filterDebounce = null;
      debouncedFilter = "";
      ontablefilter("");
      armCrash();
      return;
    }
    localFilter = value;
    if (filterDebounce) clearTimeout(filterDebounce);
    filterDebounce = setTimeout(() => {
      filterDebounce = null;
      debouncedFilter = value;
      ontablefilter(value);
    }, 200);
  }

  // Release the pending filter timer when the sidebar unmounts.
  $effect(() => () => {
    if (filterDebounce) clearTimeout(filterDebounce);
  });

  const lf = $derived(debouncedFilter.toLowerCase());
  // The filter box sits above every section, so it filters every section -
  // databases and recents included. Scoping it to tables meant typing a database
  // name emptied the table list and left the database sitting there unmatched.
  const filteredDbEntries = $derived(
    lf ? dbEntries.filter((d) => d.label.toLowerCase().includes(lf)) : dbEntries,
  );
  const filteredRecent = $derived(
    lf ? recentTabs.filter((r) => r.table.toLowerCase().includes(lf)) : recentTabs,
  );
  const pinnedSet = $derived(new Set(pinnedTables));

  const regularTables = $derived(
    tables.filter(
      (t) => !t.kind || t.kind === "table" || t.kind === "foreign_table",
    ),
  );
  const views = $derived(tables.filter((t) => t.kind === "view"));
  const matViews = $derived(
    tables.filter((t) => t.kind === "materialized_view"),
  );

  /** @param {any[]} list */
  function applySortBy(list) {
    let result = list
    if (hideEmpty) result = result.filter((t) => (t.rowCount ?? 0) > 0)
    if (hideSystem) result = result.filter((t) => !isSystemTable(t.name))
    if (sortBy === 'rowCount') {
      result = [...result].sort((a, b) => (b.rowCount ?? 0) - (a.rowCount ?? 0))
    }
    if (sortDir === 'desc' && sortBy === 'name') {
      result = [...result].reverse()
    } else if (sortDir === 'asc' && sortBy === 'rowCount') {
      result = [...result].reverse()
    }
    return result
  }

  // Sorted, hide-filtered, un-pinned base - recomputes only when the data, sort,
  // hide toggles or pins change (NOT on every keystroke). The search term then
  // just filters this base, so typing avoids the sort + array clones.
  const sortedRegularBase = $derived(
    applySortBy(regularTables.filter((t) => !pinnedSet.has(t.name))),
  );
  const filteredRegularTables = $derived(
    lf ? sortedRegularBase.filter((t) => t.name.toLowerCase().includes(lf)) : sortedRegularBase,
  );

  // Selectable rows in display order (pinned first, then regular) - drives shift range-select.
  const selectableOrder = $derived([
    ...visiblePinnedTables,
    ...filteredRegularTables.map((t) => t.name),
  ]);

  /**
   * Toggle a row's selection. With Shift held, extend a contiguous range from
   * the last-clicked anchor across the combined pinned + regular ordering.
   * @param {string} name @param {boolean} [shiftKey]
   */
  function selectItem(name, shiftKey = false) {
    // Range-select only extends an existing selection (needs an anchor already selected).
    if (shiftKey && lastSelectedName && lastSelectedName !== name && selectedItems.size > 0) {
      const a = selectableOrder.indexOf(lastSelectedName)
      const b = selectableOrder.indexOf(name)
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        const next = new Set(selectedItems)
        for (let i = lo; i <= hi; i++) next.add(selectableOrder[i])
        selectedItems = next
        lastSelectedName = name
        return
      }
    }
    toggleSelect(name)
    lastSelectedName = name
  }

  /** Open every selected table in its own tab. */
  function openSelected() {
    for (const n of selectableOrder) if (selectedItems.has(n)) ontableselect(n)
    clearSelection()
  }

  /** Close the tabs of every selected table that's currently open. */
  function closeSelectedTabs() {
    for (const n of selectedItems) if (openTableSet.has(n)) onclosetable(n)
    clearSelection()
  }
  const sortedViewsBase = $derived(applySortBy(views));
  const sortedMatViewsBase = $derived(applySortBy(matViews));
  const filteredViews = $derived(
    lf ? sortedViewsBase.filter((t) => t.name.toLowerCase().includes(lf)) : sortedViewsBase,
  );
  const filteredMatViews = $derived(
    lf ? sortedMatViewsBase.filter((t) => t.name.toLowerCase().includes(lf)) : sortedMatViewsBase,
  );
  // Views, materialized views and databases are windowed on the same maths as
  // the tables list (see the virtual-list block below). They used to render a
  // capped 500 rows instead, which both instantiated 500 context menus and hid
  // whatever came after row 500 without saying so.

  // ── Counts for section badges ──────────────────────────────────────────────
  // The TABLES list draws from regular tables minus pins; use that as the "total"
  // so pinning (which just relocates a row) doesn't read as a hidden/filtered row.
  const regularTablesUnpinned = $derived(regularTables.filter((t) => !pinnedSet.has(t.name)));
  /** How many rows the active filters (search / hide-empty / hide-system) are hiding right now. */
  const hiddenCount = $derived(
    Math.max(0, regularTablesUnpinned.length - filteredRegularTables.length) +
    Math.max(0, views.length - filteredViews.length) +
    Math.max(0, matViews.length - filteredMatViews.length),
  );
  /** Whether any non-default filter/sort is active (drives the Reset action). */
  const filtersActive = $derived(
    lf !== '' || hideEmpty || hideSystem || sortBy !== 'name' || sortDir !== 'asc',
  );

  /** Name of the open list, for the filter's accessible name and its live region. */
  const activeTabLabel = $derived(SIDEBAR_TABS.find((t) => t.id === sidebarTab)?.label ?? 'items')

  /** Everything the filter rule counts, in the shape `sidebar-filter.js` wants. */
  const filterLists = $derived({
    tables: filteredRegularTables, tablesTotal: regularTablesUnpinned.length,
    views: filteredViews, matViews: filteredMatViews, viewsTotal: views.length + matViews.length,
    recent: filteredRecent, recentTotal: recentTabs.length,
    pins: visiblePinnedTables, pinsTotal: pinnedTables.length,
    databases: filteredDbEntries, databasesTotal: dbEntries.length,
    activeDbKey,
  })

  /** Rows the open tab is showing right now, against what it would show unfiltered. */
  const visibleRows = $derived(visibleRowCount(sidebarTab, filterLists))

  /**
   * The one row left when the filter has narrowed the open tab to exactly one -
   * Enter in the filter box opens it. The picking rule lives in
   * `sidebar-filter.js` under test; this only binds the result to the handler
   * that acts on it.
   * @returns {{ label: string, open: () => void } | null}
   */
  const soleResult = $derived.by(() => {
    if (!connectionName) return null
    const m = soleMatch(sidebarTab, filterLists)
    if (!m) return null
    switch (m.kind) {
      case 'table': return { label: m.name, open: () => ontableselect(m.name) }
      case 'recent': return { label: m.name, open: () => onrecentselect(m.schema, m.name) }
      case 'database': return { label: m.name, open: () => onswitchdatabase(m.entry) }
      default: return null
    }
  })

  /**
   * What the filter's live region says. Reads off `lf`, which is already
   * debounced, so it announces once the typing settles rather than per keystroke.
   */
  const filterStatus = $derived.by(() => {
    if (!connectionName) return ''
    const { shown, total } = visibleRows
    const list = activeTabLabel.toLowerCase()
    if (!lf) return `${total} ${list}`
    if (shown === 0) return `No ${list} match ${lf}`
    if (soleResult) return `1 of ${total} ${list}. Press Enter to open ${soleResult.label}.`
    return `${shown} of ${total} ${list}`
  })

  /** Commit a pending debounce now, so Enter acts on what is actually typed. */
  function flushFilter() {
    if (!filterDebounce) return
    clearTimeout(filterDebounce)
    filterDebounce = null
    debouncedFilter = localFilter
    ontablefilter(localFilter)
  }

  function resetFilters() {
    localFilter = '';
    debouncedFilter = '';
    if (filterDebounce) { clearTimeout(filterDebounce); filterDebounce = null; }
    ontablefilter('');
    hideEmpty = false;
    hideSystem = false;
    sortBy = 'name';
    sortDir = 'asc';
  }
  // ── Lists (tables, views, materialized views, databases) ─────────────────
  /** @type {HTMLElement | null} */
  let scrollContainerEl = $state(null)
  /** @type {HTMLElement | null} */
  let tableListEl = $state(null)

  // No windowing. The sidebar renders every row.
  //
  // It used to virtualize all four lists, and the window maths was the source of
  // a run of scroll bugs - a blank list behind a full-height spacer, and jitter
  // from a fractional row stride that `offsetTop` could only report as an
  // integer. Off-screen rows are instead skipped by the browser via
  // `content-visibility` on the row itself (see the list styles below), which
  // needs no stride, no spacers and no scroll handler to go wrong.
  const viewsToRender = $derived(filteredViews)
  const matViewsToRender = $derived(filteredMatViews)
  const dbEntriesToRender = $derived(filteredDbEntries)

  /** Shared field chrome for schema select + table filter (aligned in sidebar grid) */
  const sidebarFieldClass =
"field-surface h-7 w-full min-w-0 bg-background/40 text-ui-sm text-foreground shadow-none transition-colors hover:bg-background/55";
</script>

<svelte:window onkeydown={(e) => {
  // Cheap key checks first: reading offsetParent can force layout, and this
  // handler runs on every keystroke app-wide (Monaco, cell editors included).
  const isFilterKey = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === 'f'
  const isEscClear = e.key === 'Escape' && selectedItems.size > 0
  if (!isFilterKey && !isEscClear) return
  // Guard: filterEl.offsetParent is null when sidebar is hidden via display:none
  if (!filterEl || !filterEl.offsetParent) return
  if (isFilterKey) {
    e.preventDefault(); filterEl.focus(); filterEl.select()
  }
  if (isEscClear) clearSelection()
}} />

<!-- Section count badge: shows "visible/total" when filters hide rows, else just the total. -->
{#snippet countBadge(visible, total)}
  {#if visible !== total}
    <span class="ml-auto font-mono text-ui-2xs text-muted-foreground" title="{visible} shown · {total - visible} hidden of {total}"
      >{visible}<span class="text-muted-foreground">/{total}</span></span>
  {:else}
    <span class="ml-auto font-mono text-ui-2xs text-muted-foreground">{total}</span>
  {/if}
{/snippet}

<div
  class={cn("flex h-full shrink-0", side === "right" && "flex-row-reverse")}
  style:width="calc({width}px * var(--app-scale, 1))"
  data-studio-region="sidebar"
>
  <ContextMenu.Root>
  <ContextMenu.Trigger class="flex h-full min-w-0 flex-1">
  <!-- Deliberately NOT a size container (`@container/sb`). Declaring one made the
       whole sidebar subtree re-resolve its container queries on every pixel of a
       resize drag, which measured 31ms of layout per frame against 5.8ms without
       it in the same A/B - the drag ran at ~20fps. The one query it fed is gone:
       the section headers below name their own list and carry their own count,
       which needs no query at all. -->
  <aside
    class="studio-chrome flex h-full min-w-0 flex-1 flex-col bg-sidebar text-sidebar-foreground"
    data-studio-chrome
  >
    {#if navSidebarPanel === "tables"}
    <div class="flex min-h-0 flex-1 flex-col">

      <div class="flex shrink-0 flex-col">
        <!-- Top row. One list at a time, chosen from the strip: the old sidebar
             stacked six independently-collapsible sections in one scroller, so
             opening any of them moved everything below it and the list you
             wanted was usually past the fold.

             Top row: the tabs on the left, the list actions pushed to the right.
             They act on whichever list the tab picked, so they belong on the line
             with the tabs rather than wedged against a filter they have nothing to
             do with. `ml-auto` is the gap - a fixed one would drift as the sidebar
             is dragged wider. The tablist stays its own element: a tablist holding
             three non-tab buttons is a lie to every screen reader. -->
        <div class="flex h-9 shrink-0 items-center gap-1 border-b border-sidebar-border px-2">
          <div
            role="tablist"
            aria-label="Sidebar sections"
            class="app-scroll-x flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          >
            {#each SIDEBAR_TABS as tab (tab.id)}
              {@const active = sidebarTab === tab.id}
              {@const count = tabCounts[tab.id]}
              <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={count > 0 ? `${tab.label}, ${count}` : tab.label}
                title={`${tab.label} · ${modLabel}⇧${SIDEBAR_TABS.indexOf(tab) + 1}`}
                tabindex={active ? 0 : -1}
                disabled={!connectionName}
                class={cn(
                  // Full row height, 32px wide: the whole strip is the target, which
                  // clears 24x24 with room over and lets the accent rail sit on the
                  // row's own bottom edge. It was a 28px pill with the rail pushed
                  // 7px below it, so the rail floated in the gap between the pill and
                  // the border, attached to neither.
                  "group/tab relative inline-flex h-9 w-8 shrink-0 items-center justify-center transition-colors disabled:pointer-events-none disabled:opacity-40",
                  // Two cues, not one. Colour alone does not separate five line icons
                  // at this size, so the selected tab also carries a filled surface and
                  // an accent rail - the same "which panel am I in" signal the VS Code
                  // activity bar uses.
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                onclick={() => (sidebarTab = tab.id)}
                onkeydown={(e) => {
                  // Arrow keys move between tabs (ARIA APG tablist); the roving
                  // tabindex above is what keeps the strip to one tab stop.
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
                  e.preventDefault()
                  const i = SIDEBAR_TABS.findIndex((t) => t.id === sidebarTab)
                  const next = (i + (e.key === "ArrowRight" ? 1 : -1) + SIDEBAR_TABS.length) % SIDEBAR_TABS.length
                  sidebarTab = SIDEBAR_TABS[next].id
                  /** @type {HTMLElement | null} */ (
                    e.currentTarget.parentElement?.children[next] ?? null
                  )?.focus()
                }}
              >
                <!-- The pill is a child, not the button's own background: the
                     button spans the full row so its target is generous, while
                     the shape you see stays 28px and centred. -->
                <span
                  class={cn(
                    "pointer-events-none absolute inset-x-0.5 inset-y-1 rounded-md transition-colors",
                    active ? "bg-sidebar-accent" : "group-hover/tab:bg-sidebar-accent/50",
                  )}
                  aria-hidden="true"
                ></span>
                <Icon name={tab.icon} class="relative size-4 shrink-0" />
                {#if active}
                  <span
                    class="pointer-events-none absolute inset-x-1 bottom-0 h-0.5 rounded-t-full bg-primary"
                    aria-hidden="true"
                  ></span>
                {/if}
                {#if connectionName && count > 0}
                  <!-- The count is a cue, not a label: it says "there is something in
                       here" without stealing the width an icon-only strip is for. The
                       number itself is in the accessible name above. -->
                  <span
                    class={cn(
                      "pointer-events-none absolute top-1.5 right-1 size-1.5 rounded-full",
                      active ? "bg-primary" : "bg-muted-foreground",
                    )}
                    aria-hidden="true"
                  ></span>
                {/if}
              </button>
            {/each}
          </div>
          <div class="ml-auto flex shrink-0 items-center gap-0.5">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground disabled:pointer-events-none disabled:opacity-40"
              title="Display options"
              disabled={!connectionName}
            >
              <Icon name="list-filter" class="size-3.5" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="start" class="min-w-52">
              <div class="px-2 pt-1 pb-1.5 text-ui-2xs text-muted-foreground leading-relaxed">
                <span class="font-mono text-foreground/80">{regularTables.length}</span> tables{#if views.length} · <span class="font-mono text-foreground/80">{views.length}</span> views{/if}{#if matViews.length} · <span class="font-mono text-foreground/80">{matViews.length}</span> mat.{/if}
                {#if hiddenCount > 0}<br /><span class="text-warning">{hiddenCount} hidden by filters</span>{/if}
              </div>
              <DropdownMenu.Separator />
              <DropdownMenu.CheckboxItem
                checked={showRowCount}
                onCheckedChange={(v) => (showRowCount = v)}
              ><Icon name="hash" class="text-muted-foreground" />Row counts</DropdownMenu.CheckboxItem>
              <DropdownMenu.CheckboxItem
                checked={hideEmpty}
                onCheckedChange={(v) => (hideEmpty = v)}
              ><Icon name="circle-slash" class="text-muted-foreground" />Hide empty tables</DropdownMenu.CheckboxItem>
              <DropdownMenu.CheckboxItem
                checked={hideSystem}
                onCheckedChange={(v) => (hideSystem = v)}
              ><Icon name="cog" class="text-muted-foreground" />Hide system tables</DropdownMenu.CheckboxItem>
              <DropdownMenu.Separator />
              <DropdownMenu.Label class="px-2 py-0.5 text-ui-2xs font-medium uppercase tracking-wide text-muted-foreground">Sort by</DropdownMenu.Label>
              <!-- Field + direction merged: pick a field, click it again to flip. -->
              <DropdownMenu.Item
                closeOnSelect={false}
                title="Click to flip direction"
                onSelect={() => { if (sortBy === 'name') sortDir = sortDir === 'asc' ? 'desc' : 'asc'; else sortBy = 'name' }}
              >
                <Icon name={sortBy === 'name' && sortDir === 'desc' ? 'arrow-up-a-z' : 'arrow-down-a-z'} class="text-muted-foreground" />
                Name
                {#if sortBy === 'name'}
                  <span class="ml-auto font-mono text-ui-2xs text-muted-foreground">{sortDir === 'asc' ? 'A→Z' : 'Z→A'}</span>
                {/if}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                closeOnSelect={false}
                title="Click to flip direction"
                onSelect={() => { if (sortBy === 'rowCount') sortDir = sortDir === 'asc' ? 'desc' : 'asc'; else sortBy = 'rowCount' }}
              >
                <Icon name={sortBy === 'rowCount' && sortDir === 'asc' ? 'arrow-up-0-1' : 'arrow-down-0-1'} class="text-muted-foreground" />
                Row count
                {#if sortBy === 'rowCount'}
                  <span class="ml-auto font-mono text-ui-2xs text-muted-foreground">{sortDir === 'desc' ? '9→0' : '0→9'}</span>
                {/if}
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item onSelect={resetFilters} disabled={!filtersActive}>
                <Icon name="rotate-ccw" class="text-muted-foreground" />
                Reset filters &amp; sort
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
          <button
            type="button"
            class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            title="Refresh tables (⌘R)"
            disabled={loadingTables || !connectionName}
            onclick={onrefresh}
          >
            <Icon name="refresh-cw"
              class={cn("size-3.5", loadingTables && "animate-spin")}
            />
          </button>
          {#if supportsSchemas}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground disabled:pointer-events-none disabled:opacity-40"
                title="Create new…"
                disabled={!connectionName}
              >
                <Icon name="plus" class="size-3.5" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" class="w-44 p-1 text-ui-sm">
                <DropdownMenu.Item
                  onSelect={onnewtable}
                  disabled={$readOnlyMode}
                  title={$readOnlyMode ? READ_ONLY_HINT : undefined}
                  class="gap-2"
                >
                  <Icon name="table-2" class="size-3.5 shrink-0 text-muted-foreground" />
                  {$t('sidebar.newTable')}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={onnewschema}
                  disabled={$readOnlyMode}
                  title={$readOnlyMode ? READ_ONLY_HINT : undefined}
                  class="gap-2"
                >
                  <Icon name="box" class="size-3.5 shrink-0 text-muted-foreground" />
                  {$t('sidebar.newSchema')}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          {:else}
            <button
              type="button"
              class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              title={$readOnlyMode ? READ_ONLY_HINT : 'New table'}
              disabled={!connectionName || $readOnlyMode}
              onclick={onnewtable}
            >
              <Icon name="plus" class="size-3.5" />
            </button>
          {/if}
          </div>
        </div>

        <!-- Filter row: the schema the list belongs to, and the filter itself. -->
        <div class="flex h-9 shrink-0 items-center gap-1.5 border-b border-sidebar-border px-2">
          <!-- Shown when the engine actually has schemas to pick between, which
               is not the same question as `supportsSchemas` - that flag is
               postgres-only because Postgres is the only driver with a CREATE
               SCHEMA namespace, and it gates the "New schema" action below.
               MySQL and SQL Server both LIST schemas without supporting that,
               so gating the picker on it hid theirs. SQLite, D1 and Redis have
               no schemas at all and correctly show nothing. -->
          {#if schemas.length > 0}
            <div class="max-w-[8rem] shrink-0">
                    <SearchableMenu
                      contentClass="w-[var(--bits-popover-anchor-width)] min-w-[180px]"
                      placeholder="Search schemas…"
                      empty="No schema"
                      items={schemas.map((s) => ({ value: s, label: s }))}
                      onselect={(it) => { if (it.value) onschemachange(it.value); }}
                    >
                      {#snippet trigger(props)}
                        <button
                          {...props}
                          id="sidebar-schema"
                          type="button"
                          class={cn(sidebarFieldClass, "flex h-7 w-full items-center gap-1 px-2 font-normal")}
                        >
                          <Icon name="box" class="size-3.5 shrink-0 text-muted-foreground" />
                          <span class="min-w-0 truncate">{activeSchema}</span>
                          <Icon name="chevron-down" class="size-3 shrink-0 text-muted-foreground" />
                        </button>
                      {/snippet}
                      {#snippet item(it)}
                        <Icon name="box" class="size-3.5 shrink-0 text-muted-foreground" />
                        <span class="min-w-0 flex-1 truncate">{it.label}</span>
                        {#if it.value === activeSchema}<Icon name="check" class="size-3.5 shrink-0 text-primary" />{/if}
                      {/snippet}
                    </SearchableMenu>
            </div>
          {/if}
          <div class="relative min-w-0 flex-1">
          <Icon name="search"
            class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            bind:this={filterEl}
            placeholder={connectionName ? "Filter…" : "Not connected"}
            value={localFilter}
            disabled={!connectionName}
            oninput={(e) => handleFilterInput(e.currentTarget.value)}
            onkeydown={(e) => {
              // Enter opens the match when the filter has left exactly one. The
              // debounce is committed first, or a fast typist who narrows to one
              // row and hits Enter within 200ms is judged against the previous
              // term. Inert with nothing or several to open: a key that guesses
              // which of six rows was meant is worse than a key that does nothing.
              if (e.key === 'Enter') {
                flushFilter()
                const sole = soleResult
                if (!sole) return
                e.preventDefault()
                sole.open()
                return
              }
              // Tab / ArrowDown from the filter → jump focus into the result list
              // so the user can keyboard-navigate the matched tables directly.
              if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'ArrowDown') {
                const first = /** @type {HTMLElement | null} */ (
                  (tableListEl ?? scrollContainerEl)?.querySelector('button')
                )
                if (first) { e.preventDefault(); first.focus() }
              }
            }}
            class={cn(sidebarFieldClass, "w-full pl-8 pr-2.5 outline-none disabled:opacity-40 disabled:cursor-not-allowed")}
            aria-label="Filter {activeTabLabel.toLowerCase()}"
            aria-describedby="sidebar-filter-hint"
            data-sidebar-filter
          />
          </div>
          {#if soleResult}
            <!-- Decorative: the same offer is in the field's description and in
                 the live region, so a screen reader hears it without this. -->
            <kbd
              class="pointer-events-none shrink-0 rounded border border-border/60 bg-muted/40 px-1 py-px font-mono text-ui-3xs text-muted-foreground"
              aria-hidden="true"
            >↵</kbd>
          {/if}
          <!-- Held apart: the description is static and read on focus, the status
               is rewritten as the list narrows. Merging them would re-announce
               the instruction on every keystroke. Both are rendered whether or
               not they have anything to say, because a polite region inserted at
               the moment its text appears is announced unreliably. -->
          <span id="sidebar-filter-hint" class="sr-only"
            >Filters the {activeTabLabel.toLowerCase()} list. When one row matches, press Enter to open it.</span>
          <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{filterStatus}</span>
        </div>
      </div>

      <div class="flex min-h-0 flex-1 flex-col">
        <div
          bind:this={scrollContainerEl}
          class="app-scroll min-h-0 w-full flex-1 overflow-y-auto overscroll-y-contain [will-change:scroll-position]"
          role="none"
          use:smoothScroll={{ enabled: !$appNativeScroll }}
          onclick={(e) => {
            if (selectedItems.size > 0 && !/** @type {Element} */(e.target).closest?.('li')) {
              clearSelection()
            }
          }}
          onkeydown={(e) => {
            if (e.key === 'Escape' && selectedItems.size > 0) clearSelection()
          }}
        >
          {#if loadingTables}
            <div
              class="flex items-center justify-center py-8"
              role="status"
              aria-label="Loading"
            >
              <span class="inline-flex gap-1.5" aria-hidden="true">
                <span
                  class="size-1.5 animate-bounce rounded-full bg-muted-foreground/50"
                  style="animation-delay: 0ms"
                ></span>
                <span
                  class="size-1.5 animate-bounce rounded-full bg-muted-foreground/50"
                  style="animation-delay: 150ms"
                ></span>
                <span
                  class="size-1.5 animate-bounce rounded-full bg-muted-foreground/50"
                  style="animation-delay: 300ms"
                ></span>
              </span>
            </div>
          {:else}
            <!-- ── Databases ──────────────────────────────────────
                 Other databases on the same server. Collapsed by default and
                 only fetched once expanded - see loadDatabases(). Engines that
                 cannot switch in place (SQLite, Redis) never render it. -->
            {#if showDatabases && canSwitchDb && connectionName}
              <div class="flex w-full items-center gap-1 px-2.5 pt-2 pb-1">
                <span class="text-ui-2xs font-medium tracking-wider text-muted-foreground uppercase">Databases</span>
                {#if dbEntries.length > 0}
                  {@render countBadge(filteredDbEntries.length, dbEntries.length)}
                {/if}
                <!-- `countBadge` carries the `ml-auto` that pushes this group right;
                     the buttons must not carry one too, or the free space splits
                     between them and the count drifts into the middle of the row. -->
                <div class={cn("flex shrink-0 items-center gap-1", dbEntries.length === 0 && "ml-auto")}>
                  {#if dbAdmin}
                    <button
                      type="button"
                      class="hit-area inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                      onclick={onnewdatabase}
                      title={$readOnlyMode ? READ_ONLY_HINT : "New database"}
                      disabled={$readOnlyMode}
                    >
                      <Icon name="plus" class="size-3" />
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="hit-area inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
                    onclick={() => void loadDatabases()}
                    title="Refresh databases"
                    disabled={dbEntriesLoading}
                  >
                    <Icon name="refresh-cw" class={cn("size-3", dbEntriesLoading && "animate-spin")} />
                  </button>
                </div>
              </div>
              {#if databasesOpen}
                {#if dbEntriesLoading && dbEntries.length === 0}
                  <p class="px-4 pb-1.5 text-ui-2xs text-muted-foreground">Loading…</p>
                {:else if dbEntriesError && dbEntries.length === 0}
                  <p class="px-4 pb-1.5 text-ui-2xs text-destructive">{dbEntriesError}</p>
                {:else if filteredDbEntries.length === 0}
                  <p class="px-4 pb-1.5 text-ui-2xs text-muted-foreground">
                    {!dbEntriesLoaded ? 'Loading…' : lf ? 'No matching databases' : 'No other databases'}
                  </p>
                {:else}
                  <ul class="flex w-full min-w-full flex-col px-1.5 pb-1 [&>li]:pb-0.5 [&>li]:[content-visibility:auto] [&>li]:[contain-intrinsic-size:auto_1.875rem]">
                    {#each dbEntriesToRender as db (db.key)}
                      {@const isCurrent = db.key === activeDbKey}
                      <li>
                        <ContextMenu.Root>
                          <ContextMenu.Trigger class="w-full">
                            <button
                              type="button"
                              disabled={isCurrent}
                              class={cn(
                                "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-2 py-1.5 text-left transition-colors",
                                isCurrent
                                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                  : "text-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground",
                              )}
                              onclick={() => !isCurrent && onDbClick(db)}
                              ondblclick={() => !isCurrent && onDbDblClick(db)}
                              title={isCurrent ? `${db.label} (current)` : `Switch to ${db.label} · double-click to switch without confirming`}
                            >
                              <Icon name="database" class="size-3 shrink-0 opacity-50" />
                              <span class="min-w-0 truncate font-mono text-ui-sm leading-4">{db.label}</span>
                              {#if isCurrent}
                                <Icon name="check" class="size-3 shrink-0 text-success" />
                              {/if}
                            </button>
                          </ContextMenu.Trigger>
                          <ContextMenu.Content class="min-w-52 p-1 text-ui-xs [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
                            {#if !isCurrent}
                              <ContextMenu.Item onSelect={() => onswitchdatabase(db)}>
                                <Icon name="arrow-right" />
                                Switch to this database
                              </ContextMenu.Item>
                            {/if}
                            <ContextMenu.Item onSelect={() => { navigator.clipboard.writeText(db.label) }}>
                              <Icon name="copy" />
                              Copy name
                            </ContextMenu.Item>
                            {#if dbAdmin}
                              <ContextMenu.Item onSelect={() => ondatabaseinfo({ name: db.label })}>
                                <Icon name="info" />
                                Database info
                              </ContextMenu.Item>
                              <ContextMenu.Separator />
                              {@const ren = dbItem('rename', isCurrent)}
                              <ContextMenu.Item disabled={ren.disabled} title={ren.title} onSelect={() => onrenamedatabase({ name: db.label, existing: dbNames })}>
                                <Icon name="pencil" />
                                Rename…
                              </ContextMenu.Item>
                              {@const dup = dbItem('duplicate', isCurrent)}
                              <ContextMenu.Item disabled={dup.disabled} title={dup.title} onSelect={() => onduplicatedatabase({ name: db.label, existing: dbNames })}>
                                <Icon name="copy-plus" />
                                Duplicate…
                              </ContextMenu.Item>
                              {@const term = dbItem('terminate', isCurrent)}
                              {#if !term.disabled}
                                <ContextMenu.Item onSelect={() => onterminatedbsessions({ name: db.label })}>
                                  <Icon name="unplug" />
                                  Close other sessions
                                </ContextMenu.Item>
                              {/if}
                              <ContextMenu.Separator />
                              {@const drp = dbItem('drop', isCurrent)}
                              <ContextMenu.Item variant="destructive" disabled={drp.disabled} title={drp.title} onSelect={() => ondropdatabase({ name: db.label })}>
                                <Icon name="trash-2" />
                                Drop database…
                              </ContextMenu.Item>
                            {/if}
                          </ContextMenu.Content>
                        </ContextMenu.Root>
                      </li>
                    {/each}
                  </ul>
                {/if}
              {/if}
            {/if}

            <!-- ── Recent ─────────────────────────────────────────── -->
            {#if showRecent && filteredRecent.length > 0 && connectionName}
              <div class="flex w-full items-center gap-1 px-2.5 pt-2 pb-1">
                <span class="text-ui-2xs font-medium tracking-wider text-muted-foreground uppercase">Recent</span>
                {@render countBadge(Math.min(filteredRecent.length, 5), Math.min(recentTabs.length, 5))}
                <button
                  type="button"
                  class="shrink-0 font-mono text-ui-2xs text-muted-foreground transition-colors hover:text-destructive"
                  onclick={onrecentclear}
                  title="Clear recent"
                >Clear</button>
              </div>
              {#if recentOpen}
                <ul class="flex w-full min-w-full flex-col px-1.5 pb-1 [&>li]:pb-0.5 [&>li]:[content-visibility:auto] [&>li]:[contain-intrinsic-size:auto_1.875rem]">
                  {#each filteredRecent.slice(0, 5) as item (item.schema + '.' + item.table)}
                    <li class="group/recent">
                      <div
                        class={cn(
                          "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-2 py-1.5 transition-colors cursor-pointer",
                          activeTable === item.table
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground",
                        )}
                        role="button"
                        tabindex="0"
                        onclick={() => onrecentselect(item.schema, item.table)}
                        onkeydown={(e) => {
                          // role="button" has to answer Space as well as Enter (ARIA APG).
                          if (e.key !== 'Enter' && e.key !== ' ') return
                          e.preventDefault()
                          onrecentselect(item.schema, item.table)
                        }}
                      >
                        {#if item.tableKind === 'view'}
                          <Icon name="table-view" class="size-3 shrink-0 opacity-50" />
                        {:else if item.tableKind === 'materialized_view'}
                          <Icon name="layers" class="size-3 shrink-0 opacity-50" />
                        {:else}
                          <Icon name="table-2" class="size-3 shrink-0 opacity-50" />
                        {/if}
                        <span class="min-w-0 truncate font-mono text-ui-sm leading-4">{item.table}</span>
                        <button
                          type="button"
                          aria-label="Remove {item.table} from recent"
                          class="hit-area inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/recent:opacity-100 hover:text-foreground focus-visible:opacity-100"
                          onclick={(e) => { e.stopPropagation(); onrecentremove(item.schema, item.table) }}
                        >
                          <Icon name="x" class="size-3" />
                        </button>
                      </div>
                    </li>
                  {/each}
                </ul>
              {/if}
            {/if}

            <!-- ── Pinned ─────────────────────────────────────────── -->
            {#if showPins && visiblePinnedTables.length > 0 && connectionName}
              <div class="flex w-full items-center gap-1 px-2.5 pt-2 pb-1">
                <Icon name="pin" class="size-3 shrink-0 text-muted-foreground" />
                <span class="text-ui-2xs font-medium tracking-wider text-muted-foreground uppercase">Pinned</span>
                {@render countBadge(visiblePinnedTables.length, pinnedTables.length)}
                {#if pinnedTables.length > 5}
                  <button
                    type="button"
                    class="shrink-0 font-mono text-ui-2xs text-muted-foreground hover:text-destructive transition-colors"
                    onclick={clearAllPins}
                    title="Clear all pinned tables"
                  >Clear all</button>
                {/if}
              </div>
              <ul class="flex w-full min-w-full flex-col px-1.5 pb-1 [&>li]:pb-0.5 [&>li]:[content-visibility:auto] [&>li]:[contain-intrinsic-size:auto_1.875rem]">
                {#each visiblePinnedTables as tableName, idx (tableName)}
                  {@const isSelected = selectedItems.has(tableName)}
                  <li class="[content-visibility:auto] [contain-intrinsic-size:auto_28px]">
                    <ContextMenu.Root>
                      <ContextMenu.Trigger class="w-full">
                        <button
                          type="button"
                          class={cn(
                            "group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-2 py-1.5 text-left transition-colors",
                            isSelected
                              ? "bg-primary/10 text-foreground"
                              : activeTable === tableName
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground",
                          )}
                          onclick={(e) => {
                            if (e.shiftKey) { e.preventDefault(); selectItem(tableName, true) }
                            else if (e.metaKey || e.ctrlKey) { e.preventDefault(); selectItem(tableName, false) }
                            else ontableselect(tableName)
                          }}
                        >
                          <span
                            class="relative size-3 shrink-0"
                            onclick={(e) => { e.stopPropagation(); selectItem(tableName, e.shiftKey) }}
                            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectItem(tableName, e.shiftKey); } }}
                            role="checkbox"
                            aria-checked={isSelected}
                            tabindex="-1"
                          >
                            {#if isSelected}
                              <Icon name="square-check" class="size-3 text-primary" />
                            {:else}
                              <Icon name="pin" class="size-3 text-muted-foreground group-hover:hidden" />
                              <Icon name="square" class="size-3 hidden opacity-40 group-hover:block" />
                            {/if}
                          </span>
                          <span class="min-w-0 truncate font-mono text-ui-sm leading-4">{tableName}</span>
                          {#if showRowCount}
                          <span class="shrink-0 text-right font-mono text-ui-xs leading-4 tabular-nums text-muted-foreground">
                            {formatTableRowCount(_rowCountByName.get(tableName))}
                          </span>
                          {/if}
                        </button>
                      </ContextMenu.Trigger>
                      <ContextMenu.Content class="min-w-48 p-1 text-ui-xs [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
                        {#if isSelected && selectedItems.size > 1}
                          <!-- Multi-select: actions apply to all selected tables -->
                          <ContextMenu.Item onSelect={openSelected}>
                            <Icon name="external-link" />
                            Open {selectedItems.size} tables
                          </ContextMenu.Item>
                          {#if [...selectedItems].some((n) => openTableSet.has(n))}
                            <ContextMenu.Item onSelect={closeSelectedTabs}>
                              <Icon name="x" />
                              Close open tabs
                            </ContextMenu.Item>
                          {/if}
                          <ContextMenu.Separator />
                          <ContextMenu.Item onSelect={copySelectedNames}>
                            <Icon name="clipboard-copy" />
                            Copy {selectedItems.size} names
                          </ContextMenu.Item>
                          <ContextMenu.Item onSelect={() => (allSelectedPinned ? unpinSelected() : pinSelected())}>
                            {#if allSelectedPinned}
                              <Icon name="pin-off" />
                              Unpin {selectedItems.size} tables
                            {:else}
                              <Icon name="pin" />
                              Pin {selectedItems.size} tables
                            {/if}
                          </ContextMenu.Item>
                          <ContextMenu.Separator />
                          <ContextMenu.Item onSelect={clearSelection}>
                            <Icon name="square" />
                            Deselect all
                          </ContextMenu.Item>
                        {:else}
                        <ContextMenu.Item onSelect={() => { navigator.clipboard.writeText(tableName) }}>
                          <Icon name="clipboard-copy" />
                          Copy name
                        </ContextMenu.Item>
                        <ContextMenu.Item onSelect={() => oncopycolumns(tableName)}>
                          <Icon name="copy" />
                          Copy columns
                        </ContextMenu.Item>
                        {#if openTableSet.has(tableName)}
                          <ContextMenu.Item onSelect={() => onclosetable(tableName)}>
                            <Icon name="x" />
                            Close tab
                          </ContextMenu.Item>
                        {/if}
                        <ContextMenu.Item onSelect={() => togglePin(tableName)}>
                          <Icon name="pin-off" />
                          Unpin table
                        </ContextMenu.Item>
                        <ContextMenu.Separator />
                        <ContextMenu.Item onSelect={() => onopeninconsole(tableName)}>
                          <Icon name="terminal" />
                          Open Console
                        </ContextMenu.Item>
                        <ContextMenu.Item onSelect={() => ongeneratesql(tableName)}>
                          <Icon name="zap" />
                          Generate SQL…
                        </ContextMenu.Item>
                        <ContextMenu.Item onSelect={() => oncountrows(tableName)}>
                          <Icon name="hash" />
                          Count rows
                        </ContextMenu.Item>
                        <ContextMenu.Separator />
                        <ContextMenu.Item onSelect={() => onviewstructure(tableName)}>
                          <Icon name="layout-list" />
                          View structure
                        </ContextMenu.Item>
                        <ContextMenu.Item onSelect={() => onopentableerd(tableName)}>
                          <Icon name="git-branch" />
                          Open ERD
                        </ContextMenu.Item>
                        <ContextMenu.Item onSelect={() => onviewddl(tableName)}>
                          <Icon name="code-2" />
                          View DDL
                        </ContextMenu.Item>
                        <ContextMenu.Item onSelect={() => onexportsql(tableName)}>
                          <Icon name="file-down" />
                          Export as SQL
                        </ContextMenu.Item>
                        <ContextMenu.Item onSelect={() => onexportdata(tableName)}>
                          <Icon name="download" />
                          Export data
                        </ContextMenu.Item>
                        {/if}
                      </ContextMenu.Content>
                    </ContextMenu.Root>
                  </li>
                {/each}
              </ul>
            {/if}

            <!-- ── Tables ─────────────────────────────────────────── -->
            {#if showTables}
              <!-- Outside `tablesOpen`, like every other section header: a
                   collapsed list still has to say what it is and how much it is
                   hiding. `regularTablesUnpinned` is the denominator because
                   pinning relocates a row into the Pinned list rather than
                   filtering it out - counting against `regularTables` would read
                   as "one table went missing" every time one is pinned. -->
              <div class="flex w-full items-center gap-1 px-2.5 pt-2 pb-1">
                <span class="text-ui-2xs font-medium tracking-wider text-muted-foreground uppercase">{$t('sidebar.tables')}</span>
                {#if regularTablesUnpinned.length > 0}
                  {@render countBadge(filteredRegularTables.length, regularTablesUnpinned.length)}
                {/if}
              </div>

            {#if tablesOpen}
              <div
                role="none"
                onkeydown={(e) => {
                  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                  const btns = /** @type {HTMLButtonElement[]} */ ([...(tableListEl?.querySelectorAll('button') ?? [])])
                  const i = btns.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement))
                  if (i === -1) return
                  e.preventDefault()
                  if (e.key === 'ArrowDown') btns[i + 1]?.focus()
                  else if (i === 0) filterEl?.focus()
                  else btns[i - 1]?.focus()
                }}
              >
              <!-- ONE context menu for the whole list, not one per row.
                   A ContextMenu.Root + Trigger per <li> is two component instances
                   per table, and this list is no longer windowed - a 5,000-table
                   schema instantiated 10,000 menu components that exist only to be
                   right-clicked. `content-visibility` skips a row's LAYOUT, not its
                   construction, so that cost was paid in full on every schema switch
                   and every filter keystroke. Which row was clicked is read off the
                   event instead. -->
              <ContextMenu.Root>
                <ContextMenu.Trigger>
                  {#snippet child({ props })}
                    {@const openMenu = props.oncontextmenu}
                    <ul
                      bind:this={tableListEl}
                      {...props}
                      oncontextmenu={(e) => {
                        const li = e.target instanceof Element ? e.target.closest("li[data-table]") : null
                        if (!(li instanceof HTMLElement)) return
                        menuTable = li.dataset.table ?? ""
                        openMenu?.(e)
                      }}
                      class="flex w-full min-w-full flex-col px-1.5 pb-1 [&>li]:pb-0.5 [&>li]:[content-visibility:auto] [&>li]:[contain-intrinsic-size:auto_1.875rem]"
                    >
                {#if regularTables.length === 0 && tables.length > 0}
                  <li
                    class="flex w-full flex-col items-center gap-2 px-4 py-8 text-center"
                  >
                    <Icon name="table-2" class="size-7 text-muted-foreground" />
                    <p class="text-ui-sm text-muted-foreground">
                      No tables in {activeSchema || "schema"}
                    </p>
                  </li>
                {:else}
                  {#each filteredRegularTables as table (table.name)}
                    {@const isSelected = selectedItems.has(table.name)}
                    <li data-table={table.name}>
                    <button
                      type="button"
                      class={cn(
                        "group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-2 py-1.5 text-left transition-colors",
                        isSelected
                          ? "bg-primary/10 text-foreground"
                          : activeTable === table.name
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground",
                      )}
                      onclick={(e) => {
                        if (e.shiftKey) { e.preventDefault(); selectItem(table.name, true) }
                        else if (e.metaKey || e.ctrlKey) { e.preventDefault(); selectItem(table.name, false) }
                        else ontableselect(table.name)
                      }}
                    >
                      <span
                        class="relative size-3.5 shrink-0"
                        onclick={(e) => { e.stopPropagation(); selectItem(table.name, e.shiftKey) }}
                        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectItem(table.name, e.shiftKey); } }}
                        role="checkbox"
                        aria-checked={isSelected}
                        tabindex="-1"
                      >
                        {#if isSelected}
                          <Icon name="square-check" class="size-3.5 text-primary" />
                        {:else}
                          <Icon name="table-2" class="size-3.5 opacity-70 group-hover:hidden" />
                          <Icon name="square" class="size-3.5 hidden opacity-70 group-hover:block" />
                        {/if}
                      </span>
                      <span class="flex min-w-0 items-center gap-1.5">
                        <span class="min-w-0 truncate font-mono text-ui-sm leading-4">{table.name}</span>
                        {#if table.rlsEnabled}
                          <Icon
                            name="lock"
                            class="size-3 shrink-0 text-muted-foreground"
                            role="img"
                            aria-label="Row-level security enabled"
                          />
                        {/if}
                      </span>
                      {#if showRowCount}
                      <!-- Fixed min-width so the column doesn't shift every
                           row sideways as lazy counts land. A count that has
                           not arrived draws nothing at all: a placeholder mark
                           on every row made a long list read as a column of
                           dashes, which says "empty" far louder than "counting". -->
                      <span
                        class="flex min-w-[4ch] shrink-0 items-center justify-end font-mono text-ui-2xs leading-4 tabular-nums text-muted-foreground"
                        title={table.rowCount != null ? Number(table.rowCount).toLocaleString("en-US") : "Counting rows…"}
                      >
                        {#if table.rowCount != null}{formatTableRowCount(table.rowCount)}{/if}
                      </span>
                      {/if}
                    </button>
                    </li>
                  {/each}
                {/if}
                    </ul>
                  {/snippet}
                </ContextMenu.Trigger>
            <ContextMenu.Content class="min-w-48 p-1 text-ui-xs [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
              {#if menuTableSelected && selectedItems.size > 1}
                <!-- Multi-select: actions apply to all selected tables -->
                <ContextMenu.Item onSelect={openSelected}>
                  <Icon name="external-link" />
                  Open {selectedItems.size} tables
                </ContextMenu.Item>
                {#if [...selectedItems].some((n) => openTableSet.has(n))}
                  <ContextMenu.Item onSelect={closeSelectedTabs}>
                    <Icon name="x" />
                    Close open tabs
                  </ContextMenu.Item>
                {/if}
                <ContextMenu.Separator />
                <ContextMenu.Item onSelect={copySelectedNames}>
                  <Icon name="clipboard-copy" />
                  Copy {selectedItems.size} names
                </ContextMenu.Item>
                <ContextMenu.Item onSelect={() => (allSelectedPinned ? unpinSelected() : pinSelected())}>
                  {#if allSelectedPinned}
                    <Icon name="pin-off" />
                    Unpin {selectedItems.size} tables
                  {:else}
                    <Icon name="pin" />
                    Pin {selectedItems.size} tables
                  {/if}
                </ContextMenu.Item>
                <ContextMenu.Separator />
                <ContextMenu.Item onSelect={clearSelection}>
                  <Icon name="square" />
                  Deselect all
                </ContextMenu.Item>
              {:else}
              <ContextMenu.Item onSelect={() => { navigator.clipboard.writeText(menuTable) }}>
                <Icon name="clipboard-copy" />
                Copy name
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => oncopycolumns(menuTable)}>
                <Icon name="copy" />
                Copy columns
              </ContextMenu.Item>
              {#if openTableSet.has(menuTable)}
                <ContextMenu.Item onSelect={() => onclosetable(menuTable)}>
                  <Icon name="x" />
                  Close tab
                </ContextMenu.Item>
              {/if}
              <ContextMenu.Item onSelect={() => togglePin(menuTable)}>
                {#if pinnedTables.includes(menuTable)}
                  <Icon name="pin-off" />
                  Unpin table
                {:else}
                  <Icon name="pin" />
                  Pin table
                {/if}
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => toggleSelect(menuTable)}>
                {#if menuTableSelected}
                  <Icon name="square" />
                  Deselect
                {:else}
                  <Icon name="square-check" />
                  Select
                {/if}
              </ContextMenu.Item>
              <ContextMenu.Separator />
              <ContextMenu.Item onSelect={() => onopeninconsole(menuTable)}>
                <Icon name="terminal" />
                Open in SQL console
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => ongeneratesql(menuTable)}>
                <Icon name="zap" />
                Generate SQL…
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => oncountrows(menuTable)}>
                <Icon name="hash" />
                Count rows
              </ContextMenu.Item>
              <ContextMenu.Separator />
              <ContextMenu.Item onSelect={() => onviewstructure(menuTable)}>
                <Icon name="layout-list" />
                View structure
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => onviewddl(menuTable)}>
                <Icon name="code-2" />
                View DDL
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => onexportsql(menuTable)}>
                <Icon name="file-down" />
                Export as SQL
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => onexportdata(menuTable)}>
                <Icon name="download" />
                Export data
              </ContextMenu.Item>
              <ContextMenu.Separator />
              <ContextMenu.Item
                disabled={$readOnlyMode}
                title={$readOnlyMode ? READ_ONLY_HINT : undefined}
                onSelect={() => openDangerDialog('truncate', menuTable)}
              >
                <Icon name="eraser" />
                Truncate table
              </ContextMenu.Item>
              <ContextMenu.Item
                variant="destructive"
                disabled={$readOnlyMode}
                title={$readOnlyMode ? READ_ONLY_HINT : undefined}
                onSelect={() => openDangerDialog('drop', menuTable)}
              >
                <Icon name="trash-2" />
                Drop table
              </ContextMenu.Item>
              {/if}
            </ContextMenu.Content>
              </ContextMenu.Root>
              </div>
            {/if}
            {/if}

            <!-- ── Views ──────────────────────────────────────────── -->
            {#if showViews && (views.length > 0 || filteredViews.length > 0)}
              <div class="flex w-full items-center gap-1 px-2.5 pt-2 pb-1">
                <span
                  class="text-ui-2xs font-medium tracking-wider text-muted-foreground uppercase"
                  >{$t('sidebar.views')}</span
                >
                {#if views.length > 0}
                  {@render countBadge(filteredViews.length, views.length)}
                {/if}
              </div>
              {#if viewsOpen}
                <!-- One menu for the list - see the tables list above for why. -->
                <ContextMenu.Root>
                <ContextMenu.Trigger>
                {#snippet child({ props })}
                {@const openMenu = props.oncontextmenu}
                <ul
                  {...props}
                  oncontextmenu={(e) => {
                    const li = e.target instanceof Element ? e.target.closest('li[data-view]') : null
                    if (!(li instanceof HTMLElement)) return
                    menuView = li.dataset.view ?? ''
                    openMenu?.(e)
                  }}
                  class="flex w-full min-w-full flex-col px-1.5 pb-1 [&>li]:pb-0.5 [&>li]:[content-visibility:auto] [&>li]:[contain-intrinsic-size:auto_1.875rem]"
                >
                  {#if filteredViews.length === 0}
                    <!-- The tab-level empty state covers this. -->
                  {:else}
                    {#each viewsToRender as view (view.name)}
                      {@const isSelected = selectedItems.has(view.name)}
                      <li data-view={view.name}>
                            <button
                              type="button"
                              class={cn(
                                "group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-2 py-1.5 text-left transition-colors",
                                isSelected
                                  ? "bg-primary/10 text-foreground"
                                  : activeTable === view.name
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                    : "text-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground",
                              )}
                              onclick={() => ontableselect(view.name)}
                            >
                              <span
                                class="relative size-3 shrink-0"
                                onclick={(e) => { e.stopPropagation(); toggleSelect(view.name) }}
                                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleSelect(view.name); } }}
                                role="checkbox"
                                aria-checked={isSelected}
                                tabindex="-1"
                              >
                                {#if isSelected}
                                  <Icon name="square-check" class="size-3 text-primary" />
                                {:else}
                                  <Icon name="table-view" class="size-3 opacity-50 group-hover:hidden" />
                                  <Icon name="square" class="size-3 hidden opacity-40 group-hover:block" />
                                {/if}
                              </span>
                              <span class="min-w-0 truncate font-mono text-ui-sm leading-4">{view.name}</span>
                              <!-- No row count: plain views have no entry in the row-statistics
                                   source, so this only ever rendered a misleading 0. Materialized
                                   views are physical tables and keep theirs. -->
                            </button>
                      </li>
                    {/each}
                  {/if}
                </ul>
                {/snippet}
                </ContextMenu.Trigger>
                <ContextMenu.Content class="min-w-44 p-1 text-ui-xs [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
                  <ContextMenu.Item onSelect={() => toggleSelect(menuView)}>
                    {#if selectedItems.has(menuView)}
                      <Icon name="square" />
                      Deselect
                    {:else}
                      <Icon name="square-check" />
                      Select
                    {/if}
                  </ContextMenu.Item>
                  <ContextMenu.Separator />
                  <ContextMenu.Item variant="destructive" disabled={$readOnlyMode} title={$readOnlyMode ? READ_ONLY_HINT : undefined} onSelect={() => openDangerDialog('drop', menuView)}>
                    <Icon name="trash-2" />
                    Drop view
                  </ContextMenu.Item>
                </ContextMenu.Content>
                </ContextMenu.Root>
              {/if}
            {/if}


            <!-- ── Empty state, one per tab ──────────────────────── -->
            {#if tabIsEmpty}
              {@const empty = TAB_EMPTY[sidebarTab]}
              <div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <div class="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/30">
                  <Icon name={tabEmptyFromFilter ? 'search' : empty.icon} class="size-5 text-muted-foreground" />
                </div>
                <div class="max-w-[16rem]">
                  <p class="text-ui-xs font-medium text-foreground">
                    {tabEmptyFromFilter ? 'No matches' : empty.title}
                  </p>
                  <p class="mt-1 text-ui-2xs leading-relaxed text-muted-foreground">
                    {#if tabEmptyFromFilter}
                      Nothing here matches “{debouncedFilter}”.
                    {:else if sidebarTab === 'tables' && activeSchema}
                      Nothing in “{activeSchema}” yet.
                    {:else}
                      {empty.hint}
                    {/if}
                  </p>
                </div>
                {#if tabEmptyFromFilter}
                  <Button variant="outline" size="sm" onclick={() => handleFilterInput('')}>
                    <Icon name="x" class="size-3.5" />
                    Clear filter
                  </Button>
                {:else if sidebarTab === 'tables' || sidebarTab === 'databases'}
                  <Button variant="outline" size="sm" onclick={onrefresh}>
                    <Icon name="refresh-cw" class="size-3.5" />
                    Refresh
                  </Button>
                {/if}
              </div>
            {/if}

            <!-- ── Materialized Views ─────────────────────────────── -->
            {#if showMatViews && (matViews.length > 0 || filteredMatViews.length > 0)}
              <div class="flex w-full items-center gap-1 px-2.5 pt-2 pb-1">
                <span
                  class="text-ui-2xs font-medium tracking-wider text-muted-foreground uppercase"
                  >Materialized Views</span
                >
                {#if matViews.length > 0}
                  {@render countBadge(filteredMatViews.length, matViews.length)}
                {/if}
              </div>
              {#if matViewsOpen}
                <!-- One menu for the list - see the tables list above for why. -->
                <ContextMenu.Root>
                <ContextMenu.Trigger>
                {#snippet child({ props })}
                {@const openMenu = props.oncontextmenu}
                <ul
                  {...props}
                  oncontextmenu={(e) => {
                    const li = e.target instanceof Element ? e.target.closest('li[data-matview]') : null
                    if (!(li instanceof HTMLElement)) return
                    menuMatView = li.dataset.matview ?? ''
                    openMenu?.(e)
                  }}
                  class="flex w-full min-w-full flex-col px-1.5 pb-1 [&>li]:pb-0.5 [&>li]:[content-visibility:auto] [&>li]:[contain-intrinsic-size:auto_1.875rem]"
                >
                  {#if filteredMatViews.length === 0}
                    <!-- The tab-level empty state covers this. -->
                  {:else}
                    {#each matViewsToRender as mv (mv.name)}
                      {@const isSelected = selectedItems.has(mv.name)}
                      <li data-matview={mv.name}>
                            <button
                              type="button"
                              class={cn(
                                "group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-2 py-1.5 text-left transition-colors",
                                isSelected
                                  ? "bg-primary/10 text-foreground"
                                  : activeTable === mv.name
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                    : "text-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground",
                              )}
                              onclick={() => ontableselect(mv.name)}
                            >
                              <span
                                class="relative size-3 shrink-0"
                                onclick={(e) => { e.stopPropagation(); toggleSelect(mv.name) }}
                                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleSelect(mv.name); } }}
                                role="checkbox"
                                aria-checked={isSelected}
                                tabindex="-1"
                              >
                                {#if isSelected}
                                  <Icon name="square-check" class="size-3 text-primary" />
                                {:else}
                                  <Icon name="layers" class="size-3 opacity-50 group-hover:hidden" />
                                  <Icon name="square" class="size-3 hidden opacity-40 group-hover:block" />
                                {/if}
                              </span>
                              <span class="min-w-0 truncate font-mono text-ui-sm leading-4">{mv.name}</span>
                              {#if showRowCount}
                              <span class="shrink-0 text-right font-mono text-ui-xs leading-4 tabular-nums text-muted-foreground">
                                {formatTableRowCount(mv.rowCount)}
                              </span>
                              {/if}
                            </button>
                      </li>
                    {/each}
                  {/if}
                </ul>
                {/snippet}
                </ContextMenu.Trigger>
                <ContextMenu.Content class="min-w-44 p-1 text-ui-xs [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
                  <ContextMenu.Item onSelect={() => toggleSelect(menuMatView)}>
                    {#if selectedItems.has(menuMatView)}
                      <Icon name="square" />
                      Deselect
                    {:else}
                      <Icon name="square-check" />
                      Select
                    {/if}
                  </ContextMenu.Item>
                  <ContextMenu.Separator />
                  <ContextMenu.Item variant="destructive" disabled={$readOnlyMode} title={$readOnlyMode ? READ_ONLY_HINT : undefined} onSelect={() => openDangerDialog('drop', menuMatView)}>
                    <Icon name="trash-2" />
                    Drop view
                  </ContextMenu.Item>
                </ContextMenu.Content>
                </ContextMenu.Root>
              {/if}
            {/if}


          {/if}

        </div>
      </div>
    </div>
    {:else if navSidebarPanel === "connections"}
      <ConnectionsSidebarPanel
        {connections}
        activeId={activeConnectionId}
        onswitch={onswitchconnection}
        onadd={onaddconnection}
        onremove={onremoveconnection}
        onsetgroup={onsetconnectiongroup}
        ondisconnect={ondisconnectconnection}
      />
    {:else if navSidebarPanel === "extensions"}
      <ExtensionsSidebarPanel onopendetail={onopenextensiondetail} />
    {/if}

  </aside>
  </ContextMenu.Trigger>
  <ContextMenu.Content class="min-w-52 p-1 text-ui-xs [&_[data-slot=context-menu-item]]:items-center [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:whitespace-nowrap [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]_svg]:size-3.5 [&_[data-slot=context-menu-item]_svg]:shrink-0">
    <ContextMenu.Item onSelect={() => onmoveside(side === "right" ? "left" : "right")}>
      {#if side === "right"}
        <PanelLeft /> Move sidebar to the left
      {:else}
        <PanelRight /> Move sidebar to the right
      {/if}
    </ContextMenu.Item>
  </ContextMenu.Content>
  </ContextMenu.Root>
  <ResizeHandle
    edge={side === "right" ? "start" : "end"}
    onresizestart={() => {
      resizeStartWidth = width;
      resizeScale = getAppScale();
    }}
    onresize={(dx) => {
      width = clampNavSidebarWidth(resizeStartWidth + dx / resizeScale);
    }}
    onresizeend={() => {
      resizeStartWidth = width;
      saveLayout({ navSidebarWidth: width });
    }}
  />
</div>

<DangerousActionDialog
  bind:open={dangerOpen}
  action={dangerAction}
  schema={activeSchema}
  table={dangerTable}
  bind:cascade={dangerCascade}
  onconfirm={(c) => confirmDanger(c)}
/>

