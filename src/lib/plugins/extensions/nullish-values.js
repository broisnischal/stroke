// Empty & NULL markers — make the difference between NULL, an empty string, and
// a whitespace-only string obvious (they look identical in a raw grid). NULL is
// rendered as ∅ by the grid itself (it skips formatters for null); this handles
// the two non-null cases via a display directive.
//
//   ""      empty string
//   ·····   whitespace-only (one dot per char, capped)

const MUTED = 'rgb(148,163,184)' // slate-400
const WARN = 'rgb(251,191,36)' // amber-400

export const nullishValues = {
  id: 'nullish-values',
  name: 'Empty & NULL Markers',
  description: 'Tell NULL (∅), empty string (""), and whitespace-only (·····) cells apart.',
  kind: 'formatter',

  /** @param {string} _type @param {string} _name @param {unknown} value */
  appliesTo(_type, _name, value) {
    return typeof value === 'string' && (value === '' || value.trim() === '')
  },

  /** @param {unknown} value */
  format(value) {
    const s = /** @type {string} */ (value)
    if (s === '') return { display: '""', fg: MUTED, title: 'Empty string' }
    // whitespace-only, non-empty
    return {
      display: '·'.repeat(Math.min(s.length, 12)),
      fg: WARN,
      title: `Whitespace only (${s.length} char${s.length === 1 ? '' : 's'})`,
    }
  },
}
