import { createFilter } from '$lib/table-query.js'

/** @typedef {{ columns: string[], referencedSchema: string, referencedTable: string, referencedColumns: string[] }} ForeignKeyInfo */

/** @param {unknown} value */
export function cellValueToFilterString(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** @param {ForeignKeyInfo[]} foreignKeys @param {string} columnName */
export function findForeignKeyForColumn(foreignKeys, columnName) {
  return foreignKeys.find((fk) => fk.columns.includes(columnName)) ?? null
}

/** @param {ForeignKeyInfo} fk */
export function foreignKeyTargetLabel(fk) {
  const schema = fk.referencedSchema ?? fk.referenced_schema
  const table = fk.referencedTable ?? fk.referenced_table
  return schema ? `${schema}.${table}` : table
}

/**
 * Build eq filters on the referenced table for the current row's FK values.
 * @param {ForeignKeyInfo} fk
 * @param {Array<{ name: string }>} columns
 * @param {unknown[]} row
 * @returns {import('$lib/table-query.js').TableFilter[] | null}
 */
export function buildForeignKeyFilters(fk, columns, row) {
  const refCols = fk.referencedColumns ?? fk.referenced_columns ?? []
  const localCols = fk.columns ?? []
  if (localCols.length !== refCols.length) return null

  /** @type {import('$lib/table-query.js').TableFilter[]} */
  const filters = []
  for (let i = 0; i < localCols.length; i += 1) {
    const localName = localCols[i]
    const refName = refCols[i]
    const colIdx = columns.findIndex((c) => c.name === localName)
    if (colIdx < 0) return null
    const value = row[colIdx]
    if (value === null || value === undefined) return null
    const filter = createFilter(refName, 'eq')
    filter.value = cellValueToFilterString(value)
    filters.push(filter)
  }
  return filters
}

/**
 * Build eq filters on a referencing table from the current row's referenced column values.
 * Used for reverse FK (one-to-many) sub-view queries.
 * @param {{ fromColumns: string[], toColumns: string[] }} reverseFk
 * @param {Array<{ name: string }>} columns
 * @param {unknown[]} row
 * @returns {import('$lib/table-query.js').TableFilter[] | null}
 */
export function buildReverseForeignKeyFilters(reverseFk, columns, row) {
  const { fromColumns, toColumns } = reverseFk
  if (!fromColumns?.length || fromColumns.length !== toColumns?.length) return null
  const filters = []
  for (let i = 0; i < toColumns.length; i++) {
    const colIdx = columns.findIndex(c => c.name === toColumns[i])
    if (colIdx < 0) return null
    const value = row[colIdx]
    if (value === null || value === undefined) return null
    const filter = createFilter(fromColumns[i], 'eq')
    filter.value = cellValueToFilterString(value)
    filters.push(filter)
  }
  return filters.length ? filters : null
}

/** @param {unknown} raw */
export function normalizeForeignKeys(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((fk) => {
      const columns = fk.columns ?? []
      const referencedColumns = fk.referencedColumns ?? fk.referenced_columns ?? []
      const referencedSchema = fk.referencedSchema ?? fk.referenced_schema ?? ''
      const referencedTable = fk.referencedTable ?? fk.referenced_table ?? ''
      if (!referencedTable || columns.length === 0) return null
      return /** @type {ForeignKeyInfo} */ ({
        columns,
        referencedColumns,
        referencedSchema,
        referencedTable,
      })
    })
    .filter(Boolean)
}
