// Which slice of a long list is worth rendering, and how much empty space to
// leave above and below it.
//
// The sidebar has four of these lists (tables, views, materialized views,
// databases) sharing one scroll container. Only the tables list was windowed;
// the others rendered a capped 500 rows, so a schema with ten thousand views
// either instantiated five hundred context menus or silently hid the rest. The
// maths is the same for all four, so it lives here once, as plain numbers with
// no DOM in sight - the component still owns measuring the row stride and each
// list's offset, because only it knows where its own <ul> sits.

/** Below this many rows, windowing costs more than it saves. */
export const VIRT_THRESHOLD = 40
/** Rows rendered beyond each edge of the viewport, so a fast scroll has slack. */
export const VIRT_BUFFER = 12

/**
 * @typedef {{
 *   count: number,
 *   scrollTop: number,
 *   viewportHeight: number,
 *   offsetTop: number,
 *   rowH: number,
 *   threshold?: number,
 *   buffer?: number,
 * }} VirtualWindowInput
 */

/**
 * @typedef {{
 *   virtualized: boolean,
 *   start: number,
 *   end: number,
 *   topPad: number,
 *   botPad: number,
 * }} VirtualWindowResult
 */

/**
 * The window to render for one list.
 *
 * `offsetTop` is the list's distance from the top of the scrolled content, so
 * `scrollTop - offsetTop` is how far into this list the viewport has reached:
 * negative while the list is still below the fold, larger than the list once it
 * has scrolled past. Both ends are clamped, which is what keeps a list that is
 * off screen from rendering a window at all.
 *
 * @param {VirtualWindowInput} input
 * @returns {VirtualWindowResult}
 */
export function virtualWindow(input) {
  const { count, scrollTop, viewportHeight, offsetTop, rowH } = input
  const threshold = input.threshold ?? VIRT_THRESHOLD
  const buffer = input.buffer ?? VIRT_BUFFER
  if (!Number.isFinite(count) || count <= 0) {
    return { virtualized: false, start: 0, end: 0, topPad: 0, botPad: 0 }
  }
  // A row stride of zero would divide by nothing and render the whole list;
  // treating it as "not measured yet" is the safe reading.
  if (count <= threshold || !(rowH > 0)) {
    return { virtualized: false, start: 0, end: count, topPad: 0, botPad: 0 }
  }
  const first = Math.floor((scrollTop - offsetTop) / rowH) - buffer
  const last = Math.ceil((scrollTop + viewportHeight - offsetTop) / rowH) + buffer
  const start = Math.min(count, Math.max(0, first))
  const end = Math.max(start, Math.min(count, last))
  return {
    virtualized: true,
    start,
    end,
    topPad: start * rowH,
    botPad: Math.max(0, (count - end) * rowH),
  }
}

/**
 * Distance from the top of a scroll container's content to one of its
 * descendants, measured from live rects.
 *
 * Walking `offsetParent` only terminated when an ancestor happened to be the
 * container, and any element that grew above the list left the offset stale and
 * small, which pushed the window past the real first visible row and rendered
 * the list's tail behind a giant empty spacer.
 *
 * @param {Element | null | undefined} el
 * @param {Element | null | undefined} container
 * @returns {number | null} null when either element is missing
 */
export function offsetWithin(el, container) {
  if (!el || !container) return null
  return el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
}

/**
 * Stride between two rendered rows, or null when fewer than two are on screen.
 * Measured rather than assumed: row height scales with the app zoom and the
 * platform font size, and drift between a guessed constant and reality, times
 * hundreds of rows, is phantom scroll space below the last row.
 *
 * @param {Element | null | undefined} listEl
 * @returns {number | null}
 */
export function measureRowStride(listEl) {
  if (!listEl) return null
  // Spacer rows are aria-hidden; measure between two real ones.
  const rows = /** @type {NodeListOf<HTMLElement>} */ (listEl.querySelectorAll('li:not([aria-hidden])'))
  if (rows.length < 2) return null
  const stride = rows[1].offsetTop - rows[0].offsetTop
  return stride > 10 ? stride : null
}
