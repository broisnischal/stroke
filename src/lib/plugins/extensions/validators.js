// Cell validators - flag values that look wrong with a subtle warning marker.
// Conservative: only fires on strong name signals to avoid false positives.
import { normalizeColumnType } from '$lib/cell-value.js'

const EMAIL_NAME_RE = /(^|_)email($|_)/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_NAME_RE = /(^|_)(url|link|website|homepage)($|_)/i
const URL_RE = /^https?:\/\/\S+$/i
const NUMERIC_RE = /(int|numeric|decimal|real|double|float)/i

export const validators = {
  id: 'validators',
  name: 'Cell Validators',
  description: 'Mark invalid emails, URLs, JSON, and out-of-range numbers.',
  kind: 'formatter',

  /** @param {string} type @param {string} name */
  appliesTo(type, name) {
    return (
      EMAIL_NAME_RE.test(name) ||
      URL_NAME_RE.test(name) ||
      /(^|_)(age|percent|percentage|progress)($|_)/i.test(name) ||
      normalizeColumnType(type) === 'json' ||
      normalizeColumnType(type) === 'jsonb'
    )
  },

  /**
   * @param {unknown} value
   * @param {string} type
   * @param {Record<string, unknown>} _config
   * @param {string} name
   */
  format(value, type, _config, name) {
    if (value === null || value === undefined) return null
    const t = normalizeColumnType(type)

    if (EMAIL_NAME_RE.test(name) && typeof value === 'string' && !EMAIL_RE.test(value.trim())) {
      return { warn: 'Not a valid email' }
    }
    if (URL_NAME_RE.test(name) && typeof value === 'string' && value.trim() && !URL_RE.test(value.trim())) {
      return { warn: 'Not a valid URL' }
    }
    if ((t === 'json' || t === 'jsonb') && typeof value === 'string' && value.trim()) {
      try { JSON.parse(value) } catch { return { warn: 'Malformed JSON' } }
    }
    const n = Number(value)
    if (Number.isFinite(n)) {
      if (/(^|_)age($|_)/i.test(name) && (n < 0 || n > 150)) return { warn: 'Age out of range' }
      if (/(percent|percentage|progress)/i.test(name) && (n < 0 || n > 100)) return { warn: 'Percent out of 0-100' }
    }
    return null
  },
}
