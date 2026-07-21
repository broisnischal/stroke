<script>
  import { onMount } from 'svelte'
  import { cn } from '$lib/utils.js'
  import { subscribeQueryLog, clearQueryLog } from '$lib/stores/query-log.js'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import X from '@lucide/svelte/icons/x'
  import Terminal from '@lucide/svelte/icons/terminal'

  let {
    activeSchema = '',
    activeTable = '',
    onclose = () => {},
  } = $props()

  /** @type {import('$lib/stores/query-log.js').QueryLogEntry[]} */
  let entries = $state([])
  let scope = $state(/** @type {'all' | 'table'} */ ('all'))

  onMount(() => subscribeQueryLog((e) => { entries = e }))

  const visible = $derived.by(() => {
    if (scope === 'all' || !activeTable) return entries
    return entries.filter((e) => e.table === activeTable && (!activeSchema || e.schema === activeSchema))
  })

  // ── Resizable height (persisted) ────────────────────────────────────────────
  const H_MIN = 120, H_MAX = 640
  let height = $state((() => {
    try { const n = Number(localStorage.getItem('stroke:query-log-height')); return n >= H_MIN && n <= H_MAX ? n : 240 } catch { return 240 }
  })())
  /** @param {PointerEvent} e */
  function startResize(e) {
    e.preventDefault()
    const startY = e.clientY, startH = height
    const move = (/** @type {PointerEvent} */ ev) => { height = Math.min(H_MAX, Math.max(H_MIN, startH + (startY - ev.clientY))) }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      try { localStorage.setItem('stroke:query-log-height', String(Math.round(height))) } catch {}
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  // ── Lightweight SQL highlighter ─────────────────────────────────────────────
  const KEYWORDS = new Set(('SELECT FROM WHERE ORDER BY GROUP HAVING LIMIT OFFSET INSERT INTO VALUES UPDATE SET DELETE JOIN LEFT RIGHT INNER OUTER FULL CROSS ON USING AS AND OR NOT NULL IS IN LIKE ILIKE BETWEEN CASE WHEN THEN ELSE END UNION ALL DISTINCT ASC DESC CREATE TABLE ALTER DROP INDEX VIEW PRIMARY KEY FOREIGN REFERENCES DEFAULT UNIQUE CHECK CONSTRAINT WITH RETURNING EXISTS PRAGMA BEGIN COMMIT ROLLBACK EXPLAIN ANALYZE').split(' '))
  const FUNCS = new Set('COUNT SUM AVG MIN MAX COALESCE CAST LOWER UPPER LENGTH NOW STRFTIME DATE_FORMAT CONCAT ROUND ABS'.split(' '))
  const esc = (/** @type {string} */ s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  /** @param {string} sql */
  function highlight(sql) {
    const re = /('(?:[^']|'')*')|("(?:[^"]|"")*"|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|([^\sA-Za-z0-9_'"`]+)/g
    let out = '', m
    while ((m = re.exec(sql))) {
      if (m[1]) out += `<span class="ql-str">${esc(m[1])}</span>`
      else if (m[2]) out += `<span class="ql-id">${esc(m[2])}</span>`
      else if (m[3]) out += `<span class="ql-num">${esc(m[3])}</span>`
      else if (m[4]) {
        const up = m[4].toUpperCase()
        if (KEYWORDS.has(up)) out += `<span class="ql-kw">${esc(m[4])}</span>`
        else if (FUNCS.has(up)) out += `<span class="ql-fn">${esc(m[4])}</span>`
        else out += esc(m[4])
      } else out += esc(m[0])
    }
    return out
  }

  /** @param {number} ts */
  function fmtTime(ts) {
    try { return new Date(ts).toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' }) }
    catch { return '' }
  }
</script>

<div class="relative flex shrink-0 flex-col border-t border-border bg-panel" style="height:{height}px">
  <!-- Resize handle -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    role="separator"
    aria-orientation="horizontal"
    aria-label="Resize query log"
    class="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize"
    onpointerdown={startResize}
  ></div>

  <!-- Header -->
  <div class="flex h-9 shrink-0 items-center gap-2 border-b border-border/50 px-3">
    <Terminal class="size-3.5 shrink-0 text-muted-foreground/50" />
    <span class="text-ui-xs font-medium text-foreground/80">Query log</span>
    <div class="ml-1 inline-flex h-6 items-center rounded-md border border-border/60 bg-muted/30 p-px">
      <button type="button" class={cn('h-full rounded px-2 text-ui-2xs font-medium transition-colors', scope === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground/60 hover:text-foreground')} onclick={() => (scope = 'all')}>All</button>
      <button type="button" disabled={!activeTable} class={cn('h-full rounded px-2 text-ui-2xs font-medium transition-colors disabled:opacity-40', scope === 'table' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground/60 hover:text-foreground')} onclick={() => (scope = 'table')}>This table</button>
    </div>
    <span class="text-ui-2xs text-muted-foreground/35">{visible.length} {visible.length === 1 ? 'query' : 'queries'}</span>
    <div class="ml-auto flex items-center gap-0.5">
      <button type="button" class="inline-flex h-6 items-center gap-1 rounded-md px-2 text-ui-2xs text-muted-foreground/60 transition-colors hover:bg-muted/50 hover:text-foreground" onclick={() => clearQueryLog()} title="Clear the query log">
        <Trash2 class="size-3" /> Clear
      </button>
      <button type="button" class="flex size-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground" onclick={onclose} aria-label="Close query log">
        <X class="size-3.5" />
      </button>
    </div>
  </div>

  <!-- Log list -->
  <div class="app-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2">
    {#if visible.length === 0}
      <div class="flex h-full flex-col items-center justify-center gap-1.5 text-center">
        <Terminal class="size-4 text-muted-foreground/20" />
        <p class="text-ui-xs text-muted-foreground/40">No queries yet — browse a table or run SQL.</p>
      </div>
    {:else}
      {#each visible as e (e.id)}
        <div class="border-b border-border/15 py-2 last:border-b-0">
          <div class="mb-1 flex items-center gap-2 font-mono text-ui-3xs text-muted-foreground/45">
            <span>[{fmtTime(e.timestamp)}]</span>
            {#if e.durationMs != null}<span class="tabular-nums">· {e.durationMs.toFixed(2)} ms</span>{/if}
            {#if e.source}<span class="rounded bg-muted/40 px-1 text-ui-3xs uppercase tracking-wide text-muted-foreground/40">{e.source}</span>{/if}
            {#if !e.success}<span class="text-destructive/70">· failed</span>{/if}
          </div>
          <pre class="ql-sql whitespace-pre-wrap break-words font-mono text-ui-xs leading-relaxed text-foreground/85">{@html highlight(e.sql)}</pre>
          {#if e.error}<div class="mt-0.5 font-mono text-ui-3xs text-destructive/70">{e.error}</div>{/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .ql-sql :global(.ql-kw)  { color: oklch(0.72 0.17 300); font-weight: 500; }
  .ql-sql :global(.ql-fn)  { color: oklch(0.68 0.19 20); font-style: italic; }
  .ql-sql :global(.ql-str) { color: oklch(0.74 0.15 150); }
  .ql-sql :global(.ql-num) { color: oklch(0.74 0.16 55); }
  .ql-sql :global(.ql-id)  { color: oklch(0.78 0.05 250); }
</style>
