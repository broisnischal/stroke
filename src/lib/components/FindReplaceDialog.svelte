<script>
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import * as Select from '$lib/components/ui/select/index.js'
  import SearchableMenu from './SearchableMenu.svelte'
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

  // Column picker — searchable menu (tables can have dozens of columns).
  let colMenuOpen = $state(false)
  const colItems = $derived(
    editableCols.map((c) => ({
      value: String(c.idx),
      label: c.name,
      keywords: [c.name],
      idx: c.idx,
      dataType: c.dataType ?? '',
      active: c.idx === colIdx,
    })),
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
    try {
      await onapply(matches.map(({ rowIdx, colIdx: ci, value }) => ({ rowIdx, colIdx: ci, value })))
      open = false
    } finally {
      applying = false
    }
  }

  /** @param {string} s */
  const clip = (s, max = 60) => (s.length > max ? s.slice(0, max - 1) + '…' : s)

  const selectTriggerCls =
    'h-7 w-full min-w-0 justify-between gap-1.5 rounded-md border-border/60 bg-input/30 px-2 text-ui-xs font-normal text-foreground/80 shadow-none transition-colors hover:border-border data-[state=open]:border-border'
  const inputCls =
    'h-7 w-full min-w-0 rounded-md border border-transparent bg-input/30 px-2 font-mono text-ui-xs text-foreground transition-colors placeholder:text-muted-foreground/30 hover:border-border/60 focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none'
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
      <Dialog.Title class="min-w-0 flex-1 truncate text-ui-sm font-medium text-foreground">
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
    <div class="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b border-border/60 bg-panel/50 px-4 py-3">
      <span class="select-none text-right text-ui-2xs text-muted-foreground/60">Column</span>
      <div class="grid grid-cols-[minmax(0,1fr)_8rem_auto] items-center gap-2">
        <!-- Themed dropdowns (bits-ui) — the native <select> popup is unstyled
             OS chrome (broken on Linux/WebKitGTK) and clashed with the app. -->
        <SearchableMenu
          bind:open={colMenuOpen}
          items={colItems}
          placeholder="Search columns…"
          contentClass="z-[100] w-64"
          onselect={(it) => (colIdx = it.idx)}
        >
          {#snippet trigger(props)}
            <button
              {...props}
              type="button"
              aria-label="Column"
              class={cn('inline-flex w-full min-w-0 items-center border', selectTriggerCls, colMenuOpen && 'border-border')}
            >
              <span class="min-w-0 flex-1 truncate text-left font-mono">{editableCols.find((c) => c.idx === colIdx)?.name ?? 'Column…'}</span>
              <Icon name="chevron-down" class="size-3 shrink-0 text-muted-foreground/50" />
            </button>
          {/snippet}
          {#snippet item(it)}
            <span class="min-w-0 flex-1 truncate font-mono text-ui-xs">{it.label}</span>
            {#if it.dataType}<span class="shrink-0 text-ui-3xs text-muted-foreground/40">{it.dataType}</span>{/if}
            {#if it.active}<span class="shrink-0 text-primary">✓</span>{/if}
          {/snippet}
        </SearchableMenu>
        <Select.Root
          type="single"
          value={mode}
          onValueChange={(v) => { if (v) mode = /** @type {any} */ (v) }}
        >
          <Select.Trigger size="sm" class={selectTriggerCls} aria-label="Match mode">
            <span class="truncate">{MODES.find((m) => m.id === mode)?.label ?? 'Contains'}</span>
          </Select.Trigger>
          <Select.Content class="z-[100] min-w-[8rem] p-1" sideOffset={4}>
            {#each MODES as m (m.id)}
              <Select.Item value={m.id} label={m.label} class="py-1 pl-2 pr-8 text-ui-xs" />
            {/each}
          </Select.Content>
        </Select.Root>
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

      <label for="fr-find" class="select-none text-right text-ui-2xs text-muted-foreground/60">Find</label>
      <input id="fr-find" type="text" class={inputCls} placeholder={mode === 'regex' ? '^(\\w+)@ — regular expression' : 'text to find'} bind:value={findText} />

      <label for="fr-replace" class="select-none text-right text-ui-2xs text-muted-foreground/60">Replace</label>
      <input id="fr-replace" type="text" class={inputCls} placeholder={mode === 'regex' ? '$1 uses capture groups' : 'replacement'} bind:value={replaceText} />

      {#if regexError}
        <span></span>
        <p class="font-mono text-ui-3xs text-destructive">{regexError}</p>
      {/if}
    </div>

    <!-- Preview -->
    <div class="flex h-[260px] min-h-0 flex-col bg-panel">
      {#if !findText}
        <div class="flex flex-1 items-center justify-center px-6 text-center">
          <p class="text-ui-xs text-muted-foreground/45">Type a search to preview replacements on the loaded page.</p>
        </div>
      {:else if matches.length === 0}
        <div class="flex flex-1 items-center justify-center px-6 text-center">
          <p class="text-ui-xs text-muted-foreground/45">No matching cells on this page.</p>
        </div>
      {:else}
        <div class="flex shrink-0 items-center gap-1.5 border-b border-border/40 px-4 py-1.5">
          <span class="size-1.5 rounded-full bg-emerald-500"></span>
          <span class="text-ui-2xs tabular-nums text-muted-foreground">
            {matches.length.toLocaleString('en-US')} cell{matches.length === 1 ? '' : 's'} will change
          </span>
        </div>
        <div class="app-scroll min-h-0 flex-1 divide-y divide-border/25 overflow-y-auto">
          {#each matches.slice(0, PREVIEW_CAP) as m (m.rowIdx)}
            <div class="grid grid-cols-[2.5rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4 py-1">
              <span class="select-none font-mono text-ui-3xs tabular-nums text-muted-foreground/35">{m.rowIdx + 1}</span>
              <span class="truncate font-mono text-ui-xs text-muted-foreground/70 line-through decoration-destructive/40" title={m.old}>{clip(m.old)}</span>
              <Icon name="arrow-right" class="size-3 shrink-0 text-muted-foreground/35" />
              <span class="truncate font-mono text-ui-xs text-emerald-600 dark:text-emerald-400" title={m.value}>{clip(m.value)}</span>
            </div>
          {/each}
          {#if matches.length > PREVIEW_CAP}
            <p class="px-4 py-2 text-ui-2xs text-muted-foreground/50">…and {(matches.length - PREVIEW_CAP).toLocaleString('en-US')} more</p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="flex h-13 items-center gap-2 border-t border-border/60 bg-background px-4">
      <p class="min-w-0 flex-1 truncate text-ui-2xs text-muted-foreground/60" title="Only string cells on the currently loaded page are affected. Each change is written as its own parameterized per-primary-key UPDATE.">
        String cells on this page · per-row updates
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
