// Column-shape normalization.
//
// Engine backends return column metadata with either camelCase (PG/frontend) or
// snake_case (raw SQL) keys. These helpers collapse the `x ?? x_snake` fallback
// idiom that was previously repeated across StudioShell, DataTable, and others
// into one place.

/**
 * @typedef {{ name: string, dataType: string, nullable: boolean, enumValues?: string[] }} NormalizedColumn
 */

/**
 * Normalize a raw column record into the canonical UI shape.
 * @param {any} c
 * @returns {NormalizedColumn}
 */
export function normalizeColumn(c) {
  return {
    name: c.name,
    dataType: c.dataType ?? c.data_type ?? '',
    nullable: c.nullable ?? true,
    enumValues: c.enumValues ?? c.enum_values ?? undefined,
  }
}

/**
 * Normalize a list of raw column records.
 * @param {any[]} cols
 * @returns {NormalizedColumn[]}
 */
export function normalizeColumns(cols) {
  return cols.map(normalizeColumn)
}

/**
 * Canonical, lowercased data-type string for a raw column (handles either key).
 * @param {any} c
 * @returns {string}
 */
export function columnType(c) {
  return (c?.dataType ?? c?.data_type ?? '').toLowerCase()
}
