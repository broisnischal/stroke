// Duration — render numeric duration columns as "2h 5m 30s".
import { normalizeColumnType } from '$lib/cell-value.js'

const NUMERIC_RE = /(int|numeric|decimal|real|double|float|number)/i
const NAME_RE = /(duration|elapsed|latency|runtime|uptime|response_time|time_taken|processing_time|ttl|timeout|interval|wait)/i
const MS_RE = /(_ms$|millis|milliseconds|_ms_)/i
const SEC_RE = /(_s$|_sec|seconds|_secs)/i

const defaultConfig = { unit: 'auto' } // 'auto' | 'ms' | 's'

/** @param {number} ms */
function human(ms) {
  if (!Number.isFinite(ms)) return null
  const neg = ms < 0 ? '-' : ''
  let s = Math.abs(ms) / 1000
  if (s < 1) return `${neg}${Math.round(Math.abs(ms))}ms`
  const d = Math.floor(s / 86400); s -= d * 86400
  const h = Math.floor(s / 3600); s -= h * 3600
  const m = Math.floor(s / 60); s -= m * 60
  const parts = []
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  if (s >= 1 || parts.length === 0) parts.push(`${Math.round(s)}s`)
  return neg + parts.slice(0, 2).join(' ')
}

export const durationFormat = {
  id: 'duration-format',
  name: 'Duration',
  description: 'Human durations for latency / elapsed columns.',
  kind: 'formatter',
  defaultConfig,

  /** @param {string} type @param {string} name */
  appliesTo(type, name) {
    return NUMERIC_RE.test(normalizeColumnType(type)) && NAME_RE.test(name)
  },

  /**
   * @param {unknown} value
   * @param {string} _type
   * @param {Record<string, unknown>} config
   * @param {string} name
   */
  format(value, _type, config, name) {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return null
    const cfg = { ...defaultConfig, ...config }
    let ms
    if (cfg.unit === 'ms') ms = n
    else if (cfg.unit === 's') ms = n * 1000
    else ms = SEC_RE.test(name) ? n * 1000 : MS_RE.test(name) ? n : n * 1000 // auto: default seconds
    const display = human(ms)
    return display ? { display, title: String(value) } : null
  },
}
