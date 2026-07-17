<script>
  import Loader from '@lucide/svelte/icons/loader'
  import ExternalLink from '@lucide/svelte/icons/external-link'
  import X from '@lucide/svelte/icons/x'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import Inbox from '@lucide/svelte/icons/inbox'

  let {
    data,
    fkLabel = '',
    /** Small context hint shown next to the badge (e.g. "row 12"). */
    sourceHint = '',
    onclose = () => {},
    /** Navigate to the related table WITH the FK filter applied */
    onfullview = () => {},
  } = $props()

  /** @param {unknown} v */
  function fmt(v) {
    if (v === null || v === undefined) return 'NULL'
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }

  const rowCount = $derived(data?.rows?.length ?? 0)
</script>

<!-- Docked bottom panel — fills the dock's height (flex column) and owns its
     scroll. The dock container provides the top border + resize handle. -->
<div class="flex h-full min-h-0 w-full flex-col bg-background">

  <!-- Header: label chip + context left, actions right (Postman/DBeaver style) -->
  <div class="flex shrink-0 items-center gap-2 border-b border-border/30 bg-muted/10 px-2.5 py-1.5">
    <span class="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/50">Related</span>
    <span class="shrink-0 rounded border border-border/50 bg-muted/30 px-2 py-0.5 font-mono text-[12px] font-medium text-foreground/75">
      {fkLabel}
    </span>
    {#if sourceHint}
      <span class="shrink-0 font-mono text-[11px] text-muted-foreground/40">({sourceHint})</span>
    {/if}
    {#if !data?.loading && !data?.error}
      <span class="shrink-0 font-mono text-[11px] text-muted-foreground/40">
        {rowCount}{rowCount >= 50 ? '+' : ''} row{rowCount !== 1 ? 's' : ''}
      </span>
    {/if}

    <div class="ml-auto flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[11px] text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
        onclick={onfullview}
        title="Open the related table as a tab with this filter applied"
      >
        Open in sub view
        <ExternalLink class="size-3" />
      </button>
      <button
        type="button"
        class="flex shrink-0 items-center rounded p-1 text-muted-foreground/40 transition-colors hover:bg-muted/40 hover:text-foreground"
        onclick={onclose}
        aria-label="Close related rows panel"
      >
        <X class="size-3.5" />
      </button>
    </div>
  </div>

  <!-- Content — three visually distinct states: loading / failed / empty -->
  {#if data?.loading}
    <div class="flex flex-1 items-center gap-2 px-3 py-4">
      <Loader class="size-3.5 animate-spin text-muted-foreground/40" />
      <span class="font-mono text-[12px] text-muted-foreground/50">Loading related rows…</span>
    </div>

  {:else if data?.error}
    <div class="flex flex-1 items-start gap-2 px-3 py-3">
      <TriangleAlert class="mt-px size-3.5 shrink-0 text-destructive/70" />
      <div class="min-w-0">
        <div class="text-[12px] font-medium text-destructive/80">Couldn't load related rows</div>
        <div class="mt-0.5 font-mono text-[11px] leading-relaxed break-words text-muted-foreground/55">{data.error}</div>
      </div>
    </div>

  {:else if !rowCount}
    <div class="flex flex-1 items-center gap-2 px-3 py-3">
      <Inbox class="size-3.5 shrink-0 text-muted-foreground/30" />
      <span class="text-[12px] italic text-muted-foreground/40">No related rows</span>
    </div>

  {:else}
    <!-- The dock owns this scroll — both axes contained here, never chained to
         the grid (the panel lives outside the grid's scroll container). -->
    <div class="app-scroll min-h-0 flex-1 overflow-auto overscroll-contain" data-fk-subview-scroll>
      <table class="w-max min-w-full border-collapse">
        <thead class="sticky top-0 z-10">
          <tr>
            {#each data.columns as col (col.name ?? col)}
              <th class="whitespace-nowrap border-b border-border/40 bg-background px-3 py-1.5 text-left">
                <span class="font-mono text-[12px] font-bold text-foreground/75">{col.name ?? col}</span>
                {#if col.dataType ?? col.data_type}
                  <span class="ml-1 font-mono text-[11px] font-normal text-muted-foreground/30">{col.dataType ?? col.data_type}</span>
                {/if}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each data.rows as row, i (i)}
            <tr class="border-b border-border/15 last:border-0 hover:bg-muted/10">
              {#each data.columns as col, j (col.name ?? j)}
                {@const v = Array.isArray(row) ? row[j] : row[col.name ?? col]}
                {@const isNullVal = v === null || v === undefined}
                <td
                  class="whitespace-nowrap px-3 py-1.5 font-mono text-[12px]"
                  class:text-muted-foreground={isNullVal}
                  class:italic={isNullVal}
                >{fmt(v)}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if rowCount >= 50}
      <div class="flex shrink-0 items-center border-t border-border/25 bg-muted/5 px-3 py-1">
        <span class="font-mono text-[11px] text-muted-foreground/30">First 50 rows shown — open in sub view for all</span>
      </div>
    {/if}
  {/if}
</div>
