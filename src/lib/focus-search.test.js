import { describe, it, expect } from 'vitest'
import { scoreSearchInput, pickSearchInput } from './focus-search.js'

/** @param {Partial<import('./focus-search.js').SearchCandidate>} over */
const c = (over = {}) => ({
  marked: false,
  type: 'text',
  placeholder: '',
  label: '',
  docIndex: 0,
  ...over,
})

describe('scoreSearchInput', () => {
  it('ignores a field that claims nothing', () => {
    // A password box, a row editor, a port number - "/" must never land there.
    expect(scoreSearchInput(c({ placeholder: 'localhost' }))).toBe(0)
    expect(scoreSearchInput(c({ type: 'password' }))).toBe(0)
  })

  it('trusts an explicit marker over any guess', () => {
    const marked = scoreSearchInput(c({ marked: true }))
    expect(marked).toBeGreaterThan(scoreSearchInput(c({ type: 'search' })))
    expect(marked).toBeGreaterThan(scoreSearchInput(c({ placeholder: 'Search tables…' })))
  })

  it('trusts a declared type over wording', () => {
    // type="search" is a statement; a placeholder that happens to say "filter"
    // is a coincidence of language.
    expect(scoreSearchInput(c({ type: 'search' })))
      .toBeGreaterThan(scoreSearchInput(c({ placeholder: 'Filter connections…' })))
  })

  it('reads the placeholders the app actually uses', () => {
    for (const p of ['Search tables…', 'Filter…', 'Filter keys…', 'Search settings…', 'Search logs…']) {
      expect(scoreSearchInput(c({ placeholder: p })), p).toBeGreaterThan(0)
    }
  })

  it('falls back to the accessible name when there is no placeholder', () => {
    expect(scoreSearchInput(c({ label: 'Filter saved connections' }))).toBeGreaterThan(0)
  })

  it('does not match a word that merely contains one', () => {
    // "Researcher" contains "search"; a word boundary keeps it out.
    expect(scoreSearchInput(c({ placeholder: 'Researcher name' }))).toBe(0)
  })
})

describe('pickSearchInput', () => {
  it('returns nothing when the screen has no search box', () => {
    expect(pickSearchInput([c({ placeholder: 'Port' }), c({ type: 'password' })])).toBeNull()
  })

  it('prefers the marked field over a better-worded one', () => {
    const best = pickSearchInput([
      c({ placeholder: 'Search everything…', docIndex: 0 }),
      c({ marked: true, placeholder: '', docIndex: 1 }),
    ])
    expect(best?.docIndex).toBe(1)
  })

  it('breaks ties by document order', () => {
    // Toolbars sit above the content they filter, so the first match down the
    // page belongs to the surface in front of you.
    const best = pickSearchInput([
      c({ placeholder: 'Search rows…', docIndex: 3 }),
      c({ placeholder: 'Search columns…', docIndex: 1 }),
    ])
    expect(best?.docIndex).toBe(1)
  })
})
