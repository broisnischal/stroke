import { describe, it, expect } from 'vitest'
import { getCompletionItems, evalJsonPath } from './jsonpath.js'

/** @param {import('./jsonpath.js').CompletionItem[]} items @param {string} label */
const byLabel = (items, label) => items.find((i) => i.label === label)

describe('getCompletionItems over an array of objects', () => {
  it('takes the type from the first non-null value, not the first row', () => {
    const doc = [{ pub_date: null }, { pub_date: '2026-02-02 08:46:08 UTC' }]
    const item = byLabel(getCompletionItems(doc, '$[*].'), 'pub_date')
    expect(item?.kind).toBe('string')
    expect(item?.detail).toBe('null | string')
    expect(item?.preview).toBe('"2026-02-02 08:46:08 UTC"')
  })

  it('says when a key holds the same value in every element', () => {
    const doc = Array.from({ length: 4 }, () => ({ source: 'bearDB', id: Math.random() }))
    const items = getCompletionItems(doc, '$[*].')
    expect(byLabel(items, 'source')?.spread).toBe('same in all 4')
  })

  it('counts distinct values when they differ', () => {
    const doc = [{ pub_date: 'a' }, { pub_date: 'b' }, { pub_date: 'b' }]
    expect(byLabel(getCompletionItems(doc, '$[*].'), 'pub_date')?.spread).toBe('2 distinct')
  })

  it('marks the count as a sample once the array outruns the scan window', () => {
    const doc = Array.from({ length: 500 }, () => ({ tag: 'same' }))
    expect(byLabel(getCompletionItems(doc, '$[*].'), 'tag')?.spread).toBe('same in first 200')
  })

  it('reports a bare value count for keys holding objects', () => {
    const doc = [{ meta: { a: 1 } }, { meta: { b: 2 } }]
    const item = byLabel(getCompletionItems(doc, '$[*].'), 'meta')
    expect(item?.spread).toBe('2 values')
    expect(item?.preview).toBe('{1 key}')
  })

  it('leaves a single-element array with no spread note', () => {
    expect(byLabel(getCompletionItems([{ only: 1 }], '$[*].'), 'only')?.spread).toBe('')
  })

  it('still filters by the typed fragment', () => {
    const doc = [{ pub_date: 'x', published: true }]
    const labels = getCompletionItems(doc, '$[*].pub').map((i) => i.label)
    expect(labels).toContain('pub_date')
    expect(labels).toContain('published')
  })
})

describe('union selector', () => {
  const rows = [
    { day: '2026-08-05', requests: 30, device_id: 'a' },
    { day: '2026-08-06', requests: 1, device_id: 'b' },
  ]

  it('projects an object per element, not a flat list of values', () => {
    // RFC 9535 flattens a union to bare values. Two keys over two rows would be
    // four loose values with nothing saying which is which - unreadable in a
    // table. The row shape is the whole point of supporting this.
    expect(evalJsonPath(rows, '$[*]["day","requests"]')).toEqual({
      ok: true,
      value: [
        { day: '2026-08-05', requests: 30 },
        { day: '2026-08-06', requests: 1 },
      ],
    })
  })

  it('no longer resolves to a key nobody has', () => {
    // The quoted-property regex is greedy, so `"day","requests"` used to match it
    // as the single key `day","requests` and return [null, null] with ok:true.
    const r = evalJsonPath(rows, '$[*]["day","requests"]')
    expect(r.ok && /** @type {any[]} */ (r.value).every((v) => v && v.day)).toBe(true)
  })

  it('takes bare names too - the dot accessor does, so requiring quotes here would trap', () => {
    expect(evalJsonPath(rows[0], '$["day",requests]')).toEqual({
      ok: true,
      value: { day: '2026-08-05', requests: 30 },
    })
  })

  it('selects indices when every member is an integer, negatives included', () => {
    expect(evalJsonPath(rows, '$[0,-1]')).toEqual({ ok: true, value: [rows[0], rows[1]] })
  })

  it('keeps the listed order rather than the array order', () => {
    const r = evalJsonPath(rows, '$[1,0]')
    expect(r.ok && r.value).toEqual([rows[1], rows[0]])
  })

  it('leaves a comma inside a filter alone', () => {
    // `?(...)` may hold commas that are not union separators.
    expect(evalJsonPath(rows, '$[?(@.requests > 1)]')).toEqual({ ok: true, value: [rows[0]] })
  })

  it('keeps a comma inside a quoted key', () => {
    const doc = [{ 'a,b': 1, c: 2 }]
    expect(evalJsonPath(doc, '$[*]["a,b","c"]')).toEqual({ ok: true, value: [{ 'a,b': 1, c: 2 }] })
  })

  it('rejects an empty member instead of picking an unnamed key', () => {
    const r = evalJsonPath(rows, '$[*]["day",]')
    expect(r.ok).toBe(false)
  })

  it('does not change a single quoted key', () => {
    expect(evalJsonPath(rows[0], '$["day"]')).toEqual({ ok: true, value: '2026-08-05' })
  })
})
