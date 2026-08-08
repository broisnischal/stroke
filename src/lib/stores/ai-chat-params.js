import { writable } from 'svelte/store'
import { debounce } from '$lib/utils.js'

const KEY = 'stroke:ai-chat-params'

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

// Persist is debounced: sliders / the custom-instructions textarea fire on every
// keystroke or drag tick, and JSON.stringify + localStorage on each is wasteful.
const persist = debounce((/** @type {AiChatParams} */ v) => {
  try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* ignore */ }
}, 300)

aiChatParams.subscribe((v) => persist(v))

// Flush any pending write before the window goes away so nothing is lost on quit.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => persist.flush())
}

/** @param {Partial<AiChatParams>} patch */
export function updateChatParams(patch) {
  aiChatParams.update((v) => ({ ...v, ...patch }))
}

export function resetChatParams() {
  aiChatParams.set(defaults())
}
