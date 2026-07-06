/**
 * Frontend bridge for database provider adapters (Neon, Supabase, PlanetScale,
 * Prisma Postgres). Mirrors `cloudflare.js`: thin invoke wrappers plus a
 * metadata registry the UI renders from. The heavy lifting (OAuth, listing,
 * building a connectable spec) lives in Rust (`src-tauri/src/providers`).
 */
import { invoke } from '@tauri-apps/api/core'

/**
 * @typedef {{ db_ref: string, name: string, region: string|null, kind: string|null, host: string|null }} ProviderDatabase
 * @typedef {{ db_type: string, host: string, port: number, username: string, password: string, database: string, ssl: boolean, needs_password: boolean, name: string }} ProviderConnection
 */

/** UI metadata. `mode: 'token'` providers paste a credential instead of OAuth. */
export const PROVIDERS = [
  { id: 'neon',        name: 'Neon',            mode: 'oauth', engine: 'postgres', blurb: 'Serverless Postgres — one-click connect' },
  { id: 'supabase',    name: 'Supabase',        mode: 'oauth', engine: 'postgres', blurb: 'Postgres platform — asks for your DB password once' },
  { id: 'planetscale', name: 'PlanetScale',     mode: 'oauth', engine: 'mysql',    blurb: 'Serverless MySQL — mints fresh credentials on connect' },
  { id: 'prisma',      name: 'Prisma Postgres', mode: 'oauth', engine: 'postgres', blurb: 'Serverless Postgres — sign in with Prisma' },
]

/** @param {string} id */
export function providerMeta(id) {
  return PROVIDERS.find((p) => p.id === id) ?? null
}

/** Start the browser OAuth flow. @param {string} provider */
export async function providerStartOAuth(provider) {
  return invoke('provider_start_oauth', { provider })
}

/** Abort an in-flight OAuth wait — frees the localhost callback port. */
export async function providerCancelOAuth() {
  return invoke('provider_cancel_oauth')
}

/** Store a pasted API token / connection string for a token-based provider. */
export async function providerStoreToken(provider, token) {
  return invoke('provider_store_token', { provider, token })
}

/** @param {string} provider @returns {Promise<{connected: boolean, email: string|null}>} */
export async function providerOAuthStatus(provider) {
  return invoke('provider_oauth_status', { provider })
}

/** @param {string} provider */
export async function providerLogout(provider) {
  return invoke('provider_logout', { provider })
}

/** @param {string} provider @returns {Promise<ProviderDatabase[]>} */
export async function providerListDatabases(provider) {
  return invoke('provider_list_databases', { provider })
}

/** @param {string} provider @param {string} dbRef @returns {Promise<ProviderConnection>} */
export async function providerBuildConnection(provider, dbRef) {
  return invoke('provider_build_connection', { provider, dbRef })
}
