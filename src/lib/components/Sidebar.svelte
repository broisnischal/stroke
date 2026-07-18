<script>
  import { untrack } from "svelte";
  import { createHotkey } from "@tanstack/svelte-hotkeys";
  import Icon from "./Icon.svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import DangerousActionDialog from "./DangerousActionDialog.svelte";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import PanelRight from "@lucide/svelte/icons/panel-right";
  import PanelLeft from "@lucide/svelte/icons/panel-left";
  import ResizeHandle from "./ResizeHandle.svelte";
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
    /** @type {import('$lib/stores/query-history.js').QueryHistoryEntry[]} */
    queryHistory = [],
    onqueryselect = /** @type {(sql: string) => void} */ (() => {}),
    /** @type {import('$lib/stores/connections.js').SavedConnection | null} */
    connection = null,
    ontruncatetable = /** @type {(table: string) => void} */ (() => {}),
    ondroptable = /** @type {(table: string, cascade: boolean) => void} */ (() => {}),
    /** @type {import('$lib/stores/recent-tabs.js').RecentTab[]} */
    recentTabs = [],
    onrecentselect = /** @type {(schema: string, table: string) => void} */ (() => {}),
    onrecentremove = /** @type {(schema: string, table: string) => void} */ (() => {}),
    onrecentclear = () => {},
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

  // Section open/collapsed state — persisted across sidebar toggles
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
  let tablesOpen = $state(_initial.tables ?? true);
  let viewsOpen = $state(_initial.views ?? false);
  let matViewsOpen = $state(_initial.matViews ?? false);
  $effect(() => { saveSidebarSection('recent', recentOpen) })
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
    return { showTables: true, showViews: true, showMatViews: true, showRecent: true, sortBy: 'name', showPins: true, showRowCount: true, sortDir: 'asc', hideEmpty: false, hideSystem: false }
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
  let showRowCount = $state(_dp.showRowCount ?? true)
  let hideEmpty = $state(_dp.hideEmpty ?? false)
  let hideSystem = $state(_dp.hideSystem ?? false)
  /** @type {'name' | 'rowCount'} */
  let sortBy = $state(_dp.sortBy ?? 'name')
  /** @type {'asc' | 'desc'} */
  let sortDir = $state(_dp.sortDir ?? 'asc')

  $effect(() => { saveDisplayPrefs({ showTables, showViews, showMatViews, showRecent, sortBy, showPins, showRowCount, sortDir, hideEmpty, hideSystem }) })

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

  // Sorted, hide-filtered, un-pinned base — recomputes only when the data, sort,
  // hide toggles or pins change (NOT on every keystroke). The search term then
  // just filters this base, so typing avoids the sort + array clones.
  const sortedRegularBase = $derived(
    applySortBy(regularTables.filter((t) => !pinnedSet.has(t.name))),
  );
  const filteredRegularTables = $derived(
    lf ? sortedRegularBase.filter((t) => t.name.toLowerCase().includes(lf)) : sortedRegularBase,
  );

  // Selectable rows in display order (pinned first, then regular) — drives shift range-select.
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
    const next = new Set(selectedItems)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    selectedItems = next
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
  // for the rest — only pathological schemas ever hit this.
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
  const VIRT_THRESHOLD = 40   // kick in early — 40+ tables already benefits from virtualization
  const VIRT_BUFFER = 12      // extra rows rendered above and below the viewport
  // Row stride is MEASURED from the DOM, not assumed: row height scales with the
  // app zoom / font-size (Linux even uses a 15px base), and any drift between an
  // assumed constant and reality × hundreds of rows = phantom scroll space below
  // the last table (the "keeps scrolling past the end" gutter). 27px is only the
  // pre-measure fallback.
  let rowH = $state(27)
  $effect(() => {
    const el = tableListEl
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      // Spacer <li>s are aria-hidden — measure the stride between two real rows.
      const rows = /** @type {NodeListOf<HTMLElement>} */ (el.querySelectorAll('li:not([aria-hidden])'))
      if (rows.length >= 2) {
        const stride = rows[1].offsetTop - rows[0].offsetTop
        if (stride > 10 && Math.abs(stride - rowH) > 0.5) rowH = stride
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  })
  // The window shifts one row at a time: `virtStart` is floored to ROW_H, so the
  // derived already short-circuits (returns the same value) for every scroll event
  // within a row — no re-render, no spacer resize until you actually cross a row
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
    if (scrollContainerEl) sidebarScrollTop = scrollContainerEl.scrollTop
  }
  /** Offset of the tables <ul> from the top of the scroll container. Re-measured
   *  whenever sections above it open/close (recent, pinned) or refs change. */
  let tableListOffsetTop = $state(0)

  $effect(() => {
    // Dependencies that change the table-list's position in the scroll container
    const _recentOpen = recentOpen
    const _pins = visiblePinnedTables.length
    const _showRecent = showRecent
    const _el = tableListEl
    const _container = scrollContainerEl
    if (!_el || !_container) return
    let node = /** @type {HTMLElement | null} */ (_el)
    let off = 0
    while (node && node !== _container) { off += node.offsetTop; node = /** @type {HTMLElement | null} */ (node.offsetParent) }
    tableListOffsetTop = off
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
    "h-7 w-full min-w-0 rounded-md border border-border bg-background/40 text-ui-sm text-foreground shadow-none transition-colors hover:bg-background/55 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring";
</script>

<svelte:window onkeydown={(e) => {
  // Guard: filterEl.offsetParent is null when sidebar is hidden via display:none
  if (!filterEl || !filterEl.offsetParent) return
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === 'f') {
    e.preventDefault(); filterEl.focus(); filterEl.select()
  }
  if (e.key === 'Escape' && selectedItems.size > 0) {
    clearSelection()
  }
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
    <!-- Traffic lights moved to TitleBar (full-width) -->
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
                —
              </span>
            {:else}
              <Select.Root
                type="single"
                value={activeSchema}
                onValueChange={(v) => {
                  if (v) onschemachange(v);
                }}
              >
                <Select.Trigger
                  id="sidebar-schema"
                  size="sm"
                  class={cn(
                    sidebarFieldClass,
                    "justify-between gap-2 px-2.5 font-normal focus-visible:ring-1 data-[size=sm]:h-7 [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground",
                  )}
                >
                  <span class="truncate">{activeSchema}</span>
                </Select.Trigger>
                <Select.Content
                  sideOffset={6}
                  class="w-[var(--bits-select-anchor-width)] min-w-[var(--bits-select-anchor-width)] p-1"
                >
                  {#each schemas as schema (schema)}
                    <Select.Item
                      value={schema}
                      label={schema}
                      class="rounded-sm py-1.5 pr-8 pl-2.5 text-ui-sm"
                    />
                  {/each}
                </Select.Content>
              </Select.Root>
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
            <DropdownMenu.Content
              align="start"
              class={cn(
                "w-56 p-1",
                // Readable 13px rows with a leading icon + label, comfortable padding — matches the cell context menu.
                "[&_[data-slot=dropdown-menu-checkbox-item]]:gap-2 [&_[data-slot=dropdown-menu-checkbox-item]]:rounded-md [&_[data-slot=dropdown-menu-checkbox-item]]:py-1.5 [&_[data-slot=dropdown-menu-checkbox-item]]:pr-8 [&_[data-slot=dropdown-menu-checkbox-item]]:pl-2 [&_[data-slot=dropdown-menu-checkbox-item]]:text-ui-sm",
                "[&_[data-slot=dropdown-menu-radio-item]]:gap-2 [&_[data-slot=dropdown-menu-radio-item]]:py-1.5 [&_[data-slot=dropdown-menu-radio-item]]:pr-8 [&_[data-slot=dropdown-menu-radio-item]]:pl-2 [&_[data-slot=dropdown-menu-radio-item]]:text-ui-sm",
                "[&_[data-slot=dropdown-menu-item]]:gap-2 [&_[data-slot=dropdown-menu-item]]:py-1.5 [&_[data-slot=dropdown-menu-item]]:pl-2 [&_[data-slot=dropdown-menu-item]]:text-ui-sm",
                "[&_svg]:size-3.5 [&_svg]:shrink-0",
              )}
            >
              <div class="px-2 pt-1 pb-1.5 text-ui-2xs text-muted-foreground/70 leading-relaxed">
                <span class="font-mono text-foreground/80">{regularTables.length}</span> tables{#if views.length} · <span class="font-mono text-foreground/80">{views.length}</span> views{/if}{#if matViews.length} · <span class="font-mono text-foreground/80">{matViews.length}</span> mat.{/if}
                {#if hiddenCount > 0}<br /><span class="text-amber-500/80">{hiddenCount} hidden by filters</span>{/if}
              </div>
              <DropdownMenu.Separator />
              <DropdownMenu.Label class="px-2 py-1 text-ui-2xs font-medium uppercase tracking-wide text-muted-foreground/60">Show</DropdownMenu.Label>
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
              ><Icon name="eye" class="text-muted-foreground" />Views</DropdownMenu.CheckboxItem>
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
              <DropdownMenu.Label class="px-2 py-1 text-ui-2xs font-medium uppercase tracking-wide text-muted-foreground/60">Sort by</DropdownMenu.Label>
              <DropdownMenu.RadioGroup value={sortBy} onValueChange={(v) => { if (v === 'name' || v === 'rowCount') sortBy = v }}>
                <DropdownMenu.RadioItem value="name"><Icon name="arrow-down-a-z" class="text-muted-foreground" />Name</DropdownMenu.RadioItem>
                <DropdownMenu.RadioItem value="rowCount"><Icon name="hash" class="text-muted-foreground" />Row count</DropdownMenu.RadioItem>
              </DropdownMenu.RadioGroup>
              <DropdownMenu.Separator />
              <DropdownMenu.Label class="px-2 py-1 text-ui-2xs font-medium uppercase tracking-wide text-muted-foreground/60">Direction</DropdownMenu.Label>
              <DropdownMenu.Item
                onSelect={() => (sortDir = sortDir === 'asc' ? 'desc' : 'asc')}
                class="gap-2"
              >
                {#if sortBy === 'name'}
                  {#if sortDir === 'asc'}
                    <Icon name="arrow-down-a-z" class="size-3.5 shrink-0 text-muted-foreground" />
                    A → Z
                  {:else}
                    <Icon name="arrow-up-a-z" class="size-3.5 shrink-0 text-muted-foreground" />
                    Z → A
                  {/if}
                {:else}
                  {#if sortDir === 'desc'}
                    <Icon name="arrow-down-0-1" class="size-3.5 shrink-0 text-muted-foreground" />
                    High → Low
                  {:else}
                    <Icon name="arrow-up-0-1" class="size-3.5 shrink-0 text-muted-foreground" />
                    Low → High
                  {/if}
                {/if}
                <span class="ml-auto text-muted-foreground/50 text-ui-2xs">click to flip</span>
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Label class="px-2 py-1 text-ui-2xs font-medium uppercase tracking-wide text-muted-foreground/60">Sections</DropdownMenu.Label>
              <DropdownMenu.Item onSelect={() => setAllSections(true)} closeOnSelect={false} class="gap-2">
                <Icon name="chevrons-up-down" class="size-3.5 shrink-0 text-muted-foreground" />
                Expand all
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => setAllSections(false)} closeOnSelect={false} class="gap-2">
                <Icon name="chevrons-down-up" class="size-3.5 shrink-0 text-muted-foreground" />
                Collapse all
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item onSelect={resetFilters} disabled={!filtersActive} class="gap-2">
                <Icon name="rotate-ccw" class="size-3.5 shrink-0 text-muted-foreground" />
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
                <DropdownMenu.Item onSelect={onnewtable} class="gap-2">
                  <Icon name="table-2" class="size-3.5 shrink-0 text-muted-foreground" />
                  {$t('sidebar.newTable')}
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={onnewschema} class="gap-2">
                  <Icon name="box" class="size-3.5 shrink-0 text-muted-foreground" />
                  {$t('sidebar.newSchema')}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          {:else}
            <button
              type="button"
              class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              title="New table"
              disabled={!connectionName}
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
            placeholder={connectionName ? "Filter tables…" : "Not connected"}
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
            aria-label="Filter tables"
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
            <!-- ── Recent ─────────────────────────────────────────── -->
            {#if showRecent && recentTabs.length > 0 && connectionName}
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
                  <span class="ml-1 font-mono text-ui-2xs text-muted-foreground/60">{Math.min(recentTabs.length, 5)}</span>
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
                  {#each recentTabs.slice(0, 5) as item (item.schema + '.' + item.table)}
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
                          <Icon name="eye" class="size-3 shrink-0 opacity-50" />
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
                <Icon name="pin" class="size-3 shrink-0 text-primary/60" />
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
                              <Icon name="pin" class="size-3 text-primary/50 group-hover:hidden" />
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
                      <ContextMenu.Content class="w-48 p-1 text-ui-xs [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
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
                          Open in SQL console
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
                              class="min-w-[4ch] shrink-0 text-right font-mono text-ui-xs leading-4 tabular-nums text-muted-foreground"
                              title={table.rowCount != null ? Number(table.rowCount).toLocaleString("en-US") : undefined}
                            >{formatTableRowCount(table.rowCount)}</span>
                            {/if}
                          </button>
                        </ContextMenu.Trigger>
                        <ContextMenu.Content class="w-48 p-1 text-ui-xs [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
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
                          <ContextMenu.Item onSelect={() => openDangerDialog('truncate', table.name)}>
                            <Icon name="eraser" />
                            Truncate table
                          </ContextMenu.Item>
                          <ContextMenu.Item variant="destructive" onSelect={() => openDangerDialog('drop', table.name)}>
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
                                "group grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 rounded-md px-2 py-1.5 text-left transition-colors",
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
                                  <Icon name="eye" class="size-3 opacity-50 group-hover:hidden" />
                                  <Icon name="square" class="size-3 hidden opacity-40 group-hover:block" />
                                {/if}
                              </span>
                              <span class="min-w-0 truncate font-mono text-ui-sm leading-4">{view.name}</span>
                            </button>
                          </ContextMenu.Trigger>
                          <ContextMenu.Content class="w-44 p-1 text-ui-xs [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
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
                            <ContextMenu.Item variant="destructive" onSelect={() => openDangerDialog('drop', view.name)}>
                              <Icon name="trash-2" />
                              Drop view
                            </ContextMenu.Item>
                          </ContextMenu.Content>
                        </ContextMenu.Root>
                      </li>
                    {/each}
                    {#if filteredViews.length > VIEW_RENDER_CAP}
                      <li class="px-3 py-2 text-center text-ui-2xs text-muted-foreground/60">
                        +{filteredViews.length - VIEW_RENDER_CAP} more — search to narrow
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
                <div class="flex size-10 items-center justify-center rounded-xl border border-border/50 bg-muted/30">
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
                          <ContextMenu.Content class="w-44 p-1 text-ui-xs [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
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
                            <ContextMenu.Item variant="destructive" onSelect={() => openDangerDialog('drop', mv.name)}>
                              <Icon name="trash-2" />
                              Drop view
                            </ContextMenu.Item>
                          </ContextMenu.Content>
                        </ContextMenu.Root>
                      </li>
                    {/each}
                    {#if filteredMatViews.length > VIEW_RENDER_CAP}
                      <li class="px-3 py-2 text-center text-ui-2xs text-muted-foreground/60">
                        +{filteredMatViews.length - VIEW_RENDER_CAP} more — search to narrow
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

  </aside>
  </ContextMenu.Trigger>
  <ContextMenu.Content class="w-52 p-1 text-ui-xs [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]_svg]:size-3.5">
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

