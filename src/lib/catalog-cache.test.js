import { describe, it, expect } from 'vitest'
import { CatalogCache, catalogKey, connectionPrefix } from './catalog-cache.js'

/** A cache whose clock the test drives. */
function fixed() {
  const clock = { t: 1000 }
  const cache = new CatalogCache({ now: () => clock.t })
  return { cache, clock }
}

describe('CatalogCache', () => {
  it('returns a value inside its freshness window and drops it after', () => {
    const { cache, clock } = fixed()
    cache.set('k', [1, 2])
    expect(cache.get('k', 3000)).toEqual([1, 2])
    clock.t += 2999
    expect(cache.get('k', 3000)).toEqual([1, 2])
    clock.t += 1
    expect(cache.get('k', 3000)).toBeUndefined()
    expect(cache.has('k')).toBe(false)
  })

  it('lets one entry serve a short and a long window', () => {
    const { cache, clock } = fixed()
    cache.set('k', 'v')
    clock.t += 10_000
    expect(cache.get('k', 3000)).toBeUndefined()
    // The expired read evicted it, which is the point: a stale entry is gone
    // for every caller, not just the impatient one.
    expect(cache.get('k', 60_000)).toBeUndefined()
  })

  it('evicts the least recently used once past max', () => {
    const cache = new CatalogCache({ max: 2 })
    cache.set('a', 1)
    cache.set('b', 2)
    cache.get('a', 60_000)      // 'a' is now the most recent
    cache.set('c', 3)
    expect(cache.has('b')).toBe(false)
    expect(cache.has('a')).toBe(true)
    expect(cache.has('c')).toBe(true)
    expect(cache.size).toBe(2)
  })

  it('reads through and does not cache a failure', async () => {
    const { cache } = fixed()
    let calls = 0
    const load = async () => { calls++; return calls }
    expect(await cache.through('k', 3000, load)).toBe(1)
    expect(await cache.through('k', 3000, load)).toBe(1)
    expect(calls).toBe(1)

    await expect(cache.through('boom', 3000, async () => { throw new Error('nope') })).rejects.toThrow('nope')
    expect(cache.has('boom')).toBe(false)
  })

  it('invalidates one connection without touching another', () => {
    const { cache } = fixed()
    cache.set(catalogKey('conn-1', 'tables', 'public'), ['a'])
    cache.set(catalogKey('conn-1', 'indexes', 'public'), ['i'])
    cache.set(catalogKey('conn-2', 'tables', 'public'), ['b'])
    cache.invalidate(connectionPrefix('conn-1'))
    expect(cache.get(catalogKey('conn-1', 'tables', 'public'), 60_000)).toBeUndefined()
    expect(cache.get(catalogKey('conn-1', 'indexes', 'public'), 60_000)).toBeUndefined()
    expect(cache.get(catalogKey('conn-2', 'tables', 'public'), 60_000)).toEqual(['b'])
  })

  it('keys a schema apart from its neighbours, so A to B to A is a hit', () => {
    const { cache } = fixed()
    cache.set(catalogKey('c', 'catalog', 'a'), 'A')
    cache.set(catalogKey('c', 'catalog', 'b'), 'B')
    expect(cache.get(catalogKey('c', 'catalog', 'a'), 60_000)).toBe('A')
    expect(cache.get(catalogKey('c', 'catalog', 'b'), 60_000)).toBe('B')
  })

  it('treats an empty prefix as a full clear rather than a no-op', () => {
    const { cache } = fixed()
    cache.set('a', 1)
    cache.invalidate('')
    expect(cache.size).toBe(0)
  })
})
