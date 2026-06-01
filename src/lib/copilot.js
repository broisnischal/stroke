/**
 * GitHub Copilot OAuth device flow + JWT management.
 *
 * Auth is two-layer:
 *  1. OAuth token  — long-lived, obtained via device flow, stored via ai_store_key
 *  2. Copilot JWT  — short-lived (~30 min), exchanged from the OAuth token on demand
 *
 * All Copilot API requests must use the JWT as the Bearer token plus the
 * required Copilot-Integration-Id header (handled in ai.js).
 */

import { invoke } from '@tauri-apps/api/core'

// ── Constants ─────────────────────────────────────────────────────────────────

export const COPILOT_BASE_URL = 'https://api.githubcopilot.com'
const OAUTH_STORE_KEY = '__copilot_oauth__'

// Copilot-required headers that must be added to every API request
export const COPILOT_EXTRA_HEADERS = {
  'Copilot-Integration-Id': 'vscode-chat',
  'Editor-Version': 'vscode/1.95.0',
}

// ── In-memory JWT cache ───────────────────────────────────────────────────────

/** @type {{ token: string, expiresAt: number } | null} */
let cachedJwt = null

// ── Device flow ───────────────────────────────────────────────────────────────

/**
 * Start the GitHub Device OAuth flow.
 * @returns {Promise<{ deviceCode: string, userCode: string, verificationUri: string, expiresIn: number, interval: number }>}
 */
export async function startDeviceFlow() {
  return invoke('copilot_start_device_flow')
}

/**
 * Poll GitHub for the OAuth access token after the user authorized the device.
 * Call this every `interval` seconds (from startDeviceFlow response).
 * @param {string} deviceCode
 * @returns {Promise<{ status: string, token?: string }>}
 */
export async function pollOAuthToken(deviceCode) {
  return invoke('copilot_poll_oauth_token', { deviceCode })
}

// ── Token storage ─────────────────────────────────────────────────────────────

/** Store the long-lived GitHub OAuth token securely. */
export async function storeOAuthToken(token) {
  cachedJwt = null  // invalidate cached JWT on new OAuth token
  try {
    await invoke('ai_store_key', { profileId: OAUTH_STORE_KEY, apiKey: token })
  } catch {
    // dev mode without Tauri — ignore
  }
}

/** Load the stored GitHub OAuth token, or '' if not connected. */
export async function loadOAuthToken() {
  try {
    return (await invoke('ai_load_key', { profileId: OAUTH_STORE_KEY })) ?? ''
  } catch {
    return ''
  }
}

/** Remove the stored OAuth token and clear the JWT cache. */
export async function clearOAuthToken() {
  cachedJwt = null
  try {
    await invoke('ai_delete_key', { profileId: OAUTH_STORE_KEY })
  } catch {}
}

/** Returns true if a GitHub OAuth token is stored (user is connected). */
export async function isCopilotConnected() {
  const token = await loadOAuthToken()
  return Boolean(token)
}

// ── JWT management ────────────────────────────────────────────────────────────

/**
 * Get a valid Copilot JWT, refreshing from the OAuth token if expired.
 * Uses an in-memory cache; the JWT expires in ~30 min so we refresh with a 60s buffer.
 * @throws {Error} if the user is not connected to Copilot
 */
export async function getCopilotJwt() {
  const nowSec = Math.floor(Date.now() / 1000)
  if (cachedJwt && cachedJwt.expiresAt - nowSec > 60) {
    return cachedJwt.token
  }

  const oauthToken = await loadOAuthToken()
  if (!oauthToken) {
    throw new Error('Not connected to GitHub Copilot — please log in via AI model settings.')
  }

  const result = await invoke('copilot_get_copilot_token', { oauthToken })
  cachedJwt = { token: result.token, expiresAt: result.expires_at }
  return result.token
}

/**
 * Fetch the list of models available for this Copilot subscription.
 * Automatically obtains/refreshes the JWT.
 * @returns {Promise<{ id: string, name: string }[]>}
 */
export async function fetchCopilotModels() {
  const jwt = await getCopilotJwt()
  return invoke('copilot_fetch_models', { copilotToken: jwt })
}
