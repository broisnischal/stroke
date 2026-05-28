<script>
  import PanelLeft from "@lucide/svelte/icons/panel-left";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";

  import ListFilter from "@lucide/svelte/icons/list-filter";
  import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import Plus from "@lucide/svelte/icons/plus";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import MoreHorizontal from "@lucide/svelte/icons/more-horizontal";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import FileDown from "@lucide/svelte/icons/file-down";
  import Columns3 from "@lucide/svelte/icons/columns-3";
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import Search from "@lucide/svelte/icons/search";
  import X from "@lucide/svelte/icons/x";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { cn } from "$lib/utils.js";
  import {
    FILTER_OPS,
    BOOL_FILTER_OPS,
    DATE_FILTER_OPS,
    NUM_FILTER_OPS,
    MAX_PAGE_SIZE,
    PAGE_SIZE_OPTIONS,
    activeFilters,
    createFilter,
  } from "$lib/table-query.js";
  import { untrack } from "svelte";
  import { formatCompactCount } from "$lib/table-list.js";

  /** @typedef {import('$lib/table-query.js').TableSort} TableSort */
  /** @typedef {import('$lib/table-query.js').TableFilter} TableFilter */
  /** @typedef {import('$lib/table-query.js').FilterOp} FilterOp */

  let {
    sidebarOpen = true,
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
    ontogglesidebar = () => {},
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
    filterBarOpen = $bindable(false),
  } = $props();

  const deleteLabel = $derived(
    selectedCount === 1
      ? "Delete 1 row"
      : `Delete ${formatCompactCount(selectedCount)} rows`,
  );

  const from = $derived(total === 0 ? 0 : offset + 1);
  const to = $derived(Math.min(offset + pageSize, total));
  const pageCount = $derived(Math.max(1, Math.ceil(total / pageSize) || 1));
  const canPrev = $derived(page > 1);
  const canNext = $derived(page * pageSize < total);

  const filterCount = $derived(activeFilters(rowFilters).length);
  const sortLabel = $derived(
    rowSort?.column
      ? `${rowSort.column} ${rowSort.direction === "desc" ? "↓" : "↑"}`
      : "Sort",
  );

  let sortMenuOpen = $state(false);
  let columnsMenuOpen = $state(false);
  let limitOffsetOpen = $state(false);
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

  /** Matches the “more actions” / delete menu panel */
  const menuContent = "w-44 text-ui-sm";

  /** Compact shadcn select trigger for pagination */
  const pageSelectTrigger =
    "h-7 min-w-0 gap-1 px-2 text-ui-sm font-normal tabular-nums shadow-none";

  /** @typedef {'text' | 'boolean' | 'date' | 'number'} ColKind */

  /** @param {string} colName @returns {ColKind} */
  function getColKind(colName) {
    const col = columns.find((c) => c.name === colName)
    const dt = (col?.dataType ?? col?.data_type ?? '').toLowerCase().replace(/\(.+\)$/, '').trim()
    if (dt === 'boolean' || dt === 'bool') return 'boolean'
    if (/^(date|timestamp|timestamptz|timetz|time)/.test(dt)) return 'date'
    if (/^(int|integer|bigint|smallint|numeric|decimal|real|double|float|serial|money)/.test(dt)) return 'number'
    return 'text'
  }

  /** @param {string} colName */
  function opsForCol(colName) {
    const kind = getColKind(colName)
    if (kind === 'boolean') return BOOL_FILTER_OPS
    if (kind === 'date') return DATE_FILTER_OPS
    if (kind === 'number') return NUM_FILTER_OPS
    return FILTER_OPS
  }

  /** Default op when a column is first chosen */
  /** @param {string} colName @returns {import('$lib/table-query.js').FilterOp} */
  function defaultOpForCol(colName) {
    const kind = getColKind(colName)
    if (kind === 'boolean') return 'eq'
    if (kind === 'date') return 'gte'
    if (kind === 'number') return 'eq'
    return 'contains'
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
  function betweenFrom(val) { return val.split(',')[0] ?? '' }
  /** @param {string} val */
  function betweenTo(val) { return val.split(',')[1] ?? '' }
  /** @param {string} from @param {string} to */
  function betweenJoin(from, to) { return `${from},${to}` }

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
    const op = col ? defaultOpForCol(col) : 'contains'
    onfilterschange([...rowFilters, createFilter(col, op)]);
  }

  /** @param {string} id */
  function removeFilter(id) {
    onfilterschange(rowFilters.filter((f) => f.id !== id));
  }

  function clearFilters() {
    onfilterschange([]);
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
  class="studio-chrome studio-table-toolbar flex min-h-9 shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border bg-panel px-3 py-1 md:flex-nowrap"
  data-studio-chrome
>
  <!-- Left -->
  <div class="order-1 flex shrink-0 items-center gap-0.5">
    <button
      type="button"
      class={cn(iconBtn, !sidebarOpen && "bg-accent text-foreground")}
      title="Toggle sidebar (⌘B)"
      aria-pressed={sidebarOpen}
      onclick={ontogglesidebar}
    >
      <PanelLeft class="size-3.5" />
    </button>
  </div>

  <!-- Center: search + filter + sort (full-width row below pagination when narrow) -->
  <div
    class="order-3 flex min-w-0 flex-1 basis-full items-center gap-1 md:order-2 md:min-w-[12rem] md:basis-auto lg:max-w-xl"
  >
    <div class="relative flex h-7 min-w-0 flex-1 items-center">
      <Search
        class="pointer-events-none absolute left-2 size-3.5 text-muted-foreground"
      />
      <Input
        bind:ref={searchInputRef}
        type="text"
        role="searchbox"
        aria-label="Search all columns"
        class={cn(
          "h-7 w-full min-w-0 border-input bg-input/30 pl-7 pr-7 text-ui-sm shadow-none focus-visible:ring-2",
          localSearch.trim() && "border-ring/40",
        )}
        placeholder="Search all columns…"
        value={localSearch}
        disabled={columns.length === 0}
        oninput={(e) => handleSearchInput(e.currentTarget.value)}
      />
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
          >
            {formatCompactCount(filterCount)}
          </span>
        {/if}
      </button>

    <DropdownMenu.Root bind:open={sortMenuOpen}>
      <DropdownMenu.Trigger
        class={cn(
          iconBtn,
          "shrink-0",
          (rowSort?.column || sortMenuOpen) && "bg-accent text-foreground",
        )}
        title={sortLabel}
        disabled={loading || columns.length === 0}
      >
        <ArrowUpDown class="size-3.5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="center"
        class={cn(menuContent, "max-h-64 overflow-y-auto")}
      >
        <DropdownMenu.Label>Sort by</DropdownMenu.Label>
        {#if rowSort?.column}
          <DropdownMenu.Item onSelect={clearSort}>
            <X class="size-3.5" />
            Clear sort
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
        {/if}
        {#each columns as col (col.name)}
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger>
              <span class="truncate">{col.name}</span>
              {#if rowSort?.column === col.name}
                <span class="ml-auto text-muted-foreground">
                  {rowSort.direction === "desc" ? "↓" : "↑"}
                </span>
              {/if}
            </DropdownMenu.SubTrigger>
            <DropdownMenu.SubContent class={menuContent}>
              <DropdownMenu.Item onSelect={() => applySort(col.name, "asc")}>
                <ArrowUp class="size-3.5" />
                Ascending
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => applySort(col.name, "desc")}>
                <ArrowDown class="size-3.5" />
                Descending
              </DropdownMenu.Item>
            </DropdownMenu.SubContent>
          </DropdownMenu.Sub>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <DropdownMenu.Root bind:open={columnsMenuOpen}>
      <DropdownMenu.Trigger
        class={cn(
          iconBtn,
          "relative shrink-0",
          (hiddenCount > 0 || columnsMenuOpen) && "bg-accent text-foreground",
        )}
        title="Toggle columns"
        disabled={loading || columns.length === 0}
      >
        <Columns3 class="size-3.5" />
        {#if hiddenCount > 0}
          <span
            class="absolute -top-0.5 -right-0.5 flex size-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-ui-3xs font-medium text-primary-foreground"
            aria-hidden="true"
          >
            {hiddenCount}
          </span>
        {/if}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="center" class="w-44 p-0 text-ui-sm">
        <div class="border-b border-border px-3 py-2">
          <p class="font-medium text-foreground">Columns</p>
        </div>
        <div class="max-h-64 overflow-y-auto p-1">
          {#each columns as col (col.name)}
            {@const hidden = hiddenColumns.has(col.name)}
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-ui-sm hover:bg-accent hover:text-foreground"
              onclick={() => toggleColumn(col.name)}
            >
              {#if hidden}
                <EyeOff class="size-3.5 shrink-0 text-muted-foreground" />
              {:else}
                <Eye class="size-3.5 shrink-0" />
              {/if}
              <span class={cn("truncate", hidden && "text-muted-foreground")}
                >{col.name}</span
              >
            </button>
          {/each}
        </div>
        {#if hiddenCount > 0}
          <div class="border-t border-border p-1">
            <button
              type="button"
              class="flex w-full items-center gap-1 rounded-sm px-2 py-1.5 text-ui-sm hover:bg-accent hover:text-foreground"
              onclick={showAllColumns}
            >
              <Eye class="size-3.5" />
              Show all columns
            </button>
          </div>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <button
      type="button"
      class="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary px-2 text-ui-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 md:px-2.5"
      disabled={loading || columns.length === 0}
      title="Insert row"
      onclick={onaddrow}
    >
      <Plus class="size-3.5 shrink-0" />
      <span class="hidden md:inline">Add</span>
    </button>
  </div>

  <!-- Right: perf + pagination -->
  <div
    class="order-2 ms-auto flex shrink-0 items-center gap-1 md:order-3 max-lg:max-w-[calc(100%-5rem)] max-lg:overflow-x-auto max-lg:[scrollbar-width:none] max-lg:[&::-webkit-scrollbar]:hidden"
  >
    {#if queryMs > 0}
      <span
        class="font-mono text-ui-xs text-muted-foreground tabular-nums"
        data-font="mono"
        title="Query execution time"
      >{queryMs}ms</span>
    {/if}
    {#if total > 0}
      <span
        class="font-mono text-ui-xs text-muted-foreground tabular-nums"
        title="{from.toLocaleString('en-US')}–{to.toLocaleString('en-US')} of {total.toLocaleString('en-US')} rows"
      >{formatCompactCount(from)}–{formatCompactCount(to)} of {total.toLocaleString('en-US')}</span>
    {/if}

    <span class="mx-0.5 h-4 w-px bg-border"></span>

    <Select.Root
      type="single"
      value={String(pageSize)}
      onValueChange={(v) => {
        if (v) onpagesizechange(Number(v));
      }}
      disabled={loading}
    >
      <Select.Trigger
        size="sm"
        class={pageSelectTrigger}
        title="Rows per page"
        aria-label="Rows per page"
      >
        {pageSize}
      </Select.Trigger>
      <Select.Content align="end" class="min-w-0">
        {#each PAGE_SIZE_OPTIONS as size (size)}
          <Select.Item value={String(size)} label={String(size)} />
        {/each}
      </Select.Content>
    </Select.Root>

    <Select.Root
      type="single"
      value={String(page)}
      onValueChange={(v) => {
        if (v) onpagechange(Number(v));
      }}
      disabled={loading || total === 0}
    >
      <Select.Trigger
        size="sm"
        class={pageSelectTrigger}
        title="Go to page"
        aria-label="Go to page"
      >
        {page}
      </Select.Trigger>
      <Select.Content align="end" class="max-h-56">
        {#each pageMenuItems as p (p)}
          <Select.Item value={String(p)} label={String(p)} />
        {/each}
      </Select.Content>
    </Select.Root>

    <span
      class="hidden text-ui-xs text-muted-foreground tabular-nums sm:inline"
      title={pageCount.toLocaleString("en-US")}
      >of {formatCompactCount(pageCount)}</span
    >

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
    <button
      type="button"
      class={iconBtn}
      disabled={loading}
      onclick={onrefresh}
      title="Refresh data (⌘R)"
      aria-label="Refresh data"
    >
      <RefreshCw class={cn("size-3.5", loading && "animate-spin")} />
    </button>

    <DropdownMenu.Root
      bind:open={limitOffsetOpen}
      onOpenChange={(open) => {
        if (open) {
          draftLimit = pageSize;
          draftOffset = offset;
        }
      }}
    >
      <DropdownMenu.Trigger
        class={cn(iconBtn, limitOffsetOpen && "bg-accent text-foreground")}
        title="Custom limit & offset"
        aria-label="Custom limit & offset"
        disabled={loading || total === 0}
      >
        <SlidersHorizontal class="size-3.5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="w-52 p-0 text-ui-sm">
        <div class="border-b border-border px-3 py-2.5">
          <p class="font-medium text-foreground">Pagination</p>
        </div>
        <div class="flex flex-col gap-3 p-3">
          <label class="flex flex-col gap-1">
            <span class="text-ui-xs text-muted-foreground">
              Limit
            </span>
            <Input
              class={cn(
                "h-7 font-mono text-ui-sm",
                limitError &&
                  "border-destructive focus-visible:ring-destructive/30",
              )}
              type="number"
              min="1"
              max={MAX_PAGE_SIZE}
              value={draftLimit}
              oninput={(e) => {
                const v = Math.max(1, Number(e.currentTarget.value) || 1);
                draftLimit = v;
                limitError =
                  v > MAX_PAGE_SIZE
                    ? `Maximum is ${MAX_PAGE_SIZE.toLocaleString()} rows`
                    : "";
              }}
            />
            {#if limitError}
              <p class="text-ui-xs text-destructive">{limitError}</p>
            {/if}
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-ui-xs text-muted-foreground"
              >Offset (skip rows)</span
            >
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
              onclick={() => {
                limitOffsetOpen = false;
                limitError = "";
              }}
            >
              Cancel
            </button>
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
            >
              Apply
            </button>
          </div>
        </div>
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class={cn(iconBtn, selectedCount > 0 && "text-foreground")}
        title="More actions"
        disabled={loading || deleting}
      >
        <MoreHorizontal class="size-3.5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class={menuContent}>
        <DropdownMenu.Label
          class="text-ui-xs font-normal text-muted-foreground"
        >
          {selectedCount > 0
            ? `${selectedCount} row${selectedCount === 1 ? "" : "s"} selected`
            : "Current page"}
        </DropdownMenu.Label>
        <DropdownMenu.Item
          disabled={total === 0}
          onSelect={() => onexport("csv")}
        >
          <FileDown />
          Export as CSV
        </DropdownMenu.Item>
        <DropdownMenu.Item
          disabled={total === 0}
          onSelect={() => onexport("json")}
        >
          <FileDown />
          Export as JSON
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          variant="destructive"
          disabled={selectedCount === 0 || !hasPrimaryKey || deleting}
          onSelect={ondeleteselected}
        >
          <Trash2 />
          {deleteLabel}
          <DropdownMenu.Shortcut>⌘⌫</DropdownMenu.Shortcut>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>
</header>

<!-- Inline filter bar -->
{#if filterBarOpen && columns.length > 0}
  <div class="border-b border-border/50 bg-panel">
    {#each rowFilters as filter, i (filter.id)}
      {@const colKind = getColKind(filter.column)}
      {@const colOps = opsForCol(filter.column)}
      <div class="flex items-center gap-2 border-b border-border/30 px-3 py-1.5 last:border-b-0">
        <button
          type="button"
          class="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="Remove filter"
          onclick={() => removeFilter(filter.id)}
        >
          <X class="size-3" />
        </button>
        {#if i === 0}
          <span class="w-10 shrink-0 select-none text-right font-mono text-ui-xs text-muted-foreground">where</span>
        {:else}
          <button
            type="button"
            class="inline-flex h-5 w-10 shrink-0 items-center justify-center rounded border font-mono text-ui-2xs font-semibold uppercase tracking-wide transition-colors {filter.conjunct === 'or' ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20' : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'}"
            title="Toggle AND / OR"
            onclick={() => patchFilter(filter.id, { conjunct: filter.conjunct === 'or' ? 'and' : 'or' })}
          >
            {filter.conjunct === 'or' ? 'or' : 'and'}
          </button>
        {/if}
        <Select.Root
          type="single"
          value={filter.column}
          onValueChange={(v) => {
            if (!v) return
            const newOps = opsForCol(v)
            const newOp = newOps.some((o) => o.value === filter.op) ? filter.op : defaultOpForCol(v)
            patchFilter(filter.id, { column: v, op: /** @type {FilterOp} */ (newOp), value: '' })
          }}
        >
          <Select.Trigger size="sm" class="h-7 w-32 shrink-0 gap-1 px-2 text-ui-sm font-normal shadow-none" title="Column">
            <span class="truncate">{filter.column || 'Column'}</span>
          </Select.Trigger>
          <Select.Content class="max-h-56">
            {#each columns as col (col.name)}
              <Select.Item value={col.name} label={col.name} />
            {/each}
          </Select.Content>
        </Select.Root>
        <Select.Root
          type="single"
          value={filter.op}
          onValueChange={(v) => {
            if (v) patchFilter(filter.id, { op: /** @type {FilterOp} */ (v), value: '' })
          }}
        >
          <Select.Trigger size="sm" class="h-7 w-28 shrink-0 gap-1 px-2 text-ui-sm font-normal shadow-none" title="Condition">
            <span class="truncate">{filterOpLabel(filter.op)}</span>
          </Select.Trigger>
          <Select.Content class="max-h-56">
            {#each colOps as op (op.value)}
              <Select.Item value={op.value} label={op.label} />
            {/each}
          </Select.Content>
        </Select.Root>
        {#if filterNeedsValue(filter.id)}
          {#if colKind === 'boolean'}
            <div class="flex gap-1">
              {#each [{ label: 'True', value: 'true' }, { label: 'False', value: 'false' }] as opt (opt.value)}
                <button
                  type="button"
                  class={cn(
                    "inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-ui-sm transition-colors",
                    filter.value === opt.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                  onclick={() => patchFilter(filter.id, { value: opt.value })}
                >{opt.label}</button>
              {/each}
            </div>
          {:else if colKind === 'date'}
            {#if filter.op === 'between'}
              <div class="flex min-w-0 flex-1 items-center gap-1.5">
                <input
                  type="date"
                  value={betweenFrom(filter.value)}
                  class="h-7 min-w-0 flex-1 rounded-md border border-input bg-input/30 px-2 text-ui-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                  oninput={(e) => patchFilter(filter.id, { value: betweenJoin(e.currentTarget.value, betweenTo(filter.value)) })}
                />
                <span class="shrink-0 text-ui-xs text-muted-foreground">to</span>
                <input
                  type="date"
                  value={betweenTo(filter.value)}
                  class="h-7 min-w-0 flex-1 rounded-md border border-input bg-input/30 px-2 text-ui-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                  oninput={(e) => patchFilter(filter.id, { value: betweenJoin(betweenFrom(filter.value), e.currentTarget.value) })}
                />
              </div>
            {:else}
              <input
                type="date"
                value={filter.value}
                class="h-7 w-36 shrink-0 rounded-md border border-input bg-input/30 px-2 text-ui-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                oninput={(e) => patchFilter(filter.id, { value: e.currentTarget.value })}
              />
            {/if}
          {:else if colKind === 'number'}
            <Input
              type="number"
              class="h-7 min-w-[6rem] flex-1 border-input bg-input/30 text-ui-sm shadow-none"
              value={filter.value}
              placeholder="Value…"
              oninput={(e) => patchFilter(filter.id, { value: e.currentTarget.value })}
            />
          {:else}
            <Input
              class="h-7 min-w-[6rem] flex-1 border-input bg-input/30 text-ui-sm shadow-none"
              value={filter.value}
              placeholder="Value…"
              oninput={(e) => patchFilter(filter.id, { value: e.currentTarget.value })}
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
