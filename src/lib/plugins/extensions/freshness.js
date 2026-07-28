// Temporal freshness - tint timestamp cells by recency: bright when just now,
// fading to nothing as they age. Great for created_at / updated_at / last_seen.
// Returns only a `bgTint`, so it yields to dirty/fk/focus tints.

/** @param {unknown} v @returns {number | null} epoch ms, or null */
function toMs(v) {
  if (typeof v === 'number' && Number.isFinite(v)) {
    // seconds vs milliseconds
    if (v > 1e9 && v < 4e9) return v * 1000
    if (v > 1e12 && v < 4e12) return v
    return null
  }
  if (typeof v === 'string') {
    const t = v.trim()
    if (/^\d{10}$/.test(t)) return Number(t) * 1000
    if (/^\d{13}$/.test(t)) return Number(t)
    if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(t)) {
      const ms = Date.parse(t)
      return Number.isNaN(ms) ? null : ms
    }
  }
  return null
}

const TIME_TYPE = /timestamp|datetime|^date$|^time$|timetz/i
const TIME_NAME = /_at$|_time$|_on$|created|updated|modified|deleted|last_?seen|last_?login|timestamp|expires?|issued|joined|birth|start|end/i

export const freshness = {
  id: 'freshness',
  name: 'Freshness Heat',
  description: 'Tint timestamp cells by recency, bright when recent, fading as they age.',
  kind: 'formatter',

  /** @param {string} type @param {string} name @param {unknown} value */
  appliesTo(type, name, value) {
    if (TIME_TYPE.test(type || '')) return true
    if (TIME_NAME.test(name || '')) return true
    return toMs(value) != null
  },

  /** @param {unknown} value */
  format(value) {
    const ms = toMs(value)
    if (ms == null) return null
    const ageMs = Date.now() - ms
    // Future timestamps get a cool blue wash.
    if (ageMs < -60_000) return { bgTint: 'rgba(96,165,250,0.10)' }
    const ageHours = Math.max(0, ageMs) / 3.6e6
    // freshness: 1 (now) → 0 (~1 year), on a log scale so the last hour/day pop.
    const f = 1 - Math.log10(ageHours + 1) / Math.log10(24 * 365)
    if (f <= 0.03) return null // old enough to leave untinted
    const alpha = (0.03 + Math.min(1, f) * 0.14).toFixed(3)
    return { bgTint: `rgba(74,222,128,${alpha})` } // green, brighter = fresher
  },
}
