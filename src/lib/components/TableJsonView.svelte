<script module>
  // JSONPath filters are per table-tab: keyed by table identity, module-scoped
  // so a filter survives view switches/remounts but never leaks across tables.
  /** @type {Map<string, string>} */
  const pathByTable = new Map()
</script>

<script>
  import { untrack } from 'svelte'
  import Icon from './Icon.svelte'
  import MonacoTextView from './MonacoTextView.svelte'
  import { cn } from '$lib/utils.js'
  import { rowToRecord, formatJsonValue } from '$lib/row-inspector.js'
  import { evalJsonPath, getCompletions, applyCompletion, describeResult } from '$lib/jsonpath.js'

  /**
   * JSON mode for the data table — a read-only Monaco surface (smooth
   * virtualized scrolling, ⌘F find, full selection) with adaptive large-doc
   * settings, plus a JSONPath bar evaluated against the live records so the
   * document is never re-parsed.
   */
  let {
    /** @type {Array<{ name: string }>} */
    columns = [],
    /** @type {unknown[][]} */
    rows = [],
    /** Identity of the table shown — scopes the JSONPath filter to this tab. */
    tableKey = '',
    // Kept in the API for the parent; the view toolbar owns these actions now.
    onshowtable = () => {},
    ondownload = /** @type {(() => void) | undefined} */ (undefined),
  } = $props()

  const records = $derived(rows.map((r) => rowToRecord(columns, r)))
  const fullJson = $derived(formatJsonValue(records))

  // ── JSONPath (scoped per table via pathByTable) ───────────────────────────
  // Initial values deliberately capture the mount-time tableKey (untracked);
  // later key changes are handled by the restore effect below.
  const _initKey = untrack(() => tableKey)
  let jsonPath = $state(pathByTable.get(_initKey) ?? '')
  let _prevKey = _initKey
  $effect(() => {
    const key = tableKey
    untrack(() => {
      if (key === _prevKey) return
      pathByTable.set(_prevKey, jsonPath) // stash the outgoing tab's filter
      jsonPath = pathByTable.get(key) ?? '' // restore the incoming tab's
      evalPath = jsonPath // snap immediately — no debounce lag on tab switch
      _prevKey = key
    })
  })
  // Keep the stash current so a view-switch remount restores the same filter.
  $effect(() => {
    const p = jsonPath
    untrack(() => pathByTable.set(_prevKey, p))
  })
  let pathFocused = $state(false)
  let activeIdx = $state(-1)
  /** @type {HTMLInputElement | null} */
  let pathInput = $state(null)

  // Evaluation is debounced off the input: a full-path eval (recursive descent
  // can walk every record) plus re-stringifying the result document per
  // KEYSTROKE would stall typing on large pages. The input stays instant; the
  // document updates ~160ms after the user pauses.
  let evalPath = $state(pathByTable.get(_initKey) ?? '')
  $effect(() => {
    const p = jsonPath
    if (p === untrack(() => evalPath)) return
    const t = setTimeout(() => { evalPath = p }, 160)
    return () => clearTimeout(t)
  })

  const pathResult = $derived.by(() => {
    const p = evalPath.trim()
    if (!p || p === '$') return null
    return evalJsonPath(records, p)
  })

  const displayedJson = $derived.by(() => {
    if (!pathResult?.ok) return fullJson
    return formatJsonValue(pathResult.value)
  })

  const completions = $derived.by(() => {
    if (!pathFocused) return []
    return getCompletions(records, jsonPath).slice(0, 8)
  })

  $effect(() => {
    if (!pathFocused || completions.length === 0) activeIdx = -1
  })

  /** @param {string} completion */
  function pickCompletion(completion) {
    jsonPath = applyCompletion(jsonPath, completion)
    activeIdx = -1
    pathInput?.focus()
  }

  /** @param {KeyboardEvent} e */
  function handlePathKeydown(e) {
    if (!completions.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIdx = (activeIdx + 1) % completions.length
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIdx = (activeIdx - 1 + completions.length) % completions.length
    } else if ((e.key === 'Tab' || e.key === 'Enter') && activeIdx >= 0) {
      e.preventDefault()
      pickCompletion(completions[activeIdx])
    } else if (e.key === 'Escape') {
      activeIdx = -1
      pathFocused = false
      pathInput?.blur()
    }
  }

</script>

<div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
  <!-- JSONPath filter bar — a quiet filter field (SQL Studio-style): glyph +
       mono input in a rounded inset, result hint right-aligned. Actions like
       copy/export/view-switch live in the table toolbar, not here. -->
  <div class="studio-chrome flex h-8 shrink-0 items-center gap-2 border-b border-border bg-panel px-2">
    <div
      class={cn(
        'relative flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-transparent bg-input/30 px-2 transition-colors',
        pathFocused ? 'border-input' : 'hover:border-border/60',
      )}
    >
      <Icon name="list-filter" class="size-3 shrink-0 text-muted-foreground/50" />
      <span class="select-none font-mono text-ui-xs text-muted-foreground/60">$</span>
      <input
        bind:this={pathInput}
        type="text"
        bind:value={jsonPath}
        aria-label="JSONPath filter"
        placeholder=".field  ·  [0]  ·  .items[*].name  ·  ..key"
        class="min-w-0 flex-1 bg-transparent font-mono text-ui-xs text-foreground placeholder:text-muted-foreground/35 focus:outline-none"
        spellcheck="false"
        autocomplete="off"
        onfocus={() => { pathFocused = true }}
        onblur={() => setTimeout(() => { pathFocused = false }, 120)}
        onkeydown={handlePathKeydown}
      />
      {#if jsonPath}
        <button
          type="button"
          aria-label="Clear filter"
          class="inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-foreground"
          onmousedown={(e) => e.preventDefault()}
          onclick={() => { jsonPath = ''; pathInput?.focus() }}
        >
          <Icon name="x" class="size-3" />
        </button>
      {/if}

      <!-- Autocomplete dropdown — anchored under the field -->
      {#if pathFocused && completions.length > 0}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <ul
          class="absolute left-0 top-full z-50 mt-1 min-w-48 overflow-hidden rounded-lg border border-border/60 bg-popover p-1 shadow-lg"
          onmousedown={(e) => e.preventDefault()}
        >
          {#each completions as completion, i (completion)}
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-ui-xs transition-colors {i === activeIdx ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}"
                onclick={() => pickCompletion(completion)}
              >
                {#if completion.startsWith('[')}
                  <span class="shrink-0 text-[10px] text-muted-foreground/50">[idx]</span>
                {:else}
                  <span class="shrink-0 text-[10px] text-muted-foreground/50">.key</span>
                {/if}
                <span class="truncate">{completion.startsWith('.') ? completion.slice(1) : completion}</span>
                <span class="ml-auto shrink-0 text-muted-foreground/40">{completion}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    {#if pathResult && !pathResult.ok}
      <span class="shrink-0 pr-1 font-mono text-ui-2xs text-destructive">{pathResult.error}</span>
    {:else if pathResult?.ok}
      <span class="shrink-0 pr-1 font-mono text-ui-2xs tabular-nums text-muted-foreground/50">{describeResult(pathResult.value)}</span>
    {/if}
  </div>

  <!-- Monaco JSON body (⌘F to search) -->
  {#if columns.length === 0}
    <div class="flex min-h-0 flex-1 items-center justify-center bg-panel">
      <p class="font-mono text-ui-sm text-muted-foreground/40">No data to display</p>
    </div>
  {:else}
    <MonacoTextView text={displayedJson} language="json" />
  {/if}
</div>
