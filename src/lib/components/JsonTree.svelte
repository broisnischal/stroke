<script>
  // Lightweight collapsible JSON tree — Monaco-style folding without Monaco's
  // weight, so it can live inline in expanded table rows. Perf model: only
  // expanded children mount, arrays/objects render at most CHILD_PAGE children
  // until "Show more" is clicked, and string leaves are display-truncated.
  // The full (untruncated) value is always available via copy / open actions.
  import JsonTree from './JsonTree.svelte'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import Copy from '@lucide/svelte/icons/copy'
  import Maximize2 from '@lucide/svelte/icons/maximize-2'
  import { oversizeCellInfo, formatByteSize } from '$lib/cell-value.js'

  /**
   * @type {{
   *   value: unknown,
   *   label?: string | null,
   *   depth?: number,
   *   defaultDepth?: number,
   *   oncopy?: (value: unknown) => void,
   *   onopen?: ((value: unknown, label: string) => void) | null,
   * }}
   */
  let {
    value,
    label = null,
    depth = 0,
    defaultDepth = 1,
    oncopy = () => {},
    onopen = null,
  } = $props()

  const STRING_DISPLAY_LIMIT = 160
  const CHILD_PAGE = 200

  const oversize = $derived(oversizeCellInfo(value))
  const isArray = $derived(Array.isArray(value))
  const isObject = $derived(
    !oversize && value !== null && typeof value === 'object' && !isArray,
  )
  const isContainer = $derived(isArray || isObject)

  let expanded = $state(depth < defaultDepth)
  let childLimit = $state(CHILD_PAGE)

  // Total child count — cheap for arrays (.length). Avoids materializing a tuple
  // for every element of a huge array/object just to show a count.
  const totalCount = $derived(
    isArray ? /** @type {unknown[]} */ (value).length
    : isObject ? Object.keys(/** @type {Record<string, unknown>} */ (value)).length
    : 0,
  )

  // Only the currently-visible children (up to childLimit) are materialized, so
  // expanding a 100k-element array never builds 100k tuples at once.
  /** @type {[string, unknown][]} */
  const visibleEntries = $derived.by(() => {
    if (isArray) {
      const arr = /** @type {unknown[]} */ (value)
      const n = Math.min(arr.length, childLimit)
      /** @type {[string, unknown][]} */
      const out = []
      for (let i = 0; i < n; i++) out.push([String(i), arr[i]])
      return out
    }
    if (isObject) {
      /** @type {[string, unknown][]} */
      const out = []
      let i = 0
      for (const k in /** @type {Record<string, unknown>} */ (value)) {
        if (i >= childLimit) break
        out.push([k, /** @type {Record<string, unknown>} */ (value)[k]])
        i++
      }
      return out
    }
    return []
  })

  const summary = $derived.by(() => {
    if (isArray) return totalCount === 1 ? '1 item' : `${totalCount} items`
    if (isObject) return totalCount === 1 ? '1 key' : `${totalCount} keys`
    return ''
  })

  /** Display text for a primitive leaf. */
  const leafText = $derived.by(() => {
    if (oversize) return `${oversize.dataType || 'value'} · ${formatByteSize(oversize.bytes)} — truncated`
    if (value === null || value === undefined) return 'null'
    if (typeof value === 'string') {
      const s = value.length > STRING_DISPLAY_LIMIT ? value.slice(0, STRING_DISPLAY_LIMIT) + '…' : value
      return JSON.stringify(s)
    }
    return String(value)
  })

  const leafClass = $derived.by(() => {
    if (oversize) return 'json-tok-null italic'
    if (value === null || value === undefined) return 'json-tok-null'
    if (typeof value === 'string') return 'json-tok-str'
    if (typeof value === 'number') return 'json-tok-num'
    if (typeof value === 'boolean') return 'json-tok-bool'
    return 'text-foreground'
  })

  const openable = $derived(
    !!onopen && (isContainer || oversize || (typeof value === 'string' && value.length > STRING_DISPLAY_LIMIT)),
  )

  function handleOpen() {
    onopen?.(value, label ?? (isArray ? 'array' : 'value'))
  }
</script>

<div class="min-w-0 font-mono text-sm leading-relaxed" style={depth > 0 ? 'padding-left: 1.1rem' : ''}>
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="group/jsonrow flex min-w-0 items-start gap-1">
    {#if isContainer}
      <button
        type="button"
        class="mt-[3px] flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-accent/50 hover:text-foreground"
        aria-label={expanded ? 'Collapse' : 'Expand'}
        aria-expanded={expanded}
        onclick={() => (expanded = !expanded)}
      >
        <ChevronRight class={['size-3.5 transition-transform duration-100', expanded ? 'rotate-90' : ''].join(' ')} />
      </button>
    {:else}
      <span class="size-4 shrink-0"></span>
    {/if}

    <div class="min-w-0 flex-1">
      <span class="inline-flex max-w-full items-baseline gap-1">
        {#if label !== null}
          <button
            type="button"
            class={[
              'json-tok-key shrink-0 cursor-pointer select-text bg-transparent p-0 text-left',
              isContainer ? 'hover:underline underline-offset-2' : 'cursor-text',
            ].join(' ')}
            onclick={() => { if (isContainer) expanded = !expanded }}
            tabindex={isContainer ? 0 : -1}
          >{label}</button><span class="text-muted-foreground/60">:</span>
        {/if}

        {#if isContainer}
          <button
            type="button"
            class="cursor-pointer select-none bg-transparent p-0 text-left text-muted-foreground/70 hover:text-foreground"
            onclick={() => (expanded = !expanded)}
          >
            <span class="text-muted-foreground">{isArray ? '[' : '{'}</span>{#if !expanded}<span class="px-1 text-xs text-muted-foreground/60">{summary}</span><span class="text-muted-foreground">{isArray ? ']' : '}'}</span>{/if}
          </button>
        {:else}
          <span class={['break-all', leafClass].join(' ')}>{leafText}</span>
        {/if}

        <!-- Hover actions -->
        <span class="invisible ml-1 inline-flex shrink-0 items-center gap-0.5 group-hover/jsonrow:visible">
          <button
            type="button"
            class="flex size-4.5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-accent/50 hover:text-foreground"
            title="Copy value"
            onclick={() => oncopy(value)}
          >
            <Copy class="size-3" />
          </button>
          {#if openable}
            <button
              type="button"
              class="flex size-4.5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-accent/50 hover:text-foreground"
              title="Open in JSON viewer"
              onclick={handleOpen}
            >
              <Maximize2 class="size-3" />
            </button>
          {/if}
        </span>
      </span>

      {#if isContainer && expanded}
        <div class="border-l border-border/30">
          {#each visibleEntries as [k, v] (k)}
            <JsonTree
              value={v}
              label={k}
              depth={depth + 1}
              {defaultDepth}
              {oncopy}
              {onopen}
            />
          {/each}
          {#if totalCount > childLimit}
            <button
              type="button"
              class="ml-5 my-0.5 rounded bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
              onclick={() => (childLimit += CHILD_PAGE)}
            >
              Show {Math.min(CHILD_PAGE, totalCount - childLimit)} more ({totalCount - childLimit} hidden)
            </button>
          {/if}
        </div>
        <span class="pl-5 text-muted-foreground">{isArray ? ']' : '}'}</span>
      {/if}
    </div>
  </div>
</div>
