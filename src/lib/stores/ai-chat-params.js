import { writable, get } from 'svelte/store'

const KEY = 'db-studio:ai-chat-params'

/**
 * @typedef {{
 *   temperature: number,
 *   topK: number | null,
 *   maxTokens: number,
 *   customInstructions: string,
 * }} AiChatParams
 */

/** @returns {AiChatParams} */
function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...defaults(), ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return defaults()
}

function defaults() {
  return /** @type {AiChatParams} */ ({
    temperature: 0.7,
    topK: null,
    maxTokens: 16384,
    customInstructions: '',
  })
}

export const aiChatParams = writable(load())

aiChatParams.subscribe((v) => {
  try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* ignore */ }
})

/** @param {Partial<AiChatParams>} patch */
export function updateChatParams(patch) {
  aiChatParams.update((v) => ({ ...v, ...patch }))
}

export function resetChatParams() {
  aiChatParams.set(defaults())
}

export function getChatParams() {
  return get(aiChatParams)
}
