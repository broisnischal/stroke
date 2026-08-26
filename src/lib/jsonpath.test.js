import { describe, it, expect } from 'vitest'
import { getCompletionItems } from './jsonpath.js'

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
