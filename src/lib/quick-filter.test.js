import { describe, it, expect } from 'vitest'
import { quickFilterKind, buildQuickFilter } from './quick-filter.js'

const at = (qf, groupIdx) => qf.groups[groupIdx].items

describe('quickFilterKind', () => {
  it('classifies by data type', () => {
    expect(quickFilterKind({ dataType: 'boolean' })).toBe('boolean')
    expect(quickFilterKind({ dataType: 'timestamp with time zone' })).toBe('date')
    expect(quickFilterKind({ dataType: 'date' })).toBe('date')
    expect(quickFilterKind({ dataType: 'jsonb' })).toBe('json')
    expect(quickFilterKind({ dataType: 'integer' })).toBe('number')
    expect(quickFilterKind({ dataType: 'numeric(10,2)' })).toBe('number')
    expect(quickFilterKind({ dataType: 'text' })).toBe('text')
    expect(quickFilterKind({ dataType: 'varchar(255)' })).toBe('text')
  })
  it('treats a column with enumValues as enum regardless of base type', () => {
    expect(quickFilterKind({ dataType: 'text', enumValues: ['a', 'b'] })).toBe('enum')
  })
})

describe('buildQuickFilter', () => {
  it('number column seeds comparison operators with the cell value', () => {
    const qf = buildQuickFilter({ name: 'age', dataType: 'integer' }, 42)
    expect(qf.kind).toBe('number')
    const ops = at(qf, 0)
    expect(ops.map((i) => i.op)).toEqual(['eq', 'neq', 'gt', 'gte', 'lt', 'lte'])
    expect(ops.every((i) => i.value === '42')).toBe(true)
    // last group is always the null checks
    expect(qf.groups.at(-1).items.map((i) => i.op)).toEqual(['is_null', 'is_not_null'])
  })

  it('enum column offers one eq filter per value and marks the active one', () => {
    const qf = buildQuickFilter({ name: 'status', dataType: 'text', enumValues: ['active', 'paused', 'closed'] }, 'paused')
    expect(qf.kind).toBe('enum')
    const vals = at(qf, 0)
    expect(vals.map((i) => i.value)).toEqual(['active', 'paused', 'closed'])
    expect(vals.every((i) => i.op === 'eq')).toBe(true)
    expect(vals.find((i) => i.value === 'paused').active).toBe(true)
  })

  it('date column builds BETWEEN presets from an injected clock', () => {
    const now = new Date('2026-07-28T15:00:00')
    const qf = buildQuickFilter({ name: 'created_at', dataType: 'timestamp' }, '2026-06-08 06:22:09', [], now)
    expect(qf.kind).toBe('date')
    const ranges = qf.groups[0].items
    const today = ranges.find((i) => i.key === 'today')
    expect(today.op).toBe('between')
    expect(today.value).toBe('2026-07-28 00:00:00,2026-07-28 23:59:59')
    expect(ranges.find((i) => i.key === '7d').value).toBe('2026-07-22 00:00:00,2026-07-28 23:59:59')
    // "this value" group appears because the cell parses as a date
    const rel = qf.groups[1].items
    expect(rel.find((i) => i.key === 'before')).toMatchObject({ op: 'lt', value: '2026-06-08 06:22:09' })
    expect(rel.find((i) => i.key === 'on').value).toBe('2026-06-08 00:00:00,2026-06-08 23:59:59')
  })

  it('date-only column uses day-granular BETWEEN bounds', () => {
    const now = new Date('2026-07-28T15:00:00')
    const qf = buildQuickFilter({ name: 'day', dataType: 'date' }, null, [], now)
    expect(qf.groups[0].items.find((i) => i.key === 'today').value).toBe('2026-07-28,2026-07-28')
  })

  it('jsonb column offers "has key" contains filters for top-level keys', () => {
    const qf = buildQuickFilter({ name: 'meta', dataType: 'jsonb' }, '{"role":"admin","tier":2}')
    expect(qf.kind).toBe('json')
    const keys = qf.groups[0].items
    expect(keys.map((i) => i.label)).toEqual(['role', 'tier'])
    expect(keys[0]).toMatchObject({ op: 'contains', value: '"role"' })
  })

  it('low-cardinality text column surfaces distinct values from loaded rows', () => {
    const col = { name: 'plan', dataType: 'text' }
    const rows = ['free', 'pro', 'free', 'pro', 'free', 'enterprise']
    const qf = buildQuickFilter(col, 'pro', rows)
    const distinctGroup = qf.groups.find((g) => g.title === 'Values in view')
    expect(distinctGroup.items.map((i) => i.value).sort()).toEqual(['enterprise', 'free', 'pro'])
    expect(distinctGroup.items.find((i) => i.value === 'pro').active).toBe(true)
  })

  it('high-cardinality text column does not build a distinct group', () => {
    const col = { name: 'email', dataType: 'text' }
    const rows = Array.from({ length: 50 }, (_, i) => `user${i}@x.com`)
    const qf = buildQuickFilter(col, 'user1@x.com', rows)
    expect(qf.groups.find((g) => g.title === 'Values in view')).toBeUndefined()
  })

  it('a null cell only offers null checks (no value-seeded operators)', () => {
    const qf = buildQuickFilter({ name: 'age', dataType: 'integer' }, null)
    expect(qf.isNull).toBe(true)
    expect(qf.groups).toHaveLength(1)
    expect(qf.groups[0].items.map((i) => i.op)).toEqual(['is_null', 'is_not_null'])
  })
})
