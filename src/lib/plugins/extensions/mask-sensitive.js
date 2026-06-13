// Sensitive-data masking — hide emails, tokens, cards, SSNs by default and
// reveal on hover. Useful for screen-sharing and demos.
const NAME_RE = /(password|secret|token|api_?key|access_?key|private_?key|ssn|social_security|card|credit|cvv|cvc|pin|auth)/i
const CARD_NAME_RE = /(card|credit|cc_|_cc|^cc$|pan)/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SSN_RE = /^\d{3}-?\d{2}-?\d{4}$/
const TOKEN_RE = /^(sk|pk|rk|whsec|ghp|gho|xox[bpoa]|Bearer|eyJ)[\w.\-]{8,}$/i

const defaultConfig = { revealOnHover: true }

/** @param {unknown} v */
function digits(v) {
  return String(v).replace(/\D/g, '')
}

/** Luhn checksum — keeps real card numbers in, random long numbers out. */
function luhn(/** @type {string} */ num) {
  let sum = 0, alt = false
  for (let i = num.length - 1; i >= 0; i--) {
    let d = num.charCodeAt(i) - 48
    if (d < 0 || d > 9) return false
    if (alt) { d *= 2; if (d > 9) d -= 9 }
    sum += d
    alt = !alt
  }
  return sum % 10 === 0
}

/** @param {unknown} v */
function isCardNumber(v) {
  const d = digits(v)
  return d.length >= 13 && d.length <= 19 && luhn(d)
}

/** @param {string} s */
function maskEmail(s) {
  const [local, domain] = s.split('@')
  return `${local.slice(0, 1)}${'•'.repeat(Math.max(3, local.length - 1))}@${domain}`
}

/** @param {unknown} v */
function maskCard(v) {
  const d = digits(v)
  return `•••• •••• •••• ${d.slice(-4)}`
}

/** @param {string} s */
function maskGeneric(s) {
  if (s.length <= 6) return '•'.repeat(s.length)
  return `${s.slice(0, 3)}${'•'.repeat(6)}${s.slice(-2)}`
}

export const maskSensitive = {
  id: 'mask-sensitive',
  name: 'Sensitive Masking',
  description: 'Mask emails, cards, tokens & secrets; reveal on hover.',
  kind: 'formatter',
  defaultConfig,

  /** @param {string} _type @param {string} name @param {unknown} value */
  appliesTo(_type, name, value) {
    if (NAME_RE.test(name)) return true
    if (isCardNumber(value)) return true
    if (typeof value !== 'string') return false
    return EMAIL_RE.test(value) || SSN_RE.test(value) || TOKEN_RE.test(value)
  },

  /**
   * @param {unknown} value
   * @param {string} _type
   * @param {Record<string, unknown>} config
   * @param {string} name
   */
  format(value, _type, config, name) {
    if (value === null || value === undefined) return null
    const s = String(value)
    if (!s) return null
    const nameCard = CARD_NAME_RE.test(name)
    let masked
    if (EMAIL_RE.test(s)) masked = maskEmail(s)
    else if (isCardNumber(s) || (nameCard && digits(s).length >= 8)) masked = maskCard(s)
    else if (SSN_RE.test(s)) masked = `•••-••-${digits(s).slice(-4)}`
    else masked = maskGeneric(s)
    const cfg = { ...defaultConfig, ...config }
    return { display: masked, mask: true, reveal: cfg.revealOnHover ? s : masked }
  },
}
