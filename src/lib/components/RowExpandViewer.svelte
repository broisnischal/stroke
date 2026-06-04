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
  const HIGHLIGHT_LIMIT = 12000

  let {
    record,
    rowLabel = '',
  } = $props()

  let html = $state('')
  let copied = $state(false)
  /** @type {ReturnType<typeof setTimeout> | null} */
  let copiedTimer = null
  /** @type {HTMLDivElement | null} */
  let rootEl = $state(null)

  /** @type {{ x: number, y: number, value: string | null } | null} */
  let contextMenu = $state(null)

  const displayText = $derived(formatJsonValue(truncateDeep(record, TRUNCATE_LIMIT)))
  const appTheme = $derived($appThemeId)

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
    const theme = appTheme
    if (source.length > HIGHLIGHT_LIMIT) {
      html = `<pre class="m-0 p-0 font-mono text-[11px] leading-[1.55] whitespace-pre text-foreground">${escapeHtml(source)}</pre>`
      return
    }
    let cancelled = false
    highlightCode(source, 'json', theme)
      .then((result) => { if (!cancelled) html = result })
      .catch(() => {
        if (!cancelled)
          html = `<pre class="m-0 p-0 font-mono text-[11px] leading-[1.55] whitespace-pre text-foreground">${escapeHtml(source)}</pre>`
      })
    return () => { cancelled = true }
  })

  $effect(() => {
    if (!html || !rootEl) return
    const source = displayText
    if (source.length > HIGHLIGHT_LIMIT) return
    void tick().then(() => {
      const pre = rootEl?.querySelector('pre')
      if (pre instanceof HTMLElement) linkifyJsonInElement(pre, source)
    })
  })

  /** @param {string} s */
  function escapeHtml(s) {
    return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  }

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
  <!-- Compact toolbar -->
  <div class="flex items-center gap-1.5 border-b border-border/20 bg-muted/20 px-2.5 py-0.5">
    {#if rowLabel}
      <span class="font-mono text-[10px] text-muted-foreground/40 select-none">{rowLabel}</span>
      <span class="text-border/40 select-none text-[10px]">·</span>
    {/if}
    <button
      type="button"
      class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/60 transition-colors hover:bg-accent/40 hover:text-foreground"
      onclick={copyJson}
    >
      {#if copied}
        <Check class="size-2.5 text-green-500" />
        <span>Copied</span>
      {:else}
        <Copy class="size-2.5" />
        <span>Copy JSON</span>
      {/if}
    </button>
  </div>

  <!-- JSON content — grows to fit, no inner scroll -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={rootEl}
    data-studio-selectable="text"
    class="px-3 py-2"
    oncontextmenu={handleContextMenu}
  >
    {#if !html}
      <p class="font-mono text-[10px] text-muted-foreground/40">Loading…</p>
    {:else}
      <div
        class="[&_pre]:m-0 [&_pre]:bg-transparent! [&_pre]:p-0 [&_pre]:font-mono [&_pre]:text-[11px] [&_pre]:leading-[1.55] [&_pre]:whitespace-pre [&_.json-inspector-url]:text-link [&_.json-inspector-url]:underline [&_.json-inspector-url]:underline-offset-2"
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
          class="flex w-full items-center gap-2 px-2.5 py-1 text-left font-mono text-[11px] text-foreground hover:bg-accent hover:text-accent-foreground"
          onclick={() => { copyText(/** @type {string} */ (contextMenu?.value)); dismissMenu() }}
        >
          <Copy class="size-3 shrink-0 text-muted-foreground" />
          Copy value
        </button>
      {/if}
      <button
        type="button"
        class="flex w-full items-center gap-2 px-2.5 py-1 text-left font-mono text-[11px] text-foreground hover:bg-accent hover:text-accent-foreground"
        onclick={() => { copyJson(); dismissMenu() }}
      >
        <Copy class="size-3 shrink-0 text-muted-foreground" />
        Copy JSON
      </button>
    </div>
  </div>
{/if}
