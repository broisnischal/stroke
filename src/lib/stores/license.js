import { invoke } from '@tauri-apps/api/core'
import { writable, derived } from 'svelte/store'

/**
 * @typedef {{ status: 'Valid', email: string, plan: string, issued_at: number, expires_at: number|null }
 *          | { status: 'Trial', days_remaining: number }
 *          | { status: 'TrialExpired' }
 *          | { status: 'Error', message: string }
 *          | null} LicenseStatus
 */

/** @type {import('svelte/store').Writable<LicenseStatus>} */
export const licenseStatus = writable(null)

export const isLicensed = derived(
  licenseStatus,
  ($s) => $s?.status === 'Valid',
)

export const isTrialActive = derived(
  licenseStatus,
  ($s) => $s?.status === 'Trial',
)

export const isBlocked = derived(
  licenseStatus,
  ($s) => $s !== null && $s.status === 'TrialExpired',
)

/** Fetch the current status from Tauri and update the store. */
export async function refreshLicenseStatus() {
  try {
    const status = await invoke('check_license_status')
    licenseStatus.set(/** @type {LicenseStatus} */ (status))
    return status
  } catch (e) {
    licenseStatus.set({ status: 'Error', message: String(e) })
    return null
  }
}

/**
 * Activate a license key. Updates the store on success.
 * @param {string} key
 * @returns {Promise<{ ok: true, info: object } | { ok: false, error: string }>}
 */
export async function activateLicense(key) {
  try {
    const info = await invoke('activate_license', { key: key.trim() })
    await refreshLicenseStatus()
    return { ok: true, info }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** Remove the local license and revert to trial/expired state. */
export async function deactivateLicense() {
  try {
    await invoke('deactivate_license')
    await refreshLicenseStatus()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/**
 * Run the daily phone-home check. Skips network call if checked <24h ago.
 * Deletes the local license and updates the store if the server reports revocation.
 */
export async function runLicenseCheck() {
  try {
    const status = await invoke('run_license_check')
    licenseStatus.set(/** @type {LicenseStatus} */ (status))
  } catch {
    // Non-critical — ignore errors, license state is already loaded
  }
}

// ── Free-tier feature gating ─────────────────────────────────────────────────

export const FREE_CONNECTION_LIMIT = 3

/** Features only available on a Pro plan (Valid license or active Trial). */
const PRO_FEATURES = new Set([
  'ai', 'dashboard', 'orm', 'security', 'logs',
  'sql_chart', 'sql_json', 'sql_explain',
  'charts', 'diagrams', 'schema_timeline', 'data_diff',
  'extensions', 'backup', 'erd', 'search', 'notebook', 'json_tab',
])

/**
 * Reactive: true when the user has Pro access (Valid license or active Trial).
 * Null state (still loading from Tauri) also returns true to prevent UI flicker.
 */
export const hasPro = derived(
  licenseStatus,
  ($s) => $s === null || $s?.status === 'Valid' || $s?.status === 'Trial',
)

/**
 * Check feature availability given a pro status value.
 * Use in Svelte templates: canUseFeature('ai', $hasPro)
 * @param {string} feature
 * @param {boolean} pro
 * @returns {boolean}
 */
export function canUseFeature(feature, pro) {
  return pro || !PRO_FEATURES.has(feature)
}
