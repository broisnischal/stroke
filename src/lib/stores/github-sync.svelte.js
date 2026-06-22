import { invoke } from '@tauri-apps/api/core'

/**
 * @typedef {{ login: string, name: string | null, avatar_url: string, id: number }} GitHubUser
 */

// ── Tauri command wrappers ────────────────────────────────────────────────────

export async function githubAuthStart() {
  return /** @type {Promise<{ device_code: string, user_code: string, verification_uri: string, expires_in: number, interval: number }>} */ (
    invoke('github_auth_start')
  )
}

/**
 * @param {string} deviceCode
 * @returns {Promise<{ user: GitHubUser, token: string } | null>}
 */
export async function githubAuthPoll(deviceCode) {
  return invoke('github_auth_poll', { deviceCode })
}

/** @returns {Promise<string | null>} */
export async function githubAuthLoadToken() {
  return invoke('github_auth_load_token')
}

/** @param {string} token */
export async function githubGetUser(token) {
  return /** @type {Promise<GitHubUser>} */ (invoke('github_auth_get_user', { token }))
}

export async function githubAuthLogout() {
  return invoke('github_auth_logout')
}

/**
 * @param {string} token
 * @param {string} payload  JSON string
 */
export async function githubGistPush(token, payload) {
  return /** @type {Promise<string>} */ (invoke('github_gist_push', { token, payload }))
}

/** @param {string} token */
export async function githubGistPull(token) {
  return /** @type {Promise<string | null>} */ (invoke('github_gist_pull', { token }))
}

// ── Reactive sync state ───────────────────────────────────────────────────────

function createGitHubSync() {
  /** @type {GitHubUser | null} */
  let user = $state(null)
  /** @type {string | null} */
  let token = $state(null)
  let syncing = $state(false)
  /** @type {number | null} */
  let lastSyncedAt = $state(null)
  /** @type {string | null} */
  let error = $state(null)

  async function init() {
    try {
      const t = await githubAuthLoadToken()
      if (!t) return
      token = t
      user = await githubGetUser(t)
    } catch {
      // Token expired or revoked — clear silently
      token = null
      user = null
    }
  }

  /**
   * Push the current connection list to the Gist.
   * @param {import('./connections.js').SavedConnection[]} connections
   */
  async function push(connections) {
    if (!token) return
    syncing = true
    error = null
    try {
      await githubGistPush(token, JSON.stringify(connections, null, 2))
      lastSyncedAt = Date.now()
    } catch (e) {
      error = String(e)
      throw e
    } finally {
      syncing = false
    }
  }

  /**
   * Pull connections from Gist.
   * @returns {Promise<import('./connections.js').SavedConnection[] | null>}
   */
  async function pull() {
    if (!token) return null
    syncing = true
    error = null
    try {
      const raw = await githubGistPull(token)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      lastSyncedAt = Date.now()
      return Array.isArray(parsed) ? parsed : null
    } catch (e) {
      error = String(e)
      throw e
    } finally {
      syncing = false
    }
  }

  async function logout() {
    await githubAuthLogout()
    token = null
    user = null
    lastSyncedAt = null
    error = null
  }

  /**
   * Set auth state directly from a successful poll result — no extra Tauri
   * roundtrip needed because the token is already in the payload.
   * @param {{ user: GitHubUser, token: string }} result
   */
  function _setFromPoll(result) {
    user = result.user
    token = result.token
  }

  return {
    get user() { return user },
    get token() { return token },
    get syncing() { return syncing },
    get lastSyncedAt() { return lastSyncedAt },
    get error() { return error },
    _setFromPoll,
    init,
    push,
    pull,
    logout,
  }
}

export const githubSync = createGitHubSync()
