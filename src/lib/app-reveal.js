// The page boots at opacity 0 (index.html) and is faded in exactly once, by the
// first screen that is actually complete: the shell after its startup decision
// (reconnect overlay, welcome, onboarding), the lock screen, the trial screen,
// or the crash screen. Revealing earlier - on App mount - faded in an empty page
// while AppLockGate was still reading the keychain, and the shell then popped in
// unfaded on top of it.
//
// The native window is built hidden too (src-tauri/src/lib.rs) and is shown
// here, so nothing that paints before the page (host surface, webview backdrop,
// the maximize resize) ever reaches the screen.

const FAILSAFE_MS = 2500

let revealed = false

/** Show the native window. No-op outside Tauri (browser dev). */
async function showWindow() {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('reveal_window')
  } catch { /* browser dev, or the window is already up */ }
}

/** Fade the page in. Idempotent - only the first caller does anything. */
export function revealApp() {
  if (revealed || typeof document === 'undefined') return
  revealed = true
  // Show first: a hidden WebKitGTK window never fires requestAnimationFrame,
  // so the fade below would wait forever. Then one frame so whatever the
  // caller just set (overlay, modal) is in the DOM before the fade starts.
  void showWindow().finally(() => {
    requestAnimationFrame(() => {
      document.documentElement.style.opacity = '1'
    })
  })
}

/** Never leave a blank window: reveal regardless if no screen claimed it. */
export function armRevealFailsafe() {
  setTimeout(revealApp, FAILSAFE_MS)
}
