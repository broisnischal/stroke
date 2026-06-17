<script>
  import LayoutList from "@lucide/svelte/icons/layout-list";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import ListFilter from "@lucide/svelte/icons/list-filter";
  import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import Plus from "@lucide/svelte/icons/plus";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Infinity from "@lucide/svelte/icons/infinity";
  import MoreHorizontal from "@lucide/svelte/icons/more-horizontal";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import FileDown from "@lucide/svelte/icons/file-down";
  import Columns3 from "@lucide/svelte/icons/columns-3";
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import Link2 from "@lucide/svelte/icons/link-2";
  import Search from "@lucide/svelte/icons/search";
  import X from "@lucide/svelte/icons/x";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import SearchableMenu from "./SearchableMenu.svelte";
  import DateFilterPicker from "./DateFilterPicker.svelte";
  import DateRangePicker from "./DateRangePicker.svelte";
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
    activeFilters,
    createFilter,
    ANY_COLUMN,
  } from "$lib/table-query.js";
  import { untrack } from "svelte";
  import { formatCompactCount } from "$lib/table-list.js";

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
    /** @type {Set<string>} */
    hiddenColumns = new Set(),
    /** @type {(next: Set<string>) => void} */
    onhiddencolumnschange = () => {},
    /** Virtual FK relationship columns (reverse FK badge cols) to show in the hide/show dropdown. */
    virtualRelColumns = /** @type {Array<{ label: string }>} */ ([]),
    filterBarOpen = $bindable(false),
    /** @type {'data' | 'structure'} */
    tableViewMode = $bindable("data"),
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
  } = $props();

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

  const from = $derived(total === 0 ? 0 : offset + 1);
  const to = $derived(Math.min(offset + _effectivePageSize, total));
  const pageCount = $derived(Math.max(1, Math.ceil(total / _effectivePageSize) || 1));
  const canPrev = $derived(page > 1);
  const canNext = $derived(page * _effectivePageSize < total);

  const filterCount = $derived(activeFilters(rowFilters).length);
  const sortLabel = $derived(
    rowSort?.column
      ? `${rowSort.column} ${rowSort.direction === "desc" ? "↓" : "↑"}`
      : "Sort",
  );

  let sortMenuOpen = $state(false);
  let columnsMenuOpen = $state(false);
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

  // ── Searchable-menu item lists ──────────────────────────────────────────
  // Sort: two rows per column (ascending / descending), searchable by name.
  const sortItems = $derived(
    columns.flatMap((c) => [
      { value: `${c.name} ascending`, label: c.name, col: c.name, dir: "asc", keywords: [c.name], active: rowSort?.column === c.name && rowSort?.direction === "asc" },
      { value: `${c.name} descending`, label: c.name, col: c.name, dir: "desc", keywords: [c.name], active: rowSort?.column === c.name && rowSort?.direction === "desc" },
    ]),
  );

  // Columns hide/show: real columns + virtual relationship columns.
  const columnItems = $derived([
    ...columns.map((c) => ({ value: c.name, label: c.name, kind: "col", hidden: hiddenColumns.has(c.name) })),
    ...virtualRelColumns.map((vc) => ({ value: `__vrel:${vc.label}`, label: vc.label, kind: "vrel", hidden: hiddenColumns.has(`__vrel:${vc.label}`) })),
  ]);

  function toggleColumnItem(/** @type {any} */ it) {
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
          ...columns.slice(1).map((c) => c.name),
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

  /** @param {string} colName */
  function opsForCol(colName) {
    if (colName === ANY_COLUMN) return ANY_COLUMN_OPS;
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
</script>

<div class="flex shrink-0 flex-col">
  <header
    class="studio-chrome studio-table-toolbar flex h-9 shrink-0 items-center gap-1 border-b border-border bg-panel px-2"
    data-studio-chrome
  >
    <!-- Search — far left -->
    <div class="relative flex h-7 w-52 shrink-0 items-center">
      <Search class="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
      {#if tableViewMode === "structure"}
        <input
          bind:this={structureSearchEl}
          type="text"
          aria-label="Search column"
          class="h-7 w-full min-w-0 rounded-md border border-input bg-input/30 pl-7 pr-7 font-mono text-ui-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
            "h-7 w-full min-w-0 border-input bg-input/30 pl-7 pr-7 text-ui-sm shadow-none focus-visible:ring-2",
            localSearch.trim() && "border-ring/40",
          )}
          placeholder="Search…"
          value={localSearch}
          disabled={columns.length === 0}
          oninput={(e) => handleSearchInput(e.currentTarget.value)}
        />
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
        <X class="size-3" />
      </button>
    </div>

    {#if tableViewMode !== "structure"}
      <!-- Filter -->
      <button
        type="button"
        class={cn(
          iconBtn,
          "relative shrink-0",
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
        <ListFilter class="size-3.5" />
        {#if filterCount > 0}
          <span
            class="absolute -top-0.5 -right-0.5 flex size-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-ui-3xs font-medium text-primary-foreground"
            aria-hidden="true"
          >{formatCompactCount(filterCount)}</span>
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
            class={cn(iconBtn, "shrink-0", (rowSort?.column || sortMenuOpen) && "bg-accent text-foreground")}
            title={sortLabel}
            disabled={loading || columns.length === 0}
          >
            <ArrowUpDown class="size-3.5" />
          </button>
        {/snippet}
        {#snippet header()}
          {#if rowSort?.column}
            <button
              type="button"
              class="flex w-full items-center gap-1.5 border-b border-border/40 px-3 py-1.5 text-left text-ui-xs text-muted-foreground transition-colors hover:text-foreground"
              onclick={() => { clearSort(); sortMenuOpen = false; }}
            >
              <X class="size-3.5" /> Clear sort
            </button>
          {/if}
        {/snippet}
        {#snippet item(it)}
          {#if it.dir === "asc"}<ArrowUp class="size-3.5 text-muted-foreground" />{:else}<ArrowDown class="size-3.5 text-muted-foreground" />{/if}
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
            class={cn(iconBtn, "relative shrink-0", (hiddenCount > 0 || columnsMenuOpen) && "bg-accent text-foreground")}
            title="Toggle columns"
            disabled={loading || columns.length === 0}
          >
            <Columns3 class="size-3.5" />
            {#if hiddenCount > 0}
              <span
                class="absolute -top-0.5 -right-0.5 flex size-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-ui-3xs font-medium text-primary-foreground"
                aria-hidden="true"
              >{hiddenCount}</span>
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
            <EyeOff class="size-3.5 text-muted-foreground" />
          {:else if it.kind === "vrel"}
            <Link2 class="size-3.5 text-primary/60" />
          {:else}
            <Eye class="size-3.5" />
          {/if}
          <span class={cn("min-w-0 flex-1 truncate", it.hidden && "text-muted-foreground")}>{it.label}</span>
          {#if it.kind === "vrel"}<span class="shrink-0 text-ui-3xs text-muted-foreground/40">rel</span>{/if}
        {/snippet}
      </SearchableMenu>

      <span class="mx-0.5 h-4 w-px shrink-0 bg-border/60"></span>

      <!-- Add row -->
      <button
        type="button"
        class="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border/60 px-2 text-ui-sm text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        disabled={loading || columns.length === 0 || readonly}
        title={readonly ? "Read-only mode" : "Insert row (Add)"}
        onclick={onaddrow}
      >
        <Plus class="size-3.5 shrink-0" />
        Add
      </button>
    {/if}

    <!-- Spacer -->
    <div class="flex-1"></div>

    {#if tableViewMode !== "structure"}
      {#if infiniteScroll}
        {#if total > 0}
          <span
            class="flex shrink-0 items-center gap-1 font-mono text-ui-xs tabular-nums"
            title="{to.toLocaleString('en-US')} of {total.toLocaleString('en-US')} rows loaded"
          >
            <span class="text-foreground/65">{to.toLocaleString("en-US")}</span>
            <span class="text-muted-foreground/40">of {total.toLocaleString("en-US")} loaded</span>
            {#if queryMs > 0}<span class="text-muted-foreground/30">· {queryMs}ms</span>{/if}
          </span>
        {/if}
      {:else}
        {#if total > 0}
          <span
            class="flex shrink-0 items-center gap-1 font-mono text-ui-xs tabular-nums"
            title="{from.toLocaleString('en-US')}–{to.toLocaleString('en-US')} of {total.toLocaleString('en-US')} rows{queryMs > 0 ? ` · ${queryMs}ms` : ''}"
          >
            <span class="text-foreground/65">{from.toLocaleString("en-US")}–{to.toLocaleString("en-US")}</span>
            {#if live}
              <span class="text-muted-foreground/40">of <span class="inline-block tabular-nums" use:slotRoll={total.toLocaleString("en-US")}></span></span>
            {:else}
              <span class="text-muted-foreground/40">of {total.toLocaleString("en-US")}</span>
            {/if}
            {#if queryMs > 0}<span class="text-muted-foreground/30">· {queryMs}ms</span>{/if}
          </span>
        {:else if queryMs > 0}
          <span class="shrink-0 font-mono text-ui-xs text-muted-foreground/35 tabular-nums">{queryMs}ms</span>
        {/if}

        <span class="mx-0.5 h-4 w-px shrink-0 bg-border/60"></span>

        <Select.Root
          type="single"
          value={String(pageSize)}
          onValueChange={(v) => { if (v) onpagesizechange(Number(v)); }}
          disabled={loading}
        >
          <Select.Trigger size="sm" class={pageSelectTrigger} title="Rows per page" aria-label="Rows per page">
            {pageSize === PAGE_SIZE_ALL ? "All" : pageSize === 1_000_000 ? "1M" : pageSize}
          </Select.Trigger>
          <Select.Content align="end" class="min-w-0">
            {#each PAGE_SIZE_OPTIONS as size (size)}
              {@const label = size === PAGE_SIZE_ALL ? "All" : size === 1_000_000 ? "1M" : String(size)}
              <Select.Item value={String(size)} {label} />
            {/each}
          </Select.Content>
        </Select.Root>

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
          class="shrink-0 text-ui-xs text-muted-foreground/50 tabular-nums"
          title={pageCount.toLocaleString("en-US")}
        >of {formatCompactCount(pageCount)}</span>

        <button
          type="button"
          class={iconBtn}
          disabled={!canPrev || loading}
          onclick={onprev}
          aria-label="Previous page"
        >
          <ChevronLeft class="size-3.5" />
        </button>
        <button
          type="button"
          class={iconBtn}
          disabled={!canNext || loading}
          onclick={onnext}
          aria-label="Next page"
        >
          <ChevronRight class="size-3.5" />
        </button>
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
      <RefreshCw class={cn("size-3.5", loading && "animate-spin")} />
    </button>

    <!-- ⋯ More menu — always visible: structure, ∞, export, delete -->
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
        <SlidersHorizontal class="size-3.5" />
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
              type="number"
              min="1"
              max={MAX_PAGE_SIZE}
              value={draftLimit}
              oninput={(e) => {
                const v = Math.max(1, Number(e.currentTarget.value) || 1);
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
              type="number"
              min="0"
              value={draftOffset}
              oninput={(e) => {
                draftOffset = Math.max(0, Number(e.currentTarget.value) || 0);
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
        <MoreHorizontal class="size-3.5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="w-48 text-ui-sm">
        {#if structureAllowed}
          <DropdownMenu.Item onSelect={ontogglestructure}>
            <LayoutList class="size-3.5" />
            {tableViewMode === "structure" ? "View Data" : "View Structure"}
          </DropdownMenu.Item>
          {#if tableViewMode !== "structure"}
            <DropdownMenu.Separator />
          {/if}
        {/if}
        {#if tableViewMode !== "structure"}
          <DropdownMenu.Item onSelect={oninfinitescrolltoggle}>
            <Infinity class="size-3.5" />
            {infiniteScroll ? "Disable infinite scroll" : "Infinite scroll"}
            {#if infiniteScroll}
              <DropdownMenu.Shortcut class="text-primary">✓</DropdownMenu.Shortcut>
            {/if}
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          {#if selectedCount > 0}
            <DropdownMenu.Label class="text-ui-xs font-normal text-muted-foreground">
              {selectedCount} row{selectedCount === 1 ? "" : "s"} selected
            </DropdownMenu.Label>
          {/if}
          <DropdownMenu.Item disabled={total === 0} onSelect={() => onexport("csv")}>
            <FileDown />
            Export as CSV
          </DropdownMenu.Item>
          <DropdownMenu.Item disabled={total === 0} onSelect={() => onexport("json")}>
            <FileDown />
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
            <Trash2 />
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
        <div
          class="flex items-center gap-2 border-b border-border/30 px-3 py-1.5 last:border-b-0"
        >
          <button
            type="button"
            class="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Remove filter"
            onclick={() => removeFilter(filter.id)}
          >
            <X class="size-3" />
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
                <ChevronDown class="size-3 shrink-0 opacity-50" />
              </button>
            {/snippet}
            {#snippet item(it)}
              <span class="min-w-0 flex-1 truncate">{it.label}</span>
              {#if filter.column === it.value}<span class="shrink-0 text-primary">✓</span>{/if}
            {/snippet}
          </SearchableMenu>
          <Select.Root
            type="single"
            value={filter.op}
            onValueChange={(v) => {
              if (v)
                patchFilter(filter.id, {
                  op: /** @type {FilterOp} */ (v),
                  value: "",
                });
            }}
          >
            <Select.Trigger
              size="sm"
              class="h-7 w-28 shrink-0 gap-1 px-2 text-ui-sm font-normal shadow-none"
              title="Condition"
            >
              <span class="truncate">{filterOpLabel(filter.op)}</span>
            </Select.Trigger>
            <Select.Content class="max-h-56">
              {#each colOps as op (op.value)}
                <Select.Item value={op.value} label={op.label} />
              {/each}
            </Select.Content>
          </Select.Root>
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
              {#if filter.op === "between"}
                <DateRangePicker
                  from={betweenFrom(filter.value)}
                  to={betweenTo(filter.value)}
                  onchange={(f, t) => patchFilter(filter.id, { value: betweenJoin(f, t) })}
                />
              {:else}
                <DateFilterPicker
                  value={filter.value}
                  onchange={(v) => patchFilter(filter.id, { value: v })}
                />
              {/if}
            {:else if colKind === "number"}
              <Input
                type="number"
                data-filter-value
                class="h-7 min-w-[6rem] flex-1 border-input bg-input/30 text-ui-sm shadow-none"
                value={filter.value}
                placeholder="Value…"
                oninput={(e) =>
                  patchFilter(filter.id, { value: e.currentTarget.value })}
              />
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
          <Plus class="size-3.5" />
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
