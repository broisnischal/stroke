<script>
  import { onMount, untrack } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { createHotkey } from "@tanstack/svelte-hotkeys";
  import Search from "@lucide/svelte/icons/search";
  import Pin from "@lucide/svelte/icons/pin";
  import PinOff from "@lucide/svelte/icons/pin-off";
  import Table2 from "@lucide/svelte/icons/table-2";
  import Eye from "@lucide/svelte/icons/eye";
  import Layers from "@lucide/svelte/icons/layers";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ListFilter from "@lucide/svelte/icons/list-filter";
  import Lock from "@lucide/svelte/icons/lock";
  import Square from "@lucide/svelte/icons/square";
  import SquareCheck from "@lucide/svelte/icons/square-check";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Eraser from "@lucide/svelte/icons/eraser";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Plus from "@lucide/svelte/icons/plus";
  import DangerousActionDialog from "./DangerousActionDialog.svelte";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import ResizeHandle from "./ResizeHandle.svelte";
  import { cn } from "$lib/utils.js";
  import { formatTableRowCount } from "$lib/table-list.js";
  import {
    clampNavSidebarWidth,
    loadLayout,
    saveLayout,
  } from "$lib/stores/layout.js";

  const initialLayout = loadLayout();
  let width = $state(initialLayout.navSidebarWidth);
  let resizeStartWidth = initialLayout.navSidebarWidth;

  // Detect Tauri at mount time (inside onMount) to handle any injection delay
  let isTauri = $state(false);
  let maximized = $state(false);
  let fullscreen = $state(false);

  onMount(() => {
    isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isTauri) return;

    const win = getCurrentWindow();
    Promise.all([win.isMaximized(), win.isFullscreen()])
      .then(([m, f]) => { maximized = m; fullscreen = f; })
      .catch(() => {});

    const unlistenP = win.listen("tauri://resize", async () => {
      [maximized, fullscreen] = await Promise.all([win.isMaximized(), win.isFullscreen()]);
    });

    return () => {
      unlistenP.then((fn) => fn()).catch(() => {});
    };
  });

  async function winClose() {
    if (!isTauri) return;
    try {
      await getCurrentWindow().close();
    } catch (e) {
      console.error("winClose:", e);
    }
  }

  async function winMinimize() {
    if (!isTauri) return;
    try {
      await getCurrentWindow().minimize();
    } catch (e) {
      console.error("winMinimize:", e);
    }
  }

  async function winToggleMaximize() {
    if (!isTauri) return;
    try {
      await getCurrentWindow().toggleMaximize();
    } catch (e) {
      console.error("winToggleMaximize:", e);
    }
  }

  async function winToggleFullscreen() {
    if (!isTauri) return;
    try {
      await getCurrentWindow().setFullscreen(!fullscreen);
    } catch (e) {
      console.error("winToggleFullscreen:", e);
    }
  }

  let {
    connectionName = "",
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
    /** @type {import('$lib/stores/query-history.js').QueryHistoryEntry[]} */
    queryHistory = [],
    onqueryselect = /** @type {(sql: string) => void} */ (() => {}),
    /** @type {import('$lib/stores/connections.js').SavedConnection | null} */
    connection = null,
    ontruncatetable = /** @type {(table: string) => void} */ (() => {}),
    ondroptable = /** @type {(table: string, cascade: boolean) => void} */ (() => {}),
  } = $props();

  let localFilter = $state(untrack(() => tableFilter));
  let filterDebounce = /** @type {ReturnType<typeof setTimeout> | null} */ (
    null
  );

  // Section open/collapsed state — persisted across sidebar toggles
  const SIDEBAR_EXPAND_KEY = 'db-studio:sidebar-sections'
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
  let tablesOpen = $state(_initial.tables ?? true);
  let viewsOpen = $state(_initial.views ?? false);
  let matViewsOpen = $state(_initial.matViews ?? false);
  $effect(() => { saveSidebarSection('tables', tablesOpen) })
  $effect(() => { saveSidebarSection('views', viewsOpen) })
  $effect(() => { saveSidebarSection('matViews', matViewsOpen) })

  // ── Pinned tables ─────────────────────────────────────────────────────────
  const PINNED_KEY = 'db-studio:pinned-tables'

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
  const DISPLAY_PREFS_KEY = 'db-studio:sidebar-display'
  function loadDisplayPrefs() {
    try {
      const raw = localStorage.getItem(DISPLAY_PREFS_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
    return { showTables: true, showViews: true, showMatViews: true, sortBy: 'name' }
  }
  function saveDisplayPrefs(prefs) {
    try { localStorage.setItem(DISPLAY_PREFS_KEY, JSON.stringify(prefs)) } catch {}
  }

  const _dp = loadDisplayPrefs()
  let showTables = $state(_dp.showTables ?? true)
  let showViews = $state(_dp.showViews ?? true)
  let showMatViews = $state(_dp.showMatViews ?? true)
  /** @type {'name' | 'rowCount'} */
  let sortBy = $state(_dp.sortBy ?? 'name')

  $effect(() => { saveDisplayPrefs({ showTables, showViews, showMatViews, sortBy }) })

  // ── Selection state ───────────────────────────────────────────────────────
  /** @type {Set<string>} */
  let selectedItems = $state(new Set())

  /** @param {string} name */
  function toggleSelect(name) {
    const next = new Set(selectedItems)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    selectedItems = next
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
  });

  /** @param {string} value */
  function handleFilterInput(value) {
    localFilter = value;
    if (filterDebounce) clearTimeout(filterDebounce);
    filterDebounce = setTimeout(() => {
      filterDebounce = null;
      ontablefilter(value);
    }, 200);
  }

  const lf = $derived(localFilter.toLowerCase());

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
    if (sortBy === 'rowCount') {
      return [...list].sort((a, b) => (b.rowCount ?? 0) - (a.rowCount ?? 0))
    }
    return list
  }

  const filteredRegularTables = $derived(
    applySortBy(regularTables.filter((t) => !pinnedTables.includes(t.name) && t.name.toLowerCase().includes(lf))),
  );
  const filteredViews = $derived(
    applySortBy(views.filter((t) => t.name.toLowerCase().includes(lf))),
  );
  const filteredMatViews = $derived(
    applySortBy(matViews.filter((t) => t.name.toLowerCase().includes(lf))),
  );
  /** Shared field chrome for schema select + table filter (aligned in sidebar grid) */
  const sidebarFieldClass =
    "h-7 w-full min-w-0 rounded-md border border-border bg-background/40 text-ui-sm text-foreground shadow-none transition-colors hover:bg-background/55 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30";
</script>

<div
  class="flex h-full shrink-0"
  style:width="{width}px"
  data-studio-region="sidebar"
>
  <aside
    class="studio-chrome flex h-full min-w-0 flex-1 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
    data-studio-chrome
  >
    {#if isTauri && !fullscreen}
      <!--
      Traffic light row: buttons sit outside the drag region so they always
      receive click events; the flex-1 filler to the right is the drag target.
    -->
      <div
        class="traffic-group flex h-9 shrink-0 items-center border-b border-sidebar-border"
      >
        <!-- buttons — NOT inside data-tauri-drag-region -->
        <div class="flex shrink-0 items-center gap-[7px] px-[14px]">
          <button
            type="button"
            class="traffic-dot traffic-close"
            onclick={winClose}
            aria-label="Close window"
            title="Close"
          >
            <svg
              class="traffic-icon"
              viewBox="0 0 8 8"
              width="7"
              height="7"
              fill="none"
            >
              <path
                d="M1.5 1.5l5 5M6.5 1.5l-5 5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            class="traffic-dot traffic-minimize"
            onclick={winMinimize}
            aria-label="Minimize window"
            title="Minimize"
          >
            <svg
              class="traffic-icon"
              viewBox="0 0 8 8"
              width="7"
              height="7"
              fill="none"
            >
              <path
                d="M1 4h6"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            class="traffic-dot traffic-maximize"
            onclick={winToggleFullscreen}
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={fullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {#if fullscreen}
              <!-- contract arrows -->
              <svg class="traffic-icon" viewBox="0 0 8 8" width="7" height="7" fill="none">
                <path d="M1.5 3.5h2v-2M6.5 4.5h-2v2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            {:else}
              <!-- expand arrows -->
              <svg class="traffic-icon" viewBox="0 0 8 8" width="7" height="7" fill="none">
                <path d="M1.5 3.5v-2h2M6.5 4.5v2h-2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            {/if}
          </button>
        </div>
        <!-- drag region fills the rest of the strip -->
        <div
          class="min-w-0 flex-1 self-stretch"
          data-tauri-drag-region
          role="none"
          ondblclick={winToggleMaximize}
        ></div>
      </div>
    {/if}
    <div class="flex min-h-0 flex-1 flex-col">

      <div
        class="flex shrink-0 flex-col gap-1.5 border-b border-sidebar-border px-2 py-2"
      >
        <div class="flex min-w-0 items-center gap-1">
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
              class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
              title="Display options"
            >
              <ListFilter class="size-3.5" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="start" class="w-48 p-1 text-ui-sm">
              <DropdownMenu.Label class="px-2 py-1 text-ui-2xs font-medium uppercase tracking-wide text-muted-foreground/60">Show</DropdownMenu.Label>
              <DropdownMenu.CheckboxItem
                checked={showTables}
                onCheckedChange={(v) => (showTables = v)}
              >Tables</DropdownMenu.CheckboxItem>
              <DropdownMenu.CheckboxItem
                checked={showViews}
                onCheckedChange={(v) => (showViews = v)}
              >Views</DropdownMenu.CheckboxItem>
              <DropdownMenu.CheckboxItem
                checked={showMatViews}
                onCheckedChange={(v) => (showMatViews = v)}
              >Materialized Views</DropdownMenu.CheckboxItem>
              <DropdownMenu.Separator />
              <DropdownMenu.Label class="px-2 py-1 text-ui-2xs font-medium uppercase tracking-wide text-muted-foreground/60">Sort by</DropdownMenu.Label>
              <DropdownMenu.RadioGroup value={sortBy} onValueChange={(v) => { if (v === 'name' || v === 'rowCount') sortBy = v }}>
                <DropdownMenu.RadioItem value="name">Name</DropdownMenu.RadioItem>
                <DropdownMenu.RadioItem value="rowCount">Row count</DropdownMenu.RadioItem>
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
          <button
            type="button"
            class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            title="Refresh tables (⌘R)"
            disabled={loadingTables}
            onclick={onrefresh}
          >
            <RefreshCw
              class={cn("size-3.5", loadingTables && "animate-spin")}
            />
          </button>
          <button
            type="button"
            class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            title="New table"
            disabled={!connectionName}
            onclick={onnewtable}
          >
            <Plus class="size-3.5" />
          </button>
        </div>

        <div class="relative min-w-0 w-full">
          <Search
            class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            placeholder="Filter tables…"
            value={localFilter}
            oninput={(e) => handleFilterInput(e.currentTarget.value)}
            class={cn(sidebarFieldClass, "w-full pl-8 pr-2.5 outline-none")}
            aria-label="Filter tables"
            data-sidebar-filter
          />
        </div>
      </div>

      <div class="flex min-h-0 flex-1 flex-col">
        <div class="app-scroll min-h-0 w-full flex-1 overflow-y-auto">
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
            <!-- ── Pinned ─────────────────────────────────────────── -->
            {#if visiblePinnedTables.length > 0 && connectionName}
              <div class="flex w-full items-center gap-1 px-2.5 pt-2 pb-1">
                <Pin class="size-3 shrink-0 text-primary/60" />
                <span class="text-ui-2xs font-medium tracking-wide text-muted-foreground uppercase">Pinned</span>
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
                  <li>
                    <ContextMenu.Root>
                      <ContextMenu.Trigger class="w-full">
                        <button
                          type="button"
                          class={cn(
                            "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-2 py-1.5 text-left transition-colors",
                            activeTable === tableName
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                          )}
                          onclick={() => ontableselect(tableName)}
                        >
                          <Pin class="size-3 shrink-0 text-primary/50" />
                          <span class="min-w-0 truncate font-mono text-ui-sm leading-none">{tableName}</span>
                          {#if idx < 5}
                            <span class="shrink-0 font-mono text-ui-2xs text-muted-foreground/40 tabular-nums">⌥⇧{idx + 1}</span>
                          {/if}
                        </button>
                      </ContextMenu.Trigger>
                      <ContextMenu.Content class="w-44 p-0.5 text-ui-xs [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
                        <ContextMenu.Item onSelect={() => togglePin(tableName)}>
                          <PinOff />
                          Unpin table
                        </ContextMenu.Item>
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
              <ChevronDown
                class={cn(
                  "size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150",
                  !tablesOpen && "-rotate-90",
                )}
              />
              <span
                class="text-ui-2xs font-medium tracking-wide text-muted-foreground uppercase"
                >Tables</span
              >
              {#if regularTables.length > 0}
                <span
                  class="ml-auto font-mono text-ui-2xs text-muted-foreground/60"
                  >{regularTables.length}</span
                >
              {/if}
            </button>
            {#if tablesOpen}
              <ul class="flex w-full min-w-full flex-col gap-0.5 px-1.5 pb-1">
                {#if regularTables.length === 0}
                  <li
                    class="flex w-full flex-col items-center gap-2 px-4 py-8 text-center"
                  >
                    <Table2 class="size-7 text-muted-foreground/25" />
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
                  {#each filteredRegularTables as table (table.name)}
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
                                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                            )}
                            onclick={() => ontableselect(table.name)}
                          >
                            <span
                              class="relative size-3 shrink-0"
                              onclick={(e) => { e.stopPropagation(); toggleSelect(table.name) }}
                              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleSelect(table.name); } }}
                              role="checkbox"
                              aria-checked={isSelected}
                              tabindex="-1"
                            >
                              {#if isSelected}
                                <SquareCheck class="size-3 text-primary" />
                              {:else}
                                <Table2 class="size-3 opacity-50 group-hover:hidden" />
                                <Square class="size-3 hidden opacity-40 group-hover:block" />
                              {/if}
                            </span>
                            <span class="flex min-w-0 items-center gap-1.5">
                              <span class="min-w-0 truncate font-mono text-ui-sm leading-none">{table.name}</span>
                              {#if table.rlsEnabled}
                                <Lock class="size-2.5 shrink-0 text-muted-foreground/50" title="Row-level security enabled" />
                              {/if}
                            </span>
                            <span
                              class="shrink-0 text-right font-mono text-ui-xs leading-none tabular-nums text-muted-foreground"
                              title={table.rowCount != null ? Number(table.rowCount).toLocaleString("en-US") : undefined}
                            >{formatTableRowCount(table.rowCount)}</span>
                          </button>
                        </ContextMenu.Trigger>
                        <ContextMenu.Content class="w-44 p-0.5 text-ui-xs [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
                          <ContextMenu.Item onSelect={() => togglePin(table.name)}>
                            {#if pinnedTables.includes(table.name)}
                              <PinOff />
                              Unpin table
                            {:else}
                              <Pin />
                              Pin table
                            {/if}
                          </ContextMenu.Item>
                          <ContextMenu.Item onSelect={() => toggleSelect(table.name)}>
                            {#if isSelected}
                              <Square />
                              Deselect
                            {:else}
                              <SquareCheck />
                              Select
                            {/if}
                          </ContextMenu.Item>
                          <ContextMenu.Separator />
                          <ContextMenu.Item onSelect={() => openDangerDialog('truncate', table.name)}>
                            <Eraser />
                            Truncate table
                          </ContextMenu.Item>
                          <ContextMenu.Item variant="destructive" onSelect={() => openDangerDialog('drop', table.name)}>
                            <Trash2 />
                            Drop table
                          </ContextMenu.Item>
                        </ContextMenu.Content>
                      </ContextMenu.Root>
                    </li>
                  {/each}
                {/if}
              </ul>
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
                <ChevronDown
                  class={cn(
                    "size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150",
                    !viewsOpen && "-rotate-90",
                  )}
                />
                <span
                  class="text-ui-2xs font-medium tracking-wide text-muted-foreground uppercase"
                  >Views</span
                >
                {#if views.length > 0}
                  <span
                    class="ml-auto font-mono text-ui-2xs text-muted-foreground/60"
                    >{views.length}</span
                  >
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
                    {#each filteredViews as view (view.name)}
                      {@const isSelected = selectedItems.has(view.name)}
                      <li>
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
                                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
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
                                  <SquareCheck class="size-3 text-primary" />
                                {:else}
                                  <Eye class="size-3 opacity-50 group-hover:hidden" />
                                  <Square class="size-3 hidden opacity-40 group-hover:block" />
                                {/if}
                              </span>
                              <span class="min-w-0 truncate font-mono text-ui-sm leading-none">{view.name}</span>
                            </button>
                          </ContextMenu.Trigger>
                          <ContextMenu.Content class="w-44 p-0.5 text-ui-xs [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
                            <ContextMenu.Item onSelect={() => toggleSelect(view.name)}>
                              {#if isSelected}
                                <Square />
                                Deselect
                              {:else}
                                <SquareCheck />
                                Select
                              {/if}
                            </ContextMenu.Item>
                            <ContextMenu.Separator />
                            <ContextMenu.Item variant="destructive" onSelect={() => openDangerDialog('drop', view.name)}>
                              <Trash2 />
                              Drop view
                            </ContextMenu.Item>
                          </ContextMenu.Content>
                        </ContextMenu.Root>
                      </li>
                    {/each}
                  {/if}
                </ul>
              {/if}
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
                <ChevronDown
                  class={cn(
                    "size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150",
                    !matViewsOpen && "-rotate-90",
                  )}
                />
                <span
                  class="text-ui-2xs font-medium tracking-wide text-muted-foreground uppercase"
                  >Materialized Views</span
                >
                {#if matViews.length > 0}
                  <span
                    class="ml-auto font-mono text-ui-2xs text-muted-foreground/60"
                    >{matViews.length}</span
                  >
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
                    {#each filteredMatViews as mv (mv.name)}
                      {@const isSelected = selectedItems.has(mv.name)}
                      <li>
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
                                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
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
                                  <SquareCheck class="size-3 text-primary" />
                                {:else}
                                  <Layers class="size-3 opacity-50 group-hover:hidden" />
                                  <Square class="size-3 hidden opacity-40 group-hover:block" />
                                {/if}
                              </span>
                              <span class="min-w-0 truncate font-mono text-ui-sm leading-none">{mv.name}</span>
                              <span class="shrink-0 text-right font-mono text-ui-xs leading-none tabular-nums text-muted-foreground">
                                {formatTableRowCount(mv.rowCount)}
                              </span>
                            </button>
                          </ContextMenu.Trigger>
                          <ContextMenu.Content class="w-44 p-0.5 text-ui-xs [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
                            <ContextMenu.Item onSelect={() => toggleSelect(mv.name)}>
                              {#if isSelected}
                                <Square />
                                Deselect
                              {:else}
                                <SquareCheck />
                                Select
                              {/if}
                            </ContextMenu.Item>
                            <ContextMenu.Separator />
                            <ContextMenu.Item variant="destructive" onSelect={() => openDangerDialog('drop', mv.name)}>
                              <Trash2 />
                              Drop view
                            </ContextMenu.Item>
                          </ContextMenu.Content>
                        </ContextMenu.Root>
                      </li>
                    {/each}
                  {/if}
                </ul>
              {/if}
            {/if}


          {/if}

        </div>
      </div>
    </div>

  </aside>
  <ResizeHandle
    edge="end"
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

<style>
  .traffic-dot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: none;
    cursor: default;
    flex-shrink: 0;
    transition: opacity 0.1s;
    -webkit-app-region: no-drag;
    app-region: no-drag;
  }
  .traffic-dot:active {
    opacity: 0.55;
  }

  /* Standard macOS traffic light colours */
  .traffic-close {
    background-color: #ff5f57;
    color: #7c0902;
  }
  .traffic-minimize {
    background-color: #ffbd2e;
    color: #7c4d00;
  }
  .traffic-maximize {
    background-color: #27c93f;
    color: #0a5c1d;
  }

  /* Icons hidden by default, revealed when any dot in the group is hovered */
  .traffic-icon {
    opacity: 0;
    transition: opacity 0.08s;
    pointer-events: none;
    flex-shrink: 0;
  }

  /* Hover on the button group shows all icons simultaneously */
  .traffic-group:hover .traffic-icon {
    opacity: 1;
  }

  /* Dim when window doesn't have focus / group not hovered */
  .traffic-group:not(:hover) .traffic-dot {
    opacity: 0.45;
  }
</style>
