/** @typedef {{ ok: true, value: unknown } | { ok: false, message: string }} ParseResult */

/**
 * @param {unknown} value
 */
export function valueToEditString(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * @param {string} dataType
 */
export function normalizeColumnType(dataType) {
  return String(dataType ?? '')
    .toLowerCase()
    .replace(/\(.+\)$/, '')
    .trim()
}

/** @param {string} dataType */
function normalizedType(dataType) {
  return normalizeColumnType(dataType)
}

/** @param {string} dataType */
export function isDateTimeType(dataType) {
  const t = normalizedType(dataType)
  return (
    t.includes('timestamp') ||
    t === 'datetime' ||
    t === 'timestamptz' ||
    (t.includes('date') && t.includes('time'))
  )
}

/** @param {string} dataType */
export function isDateOnlyType(dataType) {
  return normalizedType(dataType) === 'date'
}

/** @param {string} dataType */
export function isTimeOnlyType(dataType) {
  const t = normalizedType(dataType)
  return (t === 'time' || t === 'timetz') && !t.includes('stamp')
}

/** @param {number} n */
function pad2(n) {
  return String(n).padStart(2, '0')
}

/** @param {string} raw */
export function formatTimestampForDb(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed.replace('T', ' ')}:00`
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '')
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }
  const parsed = Date.parse(trimmed)
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed)
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  }
  return trimmed
}

/**
 * @param {{ enumValues?: string[], enum_values?: string[] } | null | undefined} col
 * @returns {string[] | null}
 */
export function getColumnEnumValues(col) {
  const values = col?.enumValues ?? col?.enum_values
  return Array.isArray(values) && values.length > 0 ? values : null
}

/**
 * @param {string} dataType
 */
export function isBooleanType(dataType) {
  const t = normalizedType(dataType)
  return t === 'boolean' || t === 'bool'
}

/**
 * @param {string} dataType
 */
export function isEditableType(dataType) {
  const t = normalizedType(dataType)
  if (!t || t.includes('bytea')) return false
  return true
}

/**
 * @param {string} raw
 * @param {string} dataType
 * @param {string[] | null} [enumValues]
 * @returns {ParseResult}
 */
export function parseCellInput(raw, dataType, enumValues = null) {
  const trimmed = raw.trim()
  const t = normalizedType(dataType)

  if (trimmed === '' || trimmed.toUpperCase() === 'NULL') {
    return { ok: true, value: null }
  }

  if (enumValues?.length) {
    if (!enumValues.includes(trimmed)) {
      return {
        ok: false,
        message: `Must be one of: ${enumValues.join(', ')}`,
      }
    }
    return { ok: true, value: trimmed }
  }

  if (
    t.includes('int') ||
    t === 'serial' ||
    t === 'bigserial' ||
    t === 'smallserial' ||
    t === 'oid'
  ) {
    if (!/^-?\d+$/.test(trimmed)) {
      return {
        ok: false,
        message: `Invalid integer for ${dataType}: "${raw}"`,
      }
    }
    const n = Number(trimmed)
    if (!Number.isSafeInteger(n)) {
      return { ok: false, message: 'Integer is out of range' }
    }
    return { ok: true, value: n }
  }

  if (
    t.includes('numeric') ||
    t.includes('decimal') ||
    t.includes('real') ||
    t.includes('double') ||
    t.includes('float') ||
    t === 'money'
  ) {
    if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
      return {
        ok: false,
        message: `Invalid number for ${dataType}: "${raw}"`,
      }
    }
    const n = Number(trimmed)
    if (!Number.isFinite(n)) {
      return { ok: false, message: 'Number is not finite' }
    }
    return { ok: true, value: n }
  }

  if (t === 'boolean' || t === 'bool') {
    const lower = trimmed.toLowerCase()
    if (['true', 't', '1', 'yes', 'y'].includes(lower)) return { ok: true, value: true }
    if (['false', 'f', '0', 'no', 'n'].includes(lower)) return { ok: true, value: false }
    return {
      ok: false,
      message: `Invalid boolean: "${raw}" (use true/false)`,
    }
  }

  if (t === 'json' || t === 'jsonb') {
    try {
      return { ok: true, value: JSON.parse(trimmed) }
    } catch {
      return { ok: false, message: 'Invalid JSON' }
    }
  }

  if (t === 'uuid') {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        trimmed,
      )
    ) {
      return { ok: false, message: `Invalid UUID: "${raw}"` }
    }
    return { ok: true, value: trimmed }
  }

  if (isDateTimeType(dataType)) {
    return { ok: true, value: formatTimestampForDb(trimmed) }
  }

  if (isDateOnlyType(dataType)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return { ok: false, message: `Invalid date: "${raw}" (use YYYY-MM-DD)` }
    }
    return { ok: true, value: trimmed }
  }

  if (isTimeOnlyType(dataType)) {
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      return { ok: false, message: `Invalid time: "${raw}" (use HH:MM)` }
    }
    return { ok: true, value: trimmed }
  }

  return { ok: true, value: trimmed }
}

/**
 * @param {string} dataType
 * @param {string} columnName
 * @param {string[]} primaryKey
 */
export function isLikelyAutoColumn(dataType, columnName, primaryKey) {
  if (!primaryKey.includes(columnName)) return false
  const t = normalizedType(dataType)
  return t.includes('serial') || t === 'bigserial' || t === 'smallserial'
}

/**
 * @param {{ name: string, dataType?: string, data_type?: string, nullable?: boolean, enumValues?: string[], enum_values?: string[] }[]} columns
 * @param {string[]} primaryKey
 * @param {Record<string, string>} drafts
 * @returns {ParseResult & { values?: Record<string, unknown> }}
 */
export function buildInsertPayload(columns, primaryKey, drafts) {
  /** @type {Record<string, unknown>} */
  const values = {}
  let hasNonAutoEditableColumn = false

  for (const col of columns) {
    const dataType = col.dataType ?? col.data_type ?? 'text'
    if (!isEditableType(dataType)) continue

    if (!isLikelyAutoColumn(dataType, col.name, primaryKey)) {
      hasNonAutoEditableColumn = true
    }

    const raw = drafts[col.name] ?? ''
    const trimmed = raw.trim()

    // Empty → omit column (DB default / auto). Required NOT NULL columns are validated in Rust.
    if (trimmed === '') {
      continue
    }

    const parsed = parseCellInput(trimmed, dataType, getColumnEnumValues(col))
    if (!parsed.ok) {
      return { ok: false, message: `${col.name}: ${parsed.message}` }
    }
    values[col.name] = parsed.value
  }

  // Only block empty inserts when there are actual non-auto columns the user should fill.
  // If every column is auto-generated (e.g. a table with only a serial PK), allow the insert.
  if (Object.keys(values).length === 0 && hasNonAutoEditableColumn) {
    return {
      ok: false,
      message: 'Enter at least one column value (or leave auto columns empty)',
    }
  }

  return { ok: true, value: null, values }
}
