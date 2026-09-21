// Better Time - humanized, timezone-aware rendering for date & timestamp columns.
//
// Replaces raw DB timestamps ("2024-01-15 10:30:00+00") with readable, locale +
// timezone-aware text, with an optional relative mode ("3 hours ago"). The raw
// value is preserved in the cell tooltip. No moment.js needed - built on the
// platform Intl APIs.
import { isDateTimeType, isDateOnlyType } from '$lib/cell-value.js'

/**
 * Country names for the zones whose id does not carry one.
 *
 * A curated list of 40 cities could not answer "what time is this in Nepal",
 * and neither can the full IANA list on its own: the zone is called
 * `Asia/Kathmandu`, so typing "nepal" matches nothing. These are keywords, not
 * the list - the zones themselves come from the platform below - and only the
 * ones where the city and the country differ are worth an entry.
 * @type {Record<string, string>}
 */
const ZONE_COUNTRY = {
  // Both spellings of every renamed zone: the platform decides which one it
  // reports, and ICU builds differ - Node still says Asia/Katmandu,
  // Asia/Calcutta, Europe/Kiev where a newer one says Kathmandu, Kolkata, Kyiv.
  'Asia/Kathmandu': 'Nepal', 'Asia/Katmandu': 'Nepal',
  'Asia/Kolkata': 'India', 'Asia/Calcutta': 'India',
  'Asia/Karachi': 'Pakistan', 'Asia/Dhaka': 'Bangladesh', 'Asia/Colombo': 'Sri Lanka',
  'Asia/Kabul': 'Afghanistan', 'Asia/Thimphu': 'Bhutan', 'Asia/Yangon': 'Myanmar',
  'Asia/Dubai': 'United Arab Emirates', 'Asia/Riyadh': 'Saudi Arabia', 'Asia/Qatar': 'Qatar',
  'Asia/Kuwait': 'Kuwait', 'Asia/Muscat': 'Oman', 'Asia/Baghdad': 'Iraq',
  'Asia/Tehran': 'Iran', 'Asia/Jerusalem': 'Israel', 'Asia/Beirut': 'Lebanon',
  'Asia/Damascus': 'Syria', 'Asia/Amman': 'Jordan', 'Asia/Baku': 'Azerbaijan',
  'Asia/Yerevan': 'Armenia', 'Asia/Tbilisi': 'Georgia', 'Asia/Tashkent': 'Uzbekistan',
  'Asia/Almaty': 'Kazakhstan', 'Asia/Bishkek': 'Kyrgyzstan', 'Asia/Dushanbe': 'Tajikistan',
  'Asia/Ashgabat': 'Turkmenistan', 'Asia/Ulaanbaatar': 'Mongolia',
  'Asia/Shanghai': 'China', 'Asia/Hong_Kong': 'Hong Kong', 'Asia/Taipei': 'Taiwan',
  'Asia/Macau': 'Macau', 'Asia/Tokyo': 'Japan', 'Asia/Seoul': 'South Korea',
  'Asia/Pyongyang': 'North Korea', 'Asia/Bangkok': 'Thailand', 'Asia/Ho_Chi_Minh': 'Vietnam',
  'Asia/Saigon': 'Vietnam', 'Asia/Phnom_Penh': 'Cambodia', 'Asia/Vientiane': 'Laos',
  'Asia/Manila': 'Philippines', 'Asia/Jakarta': 'Indonesia', 'Asia/Makassar': 'Indonesia',
  'Asia/Jayapura': 'Indonesia', 'Asia/Kuala_Lumpur': 'Malaysia', 'Asia/Kuching': 'Malaysia',
  'Asia/Brunei': 'Brunei', 'Asia/Singapore': 'Singapore',
  'Europe/London': 'United Kingdom', 'Europe/Dublin': 'Ireland', 'Europe/Lisbon': 'Portugal',
  'Europe/Madrid': 'Spain', 'Europe/Paris': 'France', 'Europe/Brussels': 'Belgium',
  'Europe/Amsterdam': 'Netherlands', 'Europe/Berlin': 'Germany', 'Europe/Zurich': 'Switzerland',
  'Europe/Vienna': 'Austria', 'Europe/Rome': 'Italy', 'Europe/Prague': 'Czechia',
  'Europe/Warsaw': 'Poland', 'Europe/Budapest': 'Hungary', 'Europe/Bucharest': 'Romania',
  'Europe/Sofia': 'Bulgaria', 'Europe/Athens': 'Greece', 'Europe/Istanbul': 'Turkey',
  'Europe/Kyiv': 'Ukraine', 'Europe/Kiev': 'Ukraine', 'Europe/Moscow': 'Russia',
  'Europe/Stockholm': 'Sweden', 'Europe/Oslo': 'Norway', 'Europe/Copenhagen': 'Denmark',
  'Europe/Helsinki': 'Finland', 'Europe/Tallinn': 'Estonia', 'Europe/Riga': 'Latvia',
  'Europe/Vilnius': 'Lithuania', 'Europe/Belgrade': 'Serbia', 'Europe/Zagreb': 'Croatia',
  'Atlantic/Reykjavik': 'Iceland',
  'America/New_York': 'United States', 'America/Chicago': 'United States',
  'America/Denver': 'United States', 'America/Los_Angeles': 'United States',
  'America/Phoenix': 'United States', 'America/Anchorage': 'United States',
  'Pacific/Honolulu': 'United States', 'America/Toronto': 'Canada',
  'America/Vancouver': 'Canada', 'America/Edmonton': 'Canada', 'America/Winnipeg': 'Canada',
  'America/Halifax': 'Canada', 'America/St_Johns': 'Canada',
  'America/Mexico_City': 'Mexico', 'America/Guatemala': 'Guatemala',
  'America/Havana': 'Cuba', 'America/Panama': 'Panama', 'America/Bogota': 'Colombia',
  'America/Lima': 'Peru', 'America/Caracas': 'Venezuela', 'America/La_Paz': 'Bolivia',
  'America/Santiago': 'Chile', 'America/Argentina/Buenos_Aires': 'Argentina',
  'America/Montevideo': 'Uruguay', 'America/Asuncion': 'Paraguay',
  'America/Sao_Paulo': 'Brazil', 'America/Manaus': 'Brazil',
  'Africa/Cairo': 'Egypt', 'Africa/Casablanca': 'Morocco', 'Africa/Algiers': 'Algeria',
  'Africa/Tunis': 'Tunisia', 'Africa/Tripoli': 'Libya', 'Africa/Lagos': 'Nigeria',
  'Africa/Accra': 'Ghana', 'Africa/Abidjan': 'Ivory Coast', 'Africa/Dakar': 'Senegal',
  'Africa/Nairobi': 'Kenya', 'Africa/Addis_Ababa': 'Ethiopia', 'Africa/Kampala': 'Uganda',
  'Africa/Dar_es_Salaam': 'Tanzania', 'Africa/Kinshasa': 'DR Congo',
  'Africa/Johannesburg': 'South Africa', 'Africa/Harare': 'Zimbabwe',
  'Africa/Lusaka': 'Zambia', 'Africa/Maputo': 'Mozambique', 'Africa/Luanda': 'Angola',
  'Australia/Sydney': 'Australia', 'Australia/Melbourne': 'Australia',
  'Australia/Brisbane': 'Australia', 'Australia/Perth': 'Australia',
  'Australia/Adelaide': 'Australia', 'Australia/Darwin': 'Australia',
  'Australia/Hobart': 'Australia', 'Pacific/Auckland': 'New Zealand',
  'Pacific/Fiji': 'Fiji', 'Pacific/Port_Moresby': 'Papua New Guinea',
  'Pacific/Guam': 'Guam', 'Pacific/Tahiti': 'French Polynesia',
  'Indian/Maldives': 'Maldives', 'Indian/Mauritius': 'Mauritius',
}

/**
 * City spellings a zone id may not carry.
 *
 * `Asia/Katmandu` is the id an older ICU reports, and nobody searches for it
 * with that spelling. The alias goes in the keywords so the row is found either
 * way, whichever name this platform's zone list happens to use.
 * @type {Record<string, string[]>}
 */
const ZONE_ALSO_KNOWN = {
  'Asia/Katmandu': ['Kathmandu'],
  'Asia/Kathmandu': ['Katmandu'],
  'Asia/Calcutta': ['Kolkata'],
  'Asia/Kolkata': ['Calcutta'],
  'Europe/Kiev': ['Kyiv'],
  'Europe/Kyiv': ['Kiev'],
  'Asia/Saigon': ['Ho Chi Minh City'],
  'Asia/Ho_Chi_Minh': ['Saigon'],
  'Asia/Rangoon': ['Yangon'],
  'Asia/Yangon': ['Rangoon'],
  'Africa/Asmera': ['Asmara'],
  'Asia/Istanbul': ['Constantinople'],
}

/** The zones offered first, because they are the ones asked for most. */
const PINNED_ZONES = ['local', 'UTC']

/** @param {string} zone */
function zoneCity(zone) {
  const city = zone.split('/').pop() ?? zone
  return city.replace(/_/g, ' ')
}

/** @param {string} zone */
function zoneRegion(zone) {
  const parts = zone.split('/')
  return parts.length > 1 ? parts[0].replace(/_/g, ' ') : ''
}

/**
 * Every timezone the platform knows, each labelled by its city and searchable
 * by city, region, country and zone id.
 *
 * Read from `Intl.supportedValuesOf` rather than tabulated: the full IANA list
 * is ~420 zones, it moves (Kyiv, Ulaanbaatar), and the platform already ships
 * the copy the formatter will actually use - a hand-written list can only be a
 * subset of it, which is how "no Nepal" happens. The fallback is the previous
 * curated list, for a webview without that API.
 * @type {{ value: string, label: string, region: string, country: string, keywords: string[] }[]}
 */
export const TIMEZONE_OPTIONS = (() => {
  /** @type {string[]} */
  let zones = []
  try {
    // @ts-ignore - not in every lib.dom yet
    zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  } catch {
    zones = []
  }
  if (zones.length === 0) {
    zones = [
      'UTC', 'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver',
      'America/Chicago', 'America/Mexico_City', 'America/New_York', 'America/Bogota',
      'America/Santiago', 'America/Sao_Paulo', 'Atlantic/Reykjavik', 'Europe/London',
      'Europe/Lisbon', 'Europe/Berlin', 'Europe/Paris', 'Europe/Warsaw', 'Africa/Lagos',
      'Europe/Athens', 'Africa/Cairo', 'Africa/Johannesburg', 'Europe/Istanbul',
      'Europe/Moscow', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Tehran', 'Asia/Karachi',
      'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Jakarta',
      'Asia/Shanghai', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Asia/Seoul',
      'Australia/Perth', 'Australia/Adelaide', 'Australia/Sydney', 'Pacific/Auckland',
    ]
  }
  const rest = zones
    .filter((z) => !PINNED_ZONES.includes(z))
    .sort((a, b) => zoneCity(a).localeCompare(zoneCity(b)))
  return [...PINNED_ZONES, ...rest].map((value) => {
    if (value === 'local') {
      return { value, label: 'Local (system)', region: '', country: '', keywords: ['local', 'system', 'machine', 'browser'] }
    }
    const label = value === 'UTC' ? 'UTC' : zoneCity(value)
    const region = zoneRegion(value)
    const country = ZONE_COUNTRY[value] ?? ''
    return {
      value,
      label,
      region,
      country,
      // The zone id goes in whole AND split, so both "asia/kathmandu" and
      // "kathmandu" match, and the country name is what makes "nepal" work.
      keywords: [
        label, region, country, value, value.replace(/[_/]/g, ' '),
        ...(ZONE_ALSO_KNOWN[value] ?? []),
      ].filter(Boolean),
    }
  })
})()

/**
 * A zone's current UTC offset, as `UTC+05:45`.
 *
 * Read from the platform rather than tabulated, so it is right through a DST
 * change instead of right in January. `local` resolves to whatever the machine
 * is set to, which is the number a developer comparing a stored `+00` against
 * their own clock actually needs.
 * @param {string} timeZone
 */
export function timeZoneOffsetLabel(timeZone) {
  try {
    const zone = !timeZone || timeZone === 'local' ? undefined : timeZone
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(new Date())
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
    // Intl spells UTC itself as "GMT"; every other zone comes back "GMT+05:45".
    return name.replace('GMT', 'UTC') || 'UTC+00:00'
  } catch {
    return ''
  }
}

/**
 * `mode` absolute|relative · `timeZone` an IANA id or `local` · `precision` how
 * much of the time to print · `hour12` 12- or 24-hour clock · `showZone`
 * append the zone abbreviation.
 */
const defaultConfig = {
  mode: 'absolute',
  timeZone: 'local',
  dateOnly: false,
  precision: 'seconds',
  hour12: false,
  showZone: false,
}

/** How much of the time to print. Millis matter when rows are ordered by it. */
export const PRECISION_OPTIONS = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'seconds', label: 'Seconds' },
  { value: 'millis', label: 'Milliseconds' },
]

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

    /** @type {Intl.DateTimeFormatOptions} */
    const timeOpts = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: cfg.hour12 === true,
      ...(cfg.precision === 'minutes' ? {} : { second: '2-digit' }),
      ...(cfg.precision === 'millis' ? { fractionalSecondDigits: /** @type {3} */ (3) } : {}),
      ...(cfg.showZone === true ? { timeZoneName: /** @type {'short'} */ ('short') } : {}),
    }

    if (cfg.mode === 'relative') {
      const abs = dtf(tz, { year: 'numeric', month: 'short', day: 'numeric', ...timeOpts }).format(d)
      return { display: relative(d), title: `${abs}, ${String(value)}` }
    }

    const display = dtf(tz, {
      year: 'numeric', month: 'short', day: 'numeric', ...timeOpts,
    }).format(d)
    return { display, title: String(value) }
  },
}
