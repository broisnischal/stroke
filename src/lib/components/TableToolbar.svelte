<script>
  import Icon from "./Icon.svelte";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import SearchableMenu from "./SearchableMenu.svelte";
  import DateFilterControl from "./DateFilterControl.svelte";
  import { getColumnEnumValues } from "$lib/cell-value.js";
  import { slotRoll } from "$lib/actions/slot-text.js";
  import { cn } from "$lib/utils.js";
  import {
    FILTER_OPS,
    BOOL_FILTER_OPS,
    DATE_FILTER_OPS,
    NUM_FILTER_OPS,
    MAX_PAGE_SIZE,
    PAGE_SIZE_OPTIONS,
    PAGE_SIZE_ALL,
    pageSizeLabel,
    activeFilters,
    createFilter,
    ANY_COLUMN,
  } from "$lib/table-query.js";
  import { untrack } from "svelte";
  import { formatCompactCount } from "$lib/table-list.js";
  import { describeTableView } from "$lib/stores/table-views.js";

  /** @typedef {import('$lib/table-query.js').TableSort} TableSort */
  /** @typedef {import('$lib/table-query.js').TableFilter} TableFilter */
  /** @typedef {import('$lib/table-query.js').FilterOp} FilterOp */

  let {
    queryMs = 0,
    page = 1,
    pageSize = 50,
    total = 0,
    loading = false,
    selectedCount = 0,
    hasPrimaryKey = false,
    deleting = false,
    columns = [],
    rowSearch = "",
    rowSort = null,
    rowFilters = [],
    onrefresh = () => {},
    onprev = () => {},
    onnext = () => {},
    offset = 0,
    onpagechange = () => {},
    onpagesizechange = () => {},
    /** @param {number} limit @param {number} offset */
    onlimitoffsetchange = (limit, offset) => {},
    onsearchchange = () => {},
    onsortchange = () => {},
    onfilterschange = () => {},
    ondeleteselected = () => {},
    /** @type {(format: 'csv' | 'json') => void | Promise<void>} */
    onexport = () => {},
    onaddrow = () => {},
    onopeninsql = () => {},
    /** @type {Set<string>} */
    hiddenColumns = new Set(),
    /** @type {(next: Set<string>) => void} */
    onhiddencolumnschange = () => {},
    /** Called when user picks a column from the "Jump to column" menu — the table
     *  scrolls it into view and briefly highlights it. */
    onfocuscolumn = /** @type {(name: string) => void} */ (() => {}),
    /** Virtual FK relationship columns (reverse FK badge cols) to show in the hide/show dropdown. */
    virtualRelColumns = /** @type {Array<{ label: string }>} */ ([]),
    /** User-defined virtual expression columns to show in the hide/show dropdown. */
    virtualExprCols = /** @type {Array<{id: string, name: string, enabled: boolean}>} */ ([]),
    /** Called when user toggles a virtual expression column in the dropdown. */
    ontogglevexpr = /** @type {(id: string) => void} */ (() => {}),
    filterBarOpen = $bindable(false),
    /** @type {'data' | 'structure'} */
    tableViewMode = $bindable("data"),
    /** How the data view renders the loaded page: canvas grid, JSON document,
     *  one-record-at-a-time form, or copyable text (CSV/TSV/Markdown). */
    /** @type {'table' | 'json' | 'record' | 'text' | 'chart'} */
    dataViewMode = $bindable("table"),
    ontogglestructure = () => {},
    /** Whether the structure view is available for the current object (false for views) */
    structureAllowed = true,
    /** Search string for column name filtering (structure mode only) */
    structureSearch = "",
    onstructuresearchchange = /** @type {(v: string) => void} */ (() => {}),
    /** When true, all write operations are disabled in the table */
    readonly = false,
    /** Infinite scroll mode — hides pagination, shows rows-loaded counter */
    infiniteScroll = false,
    oninfinitescrolltoggle = () => {},
    /** Live mode on — animates the row-count total as it changes. */
    live = false,
    /** Number of active virtual expression columns for this table (badge). */
    virtualColCount = 0,
    /** Called when user clicks the virtual columns button. */
    onopenvirtualcols = () => {},
    // ── Saved views (workflow extension) ────────────────────────────────────
    /** @type {import('$lib/stores/table-views.js').SavedTableView[]} */
    savedViews = [],
    viewsEnabled = false,
    /** @type {string | null} id of the currently applied view */
    activeViewId = null,
    onapplyview = /** @type {(view: import('$lib/stores/table-views.js').SavedTableView) => void} */ (() => {}),
    /** Clear the applied view — back to the unfiltered default. */
    onresetview = () => {},
    onsaveview = /** @type {(name: string) => void} */ (() => {}),
    ondeleteview = /** @type {(id: string) => void} */ (() => {}),
    // ── Find & replace (workflow extension) ─────────────────────────────────
    findReplaceEnabled = false,
    onfindreplace = () => {},
    // ── Search options (match case / whole word / regex) ────────────────────
    /** @type {import('$lib/search-options.js').SearchOptions} */
    searchOptions = { matchCase: false, wholeWord: false, regex: false },
    onsearchoptionschange = /** @type {(opts: import('$lib/search-options.js').SearchOptions) => void} */ (() => {}),
    /** Engine supports the option toggles (Postgres regex path). */
    searchOptionsSupported = false,
  } = $props();

  const SEARCH_OPTS = /** @type {const} */ ([
    { key: "matchCase", label: "Aa", title: "Match case", underline: false },
    { key: "wholeWord", label: "ab", title: "Match whole word", underline: true },
    { key: "regex", label: ".*", title: "Use regular expression", underline: false },
  ]);

  let searchFocused = $state(false);
  const searchOptsActive = $derived(
    !!(searchOptions.matchCase || searchOptions.wholeWord || searchOptions.regex),
  );
  // The toggles only materialize while you're working with the search (focus,
  // text present, or an option already on) so the idle toolbar stays compact.
  const showSearchOpts = $derived(
    searchOptionsSupported &&
      tableViewMode !== "structure" &&
      (searchFocused || searchOptsActive || !!rowSearch),
  );

  let viewsMenuOpen = $state(false);
  let viewNameDraft = $state("");

  /** Anything worth resetting: search, filters, sort, hidden columns or a non-table view mode. */
  const canResetView = $derived(
    !!(rowSearch.trim() || rowFilters.length || rowSort || hiddenColumns.size || dataViewMode !== "table"),
  );

  function commitSaveView() {
    const name = viewNameDraft.trim();
    if (!name) return;
    onsaveview(name);
    viewNameDraft = "";
    viewsMenuOpen = false;
  }

  /** @type {HTMLInputElement | null} */
  let structureSearchEl = $state(null);

  // Ctrl/Cmd+F focuses the column search input when in structure mode
  $effect(() => {
    if (tableViewMode !== "structure") return;
    /** @param {KeyboardEvent} e */
    function handler(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        structureSearchEl?.focus();
        structureSearchEl?.select();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  });

  const deleteLabel = $derived(
    selectedCount === 1
      ? "Delete 1 row"
      : `Delete ${formatCompactCount(selectedCount)} rows`,
  );

  const _effectivePageSize = $derived(
    pageSize === PAGE_SIZE_ALL ? (total > 0 ? total : 1) : pageSize,
  );

  // total = -1 means the count is still being fetched in the background (the
  // row data has already loaded). Show "…" for the unknown total and keep Next
  // enabled so navigation isn't blocked during the brief counting window.
  const counting = $derived(total < 0);
  const from = $derived(total === 0 ? 0 : offset + 1);
  const to = $derived(counting ? offset + _effectivePageSize : Math.min(offset + _effectivePageSize, total));
  const pageCount = $derived(Math.max(1, Math.ceil(total / _effectivePageSize) || 1));
  const canPrev = $derived(page > 1);
  const canNext = $derived(counting || page * _effectivePageSize < total);

  const filterCount = $derived(activeFilters(rowFilters).length);
  const sortLabel = $derived(
    rowSort?.column
      ? `${rowSort.column} ${rowSort.direction === "desc" ? "↓" : "↑"}`
      : "Sort",
  );

  let sortMenuOpen = $state(false);
  let columnsMenuOpen = $state(false);
  let focusMenuOpen = $state(false);
  let limitOffsetOpen = $state(false);
  let moreMenuOpen = $state(false);
  let deleteConfirmPending = $state(false);
  /** @type {ReturnType<typeof setTimeout> | null} */
  let _deleteConfirmTimer = null;
  let draftLimit = $state(untrack(() => pageSize));
  let draftOffset = $state(0);
  let limitError = $state("");

  const hiddenCount = $derived(hiddenColumns.size);

  /** @param {string} name */
  function toggleColumn(name) {
    const next = new Set(hiddenColumns);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onhiddencolumnschange(next);
  }

  function showAllColumns() {
    onhiddencolumnschange(new Set());
  }
  /** @type {HTMLInputElement | null} */
  let searchInputRef = $state(null);

  // Local value so the input is not controlled by the prop during typing.
  // Keeps focus when the parent triggers a re-render (e.g. loading state).
  let localSearch = $state(untrack(() => rowSearch));
  let searchDebounce = /** @type {ReturnType<typeof setTimeout> | null} */ (
    null
  );

  // Sync from parent only when the prop changes from outside (e.g. table switch resets to '').
  $effect(() => {
    localSearch = rowSearch;
  });

  export function focusRowSearch() {
    searchInputRef?.focus();
    searchInputRef?.select();
  }

  /** Open the Sort menu (hotkey from the parent). */
  export function openSortMenu() {
    if (columns.length) sortMenuOpen = true;
  }
  /** Open the Columns hide/show menu (hotkey from the parent). */
  export function openColumnsMenu() {
    if (columns.length) columnsMenuOpen = true;
  }
  /** Open the filter bar, seeding an empty filter row (hotkey from the parent). */
  export function openFilterMenu() {
    if (!columns.length) return;
    if (!filterBarOpen) {
      filterBarOpen = true;
      if (rowFilters.length === 0) addFilter();
    }
  }

  /** Clear the row search and focus the input (Ctrl+T shortcut). */
  export function clearRowSearch() {
    clearSearch()
    searchInputRef?.focus()
  }

  /** Focus the value input of the last filter row (called after "Filter by this column"). */
  export function focusLastFilter() {
    // Defer so the filter bar DOM has rendered
    setTimeout(() => {
      const inputs = document.querySelectorAll(
        '.studio-filter-bar input[data-filter-value], .studio-filter-bar input:not([type="date"])',
      );
      const last = /** @type {HTMLInputElement|null} */ (
        inputs[inputs.length - 1]
      );
      last?.focus();
    }, 30);
  }

  /** Page numbers shown in the page dropdown (windowed when many pages). */
  const pageMenuItems = $derived.by(() => {
    const n = pageCount;
    if (n <= 40) return Array.from({ length: n }, (_, i) => i + 1);
    const lo = Math.max(1, page - 15);
    const hi = Math.min(n, page + 15);
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  });

  const iconBtn =
    "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

  /** @type {Array<{ id: 'table' | 'json' | 'record' | 'text' | 'chart', icon: string, label: string, title?: string }>} */
  const DATA_VIEW_MODES = [
    { id: "table", icon: "table-2", label: "Table view" },
    { id: "json", icon: "braces", label: "JSON view" },
    { id: "record", icon: "layout-list", label: "Record view" },
    { id: "text", icon: "file-text", label: "Text view", title: "Text view — CSV / TSV / Markdown / JSON Lines" },
    { id: "chart", icon: "bar-chart-2", label: "Chart view", title: "Chart view — visualize the loaded rows" },
  ];

  // ── Searchable-menu item lists ──────────────────────────────────────────
  // Sort: two rows per column (ascending / descending), searchable by name.
  const sortItems = $derived(
    columns.flatMap((c) => [
      { value: `${c.name} ascending`, label: c.name, col: c.name, dir: "asc", keywords: [c.name], active: rowSort?.column === c.name && rowSort?.direction === "asc" },
      { value: `${c.name} descending`, label: c.name, col: c.name, dir: "desc", keywords: [c.name], active: rowSort?.column === c.name && rowSort?.direction === "desc" },
    ]),
  );

  // Columns hide/show: real columns + virtual relationship columns + virtual expr columns.
  const columnItems = $derived([
    ...columns.map((c) => ({ value: c.name, label: c.name, kind: "col", hidden: hiddenColumns.has(c.name) })),
    ...virtualRelColumns.map((vc) => ({ value: `__vrel:${vc.label}`, label: vc.label, kind: "vrel", hidden: hiddenColumns.has(`__vrel:${vc.label}`) })),
    ...virtualExprCols.map((vc) => ({ value: `__vexpr:${vc.id}`, label: `ƒ ${vc.name}`, kind: "vexpr", hidden: !vc.enabled })),
  ]);

  // Jump-to-column: only currently-visible real columns (hidden columns aren't
  // rendered on the canvas, so there's nothing to scroll to).
  const focusColumnItems = $derived(
    columns
      .filter((c) => !hiddenColumns.has(c.name))
      .map((c) => ({ value: c.name, label: c.name })),
  );

  function toggleColumnItem(/** @type {any} */ it) {
    if (it.kind === "vexpr") {
      ontogglevexpr(it.value.slice(8));
      return;
    }
    if (it.kind === "vrel") {
      const next = new Set(hiddenColumns);
      if (next.has(it.value)) next.delete(it.value); else next.add(it.value);
      onhiddencolumnschange(next);
    } else {
      toggleColumn(it.value);
    }
  }

  function toggleAllColumns() {
    if (hiddenCount > 0) {
      showAllColumns();
    } else {
      onhiddencolumnschange(
        new Set([
          ...columns.map((c) => c.name),
          ...virtualRelColumns.map((vc) => `__vrel:${vc.label}`),
        ]),
      );
    }
  }

  /** Filter-row column options: "Any column" + every column. */
  const filterColumnItems = $derived([
    { value: ANY_COLUMN, label: "Any column", keywords: ["any", "all"] },
    ...columns.map((c) => ({ value: c.name, label: c.name })),
  ]);

  /** @param {{ id: string, column: string, op: string }} filter @param {string} v */
  function pickFilterColumn(filter, v) {
    if (!v) return;
    const newOps = opsForCol(v);
    const newOp = newOps.some((o) => o.value === filter.op) ? filter.op : defaultOpForCol(v);
    patchFilter(filter.id, { column: v, op: /** @type {FilterOp} */ (newOp), value: "" });
  }

  /** Matches the "more actions" / delete menu panel */
  const menuContent = "w-44 text-ui-sm";

  /** Compact shadcn select trigger for pagination */
  const pageSelectTrigger =
    "h-7 min-w-0 gap-1 px-2 text-ui-sm font-normal tabular-nums shadow-none";

  /** @typedef {'text' | 'boolean' | 'date' | 'number'} ColKind */

  /** @param {string} colName @returns {ColKind} */
  function getColKind(colName) {
    if (colName === ANY_COLUMN) return "text";
    const col = columns.find((c) => c.name === colName);
    const dt = (col?.dataType ?? col?.data_type ?? "")
      .toLowerCase()
      .replace(/\(.+\)$/, "")
      .trim();
    if (dt === "boolean" || dt === "bool") return "boolean";
    if (/^(date|timestamp|timestamptz|timetz|time)/.test(dt)) return "date";
    if (
      /^(int|integer|bigint|smallint|numeric|decimal|real|double|float|serial|money)/.test(
        dt,
      )
    )
      return "number";
    return "text";
  }

  const ANY_COLUMN_OPS = FILTER_OPS.filter((o) =>
    ["contains", "starts_with", "ends_with", "eq"].includes(o.value),
  );

  // Enum columns are a fixed set of values — free-text ops (contains/starts…)
  // don't make sense; offer equality + null checks and drive the value with a
  // dropdown of the actual enum members.
  const ENUM_FILTER_OPS = FILTER_OPS.filter((o) =>
    ["eq", "neq", "is_null", "is_not_null"].includes(o.value),
  );

  /** Enum members for a column, or null when it isn't an enum. @param {string} colName */
  function enumOptionsFor(colName) {
    if (colName === ANY_COLUMN) return null;
    const col = columns.find((c) => c.name === colName);
    return col ? getColumnEnumValues(col) : null;
  }

  /** @param {string} colName */
  function opsForCol(colName) {
    if (colName === ANY_COLUMN) return ANY_COLUMN_OPS;
    if (enumOptionsFor(colName)) return ENUM_FILTER_OPS;
    const kind = getColKind(colName);
    if (kind === "boolean") return BOOL_FILTER_OPS;
    if (kind === "date") return DATE_FILTER_OPS;
    if (kind === "number") return NUM_FILTER_OPS;
    return FILTER_OPS;
  }

  /** Default op when a column is first chosen */
  /** @param {string} colName @returns {import('$lib/table-query.js').FilterOp} */
  function defaultOpForCol(colName) {
    if (colName === ANY_COLUMN) return "contains";
    if (enumOptionsFor(colName)) return "eq";
    const kind = getColKind(colName);
    if (kind === "boolean") return "eq";
    if (kind === "date") return "gte";
    if (kind === "number") return "eq";
    return "contains";
  }

  /** @param {FilterOp} op */
  function filterOpLabel(op) {
    return FILTER_OPS.find((o) => o.value === op)?.label ?? op;
  }

  /** @param {string} id */
  function filterNeedsValue(id) {
    const f = rowFilters.find((x) => x.id === id);
    if (!f) return true;
    return FILTER_OPS.find((o) => o.value === f.op)?.needsValue ?? true;
  }

  // ── between helpers (value stored as "from,to") ──────────────────────────
  /** @param {string} val */
  function betweenFrom(val) {
    return val.split(",")[0] ?? "";
  }
  /** @param {string} val */
  function betweenTo(val) {
    return val.split(",")[1] ?? "";
  }
  /** @param {string} from @param {string} to */
  function betweenJoin(from, to) {
    return `${from},${to}`;
  }

  /** @param {string} value */
  function handleSearchInput(value) {
    localSearch = value;
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchDebounce = null;
      onsearchchange(value);
    }, 250);
  }

  function clearSearch() {
    localSearch = "";
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = null;
    onsearchchange("");
  }

  function addFilter() {
    const col = columns[0]?.name ?? "";
    const op = col ? defaultOpForCol(col) : "contains";
    onfilterschange([...rowFilters, createFilter(col, op)]);
  }

  /** @param {string} id */
  function removeFilter(id) {
    onfilterschange(rowFilters.filter((f) => f.id !== id));
  }

  function clearFilters() {
    onfilterschange([]);
    filterBarOpen = false;
  }

  /** @param {TableFilter[]} next */
  function updateFilters(next) {
    onfilterschange(next);
  }

  /** @param {string} id @param {Partial<TableFilter>} patch */
  function patchFilter(id, patch) {
    updateFilters(
      rowFilters.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    );
  }

  function clearSort() {
    onsortchange(null);
  }

  /** @param {string} column @param {'asc' | 'desc'} direction */
  function applySort(column, direction) {
    onsortchange(/** @type {TableSort} */ ({ column, direction }));
    sortMenuOpen = false;
  }

  /** Strips non-digit characters — for whole-number-only inputs (limit, offset). */
  function sanitizeDigits(val) {
    return val.replace(/\D/g, '')
  }

  /** Keeps digits, one optional leading minus, and one optional decimal point. */
  function sanitizeNumericStr(val) {
    let s = val.replace(/[^\d.-]/g, '')
    s = s.replace(/(?!^)-/g, '')
    const dot = s.indexOf('.')
    if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '')
    return s
  }
</script>

<div class="flex shrink-0 flex-col">
  <header
    class="@container/tb studio-chrome studio-table-toolbar flex h-9 shrink-0 items-center gap-1 border-b border-border bg-panel px-2"
    data-studio-chrome
  >
    <!-- Search — far left, expands on focus (wider when option toggles show) -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class={cn(
        "relative flex h-7 shrink-0 items-center transition-[width] duration-200",
        showSearchOpts ? "w-64" : "w-32 focus-within:w-44",
      )}
      role="search"
      onfocusin={() => (searchFocused = true)}
      onfocusout={(e) => {
        const next = e.relatedTarget instanceof Node ? e.relatedTarget : null;
        if (!e.currentTarget.contains(next)) searchFocused = false;
      }}
    >
      <Icon name="search" class="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
      {#if tableViewMode === "structure"}
        <input
          bind:this={structureSearchEl}
          type="text"
          aria-label="Search column"
          class="h-7 w-full min-w-0 rounded-md border border-input bg-input/30 pl-7 pr-7 font-mono text-ui-sm focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
          placeholder="Search column…"
          value={structureSearch}
          oninput={(e) =>
            onstructuresearchchange(
              /** @type {HTMLInputElement} */ (e.currentTarget).value,
            )}
        />
      {:else}
        <Input
          bind:ref={searchInputRef}
          type="text"
          role="searchbox"
          aria-label="Search all columns"
          class={cn(
            "h-7 w-full min-w-0 border-transparent bg-accent/40 pl-7 text-ui-sm shadow-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring focus-visible:bg-input/30",
            showSearchOpts ? "pr-24" : "pr-7",
            localSearch.trim() && "border-ring/40 bg-input/30",
          )}
          placeholder="Search…"
          value={localSearch}
          disabled={columns.length === 0}
          oninput={(e) => handleSearchInput(e.currentTarget.value)}
        />
      {/if}
      {#if showSearchOpts}
        <!-- VS Code-style option toggles; mousedown is swallowed so clicking
             them never blurs the input (which would hide this cluster). -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="absolute inset-y-0 right-7 flex items-center gap-0.5"
          onmousedown={(e) => e.preventDefault()}
        >
          {#each SEARCH_OPTS as opt (opt.key)}
            <button
              type="button"
              title={opt.title}
              aria-pressed={searchOptions[opt.key]}
              class={cn(
                "flex size-5 items-center justify-center rounded font-mono text-[11px] font-medium leading-none transition-colors",
                searchOptions[opt.key]
                  ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/30"
                  : "text-muted-foreground/50 hover:bg-muted hover:text-foreground",
              )}
              onclick={() => onsearchoptionschange({ ...searchOptions, [opt.key]: !searchOptions[opt.key] })}
            >
              <span class={opt.underline ? "underline decoration-1 underline-offset-2" : ""}>{opt.label}</span>
            </button>
          {/each}
        </div>
      {/if}
      <button
        type="button"
        class={cn(
          "absolute right-1 inline-flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
          localSearch ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-label="Clear search"
        tabindex={localSearch ? 0 : -1}
        onclick={clearSearch}
      >
        <Icon name="x" class="size-3" />
      </button>
    </div>

    {#if tableViewMode !== "structure"}
      <!-- Action button group: views / filter / sort / columns / jump / virtual -->
      <div class="flex items-center gap-0.5">

      <!-- Saved views -->
      {#if viewsEnabled}
        <DropdownMenu.Root bind:open={viewsMenuOpen}>
          <DropdownMenu.Trigger
            class={cn(
              iconBtn,
              "shrink-0",
              savedViews.length > 0 ? "gap-1 !w-auto px-2" : "",
              (savedViews.length > 0 || viewsMenuOpen) && "bg-accent text-foreground",
              activeViewId && "text-primary",
            )}
            title={activeViewId ? "Saved views — one applied" : "Saved views"}
            disabled={loading || columns.length === 0}
          >
            <Icon name="bookmark" class="size-3.5" />
            {#if savedViews.length > 0}
              <span class="tabular-nums text-[11px] font-medium text-primary" aria-hidden="true">{savedViews.length}</span>
            {/if}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" class="w-64 p-0 text-ui-sm">
            <div class="flex items-center border-b border-border/50 px-3 py-1.5">
              <span class="text-ui-2xs font-medium uppercase tracking-[0.08em] text-muted-foreground/55">Saved views</span>
              <button
                type="button"
                class="ml-auto rounded px-1.5 py-0.5 text-ui-2xs text-muted-foreground/60 transition-[background-color,color] hover:bg-accent hover:text-foreground"
                title="Back to the unfiltered default"
                onclick={() => { onresetview(); viewsMenuOpen = false; }}
              >
                Reset
              </button>
            </div>
            {#if savedViews.length === 0}
              <p class="px-3 py-3 text-center text-ui-xs leading-relaxed text-muted-foreground/50">
                Set up filters, sort or hidden columns, then save the combination as a view.
              </p>
            {:else}
              <div class="app-scroll max-h-64 overflow-y-auto p-1">
                {#each savedViews as v (v.id)}
                  {@const active = v.id === activeViewId}
                  <div
                    class={cn(
                      'group/view flex items-center rounded-md transition-colors',
                      active ? 'bg-accent/70' : 'hover:bg-accent/50',
                    )}
                  >
                    <button
                      type="button"
                      class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                      title={active ? 'Applied — click to reset to default' : 'Apply view'}
                      onclick={() => { active ? onresetview() : onapplyview(v); viewsMenuOpen = false; }}
                    >
                      <Icon name="bookmark" class={cn('size-3.5 shrink-0', active ? 'text-primary' : 'text-muted-foreground/50')} />
                      <span class="flex min-w-0 flex-1 flex-col">
                        <span class={cn('truncate text-ui-xs', active ? 'font-medium text-foreground' : 'text-foreground/85')}>{v.name}</span>
                        {#if describeTableView(v)}
                          <span class="truncate text-[10px] leading-tight text-muted-foreground/45">{describeTableView(v)}</span>
                        {/if}
                      </span>
                      {#if active}
                        <Icon name="check" class="size-3.5 shrink-0 text-primary" />
                      {/if}
                    </button>
                    <button
                      type="button"
                      class="mr-1 inline-flex size-5 shrink-0 items-center justify-center rounded text-transparent transition-colors hover:!text-destructive group-hover/view:text-muted-foreground/50"
                      title="Delete view"
                      onclick={() => ondeleteview(v.id)}
                    >
                      <Icon name="trash-2" class="size-3" />
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
            <div class="flex items-center gap-1.5 border-t border-border/50 p-1.5">
              <input
                type="text"
                placeholder="Save current as…"
                bind:value={viewNameDraft}
                class="h-7 w-full min-w-0 flex-1 rounded-md border border-transparent bg-input/30 px-2 text-ui-xs text-foreground transition-colors placeholder:text-muted-foreground/35 hover:border-border/60 focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
                onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitSaveView(); } }}
              />
              <button
                type="button"
                class="inline-flex h-7 shrink-0 items-center rounded-md bg-primary px-2.5 text-ui-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
                disabled={!viewNameDraft.trim()}
                onclick={commitSaveView}
              >
                Save
              </button>
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/if}

      <!-- Filter -->
      <button
        type="button"
        class={cn(
          iconBtn,
          "shrink-0",
          filterCount > 0 ? "gap-1 !w-auto px-2" : "",
          (filterCount > 0 || filterBarOpen) && "bg-accent text-foreground",
        )}
        title="Filter rows"
        disabled={loading || columns.length === 0}
        onclick={() => {
          if (!filterBarOpen) {
            filterBarOpen = true;
            if (rowFilters.length === 0) addFilter();
          } else {
            filterBarOpen = false;
          }
        }}
      >
        <Icon name="list-filter" class="size-3.5" />
        {#if filterCount > 0}
          <span class="tabular-nums text-[11px] font-medium text-primary" aria-hidden="true">{formatCompactCount(filterCount)}</span>
        {/if}
      </button>

      <!-- Sort -->
      <SearchableMenu
        bind:open={sortMenuOpen}
        items={sortItems}
        placeholder="Sort by column…"
        contentClass="w-60"
        onselect={(it) => applySort(it.col, it.dir)}
      >
        {#snippet trigger(props)}
          <button
            {...props}
            class={cn(iconBtn, "shrink-0 @max-[420px]/tb:hidden", (rowSort?.column || sortMenuOpen) && "bg-accent text-foreground")}
            title={sortLabel}
            disabled={loading || columns.length === 0}
          >
            <Icon name="arrow-up-down" class="size-3.5" />
          </button>
        {/snippet}
        {#snippet header()}
          {#if rowSort?.column}
            <button
              type="button"
              class="flex w-full items-center gap-1.5 border-b border-border/40 px-3 py-1.5 text-left text-ui-xs text-muted-foreground transition-colors hover:text-foreground"
              onclick={() => { clearSort(); sortMenuOpen = false; }}
            >
              <Icon name="x" class="size-3.5" /> Clear sort
            </button>
          {/if}
        {/snippet}
        {#snippet item(it)}
          {#if it.dir === "asc"}<Icon name="arrow-up" class="size-3.5 text-muted-foreground" />{:else}<Icon name="arrow-down" class="size-3.5 text-muted-foreground" />{/if}
          <span class="min-w-0 flex-1 truncate">{it.label}</span>
          <span class="shrink-0 text-ui-3xs text-muted-foreground/60">{it.dir === "asc" ? "Asc" : "Desc"}</span>
          {#if it.active}<span class="shrink-0 text-primary">✓</span>{/if}
        {/snippet}
      </SearchableMenu>

      <!-- Columns -->
      <SearchableMenu
        bind:open={columnsMenuOpen}
        items={columnItems}
        placeholder="Search columns…"
        contentClass="w-56"
        closeOnSelect={false}
        onselect={toggleColumnItem}
      >
        {#snippet trigger(props)}
          <button
            {...props}
            class={cn(iconBtn, "shrink-0 @max-[460px]/tb:hidden", hiddenCount > 0 ? "gap-1 w-auto px-2" : "", (hiddenCount > 0 || columnsMenuOpen) && "bg-accent text-foreground")}
            title="Show / hide columns"
            aria-label="Show or hide columns"
            disabled={loading || columns.length === 0}
          >
            <Icon name={hiddenCount > 0 ? "eye-off" : "eye"} class="size-3.5" />
            {#if hiddenCount > 0}
              <span class="tabular-nums text-[11px] font-medium text-primary" aria-hidden="true">{hiddenCount}</span>
            {/if}
          </button>
        {/snippet}
        {#snippet header()}
          <div class="flex items-center justify-between border-b border-border/40 px-3 py-1.5">
            <span class="text-ui-2xs font-medium uppercase tracking-wide text-muted-foreground">Columns</span>
            <button
              type="button"
              class="text-ui-2xs text-muted-foreground transition-colors hover:text-foreground"
              onclick={toggleAllColumns}
            >
              {hiddenCount > 0 ? "Show all" : "Hide all"}
            </button>
          </div>
        {/snippet}
        {#snippet item(it)}
          {#if it.hidden}
            <Icon name="eye-off" class="size-3.5 text-muted-foreground" />
          {:else if it.kind === "vrel"}
            <Icon name="link-2" class="size-3.5 text-primary/60" />
          {:else if it.kind === "vexpr"}
            <Icon name="eye" class="size-3.5 text-primary/60" />
          {:else}
            <Icon name="eye" class="size-3.5" />
          {/if}
          <span class={cn("min-w-0 flex-1 truncate", it.hidden && "text-muted-foreground")}>{it.label}</span>
          {#if it.kind === "vrel"}<span class="shrink-0 text-ui-3xs text-muted-foreground/40">rel</span>{/if}
          {#if it.kind === "vexpr"}<span class="shrink-0 text-ui-3xs text-primary/40">expr</span>{/if}
        {/snippet}
      </SearchableMenu>

      <!-- Jump to column -->
      <SearchableMenu
        bind:open={focusMenuOpen}
        items={focusColumnItems}
        placeholder="Jump to column…"
        contentClass="w-56"
        onselect={(it) => onfocuscolumn(it.value)}
      >
        {#snippet trigger(props)}
          <button
            {...props}
            class={cn(iconBtn, "shrink-0 @max-[500px]/tb:hidden", focusMenuOpen && "bg-accent text-foreground")}
            title="Jump to column"
            disabled={loading || columns.length === 0}
          >
            <Icon name="crosshair" class="size-3.5" />
          </button>
        {/snippet}
        {#snippet header()}
          <div class="border-b border-border/40 px-3 py-1.5">
            <span class="text-ui-2xs font-medium uppercase tracking-wide text-muted-foreground">Jump to column</span>
          </div>
        {/snippet}
        {#snippet item(it)}
          <Icon name="crosshair" class="size-3.5 text-muted-foreground" />
          <span class="min-w-0 flex-1 truncate">{it.label}</span>
        {/snippet}
      </SearchableMenu>

      <!-- Virtual columns button -->
      <button
        type="button"
        class={cn(
          "inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-ui-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30 @max-[560px]/tb:hidden",
          virtualColCount > 0 && "bg-accent/50 text-foreground"
        )}
        title="Virtual columns"
        disabled={loading || columns.length === 0}
        onclick={onopenvirtualcols}
      >
        <Icon name="function-square" class="size-3.5 shrink-0" />
        {#if virtualColCount > 0}
          <span class="tabular-nums text-[11px] font-medium text-primary">{virtualColCount}</span>
        {/if}
      </button>

      <!-- Open in SQL editor — opens a new query tab pre-filled with the current view's SELECT -->
      <button
        type="button"
        class="inline-flex h-7 shrink-0 items-center justify-center rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30 @max-[520px]/tb:hidden"
        title="Open in SQL editor — new query with current filters & sort"
        disabled={loading || columns.length === 0}
        onclick={onopeninsql}
      >
        <Icon name="terminal" class="size-3.5 shrink-0" />
      </button>

      <!-- Reset everything — only appears when something is non-default -->
      {#if canResetView}
        <button
          type="button"
          class={cn(iconBtn, "shrink-0")}
          title="Reset view — clear search, filters, sort, hidden columns and view mode"
          disabled={loading}
          onclick={onresetview}
        >
          <Icon name="rotate-ccw" class="size-3.5" />
        </button>
      {/if}

      </div><!-- /action group -->

      <span class="mx-0.5 h-4 w-px shrink-0 bg-border/60"></span>

      <!-- Add row -->
      <button
        type="button"
        class="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border/60 px-2 text-ui-sm text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        disabled={loading || columns.length === 0 || readonly}
        title={readonly ? "Read-only mode" : "Insert row (Add)"}
        onclick={onaddrow}
      >
        <Icon name="plus" class="size-3.5 shrink-0" />
        <span class="@max-[440px]/tb:hidden">Add</span>
      </button>
    {/if}

    <!-- Spacer -->
    <div class="flex-1"></div>

    {#if tableViewMode !== "structure"}
      {#if infiniteScroll}
        {#if total > 0 || counting}
          <span
            class="flex shrink-0 items-center gap-1 font-mono text-ui-xs tabular-nums @max-[600px]/tb:hidden"
            title="{to.toLocaleString('en-US')} of {counting ? 'counting…' : total.toLocaleString('en-US') + ' rows'} loaded{queryMs > 0 ? ` · ${queryMs}ms` : ''}"
          >
            <span class="text-foreground/65">{to.toLocaleString("en-US")}</span>
            <span class="text-muted-foreground/40">of {counting ? "…" : total.toLocaleString("en-US")} loaded</span>
          </span>
        {/if}
      {:else}
        {#if total > 0 || counting}
          <span
            class="flex shrink-0 items-center gap-1 font-mono text-ui-xs tabular-nums @max-[600px]/tb:hidden"
            title="{from.toLocaleString('en-US')}–{to.toLocaleString('en-US')} of {counting ? 'counting…' : total.toLocaleString('en-US') + ' rows'}{queryMs > 0 ? ` · ${queryMs}ms` : ''}"
          >
            <span class="text-foreground/65">{from.toLocaleString("en-US")}–{to.toLocaleString("en-US")}</span>
            {#if live && !counting}
              <span class="text-muted-foreground/40">of <span class="inline-block tabular-nums" use:slotRoll={total.toLocaleString("en-US")}></span></span>
            {:else}
              <span class="text-muted-foreground/40">of {counting ? "…" : total.toLocaleString("en-US")}</span>
            {/if}
          </span>
        {/if}

        <!-- divider before the pagination cluster (only when the range readout shows) -->
        <span class="mx-0.5 h-4 w-px shrink-0 bg-border/50 @max-[600px]/tb:hidden"></span>

        <div class="flex shrink-0 items-center gap-1.5">
        <Select.Root
          type="single"
          value={String(pageSize)}
          onValueChange={(v) => { if (v) onpagesizechange(Number(v)); }}
          disabled={loading}
        >
          <Select.Trigger size="sm" class={pageSelectTrigger} title="Rows per page" aria-label="Rows per page">
            {pageSizeLabel(pageSize)}
          </Select.Trigger>
          <Select.Content align="end" class="min-w-0">
            {#each PAGE_SIZE_OPTIONS as size (size)}
              <Select.Item value={String(size)} label={pageSizeLabel(size)} />
            {/each}
          </Select.Content>
        </Select.Root>

        <!-- Page picker + arrows only exist when there is something to paginate
             (more than one page, or the count is still unknown). A single-page
             table shows just the range readout and the page-size select. -->
        {#if counting || pageCount > 1}
          <Select.Root
            type="single"
            value={String(page)}
            onValueChange={(v) => { if (v) onpagechange(Number(v)); }}
            disabled={loading || total === 0}
          >
            <Select.Trigger size="sm" class={pageSelectTrigger} title="Go to page" aria-label="Go to page">
              {page}
            </Select.Trigger>
            <Select.Content align="end" class="max-h-56">
              {#each pageMenuItems as p (p)}
                <Select.Item value={String(p)} label={String(p)} />
              {/each}
            </Select.Content>
          </Select.Root>

          <span
            class="shrink-0 text-ui-xs text-muted-foreground/50 tabular-nums @max-[500px]/tb:hidden"
            title={counting ? "counting…" : pageCount.toLocaleString("en-US")}
          >of {counting ? "…" : formatCompactCount(pageCount)}</span>

          <button
            type="button"
            class={iconBtn}
            disabled={!canPrev || loading}
            onclick={onprev}
            aria-label="Previous page"
          >
            <Icon name="chevron-left" class="size-3.5" />
          </button>
          <button
            type="button"
            class={iconBtn}
            disabled={!canNext || loading}
            onclick={onnext}
            aria-label="Next page"
          >
            <Icon name="chevron-right" class="size-3.5" />
          </button>
        {/if}
        </div>
      {/if}

    {/if}

    <button
      type="button"
      class={cn(iconBtn, "shrink-0")}
      disabled={loading}
      onclick={onrefresh}
      title="Refresh data (⌘R)"
      aria-label="Refresh data"
    >
      <Icon name="refresh-cw" class={cn("size-3.5", loading && "animate-spin")} />
    </button>

    <!-- Custom limit / offset -->
    <DropdownMenu.Root bind:open={limitOffsetOpen}
      onOpenChange={(open) => {
        if (open) {
          draftLimit = pageSize === PAGE_SIZE_ALL ? _effectivePageSize : pageSize;
          draftOffset = offset;
        }
      }}
    >
      <DropdownMenu.Trigger
        class={cn(iconBtn, "shrink-0", limitOffsetOpen && "bg-accent text-foreground")}
        title="Custom limit & offset"
        aria-label="Custom limit & offset"
        disabled={loading || tableViewMode === "structure" || total === 0}
      >
        <Icon name="sliders-horizontal" class="size-3.5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="w-52 p-0 text-ui-sm">
        <div class="border-b border-border px-3 py-2.5">
          <p class="font-medium text-foreground">Pagination</p>
        </div>
        <div class="flex flex-col gap-3 p-3">
          <label class="flex flex-col gap-1">
            <span class="text-ui-xs text-muted-foreground">Limit</span>
            <Input
              class={cn(
                "h-7 font-mono text-ui-sm",
                limitError && "border-destructive focus-visible:ring-destructive/30",
              )}
              type="text"
              inputmode="numeric"
              value={draftLimit}
              placeholder="e.g. 50"
              oninput={(e) => {
                const raw = sanitizeDigits(e.currentTarget.value)
                e.currentTarget.value = raw
                const v = Math.max(1, Number(raw) || 1);
                draftLimit = v;
                limitError = v > MAX_PAGE_SIZE
                  ? `Maximum is ${MAX_PAGE_SIZE.toLocaleString()} rows`
                  : "";
              }}
            />
            {#if limitError}
              <p class="text-ui-xs text-destructive">{limitError}</p>
            {/if}
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-ui-xs text-muted-foreground">Offset (skip rows)</span>
            <Input
              class="h-7 font-mono text-ui-sm"
              type="text"
              inputmode="numeric"
              value={draftOffset}
              placeholder="e.g. 0"
              oninput={(e) => {
                const raw = sanitizeDigits(e.currentTarget.value)
                e.currentTarget.value = raw
                draftOffset = Math.max(0, Number(raw) || 0);
              }}
            />
          </label>
          <div class="flex gap-1.5">
            <button
              type="button"
              class="inline-flex flex-1 h-7 items-center justify-center rounded-md border border-border text-ui-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              onclick={() => { limitOffsetOpen = false; limitError = ""; }}
            >Cancel</button>
            <button
              type="button"
              class="inline-flex flex-1 h-7 items-center justify-center rounded-md bg-primary text-ui-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none"
              disabled={!!limitError || draftLimit < 1}
              onclick={() => {
                const l = Math.max(1, Math.floor(draftLimit));
                const o = Math.max(0, Math.floor(draftOffset));
                if (l > MAX_PAGE_SIZE) {
                  limitError = `Maximum is ${MAX_PAGE_SIZE.toLocaleString()} rows`;
                  return;
                }
                onlimitoffsetchange(l, o);
                limitOffsetOpen = false;
                limitError = "";
              }}
            >Apply</button>
          </div>
        </div>
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <!-- ⋯ More menu: structure / ∞ / export / delete -->
    <DropdownMenu.Root
      bind:open={moreMenuOpen}
      onOpenChange={(open) => {
        if (!open) {
          deleteConfirmPending = false;
          if (_deleteConfirmTimer) { clearTimeout(_deleteConfirmTimer); _deleteConfirmTimer = null; }
        }
      }}
    >
      <DropdownMenu.Trigger
        class={cn(iconBtn, "shrink-0")}
        title="More actions"
        disabled={loading || deleting}
      >
        <Icon name="more-horizontal" class="size-3.5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="w-56 text-ui-sm [&_[data-slot=dropdown-menu-item]]:whitespace-nowrap [&_[data-slot=dropdown-menu-radio-item]]:whitespace-nowrap">
        {#if structureAllowed}
          <DropdownMenu.Item onSelect={ontogglestructure}>
            <Icon name="layout-list" class="size-3.5" />
            {tableViewMode === "structure" ? "View Data" : "View Structure"}
          </DropdownMenu.Item>
          {#if tableViewMode !== "structure"}
            <DropdownMenu.Separator />
          {/if}
        {/if}
        {#if tableViewMode !== "structure"}
          <DropdownMenu.RadioGroup
            value={dataViewMode}
            onValueChange={(v) => (dataViewMode = /** @type {'table' | 'json' | 'record' | 'text' | 'chart'} */ (v))}
          >
            {#each DATA_VIEW_MODES as m (m.id)}
              <DropdownMenu.RadioItem value={m.id} disabled={columns.length === 0}>
                <Icon name={m.icon} class="size-3.5" />
                {m.label}
              </DropdownMenu.RadioItem>
            {/each}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator />
          {#if findReplaceEnabled}
            <DropdownMenu.Item disabled={total === 0 || readonly || !hasPrimaryKey} onSelect={onfindreplace}>
              <Icon name="replace" class="size-3.5" />
              Find & replace…
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
          {/if}
          <DropdownMenu.Item onSelect={oninfinitescrolltoggle}>
            <Icon name="infinity" class="size-3.5" />
            Infinite scroll
            {#if infiniteScroll}
              <span class="ml-auto text-[10px] text-primary">✓</span>
            {/if}
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          {#if selectedCount > 0}
            <DropdownMenu.Label class="text-ui-xs font-normal text-muted-foreground">
              {selectedCount} row{selectedCount === 1 ? "" : "s"} selected
            </DropdownMenu.Label>
          {/if}
          <DropdownMenu.Item disabled={total === 0} onSelect={() => onexport("csv")}>
            <Icon name="file-down" />
            Export as CSV
          </DropdownMenu.Item>
          <DropdownMenu.Item disabled={total === 0} onSelect={() => onexport("json")}>
            <Icon name="file-down" />
            Export as JSON
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item
            variant="destructive"
            disabled={selectedCount === 0 || !hasPrimaryKey || deleting || readonly}
            class={deleteConfirmPending ? "animate-pulse" : ""}
            onSelect={(e) => {
              if (!deleteConfirmPending) {
                e.preventDefault();
                deleteConfirmPending = true;
                if (_deleteConfirmTimer) clearTimeout(_deleteConfirmTimer);
                _deleteConfirmTimer = setTimeout(() => {
                  deleteConfirmPending = false;
                  _deleteConfirmTimer = null;
                }, 2500);
              } else {
                deleteConfirmPending = false;
                if (_deleteConfirmTimer) { clearTimeout(_deleteConfirmTimer); _deleteConfirmTimer = null; }
                ondeleteselected();
              }
            }}
          >
            <Icon name="trash-2" />
            {deleteConfirmPending ? "Click again to confirm" : deleteLabel}
            <DropdownMenu.Shortcut>⌘⌫</DropdownMenu.Shortcut>
          </DropdownMenu.Item>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </header>

  <!-- Inline filter bar -->
  {#if filterBarOpen && columns.length > 0 && tableViewMode !== "structure"}
    <div class="studio-filter-bar border-b border-border/50 bg-panel">
      {#each rowFilters as filter, i (filter.id)}
        {@const colKind = getColKind(filter.column)}
        {@const colOps = opsForCol(filter.column)}
        {@const enumOpts = enumOptionsFor(filter.column)}
        <div
          class="flex items-center gap-2 border-b border-border/30 px-3 py-1.5 last:border-b-0"
        >
          <button
            type="button"
            class="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Remove filter"
            onclick={() => removeFilter(filter.id)}
          >
            <Icon name="x" class="size-3" />
          </button>
          {#if i === 0}
            <span
              class="w-10 shrink-0 select-none text-right font-mono text-ui-xs text-muted-foreground"
              >where</span
            >
          {:else}
            <button
              type="button"
              class="inline-flex h-5 w-10 shrink-0 items-center justify-center rounded border font-mono text-ui-2xs font-semibold uppercase tracking-wide transition-colors {filter.conjunct ===
              'or'
                ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'}"
              title="Toggle AND / OR"
              onclick={() =>
                patchFilter(filter.id, {
                  conjunct: filter.conjunct === "or" ? "and" : "or",
                })}
            >
              {filter.conjunct === "or" ? "or" : "and"}
            </button>
          {/if}
          <SearchableMenu
            items={filterColumnItems}
            placeholder="Search columns…"
            contentClass="w-52"
            onselect={(it) => pickFilterColumn(filter, it.value)}
          >
            {#snippet trigger(props)}
              <button
                {...props}
                type="button"
                class="inline-flex h-7 w-32 shrink-0 items-center gap-1 rounded-md border border-border/60 bg-transparent px-2 text-ui-sm font-normal text-foreground shadow-none transition-colors hover:bg-accent"
                title="Column"
              >
                <span class="min-w-0 flex-1 truncate text-left">
                  {filter.column === ANY_COLUMN ? "Any column" : filter.column || "Column"}
                </span>
                <Icon name="chevron-down" class="size-3 shrink-0 opacity-50" />
              </button>
            {/snippet}
            {#snippet item(it)}
              <span class="min-w-0 flex-1 truncate">{it.label}</span>
              {#if filter.column === it.value}<span class="shrink-0 text-primary">✓</span>{/if}
            {/snippet}
          </SearchableMenu>
          <SearchableMenu
            items={colOps}
            placeholder="Search conditions…"
            contentClass="w-52"
            onselect={(it) => patchFilter(filter.id, { op: /** @type {FilterOp} */ (it.value), value: "" })}
          >
            {#snippet trigger(props)}
              <button
                {...props}
                type="button"
                class="inline-flex h-7 w-28 shrink-0 items-center gap-1 rounded-md border border-border/60 bg-transparent px-2 text-ui-sm font-normal text-foreground shadow-none transition-colors hover:bg-accent"
                title="Condition"
              >
                <span class="min-w-0 flex-1 truncate text-left">{filterOpLabel(filter.op)}</span>
                <Icon name="chevron-down" class="size-3 shrink-0 opacity-50" />
              </button>
            {/snippet}
            {#snippet item(it)}
              <span class="min-w-0 flex-1 truncate">{it.label}</span>
              {#if filter.op === it.value}<Icon name="check" class="size-3.5 shrink-0 text-primary" />{/if}
            {/snippet}
          </SearchableMenu>
          {#if filterNeedsValue(filter.id)}
            {#if colKind === "boolean"}
              <div class="flex gap-1">
                {#each [{ label: "True", value: "true" }, { label: "False", value: "false" }] as opt (opt.value)}
                  <button
                    type="button"
                    class={cn(
                      "inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-ui-sm transition-colors",
                      filter.value === opt.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                    onclick={() => patchFilter(filter.id, { value: opt.value })}
                    >{opt.label}</button
                  >
                {/each}
              </div>
            {:else if colKind === "date"}
              <DateFilterControl
                op={filter.op}
                value={filter.value}
                onchange={(d) => patchFilter(filter.id, { op: /** @type {FilterOp} */ (d.op), value: d.value })}
              />
            {:else if colKind === "number"}
              <Input
                type="text"
                inputmode="decimal"
                data-filter-value
                class="h-7 min-w-[6rem] flex-1 border-input bg-input/30 font-mono text-ui-sm shadow-none"
                value={filter.value}
                placeholder="Number…"
                oninput={(e) => {
                  const raw = sanitizeNumericStr(e.currentTarget.value)
                  e.currentTarget.value = raw
                  patchFilter(filter.id, { value: raw })
                }}
              />
            {:else if enumOpts}
              <SearchableMenu
                items={enumOpts.map((v) => ({ value: v, label: v }))}
                placeholder="Search values…"
                contentClass="w-56"
                onselect={(it) => patchFilter(filter.id, { value: it.value })}
              >
                {#snippet trigger(props)}
                  <button
                    {...props}
                    type="button"
                    class="inline-flex h-7 min-w-[8rem] flex-1 items-center gap-1 rounded-md border border-border/60 bg-input/30 px-2 text-ui-sm font-normal shadow-none transition-colors hover:bg-accent"
                    title="Value"
                  >
                    <span class={cn("min-w-0 flex-1 truncate text-left font-mono", !filter.value && "font-sans text-muted-foreground")}>
                      {filter.value || "Select value…"}
                    </span>
                    <Icon name="chevron-down" class="size-3 shrink-0 opacity-50" />
                  </button>
                {/snippet}
                {#snippet item(it)}
                  <span class="min-w-0 flex-1 truncate font-mono">{it.label}</span>
                  {#if filter.value === it.value}<Icon name="check" class="size-3.5 shrink-0 text-primary" />{/if}
                {/snippet}
              </SearchableMenu>
            {:else}
              <Input
                data-filter-value
                class="h-7 min-w-[6rem] flex-1 border-input bg-input/30 text-ui-sm shadow-none"
                value={filter.value}
                placeholder="Value…"
                oninput={(e) =>
                  patchFilter(filter.id, { value: e.currentTarget.value })}
              />
            {/if}
          {:else}
            <div class="flex-1"></div>
          {/if}
        </div>
      {/each}
      <div class="flex items-center gap-1 px-3 py-1.5">
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-ui-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onclick={addFilter}
        >
          <Icon name="plus" class="size-3.5" />
          Add filter
        </button>
        <div class="flex-1"></div>
        {#if rowFilters.length > 0}
          <button
            type="button"
            class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-ui-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onclick={clearFilters}
          >
            Clear filters
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>
