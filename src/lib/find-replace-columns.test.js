import { describe, it, expect } from 'vitest'
import { blockedReason, annotateColumns, allTextColumnsAreKeys } from './find-replace-columns.js'

/** The fixture shape that produced the D1 failure: a uuid FK beside a name. */
const columns = [
  { name: 'id', dataType: 'text' },
  { name: 'shop_id', dataType: 'text' },
  { name: 'name', dataType: 'text' },
  { name: 'photo', dataType: 'bytea' },
  { name: 'price', dataType: 'numeric' },
]
const keys = { primaryKey: ['id'], foreignKeys: [{ columns: ['shop_id'] }] }

describe('blockedReason', () => {
  it('refuses the primary key', () => {
    expect(blockedReason({ name: 'id', dataType: 'text' }, keys)).toBe('primary key')
  })

  it('refuses a foreign key - the D1 FOREIGN KEY constraint failure', () => {
    expect(blockedReason({ name: 'shop_id', dataType: 'text' }, keys)).toBe('foreign key')
  })

  it('refuses binary columns', () => {
    expect(blockedReason({ name: 'photo', dataType: 'bytea' }, keys)).toBe('binary')
  })

  it('allows an ordinary column', () => {
    expect(blockedReason({ name: 'name', dataType: 'text' }, keys)).toBe('')
  })

  it('allows a numeric column, which simply never matches a string', () => {
    expect(blockedReason({ name: 'price', dataType: 'numeric' }, keys)).toBe('')
  })

  it('reports the primary key first when a column is both', () => {
    const both = { primaryKey: ['shop_id'], foreignKeys: [{ columns: ['shop_id'] }] }
    expect(blockedReason({ name: 'shop_id', dataType: 'text' }, both)).toBe('primary key')
  })

  it('treats a composite key as blocked in every part', () => {
    const composite = { primaryKey: ['order_id', 'product_id'], foreignKeys: [] }
    expect(blockedReason({ name: 'order_id', dataType: 'text' }, composite)).toBe('primary key')
    expect(blockedReason({ name: 'product_id', dataType: 'text' }, composite)).toBe('primary key')
  })

  it('blocks every column of a multi-column foreign key', () => {
    const fks = { primaryKey: [], foreignKeys: [{ columns: ['a', 'b'] }] }
    expect(blockedReason({ name: 'a', dataType: 'text' }, fks)).toBe('foreign key')
    expect(blockedReason({ name: 'b', dataType: 'text' }, fks)).toBe('foreign key')
  })

  it('allows everything when the engine reports no keys', () => {
    // SQLite/D1 rowid tables and ClickHouse report none; nothing is refused on
    // key grounds there, which is the pre-existing behaviour.
    expect(blockedReason({ name: 'id', dataType: 'text' }, {})).toBe('')
  })

  it('tolerates a foreign key with no columns array', () => {
    expect(blockedReason({ name: 'x', dataType: 'text' }, { foreignKeys: [{}] })).toBe('')
  })
})

describe('annotateColumns', () => {
  it('keeps every column, in order, with its index', () => {
    const out = annotateColumns(columns, keys)
    expect(out.map((c) => c.name)).toEqual(['id', 'shop_id', 'name', 'photo', 'price'])
    expect(out.map((c) => c.idx)).toEqual([0, 1, 2, 3, 4])
  })

  it('marks exactly the two keys and the binary column', () => {
    const out = annotateColumns(columns, keys)
    expect(out.filter((c) => c.blocked).map((c) => [c.name, c.blocked])).toEqual([
      ['id', 'primary key'],
      ['shop_id', 'foreign key'],
      ['photo', 'binary'],
    ])
  })

  it('handles an empty column list', () => {
    expect(annotateColumns([], keys)).toEqual([])
    expect(annotateColumns(undefined, keys)).toEqual([])
  })
})

describe('allTextColumnsAreKeys', () => {
  it('is false while something is still searchable', () => {
    expect(allTextColumnsAreKeys(annotateColumns(columns, keys))).toBe(false)
  })

  it('is true for a pure join table - both columns are the key', () => {
    const join = [
      { name: 'order_id', dataType: 'text' },
      { name: 'product_id', dataType: 'text' },
    ]
    const annotated = annotateColumns(join, {
      primaryKey: ['order_id', 'product_id'],
      foreignKeys: [{ columns: ['order_id'] }, { columns: ['product_id'] }],
    })
    expect(allTextColumnsAreKeys(annotated)).toBe(true)
  })

  it('is false when the only blocked column is binary', () => {
    const annotated = annotateColumns([{ name: 'photo', dataType: 'bytea' }], {})
    expect(allTextColumnsAreKeys(annotated)).toBe(false)
  })
})
