import { describe, it, expect } from 'vitest'
import { describeAiError, humanizeDbError } from './ai.js'

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

describe('describeAiError', () => {
  const OMNIROUTE_503 =
    'AI API 503: {"error":{"message":"[503]: Upstream request failed: Endpoint is unavailable.",' +
    '"type":"server_error","code":"service_unavailable"},"diagnostics":{"poolSize":6,"attempted":0,' +
    '"excluded":[{"provider":"groq","reason":"cooling down after 429"},{"provider":"cerebras","reason":"no api key"}]}}'

  it('never puts raw JSON in the headline', () => {
    const d = describeAiError(OMNIROUTE_503)
    expect(d.title).toBe('The AI provider is unavailable')
    expect(d.title).not.toContain('{')
    expect(d.hint).not.toContain('{')
  })

  it('answers "why" from the router diagnostics', () => {
    const d = describeAiError(OMNIROUTE_503)
    expect(d.hint).toContain('None of the 6 endpoints')
    expect(d.hint).toContain('nothing was tried')
    expect(d.hint).toContain('cooling down after 429')
    expect(d.hint).toContain('no api key')
  })

  it('keeps the provider payload for the details view', () => {
    expect(describeAiError(OMNIROUTE_503).detail).toContain('"poolSize":6')
  })

  it('reads the status out of the thrown message', () => {
    expect(describeAiError('AI API 429: {"error":{"message":"slow down"}}').status).toBe(429)
    expect(describeAiError('AI API 401: nope').status).toBe(401)
    expect(describeAiError('network unreachable').status).toBeNull()
  })

  it('strips the status the provider repeated inside its own message', () => {
    const d = describeAiError('AI API 503: {"error":{"message":"[503]: Upstream request failed."}}')
    expect(d.detail.startsWith('[503]:')).toBe(false)
    expect(d.detail).toContain('Upstream request failed.')
  })

  it('recovers the message from a payload cut off mid-JSON', () => {
    // The Rust bridge forwards only the first slice of the body.
    const d = describeAiError('AI API 500: {"error":{"message":"internal failure","cod')
    expect(d.detail).toContain('internal failure')
  })

  it('titles the common statuses in plain words', () => {
    expect(describeAiError('AI API 429: {}').title).toBe('Rate limit reached')
    expect(describeAiError('AI API 401: {}').title).toBe('The provider rejected the API key')
    expect(describeAiError('AI API 404: {}').title).toBe('Model not found at this endpoint')
    expect(describeAiError('boom').title).toBe('The AI request failed')
  })
})
