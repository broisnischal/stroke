/**
 * Editor-style back/forward navigation over *cursor positions*.
 *
 * A text editor's "Go Back" doesn't just re-open the previous file - it puts the
 * caret back on the line you left. This module is that idea for the grid: an
 * entry is a tab plus the focused cell inside it, so returning to a table lands
 * on the exact row/column you were on rather than at the top.
 *
 * Two properties matter more here than any feature:
 *
 * - **Roaming is free.** Stepping cell to cell with the arrow keys must not
 *   allocate. The caller refreshes `navCurrent(stack)` in place (an O(1) field
 *   write) and only calls `pushNav` when the cursor actually *jumps*, so a long
 *   browse never touches the array.
 * - **The stack is plain data.** No `$state`, no proxies. The shell mirrors only
 *   the two booleans the back/forward buttons need, so moving the cursor can
 *   never invalidate a reactive graph or trigger a re-render.
 */

/**
 * One visited position.
 * @typedef {object} NavEntry
 * @property {string} tabId
 * @property {number | null} row - focused row index within `page`
 * @property {number | null} col - focused column index, in *visible* column space
 * @property {number | null} page - 1-based page the row belongs to
 */

/** @typedef {{ entries: NavEntry[], index: number }} NavStack */

/**
 * Hard cap on retained positions. Nobody retraces 50 jumps, and each entry is
 * four scalars - so this bounds the feature's memory at a few kilobytes no
 * matter how long the session runs.
 */
export const NAV_MAX = 50

/**
 * How far the cursor must move inside one page to count as a jump rather than
 * roaming. Below this the current entry is only refreshed, so arrow-key
 * navigation can't fill the stack with near-identical rows. (VS Code uses 10
 * lines for the same purpose; a grid row is denser, so 12.)
 */
export const NAV_ROW_GAP = 12

/** @returns {NavStack} */
export function createNavStack() {
  return { entries: [], index: -1 }
}

/**
 * The entry the cursor is sitting on, or null on an empty stack. Callers mutate
 * the returned object in place to keep it level with the live cursor.
 * @param {NavStack} s
 * @returns {NavEntry | null}
 */
export function navCurrent(s) {
  return s.index >= 0 && s.index < s.entries.length ? s.entries[s.index] : null
}

/** @param {NavStack} s */
export function navCanGoBack(s) {
  return s.index > 0
}

/** @param {NavStack} s */
export function navCanGoForward(s) {
  return s.index >= 0 && s.index < s.entries.length - 1
}

/**
 * Is moving from `from` to `to` a jump worth its own history entry?
 *
 * A different tab or page always is. Within one page it takes NAV_ROW_GAP rows.
 * A null row on either side means "no position yet" and is never a jump - that
 * keeps a reload (which clears the focus) from spuriously pushing an entry.
 *
 * @param {NavEntry} from
 * @param {{ tabId?: string, row: number | null, page?: number | null }} to
 */
export function isNavJump(from, to) {
  if (to.tabId !== undefined && to.tabId !== from.tabId) return true
  if (from.row === null || to.row === null) return false
  if (to.page != null && from.page != null && to.page !== from.page) return true
  return Math.abs(to.row - from.row) >= NAV_ROW_GAP
}

/** Record `live` as a new position. */
export const NAV_PUSH = 'push'
/** Record arrival in a different tab; the cell is not known yet. */
export const NAV_PUSH_TAB = 'push-tab'
/** Keep the current entry level with the cursor. */
export const NAV_REFRESH = 'refresh'
/** The page moved out from under the remembered row - drop the cell, keep the tab. */
export const NAV_FORGET_CELL = 'forget-cell'
/** Nothing to record. */
export const NAV_IGNORE = 'ignore'

/**
 * Decide what the history should do about the cursor now being at `live`.
 *
 * Split out from the caller's effect because this is the fiddly part - null
 * cursors, page drift, and the jump threshold all interact - and it deserves
 * tests of its own. Returns a string rather than an action object so that the
 * common case (roaming, one call per keypress) allocates nothing.
 *
 * @param {NavEntry | null} cur - the entry the cursor is on
 * @param {NavEntry} live - where the cursor actually is
 * @returns {typeof NAV_PUSH | typeof NAV_PUSH_TAB | typeof NAV_REFRESH | typeof NAV_FORGET_CELL | typeof NAV_IGNORE}
 */
export function navTransition(cur, live) {
  if (!cur) return NAV_PUSH
  if (cur.tabId !== live.tabId) return NAV_PUSH_TAB
  if (live.row === null) {
    // A cleared cursor (reload, filter change) must not erase a remembered
    // position. Unless the page moved under it: a row index is page-relative, so
    // a row remembered from another page means nothing, and restoring it would
    // bounce the tab back to that page - and refetch it - on the way in.
    return cur.page != null && live.page !== cur.page ? NAV_FORGET_CELL : NAV_IGNORE
  }
  return isNavJump(cur, live) ? NAV_PUSH : NAV_REFRESH
}

/**
 * Record arrival at `entry`. Any forward branch is dropped first - once you
 * diverge from a path there is nothing left to redo, same as a browser.
 * @param {NavStack} s
 * @param {NavEntry} entry
 */
export function pushNav(s, entry) {
  if (s.entries.length > s.index + 1) s.entries.length = s.index + 1
  s.entries.push(entry)
  if (s.entries.length > NAV_MAX) s.entries.splice(0, s.entries.length - NAV_MAX)
  s.index = s.entries.length - 1
}

/**
 * Step back one position. Returns the entry to travel to, or null if there is
 * nowhere to go.
 * @param {NavStack} s
 * @param {(tabId: string) => boolean} isAlive
 * @returns {NavEntry | null}
 */
export function navStepBack(s, isAlive) {
  return navStep(s, -1, isAlive)
}

/**
 * Step forward one position.
 * @param {NavStack} s
 * @param {(tabId: string) => boolean} isAlive
 * @returns {NavEntry | null}
 */
export function navStepForward(s, isAlive) {
  return navStep(s, 1, isAlive)
}

/**
 * Walk one step in `dir`, dropping entries whose tab has since been closed.
 *
 * Pruning is lazy on purpose: closing tabs stays O(1) and a dead entry is paid
 * for once, only if you actually walk into it. Eagerly sweeping the stack on
 * every tab close would do the same work far more often, for nothing.
 *
 * @param {NavStack} s
 * @param {-1 | 1} dir
 * @param {(tabId: string) => boolean} isAlive
 * @returns {NavEntry | null}
 */
function navStep(s, dir, isAlive) {
  let i = s.index + dir
  while (i >= 0 && i < s.entries.length) {
    if (isAlive(s.entries[i].tabId)) {
      s.index = i
      return s.entries[i]
    }
    s.entries.splice(i, 1)
    // Removing an entry *before* the cursor shifts the cursor down with it, and
    // leaves the next candidate at i-1. Removing one after it leaves the cursor
    // alone and slides the next candidate into i, so i stays put.
    if (dir === -1) {
      s.index -= 1
      i -= 1
    }
  }
  if (s.index >= s.entries.length) s.index = s.entries.length - 1
  return null
}

/**
 * Forget everything (disconnect / connection switch - the old tab ids are gone).
 * @param {NavStack} s
 */
export function resetNav(s) {
  s.entries.length = 0
  s.index = -1
}
