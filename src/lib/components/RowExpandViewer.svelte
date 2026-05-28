<script>
  import { tick } from 'svelte'
  import Copy from '@lucide/svelte/icons/copy'
  import Check from '@lucide/svelte/icons/check'
  import { appThemeId } from '$lib/stores/settings.js'
  import { highlightCode } from '$lib/shiki-highlighter.js'
  import { formatJsonValue } from '$lib/row-inspector.js'
  import {
    linkifyJsonInElement,
    getTextOffsetInRoot,
    getJsonValueRangeAtOffset,
  } from '$lib/json-inspector.js'

  const TRUNCATE_LIMIT = 200

  let {
    record,
    rowLabel = '',
    maxHeight = 'min(50vh, 20rem)',
  } = $props()

  let html = $state('')
  let copied = $state(false)
  /** @type {ReturnType<typeof setTimeout> | null} */
  let copiedTimer = null
  /** @type {HTMLDivElement | null} */
  let rootEl = $state(null)
  let scrollable = $state(false)

  /** @type {{ x: number, y: number, value: string | null } | null} */
  let contextMenu = $state(null)

  function remeasure() {
    if (!rootEl) return
    scrollable = rootEl.scrollHeight > rootEl.clientHeight + 1
  }

  const jsonText = $derived(formatJsonValue(record))
  const displayText = $derived(formatJsonValue(truncateDeep(record, TRUNCATE_LIMIT)))
  const appTheme = $derived($appThemeId)

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
    const theme = appTheme
    let cancelled = false
    highlightCode(source, 'json', theme)
      .then((result) => { if (!cancelled) html = result })
      .catch(() => {
        if (!cancelled)
          html = `<pre class="m-0 p-0 font-mono text-ui-2xs leading-relaxed whitespace-pre text-foreground">${escapeHtml(source)}</pre>`
      })
    return () => { cancelled = true }
  })

  $effect(() => {
    if (!html || !rootEl) return
    const source = displayText
    void tick().then(() => {
      const pre = rootEl?.querySelector('pre')
      if (pre instanceof HTMLElement) linkifyJsonInElement(pre, source)
      remeasure()
    })
  })

  $effect(() => {
    if (!rootEl) return
    const ro = new ResizeObserver(remeasure)
    ro.observe(rootEl)
    return () => ro.disconnect()
  })

  /** @param {string} s */
  function escapeHtml(s) {
    return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(jsonText)
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
   * Find the JSON value text at a mouse click position.
   * Returns the raw source slice, with surrounding quotes stripped for strings.
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

    // Strip surrounding double-quotes for JSON strings
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
   * Portal action — moves the element to document.body so it escapes any
   * `will-change:transform` ancestor (DataTable uses it for scroll perf),
   * which otherwise makes position:fixed relative to that ancestor.
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

<div class="border-t border-border/50 bg-background">
  <div class="studio-chrome flex items-center justify-between border-b border-border/50 bg-panel px-3 py-0.5">
    {#if rowLabel}
      <span class="font-mono text-ui-2xs text-muted-foreground/40 select-none">{rowLabel}</span>
    {/if}
    <button
      type="button"
      class="mr-auto inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-ui-2xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      onclick={copyJson}
    >
      {#if copied}
        <Check class="size-3 text-green-500" />
        Copied
      {:else}
        <Copy class="size-3" />
        Copy JSON
      {/if}
    </button>
  </div>

  <div
    bind:this={rootEl}
    data-studio-selectable="text"
    class="px-3 py-2"
    style="display:block;max-height:{maxHeight};overflow:{scrollable ? 'auto' : 'visible'}"
    oncontextmenu={handleContextMenu}
  >
    {#if !html}
      <p class="font-mono text-ui-2xs text-muted-foreground/50">Loading…</p>
    {:else}
      <div
        class="[&_pre]:m-0 [&_pre]:bg-transparent! [&_pre]:p-0 [&_pre]:font-mono [&_pre]:text-ui-2xs [&_pre]:leading-relaxed [&_pre]:whitespace-pre [&_.json-inspector-url]:text-link [&_.json-inspector-url]:underline [&_.json-inspector-url]:underline-offset-2"
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
      class="min-w-40 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-lg"
      style="position:fixed;left:{contextMenu.x}px;top:{contextMenu.y}px"
      onmousedown={(e) => e.stopPropagation()}
    >
      {#if contextMenu.value !== null}
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ui-sm text-foreground hover:bg-accent hover:text-accent-foreground"
          onclick={() => { copyText(/** @type {string} */ (contextMenu?.value)); dismissMenu() }}
        >
          <Copy class="size-3.5 shrink-0 text-muted-foreground" />
          Copy value
        </button>
      {/if}
      <button
        type="button"
        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ui-sm text-foreground hover:bg-accent hover:text-accent-foreground"
        onclick={() => { copyJson(); dismissMenu() }}
      >
        <Copy class="size-3.5 shrink-0 text-muted-foreground" />
        Copy JSON
      </button>
    </div>
  </div>
{/if}
