/**
 * The app's own eased scrolling, used by the grid and the sidebar unless the user
 * turns native scrolling on (Settings → Appearance).
 *
 * Wheel ticks are accumulated into a target offset and the element is walked
 * toward it one animation frame at a time, so a notch glides instead of jumping.
 * Native scrolling is the escape hatch: an OS that already does momentum well
 * (macOS trackpads), or an input method whose behaviour we have no business
 * overriding, is better left alone.
 *
 * Cost of admission, and why this is opt-out rather than opt-in everywhere:
 * animating the offset ourselves means a NON-PASSIVE wheel listener, which puts
 * the main thread in front of every wheel tick. The canvas grid is sensitive to
 * exactly that (see DataTable's wheel effect), so the listener is attached only
 * while eased scrolling is actually enabled, and the grid keeps repainting off
 * `scroll` events as before - this module only moves scrollTop.
 */

/** Fraction of the remaining distance covered per frame. */
const EASE = 0.22
/** Below this many pixels the animation stops and snaps. */
const EPSILON = 0.5
/** A "line" of wheel delta, for deltaMode 1 (Firefox / some Linux mice). */
const LINE_PX = 16
/** Ceiling on the queued distance, so spinning the wheel can't wind up seconds of travel. */
const MAX_PENDING_SCREENS = 3

/**
 * Wheel delta in CSS pixels. Wheel events arrive in pixels, lines or pages
 * depending on the browser and device; a scroller that assumes pixels moves by a
 * few pixels per notch on the ones that don't.
 * @param {WheelEvent} e @param {number} viewport size of the scrollport along this axis
 * @returns {{ dx: number, dy: number }}
 */
export function wheelPixels(e, viewport) {
  const scale = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? Math.max(1, viewport) : 1
  return { dx: e.deltaX * scale, dy: e.deltaY * scale }
}

/**
 * Eased scroller bound to one element.
 * @param {HTMLElement} el
 * @returns {{
 *   push: (dx: number, dy: number) => void,
 *   sync: () => void,
 *   stop: () => void,
 *   animating: () => boolean,
 * }}
 */
export function createSmoothScroll(el) {
  // The animation keeps its OWN float position rather than reading scrollTop back
  // each frame. An element quantizes the offset it was given, so a step small
  // enough to round away (a trackpad tick, or the tail of any ease) would leave
  // the measured distance unchanged: the loop then runs forever without moving
  // and scrolling appears dead. Owning the float means every frame makes progress
  // and the animation always converges.
  let targetTop = el.scrollTop
  let targetLeft = el.scrollLeft
  let curTop = targetTop
  let curLeft = targetLeft
  let raf = 0

  const maxTop = () => Math.max(0, el.scrollHeight - el.clientHeight)
  const maxLeft = () => Math.max(0, el.scrollWidth - el.clientWidth)
  const clamp = (/** @type {number} */ v, /** @type {number} */ max) => (v < 0 ? 0 : v > max ? max : v)
  /** Someone who asked for less motion gets none: jump, don't ease. */
  const reduceMotion = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  /** Adopt the element's current position - after a programmatic jump, a drag of
   *  the scrollbar, or a keyboard scroll, our position is stale and would yank the
   *  view back to where the wheel had last aimed it. */
  function sync() {
    targetTop = el.scrollTop
    targetLeft = el.scrollLeft
    curTop = targetTop
    curLeft = targetLeft
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  function frame() {
    const dTop = targetTop - curTop
    const dLeft = targetLeft - curLeft
    if (Math.abs(dTop) < EPSILON && Math.abs(dLeft) < EPSILON) {
      curTop = targetTop
      curLeft = targetLeft
      // Land on a whole pixel: the grid draws text at integer offsets, and a
      // fractional one makes WebKit re-antialias every glyph.
      el.scrollTop = Math.round(curTop)
      el.scrollLeft = Math.round(curLeft)
      raf = 0
      return
    }
    // Re-clamp as we go: content can shrink under us (a filter, a smaller page).
    curTop = clamp(curTop + dTop * EASE, maxTop())
    curLeft = clamp(curLeft + dLeft * EASE, maxLeft())
    el.scrollTop = curTop
    el.scrollLeft = curLeft
    raf = requestAnimationFrame(frame)
  }

  /** Queue `dx`/`dy` pixels of travel and keep the animation running. */
  function push(dx, dy) {
    // Anything that moved the element without going through us (keyboard,
    // scrollbar drag, scrollIntoView) has to be adopted before adding to it.
    if (!raf) sync()
    const capY = Math.max(1, el.clientHeight) * MAX_PENDING_SCREENS
    const capX = Math.max(1, el.clientWidth) * MAX_PENDING_SCREENS
    if (dy) targetTop = clamp(Math.min(curTop + capY, Math.max(curTop - capY, targetTop + dy)), maxTop())
    if (dx) targetLeft = clamp(Math.min(curLeft + capX, Math.max(curLeft - capX, targetLeft + dx)), maxLeft())
    if (reduceMotion()) {
      stop()
      curTop = targetTop
      curLeft = targetLeft
      el.scrollTop = Math.round(curTop)
      el.scrollLeft = Math.round(curLeft)
      return
    }
    if (!raf) raf = requestAnimationFrame(frame)
  }

  return { push, sync, stop, animating: () => raf !== 0 }
}

/**
 * Svelte action: eased wheel scrolling for a plain overflow container (the
 * sidebar and the other scrolling panels). The grid drives `createSmoothScroll`
 * itself, because its wheel handling also owns ctrl-zoom and shift-to-pan.
 *
 * `enabled` is reactive - pass `!$appNativeScroll`. When false the listener is
 * removed entirely, leaving the OS in charge with nothing of ours in the path.
 *
 * @param {HTMLElement} node
 * @param {{ enabled?: boolean, axis?: 'y' | 'x' | 'both' }} [params]
 */
export function smoothScroll(node, params = {}) {
  let enabled = params.enabled !== false
  let axis = params.axis ?? 'y'
  let scroller = createSmoothScroll(node)

  /** @param {WheelEvent} e */
  function onWheel(e) {
    // Ctrl+wheel is a zoom gesture (app zoom / trackpad pinch), never a scroll.
    if (e.ctrlKey || e.metaKey) return
    // Let a nested scroller that can actually move have the event.
    const inner = e.target instanceof Element ? e.target.closest('[data-native-scroll]') : null
    if (inner && inner !== node) return
    const { dx, dy } = wheelPixels(e, node.clientHeight)
    const wantX = axis === 'x' || (axis === 'both' && Math.abs(dx) > Math.abs(dy)) || (axis === 'y' && e.shiftKey)
    const canScrollY = node.scrollHeight > node.clientHeight
    const canScrollX = node.scrollWidth > node.clientWidth
    if (wantX) {
      if (!canScrollX) return
      // Shift+wheel arrives as vertical delta; on the x axis it IS the movement.
      e.preventDefault()
      scroller.push(dx || dy, 0)
      return
    }
    if (!canScrollY) return
    e.preventDefault()
    scroller.push(0, dy)
  }

  // A press interrupts coasting: grabbing the scrollbar, or clicking something
  // while the tail of an ease is still running, should take effect now rather than
  // fight an animation that's still writing the offset.
  const onInterrupt = () => { scroller.stop(); scroller.sync() }

  function attach() {
    node.addEventListener('wheel', onWheel, { passive: false })
    node.addEventListener('pointerdown', onInterrupt, { passive: true })
  }
  function detach() {
    node.removeEventListener('wheel', onWheel)
    node.removeEventListener('pointerdown', onInterrupt)
    scroller.stop()
  }
  // Any scroll we didn't cause invalidates the target we were easing toward.
  /** @param {Event} _e */
  const onScroll = (_e) => { if (!scroller.animating()) scroller.sync() }
  node.addEventListener('scroll', onScroll, { passive: true })
  if (enabled) attach()

  return {
    /** @param {{ enabled?: boolean, axis?: 'y' | 'x' | 'both' }} next */
    update(next = {}) {
      const nextEnabled = next.enabled !== false
      axis = next.axis ?? axis
      if (nextEnabled === enabled) return
      enabled = nextEnabled
      if (enabled) { scroller.sync(); attach() } else detach()
    },
    destroy() {
      detach()
      node.removeEventListener('scroll', onScroll)
    },
  }
}
