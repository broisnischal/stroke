/**
 * Single-statement batch cell updates - powers Find & Replace's apply.
 *
 * Instead of one round-trip per row, all edits to one column collapse into a
 * `UPDATE … SET col = CASE WHEN <pk> THEN <value> … ELSE col END WHERE <pks>`
 * statement keyed by primary key. This stays exactly WYSIWYG with the dialog's
 * preview (each row gets the precomputed value - no reliance on the engine's
 * REPLACE()/regex semantics matching JavaScript's) and works across engine
 * families, composite keys included.
 */
import { quoteIdent, qualifiedTable } from './dml-preview.js'

/** @typedef {import('./dml-preview.js').Dialect} Dialect */

/** Escape a JS scalar as a SQL literal (strings single-quote-doubled). */
export function sqlLiteral(/** @type {unknown} */ v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return "'" + String(v).replace(/'/g, "''") + "'"
}

/**
 * @param {{
 *   dialect: Dialect,
 *   schema?: string,
 *   table: string,
 *   columns: Array<{ name: string }>,
 *   primaryKey: string[],
 *   rows: unknown[][],
 *   colIdx: number,
 *   edits: Array<{ rowIdx: number, value: unknown }>,
 * }} opts
 * @returns {string}
 */
export function buildBatchUpdateSql({ dialect, schema, table, columns, primaryKey, rows, colIdx, edits }) {
  if (!primaryKey.length) throw new Error('Batch update requires a primary key')
  if (!edits.length) throw new Error('No edits to apply')
  const tbl = qualifiedTable({ dialect, schema, table })
  const col = quoteIdent(columns[colIdx].name, dialect)
  const pkIdxs = primaryKey.map((k) => columns.findIndex((c) => c.name === k))
  if (pkIdxs.some((i) => i < 0)) throw new Error('Primary key column not found in result set')

  /** @param {unknown[]} row */
  const keyCond = (row) =>
    primaryKey.map((k, j) => `${quoteIdent(k, dialect)} = ${sqlLiteral(row[pkIdxs[j]])}`).join(' AND ')

  const whens = []
  const conds = []
  for (const e of edits) {
    const row = rows[e.rowIdx]
    if (!row) continue
    const c = keyCond(row)
    whens.push(`  WHEN ${c} THEN ${sqlLiteral(e.value)}`)
    conds.push(`(${c})`)
  }
  if (!whens.length) throw new Error('No matching rows for edits')

  return `UPDATE ${tbl}\nSET ${col} = CASE\n${whens.join('\n')}\n  ELSE ${col}\nEND\nWHERE ${conds.join('\n   OR ')};`
}
