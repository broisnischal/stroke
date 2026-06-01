import { writable, get } from 'svelte/store'
import { invoke } from '@tauri-apps/api/core'

// ── Provider catalogue ───────────────────────────────────────────────────────

export const PROVIDERS = [
  { id: 'openrouter', label: 'OpenRouter',      url: 'https://openrouter.ai/api/v1', keysUrl: 'https://openrouter.ai/keys' },
  { id: 'openai',     label: 'OpenAI',           url: 'https://api.openai.com/v1', keysUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic',  label: 'Anthropic',        url: 'https://api.anthropic.com/v1', keysUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'copilot',    label: 'GitHub Copilot',   url: 'https://api.githubcopilot.com', keysUrl: null, deviceFlow: true },
  { id: 'mistral',    label: 'Mistral',          url: 'https://api.mistral.ai/v1', keysUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'google',     label: 'Google',           url: 'https://generativelanguage.googleapis.com/v1beta/openai', keysUrl: 'https://aistudio.google.com/apikey' },
  { id: 'ollama',     label: 'Ollama',           url: 'http://localhost:11434/v1', keysUrl: null },
  { id: 'custom',     label: 'Custom',           url: '', keysUrl: null },
]

/** @type {Record<string, { label: string, model: string, tag: string }[]>} */
export const PROVIDER_MODELS = {
  openrouter: [
    { label: 'DeepSeek V3', model: 'deepseek/deepseek-chat-v3-0324:free', tag: 'free' },
    { label: 'Llama 3.3 70B', model: 'meta-llama/llama-3.3-70b-instruct:free', tag: 'free' },
    { label: 'Gemini 2.0 Flash', model: 'google/gemini-2.0-flash-exp:free', tag: 'free' },
    { label: 'Claude Haiku', model: 'anthropic/claude-haiku-4-5', tag: 'fast' },
    { label: 'Claude Sonnet', model: 'anthropic/claude-sonnet-4-5', tag: 'smart' },
    { label: 'GPT-4o mini', model: 'openai/gpt-4o-mini', tag: 'fast' },
  ],
  openai: [
    { label: 'GPT-4o mini', model: 'gpt-4o-mini', tag: 'fast' },
    { label: 'GPT-4o', model: 'gpt-4o', tag: 'smart' },
    { label: 'o1 mini', model: 'o1-mini', tag: 'smart' },
    { label: 'o3 mini', model: 'o3-mini', tag: 'smart' },
  ],
  anthropic: [
    { label: 'Claude Haiku 4.5', model: 'claude-haiku-4-5-20251001', tag: 'fast' },
    { label: 'Claude Sonnet 4.5', model: 'claude-sonnet-4-5', tag: 'smart' },
    { label: 'Claude Opus 4.5', model: 'claude-opus-4-5', tag: 'smart' },
  ],
  mistral: [
    { label: 'Mistral Small', model: 'mistral-small-latest', tag: 'fast' },
    { label: 'Mistral Medium', model: 'mistral-medium-latest', tag: 'smart' },
    { label: 'Codestral', model: 'codestral-latest', tag: 'fast' },
  ],
  google: [
    { label: 'Gemini 2.0 Flash', model: 'gemini-2.0-flash', tag: 'fast' },
    { label: 'Gemini 1.5 Pro', model: 'gemini-1.5-pro', tag: 'smart' },
    { label: 'Gemini 1.5 Flash', model: 'gemini-1.5-flash', tag: 'fast' },
  ],
  ollama: [
    { label: 'llama3', model: 'llama3', tag: 'local' },
    { label: 'llama3.1', model: 'llama3.1', tag: 'local' },
    { label: 'qwen2.5-coder', model: 'qwen2.5-coder', tag: 'local' },
    { label: 'codellama', model: 'codellama', tag: 'local' },
    { label: 'mistral', model: 'mistral', tag: 'local' },
  ],
  // Copilot models are fetched dynamically; these are the static fallback
  copilot: [
    { label: 'GPT-4o',             model: 'gpt-4o',               tag: 'smart' },
    { label: 'GPT-4o mini',        model: 'gpt-4o-mini',          tag: 'fast'  },
    { label: 'o3-mini',            model: 'o3-mini',              tag: 'smart' },
    { label: 'Claude 3.5 Sonnet',  model: 'claude-3.5-sonnet',    tag: 'smart' },
    { label: 'Claude 3.7 Sonnet',  model: 'claude-3.7-sonnet',    tag: 'smart' },
    { label: 'Gemini 2.0 Flash',   model: 'gemini-2.0-flash-001', tag: 'fast'  },
  ],
  custom: [],
}

// ── Typedef ──────────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   provider: string,
 *   baseUrl: string,
 *   model: string,
 * }} ModelProfile
 */

/** @typedef {{ baseUrl: string, apiKey: string, model: string }} AiSettings */

// ── Storage keys ─────────────────────────────────────────────────────────────

const PROFILES_KEY = 'db-studio:ai-profiles'
const ACTIVE_KEY   = 'db-studio:ai-active-profile'
const LEGACY_KEY   = 'db-studio:ai-settings'

// ── Default profile ──────────────────────────────────────────────────────────

function makeDefaultProfile() {
  return /** @type {ModelProfile} */ ({
    id: 'default',
    name: 'DeepSeek V3',
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'deepseek/deepseek-chat-v3-0324:free',
  })
}

// ── Persistence helpers ───────────────────────────────────────────────────────

/** @returns {ModelProfile[]} */
function loadProfiles() {
  try {
    const raw = localStorage.getItem(PROFILES_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
    // Migrate from legacy single-setting format
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const s = JSON.parse(legacy)
      if (s.model) {
        const provider = detectProvider(String(s.baseUrl || ''))
        return [{
          id: 'default',
          name: modelShortName(String(s.model || '')),
          provider,
          baseUrl: String(s.baseUrl || 'https://openrouter.ai/api/v1'),
          model: String(s.model || 'deepseek/deepseek-chat-v3-0324:free'),
        }]
      }
    }
  } catch { /* ignore */ }
  return [makeDefaultProfile()]
}

/** @param {string} url */
function detectProvider(url) {
  if (url.includes('openrouter.ai')) return 'openrouter'
  if (url.includes('openai.com')) return 'openai'
  if (url.includes('anthropic.com')) return 'anthropic'
  if (url.includes('mistral.ai')) return 'mistral'
  if (url.includes('googleapis.com')) return 'google'
  if (url.includes('localhost') || url.includes('127.0.0.1')) return 'ollama'
  return 'custom'
}

/** @param {string} model */
function modelShortName(model) {
  return model.split('/').pop()?.split(':')[0] ?? model
}

/** @param {ModelProfile[]} profiles */
function saveProfiles(profiles) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)) } catch { /* ignore */ }
}

function loadActiveId() {
  try { return localStorage.getItem(ACTIVE_KEY) ?? null } catch { return null }
}

/** @param {string} id */
function saveActiveId(id) {
  try { localStorage.setItem(ACTIVE_KEY, id) } catch { /* ignore */ }
}

// ── Stores ───────────────────────────────────────────────────────────────────

export const aiProfiles = writable(/** @type {ModelProfile[]} */ (loadProfiles()))
export const activeProfileId = writable(/** @type {string} */ (loadActiveId() ?? loadProfiles()[0]?.id ?? 'default'))

/** Merged runtime settings (baseUrl + model from profile, apiKey from secure store). */
export const aiSettings = writable(/** @type {AiSettings} */ ({
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: '',
  model: 'deepseek/deepseek-chat-v3-0324:free',
}))

// ── Bootstrap: load API key from secure store ────────────────────────────────

async function loadKeyForProfile(profileId) {
  try {
    return await invoke('ai_load_key', { profileId })
  } catch {
    // Tauri not available (dev mode without backend) — fall back to legacy localStorage
    try {
      const legacy = localStorage.getItem(LEGACY_KEY)
      if (legacy) return JSON.parse(legacy).apiKey ?? ''
    } catch { /* ignore */ }
    return ''
  }
}

export async function refreshActiveSettings() {
  const profiles = get(aiProfiles)
  const activeId = get(activeProfileId)
  const profile = profiles.find((p) => p.id === activeId) ?? profiles[0]
  if (!profile) return
  const apiKey = await loadKeyForProfile(profile.id)
  aiSettings.set({ baseUrl: profile.baseUrl, apiKey, model: profile.model })
}

// Bootstrap on module load
refreshActiveSettings()

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Save a profile (create or update) and optionally store its API key.
 * @param {ModelProfile} profile
 * @param {string} [apiKey]
 */
export async function saveProfile(profile, apiKey) {
  const profiles = get(aiProfiles)
  const idx = profiles.findIndex((p) => p.id === profile.id)
  const next = idx >= 0
    ? profiles.map((p) => p.id === profile.id ? profile : p)
    : [...profiles, profile]
  aiProfiles.set(next)
  saveProfiles(next)

  if (apiKey !== undefined) {
    try { await invoke('ai_store_key', { profileId: profile.id, apiKey }) } catch { /* ignore in dev */ }
  }
}

/** @param {string} id */
export async function deleteProfile(id) {
  const profiles = get(aiProfiles)
  const next = profiles.filter((p) => p.id !== id)
  if (next.length === 0) next.push(makeDefaultProfile())
  aiProfiles.set(next)
  saveProfiles(next)
  try { await invoke('ai_delete_key', { profileId: id }) } catch { /* ignore */ }

  const activeId = get(activeProfileId)
  if (activeId === id) {
    await setActiveProfile(next[0].id)
  }
}

/** @param {string} id */
export async function setActiveProfile(id) {
  activeProfileId.set(id)
  saveActiveId(id)
  await refreshActiveSettings()
}

// ── Legacy compat (still used by some consumers) ─────────────────────────────

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export const OPENROUTER_KEYS_URL = 'https://openrouter.ai/keys'
export const DEFAULT_AI_SETTINGS = { baseUrl: OPENROUTER_BASE_URL, apiKey: '', model: 'deepseek/deepseek-chat-v3-0324:free' }
export function loadAiSettings() { return get(aiSettings) }
export function saveAiSettings(s) { return setAiSettings(s) }
export function setAiSettings(s) { aiSettings.set(s); return s }
export function isAiConfigured(s) {
  return Boolean(s.apiKey) ||
    /localhost|127\.0\.0\.1/.test(s.baseUrl) ||
    (s.baseUrl ?? '').includes('githubcopilot.com')
}

// Legacy presets (kept for external references, now empty)
export const AI_PROVIDER_PRESETS = []
