<script>
  import { cn } from '$lib/utils.js'

  let {
    /** @type {'x' | 'y'} */
    axis = 'x',
    /** @type {'start' | 'end'} */
    edge = 'end',
    onresizestart = () => {},
    onresize = () => {},
    onresizeend = () => {},
  } = $props()

  /** @param {PointerEvent} e */
  function handlePointerDown(e) {
    if (e.button !== 0) return
    e.preventDefault()
    onresizestart()
    const el = /** @type {HTMLElement} */ (e.currentTarget)
    el.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startY = e.clientY

    /** @param {PointerEvent} ev */
    function onMove(ev) {
      const delta = axis === 'x' ? ev.clientX - startX : ev.clientY - startY
      onresize(edge === 'end' ? delta : -delta)
    }

    /** @param {PointerEvent} ev */
    function onUp(ev) {
      el.releasePointerCapture(ev.pointerId)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      onresizeend()
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }

  const STEP = 20 // px per arrow key press

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    let delta = 0
    if (axis === 'x') {
      if (e.key === 'ArrowRight') delta = STEP
      else if (e.key === 'ArrowLeft') delta = STEP * -1
    } else {
      if (e.key === 'ArrowDown') delta = STEP
      else if (e.key === 'ArrowUp') delta = STEP * -1
    }
    if (!delta) return
    e.preventDefault()
    onresizestart()
    onresize(edge === 'end' ? delta : -delta)
    onresizeend()
  }
</script>

<!-- A resize splitter is a focusable, keyboard/pointer-operable control; the
     separator role is correct here even though Svelte flags it as non-interactive. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  role="separator"
  aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
  aria-label="Resize panel"
  tabindex="0"
  class={cn(
    'group relative z-10 shrink-0 touch-none select-none focus-visible:outline-none',
    axis === 'x' ? 'h-full w-1 cursor-col-resize' : 'h-1 w-full cursor-row-resize',
  )}
  onpointerdown={handlePointerDown}
  onkeydown={handleKeydown}
>
  <div
    class={cn(
      'absolute rounded-full bg-border/40 transition-colors group-hover:bg-primary/60 group-active:bg-primary group-focus-visible:bg-primary/70',
      axis === 'x' && 'inset-y-2 w-0.5 left-1/2 -translate-x-1/2',
      axis === 'y' && 'inset-x-2 h-0.5 top-1/2 -translate-y-1/2',
    )}
  ></div>
</div>
