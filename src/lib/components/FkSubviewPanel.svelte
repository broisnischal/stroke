<script>
  import Loader from '@lucide/svelte/icons/loader'
  import ExternalLink from '@lucide/svelte/icons/external-link'
  import X from '@lucide/svelte/icons/x'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import Inbox from '@lucide/svelte/icons/inbox'
  import Copy from '@lucide/svelte/icons/copy'
  import Braces from '@lucide/svelte/icons/braces'
  import Table from '@lucide/svelte/icons/table'
  import Rows3 from '@lucide/svelte/icons/rows-3'
  import Columns3 from '@lucide/svelte/icons/columns-3'
  import * as ContextMenu from '$lib/components/ui/context-menu/index.js'
  import { toast } from '$lib/components/ui/sonner/toast.svelte.js'
  import { cn } from '$lib/utils.js'

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
  const colNames = $derived((data?.columns ?? []).map((c) => c.name ?? c))

  // ── Selection ───────────────────────────────────────────────────────────────
  // A cell here is addressed by row and column index, the same as the grid above.
  // Selection drives both the copy actions and the roving tabindex, so arrow keys
  // move focus and the selection together.
  /** @type {{ r: number, c: number } | null} */
  let sel = $state(null)

  // A new result set invalidates any cell coordinate held from the previous one.
  $effect(() => {
    void data
    sel = null
  })

  /** @param {number} i row index @param {number} j column index */
  function cellAt(i, j) {
    const row = data?.rows?.[i]
    if (row === undefined) return undefined
    return Array.isArray(row) ? row[j] : row[colNames[j]]
  }

  /** @param {number} i */
  function rowObject(i) {
    /** @type {Record<string, unknown>} */
    const out = {}
    colNames.forEach((n, j) => { out[n] = cellAt(i, j) ?? null })
    return out
  }

  /** Tab-separated, which is what spreadsheets and editors paste as columns. */
  function allTsv() {
    const header = colNames.join('\t')
    const body = data.rows.map((_, i) => colNames.map((_, j) => fmt(cellAt(i, j))).join('\t'))
    return [header, ...body].join('\n')
  }

  /** @param {string} text @param {string} what */
  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${what} copied`, { duration: 1800 })
    } catch (e) {
      toast.error('Could not copy', { description: String(e?.message ?? e) })
    }
  }

  /** @param {number} i @param {number} j */
  function selectCell(i, j) {
    sel = { r: i, c: j }
  }

  /** Move the selection, clamped to the result set. @param {number} dr @param {number} dc */
  function moveSel(dr, dc) {
    if (!rowCount || !colNames.length) return
    const cur = sel ?? { r: 0, c: 0 }
    const r = Math.min(rowCount - 1, Math.max(0, cur.r + dr))
    const c = Math.min(colNames.length - 1, Math.max(0, cur.c + dc))
    sel = { r, c }
    // Follow the roving tabindex so the newly selected cell is also the focused
    // one, otherwise the next arrow key goes to whatever still holds focus.
    queueMicrotask(() => {
      const el = document.querySelector(`[data-fk-cell="${r}:${c}"]`)
      if (el instanceof HTMLElement) el.focus()
    })
  }

  /** @param {KeyboardEvent} e */
  function onGridKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1, 0); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1, 0); return }
    if (e.key === 'ArrowRight') { e.preventDefault(); moveSel(0, 1); return }
    if (e.key === 'ArrowLeft') { e.preventDefault(); moveSel(0, -1); return }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
      // A real text selection wins - the user dragged across part of a value and
      // means to copy exactly that, so let the browser do its own copy.
      if ((window.getSelection()?.toString() ?? '') !== '') return
      if (!sel) return
      e.preventDefault()
      copy(fmt(cellAt(sel.r, sel.c)), 'Cell')
    }
  }
</script>

<!-- Docked bottom panel, fills the dock's height (flex column) and owns its
     scroll. The dock container provides the top border + resize handle. -->
<div class="flex h-full min-h-0 w-full flex-col bg-background">

  <!-- Header: label chip + context left, actions right (Postman/DBeaver style) -->
  <div class="flex shrink-0 items-center gap-2 border-b border-border/30 bg-muted/10 px-2.5 py-1.5">
    <span class="shrink-0 text-ui-3xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Related</span>
    <span class="shrink-0 rounded border border-border/50 bg-muted/30 px-2 py-0.5 font-mono text-ui-xs font-medium text-foreground/75">
      {fkLabel}
    </span>
    {#if sourceHint}
      <span class="shrink-0 font-mono text-ui-2xs text-muted-foreground">({sourceHint})</span>
    {/if}
    {#if !data?.loading && !data?.error}
      <span class="shrink-0 font-mono text-ui-2xs text-muted-foreground">
        {rowCount}{rowCount >= 50 ? '+' : ''} row{rowCount !== 1 ? 's' : ''}
      </span>
    {/if}

    <div class="ml-auto flex shrink-0 items-center gap-0.5">
      {#if rowCount}
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded px-2 py-1 font-mono text-ui-2xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          onclick={() => copy(allTsv(), rowCount === 1 ? 'Row' : 'All rows')}
          title="Copy every row shown, tab-separated with a header"
        >
          Copy
          <Copy class="size-3" />
        </button>
      {/if}
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded px-2 py-1 font-mono text-ui-2xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        onclick={onfullview}
        title="Open the related table as a tab with this filter applied"
      >
        Open in sub view
        <ExternalLink class="size-3" />
      </button>
      <button
        type="button"
        class="flex shrink-0 items-center rounded p-1 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        onclick={onclose}
        aria-label="Close related rows panel"
      >
        <X class="size-3.5" />
      </button>
    </div>
  </div>

  <!-- Content, three visually distinct states: loading / failed / empty -->
  {#if data?.loading}
    <div class="flex flex-1 items-center gap-2 px-3 py-4">
      <Loader class="size-3.5 animate-spin text-muted-foreground" />
      <span class="font-mono text-ui-xs text-muted-foreground">Loading related rows…</span>
    </div>

  {:else if data?.error}
    <div class="flex flex-1 items-start gap-2 px-3 py-3">
      <TriangleAlert class="mt-px size-3.5 shrink-0 text-destructive" />
      <div class="min-w-0">
        <div class="text-ui-xs font-medium text-destructive">Couldn't load related rows</div>
        <div class="mt-0.5 font-mono text-ui-2xs leading-relaxed break-words text-muted-foreground">{data.error}</div>
      </div>
    </div>

  {:else if !rowCount}
    <div class="flex flex-1 items-center gap-2 px-3 py-3">
      <Inbox class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="text-ui-xs italic text-muted-foreground">No related rows</span>
    </div>

  {:else}
    <!-- The dock owns this scroll, both axes contained here, never chained to
         the grid (the panel lives outside the grid's scroll container). -->
    <div class="app-scroll min-h-0 flex-1 overflow-auto overscroll-contain" data-fk-subview-scroll>
      <ContextMenu.Root>
        <ContextMenu.Trigger>
          {#snippet child({ props })}
            <!-- `data-studio-selectable` opts this subtree out of the app-wide
                 select-none, so a value can be dragged across and copied the way
                 it can anywhere else data is shown. `role="grid"` carries the
                 roving tabindex below. -->
            <table
              {...props}
              role="grid"
              data-studio-selectable="text"
              class="w-max min-w-full border-separate"
              style="border-spacing:0"
              onkeydown={onGridKey}
            >
              <thead class="sticky top-0 z-10">
                <tr>
                  {#each data.columns as col (col.name ?? col)}
                    <th class="whitespace-nowrap border-b border-border/40 bg-background px-3 py-1.5 text-left">
                      <span class="font-mono text-ui-xs font-bold text-foreground/75">{col.name ?? col}</span>
                      {#if col.dataType ?? col.data_type}
                        <span class="ml-1 font-mono text-ui-2xs font-normal text-muted-foreground">{col.dataType ?? col.data_type}</span>
                      {/if}
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each data.rows as row, i (i)}
                  <tr class="hover:bg-muted/10">
                    {#each data.columns as col, j (col.name ?? j)}
                      {@const v = cellAt(i, j)}
                      {@const isNullVal = v === null || v === undefined}
                      {@const isSel = sel?.r === i && sel?.c === j}
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <td
                        role="gridcell"
                        data-fk-cell="{i}:{j}"
                        tabindex={isSel || (!sel && i === 0 && j === 0) ? 0 : -1}
                        aria-selected={isSel}
                        class={cn(
                          'cursor-default whitespace-nowrap px-3 py-1.5 font-mono text-ui-xs outline-none',
                          i < data.rows.length - 1 && 'border-b border-border/15',
                          isNullVal && 'italic text-muted-foreground',
                          isSel && 'bg-primary/15 ring-1 ring-inset ring-primary/40',
                        )}
                        onclick={() => selectCell(i, j)}
                        onfocus={() => selectCell(i, j)}
                        oncontextmenu={() => selectCell(i, j)}
                      >{fmt(v)}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          {/snippet}
        </ContextMenu.Trigger>

        <ContextMenu.Content class="min-w-52 p-1 text-ui-xs [&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs [&_[data-slot=context-menu-item]_svg]:size-3.5">
          <ContextMenu.Item disabled={!sel} onSelect={() => sel && copy(fmt(cellAt(sel.r, sel.c)), 'Cell')}>
            <Copy />
            Copy cell
            <ContextMenu.Shortcut>⌘C</ContextMenu.Shortcut>
          </ContextMenu.Item>
          <ContextMenu.Item
            disabled={!sel}
            onSelect={() => sel && copy(colNames.map((_, j) => fmt(cellAt(sel.r, j))).join('\t'), 'Row')}
          >
            <Rows3 />
            Copy row
          </ContextMenu.Item>
          <ContextMenu.Item disabled={!sel} onSelect={() => sel && copy(JSON.stringify(rowObject(sel.r), null, 2), 'Row JSON')}>
            <Braces />
            Copy row as JSON
          </ContextMenu.Item>
          <ContextMenu.Item
            disabled={!sel}
            onSelect={() => sel && copy(data.rows.map((_, i) => fmt(cellAt(i, sel.c))).join('\n'), `Column ${colNames[sel.c]}`)}
          >
            <Columns3 />
            Copy column
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item onSelect={() => copy(allTsv(), 'All rows')}>
            <Table />
            Copy all rows
          </ContextMenu.Item>
          <ContextMenu.Item onSelect={() => copy(JSON.stringify(data.rows.map((_, i) => rowObject(i)), null, 2), 'All rows JSON')}>
            <Braces />
            Copy all as JSON
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    </div>

    {#if rowCount >= 50}
      <div class="flex shrink-0 items-center border-t border-border/25 bg-muted/5 px-3 py-1">
        <span class="font-mono text-ui-2xs text-muted-foreground">First 50 rows shown, open in sub view for all</span>
      </div>
    {/if}
  {/if}
</div>
