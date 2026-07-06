<script>
  import Loader from '@lucide/svelte/icons/loader'
  import ExternalLink from '@lucide/svelte/icons/external-link'
  import X from '@lucide/svelte/icons/x'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import Inbox from '@lucide/svelte/icons/inbox'

  let {
    data,
    fkLabel = '',
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

<!--
  Width is set by the parent (= viewport width - gutter).
  No max-width cap here — the parent already handles it.
-->
<div class="w-full border border-border/40 bg-background shadow-sm">

  <!-- Compact header: close on left, table name, count -->
  <div class="flex items-center gap-2 border-b border-border/30 bg-muted/10 px-2.5 py-1.5">
    <button
      type="button"
      class="flex shrink-0 items-center rounded p-0.5 text-muted-foreground/40 transition-colors hover:bg-muted/40 hover:text-foreground"
      onclick={onclose}
      aria-label="Close"
    >
      <X class="size-3.5" />
    </button>

    <span class="rounded border border-border/50 bg-muted/30 px-2 py-0.5 font-mono text-[12px] font-medium text-foreground/75">
      {fkLabel}
    </span>

    {#if !data?.loading && !data?.error}
      <span class="font-mono text-[11px] text-muted-foreground/40">
        {rowCount}{rowCount >= 50 ? '+' : ''} row{rowCount !== 1 ? 's' : ''}
      </span>
    {/if}
  </div>

  <!-- Content — three visually distinct states: loading / failed / empty -->
  {#if data?.loading}
    <div class="flex items-center gap-2 px-3 py-4">
      <Loader class="size-3.5 animate-spin text-muted-foreground/40" />
      <span class="font-mono text-[12px] text-muted-foreground/50">Loading related rows…</span>
    </div>

  {:else if data?.error}
    <div class="flex items-start gap-2 px-3 py-3">
      <TriangleAlert class="mt-px size-3.5 shrink-0 text-destructive/70" />
      <div class="min-w-0">
        <div class="text-[12px] font-medium text-destructive/80">Couldn't load related rows</div>
        <div class="mt-0.5 font-mono text-[11px] leading-relaxed break-words text-muted-foreground/55">{data.error}</div>
      </div>
    </div>

  {:else if !rowCount}
    <div class="flex items-center gap-2 px-3 py-3">
      <Inbox class="size-3.5 shrink-0 text-muted-foreground/30" />
      <span class="text-[12px] italic text-muted-foreground/40">No related rows</span>
    </div>

  {:else}
    <!-- ≤10 rows: show all (no inner scroll, main table scroll works normally).
         >10 rows: cap height and add vertical scroll.
         No overscroll-contain so scroll chains naturally to the main table at limits. -->
    {@const needsScroll = rowCount > 10}
    <!--
      overflow-x: auto would implicitly make overflow-y compute to `auto` too,
      turning this into a vertical scroll container that traps the wheel even
      when every row fits — so vertical scroll never chains to the main grid.
      Set overflow-y explicitly: `auto` (bounded) only when we truly need it,
      otherwise `hidden` so vertical wheel passes straight through to the grid.
    -->
    <div
      class="overflow-x-auto"
      class:overflow-y-auto={needsScroll}
      class:overflow-y-hidden={!needsScroll}
      style={needsScroll ? 'max-height: 280px' : ''}
      data-fk-subview-scroll
    >
      <table class="w-max min-w-full border-collapse">
        <thead class="sticky top-0 z-10 bg-background">
          <tr class="border-b border-border/40">
            {#each data.columns as col (col.name ?? col)}
              <th class="whitespace-nowrap px-3 py-1.5 text-left">
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

    <!-- Footer: button on LEFT -->
    <div class="flex items-center gap-3 border-t border-border/25 bg-muted/5 px-3 py-1.5">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded border border-border/40 bg-muted/20 px-3 py-1 font-mono text-[12px] text-foreground/65 transition-colors hover:bg-muted/50 hover:text-foreground"
        onclick={onfullview}
      >
        Open in sub view
        <ExternalLink class="size-3" />
      </button>
      {#if rowCount >= 50}
        <span class="font-mono text-[11px] text-muted-foreground/25">First 50 rows shown</span>
      {/if}
    </div>
  {/if}
</div>
