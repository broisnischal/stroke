// Boolean glyphs — a colored dot (or check/cross) instead of raw true/false.
import { isBooleanType } from '$lib/cell-value.js'

const GREEN = 'rgb(74,222,128)'
const RED = 'rgb(248,113,113)'

export const booleanGlyph = {
  id: 'boolean-glyph',
  name: 'Boolean Glyphs',
  description: 'Show a colored dot or ✓ / ✗ for boolean columns.',
  kind: 'formatter',

  /** @param {string} type */
  appliesTo(type) {
    return isBooleanType(type)
  },

  /**
   * @param {unknown} value
   * @param {string} _type
   * @param {Record<string, unknown>} config
   */
  format(value, _type, config) {
    const truthy = value === true || value === 'true' || value === 1 || value === '1' || value === 't'
    const falsy = value === false || value === 'false' || value === 0 || value === '0' || value === 'f'
    if (!truthy && !falsy) return null
    if (config.style === 'check') {
      return { display: truthy ? '✓ true' : '✗ false', fg: truthy ? GREEN : RED }
    }
    return { display: truthy ? 'true' : 'false', dot: truthy ? GREEN : RED }
  },
}
