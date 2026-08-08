/**
 * What Ollama can run, asked of Ollama rather than remembered.
 *
 * The setup screen used to suggest a single hardcoded `ollama pull llama3.1:8b`.
 * Model lineups turn over fast enough that a literal in the source is wrong
 * within months — by the time this was written the registry was serving gemma4,
 * qwen3.5 and kimi-k2.6, and llama3.1 was not on it at all. A suggestion the
 * user pastes into a terminal has to be right, so it comes from the registry.
 *
 * `https://ollama.com/api/tags` is a public listing of the models available
 * through ollama.com. It is fetched only when the setup screen actually needs
 * it — the user is configuring Ollama at that moment — never on app start.
 */

/** Above this, a model is not going on someone's laptop. */
const LOCAL_MAX_BYTES = 20e9

/** @typedef {{ id: string, bytes: number, cloud: boolean, pull: string }} OllamaSuggestion */

/**
 * Split the registry into what a machine can hold and what it can't.
 *
 * Ollama addresses a cloud model from a local instance with a `:cloud` tag, so
 * the id offered for those is the tagged one — pasting the bare name would pull
 * a 1.5 TB download instead of routing to the cloud.
 *
 * @param {Array<{ name?: string, size?: number }>} models
 * @returns {{ local: OllamaSuggestion[], cloud: OllamaSuggestion[] }}
 */
export function classifyOllamaModels(models) {
  /** @type {OllamaSuggestion[]} */
  const local = []
  /** @type {OllamaSuggestion[]} */
  const cloud = []

  for (const m of models ?? []) {
    const id = String(m?.name ?? '').trim()
    if (!id) continue
    const bytes = Number(m?.size) || 0
    // A size of zero means the registry didn't report one, which is not a claim
    // that it is small — treat unknown as cloud rather than tell someone to pull
    // something that might be a terabyte.
    const isLocal = bytes > 0 && bytes <= LOCAL_MAX_BYTES
    if (isLocal) local.push({ id, bytes, cloud: false, pull: `ollama pull ${id}` })
    else cloud.push({ id: `${id}:cloud`, bytes, cloud: true, pull: `ollama run ${id}:cloud` })
  }

  const bySize = (/** @type {OllamaSuggestion} */ a, /** @type {OllamaSuggestion} */ b) =>
    a.bytes - b.bytes
  return { local: local.sort(bySize), cloud: cloud.sort(bySize) }
}

/** `13.8 GB`, or "" when the registry gave no size. */
export function formatModelSize(bytes) {
  if (!bytes) return ''
  return bytes >= 1e12 ? `${(bytes / 1e12).toFixed(1)} TB` : `${Math.round(bytes / 1e9)} GB`
}

/**
 * Fetch the registry. Returns empty lists on any failure — an offline user gets
 * the plain instructions rather than a stale name that fails in their terminal.
 * @param {number} [timeoutMs]
 */
export async function fetchOllamaRegistry(timeoutMs = 6000) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch('https://ollama.com/api/tags', { signal: ac.signal })
    if (!res.ok) throw new Error(`registry returned ${res.status}`)
    const body = await res.json()
    return classifyOllamaModels(body?.models ?? [])
  } catch {
    return { local: [], cloud: [] }
  } finally {
    clearTimeout(timer)
  }
}
