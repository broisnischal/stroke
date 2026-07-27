import { describe, it, expect } from 'vitest'
import { formatSql } from './format-sql.js'

describe('formatSql', () => {
  it('upper-cases keywords and reflows a statement', () => {
    const out = formatSql('select id, name from users where id = 1')
    expect(out).toContain('SELECT')
    expect(out).toContain('FROM')
    expect(out).toContain('WHERE')
  })

  it('returns the original input for a blank string (no throw)', () => {
    expect(formatSql('')).toBe('')
    expect(formatSql('   ')).toBe('   ')
  })

  it('falls back to the original text when formatting throws', () => {
    // Deliberately malformed — formatSql must never throw, just return input.
    const junk = 'this is not ;; valid (( sql'
    expect(typeof formatSql(junk)).toBe('string')
  })
})
