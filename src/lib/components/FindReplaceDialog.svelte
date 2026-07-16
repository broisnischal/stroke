<script>
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import Icon from './Icon.svelte'
  import { cn } from '$lib/utils.js'
  import { isEditableType } from '$lib/cell-value.js'

  /**
   * Find & replace inside one column of the loaded page. Matching runs live
   * over the in-memory rows and every change is shown as a before → after
   * preview; Apply writes each cell through the app's normal parameterized
   * cell-save pipeline (per-PK UPDATEs) — nothing is written blind.
   */
  let {
    open = $bindable(false),
    /** @type {Array<{ name: string, dataType?: string }>} */
    columns = [],
    /** @type {unknown[][]} */
    rows = [],
    /** @type {string | null} */
    tableName = null,
    /** @type {(edits: Array<{ rowIdx: number, colIdx: number, value: string }>) => Promise<void>} */
    onapply = async () => {},
  } = $props()

  const MODES = [
    { id: 'contains', label: 'Contains' },
    { id: 'exact', label: 'Exact match' },
    { id: 'regex', label: 'Regex' },
  ]

  let colIdx = $state(-1)
  /** @type {'contains' | 'exact' | 'regex'} */
  let mode = $state('contains')
  let caseSensitive = $state(false)
  let findText = $state('')
  let replaceText = $state('')
  let applying = $state(false)

  const editableCols = $derived(
    columns
      .map((c, i) => ({ ...c, idx: i }))
      .filter((c) => isEditableType(c.dataType ?? '')),
  )

  // Reset per open — default to the first editable column.
  $effect(() => {
    if (!open) return
    findText = ''
    replaceText = ''
    applying = false
    if (colIdx < 0 || !editableCols.some((c) => c.idx === colIdx)) {
      colIdx = editableCols[0]?.idx ?? -1
    }
  })

  const escapeRe = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const regexError = $derived.by(() => {
    if (mode !== 'regex' || !findText) return ''
    try {
      new RegExp(findText)
      return ''
    } catch (e) {
      return String(/** @type {Error} */ (e).message ?? e)
    }
  })

  /** @typedef {{ rowIdx: number, colIdx: number, old: string, value: string }} Match */

  const matches = $derived.by(() => {
    /** @type {Match[]} */
    const out = []
    if (colIdx < 0 || !findText || regexError) return out
    /** @type {RegExp | null} */
    let re = null
    try {
      if (mode === 'regex') re = new RegExp(findText, caseSensitive ? 'g' : 'gi')
      else if (mode === 'contains') re = new RegExp(escapeRe(findText), caseSensitive ? 'g' : 'gi')
    } catch {
      return out
    }
    for (let r = 0; r < rows.length; r++) {
      const v = rows[r]?.[colIdx]
      // Only string cells — rewriting numbers/json through string replace is a footgun.
      if (typeof v !== 'string') continue
      let next = v
      if (mode === 'exact') {
        const hit = caseSensitive ? v === findText : v.toLowerCase() === findText.toLowerCase()
        if (!hit) continue
        next = replaceText
      } else if (re) {
        next = v.replace(re, replaceText)
      }
      if (next !== v) out.push({ rowIdx: r, colIdx, old: v, value: next })
    }
    return out
  })

  const PREVIEW_CAP = 100

  async function handleApply() {
    if (!matches.length || applying) return
    applying = true
    applyProgress = 0
    try {
      await onapply(matches.map(({ rowIdx, colIdx: ci, value }) => ({ rowIdx, colIdx: ci, value })))
      open = false
    } finally {
      applying = false
    }
  }

  /** @param {string} s */
  const clip = (s, max = 60) => (s.length > max ? s.slice(0, max - 1) + '…' : s)

  const selectCls =
    'h-7 w-full appearance-none rounded-md border border-border/60 bg-input/30 pl-2 pr-6 text-ui-xs text-foreground/80 transition-colors hover:border-border focus:outline-none focus:ring-1 focus:ring-ring'
  const inputCls =
    'h-7 w-full min-w-0 rounded-md border border-transparent bg-input/30 px-2 font-mono text-ui-xs text-foreground transition-colors placeholder:text-muted-foreground/30 hover:border-border/60 focus:border-input focus:outline-none focus:ring-1 focus:ring-ring'
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    showCloseButton={false}
    class="w-[min(640px,calc(100vw-2rem))] gap-0 overflow-hidden rounded-xl p-0 sm:max-w-none"
  >
    <!-- Header -->
    <div class="flex h-12 items-center gap-2.5 border-b border-border/60 pl-4 pr-2.5">
      <span class="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
        <Icon name="replace" class="size-3.5" />
      </span>
      <Dialog.Title class="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
        Find & replace
        <span class="text-muted-foreground/50">·</span>
        <span class="font-mono text-ui-sm">{tableName}</span>
      </Dialog.Title>
      <Dialog.Close
        class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,scale] hover:bg-accent hover:text-foreground active:scale-[0.96]"
        aria-label="Close"
      >
        <Icon name="x" class="size-3.5" />
      </Dialog.Close>
    </div>

    <!-- Controls -->
    <div class="flex flex-col gap-2 border-b border-border/60 bg-panel/50 px-4 py-3">
      <div class="grid grid-cols-[minmax(0,1fr)_8rem_auto] items-center gap-2">
        <div class="relative">
          <select
            value={colIdx}
            aria-label="Column"
            class={selectCls}
            onchange={(e) => (colIdx = Number(e.currentTarget.value))}
          >
            {#each editableCols as c (c.idx)}
              <option value={c.idx}>{c.name}</option>
            {/each}
          </select>
          <Icon name="chevron-down" class="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/50" />
        </div>
        <div class="relative">
          <select
            value={mode}
            aria-label="Match mode"
            class={selectCls}
            onchange={(e) => (mode = /** @type {any} */ (e.currentTarget.value))}
          >
            {#each MODES as m (m.id)}
              <option value={m.id}>{m.label}</option>
            {/each}
          </select>
          <Icon name="chevron-down" class="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/50" />
        </div>
        <button
          type="button"
          class={cn(
            'inline-flex h-7 items-center rounded-md border px-2 font-mono text-ui-xs transition-[background-color,color,border-color]',
            caseSensitive
              ? 'border-primary/40 bg-primary/10 text-foreground'
              : 'border-border/60 bg-input/30 text-muted-foreground hover:text-foreground',
          )}
          title="Match case"
          aria-pressed={caseSensitive}
          onclick={() => (caseSensitive = !caseSensitive)}
        >
          Aa
        </button>
      </div>
      <input type="text" class={inputCls} placeholder={mode === 'regex' ? 'find — e.g. ^(\\w+)@' : 'find'} bind:value={findText} />
      <input type="text" class={inputCls} placeholder={mode === 'regex' ? 'replace — $1 uses capture groups' : 'replace with'} bind:value={replaceText} />
      {#if regexError}
        <p class="font-mono text-ui-3xs text-destructive">{regexError}</p>
      {/if}
    </div>

    <!-- Preview -->
    <div class="app-scroll h-[240px] min-h-0 overflow-y-auto bg-panel">
      {#if !findText}
        <div class="flex h-full items-center justify-center px-6 text-center">
          <p class="text-ui-xs text-muted-foreground/45">Type a search to preview replacements on the loaded page.</p>
        </div>
      {:else if matches.length === 0}
        <div class="flex h-full items-center justify-center px-6 text-center">
          <p class="text-ui-xs text-muted-foreground/45">No matching cells on this page.</p>
        </div>
      {:else}
        <div class="divide-y divide-border/30">
          {#each matches.slice(0, PREVIEW_CAP) as m (m.rowIdx)}
            <div class="grid grid-cols-[3rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4 py-1.5">
              <span class="select-none font-mono text-ui-3xs tabular-nums text-muted-foreground/40">#{m.rowIdx + 1}</span>
              <span class="truncate font-mono text-ui-xs text-muted-foreground line-through decoration-destructive/50" title={m.old}>{clip(m.old)}</span>
              <Icon name="arrow-right" class="size-3 shrink-0 text-muted-foreground/40" />
              <span class="truncate font-mono text-ui-xs text-foreground" title={m.value}>{clip(m.value)}</span>
            </div>
          {/each}
          {#if matches.length > PREVIEW_CAP}
            <p class="px-4 py-2 text-ui-2xs text-muted-foreground/50">…and {matches.length - PREVIEW_CAP} more</p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="flex h-13 items-center gap-2 border-t border-border/60 bg-background px-4">
      <p class="min-w-0 flex-1 truncate text-ui-2xs text-muted-foreground/60">
        Applies to string cells on the loaded page — each change is a per-row UPDATE.
      </p>
      <Dialog.Close
        class="inline-flex h-8 shrink-0 items-center rounded-md border border-border px-3 text-ui-xs text-muted-foreground transition-[background-color,color,scale] hover:bg-accent hover:text-foreground active:scale-[0.96]"
      >
        Cancel
      </Dialog.Close>
      <button
        type="button"
        class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-ui-xs font-medium text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40"
        disabled={matches.length === 0 || applying || !!regexError}
        onclick={handleApply}
      >
        {#if applying}
          <Icon name="loader-2" class="size-3 animate-spin" />
          Applying…
        {:else}
          <Icon name="check" class="size-3" />
          Replace {matches.length.toLocaleString('en-US')} value{matches.length === 1 ? '' : 's'}
        {/if}
      </button>
    </div>
  </Dialog.Content>
</Dialog.Root>
