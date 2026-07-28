// Number Format - humanize numeric columns (thousands separators, byte sizes,
// compact notation).
//
// Conservative by design: only applies to numeric columns whose *name* hints at
// a human-facing quantity, so primary-key / id integers keep their exact digits.
// The raw value is always preserved in the tooltip.
import { normalizeColumnType } from '$lib/cell-value.js'

const NUMERIC_RE = /(^|[^a-z])(int|integer|numeric|decimal|real|double|float|money|number)($|[^a-z])/i
const HINT_RE = /(amount|price|total|cost|balance|revenue|sum|count|qty|quantity|score|rate|percent|views?|likes?|points?)/i
const BYTES_RE = /(bytes?|size|filesize|content_length|length_bytes)/i

const thousands = new Intl.NumberFormat('en-US')
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

const defaultConfig = { mode: 'thousands' } // 'thousands' | 'compact'

/** @param {number} n */
function humanBytes(n) {
  if (!Number.isFinite(n)) return null
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let v = Math.abs(n)
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  const sign = n < 0 ? '-' : ''
  return `${sign}${i === 0 ? v : v.toFixed(1)} ${units[i]}`
}

export const numberFormat = {
  id: 'number-format',
  name: 'Number Format',
  description: 'Thousands separators, byte sizes, and compact counts.',
  kind: 'formatter',
  defaultConfig,

  /** @param {string} type @param {string} name */
  appliesTo(type, name) {
    const t = normalizeColumnType(type)
    if (!NUMERIC_RE.test(t)) return false
    return BYTES_RE.test(name) || HINT_RE.test(name)
  },

  /**
   * @param {unknown} value
   * @param {string} _type
   * @param {Record<string, unknown>} config
   * @param {string} name
   * @returns {{ display: string, title?: string } | null}
   */
  format(value, _type, config, name) {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return null

    if (BYTES_RE.test(name)) {
      const b = humanBytes(n)
      return b ? { display: b, title: String(value) } : null
    }

    const cfg = { ...defaultConfig, ...config }
    const display = cfg.mode === 'compact' ? compact.format(n) : thousands.format(n)
    if (display === String(value)) return null
    return { display, title: String(value) }
  },
}
