// Linkifiers — turn IDs into deep links to external systems via URL templates.
// Templates support {value} (the cell, URL-encoded) and {raw} (unencoded).
// Ships with Stripe-style defaults; users add their own rules in settings.

export const DEFAULT_RULES = [
  { pattern: '^cus_', template: 'https://dashboard.stripe.com/customers/{value}' },
  { pattern: '^sub_', template: 'https://dashboard.stripe.com/subscriptions/{value}' },
  { pattern: '^in_', template: 'https://dashboard.stripe.com/invoices/{value}' },
  { pattern: '^(pi|ch)_', template: 'https://dashboard.stripe.com/payments/{value}' },
  { pattern: '^prod_', template: 'https://dashboard.stripe.com/products/{value}' },
]

/** Compile a rule's pattern once; tolerate bad regex. */
const _reCache = new Map()
function re(pattern) {
  if (_reCache.has(pattern)) return _reCache.get(pattern)
  let r = null
  try { r = new RegExp(pattern, 'i') } catch {}
  _reCache.set(pattern, r)
  return r
}

export const linkify = {
  id: 'linkify',
  name: 'Linkifiers',
  description: 'Turn IDs into links to Stripe, dashboards, etc.',
  kind: 'linkify',
  defaultConfig: { rules: DEFAULT_RULES },

  /**
   * @param {unknown} value
   * @param {string} _type
   * @param {string} _name
   * @param {Record<string, unknown>} config
   * @returns {string | null}
   */
  linkify(value, _type, _name, config) {
    if (value === null || value === undefined) return null
    const s = String(value)
    if (!s) return null
    const rules = Array.isArray(config.rules) ? config.rules : DEFAULT_RULES
    for (const rule of rules) {
      if (!rule?.pattern || !rule?.template) continue
      const r = re(rule.pattern)
      if (r && r.test(s)) {
        return rule.template
          .replaceAll('{value}', encodeURIComponent(s))
          .replaceAll('{raw}', s)
      }
    }
    return null
  },
}
