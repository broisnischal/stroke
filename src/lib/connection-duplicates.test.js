import { describe, expect, it } from 'vitest'
import { connectionTargetKey, findDuplicateConnection } from './stores/connections.js'

const pg = (over = {}) => ({
  id: 'a', type: 'postgres', name: 'prod', host: 'db.example.com', port: 5432,
  database: 'app', user: 'admin', ...over,
})

describe('connectionTargetKey', () => {
  it('ignores the name, so a re-saved copy matches the original', () => {
    expect(connectionTargetKey(pg())).toBe(connectionTargetKey(pg({ id: 'b', name: 'prod copy' })))
  })

  it('treats host case and a numeric/string port as the same target', () => {
    expect(connectionTargetKey(pg({ host: 'DB.example.com', port: '5432' }))).toBe(connectionTargetKey(pg()))
  })

  it('keeps a different database, user, port or engine apart', () => {
    const base = connectionTargetKey(pg())
    expect(connectionTargetKey(pg({ database: 'staging' }))).not.toBe(base)
    expect(connectionTargetKey(pg({ user: 'readonly' }))).not.toBe(base)
    expect(connectionTargetKey(pg({ port: 5433 }))).not.toBe(base)
    expect(connectionTargetKey(pg({ type: 'cockroachdb' }))).not.toBe(base)
  })

  it('compares files by path, and never matches two in-memory databases', () => {
    expect(connectionTargetKey({ type: 'sqlite', filePath: '/tmp/a.db' }))
      .toBe(connectionTargetKey({ type: 'sqlite', filePath: '/tmp/a.db' }))
    expect(connectionTargetKey({ type: 'sqlite', filePath: ':memory:' })).toBe('')
  })

  it('returns nothing to compare when there is no target yet', () => {
    expect(connectionTargetKey({ type: 'postgres', host: '' })).toBe('')
    expect(connectionTargetKey(null)).toBe('')
  })
})

describe('findDuplicateConnection', () => {
  const list = [pg(), pg({ id: 'b', name: 'staging', database: 'staging' })]

  it('finds the row a new connection would duplicate', () => {
    expect(findDuplicateConnection(pg({ id: undefined, name: 'another' }), list)?.id).toBe('a')
  })

  it('never reports the row being edited as its own duplicate', () => {
    expect(findDuplicateConnection(pg(), list, 'a')).toBe(null)
  })

  it('returns null when nothing else points there', () => {
    expect(findDuplicateConnection(pg({ host: 'other.host' }), list)).toBe(null)
  })
})
