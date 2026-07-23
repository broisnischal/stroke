<script>
  import { getTableRows } from '$lib/api.js'
  import { buildSearchQuery, searchOptionsSupported } from '$lib/search-options.js'
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
    dialect = 'postgres',
    active = false,
    /** @param {string} tableName @param {string} searchTerm */
    onopentable = (tableName, searchTerm) => {},
  } = $props()

  let query = $state('')
  let useRegex = $state(false)
  let matchCase = $state(false)
  let wholeWord = $state(false)
  const optionsSupported = $derived(searchOptionsSupported(dialect))
  /** @type {SearchHit[]} */
  let results = $state([])
  let searching = $state(false)
  let searched = $state(false)
  let progress = $state({ done: 0, total: 0 })
  let searchGeneration = 0
  let regexError = $state('')
  /** @type {HTMLInputElement | null} */
  let inputEl = $state(null)

  $effect(() => {
    if (active && inputEl) {
      // Small delay so the tab transition finishes before focusing
      setTimeout(() => inputEl?.focus(), 30)
    }
  })

  function validateRegex(/** @type {string} */ pattern) {
    try {
      new RegExp(pattern)
      return ''
    } catch (e) {
      return e instanceof Error ? e.message : 'Invalid regex'
    }
  }

  async function runSearch() {
    const q = query.trim()
    if (!q || searching) return

    if (useRegex && optionsSupported) {
      const err = validateRegex(q)
      if (err) { regexError = err; return }
    }
    regexError = ''
    const searchParams = buildSearchQuery(q, { matchCase, wholeWord, regex: useRegex }, optionsSupported)

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

    // Run with concurrency cap to avoid overwhelming the DB connection pool.
    // Results stream in as each table finishes.
    const CONCURRENCY = 10

    let index = 0
    async function worker() {
      while (index < searchable.length) {
        const t = searchable[index++]
        if (!t) continue
        try {
          const res = await getTableRows(schema, t.name, 1, 0, {
            ...searchParams,
            includeMeta: false,
          })
          if (searchGeneration !== gen) return
          if (res.total > 0) {
            results = [...results, /** @type {SearchHit} */ ({
              table: t.name,
              count: res.total,
              columns: res.columns ?? [],
              sampleRow: res.rows?.[0] ?? null,
              tableKind: t.tableKind,
            })].sort((a, b) => b.count - a.count)
          }
        } catch {
          /* ignore per-table errors */
        }
        if (searchGeneration === gen) {
          progress = { done: progress.done + 1, total: progress.total }
        }
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, searchable.length) }, worker)
    await Promise.all(workers)
    if (searchGeneration !== gen) return

    searched = true
    searching = false
  }

  function handleKeydown(/** @type {KeyboardEvent} */ e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void runSearch()
    }
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

  const progressPct = $derived(
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  )
</script>

<div class="flex h-full min-h-0 flex-col">
  <!-- Search bar -->
  <div class="shrink-0 border-b border-border/50 px-3 py-2">
    <div
      class={cn(
        'flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 transition-colors',
        regexError ? 'border-destructive/50' : 'border-border/40 focus-within:border-border',
      )}
    >
      <Search class="size-3.5 shrink-0 text-muted-foreground/50" />
      <input
        bind:this={inputEl}
        type="text"
        placeholder={useRegex ? 'Regex pattern…' : `Search across all tables in ${schema}…`}
        class="min-w-0 flex-1 bg-transparent text-ui-sm outline-none placeholder:text-muted-foreground/30"
        bind:value={query}
        onkeydown={handleKeydown}
        oninput={() => { regexError = '' }}
        spellcheck="false"
        autocomplete="off"
      />
      <!-- VS Code-style option toggles (Postgres regex path only) -->
      {#if optionsSupported}
        <button
          type="button"
          title="Match case"
          aria-pressed={matchCase}
          class={cn(
            'flex size-6 shrink-0 items-center justify-center rounded text-ui-xs font-mono transition-colors',
            matchCase
              ? 'bg-primary/15 text-primary ring-1 ring-inset ring-primary/30'
              : 'text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground',
          )}
          onclick={() => (matchCase = !matchCase)}
        >Aa</button>
        <button
          type="button"
          title="Match whole word"
          aria-pressed={wholeWord}
          class={cn(
            'flex size-6 shrink-0 items-center justify-center rounded text-ui-xs font-mono transition-colors',
            wholeWord
              ? 'bg-primary/15 text-primary ring-1 ring-inset ring-primary/30'
              : 'text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground',
          )}
          onclick={() => (wholeWord = !wholeWord)}
        ><span class="underline underline-offset-2">ab</span></button>
        <button
          type="button"
          title="Use regular expression"
          aria-pressed={useRegex}
          class={cn(
            'flex size-6 shrink-0 items-center justify-center rounded text-ui-xs font-mono transition-colors',
            useRegex
              ? 'bg-primary/15 text-primary ring-1 ring-inset ring-primary/30'
              : 'text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground',
          )}
          onclick={() => { useRegex = !useRegex; regexError = '' }}
        >.*</button>
      {/if}
      {#if searching}
        <Loader class="size-3.5 shrink-0 animate-spin text-muted-foreground/40" />
      {:else}
        <button
          type="button"
          class="h-6 rounded bg-primary px-2.5 text-ui-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
          disabled={!query.trim()}
          onclick={() => void runSearch()}
        >
          Search
        </button>
      {/if}
    </div>
    {#if regexError}
      <p class="mt-1 px-1 text-ui-xs text-destructive/80">{regexError}</p>
    {/if}
  </div>

  <!-- Progress bar (only while searching) -->
  {#if searching}
    <div class="shrink-0 border-b border-border/30 px-3 py-2">
      <div class="mb-1.5 flex items-center justify-between text-ui-xs text-muted-foreground/50">
        <span>{progress.done} / {progress.total} tables searched</span>
        {#if results.length > 0}
          <span class="text-primary/70">{results.length} with matches</span>
        {/if}
      </div>
      <div class="h-0.5 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full bg-primary transition-[width] duration-150"
          style="width: {progressPct}%"
        ></div>
      </div>
    </div>
  {/if}

  <!-- Results -->
  <div class="flex-1 overflow-y-auto">
    {#if results.length > 0}
      <div class="divide-y divide-border/20">
        {#each results as hit (hit.table)}
          {@const Icon = tableIcon(hit.tableKind)}
          <button
            type="button"
            class="flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
            onclick={() => onopentable(hit.table, query.trim())}
          >
            <div class="flex min-w-0 items-center gap-2">
              <Icon class="size-3.5 shrink-0 text-muted-foreground/40" />
              <span class="flex-1 truncate font-mono text-ui-sm font-medium">{hit.table}</span>
              <span class="shrink-0 text-ui-xs font-medium text-primary/80 tabular-nums">
                {hit.count.toLocaleString()} {hit.count === 1 ? 'match' : 'matches'}
              </span>
              <ArrowRight class="size-3.5 shrink-0 text-muted-foreground/25" />
            </div>
            {#if hit.sampleRow && hit.columns.length > 0}
              <div class="ml-5 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                {#each hit.columns.slice(0, 5) as col, ci (col.name)}
                  {@const val = hit.sampleRow[ci]}
                  <div class="flex min-w-0 items-baseline gap-1">
                    <span class="shrink-0 text-ui-3xs text-muted-foreground/35">{col.name}</span>
                    <span
                      class={cn(
                        'max-w-[160px] truncate font-mono text-ui-2xs',
                        val === null || val === undefined
                          ? 'italic text-muted-foreground/25'
                          : 'text-muted-foreground/60',
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
    {:else if searching && progress.done === 0}
      <!-- initial loading state before first result -->
      <div class="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <Loader class="size-6 animate-spin text-muted-foreground/20" />
        <p class="text-ui-xs text-muted-foreground/40">Searching…</p>
      </div>
    {:else if searched && !searching}
      <div class="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <Search class="size-8 text-muted-foreground/15" />
        <p class="text-ui-sm text-muted-foreground/50">
          No matches for <span class="font-mono">"{query}"</span>
        </p>
        <p class="text-ui-xs text-muted-foreground/30">
          Searched {progress.total} table{progress.total === 1 ? '' : 's'}
        </p>
      </div>
    {:else if !searching}
      <div class="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <Search class="size-8 text-muted-foreground/12" />
        <p class="text-ui-sm text-muted-foreground/40">Search across all {tables.length} tables</p>
        <p class="text-ui-xs text-muted-foreground/25">Type a value and press <kbd>Enter</kbd></p>
      </div>
    {/if}
  </div>

  {#if searched && !searching && results.length > 0}
    <div class="shrink-0 border-t border-border/30 px-4 py-1.5 text-ui-xs text-muted-foreground/35">
      {results.length} table{results.length === 1 ? '' : 's'} with matches · click to open with search pre-filled
    </div>
  {/if}
</div>
