// App PIN lock.
//
// The PIN gates two things: opening the app, and (optionally) opening or
// reconnecting a database once the app is already running. Everything that
// decides whether the lock is on lives in the OS keychain behind
// `app_lock_*` commands - nothing here is persisted to localStorage, because a
// lock a devtools console can switch off is not a lock.
import { writable, get, derived } from 'svelte/store'
import { invoke } from '@tauri-apps/api/core'

/**
 * @typedef {{ enabled: boolean, requireOnConnect: boolean, autoLockMinutes: number, pinLength: number }} LockStatus
 */

/** @type {LockStatus} */
const UNSET = { enabled: false, requireOnConnect: false, autoLockMinutes: 0, pinLength: 4 }

/** @type {import('svelte/store').Writable<LockStatus>} */
export const lockStatus = writable(UNSET)

/** True while the lock screen covers the app. */
export const locked = writable(false)

export const pinEnabled = derived(lockStatus, ($s) => $s.enabled)

/**
 * A pending "confirm your PIN" challenge, rendered by AppLockGate. Only one can
 * be outstanding: a second request supersedes the first.
 * @type {import('svelte/store').Writable<{ reason: string, resolve: (ok: boolean) => void } | null>}
 */
export const pinChallenge = writable(null)

/** @returns {Promise<LockStatus>} */
export async function refreshLockStatus() {
  try {
    const s = /** @type {LockStatus} */ (await invoke('app_lock_status'))
    const next = { ...UNSET, ...s }
    lockStatus.set(next)
    return next
  } catch {
    // No Tauri bridge (plain `npm run dev`) or an unreadable keychain. Failing
    // open is the only safe answer: failing closed would lock the user out of
    // an app whose PIN we cannot verify either.
    lockStatus.set(UNSET)
    return UNSET
  }
}

/** Read the status at startup and raise the lock screen if a PIN is set. */
export async function initAppLock() {
  const s = await refreshLockStatus()
  locked.set(s.enabled)
  return s
}

/** @param {string} pin @returns {Promise<boolean>} */
export async function verifyPin(pin) {
  try {
    return Boolean(await invoke('app_lock_verify', { pin }))
  } catch {
    return false
  }
}

/** Verify and, when correct, drop the lock screen. @param {string} pin */
export async function unlockWith(pin) {
  const ok = await verifyPin(pin)
  if (ok) {
    locked.set(false)
    noteActivity()
  }
  return ok
}

/**
 * Set a PIN, or change an existing one. Changing needs the current PIN so an
 * unattended unlocked screen can't be silently rekeyed.
 * @param {string} pin
 * @param {string} [currentPin]
 */
export async function setPin(pin, currentPin) {
  const s = /** @type {LockStatus} */ (
    await invoke('app_lock_set_pin', { pin, currentPin: currentPin ?? null })
  )
  lockStatus.set({ ...UNSET, ...s })
  noteActivity()
  return s
}

/** Remove the PIN. Requires the current PIN. @param {string} pin */
export async function disablePin(pin) {
  const s = /** @type {LockStatus} */ (await invoke('app_lock_disable', { pin }))
  lockStatus.set({ ...UNSET, ...s })
  locked.set(false)
  return s
}

/** @param {{ requireOnConnect?: boolean, autoLockMinutes?: number }} prefs */
export async function setLockPrefs(prefs) {
  const s = /** @type {LockStatus} */ (
    await invoke('app_lock_set_prefs', {
      requireOnConnect: prefs.requireOnConnect ?? null,
      autoLockMinutes: prefs.autoLockMinutes ?? null,
    })
  )
  lockStatus.set({ ...UNSET, ...s })
  return s
}

/** Raise the lock screen now. No-op when no PIN is set. */
export function lockNow() {
  if (!get(lockStatus).enabled) return false
  cancelChallenge()
  locked.set(true)
  return true
}

/** Drop any outstanding challenge, answering it "no". */
function cancelChallenge() {
  const pending = get(pinChallenge)
  if (pending) {
    pinChallenge.set(null)
    pending.resolve(false)
  }
}

/**
 * Gate a user-initiated connect. Resolves true when the app may proceed -
 * immediately when no PIN is set or the connect prompt is off, otherwise once
 * the user has entered the PIN.
 *
 * Deliberately NOT called on the startup auto-reconnect or the silent
 * background heal: the user unlocked the app seconds ago in the first case, and
 * a self-healing pool must never put a modal on screen in the second.
 * @param {string} [reason]
 * @returns {Promise<boolean>}
 */
export function requireUnlock(reason = 'Unlock to continue') {
  const s = get(lockStatus)
  if (!s.enabled || !s.requireOnConnect) return Promise.resolve(true)
  if (get(locked)) return Promise.resolve(false)
  cancelChallenge()
  return new Promise((resolve) => {
    pinChallenge.set({ reason, resolve })
  })
}

/** @param {boolean} ok */
export function answerChallenge(ok) {
  const pending = get(pinChallenge)
  if (!pending) return
  pinChallenge.set(null)
  pending.resolve(ok)
  if (ok) noteActivity()
}

// ── Idle auto-lock ───────────────────────────────────────────────────────────
// A wall-clock deadline rather than a rolling timer, so a laptop that slept
// through the whole window is locked the moment it wakes.

let deadline = 0
/** @type {ReturnType<typeof setInterval> | null} */
let ticker = null

export function noteActivity() {
  const mins = get(lockStatus).autoLockMinutes
  deadline = mins > 0 ? Date.now() + mins * 60_000 : 0
}

/**
 * Watch for inactivity and lock when the window elapses. Returns a teardown.
 * Safe to call once at startup: it reacts to preference changes on each tick.
 */
export function installAutoLock() {
  if (typeof window === 'undefined') return () => {}
  const bump = () => {
    if (!get(locked)) noteActivity()
  }
  const events = ['pointerdown', 'keydown', 'wheel', 'focus']
  for (const e of events) window.addEventListener(e, bump, { passive: true, capture: true })

  noteActivity()
  ticker = setInterval(() => {
    const s = get(lockStatus)
    if (!s.enabled || s.autoLockMinutes <= 0) {
      deadline = 0
      return
    }
    if (!deadline) {
      noteActivity()
      return
    }
    if (Date.now() >= deadline && !get(locked)) lockNow()
  }, 15_000)

  return () => {
    for (const e of events) window.removeEventListener(e, bump, { capture: true })
    if (ticker) clearInterval(ticker)
    ticker = null
  }
}
