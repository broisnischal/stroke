/**
 * Anonymous product analytics.
 *
 * Stroke connects to people's production databases, so the rule here is that
 * nothing about *their data* ever leaves the machine. What is sent is a fixed
 * set of event names from `TELEMETRY_EVENTS`, a count for each, the app version
 * and the OS. What is never sent, and has no code path to be sent:
 *
 *   • connection details, hostnames, ports, credentials
 *   • database, schema, table or column names
 *   • SQL, query text, results, row data
 *   • file paths, IP addresses, account or email
 *
 * Events are names, not payloads - `table_open` carries no table. The server
 * validates every name against the same allowlist and drops anything else, so
 * neither end trusts the other to have got it right.
 *
 * Counts are batched and flushed on a timer, so a burst of activity is one
 * request rather than one per click, and a failure drops the batch instead of
 * retrying - analytics must never cost the user a request, a retry loop, or a
 * visible error.
 */

import { loadSettings } from '$lib/stores/settings.js'

const ENDPOINT = 'https://stroke.click/api/telemetry'
/** Long enough that a working session is a handful of requests, not a stream. */
const FLUSH_MS = 60_000
/** Mirrors the server's cap; a batch past this would be rejected anyway. */
const MAX_EVENTS = 40

/** @type {Map<string, number>} */
const pending = new Map()
let launched = false
/** @type {ReturnType<typeof setInterval> | null} */
let timer = null
let deviceId = ''
let started = false

/** The user's choice. Absent means enabled - see the Settings copy. */
function enabled() {
  try {
    return loadSettings().telemetry !== false
  } catch {
    return false
  }
}

function isTauri() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** "macos" | "windows" | "linux" | "" - the three the server records. */
function detectOs() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/Mac|iPhone|iPad/.test(ua)) return 'macos'
  if (/Win/.test(ua)) return 'windows'
  if (/Linux|X11/.test(ua)) return 'linux'
  return ''
}

/**
 * Count one event. Cheap and total: safe to call from a hot path, and it never
 * throws, because a counter is not worth an exception in a click handler.
 * @param {string} event Must be on the server's allowlist to be recorded.
 * @param {number} [n]
 */
export function track(event, n = 1) {
  try {
    if (!enabled() || !event) return
    if (!pending.has(event) && pending.size >= MAX_EVENTS) return
    pending.set(event, (pending.get(event) ?? 0) + n)
  } catch {
    /* analytics never breaks the caller */
  }
}

/** Send whatever has accumulated. Fire-and-forget by design. */
export async function flush() {
  if (!enabled() || !isTauri()) { pending.clear(); return }
  if (pending.size === 0 && !launched) return

  const events = Object.fromEntries(pending)
  const wasLaunch = launched
  // Cleared before the await: a slow request must not cause the next flush to
  // send the same counts again.
  pending.clear()
  launched = false

  try {
    if (!deviceId) {
      const { invoke } = await import('@tauri-apps/api/core')
      deviceId = String(await invoke('ai_device_id'))
    }
    const { getVersion } = await import('@tauri-apps/api/app')
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-stroke-device': deviceId },
      body: JSON.stringify({
        os: detectOs(),
        version: await getVersion().catch(() => ''),
        launched: wasLaunch,
        events,
      }),
    })
  } catch {
    // Dropped on purpose. A retry queue for analytics is a memory leak that
    // grows exactly when the network is worst.
  }
}

/**
 * Begin reporting. Called once at startup; does nothing if the user has turned
 * telemetry off, and stays off until the app restarts if they turn it off later
 * (the flush guard handles the rest).
 */
export function startTelemetry() {
  if (started || !isTauri() || !enabled()) return
  started = true
  launched = true
  timer = setInterval(() => void flush(), FLUSH_MS)
  // A session shorter than the flush interval would otherwise report nothing.
  window.addEventListener('beforeunload', () => void flush())
  void flush()
}

export function stopTelemetry() {
  if (timer) clearInterval(timer)
  timer = null
  started = false
  pending.clear()
}
