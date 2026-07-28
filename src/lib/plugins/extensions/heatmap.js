// Conditional formatting / heatmap - tint a numeric cell's background by its
// value relative to the column's min/max. Column stats are computed once per
// data change by the table (passed in via ctx.stats), never per render.
import { normalizeColumnType } from '$lib/cell-value.js'

const NUMERIC_RE = /(int|numeric|decimal|real|double|float|money|number|serial)/i
const ID_NAME_RE = /(^|_)(id|uuid|guid)$/i

const defaultConfig = { palette: 'blue' } // 'blue' | 'heat' | 'green'

/** @param {number} t 0..1 @param {string} palette */
function tint(t, palette) {
  const a = (0.07 + 0.4 * t).toFixed(3)
  if (palette === 'green') return `rgba(34,197,94,${a})`
  if (palette === 'heat') {
    // green → amber → red across the range
    const r = Math.round(t < 0.5 ? 80 + t * 2 * 175 : 255)
    const g = Math.round(t < 0.5 ? 200 : 200 - (t - 0.5) * 2 * 150)
    return `rgba(${r},${g},70,${a})`
  }
  return `rgba(59,130,246,${a})`
}

export const heatmap = {
  id: 'heatmap',
  name: 'Heatmap',
  description: 'Tint numeric cells by value (spreadsheet-style).',
  kind: 'formatter',
  defaultConfig,
  // Marks that this extension needs per-column numeric stats from the table.
  needsStats: true,

  /** @param {string} type @param {string} name */
  appliesTo(type, name) {
    return NUMERIC_RE.test(normalizeColumnType(type)) && !ID_NAME_RE.test(name)
  },

  /**
   * @param {unknown} value
   * @param {string} _type
   * @param {Record<string, unknown>} config
   * @param {string} _name
   * @param {{ stats?: { numeric?: boolean, min?: number, max?: number } } | undefined} ctx
   */
  format(value, _type, config, _name, ctx) {
    const stats = ctx?.stats
    if (!stats?.numeric || stats.min == null || stats.max == null || stats.max === stats.min) return null
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return null
    const t = Math.max(0, Math.min(1, (n - stats.min) / (stats.max - stats.min)))
    const cfg = { ...defaultConfig, ...config }
    return { bgTint: tint(t, /** @type {string} */ (cfg.palette)) }
  },
}
