// Money / currency - render numeric money columns as localized currency.
import { normalizeColumnType } from '$lib/cell-value.js'

const NUMERIC_RE = /(int|numeric|decimal|real|double|float|money|number)/i
const NAME_RE = /(price|amount|cost|total|balance|revenue|fee|salary|payment|subtotal|charge|refund|discount|mrr|arr|income|expense|budget|wage|invoice_total|grand_total)/i

const defaultConfig = { currency: 'USD', locale: 'en-US', minorUnits: false }

/** @type {Map<string, Intl.NumberFormat>} */
const _cache = new Map()
function nf(locale, currency) {
  const key = locale + currency
  let f = _cache.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency })
    _cache.set(key, f)
  }
  return f
}

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'CAD', 'AUD', 'CNY', 'BRL', 'CHF']

export const moneyFormat = {
  id: 'money-format',
  name: 'Money / Currency',
  description: 'Localized currency for price & amount columns.',
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
   */
  format(value, _type, config) {
    let n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return null
    const cfg = { ...defaultConfig, ...config }
    if (cfg.minorUnits) n = n / 100 // values stored as cents
    return {
      display: nf(/** @type {string} */ (cfg.locale), /** @type {string} */ (cfg.currency)).format(n),
      title: String(value),
    }
  },
}
