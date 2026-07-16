<script>
  /**
   * Windowed monospace code viewer — renders only the visible lines (plus a
   * small overscan), so documents with hundreds of thousands of lines scroll
   * smoothly with a flat memory footprint. Lines are produced lazily through
   * `lineHtml(idx)` (already-escaped HTML, e.g. from highlightJsonHtml), so
   * nothing is tokenized or even stringified until it scrolls into view.
   *
   * Trade-off vs a real editor: no folding, and text selection only spans the
   * mounted window — callers should provide a Copy action for the full text.
   */
  let {
    /** Total number of lines. */
    count = 0,
    /** @type {(idx: number) => string} Safe HTML for one line ('' for empty). */
    lineHtml = (_idx) => '',
    /** Longest line length in chars (estimate ok) — sizes the horizontal scroll. */
    maxChars = 80,
    lineNumbers = true,
  } = $props()

  const LINE_H = 20
  const OVERSCAN = 12

  /** @type {HTMLElement | null} */
  let container = $state(null)
  let scrollTop = $state(0)
  let clientHeight = $state(0)

  const start = $derived(Math.max(0, Math.floor(scrollTop / LINE_H) - OVERSCAN))
  const end = $derived(Math.min(count, Math.ceil((scrollTop + clientHeight) / LINE_H) + OVERSCAN))
  const visible = $derived.by(() => {
    const out = []
    for (let i = start; i < end; i++) out.push(i)
    return out
  })

  const gutterCh = $derived(Math.max(3, String(count).length))

  // Keep the viewport valid when the document shrinks (e.g. a JSONPath filter).
  $effect(() => {
    void count
    if (container && container.scrollTop > Math.max(0, count * LINE_H - clientHeight)) {
      container.scrollTop = 0
    }
  })

  function onScroll() {
    if (container) scrollTop = container.scrollTop
  }
</script>

<div
  bind:this={container}
  bind:clientHeight
  class="app-scroll relative min-h-0 flex-1 select-text overflow-auto bg-panel font-mono text-ui-xs"
  onscroll={onScroll}
>
  <!-- Spacer establishes full scroll height/width without rendering anything. -->
  <div
    class="relative"
    style="height: {count * LINE_H}px; min-width: calc({maxChars}ch + {lineNumbers ? gutterCh + 3 : 0}ch + 2rem)"
  >
    {#each visible as idx (idx)}
      <div
        class="absolute left-0 flex w-full min-w-max items-stretch"
        style="top: {idx * LINE_H}px; height: {LINE_H}px; line-height: {LINE_H}px"
      >
        {#if lineNumbers}
          <span
            class="sticky left-0 z-10 shrink-0 select-none bg-panel pr-3 text-right tabular-nums text-muted-foreground/35"
            style="width: {gutterCh + 3}ch"
          >{idx + 1}</span>
        {/if}
        <span class="whitespace-pre pr-8 text-foreground/90">{@html lineHtml(idx)}</span>
      </div>
    {/each}
  </div>
</div>
