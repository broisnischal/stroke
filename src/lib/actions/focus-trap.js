/**
 * Svelte action: make a hand-rolled modal behave like a real dialog.
 *
 * bits-ui gives its dialogs focus management for free; the modals built
 * straight out of a fixed-position div do not, so their keydown handlers only
 * fire once something inside happens to hold focus - which is why Escape and
 * Enter looked dead on open. This moves focus in, keeps Tab inside, and hands
 * focus back to whatever opened the modal on teardown.
 *
 * Usage: `<div role="dialog" aria-modal="true" use:focusTrap>` and mark the
 * control that should get focus first with `data-autofocus`.
 */

const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Visible, focusable descendants in tab order. `getClientRects()` rather than
 * `offsetParent` - the latter is null for the `position: fixed` shells these
 * modals are built from.
 * @param {HTMLElement} node
 */
function tabbables(node) {
  return /** @type {HTMLElement[]} */ (Array.from(node.querySelectorAll(TABBABLE))).filter(
    (el) => el.getClientRects().length > 0 && !el.closest('[inert]') && el.getAttribute('aria-hidden') !== 'true',
  )
}

/**
 * Make everything outside `node` inert for as long as the modal is up.
 *
 * The Tab trap only governs Tab. A screen reader in browse mode, a find-in-page,
 * a stray click - all still reach the page behind a modal without this. Walking
 * up from the node and inerting each ancestor's other children is what lets a
 * modal that lives INSIDE the app root (all of these do) black out the app
 * without blacking out itself.
 *
 * Returns the undo. Elements that were already inert are left alone, so nested
 * modals unwind in the right order.
 * @param {HTMLElement} node
 */
function inertOutside(node) {
  /** @type {Element[]} */
  const touched = []
  /** @type {HTMLElement | null} */
  let el = node
  while (el && el !== document.body && el.parentElement) {
    for (const sibling of el.parentElement.children) {
      if (sibling === el || sibling.hasAttribute('inert')) continue
      if (sibling.tagName === 'SCRIPT' || sibling.tagName === 'STYLE') continue
      sibling.setAttribute('inert', '')
      touched.push(sibling)
    }
    el = el.parentElement
  }
  return () => { for (const sibling of touched) sibling.removeAttribute('inert') }
}

/**
 * @param {HTMLElement} node
 * @param {{ enabled?: boolean, autoFocus?: boolean, inertBackground?: boolean } | undefined} [opts]
 */
export function focusTrap(node, opts = {}) {
  let enabled = opts?.enabled !== false
  const autoFocus = opts?.autoFocus !== false
  const restore = /** @type {HTMLElement | null} */ (document.activeElement)
  const unInert = enabled && opts?.inertBackground !== false ? inertOutside(node) : null

  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    if (!enabled || e.key !== 'Tab') return
    const items = tabbables(node)
    if (items.length === 0) {
      // Nothing to land on - keep focus on the shell rather than letting Tab
      // walk out into the page behind the backdrop.
      e.preventDefault()
      node.focus()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = /** @type {HTMLElement | null} */ (document.activeElement)
    if (!active || !node.contains(active)) {
      e.preventDefault()
      ;(e.shiftKey ? last : first).focus()
    } else if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  node.addEventListener('keydown', onKeydown)

  if (enabled && autoFocus && !node.contains(document.activeElement)) {
    const target = /** @type {HTMLElement | null} */ (node.querySelector('[data-autofocus]'))
      ?? tabbables(node)[0]
      ?? node
    // Deferred a frame: Monaco and other editors focus themselves during their
    // own mount, and whoever runs last wins.
    requestAnimationFrame(() => {
      if (enabled && !node.contains(document.activeElement)) target.focus()
    })
  }

  return {
    /** @param {{ enabled?: boolean, autoFocus?: boolean } | undefined} next */
    update(next) {
      enabled = next?.enabled !== false
    },
    destroy() {
      node.removeEventListener('keydown', onKeydown)
      unInert?.()
      // Only take focus back if the modal still owns it - the closing action may
      // have deliberately parked focus elsewhere (a cell, the next dialog).
      if (restore?.isConnected && node.contains(document.activeElement)) restore.focus()
    },
  }
}
