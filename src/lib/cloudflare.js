/**
 * Cloudflare OAuth token management for DB Studio.
 *
 * Auth is backed by the Rust cloudflare module which:
 *  1. Runs a local HTTP callback server
 *  2. Opens the Cloudflare OAuth consent page in the system browser
 *  3. Exchanges the returned code+PKCE for access + refresh tokens
 *  4. Stores them in the app keychain (ai-keys.json)
 *
 * The access token expires in ~10 minutes. `cfGetValidToken()` transparently
 * refreshes it using the stored refresh token.
 */

import { invoke } from '@tauri-apps/api/core'

async function inv(cmd, args = {}) {
  try {
    return await invoke(cmd, args)
  } catch (e) {
    throw new Error(String(e))
  }
}

/**
 * Start the OAuth 2.0 + PKCE flow.
 * Opens the system browser → waits for callback → exchanges code → stores tokens.
 * @returns {Promise<{connected: boolean, email?: string}>}
 */
export async function cfStartOAuth() {
  return inv('cloudflare_start_oauth')
}

/**
 * Check current OAuth status without triggering a flow.
 * @returns {Promise<{connected: boolean, email?: string}>}
 */
export async function cfOAuthStatus() {
  return inv('cloudflare_oauth_status')
}

/**
 * Get a valid access token, silently refreshing if the stored one is expired.
 * @returns {Promise<string>}
 */
export async function cfGetValidToken() {
  return inv('cloudflare_get_valid_token')
}

/**
 * Revoke stored tokens and disconnect from Cloudflare.
 * @returns {Promise<void>}
 */
export async function cfLogout() {
  return inv('cloudflare_logout')
}
