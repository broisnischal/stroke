import { describe, it, expect } from 'vitest'
import {
  activeFilters,
  filtersForApi,
  sortForApi,
  hasTableQuery,
  buildSelectSql,
  createFilter,
  ANY_COLUMN,
} from './table-query.js'

/** @param {Partial<import('./table-query.js').TableFilter>} f */
const mk = (f) => ({ ...createFilter('col', 'eq'), ...f })

describe('activeFilters', () => {
  it('drops filters with no column', () => {
    expect(activeFilters([mk({ column: '', value: 'x' })])).toHaveLength(0)
  })

  it('drops value-requiring filters with empty value', () => {
    expect(activeFilters([mk({ op: 'eq', value: '   ' })])).toHaveLength(0)
  })

  it('keeps null-check ops without a value', () => {
    expect(activeFilters([mk({ op: 'is_null', value: '' })])).toHaveLength(1)
  })

  it('requires a value for ANY_COLUMN search', () => {
    expect(activeFilters([mk({ column: ANY_COLUMN, op: 'contains', value: '' })])).toHaveLength(0)
    expect(activeFilters([mk({ column: ANY_COLUMN, op: 'contains', value: 'hi' })])).toHaveLength(1)
  })
})

describe('filtersForApi', () => {
  it('omits the conjunct on the first filter and attaches dataType', () => {
    const out = filtersForApi(
      [mk({ column: 'a', op: 'eq', value: '1' }), mk({ column: 'b', op: 'eq', value: '2', conjunct: 'or' })],
      [{ name: 'a', dataType: 'int4' }, { name: 'b', dataType: 'text' }],
    )
    expect(out[0].conjunct).toBeUndefined()
    expect(out[0].dataType).toBe('int4')
    expect(out[1].conjunct).toBe('or')
  })
})

describe('sortForApi', () => {
  it('returns undefined fields for null sort', () => {
    expect(sortForApi(null)).toEqual({ sortColumn: undefined, sortDirection: undefined })
  })
  it('maps column + direction', () => {
    expect(sortForApi({ column: 'created_at', direction: 'desc' })).toEqual({
      sortColumn: 'created_at',
      sortDirection: 'desc',
    })
  })
})

describe('hasTableQuery', () => {
  it('is false when nothing is set', () => {
    expect(hasTableQuery('', [], null)).toBe(false)
  })
  it('is true for a search term, a filter, or a sort', () => {
    expect(hasTableQuery('foo', [], null)).toBe(true)
    expect(hasTableQuery('', [mk({ value: '1' })], null)).toBe(true)
    expect(hasTableQuery('', [], { column: 'a', direction: 'asc' })).toBe(true)
  })
})

describe('buildSelectSql', () => {
  it('builds a minimal SELECT with quoting and limit', () => {
    expect(buildSelectSql({ schema: 'public', table: 'users', engine: 'postgres', limit: 100 }))
      .toBe('SELECT *\nFROM "public"."users"\nLIMIT 100;')
  })

  it('escapes single quotes in values', () => {
    const sql = buildSelectSql({
      table: 't',
      engine: 'postgres',
      filters: [mk({ column: 'name', op: 'eq', value: "O'Brien" })],
    })
    expect(sql).toContain(`"name" = 'O''Brien'`)
  })

  it('emits WHERE (search OR-group) AND filters, ORDER BY and engine quoting', () => {
    const sql = buildSelectSql({
      schema: 'public',
      table: 'users',
      columns: [{ name: 'id' }, { name: 'email' }],
      engine: 'postgres',
      search: 'acme',
      filters: [
        mk({ column: 'email', op: 'contains', value: '@x.com' }),
        mk({ column: 'id', op: 'gt', value: '100', conjunct: 'and' }),
      ],
      sort: { column: 'id', direction: 'desc' },
      limit: 50,
    })
    expect(sql).toContain('WHERE ("id"::text ILIKE \'%acme%\' OR "email"::text ILIKE \'%acme%\')')
    expect(sql).toContain('"email"::text ILIKE \'%@x.com%\'')
    expect(sql).toContain('"id" > \'100\'')
    expect(sql).toContain('ORDER BY "id" DESC')
    expect(sql.endsWith('LIMIT 50;')).toBe(true)
  })

  it('uses backtick quoting and LIKE for MySQL', () => {
    const sql = buildSelectSql({
      table: 'orders',
      engine: 'mysql',
      filters: [mk({ column: 'status', op: 'is_null', value: '' })],
    })
    expect(sql).toContain('FROM `orders`')
    expect(sql).toContain('`status` IS NULL')
  })
})
