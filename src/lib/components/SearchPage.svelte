<script>
  import { getTableRows } from '$lib/api.js'
  import Search from '@lucide/svelte/icons/search'
  import Table2 from '@lucide/svelte/icons/table-2'
  import Eye from '@lucide/svelte/icons/eye'
  import Loader from '@lucide/svelte/icons/loader'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import { cn } from '$lib/utils.js'

  /**
   * @typedef {{ name: string, rowCount?: number, tableKind?: string }} TableInfo
   * @typedef {{ table: string, count: number, columns: any[], sampleRow: any[] | null, tableKind?: string }} SearchHit
   */

  let {
    /** @type {TableInfo[]} */
    tables = [],
    schema = 'public',
    /** @param {string} tableName @param {string} searchTerm */
    onopentable = (tableName, searchTerm) => {},
  } = $props()

  let query = $state('')
  /** @type {SearchHit[]} */
  let results = $state([])
  let searching = $state(false)
  let searched = $state(false)
  let progress = $state({ done: 0, total: 0 })
  let searchGeneration = 0
  /** @type {HTMLInputElement | null} */
  let inputEl = $state(null)

  async function runSearch() {
    const q = query.trim()
    if (!q || searching) return

    const gen = ++searchGeneration
    searching = true
    searched = false
    results = []

    const searchable = tables.filter(
      (t) =>
        !t.tableKind ||
        ['table', 'view', 'foreign_table', 'materialized_view'].includes(t.tableKind),
    )
    progress = { done: 0, total: searchable.length }

    // Fire ALL in parallel — no batching
    const promises = searchable.map(async (t) => {
      try {
        const res = await getTableRows(schema, t.name, 1, 0, { search: q })
        if (searchGeneration !== gen) return null
        progress = { done: progress.done + 1, total: progress.total }
        if (res.total > 0) {
          return /** @type {SearchHit} */ ({
            table: t.name,
            count: res.total,
            columns: res.columns ?? [],
            sampleRow: res.rows?.[0] ?? null,
            tableKind: t.tableKind,
          })
        }
      } catch {
        /* ignore per-table errors */
      }
      progress = { done: progress.done + 1, total: progress.total }
      return null
    })

    const all = await Promise.all(promises)
    if (searchGeneration !== gen) return

    results = /** @type {SearchHit[]} */ (all.filter(Boolean)).sort((a, b) => b.count - a.count)
    searched = true
    searching = false
  }

  /** @param {unknown} v */
  function displayValue(v) {
    if (v === null || v === undefined) return 'NULL'
    if (typeof v === 'object') {
      const s = JSON.stringify(v)
      return s.length > 40 ? s.slice(0, 40) + '…' : s
    }
    const s = String(v)
    return s.length > 40 ? s.slice(0, 40) + '…' : s
  }

  const tableIcon = (/** @type {string | undefined} */ kind) =>
    kind === 'view' || kind === 'materialized_view' ? Eye : Table2
</script>

<div class="flex h-full min-h-0 flex-col">
  <!-- Top bar -->
  <div class="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
    <Search class="size-4 shrink-0 text-muted-foreground/60" />
    <input
      bind:this={inputEl}
      type="text"
      placeholder="Search across all tables in {schema}…"
      class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/30"
      bind:value={query}
      onkeydown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          void runSearch()
        }
      }}
    />
    {#if searching}
      <Loader class="size-4 shrink-0 animate-spin text-muted-foreground/40" />
    {:else}
      <button
        type="button"
        class="h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
        disabled={!query.trim()}
        onclick={() => void runSearch()}
      >
        Search
      </button>
    {/if}
  </div>

  <!-- Progress bar -->
  {#if searching}
    <div class="shrink-0 border-b border-border/30 px-3 py-2">
      <div class="mb-1.5 flex items-center justify-between">
        <span class="text-xs text-muted-foreground/60">
          Searching {progress.done} / {progress.total} tables…
        </span>
        {#if results.length > 0}
          <span class="text-xs text-muted-foreground/60">{results.length} with matches</span>
        {/if}
      </div>
      <div class="h-0.5 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full bg-primary transition-all duration-300"
          style="width: {progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%"
        ></div>
      </div>
    </div>
  {/if}

  <!-- Results area -->
  <div class="flex-1 overflow-y-auto">
    {#if results.length > 0}
      <div class="divide-y divide-border/20">
        {#each results as hit (hit.table)}
          {@const Icon = tableIcon(hit.tableKind)}
          <button
            type="button"
            class="flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
            onclick={() => onopentable(hit.table, query.trim())}
          >
            <div class="flex min-w-0 items-center gap-2">
              <Icon class="size-3.5 shrink-0 text-muted-foreground/50" />
              <span class="font-mono text-sm font-medium">{hit.table}</span>
              <span class="ml-auto shrink-0 text-xs font-medium text-primary tabular-nums">
                {hit.count.toLocaleString()} {hit.count === 1 ? 'match' : 'matches'}
              </span>
              <ArrowRight class="size-3.5 shrink-0 text-muted-foreground/30" />
            </div>
            {#if hit.sampleRow && hit.columns.length > 0}
              <div class="ml-5 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                {#each hit.columns.slice(0, 5) as col, ci (col.name)}
                  {@const val = hit.sampleRow[ci]}
                  <div class="flex min-w-0 items-baseline gap-1">
                    <span class="shrink-0 text-[10px] text-muted-foreground/40">{col.name}</span>
                    <span
                      class={cn(
                        'max-w-[160px] truncate font-mono text-[11px]',
                        val === null || val === undefined
                          ? 'italic text-muted-foreground/30'
                          : 'text-muted-foreground/70',
                      )}
                    >
                      {displayValue(val)}
                    </span>
                  </div>
                {/each}
              </div>
            {/if}
          </button>
        {/each}
      </div>
    {:else if searched && !searching}
      <div class="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <Search class="size-8 text-muted-foreground/15" />
        <p class="text-sm text-muted-foreground/50">
          No matches for <span class="font-mono">"{query}"</span>
        </p>
        <p class="text-xs text-muted-foreground/30">
          Searched {progress.total} table{progress.total === 1 ? '' : 's'}
        </p>
      </div>
    {:else if !searching}
      <div class="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <Search class="size-8 text-muted-foreground/15" />
        <p class="text-sm text-muted-foreground/40">
          Search across all {tables.length} tables
        </p>
        <p class="text-xs text-muted-foreground/30">Type a value and press Enter</p>
      </div>
    {/if}
  </div>

  {#if searched && !searching && results.length > 0}
    <div class="shrink-0 border-t border-border/30 px-4 py-2 text-xs text-muted-foreground/40">
      {results.length} table{results.length === 1 ? '' : 's'} with matches · click to open with search pre-filled
    </div>
  {/if}
</div>
