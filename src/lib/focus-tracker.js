/**
 * Tracks the last DOM element that held focus *outside* any dialog.
 *
 * bits-ui restores focus to a `Dialog.Trigger` when one is used, but most dialogs
 * in this app open programmatically (`bind:open` from app state) with no trigger,
 * so on close focus falls back to `<body>` — stranding keyboard users. The shared
 * dialog content reads this value on close and restores focus there instead.
 *
 * A single capture-phase `focusin` listener records every focus change, ignoring
 * focus moves *into* a dialog, so the recorded value is always the pre-dialog
 * element regardless of bits-ui's open-autofocus timing.
 */

/** @type {HTMLElement | null} */
let lastExternalFocus = null
let installed = false

const DIALOG_SELECTOR = '[data-slot="dialog-content"]'

export function installFocusTracker() {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener(
    'focusin',
    (e) => {
      const t = e.target
      if (t instanceof HTMLElement && !t.closest(DIALOG_SELECTOR)) {
        lastExternalFocus = t
      }
    },
    true,
  )
}

/** @returns {HTMLElement | null} */
export function getLastExternalFocus() {
  return lastExternalFocus
}
