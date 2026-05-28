<script>
  import { onDestroy } from 'svelte'
  import History from '@lucide/svelte/icons/history'
  import Bookmark from '@lucide/svelte/icons/bookmark'
  import PanelLeft from '@lucide/svelte/icons/panel-left'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import Search from '@lucide/svelte/icons/search'
  import X from '@lucide/svelte/icons/x'
  import { cn } from '$lib/utils.js'
  import {
    clearQueryHistory,
    deleteQueryHistoryEntry,
    deleteSavedQuery,
  } from '$lib/stores/query-history.js'

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
  } = $props()

  /** @type {'history' | 'saved'} */
  let tab = $state('history')
  let filter = $state('')

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
</script>

{#if visible}
  <aside class="flex w-60 shrink-0 flex-col border-r border-border bg-panel">
    <div class="flex flex-col gap-2 border-b border-border px-2.5 py-2.5">
      <div class="flex items-center justify-between gap-2 px-0.5">
        <span class="text-ui-xs font-semibold text-foreground">Queries</span>
        <button
          type="button"
          class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          title="Hide query history"
          onclick={onclose}
        >
          <PanelLeft class="size-3.5" />
        </button>
      </div>

      <div class="relative">
        <Search class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          bind:value={filter}
          placeholder="Search queries…"
          class="h-8 w-full rounded-md border border-border/80 bg-background py-1 pl-7 pr-7 font-mono text-ui-xs text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {#if filter}
          <button
            type="button"
            class="absolute right-1.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
            onclick={() => (filter = '')}
          >
            <X class="size-3" />
          </button>
        {/if}
      </div>

      <div class="flex gap-0.5 rounded-md border border-border/80 bg-muted/30 p-0.5">
        <button
          type="button"
          class={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-ui-xs transition-colors',
            tab === 'history'
              ? 'bg-background font-medium text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onclick={() => (tab = 'history')}
        >
          <History class="size-3 shrink-0" />
          History
        </button>
        <button
          type="button"
          class={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-ui-xs transition-colors',
            tab === 'saved'
              ? 'bg-background font-medium text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onclick={() => (tab = 'saved')}
        >
          <Bookmark class="size-3 shrink-0" />
          Saved
        </button>
      </div>
    </div>

    <div class="app-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5 [will-change:transform]">
      {#if tab === 'history'}
        {#each filteredHistory as entry (entry.id)}
          <div class="group relative flex items-stretch">
            <button
              type="button"
              class="relative flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-2 pr-8 text-left transition-colors hover:bg-accent/35"
              onclick={() => onselect(entry.sql)}
            >
              <History class="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />
              <div class="min-w-0 flex-1">
                <span class="block truncate font-mono text-ui-xs font-medium leading-snug text-foreground">
                  {entry.title}
                </span>
                <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span>{relativeTime(entry.executedAt)}</span>
                  {#if entry.queryMs}
                    <span class="tabular-nums">{entry.queryMs}ms</span>
                  {/if}
                </span>
              </div>
            </button>
            <button
              type="button"
              class="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[opacity,color] hover:text-destructive group-hover:opacity-100"
              title="Remove from history"
              onclick={(e) => {
                e.stopPropagation()
                void removeHistory(entry.id)
              }}
            >
              <Trash2 class="size-3" />
            </button>
          </div>
        {:else}
          <div class="flex flex-col items-center gap-2 px-3 py-8 text-center">
            <History class="size-7 text-muted-foreground/25" />
            <p class="text-[11px] leading-relaxed text-muted-foreground/70">
              {filter ? 'No matching queries' : 'No query history yet'}
            </p>
            {#if !filter}
              <p class="text-[10px] leading-relaxed text-muted-foreground/50">
                Run SQL to record statements ({modKey}↵)
              </p>
            {/if}
          </div>
        {/each}

        {#if history.length > 0 && !filter}
          <button
            type="button"
            class="mt-1 w-full rounded-md px-2 py-1.5 text-center text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onclick={() => void clearAllHistory()}
          >
            Clear history
          </button>
        {/if}
      {:else}
        {#each filteredSaved as entry (entry.id)}
          <div class="group relative flex items-stretch">
            <button
              type="button"
              class="relative flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-2 pr-8 text-left transition-colors hover:bg-accent/35"
              onclick={() => onselect(entry.sql)}
            >
              <Bookmark class="mt-0.5 size-3.5 shrink-0 text-primary/70" />
              <div class="min-w-0 flex-1">
                <span class="block truncate text-ui-xs font-medium leading-snug text-foreground">
                  {entry.name}
                </span>
                <span class="text-[10px] text-muted-foreground">{relativeTime(entry.updatedAt)}</span>
              </div>
            </button>
            <button
              type="button"
              class="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[opacity,color] hover:text-destructive group-hover:opacity-100"
              title="Delete saved query"
              onclick={(e) => {
                e.stopPropagation()
                void removeSaved(entry.id)
              }}
            >
              <Trash2 class="size-3" />
            </button>
          </div>
        {:else}
          <div class="flex flex-col items-center gap-2 px-3 py-8 text-center">
            <Bookmark class="size-7 text-muted-foreground/25" />
            <p class="text-[11px] leading-relaxed text-muted-foreground/70">
              {filter ? 'No matching saved queries' : 'No saved queries'}
            </p>
            {#if !filter}
              <p class="text-[10px] leading-relaxed text-muted-foreground/50">
                Use Save in the SQL toolbar
              </p>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </aside>
{/if}
