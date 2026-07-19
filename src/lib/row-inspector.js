import { oversizeCellInfo, oversizeCellText } from './cell-value.js'

/**
 * @param {unknown} value
 * @returns {unknown}
 */
export function normalizeCellValue(value) {
  if (value === undefined) return null
  return value
}

/**
 * JSON.stringify replacer that renders backend oversize sentinels as their
 * marker text, so copied rows / detail views show the truncation instead of
 * the raw sentinel wrapper.
 * @param {string} _key @param {unknown} value
 */
function oversizeReplacer(_key, value) {
  const over = oversizeCellInfo(value)
  return over ? oversizeCellText(over) : value
}

/**
 * @param {unknown} value
 */
export function formatNormalValue(value) {
  const v = normalizeCellValue(value)
  if (v === null) return 'NULL'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    const over = oversizeCellInfo(v)
    if (over) return oversizeCellText(over)
    try {
      return JSON.stringify(v, oversizeReplacer, 2)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

/**
 * @param {unknown} value
 */
export function formatJsonValue(value) {
  try {
    return JSON.stringify(normalizeCellValue(value), oversizeReplacer, 2)
  } catch {
    return 'null'
  }
}

/**
 * @param {Record<string, unknown>} record
 */
export function formatNormalRecord(record) {
  return Object.entries(record)
    .map(([key, value]) => `${key}: ${formatNormalValue(value)}`)
    .join('\n')
}

/**
 * @param {Record<string, unknown>[]} records
 */
export function formatNormalRecords(records) {
  return records.map((r) => formatNormalRecord(r)).join('\n\n')
}

/**
 * @param {{ name: string, dataType?: string, data_type?: string }[]} columns
 * @param {unknown[][]} row
 * @param {Set<string>} [hidden] Column names to omit (e.g. columns hidden in the UI).
 */
export function rowToRecord(columns, row, hidden) {
  /** @type {Record<string, unknown>} */
  const record = {}
  columns.forEach((col, i) => {
    if (hidden && hidden.has(col.name)) return
    record[col.name] = normalizeCellValue(row[i])
  })
  return record
}

/**
 * @param {{ name: string }[]} columns
 * @param {unknown[][]} rows
 * @param {number[]} indices
 */
export function rowsToJsonPayload(columns, rows, indices) {
  if (indices.length === 1) {
    return rowToRecord(columns, rows[indices[0]])
  }
  return indices.map((idx) => rowToRecord(columns, rows[idx]))
}
