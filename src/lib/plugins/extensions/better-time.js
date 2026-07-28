// Better Time - humanized, timezone-aware rendering for date & timestamp columns.
//
// Replaces raw DB timestamps ("2024-01-15 10:30:00+00") with readable, locale +
// timezone-aware text, with an optional relative mode ("3 hours ago"). The raw
// value is preserved in the cell tooltip. No moment.js needed - built on the
// platform Intl APIs.
import { isDateTimeType, isDateOnlyType } from '$lib/cell-value.js'

export const TIMEZONE_OPTIONS = [
  { value: 'local', label: 'Local (system)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'America/Los_Angeles', label: 'Los Angeles' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Asia/Kolkata', label: 'Kolkata' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
]

const defaultConfig = { mode: 'absolute', timeZone: 'local', dateOnly: false }

/** @type {Map<string, Intl.DateTimeFormat>} */
const _fmtCache = new Map()
/** @param {string|undefined} timeZone @param {Intl.DateTimeFormatOptions} opts */
function dtf(timeZone, opts) {
  const key = (timeZone ?? 'local') + JSON.stringify(opts)
  let f = _fmtCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', timeZone && timeZone !== 'local' ? { ...opts, timeZone } : opts)
    _fmtCache.set(key, f)
  }
  return f
}

const _rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })

/** @param {unknown} value @returns {Date|null} */
function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof value !== 'string') return null
  let s = value.trim()
  if (!s) return null
  // Normalize Postgres textual timestamps for the platform Date parser:
  //   "2025-12-09 18:18:30.490 UTC"  → trailing " UTC"/" GMT" becomes "Z"
  //   "2025-12-09 18:18:30.490+00"   → short "+00" offset becomes "+00:00"
  //   "2025-12-09 18:18:30.490"      → date/time space becomes "T"
  s = s.replace(/\s+(?:UTC|GMT)$/i, 'Z')
  s = s.replace(' ', 'T')
  s = s.replace(/([+-]\d{2})$/, '$1:00')
  let d = new Date(s)
  if (!Number.isNaN(d.getTime())) return d
  // Fall back to the platform's best-effort parse of the original string.
  d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** @param {Date} d */
function relative(d) {
  const diffSec = Math.round((d.getTime() - Date.now()) / 1000)
  const abs = Math.abs(diffSec)
  /** @type {[number, Intl.RelativeTimeFormatUnit][]} */
  const units = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [604800, 'day'],
    [2629800, 'week'],
    [31557600, 'month'],
    [Infinity, 'year'],
  ]
  const divisors = [1, 60, 3600, 86400, 604800, 2629800, 31557600]
  for (let i = 0; i < units.length; i++) {
    if (abs < units[i][0]) {
      return _rtf.format(Math.round(diffSec / divisors[i]), units[i][1])
    }
  }
  return _rtf.format(Math.round(diffSec / 31557600), 'year')
}

export const betterTime = {
  id: 'better-time',
  name: 'Better Time',
  description: 'Readable, timezone-aware dates & relative timestamps.',
  kind: 'formatter',
  defaultConfig,

  /** @param {string} type */
  appliesTo(type) {
    return isDateTimeType(type) || isDateOnlyType(type)
  },

  /**
   * @param {unknown} value
   * @param {string} type
   * @param {Record<string, unknown>} config
   * @returns {{ display: string, title?: string } | null}
   */
  format(value, type, config) {
    const d = toDate(value)
    if (!d) return null
    const cfg = { ...defaultConfig, ...config }
    const tz = /** @type {string} */ (cfg.timeZone)

    if (isDateOnlyType(type)) {
      const display = dtf(tz, { year: 'numeric', month: 'short', day: 'numeric' }).format(d)
      return { display, title: String(value) }
    }

    if (cfg.mode === 'relative') {
      const abs = dtf(tz, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(d)
      return { display: relative(d), title: `${abs}, ${String(value)}` }
    }

    const display = dtf(tz, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(d)
    return { display, title: String(value) }
  },
}
