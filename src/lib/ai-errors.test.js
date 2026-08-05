import { describe, it, expect } from 'vitest'
import { humanizeDbError } from './ai.js'

describe('humanizeDbError', () => {
  it('lifts the cause out of a D1 HTTP envelope', () => {
    const raw =
      'Error: D1 API error 400 Bad Request: {"messages":[],"result":[],"success":false,' +
      '"errors":[{"code":7500,"message":"no such column: activated at offset 51: SQLITE_ERROR"}]}'
    expect(humanizeDbError(raw)).toBe('no such column: activated')
  })

  it('reads a bare {message} envelope', () => {
    expect(humanizeDbError('boom: {"message":"relation \\"users\\" does not exist"}'))
      .toBe('relation "users" does not exist')
  })

  it('recovers the message from a truncated payload it cannot parse', () => {
    // A cut-off body still contains the field; JSON.parse on it throws.
    expect(humanizeDbError('API error: {"errors":[{"message":"syntax error near FROM"'))
      .toBe('syntax error near FROM')
  })

  it('passes a plain driver message through, minus the Error: prefix', () => {
    expect(humanizeDbError('Error: permission denied for table users'))
      .toBe('permission denied for table users')
  })

  it('never returns empty', () => {
    expect(humanizeDbError('')).toBe('Query failed')
    expect(humanizeDbError(null)).toBe('Query failed')
    expect(humanizeDbError('   ')).toBe('Query failed')
  })

  it('leaves a message with no engine bookkeeping untouched', () => {
    expect(humanizeDbError('division by zero')).toBe('division by zero')
  })
})
