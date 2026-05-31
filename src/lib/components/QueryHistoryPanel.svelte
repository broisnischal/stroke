<script>
  import { onDestroy } from 'svelte'
  import History from '@lucide/svelte/icons/history'
  import Bookmark from '@lucide/svelte/icons/bookmark'
  import PanelLeft from '@lucide/svelte/icons/panel-left'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import Search from '@lucide/svelte/icons/search'
  import X from '@lucide/svelte/icons/x'
  import BarChart2 from '@lucide/svelte/icons/bar-chart-2'
  import { cn } from '$lib/utils.js'
  import {
    clearQueryHistory,
    deleteQueryHistoryEntry,
    deleteSavedQuery,
  } from '$lib/stores/query-history.js'
  import { savedCharts } from '$lib/stores/saved-charts.js'

  /** @typedef {import('$lib/stores/query-history.js').QueryHistoryEntry} QueryHistoryEntry */
  /** @typedef {import('$lib/stores/query-history.js').SavedQuery} SavedQuery */

  let {
    visible = $bindable(true),
    /** @type {QueryHistoryEntry[]} */
    history = [],
    /** @type {SavedQuery[]} */
    saved = [],
    /** @param {string} sql */
    onselect = (sql) => {},
    onrefresh = async () => {},
    onclose = () => {},
    onopenchart = /** @type {(chartId: string) => void} */ ((_id) => {}),
  } = $props()

  /** @type {'history' | 'saved' | 'charts'} */
  let tab = $state('history')
  let filter = $state('')
  let filterEl = $state(/** @type {HTMLInputElement | null} */ (null))

  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)
  const modKey = isMac ? '⌘' : 'Ctrl'

  let now = $state(Date.now())
  const ticker = setInterval(() => { now = Date.now() }, 30_000)
  onDestroy(() => clearInterval(ticker))

  /** @param {number} ts */
  function relativeTime(ts) {
    const diff = now - ts
    const sec = Math.floor(diff / 1000)
    if (sec < 60) return 'just now'
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min}m ago`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr}h ago`
    const day = Math.floor(hr / 24)
    if (day < 7) return `${day}d ago`
    return new Date(ts).toLocaleDateString()
  }

  const filteredHistory = $derived.by(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return history
    return history.filter(
      (e) => e.title.toLowerCase().includes(q) || e.sql.toLowerCase().includes(q),
    )
  })

  const filteredSaved = $derived.by(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return saved
    return saved.filter(
      (e) => e.name.toLowerCase().includes(q) || e.sql.toLowerCase().includes(q),
    )
  })

  /** @param {string} id */
  async function removeHistory(id) {
    await deleteQueryHistoryEntry(id)
    await onrefresh()
  }

  /** @param {string} id */
  async function removeSaved(id) {
    await deleteSavedQuery(id)
    await onrefresh()
  }

  async function clearAllHistory() {
    const connId = history[0]?.connectionId
    if (!connId) return
    await clearQueryHistory(connId)
    await onrefresh()
  }

  /** @type {ReadonlyArray<{ id: 'history' | 'saved' | 'charts'; label: string; icon: typeof History }>} */
  const panelTabs = [
    { id: 'history', label: 'History', icon: History },
    { id: 'saved', label: 'Saved', icon: Bookmark },
    { id: 'charts', label: 'Charts', icon: BarChart2 },
  ]


</script>

<svelte:window onkeydown={(e) => {
  if (!visible) return
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === 'f') {
    e.preventDefault(); filterEl?.focus(); filterEl?.select()
  }
}} />

{#if visible}
  <aside class="flex w-56 shrink-0 flex-col border-r border-border bg-panel">

    <!-- Header row: title + close -->
    <div class="flex h-9 shrink-0 items-center justify-between border-b border-border pl-2 pr-2">
      <div class="flex h-full min-w-0 items-stretch">
        {#each panelTabs as t (t.id)}
          {@const Icon = t.icon}
          {@const active = tab === t.id}
          <button
            type="button"
            title={t.label}
            aria-current={active ? 'page' : undefined}
            onclick={() => (tab = t.id)}
            class={cn(
              'relative flex h-full shrink-0 items-center gap-1 px-1 transition-colors',
              active ? 'text-foreground' : 'text-muted-foreground/50 hover:text-muted-foreground',
            )}
          >
            {#if active}
              <span class="absolute inset-x-1 bottom-0 h-px bg-primary" aria-hidden="true"></span>
            {/if}
            <Icon class="size-3 shrink-0" aria-hidden="true" />
            <span class="text-[11px] font-normal leading-none">{t.label}</span>
          </button>
        {/each}
      </div>
      <button
        type="button"
        class="inline-flex size-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted/60 hover:text-foreground"
        title="Hide panel ({modKey}⇧B)"
        onclick={onclose}
      >
        <PanelLeft class="size-3.5" />
      </button>
    </div>

    <!-- Search -->
    <div class="relative border-b border-border/60 px-2 py-1.5">
      <Search class="pointer-events-none absolute left-3.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/50" />
      <input
        type="search"
        bind:this={filterEl}
        bind:value={filter}
        placeholder="Search…"
        class="h-6 w-full rounded border border-transparent bg-muted/40 py-0 pl-6 pr-5 font-mono text-ui-2xs text-foreground placeholder:text-muted-foreground/50 focus-visible:border-border focus-visible:bg-background focus-visible:outline-none"
      />
      {#if filter}
        <button
          type="button"
          class="absolute right-3 top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded text-muted-foreground/50 hover:text-foreground"
          aria-label="Clear"
          onclick={() => (filter = '')}
        >
          <X class="size-2.5" />
        </button>
      {/if}
    </div>

    <!-- List -->
    <div class="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto py-1 [will-change:transform]">
      {#if tab === 'history'}
        {#each filteredHistory as entry (entry.id)}
          <div class="group relative">
            <button
              type="button"
              class="flex w-full min-w-0 items-start gap-1.5 px-2.5 py-1.5 pr-7 text-left transition-colors hover:bg-accent/30"
              onclick={() => onselect(entry.sql)}
            >
              <History class="mt-px size-3 shrink-0 text-muted-foreground/40" />
              <div class="min-w-0 flex-1">
                <span class="block truncate font-mono text-ui-2xs leading-snug text-foreground/90">
                  {entry.title}
                </span>
                <span class="flex items-center gap-1 text-[10px] leading-tight text-muted-foreground/60">
                  <span>{relativeTime(entry.executedAt)}</span>
                  {#if entry.queryMs}
                    <span class="tabular-nums opacity-70">{entry.queryMs}ms</span>
                  {/if}
                </span>
              </div>
            </button>
            <button
              type="button"
              class="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/40 hover:!text-destructive"
              title="Remove"
              onclick={(e) => { e.stopPropagation(); void removeHistory(entry.id) }}
            >
              <Trash2 class="size-3" />
            </button>
          </div>
        {:else}
          <div class="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
            <History class="size-5 text-muted-foreground/20" />
            <p class="text-[11px] text-muted-foreground/60">
              {filter ? 'No matches' : 'No history yet'}
            </p>
            {#if !filter}
              <p class="text-[10px] text-muted-foreground/40">{modKey}↵ to run</p>
            {/if}
          </div>
        {/each}

        {#if history.length > 0 && !filter}
          <button
            type="button"
            class="mx-2 mt-1 rounded px-2 py-1 text-center text-[10px] text-muted-foreground/50 transition-colors hover:bg-muted/60 hover:text-foreground"
            onclick={() => void clearAllHistory()}
          >
            Clear all
          </button>
        {/if}

      {:else if tab === 'saved'}
        {#each filteredSaved as entry (entry.id)}
          <div class="group relative">
            <button
              type="button"
              class="flex w-full min-w-0 items-start gap-1.5 px-2.5 py-1.5 pr-7 text-left transition-colors hover:bg-accent/30"
              onclick={() => onselect(entry.sql)}
            >
              <Bookmark class="mt-px size-3 shrink-0 text-primary/50" />
              <div class="min-w-0 flex-1">
                <span class="block truncate text-ui-2xs leading-snug text-foreground/90">
                  {entry.name}
                </span>
                <span class="text-[10px] leading-tight text-muted-foreground/60">
                  {relativeTime(entry.updatedAt)}
                </span>
              </div>
            </button>
            <button
              type="button"
              class="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/40 hover:!text-destructive"
              title="Delete"
              onclick={(e) => { e.stopPropagation(); void removeSaved(entry.id) }}
            >
              <Trash2 class="size-3" />
            </button>
          </div>
        {:else}
          <div class="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
            <Bookmark class="size-5 text-muted-foreground/20" />
            <p class="text-[11px] text-muted-foreground/60">
              {filter ? 'No matches' : 'No saved queries'}
            </p>
            {#if !filter}
              <p class="text-[10px] text-muted-foreground/40">{modKey}S to save</p>
            {/if}
          </div>
        {/each}
      {:else}
        {#each $savedCharts as chart (chart.id)}
          <div class="group relative">
            <button
              type="button"
              class="flex w-full min-w-0 items-start gap-1.5 px-2.5 py-1.5 text-left transition-colors hover:bg-accent/30"
              onclick={() => onselect(chart.sql)}
            >
              <BarChart2 class="mt-px size-3 shrink-0 text-muted-foreground/40" />
              <div class="min-w-0 flex-1">
                <span class="block truncate text-ui-2xs leading-snug text-foreground/90">
                  {chart.name}
                </span>
                <span class="text-[10px] leading-tight text-muted-foreground/60">
                  {chart.group}
                </span>
              </div>
            </button>
          </div>
        {:else}
          <div class="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
            <BarChart2 class="size-5 text-muted-foreground/20" />
            <p class="text-[11px] text-muted-foreground/60">No saved charts yet</p>
          </div>
        {/each}
      {/if}
    </div>
  </aside>
{/if}
