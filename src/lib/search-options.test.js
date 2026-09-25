import { describe, expect, it } from 'vitest'
import { buildSearchQuery, supportedSearchOptions, hasActiveSearchOptions, searchOptionHotkey } from './search-options.js'

const OFF = { matchCase: false, wholeWord: false, regex: false }

describe('buildSearchQuery', () => {
  it('passes a plain term through when nothing is enabled', () => {
    expect(buildSearchQuery('phone', OFF, 'postgres')).toEqual({
      search: 'phone',
      searchIsRegex: false,
      searchCaseSensitive: false,
    })
  })

  // The bug this file exists for: match-case was expressed as the ARE option
  // `(?c)` inside the pattern, with the operator left at `~*`, so the backend
  // never saw the flag and a case-sensitive search matched case-insensitively.
  it('sends match-case as a flag on Postgres, not as a pattern prefix', () => {
    const q = buildSearchQuery('phone screening', { ...OFF, matchCase: true }, 'postgres')
    expect(q.searchCaseSensitive).toBe(true)
    expect(q.search).toBe('phone screening')
    expect(q.search).not.toContain('(?c)')
    // A literal substring needs no regex operator.
    expect(q.searchIsRegex).toBe(false)
  })

  it('anchors whole-word searches and keeps the case flag separate', () => {
    const q = buildSearchQuery('phone', { matchCase: true, wholeWord: true, regex: false }, 'postgres')
    expect(q).toEqual({
      search: '\\m(?:phone)\\M',
      searchIsRegex: true,
      searchCaseSensitive: true,
    })
  })

  it('escapes a literal term used with whole-word', () => {
    const q = buildSearchQuery('a.b', { ...OFF, wholeWord: true }, 'postgres')
    expect(q.search).toBe('\\m(?:a\\.b)\\M')
  })

  it('leaves a regex term unescaped', () => {
    const q = buildSearchQuery('^ph.ne$', { ...OFF, regex: true }, 'postgres')
    expect(q).toEqual({ search: '^ph.ne$', searchIsRegex: true, searchCaseSensitive: false })
  })

  it('combines regex and whole-word into one anchored pattern', () => {
    const q = buildSearchQuery('ph.ne', { matchCase: false, wholeWord: true, regex: true }, 'postgres')
    expect(q.search).toBe('\\m(?:ph.ne)\\M')
    expect(q.searchIsRegex).toBe(true)
  })

  it('uses \\b boundaries on MySQL', () => {
    const q = buildSearchQuery('phone', { matchCase: true, wholeWord: true, regex: false }, 'mysql')
    expect(q).toEqual({ search: '\\b(?:phone)\\b', searchIsRegex: true, searchCaseSensitive: true })
  })

  it('masks options the engine cannot honor', () => {
    // SQLite has no REGEXP, so regex and whole-word are dropped and only the
    // case flag survives.
    const q = buildSearchQuery('phone', { matchCase: true, wholeWord: true, regex: true }, 'sqlite')
    expect(q).toEqual({ search: 'phone', searchIsRegex: false, searchCaseSensitive: true })
  })

  it('drops every option on an engine that supports none', () => {
    const q = buildSearchQuery('phone', { matchCase: true, wholeWord: true, regex: true }, 'mssql')
    expect(q).toEqual({ search: 'phone', searchIsRegex: false, searchCaseSensitive: false })
  })

  it('leaves an empty term alone', () => {
    expect(buildSearchQuery('  ', { ...OFF, regex: true }, 'postgres').searchIsRegex).toBe(false)
  })
})

describe('supportedSearchOptions', () => {
  it('gives Postgres and MySQL all three', () => {
    expect(supportedSearchOptions('postgres')).toEqual({ matchCase: true, wholeWord: true, regex: true })
    expect(supportedSearchOptions('mysql')).toEqual({ matchCase: true, wholeWord: true, regex: true })
  })

  it('gives the SQLite family match-case only', () => {
    for (const d of ['sqlite', 'd1', 'libsql']) {
      expect(supportedSearchOptions(d)).toEqual({ matchCase: true, wholeWord: false, regex: false })
    }
  })
})

describe('hasActiveSearchOptions', () => {
  it('is false for nothing set and true for any one', () => {
    expect(hasActiveSearchOptions(OFF)).toBe(false)
    expect(hasActiveSearchOptions(null)).toBe(false)
    expect(hasActiveSearchOptions({ ...OFF, regex: true })).toBe(true)
  })
})

describe('searchOptionHotkey', () => {
  /** @param {Partial<KeyboardEvent>} e */
  const ev = (e) => /** @type {KeyboardEvent} */ ({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...e })

  it('reads the editor chords off the physical key', () => {
    expect(searchOptionHotkey(ev({ altKey: true, code: 'KeyC' }))).toBe('matchCase')
    expect(searchOptionHotkey(ev({ altKey: true, code: 'KeyR' }))).toBe('regex')
    expect(searchOptionHotkey(ev({ altKey: true, code: 'KeyW' }))).toBe('wholeWord')
  })

  it('ignores the same letters without Alt, and Alt with another modifier', () => {
    expect(searchOptionHotkey(ev({ code: 'KeyC' }))).toBe(null)
    expect(searchOptionHotkey(ev({ altKey: true, ctrlKey: true, code: 'KeyC' }))).toBe(null)
    // Alt+R is "reset table view" - it must not land here too.
    expect(searchOptionHotkey(ev({ altKey: true, shiftKey: true, code: 'KeyR' }))).toBe(null)
  })

  it('ignores every other key', () => {
    expect(searchOptionHotkey(ev({ altKey: true, code: 'KeyX' }))).toBe(null)
  })
})
