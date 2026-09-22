import { describe, it, expect } from 'vitest'
import { buildBatchUpdateSql, sqlLiteral } from './sql-batch-update.js'

const columns = [{ name: 'id' }, { name: 'name' }, { name: 'note' }]
const rows = [
  [1, 'Sachin', 'a'],
  [2, 'rame', 'b'],
]
const base = {
  table: 'customers',
  schema: 'shop',
  columns,
  primaryKey: ['id'],
  rows,
  colIdx: 1,
  edits: [
    { rowIdx: 0, value: 'Sachin Tendulkar' },
    { rowIdx: 1, value: 'ram' },
  ],
}

describe('buildBatchUpdateSql, per dialect', () => {
  it('quotes and qualifies for postgres', () => {
    const sql = buildBatchUpdateSql({ ...base, dialect: 'postgres' })
    expect(sql).toContain('UPDATE "shop"."customers"')
    expect(sql).toContain('SET "name" = CASE')
    expect(sql).toContain(`WHEN "id" = 1 THEN 'Sachin Tendulkar'`)
    expect(sql).toContain('ELSE "name"')
  })

  it('uses backticks for mysql, which is also where mariadb lands', () => {
    // `engineFamily` maps mariadb -> mysql, so there is no separate branch to
    // get wrong; double quotes would be string literals on a default MariaDB.
    const sql = buildBatchUpdateSql({ ...base, dialect: 'mysql' })
    expect(sql).toContain('UPDATE `shop`.`customers`')
    expect(sql).toContain('SET `name` = CASE')
    expect(sql).not.toContain('"')
  })

  it('does not qualify the sqlite family, which has no schema to qualify with', () => {
    for (const dialect of ['sqlite', 'd1', 'libsql', 'duckdb']) {
      const sql = buildBatchUpdateSql({ ...base, dialect })
      expect(sql, dialect).toContain('UPDATE "customers"')
      expect(sql, dialect).not.toContain('"shop"')
    }
  })

  it('qualifies mssql, where the schema is real', () => {
    const sql = buildBatchUpdateSql({ ...base, dialect: 'mssql', schema: 'dbo' })
    expect(sql).toContain('UPDATE "dbo"."customers"')
  })
})

describe('buildBatchUpdateSql, shape', () => {
  it('keys every new value to its own row and leaves the rest alone', () => {
    const sql = buildBatchUpdateSql({ ...base, dialect: 'postgres' })
    expect(sql).toContain(`WHEN "id" = 1 THEN 'Sachin Tendulkar'`)
    expect(sql).toContain(`WHEN "id" = 2 THEN 'ram'`)
    // The WHERE narrows to exactly the edited rows, so an ELSE that is never
    // reached cannot touch anything.
    expect(sql).toContain('WHERE ("id" = 1)\n   OR ("id" = 2)')
  })

  it('handles a composite primary key', () => {
    const sql = buildBatchUpdateSql({
      dialect: 'postgres',
      table: 'order_items',
      columns: [{ name: 'order_id' }, { name: 'product_id' }, { name: 'label' }],
      primaryKey: ['order_id', 'product_id'],
      rows: [[7, 3, 'old']],
      colIdx: 2,
      edits: [{ rowIdx: 0, value: 'new' }],
    })
    expect(sql).toContain('WHEN "order_id" = 7 AND "product_id" = 3 THEN \'new\'')
  })

  it('refuses a table with no primary key rather than writing a bare UPDATE', () => {
    expect(() =>
      buildBatchUpdateSql({ ...base, dialect: 'postgres', primaryKey: [] }),
    ).toThrow(/primary key/i)
  })

  it('refuses a primary key that is not in the result set', () => {
    expect(() =>
      buildBatchUpdateSql({ ...base, dialect: 'postgres', primaryKey: ['missing'] }),
    ).toThrow(/not found/i)
  })

  it('refuses an empty edit list', () => {
    expect(() => buildBatchUpdateSql({ ...base, dialect: 'postgres', edits: [] })).toThrow(/no edits/i)
  })

  it('skips an edit whose row is no longer loaded', () => {
    const sql = buildBatchUpdateSql({
      ...base,
      dialect: 'postgres',
      edits: [{ rowIdx: 0, value: 'kept' }, { rowIdx: 99, value: 'gone' }],
    })
    expect(sql).toContain(`'kept'`)
    expect(sql).not.toContain(`'gone'`)
  })
})

describe('sqlLiteral', () => {
  it('doubles embedded quotes rather than escaping them with a backslash', () => {
    // MySQL accepts both; Postgres and SQLite only the doubling.
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'")
  })

  it('passes numbers, booleans and null through unquoted', () => {
    expect(sqlLiteral(42)).toBe('42')
    expect(sqlLiteral(true)).toBe('TRUE')
    expect(sqlLiteral(null)).toBe('NULL')
    expect(sqlLiteral(undefined)).toBe('NULL')
  })
})
