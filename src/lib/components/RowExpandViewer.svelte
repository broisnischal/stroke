<script>
  import { tick } from 'svelte'
  import Copy from '@lucide/svelte/icons/copy'
  import Check from '@lucide/svelte/icons/check'
  import { appThemeId } from '$lib/stores/settings.js'
  import { highlightCode } from '$lib/shiki-highlighter.js'
  import { formatJsonValue } from '$lib/row-inspector.js'
  import { linkifyJsonInElement } from '$lib/json-inspector.js'

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
  /** True only when content actually overflows the max-height — flips overflow:auto on. */
  let scrollable = $state(false)

  /**
   * Measure whether content exceeds the viewer's max-height.
   *
   * Why: in WebKitGTK an element with `overflow:auto` claims wheel events even
   * when content fits — so short JSON would absorb wheel and the table couldn't
   * scroll. By only enabling overflow:auto when content genuinely overflows, we
   * keep the wheel routing clean.
   */
  function remeasure() {
    if (!rootEl) return
    // scrollHeight is the natural content height regardless of overflow style.
    // clientHeight is the rendered box height (which max-height caps).
    scrollable = rootEl.scrollHeight > rootEl.clientHeight + 1
  }

  /** Full JSON — used for copying. */
  const jsonText = $derived(formatJsonValue(record))

  /** JSON with long strings truncated — used for display / highlighting. */
  const displayText = $derived(formatJsonValue(truncateDeep(record, TRUNCATE_LIMIT)))

  const appTheme = $derived($appThemeId)

  /**
   * Recursively truncate string values longer than `limit` chars.
   * Copies the structure; does not mutate the original.
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

  // ResizeObserver catches viewport/font-size changes that affect max-height (vh, rem).
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
</script>

<!--
  Plain block layout with `max-height` on the scroll container itself.
  Critical UX insight: the expand area should size to its CONTENT, not to a
  fixed height. Fixed-height made the area huge even for tiny JSON, and the
  empty area still counted as `overflow:auto` territory — WebKit absorbed
  wheel events there even with nothing to scroll, blocking table scroll.

  With max-height:
    Short JSON  → rootEl is content-sized, no overflow exists, wheel events
                  bubble up naturally and scroll the table.
    Tall JSON   → rootEl is capped at max-height, content overflows, browser
                  creates a real scroll viewport; overscroll-behavior keeps
                  the scroll local once the user is actively scrolling JSON.
-->
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
  <!--
    overflow toggles dynamically:
      - scrollable=false → overflow:visible. Not a scroll container. Wheel events
        bubble up and scroll the table.
      - scrollable=true  → overflow:auto with scroll chaining (default
        overscroll-behavior). When the user scrolls past the top or bottom of
        the JSON, the scroll continues into the table seamlessly.
  -->
  <div
    bind:this={rootEl}
    data-studio-selectable="text"
    class="px-3 py-2"
    style="display:block;max-height:{maxHeight};overflow:{scrollable ? 'auto' : 'visible'}"
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
