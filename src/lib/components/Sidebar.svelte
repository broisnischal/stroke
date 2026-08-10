<script>
  import { untrack } from "svelte";
  import { createHotkey } from "@tanstack/svelte-hotkeys";
  import Icon from "./Icon.svelte";
  import SearchableMenu from "./SearchableMenu.svelte";
  import { listDatabases, canSwitchDatabase, currentDatabaseKey } from "$lib/databases.js";
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
  import { cn } from "$lib/utils.js";
  import { t } from "$lib/i18n.js";
  import { formatTableRowCount } from "$lib/table-list.js";
  import {
    clampNavSidebarWidth,
    loadLayout,
    saveLayout,
  } from "$lib/stores/layout.js";

  const initialLayout = loadLayout();
  let width = $state(initialLayout.navSidebarWidth);
  let resizeStartWidth = initialLayout.navSidebarWidth;

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

  const _initial = loadSidebarSections()
  let recentOpen = $state(_initial.recent ?? false);
  let databasesOpen = $state(_initial.databases ?? false);
  /** @type {import('$lib/databases.js').DatabaseEntry[]} */
  let dbEntries = $state([]);
  let dbEntriesLoading = $state(false);
  let dbEntriesLoaded = $state(false);
  let dbEntriesError = $state('');
  let tablesOpen = $state(_initial.tables ?? true);
  let viewsOpen = $state(_initial.views ?? false);
  let matViewsOpen = $state(_initial.matViews ?? false);
  $effect(() => { saveSidebarSection('recent', recentOpen) })
  $effect(() => { saveSidebarSection('databases', databasesOpen) })

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

  function toggleDatabases() {
    databasesOpen = !databasesOpen
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

  const canSwitchDb = $derived(canSwitchDatabase(connection))
  const activeDbKey = $derived(currentDatabaseKey(connection))
  $effect(() => { saveSidebarSection('tables', tablesOpen) })
  $effect(() => { saveSidebarSection('views', viewsOpen) })
  $effect(() => { saveSidebarSection('matViews', matViewsOpen) })

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
  let showTables = $state(_dp.showTables ?? true)
  let showViews = $state(_dp.showViews ?? true)
  let showMatViews = $state(_dp.showMatViews ?? true)
  let showRecent = $state(_dp.showRecent ?? true)
  let showPins = $state(_dp.showPins ?? true)
  let showDatabases = $state(_dp.showDatabases ?? true)
  let showRowCount = $state(_dp.showRowCount ?? true)
  let hideEmpty = $state(_dp.hideEmpty ?? false)
  let hideSystem = $state(_dp.hideSystem ?? false)
  /** @type {'name' | 'rowCount'} */
  let sortBy = $state(_dp.sortBy ?? 'name')
  /** @type {'asc' | 'desc'} */
  let sortDir = $state(_dp.sortDir ?? 'asc')

  $effect(() => { saveDisplayPrefs({ showTables, showViews, showMatViews, showRecent, showDatabases, sortBy, showPins, showRowCount, sortDir, hideEmpty, hideSystem }) })

  /** System / migration tables that are usually noise: `_prisma_migrations`, `pg_*`, `sqlite_*`, leading-underscore. */
  function isSystemTable(/** @type {string} */ name) {
    return /^(_|pg_|sql_|sqlite_)/i.test(name)
  }

  // ── Selection state ───────────────────────────────────────────────────────
  /** @type {Set<string>} */
  let selectedItems = $state(new Set())
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
  // The views / materialized-views lists aren't windowed (unlike the tables
  // list), so a schema with thousands of views would instantiate thousands of
  // context-menu components. Render at most VIEW_RENDER_CAP and hint to search
  // for the rest - only pathological schemas ever hit this.
  const VIEW_RENDER_CAP = 500;
  const viewsToRender = $derived(filteredViews.length > VIEW_RENDER_CAP ? filteredViews.slice(0, VIEW_RENDER_CAP) : filteredViews);
  const matViewsToRender = $derived(filteredMatViews.length > VIEW_RENDER_CAP ? filteredMatViews.slice(0, VIEW_RENDER_CAP) : filteredMatViews);

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
  function setAllSections(/** @type {boolean} */ open) {
    recentOpen = open; tablesOpen = open; viewsOpen = open; matViewsOpen = open;
  }
  // ── Virtual list (tables only) ───────────────────────────────────────────
  const VIRT_THRESHOLD = 40   // kick in early - 40+ tables already benefits from virtualization
  const VIRT_BUFFER = 12      // extra rows rendered above and below the viewport
  // Row stride is MEASURED from the DOM, not assumed: row height scales with the
  // app zoom / font-size (Linux even uses a 15px base), and any drift between an
  // assumed constant and reality × hundreds of rows = phantom scroll space below
  // the last table (the "keeps scrolling past the end" gutter). 27px is only the
  // pre-measure fallback.
  let rowH = $state(27)
  $effect(() => {
    const el = tableListEl
    void scrollContainerEl // re-attach the observer when the scroll host mounts
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      // Spacer <li>s are aria-hidden - measure the stride between two real rows.
      const rows = /** @type {NodeListOf<HTMLElement>} */ (el.querySelectorAll('li:not([aria-hidden])'))
      if (rows.length >= 2) {
        const stride = rows[1].offsetTop - rows[0].offsetTop
        // Read rowH untracked: this effect must NOT depend on the value it writes,
        // or setting rowH re-runs it, and a stride that doesn't settle in one pass
        // spins until Svelte's infinite-loop guard trips. The ResizeObserver still
        // re-measures on real layout changes.
        const cur = untrack(() => rowH)
        if (stride > 10 && Math.abs(stride - cur) > 0.5) rowH = stride
      }
      // Same observer covers the other half of the window maths: a layout change
      // in the list also means its offset in the scroll container may have moved.
      untrack(() => measureListOffset())
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // Also watch the scrolled content: a section above the list (databases,
    // recent, pinned) opening or closing moves the list without resizing it.
    const content = scrollContainerEl?.firstElementChild
    if (content) ro.observe(content)
    return () => ro.disconnect()
  })
  // The window shifts one row at a time: `virtStart` is floored to ROW_H, so the
  // derived already short-circuits (returns the same value) for every scroll event
  // within a row - no re-render, no spacer resize until you actually cross a row
  // boundary. That keeps each update tiny (±1 row) instead of a batched chunk hitch.

  /** @type {HTMLElement | null} */
  let scrollContainerEl = $state(null)
  /** @type {HTMLElement | null} */
  let tableListEl = $state(null)
  let sidebarScrollTop = $state(0)
  let sidebarHeight = $state(0)
  // Update the virtual window synchronously on scroll. Reading scrollTop here is a
  // cheap cached read (layout is already up to date inside a scroll handler) and
  // Svelte coalesces the resulting re-renders into a single flush per frame. A RAF
  // hop would only push the rendered window one frame *behind* the scrollbar thumb,
  // which reads as lag while dragging.
  function onSidebarScroll() {
    if (!scrollContainerEl) return
    sidebarScrollTop = scrollContainerEl.scrollTop
  }
  /** Offset of the tables <ul> from the top of the scroll container. Re-measured
   *  whenever sections above it open/close (recent, pinned) or refs change. */
  let tableListOffsetTop = $state(0)

  /**
   * Distance from the top of the scrolled content to the tables <ul>.
   *
   * Measured from live rects rather than walked through `offsetParent`: that walk
   * only terminated when an ancestor happened to be the scroll container, and it
   * ran off an enumerated list of "things above the list". Anything else that
   * grew above it - expanding the databases section, a filter that changes the
   * pinned block - left the offset stale and small, which pushed `virtStart` far
   * past the real first visible row: the list rendered its tail behind a giant
   * empty spacer (the black gap).
   */
  function measureListOffset() {
    const el = tableListEl
    const container = scrollContainerEl
    if (!el || !container) return
    const off = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
    if (Math.abs(off - tableListOffsetTop) > 0.5) tableListOffsetTop = off
  }

  // Re-measure whenever anything that can move the list re-renders. Cheap: two
  // rect reads, and only when one of these actually changes.
  $effect(() => {
    void recentOpen
    void visiblePinnedTables.length
    void showRecent
    void filteredRegularTables.length
    void tablesOpen
    void tableListEl
    void scrollContainerEl
    measureListOffset()
  })

  const shouldVirtualize = $derived(filteredRegularTables.length > VIRT_THRESHOLD)

  const virtStart = $derived.by(() => {
    if (!shouldVirtualize) return 0
    return Math.max(0, Math.floor((sidebarScrollTop - tableListOffsetTop) / rowH) - VIRT_BUFFER)
  })
  const virtEnd = $derived.by(() => {
    if (!shouldVirtualize) return filteredRegularTables.length
    const end = Math.ceil((sidebarScrollTop + sidebarHeight - tableListOffsetTop) / rowH) + VIRT_BUFFER
    return Math.min(filteredRegularTables.length, end)
  })
  const virtTopPad  = $derived(shouldVirtualize ? virtStart * rowH : 0)
  const virtBotPad  = $derived(shouldVirtualize ? Math.max(0, (filteredRegularTables.length - virtEnd) * rowH) : 0)

  /** Shared field chrome for schema select + table filter (aligned in sidebar grid) */
  const sidebarFieldClass =
    "h-7 w-full min-w-0 rounded-lg border-2 border-border bg-background/40 text-ui-sm text-foreground shadow-none transition-colors hover:border-foreground/30 hover:bg-background/55 focus-visible:border-ring/55 focus-visible:ring-2 focus-visible:ring-ring/15";
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
      >{visible}<span class="text-muted-foreground/55">/{total}</span></span>
  {:else}
    <span class="ml-auto font-mono text-ui-2xs text-muted-foreground">{total}</span>
  {/if}
{/snippet}

<div
  class={cn("flex h-full shrink-0", side === "right" && "flex-row-reverse")}
  style:width="{width}px"
  data-studio-region="sidebar"
>
  <ContextMenu.Root>
  <ContextMenu.Trigger class="flex h-full min-w-0 flex-1">
  <aside
    class="studio-chrome flex h-full min-w-0 flex-1 flex-col bg-sidebar text-sidebar-foreground"
    data-studio-chrome
  >
    {#if navSidebarPanel === "tables"}
    <div class="flex min-h-0 flex-1 flex-col">

      <div class="flex shrink-0 flex-col">
        <div class="flex h-9 min-w-0 items-center gap-1 px-2">
          <div class="min-w-0 flex-1">
            {#if schemas.length === 0}
              <span
                class={cn(
                  sidebarFieldClass,
                  "flex items-center px-2.5 font-medium",
                )}
                id="sidebar-schema"
              >
                -
              </span>
            {:else}
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
                    class={cn(sidebarFieldClass, "flex h-7 w-full items-center justify-between gap-2 px-2.5 font-normal")}
                  >
                    <span class="truncate">{activeSchema}</span>
                    <Icon name="chevron-down" class="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                {/snippet}
                {#snippet item(it)}
                  <Icon name="box" class="size-3.5 shrink-0 text-muted-foreground/50" />
                  <span class="min-w-0 flex-1 truncate">{it.label}</span>
                  {#if it.value === activeSchema}<Icon name="check" class="size-3.5 shrink-0 text-primary" />{/if}
                {/snippet}
              </SearchableMenu>
            {/if}
          </div>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground disabled:pointer-events-none disabled:opacity-40"
              title="Display options"
              disabled={!connectionName}
            >
              <Icon name="list-filter" class="size-3.5" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="start" class="min-w-52">
              <div class="px-2 pt-1 pb-1.5 text-ui-2xs text-muted-foreground/70 leading-relaxed">
                <span class="font-mono text-foreground/80">{regularTables.length}</span> tables{#if views.length} · <span class="font-mono text-foreground/80">{views.length}</span> views{/if}{#if matViews.length} · <span class="font-mono text-foreground/80">{matViews.length}</span> mat.{/if}
                {#if hiddenCount > 0}<br /><span class="text-warning">{hiddenCount} hidden by filters</span>{/if}
              </div>
              <DropdownMenu.Separator />
              <DropdownMenu.Label class="px-2 py-0.5 text-ui-2xs font-medium uppercase tracking-wide text-muted-foreground/60">Show</DropdownMenu.Label>
              <DropdownMenu.CheckboxItem
                checked={showDatabases}
                onCheckedChange={(v) => (showDatabases = v)}
              ><Icon name="database" class="text-muted-foreground" />Databases</DropdownMenu.CheckboxItem>
              <DropdownMenu.CheckboxItem
                checked={showRecent}
                onCheckedChange={(v) => (showRecent = v)}
              ><Icon name="clock" class="text-muted-foreground" />Recent</DropdownMenu.CheckboxItem>
              <DropdownMenu.CheckboxItem
                checked={showTables}
                onCheckedChange={(v) => (showTables = v)}
              ><Icon name="table-2" class="text-muted-foreground" />Tables</DropdownMenu.CheckboxItem>
              <DropdownMenu.CheckboxItem
                checked={showViews}
                onCheckedChange={(v) => (showViews = v)}
              ><Icon name="table-view" class="text-muted-foreground" />Views</DropdownMenu.CheckboxItem>
              <DropdownMenu.CheckboxItem
                checked={showMatViews}
                onCheckedChange={(v) => (showMatViews = v)}
              ><Icon name="layers" class="text-muted-foreground" />Materialized Views</DropdownMenu.CheckboxItem>
              <DropdownMenu.CheckboxItem
                checked={showPins}
                onCheckedChange={(v) => (showPins = v)}
              ><Icon name="pin" class="text-muted-foreground" />Pins</DropdownMenu.CheckboxItem>
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
              <DropdownMenu.Label class="px-2 py-0.5 text-ui-2xs font-medium uppercase tracking-wide text-muted-foreground/60">Sort by</DropdownMenu.Label>
              <!-- Field + direction merged: pick a field, click it again to flip. -->
              <DropdownMenu.Item
                closeOnSelect={false}
                title="Click to flip direction"
                onSelect={() => { if (sortBy === 'name') sortDir = sortDir === 'asc' ? 'desc' : 'asc'; else sortBy = 'name' }}
              >
                <Icon name={sortBy === 'name' && sortDir === 'desc' ? 'arrow-up-a-z' : 'arrow-down-a-z'} class="text-muted-foreground" />
                Name
                {#if sortBy === 'name'}
                  <span class="ml-auto font-mono text-ui-2xs text-muted-foreground/50">{sortDir === 'asc' ? 'A→Z' : 'Z→A'}</span>
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
                  <span class="ml-auto font-mono text-ui-2xs text-muted-foreground/50">{sortDir === 'desc' ? '9→0' : '0→9'}</span>
                {/if}
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item onSelect={() => setAllSections(true)} closeOnSelect={false}>
                <Icon name="chevrons-up-down" class="text-muted-foreground" />
                Expand all
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => setAllSections(false)} closeOnSelect={false}>
                <Icon name="chevrons-down-up" class="text-muted-foreground" />
                Collapse all
              </DropdownMenu.Item>
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

        <div class="flex h-9 items-center border-b border-sidebar-border px-2">
          <div class="relative min-w-0 w-full">
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
            aria-label="Filter sidebar"
            data-sidebar-filter
          />
          </div>
        </div>
      </div>

      <div class="flex min-h-0 flex-1 flex-col">
        <div
          bind:this={scrollContainerEl}
          bind:clientHeight={sidebarHeight}
          class="app-scroll min-h-0 w-full flex-1 overflow-y-auto overscroll-y-contain [will-change:scroll-position]"
          role="none"
          use:smoothScroll={{ enabled: !$appNativeScroll }}
          onscroll={onSidebarScroll}
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
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-1 text-left"
                  onclick={toggleDatabases}
                >
                  <Icon name="chevron-down"
                    class={cn(
                      "size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150",
                      !databasesOpen && "-rotate-90",
                    )}
                  />
                  <Icon name="database" class="size-3 shrink-0 text-muted-foreground/60" />
                  <span class="text-ui-2xs font-medium tracking-wider text-muted-foreground/55 uppercase">Databases</span>
                  {#if filteredDbEntries.length > 0}
                    <span class="ml-1 font-mono text-ui-2xs text-muted-foreground/60">{filteredDbEntries.length}</span>
                  {/if}
                </button>
                {#if databasesOpen}
                  <button
                    type="button"
                    class="ml-auto inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-foreground"
                    onclick={() => void loadDatabases()}
                    title="Refresh databases"
                    disabled={dbEntriesLoading}
                  >
                    <Icon name="refresh-cw" class={cn("size-3", dbEntriesLoading && "animate-spin")} />
                  </button>
                {/if}
              </div>
              {#if databasesOpen}
                {#if dbEntriesLoading && dbEntries.length === 0}
                  <p class="px-4 pb-1.5 text-ui-2xs text-muted-foreground/40">Loading…</p>
                {:else if dbEntriesError && dbEntries.length === 0}
                  <p class="px-4 pb-1.5 text-ui-2xs text-destructive/70">{dbEntriesError}</p>
                {:else if filteredDbEntries.length === 0}
                  <p class="px-4 pb-1.5 text-ui-2xs text-muted-foreground/40">
                    {!dbEntriesLoaded ? 'Loading…' : lf ? 'No matching databases' : 'No other databases'}
                  </p>
                {:else}
                  <ul class="flex w-full min-w-full flex-col gap-0.5 px-1.5 pb-1">
                    {#each filteredDbEntries as db (db.key)}
                      {@const isCurrent = db.key === activeDbKey}
                      <li>
                        <button
                          type="button"
                          disabled={isCurrent}
                          class={cn(
                            "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-2 py-1.5 text-left transition-colors",
                            isCurrent
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground",
                          )}
                          onclick={() => !isCurrent && onswitchdatabase(db)}
                          title={isCurrent ? `${db.label} (current)` : `Switch to ${db.label}`}
                        >
                          <Icon name="database" class="size-3 shrink-0 opacity-50" />
                          <span class="min-w-0 truncate font-mono text-ui-sm leading-4">{db.label}</span>
                          {#if isCurrent}
                            <Icon name="check" class="size-3 shrink-0 text-success" />
                          {/if}
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}
              {/if}
            {/if}

            <!-- ── Recent ─────────────────────────────────────────── -->
            {#if showRecent && filteredRecent.length > 0 && connectionName}
              <div class="flex w-full items-center gap-1 px-2.5 pt-2 pb-1">
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-1 text-left"
                  onclick={() => (recentOpen = !recentOpen)}
                >
                  <Icon name="chevron-down"
                    class={cn(
                      "size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150",
                      !recentOpen && "-rotate-90",
                    )}
                  />
                  <Icon name="clock" class="size-3 shrink-0 text-muted-foreground/60" />
                  <span class="text-ui-2xs font-medium tracking-wider text-muted-foreground/55 uppercase">Recent</span>
                  <span class="ml-1 font-mono text-ui-2xs text-muted-foreground/60">{Math.min(filteredRecent.length, 5)}</span>
                </button>
                <button
                  type="button"
                  class="ml-auto font-mono text-ui-2xs text-muted-foreground/50 hover:text-destructive transition-colors"
                  onclick={onrecentclear}
                  title="Clear recent"
                >Clear</button>
              </div>
              {#if recentOpen}
                <ul class="flex w-full min-w-full flex-col gap-0.5 px-1.5 pb-1">
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
                        onkeydown={(e) => e.key === 'Enter' && onrecentselect(item.schema, item.table)}
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
                          title="Remove from recent"
                          class="invisible inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:text-foreground group-hover/recent:inline-flex"
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
                <Icon name="pin" class="size-3 shrink-0 text-muted-foreground/60" />
                <span class="text-ui-2xs font-medium tracking-wider text-muted-foreground/55 uppercase">Pinned</span>
                <span class="ml-1 font-mono text-ui-2xs text-muted-foreground/60">{visiblePinnedTables.length}</span>
                {#if pinnedTables.length > 5}
                  <button
                    type="button"
                    class="ml-auto font-mono text-ui-2xs text-muted-foreground/50 hover:text-destructive transition-colors"
                    onclick={clearAllPins}
                    title="Clear all pinned tables"
                  >Clear all</button>
                {/if}
              </div>
              <ul class="flex w-full min-w-full flex-col gap-0.5 px-1.5 pb-1">
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
                              <Icon name="pin" class="size-3 text-muted-foreground/45 group-hover:hidden" />
                              <Icon name="square" class="size-3 hidden opacity-40 group-hover:block" />
                            {/if}
                          </span>
                          <span class="min-w-0 truncate font-mono text-ui-sm leading-4">{tableName}</span>
                          {#if showRowCount}
                          <span class="shrink-0 text-right font-mono text-ui-xs leading-4 tabular-nums text-muted-foreground/85">
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
            <button
              type="button"
              class="flex w-full items-center gap-1 px-2.5 pt-2 pb-1 text-left"
              onclick={() => {
                tablesOpen = !tablesOpen;
              }}
            >
              <Icon name="chevron-down"
                class={cn(
                  "size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150",
                  !tablesOpen && "-rotate-90",
                )}
              />
              <span
                class="text-ui-2xs font-medium tracking-wider text-muted-foreground/55 uppercase"
                >{$t('sidebar.tables')}</span
              >
              {#if regularTablesUnpinned.length > 0}
                {@render countBadge(filteredRegularTables.length, regularTablesUnpinned.length)}
              {/if}
            </button>
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
              <ul
                bind:this={tableListEl}
                class="flex w-full min-w-full flex-col gap-0.5 px-1.5 pb-1"
              >
                {#if regularTables.length === 0 && tables.length > 0}
                  <li
                    class="flex w-full flex-col items-center gap-2 px-4 py-8 text-center"
                  >
                    <Icon name="table-2" class="size-7 text-muted-foreground/25" />
                    <p class="text-ui-sm text-muted-foreground">
                      No tables in {activeSchema || "schema"}
                    </p>
                  </li>
                {:else if filteredRegularTables.length === 0 && lf}
                  <li
                    class="px-3 py-3 text-center text-ui-xs text-muted-foreground"
                  >
                    No tables match
                  </li>
                {:else}
                  {#if virtTopPad > 0}<li style="height:{virtTopPad}px;flex-shrink:0" aria-hidden="true"></li>{/if}
                  {#each filteredRegularTables.slice(virtStart, virtEnd) as table (table.name)}
                    {@const isSelected = selectedItems.has(table.name)}
                    <li>
                      <ContextMenu.Root>
                        <ContextMenu.Trigger class="w-full">
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
                              class="relative size-3 shrink-0"
                              onclick={(e) => { e.stopPropagation(); selectItem(table.name, e.shiftKey) }}
                              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectItem(table.name, e.shiftKey); } }}
                              role="checkbox"
                              aria-checked={isSelected}
                              tabindex="-1"
                            >
                              {#if isSelected}
                                <Icon name="square-check" class="size-3 text-primary" />
                              {:else}
                                <Icon name="table-2" class="size-3 opacity-50 group-hover:hidden" />
                                <Icon name="square" class="size-3 hidden opacity-40 group-hover:block" />
                              {/if}
                            </span>
                            <span class="flex min-w-0 items-center gap-1.5">
                              <span class="min-w-0 truncate font-mono text-ui-sm leading-4">{table.name}</span>
                              {#if table.rlsEnabled}
                                <Icon name="lock" class="size-2.5 shrink-0 text-muted-foreground/50" title="Row-level security enabled" />
                              {/if}
                            </span>
                            {#if showRowCount}
                            <!-- Fixed min-width so the column doesn't grow (shifting
                                 every row) when lazy counts resolve from '…' to numbers. -->
                            <span
                              class="flex min-w-[4ch] shrink-0 items-center justify-end font-mono text-ui-xs leading-4 tabular-nums text-muted-foreground"
                              title={table.rowCount != null ? Number(table.rowCount).toLocaleString("en-US") : "Counting rows…"}
                            >
                              {#if table.rowCount == null}
                                <!-- A pending count is one static mark, not motion.
                                     A pulsing pill per row turned a long table list
                                     into thirty things blinking out of sync, which
                                     reads as the app struggling; the counts arrive
                                     in under a second anyway. A literal "…" sat on
                                     the text baseline and hung low against the
                                     numbers beside it, so this is an underscore
                                     rule on the digits' own baseline — it holds the
                                     column width and stays quiet. -->
                                <span class="h-px w-3 rounded-full bg-muted-foreground/30" aria-hidden="true"></span>
                              {:else}
                                {formatTableRowCount(table.rowCount)}
                              {/if}
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
                          <ContextMenu.Item onSelect={() => { navigator.clipboard.writeText(table.name) }}>
                            <Icon name="clipboard-copy" />
                            Copy name
                          </ContextMenu.Item>
                          <ContextMenu.Item onSelect={() => oncopycolumns(table.name)}>
                            <Icon name="copy" />
                            Copy columns
                          </ContextMenu.Item>
                          {#if openTableSet.has(table.name)}
                            <ContextMenu.Item onSelect={() => onclosetable(table.name)}>
                              <Icon name="x" />
                              Close tab
                            </ContextMenu.Item>
                          {/if}
                          <ContextMenu.Item onSelect={() => togglePin(table.name)}>
                            {#if pinnedTables.includes(table.name)}
                              <Icon name="pin-off" />
                              Unpin table
                            {:else}
                              <Icon name="pin" />
                              Pin table
                            {/if}
                          </ContextMenu.Item>
                          <ContextMenu.Item onSelect={() => toggleSelect(table.name)}>
                            {#if isSelected}
                              <Icon name="square" />
                              Deselect
                            {:else}
                              <Icon name="square-check" />
                              Select
                            {/if}
                          </ContextMenu.Item>
                          <ContextMenu.Separator />
                          <ContextMenu.Item onSelect={() => onopeninconsole(table.name)}>
                            <Icon name="terminal" />
                            Open in SQL console
                          </ContextMenu.Item>
                          <ContextMenu.Item onSelect={() => ongeneratesql(table.name)}>
                            <Icon name="zap" />
                            Generate SQL…
                          </ContextMenu.Item>
                          <ContextMenu.Item onSelect={() => oncountrows(table.name)}>
                            <Icon name="hash" />
                            Count rows
                          </ContextMenu.Item>
                          <ContextMenu.Separator />
                          <ContextMenu.Item onSelect={() => onviewstructure(table.name)}>
                            <Icon name="layout-list" />
                            View structure
                          </ContextMenu.Item>
                          <ContextMenu.Item onSelect={() => onviewddl(table.name)}>
                            <Icon name="code-2" />
                            View DDL
                          </ContextMenu.Item>
                          <ContextMenu.Item onSelect={() => onexportsql(table.name)}>
                            <Icon name="file-down" />
                            Export as SQL
                          </ContextMenu.Item>
                          <ContextMenu.Item onSelect={() => onexportdata(table.name)}>
                            <Icon name="download" />
                            Export data
                          </ContextMenu.Item>
                          <ContextMenu.Separator />
                          <ContextMenu.Item
                            disabled={$readOnlyMode}
                            title={$readOnlyMode ? READ_ONLY_HINT : undefined}
                            onSelect={() => openDangerDialog('truncate', table.name)}
                          >
                            <Icon name="eraser" />
                            Truncate table
                          </ContextMenu.Item>
                          <ContextMenu.Item
                            variant="destructive"
                            disabled={$readOnlyMode}
                            title={$readOnlyMode ? READ_ONLY_HINT : undefined}
                            onSelect={() => openDangerDialog('drop', table.name)}
                          >
                            <Icon name="trash-2" />
                            Drop table
                          </ContextMenu.Item>
                          {/if}
                        </ContextMenu.Content>
                      </ContextMenu.Root>
                    </li>
                  {/each}
                  {#if virtBotPad > 0}<li style="height:{virtBotPad}px;flex-shrink:0" aria-hidden="true"></li>{/if}
                {/if}
              </ul>
              </div>
            {/if}
            {/if}

            <!-- ── Views ──────────────────────────────────────────── -->
            {#if showViews && (views.length > 0 || filteredViews.length > 0)}
              <button
                type="button"
                class="flex w-full items-center gap-1 px-2.5 pt-2 pb-1 text-left"
                onclick={() => {
                  viewsOpen = !viewsOpen;
                }}
              >
                <Icon name="chevron-down"
                  class={cn(
                    "size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150",
                    !viewsOpen && "-rotate-90",
                  )}
                />
                <span
                  class="text-ui-2xs font-medium tracking-wider text-muted-foreground/55 uppercase"
                  >{$t('sidebar.views')}</span
                >
                {#if views.length > 0}
                  {@render countBadge(filteredViews.length, views.length)}
                {/if}
              </button>
              {#if viewsOpen}
                <ul class="flex w-full min-w-full flex-col gap-0.5 px-1.5 pb-1">
                  {#if filteredViews.length === 0}
                    <li
                      class="px-3 py-3 text-center text-ui-xs text-muted-foreground"
                    >
                      No views match
                    </li>
                  {:else}
                    {#each viewsToRender as view (view.name)}
                      {@const isSelected = selectedItems.has(view.name)}
                      <li class="[content-visibility:auto] [contain-intrinsic-size:auto_28px]">
                        <ContextMenu.Root>
                          <ContextMenu.Trigger class="w-full">
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
                          </ContextMenu.Trigger>
                          <ContextMenu.Content class="min-w-44 p-1 text-ui-xs [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
                            <ContextMenu.Item onSelect={() => toggleSelect(view.name)}>
                              {#if isSelected}
                                <Icon name="square" />
                                Deselect
                              {:else}
                                <Icon name="square-check" />
                                Select
                              {/if}
                            </ContextMenu.Item>
                            <ContextMenu.Separator />
                            <ContextMenu.Item variant="destructive" disabled={$readOnlyMode} title={$readOnlyMode ? READ_ONLY_HINT : undefined} onSelect={() => openDangerDialog('drop', view.name)}>
                              <Icon name="trash-2" />
                              Drop view
                            </ContextMenu.Item>
                          </ContextMenu.Content>
                        </ContextMenu.Root>
                      </li>
                    {/each}
                    {#if filteredViews.length > VIEW_RENDER_CAP}
                      <li class="px-3 py-2 text-center text-ui-2xs text-muted-foreground/60">
                        +{filteredViews.length - VIEW_RENDER_CAP} more, search to narrow
                      </li>
                    {/if}
                  {/if}
                </ul>
              {/if}
            {/if}

            <!-- ── All sections hidden ───────────────────────────── -->
            {#if !showTables && !showViews && !showMatViews && !showRecent}
              <div class="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
                <p class="text-ui-xs text-muted-foreground/50">All sections are hidden</p>
                <p class="text-ui-2xs text-muted-foreground/30">Use the filter menu to show them</p>
              </div>
            {/if}

            <!-- ── Empty state ───────────────────────────────────── -->
            {#if !loadingTables && connectionName && tables.length === 0}
              <div class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
                <div class="flex size-10 items-center justify-center rounded-lg border border-border/50 bg-muted/30">
                  <Icon name="table-2" class="size-5 text-muted-foreground/30" />
                </div>
                <div>
                  <p class="text-ui-xs font-medium text-muted-foreground">No tables found</p>
                  <p class="mt-0.5 text-ui-2xs text-muted-foreground/50">{activeSchema ? `in "${activeSchema}"` : 'in this database'}</p>
                </div>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-background/60 px-3 py-1.5 font-mono text-ui-2xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onclick={onrefresh}
                >
                  <Icon name="refresh-cw" class="size-3" />
                  Retry
                </button>
              </div>
            {/if}

            <!-- ── Materialized Views ─────────────────────────────── -->
            {#if showMatViews && (matViews.length > 0 || filteredMatViews.length > 0)}
              <button
                type="button"
                class="flex w-full items-center gap-1 px-2.5 pt-2 pb-1 text-left"
                onclick={() => {
                  matViewsOpen = !matViewsOpen;
                }}
              >
                <Icon name="chevron-down"
                  class={cn(
                    "size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150",
                    !matViewsOpen && "-rotate-90",
                  )}
                />
                <span
                  class="text-ui-2xs font-medium tracking-wider text-muted-foreground/55 uppercase"
                  >Materialized Views</span
                >
                {#if matViews.length > 0}
                  {@render countBadge(filteredMatViews.length, matViews.length)}
                {/if}
              </button>
              {#if matViewsOpen}
                <ul class="flex w-full min-w-full flex-col gap-0.5 px-1.5 pb-1">
                  {#if filteredMatViews.length === 0}
                    <li
                      class="px-3 py-3 text-center text-ui-xs text-muted-foreground"
                    >
                      No materialized views match
                    </li>
                  {:else}
                    {#each matViewsToRender as mv (mv.name)}
                      {@const isSelected = selectedItems.has(mv.name)}
                      <li class="[content-visibility:auto] [contain-intrinsic-size:auto_28px]">
                        <ContextMenu.Root>
                          <ContextMenu.Trigger class="w-full">
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
                          </ContextMenu.Trigger>
                          <ContextMenu.Content class="min-w-44 p-1 text-ui-xs [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
                            <ContextMenu.Item onSelect={() => toggleSelect(mv.name)}>
                              {#if isSelected}
                                <Icon name="square" />
                                Deselect
                              {:else}
                                <Icon name="square-check" />
                                Select
                              {/if}
                            </ContextMenu.Item>
                            <ContextMenu.Separator />
                            <ContextMenu.Item variant="destructive" disabled={$readOnlyMode} title={$readOnlyMode ? READ_ONLY_HINT : undefined} onSelect={() => openDangerDialog('drop', mv.name)}>
                              <Icon name="trash-2" />
                              Drop view
                            </ContextMenu.Item>
                          </ContextMenu.Content>
                        </ContextMenu.Root>
                      </li>
                    {/each}
                    {#if filteredMatViews.length > VIEW_RENDER_CAP}
                      <li class="px-3 py-2 text-center text-ui-2xs text-muted-foreground/60">
                        +{filteredMatViews.length - VIEW_RENDER_CAP} more, search to narrow
                      </li>
                    {/if}
                  {/if}
                </ul>
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
    }}
    onresize={(dx) => {
      width = clampNavSidebarWidth(resizeStartWidth + dx);
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

