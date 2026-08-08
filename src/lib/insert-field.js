import {
  isAutoColumn,
  isBooleanType,
  isDateOnlyType,
  isDateTimeType,
  isLikelyAutoColumn,
  normalizeColumnType,
} from '$lib/cell-value.js'

/** @typedef {'created' | 'updated'} TimestampRole */

/** @param {string} name */
function normalizeColName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/_/g, '')
}

const CREATED_NAMES = new Set(['createdat', 'createat', 'insertedat', 'created', 'inserted'])
const UPDATED_NAMES = new Set(['updatedat', 'updateat', 'modifiedat', 'updated', 'modified'])

/** @param {string} columnName @returns {TimestampRole | null} */
export function columnTimestampRole(columnName) {
  const n = normalizeColName(columnName)
  if (CREATED_NAMES.has(n)) return 'created'
  if (UPDATED_NAMES.has(n)) return 'updated'
  return null
}

/** @param {string} dataType @param {string} columnName */
export function shouldUseDateTimePicker(dataType, columnName) {
  if (isDateTimeType(dataType)) return true
  return columnTimestampRole(columnName) !== null && !isBooleanType(dataType)
}

/** @param {string} dataType */
export function isUuidType(dataType) {
  return normalizeColumnType(dataType) === 'uuid'
}

/** @param {string} name */
export function isIdLikeColumn(name) {
  const n = String(name ?? '').toLowerCase()
  if (n === 'id') return true
  if (n.endsWith('id')) return true
  if (n.endsWith('_id')) return true
  return false
}

/**
 * @param {string} dataType
 * @param {string} columnName
 * @param {string[]} primaryKey
 */
export function shouldOfferUuidGenerator(dataType, columnName, primaryKey) {
  if (isLikelyAutoColumn(dataType, columnName, primaryKey)) return false
  if (isDateTimeType(dataType) || isBooleanType(dataType)) return false
  return isUuidType(dataType) || isIdLikeColumn(columnName)
}

/**
 * @param {string} dataType
 * @param {string} columnName
 * @param {string[]} primaryKey
 */
export function shouldOfferCuidGenerator(dataType, columnName, primaryKey) {
  if (isLikelyAutoColumn(dataType, columnName, primaryKey)) return false
  if (isUuidType(dataType)) return false
  if (isDateTimeType(dataType) || isBooleanType(dataType)) return false
  const t = normalizeColumnType(dataType)
  const textLike =
    !t ||
    t.includes('text') ||
    t.includes('char') ||
    t.includes('varchar') ||
    t === 'string'
  return textLike && isIdLikeColumn(columnName)
}

/** @param {number} n */
function pad2(n) {
  return String(n).padStart(2, '0')
}

/** Value for `<input type="datetime-local">` in local time. */
export function nowDateTimeLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** Value for `<input type="date">`. */
export function nowDateOnly() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Value for `<input type="time">`. */
export function nowTimeOnly() {
  const d = new Date()
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function generateUuid() {
  return crypto.randomUUID()
}

const CUID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/** CUID2-style id (no extra dependency). */
export function generateCuid() {
  const time = Date.now().toString(36).padStart(8, '0')
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let random = ''
  for (let i = 0; i < bytes.length; i++) {
    random += CUID_ALPHABET[bytes[i] % 36]
  }
  return `c${time}${random}`.slice(0, 28)
}

/**
 * Default draft when opening the insert dialog.
 * @param {{ name: string, dataType?: string, data_type?: string, nullable?: boolean }} col
 * @param {string[]} primaryKey
 */
export function defaultInsertDraft(col, primaryKey) {
  const dataType = col.dataType ?? col.data_type ?? 'text'
  // A generated column takes no draft: the value the database will assign is
  // not one we can predict, and sending anything overrides it.
  if (isAutoColumn(col, primaryKey)) return ''

  const role = columnTimestampRole(col.name)
  if (role && shouldUseDateTimePicker(dataType, col.name)) {
    return nowDateTimeLocal()
  }
  if (isDateOnlyType(dataType)) return ''
  if (isDateTimeType(dataType)) return nowDateTimeLocal()

  return ''
}
