// Color swatches — render a small color chip beside hex / rgb / hsl values.
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FUNC_RE = /^(?:rgb|rgba|hsl|hsla)\(\s*[\d.,%\s/]+\)$/i

/** @param {unknown} value */
function colorString(value) {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (HEX_RE.test(v) || FUNC_RE.test(v)) return v
  return null
}

export const colorSwatch = {
  id: 'color-swatch',
  name: 'Color Swatches',
  description: 'Preview hex / rgb / hsl color values inline.',
  kind: 'formatter',

  /** @param {string} _type @param {string} _name @param {unknown} value */
  appliesTo(_type, _name, value) {
    return colorString(value) !== null
  },

  /** @param {unknown} value */
  format(value) {
    const c = colorString(value)
    if (!c) return null
    return { display: String(value), swatch: c }
  },
}
