// Boolean glyphs - a colored dot (or check/cross) instead of raw true/false.
import { isBooleanType } from '$lib/cell-value.js'
import { isCurrentThemeDark } from '$lib/stores/settings.js'

// 400-shades glow on a dark grid; on a light background they wash out, so use
// deeper 600-shades there. Kept in sync via one long-lived subscription so
// format() (per-cell hot path) reads plain values.
let _dark = true
isCurrentThemeDark.subscribe((v) => { _dark = v })

const GREEN = () => (_dark ? 'rgb(74,222,128)' : 'rgb(22,163,74)')
const RED = () => (_dark ? 'rgb(248,113,113)' : 'rgb(220,38,38)')

/**
 * The forms a boolean can take in the grid.
 *
 * `dot` and `check` keep a word beside the mark; `onezero`, `onoff`, `yesno` and
 * `bullet` replace it. Which one is right depends on the column, not on taste -
 * `1 / 0` is what SQLite and MySQL actually store, `on / off` reads as a setting,
 * `yes / no` as an answer, and the bare dot is for a wide table where the column
 * is one of forty and the word is just noise.
 *
 * Colour is not the only cue in any of them: every style carries a distinct
 * SHAPE or WORD as well, so the true/false split survives a monochrome screen and
 * the two kinds of colour blindness that flatten a red/green pair.
 * @type {{ value: string, label: string, on: string, off: string, dotOnly?: boolean }[]}
 */
export const BOOLEAN_STYLES = [
  { value: 'dot',     label: 'Dot + text',  on: 'true', off: 'false' },
  { value: 'check',   label: '✓ true / ✗ false', on: '✓ true', off: '✗ false' },
  { value: 'glyph',   label: '✓ / ✗',       on: '✓',    off: '✗' },
  { value: 'onezero', label: '1 / 0',       on: '1',    off: '0' },
  { value: 'onoff',   label: 'on / off',    on: 'on',   off: 'off' },
  { value: 'yesno',   label: 'yes / no',    on: 'yes',  off: 'no' },
  { value: 'bullet',  label: 'Dot only',    on: '',     off: '',  dotOnly: true },
]

export const booleanGlyph = {
  id: 'boolean-glyph',
  name: 'Boolean Glyphs',
  description: 'Draw boolean columns as a dot, ✓ / ✗, 1 / 0, on / off or yes / no.',
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
    const style = BOOLEAN_STYLES.find((s) => s.value === config.style) ?? BOOLEAN_STYLES[0]
    const color = truthy ? GREEN() : RED()
    // `dot` keeps the swatch beside the word; the rest ARE the mark, so a second
    // dot next to them would state the same thing twice.
    if (style.value === 'dot') return { display: truthy ? 'true' : 'false', dot: color }
    if (style.dotOnly) {
      // Nothing is written, so the tooltip is the only place the value is legible
      // to a screen reader or to anyone who cannot separate the two colours.
      return { display: '', dot: color, title: truthy ? 'true' : 'false' }
    }
    return { display: truthy ? style.on : style.off, fg: color, title: truthy ? 'true' : 'false' }
  },
}
