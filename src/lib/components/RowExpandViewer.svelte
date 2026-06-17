<script>
  import { tick } from 'svelte'
  import Copy from '@lucide/svelte/icons/copy'
  import Check from '@lucide/svelte/icons/check'
  import WrapText from '@lucide/svelte/icons/wrap-text'
  import { formatJsonValue } from '$lib/row-inspector.js'
  import {
    escapeHtml,
    highlightJson,
    linkifyJsonInElement,
    getTextOffsetInRoot,
    getJsonValueRangeAtOffset,
  } from '$lib/json-inspector.js'

  const TRUNCATE_LIMIT = 200
  const HIGHLIGHT_LIMIT = 12000

  let {
    record,
    rowLabel = '',
  } = $props()

  let html = $state('')
  const WRAP_KEY = 'stroke:json-word-wrap'
  function loadWrap() {
    try { return localStorage.getItem(WRAP_KEY) === 'true' } catch { return false }
  }

  let copied = $state(false)
  let wordWrap = $state(loadWrap())
  /** @type {ReturnType<typeof setTimeout> | null} */
  let copiedTimer = null
  /** @type {HTMLDivElement | null} */
  let rootEl = $state(null)

  /** @type {{ x: number, y: number, value: string | null } | null} */
  let contextMenu = $state(null)

  const displayText = $derived(formatJsonValue(truncateDeep(record, TRUNCATE_LIMIT)))

  function fullJsonText() {
    return formatJsonValue(record)
  }

  /**
   * @param {unknown} value
   * @param {number} limit
   * @returns {unknown}
   */
  function truncateDeep(value, limit) {
    if (typeof value === 'string') {
      return value.length > limit ? value.slice(0, limit) + '…' : value
    }
    if (Array.isArray(value)) {
      return value.map((v) => truncateDeep(v, limit))
    }
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(/** @type {Record<string, unknown>} */ (value)).map(([k, v]) => [
          k,
          truncateDeep(v, limit),
        ])
      )
    }
    return value
  }

  $effect(() => {
    const source = displayText
    // Above the limit, skip per-token spans entirely — plain escaped text keeps
    // very large values cheap to render.
    html = source.length > HIGHLIGHT_LIMIT
      ? `<pre class="m-0 p-0 font-mono text-sm leading-relaxed whitespace-pre text-foreground">${escapeHtml(source)}</pre>`
      : highlightJson(source)
  })

  // keep the wordWrap reactive — the pre's whitespace class is toggled via CSS var
  const wrapClass = $derived(wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre')

  $effect(() => {
    if (!html || !rootEl) return
    const source = displayText
    if (source.length > HIGHLIGHT_LIMIT) return
    void tick().then(() => {
      const pre = rootEl?.querySelector('pre')
      if (pre instanceof HTMLElement) linkifyJsonInElement(pre, source)
    })
  })

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(fullJsonText())
      copied = true
      if (copiedTimer) clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => { copied = false }, 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  /** @param {string} text */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text)
      copied = true
      if (copiedTimer) clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => { copied = false }, 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @returns {string | null}
   */
  function valueAtPoint(clientX, clientY) {
    const pre = rootEl?.querySelector('pre')
    if (!pre) return null

    /** @type {Node | null} */
    let node = null
    let offset = 0

    if ('caretPositionFromPoint' in document) {
      const pos = /** @type {any} */ (document).caretPositionFromPoint(clientX, clientY)
      if (pos) { node = pos.offsetNode; offset = pos.offset }
    } else if ('caretRangeFromPoint' in document) {
      const r = /** @type {any} */ (document).caretRangeFromPoint(clientX, clientY)
      if (r) { node = r.startContainer; offset = r.startOffset }
    }

    if (!node || !pre.contains(node)) return null

    const srcOffset = getTextOffsetInRoot(pre, node, offset)
    const range = getJsonValueRangeAtOffset(displayText, srcOffset)
    if (!range) return null

    const raw = displayText.slice(range.start, range.end)

    if (raw.length >= 2 && raw[0] === '"' && raw[raw.length - 1] === '"') {
      try {
        const parsed = JSON.parse(raw)
        if (typeof parsed === 'string') return parsed
      } catch {
        return raw.slice(1, -1)
      }
    }

    return raw
  }

  /** @param {MouseEvent} e */
  function handleContextMenu(e) {
    e.preventDefault()
    const value = valueAtPoint(e.clientX, e.clientY)
    contextMenu = { x: e.clientX, y: e.clientY, value }
  }

  function dismissMenu() {
    contextMenu = null
  }

  /**
   * When wrap is off the box is `overflow-x-auto`, which makes the browser
   * promote `overflow-y` to `auto` too — turning it into a nested scroll
   * container. WebKitGTK won't chain a trapped vertical wheel up to the
   * virtual-scroll table, so vertical scrolling stalls over the JSON. Forward
   * vertical deltas to the table's native scroller; leave genuine horizontal
   * gestures to scroll the JSON box itself. (With wrap on the box isn't a
   * scroll container, so native chaining handles everything smoothly and this
   * never runs.)
   * @param {WheelEvent} e
   */
  function handleWheel(e) {
    const el = rootEl
    if (!el) return
    const canScrollH = el.scrollWidth > el.clientWidth
    if (!canScrollH) return // not a scroll trap — let native chaining scroll the table
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return // horizontal gesture → scroll the JSON
    const scroller = el.closest('[data-canvas-table]')
    if (!(scroller instanceof HTMLElement)) return
    // Normalize line/page deltas to pixels so forwarded scroll matches native feel.
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? scroller.clientHeight : 1
    if (e.shiftKey) scroller.scrollLeft += (e.deltaY || e.deltaX) * unit
    else scroller.scrollTop += e.deltaY * unit
    e.preventDefault()
  }

  /**
   * @param {HTMLElement} node
   */
  function portal(node) {
    document.body.appendChild(node)
    return {
      destroy() {
        if (node.isConnected) node.remove()
      },
    }
  }
</script>

<div class="border-t border-border/30 bg-background">
  <!-- Toolbar -->
  <div class="flex items-center gap-2 border-b border-border/20 bg-muted/20 px-3 py-1">
    {#if rowLabel}
      <span class="font-mono text-xs text-muted-foreground/40 select-none">{rowLabel}</span>
      <span class="text-border/40 select-none text-xs">·</span>
    {/if}
    <button
      type="button"
      class="inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-mono text-xs text-muted-foreground/60 transition-colors hover:bg-accent/40 hover:text-foreground"
      onclick={copyJson}
    >
      {#if copied}
        <Check class="size-3 text-green-500" />
        <span>Copied</span>
      {:else}
        <Copy class="size-3" />
        <span>Copy JSON</span>
      {/if}
    </button>
    <button
      type="button"
      title="Toggle word wrap"
      class={[
        'inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-mono text-xs transition-colors hover:bg-accent/40 hover:text-foreground',
        wordWrap ? 'text-foreground bg-accent/30' : 'text-muted-foreground/60',
      ].join(' ')}
      onclick={() => {
        wordWrap = !wordWrap
        try { localStorage.setItem(WRAP_KEY, String(wordWrap)) } catch { /* ignore */ }
      }}
    >
      <WrapText class="size-3" />
      <span>Wrap</span>
    </button>
  </div>

  <!-- JSON content -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={rootEl}
    data-studio-selectable="text"
    class={['px-5 py-2', wordWrap ? '' : 'overflow-x-auto'].join(' ')}
    onwheel={handleWheel}
    oncontextmenu={handleContextMenu}
  >
    {#if !html}
      <p class="font-mono text-sm text-muted-foreground/40">Loading…</p>
    {:else}
      <div
        class="[&_pre]:m-0 [&_pre]:bg-transparent! [&_pre]:p-0 [&_pre]:font-mono [&_pre]:text-sm [&_pre]:leading-relaxed [&_.json-inspector-url]:text-link [&_.json-inspector-url]:hover:underline [&_.json-inspector-url]:underline-offset-2 {wrapClass === 'whitespace-pre-wrap break-all' ? '[&_pre]:whitespace-pre-wrap [&_pre]:break-all' : '[&_pre]:whitespace-pre'}"
      >
        {@html html}
      </div>
    {/if}
  </div>
</div>

<!-- context menu — portalled to body to escape will-change:transform on DataTable -->
{#if contextMenu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    use:portal
    style="position:fixed;inset:0;z-index:9999"
    onmousedown={dismissMenu}
    oncontextmenu={(e) => e.preventDefault()}
  >
    <div
      class="min-w-36 overflow-hidden rounded border border-border/60 bg-popover py-0.5 shadow-lg"
      style="position:fixed;left:{contextMenu.x}px;top:{contextMenu.y}px"
      onmousedown={(e) => e.stopPropagation()}
    >
      {#if contextMenu.value !== null}
        <button
          type="button"
          class="flex w-full items-center gap-2 px-2.5 py-1 text-left font-mono text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
          onclick={() => { copyText(/** @type {string} */ (contextMenu?.value)); dismissMenu() }}
        >
          <Copy class="size-3 shrink-0 text-muted-foreground" />
          Copy value
        </button>
      {/if}
      <button
        type="button"
        class="flex w-full items-center gap-2 px-2.5 py-1 text-left font-mono text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
        onclick={() => { copyJson(); dismissMenu() }}
      >
        <Copy class="size-3 shrink-0 text-muted-foreground" />
        Copy JSON
      </button>
    </div>
  </div>
{/if}
