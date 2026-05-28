<script>
  import Zap from '@lucide/svelte/icons/zap'
  import Tags from '@lucide/svelte/icons/tags'
  import Eye from '@lucide/svelte/icons/eye'
  import Layers from '@lucide/svelte/icons/layers'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import Search from '@lucide/svelte/icons/search'
  import { Button } from '$lib/components/ui/button/index.js'
  import { cn } from '$lib/utils.js'

  let {
    /** @type {{ name: string, tableName: string, columns?: string, isUnique?: boolean, isPrimary?: boolean, indexType?: string }[]} */
    indexes = [],
    /** @type {{ name: string, values: string[] }[]} */
    enums = [],
    /** @type {{ name: string, kind?: string }[]} */
    tables = [],
    loading = false,
    active = false,
    onrefresh = () => {},
  } = $props()

  /** @type {'indexes' | 'enums' | 'views' | 'matviews'} */
  let activeType = $state('indexes')
  let filter = $state('')

  const views = $derived(tables.filter((t) => t.kind === 'view'))
  const matViews = $derived(tables.filter((t) => t.kind === 'materialized_view'))

  const lf = $derived(filter.toLowerCase())

  const filteredIndexes = $derived(
    indexes.filter(
      (i) => !lf || i.name.toLowerCase().includes(lf) || i.tableName.toLowerCase().includes(lf),
    ),
  )
  const filteredEnums = $derived(
    enums.filter((e) => !lf || e.name.toLowerCase().includes(lf)),
  )
  const filteredViews = $derived(
    views.filter((v) => !lf || v.name.toLowerCase().includes(lf)),
  )
  const filteredMatViews = $derived(
    matViews.filter((v) => !lf || v.name.toLowerCase().includes(lf)),
  )

  const tabs = [
    { id: 'indexes', label: 'Indexes', icon: Zap },
    { id: 'enums', label: 'Enums', icon: Tags },
    { id: 'views', label: 'Views', icon: Eye },
    { id: 'matviews', label: 'Materialized Views', icon: Layers },
  ]

  const activeCount = $derived(
    activeType === 'indexes' ? indexes.length
    : activeType === 'enums' ? enums.length
    : activeType === 'views' ? views.length
    : matViews.length
  )
</script>

<svelte:window onkeydown={(e) => {
  if (!active) return
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === 'r') {
    e.preventDefault(); onrefresh()
  }
}} />

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <!-- Toolbar -->
  <div class="studio-chrome flex h-9 shrink-0 items-center gap-2 border-b border-border bg-panel px-3" data-studio-chrome>
    <span class="font-mono text-ui-sm font-medium">Schema Explorer</span>
    {#if activeCount > 0}
      <span class="font-mono text-ui-xs text-muted-foreground">({activeCount})</span>
    {/if}
    <div class="ml-auto flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
        disabled={loading}
        title="Refresh"
        onclick={onrefresh}
      >
        <RefreshCw class={cn('size-3.5', loading && 'animate-spin')} />
        <span class="text-ui-xs">Refresh</span>
      </Button>
    </div>
  </div>

  <!-- Type selector + filter bar -->
  <div class="flex shrink-0 items-center gap-3 border-b border-border bg-panel/60 px-3 py-2">
    <div class="inline-flex h-7 shrink-0 items-center rounded-md border border-border/60 bg-muted/40 p-0.5 ring-1 ring-inset ring-border/40">
      {#each tabs as tab (tab.id)}
        {@const Icon = tab.icon}
        <button
          type="button"
          class={cn(
            'inline-flex h-6 items-center gap-1.5 rounded-[5px] px-2.5 text-ui-2xs font-medium transition-all',
            activeType === tab.id
              ? 'bg-card text-foreground shadow-sm ring-1 ring-border/50'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onclick={() => { activeType = /** @type {any} */ (tab.id); filter = '' }}
        >
          <Icon class="size-3 shrink-0" />
          {tab.label}
        </button>
      {/each}
    </div>

    <div class="relative min-w-0 flex-1">
      <Search class="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
      <input
        type="search"
        placeholder="Filter…"
        bind:value={filter}
        class="h-7 w-full rounded-md border border-border bg-background/40 pl-7 pr-2.5 text-ui-xs text-foreground outline-none transition-colors hover:bg-background/60 focus:border-ring focus:ring-1 focus:ring-ring/30"
      />
    </div>
  </div>

  <!-- Content -->
  <div class="app-scroll min-h-0 flex-1 overflow-y-auto p-4 [will-change:transform]">

    <!-- ── Indexes ── -->
    {#if activeType === 'indexes'}
      {#if indexes.length === 0}
        <div class="flex h-full flex-col items-center justify-center gap-3 text-center">
          <Zap class="size-10 text-muted-foreground/20" />
          <div>
            <p class="font-mono text-ui text-muted-foreground">No indexes</p>
            <p class="mt-1 text-ui-xs text-muted-foreground/60">Indexes in this schema will appear here</p>
          </div>
        </div>
      {:else if filteredIndexes.length === 0}
        <p class="text-center text-ui-xs text-muted-foreground/60 py-8">No indexes match "{filter}"</p>
      {:else}
        <div class="flex flex-col gap-2">
          {#each filteredIndexes as idx (idx.name)}
            <div class="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
              <Zap class="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
              <div class="min-w-0 flex-1">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="min-w-0 truncate font-mono text-ui-sm font-medium">{idx.name}</span>
                  {#if idx.isPrimary}
                    <span class="shrink-0 rounded px-1.5 py-px text-ui-3xs font-medium bg-primary/10 text-primary">PK</span>
                  {:else if idx.isUnique}
                    <span class="shrink-0 rounded px-1.5 py-px text-ui-3xs font-medium bg-muted text-muted-foreground">UNIQUE</span>
                  {/if}
                  {#if idx.indexType && idx.indexType !== 'btree'}
                    <span class="shrink-0 font-mono text-ui-2xs text-muted-foreground/50 uppercase">{idx.indexType}</span>
                  {/if}
                </div>
                <div class="mt-1 flex items-center gap-1.5">
                  <span class="text-ui-xs text-muted-foreground/70">on</span>
                  <span class="font-mono text-ui-xs text-muted-foreground">{idx.tableName}</span>
                  {#if idx.columns}
                    <span class="text-muted-foreground/40">·</span>
                    <span class="min-w-0 truncate font-mono text-ui-xs text-muted-foreground/60">{idx.columns}</span>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}

    <!-- ── Enums ── -->
    {:else if activeType === 'enums'}
      {#if enums.length === 0}
        <div class="flex h-full flex-col items-center justify-center gap-3 text-center">
          <Tags class="size-10 text-muted-foreground/20" />
          <div>
            <p class="font-mono text-ui text-muted-foreground">No enum types</p>
            <p class="mt-1 text-ui-xs text-muted-foreground/60">Enum types defined in this schema will appear here</p>
          </div>
        </div>
      {:else if filteredEnums.length === 0}
        <p class="text-center text-ui-xs text-muted-foreground/60 py-8">No enums match "{filter}"</p>
      {:else}
        <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))">
          {#each filteredEnums as e (e.name)}
            <div class="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
              <div class="flex items-center gap-2">
                <Tags class="size-4 shrink-0 text-muted-foreground/60" />
                <span class="min-w-0 truncate font-mono text-ui-sm font-medium">{e.name}</span>
                <span class="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-ui-2xs text-muted-foreground">
                  {e.values.length}
                </span>
              </div>
              {#if e.values.length > 0}
                <div class="flex flex-wrap gap-1.5 border-t border-border pt-2">
                  {#each e.values as val (val)}
                    <span class="rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono text-ui-xs text-foreground">
                      {val}
                    </span>
                  {/each}
                </div>
              {:else}
                <p class="border-t border-border pt-2 text-ui-xs text-muted-foreground/50">No values</p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

    <!-- ── Views ── -->
    {:else if activeType === 'views'}
      {#if views.length === 0}
        <div class="flex h-full flex-col items-center justify-center gap-3 text-center">
          <Eye class="size-10 text-muted-foreground/20" />
          <div>
            <p class="font-mono text-ui text-muted-foreground">No views</p>
            <p class="mt-1 text-ui-xs text-muted-foreground/60">Views in this schema will appear here</p>
          </div>
        </div>
      {:else if filteredViews.length === 0}
        <p class="text-center text-ui-xs text-muted-foreground/60 py-8">No views match "{filter}"</p>
      {:else}
        <div class="flex flex-col gap-2">
          {#each filteredViews as view (view.name)}
            <div class="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
              <Eye class="size-4 shrink-0 text-muted-foreground/50" />
              <span class="min-w-0 truncate font-mono text-ui-sm font-medium">{view.name}</span>
            </div>
          {/each}
        </div>
      {/if}

    <!-- ── Materialized Views ── -->
    {:else if activeType === 'matviews'}
      {#if matViews.length === 0}
        <div class="flex h-full flex-col items-center justify-center gap-3 text-center">
          <Layers class="size-10 text-muted-foreground/20" />
          <div>
            <p class="font-mono text-ui text-muted-foreground">No materialized views</p>
            <p class="mt-1 text-ui-xs text-muted-foreground/60">Materialized views in this schema will appear here</p>
          </div>
        </div>
      {:else if filteredMatViews.length === 0}
        <p class="text-center text-ui-xs text-muted-foreground/60 py-8">No materialized views match "{filter}"</p>
      {:else}
        <div class="flex flex-col gap-2">
          {#each filteredMatViews as mv (mv.name)}
            <div class="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
              <Layers class="size-4 shrink-0 text-muted-foreground/50" />
              <span class="min-w-0 truncate font-mono text-ui-sm font-medium">{mv.name}</span>
              {#if mv.rowCount != null}
                <span class="ml-auto shrink-0 font-mono text-ui-2xs text-muted-foreground/60">{mv.rowCount.toLocaleString()}</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>
