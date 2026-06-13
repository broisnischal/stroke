// Smart text — country flags, phone formatting, and URL shortening.
const COUNTRY_NAME_RE = /(country|nationality|locale|region)(_code)?$/i
const PHONE_NAME_RE = /(phone|mobile|tel|cell|contact_number|whatsapp)/i
const URL_RE = /^https?:\/\/\S+$/i

/** @param {string} cc 2-letter ISO code → flag emoji */
function flag(cc) {
  const u = cc.toUpperCase()
  if (!/^[A-Z]{2}$/.test(u)) return null
  return String.fromCodePoint(...[...u].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65))
}

/** @param {string} raw */
function formatPhone(raw) {
  const d = raw.replace(/[^\d+]/g, '')
  // US/CA 10 or 11-digit
  const m10 = d.replace(/^\+?1/, '')
  if (/^\d{10}$/.test(m10)) return `(${m10.slice(0, 3)}) ${m10.slice(3, 6)}-${m10.slice(6)}`
  if (d.startsWith('+')) return d.replace(/(\+\d{1,3})(\d{2,4})(\d{3,4})(\d+)/, '$1 $2 $3 $4')
  return null
}

/** @param {string} url */
function shortenUrl(url) {
  try {
    const u = new URL(url)
    const path = u.pathname.length > 1 ? u.pathname : ''
    const tail = path.length > 18 ? '/…' + path.slice(-14) : path
    return u.host + tail + (u.search ? '?…' : '')
  } catch {
    return null
  }
}

export const smartText = {
  id: 'smart-text',
  name: 'Smart Text',
  description: 'Country flags, formatted phones, shortened URLs.',
  kind: 'formatter',

  /** @param {string} _type @param {string} name @param {unknown} value */
  appliesTo(_type, name, value) {
    if (COUNTRY_NAME_RE.test(name) || PHONE_NAME_RE.test(name)) return true
    return typeof value === 'string' && URL_RE.test(value)
  },

  /**
   * @param {unknown} value
   * @param {string} _type
   * @param {Record<string, unknown>} _config
   * @param {string} name
   */
  format(value, _type, _config, name) {
    if (typeof value !== 'string' || !value) return null
    if (COUNTRY_NAME_RE.test(name) && /^[a-z]{2}$/i.test(value.trim())) {
      const f = flag(value.trim())
      return f ? { display: `${f} ${value.toUpperCase()}` } : null
    }
    if (PHONE_NAME_RE.test(name)) {
      const p = formatPhone(value)
      return p ? { display: p, title: value } : null
    }
    if (URL_RE.test(value)) {
      const s = shortenUrl(value)
      return s ? { display: s, title: value } : null
    }
    return null
  },
}
