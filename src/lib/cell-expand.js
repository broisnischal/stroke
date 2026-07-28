import { oversizeCellInfo, oversizeCellText } from './cell-value.js'

// Strings longer than this are never JSON.parse-probed for expandability -
// parsing multi-MB strings on render freezes the UI. (Backend caps cells well
// below this; the guard covers engines without capping.)
const EXPAND_PARSE_LIMIT = 1_000_000

/**
 * @param {string} dataType
 */
export function isJsonColumnType(dataType) {
  const t = String(dataType ?? '')
    .toLowerCase()
    .replace(/\(.+\)$/, '')
    .trim()
  return t === 'json' || t === 'jsonb'
}

/**
 * @param {unknown} value
 * @param {string} [dataType]
 */
export function isExpandableCellValue(value, dataType) {
  if (value === null || value === undefined) return false
  if (isJsonColumnType(dataType ?? '')) return true
  if (typeof value === 'object') return true
  if (typeof value === 'string') {
    const t = value.trim()
    if (t.length > EXPAND_PARSE_LIMIT) return false
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try {
        JSON.parse(t)
        return true
      } catch {
        return false
      }
    }
  }
  return false
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
export function valueForJsonViewer(value) {
  if (typeof value === 'string') {
    const t = value.trim()
    if (t.length > EXPAND_PARSE_LIMIT) return value
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try {
        return JSON.parse(t)
      } catch {
        return value
      }
    }
  }
  return value
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function cellCollapsedPreview(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') {
    const over = oversizeCellInfo(value)
    if (over) return oversizeCellText(over)
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}
