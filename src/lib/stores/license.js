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
