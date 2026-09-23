// The page boots at opacity 0 (index.html) and is faded in exactly once, by the
// first screen that is actually complete: the shell after its startup decision
// (reconnect overlay, welcome, onboarding), the lock screen, the trial screen,
// or the crash screen. Revealing earlier - on App mount - faded in an empty page
// while AppLockGate was still reading the keychain, and the shell then popped in
// unfaded on top of it.

const FAILSAFE_MS = 2500

let revealed = false

/** Fade the page in. Idempotent - only the first caller does anything. */
export function revealApp() {
  if (revealed || typeof document === 'undefined') return
  revealed = true
  // One frame so whatever the caller just set (overlay, modal) is in the DOM
  // before the fade starts.
  requestAnimationFrame(() => {
    document.documentElement.style.opacity = '1'
  })
}

/** Never leave a blank window: reveal regardless if no screen claimed it. */
export function armRevealFailsafe() {
  setTimeout(revealApp, FAILSAFE_MS)
}
