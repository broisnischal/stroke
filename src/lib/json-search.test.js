import { describe, it, expect } from 'vitest'
import { searchJson, splitHighlight, matchOffsets, SEARCH_NODE_BUDGET } from './json-search.js'

const doc = {
  offerSent: { mail: false, push: false, inApp: true },
  user: { name: 'Sachin', email: 'sachin@example.com' },
  items: [
    { sku: 'KB-001', label: 'Mechanical keyboard' },
    { sku: 'MS-002', label: 'Trackball mouse' },
  ],
}

describe('searchJson', () => {
  it('finds nothing for an empty query', () => {
    const r = searchJson(doc, '')
    expect(r.count).toBe(0)
    expect(r.paths.size).toBe(0)
    expect(r.open.size).toBe(0)
  })

  it('matches a key', () => {
    const r = searchJson(doc, 'inApp')
    expect([...r.paths]).toEqual(['/offerSent/inApp'])
  })

  it('matches a primitive value', () => {
    // Both, and correctly so: the email contains the name.
    const r = searchJson(doc, 'Sachin')
    expect([...r.paths].sort()).toEqual(['/user/email', '/user/name'])
  })

  it('is case-insensitive in both directions', () => {
    expect(searchJson(doc, 'SACHIN').count).toBe(2)
    expect(searchJson(doc, 'inapp').count).toBe(1)
  })

  it('opens every ancestor of a match, and only those', () => {
    const r = searchJson(doc, 'Trackball')
    expect([...r.paths]).toEqual(['/items/1/label'])
    // root, /items, /items/1 - the chain that has to be expanded to see it.
    expect([...r.open].sort()).toEqual(['', '/items', '/items/1'])
    expect(r.open.has('/items/0')).toBe(false)
    expect(r.open.has('/offerSent')).toBe(false)
  })

  it('counts a container that matches on its own key', () => {
    // Searching "user" should find the object, not only strings inside it.
    const r = searchJson(doc, 'user')
    expect(r.paths.has('/user')).toBe(true)
  })

  it('finds several matches across branches', () => {
    const r = searchJson(doc, 'sku')
    expect([...r.paths].sort()).toEqual(['/items/0/sku', '/items/1/sku'])
    expect(r.count).toBe(2)
  })

  it('matches booleans and null by their printed text', () => {
    expect(searchJson({ a: false }, 'false').paths.has('/a')).toBe(true)
    expect(searchJson({ a: null }, 'null').paths.has('/a')).toBe(true)
    expect(searchJson({ a: 42 }, '4').paths.has('/a')).toBe(true)
  })

  it('does not match a container by its printed shape', () => {
    // `{}` and `[]` are chrome the tree draws, not content.
    expect(searchJson({ a: {} }, '{').count).toBe(0)
  })

  it('walks arrays by index', () => {
    const r = searchJson({ xs: ['a', 'b', 'c'] }, 'c')
    expect([...r.paths]).toEqual(['/xs/2'])
  })

  it('distinguishes nodes that share a key name at different depths', () => {
    const nested = { a: { id: 'x' }, b: { a: { id: 'x' } } }
    const r = searchJson(nested, 'id')
    expect([...r.paths].sort()).toEqual(['/a/id', '/b/a/id'])
  })

  it('stops at the node budget and says so', () => {
    const big = Array.from({ length: 50 }, (_, i) => ({ i }))
    const r = searchJson(big, 'i', { budget: 10 })
    expect(r.truncated).toBe(true)
    expect(r.count).toBeLessThan(50)
  })

  it('has a budget high enough not to bite an ordinary cell', () => {
    expect(SEARCH_NODE_BUDGET).toBeGreaterThan(10_000)
  })

  it('survives a primitive at the root', () => {
    expect(searchJson('hello', 'ell').paths.has('')).toBe(true)
    expect(searchJson(null, 'null').paths.has('')).toBe(true)
  })
})

describe('splitHighlight', () => {
  it('returns one unmarked run when there is no query', () => {
    expect(splitHighlight('abc', '')).toEqual([{ t: 'abc', hit: false }])
  })

  it('marks a match in the middle', () => {
    expect(splitHighlight('foobarbaz', 'bar')).toEqual([
      { t: 'foo', hit: false },
      { t: 'bar', hit: true },
      { t: 'baz', hit: false },
    ])
  })

  it('marks every occurrence', () => {
    expect(splitHighlight('aXaXa', 'x')).toEqual([
      { t: 'a', hit: false },
      { t: 'X', hit: true },
      { t: 'a', hit: false },
      { t: 'X', hit: true },
      { t: 'a', hit: false },
    ])
  })

  it('keeps the original casing of the matched run', () => {
    expect(splitHighlight('Sachin', 'sac')[0]).toEqual({ t: 'Sac', hit: true })
  })

  it('handles a match at each end', () => {
    expect(splitHighlight('abc', 'a')).toEqual([{ t: 'a', hit: true }, { t: 'bc', hit: false }])
    expect(splitHighlight('abc', 'c')).toEqual([{ t: 'ab', hit: false }, { t: 'c', hit: true }])
  })

  it('returns one run when nothing matches', () => {
    expect(splitHighlight('abc', 'zz')).toEqual([{ t: 'abc', hit: false }])
  })
})

describe('matchOffsets', () => {
  it('lists every offset, non-overlapping', () => {
    expect(matchOffsets('aaaa', 'aa')).toEqual([0, 2])
  })

  it('is case-insensitive', () => {
    expect(matchOffsets('Hello hello', 'HELLO')).toEqual([0, 6])
  })

  it('is empty without a query', () => {
    expect(matchOffsets('abc', '')).toEqual([])
    expect(matchOffsets('', 'a')).toEqual([])
  })
})
