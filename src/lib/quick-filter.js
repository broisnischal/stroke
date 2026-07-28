// Context-aware quick filters for the data-grid cell context menu.
//
// Given a column and the value of the cell that was right-clicked, this builds
// a small, intuitive set of one-click filters shaped by the column's type:
//   - date/timestamp → date-range presets + before/after this value
//   - boolean/enum    → one filter per known value
//   - low-cardinality text → the distinct values present in the loaded rows
//   - number/text     → the comparison operators seeded with this cell's value
//   - json/jsonb      → "has key" filters for the object's top-level keys
//
// Every item maps to an operator the filter backend already supports
// (see table-query.js `FilterOp`), so applying one just appends a normal
// TableFilter — there is no engine-specific quick-filter path.

import {
  normalizeColumnType,
  isBooleanType,
  isDateOnlyType,
  isDateTimeType,
  getColumnEnumValues,
} from '$lib/cell-value.js'

/**
 * @typedef {'boolean'|'enum'|'date'|'json'|'number'|'text'} QuickFilterKind
 * @typedef {{ key: string, label: string, op: string, value: string, active?: boolean }} QuickFilterItem
 * @typedef {{ title?: string, items: QuickFilterItem[] }} QuickFilterGroup
 * @typedef {{ kind: QuickFilterKind, colName: string, valueText: string, isNull: boolean, groups: QuickFilterGroup[] }} QuickFilter
 */

const NUM_RE = /^(smallint|integer|int|bigint|serial|bigserial|numeric|decimal|real|double|float|money|number|dec|fixed|year)/
const JSON_RE = /^(jsonb|json)$/

/** Distinct-value group is skipped past this many distinct values (not a picker). */
const MAX_DISTINCT = 20
const MAX_DISTINCT_SHOWN = 15
/** Top-level JSON keys shown as "has key" filters. */
const MAX_JSON_KEYS = 12
const VALUE_CLIP = 44

/** @param {unknown} value */
export function cellText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    try { return JSON.stringify(value) } catch { return String(value) }
  }
  return String(value)
}

/** @param {string} s */
function clip(s, max = VALUE_CLIP) {
  s = String(s ?? '')
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

/**
 * Classify a column into the shape its quick filter should take.
 * @param {{ dataType?: string, data_type?: string } | null | undefined} col
 * @returns {QuickFilterKind}
 */
export function quickFilterKind(col) {
  if (!col) return 'text'
  const raw = col.dataType ?? col.data_type ?? ''
  const t = normalizeColumnType(raw)
  if (isBooleanType(raw)) return 'boolean'
  if (getColumnEnumValues(col)) return 'enum'
  if (isDateOnlyType(raw) || isDateTimeType(raw) || t === 'date') return 'date'
  if (JSON_RE.test(t)) return 'json'
  if (NUM_RE.test(t)) return 'number'
  return 'text'
}

// ── date helpers ─────────────────────────────────────────────────────────────
/** @param {number} n */
const p2 = (n) => String(n).padStart(2, '0')
/** @param {Date} d */
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
/** @param {Date} d @param {boolean} dateOnly */
const fmt = (d, dateOnly) => (dateOnly ? ymd(d) : `${ymd(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`)
/** @param {Date} base @param {number} days */
function addDays(base, days) {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}
function dayStart(base) { const d = new Date(base); d.setHours(0, 0, 0, 0); return d }
function dayEnd(base) { const d = new Date(base); d.setHours(23, 59, 59, 0); return d }

/**
 * Date-range presets as inclusive BETWEEN filters ("start,end").
 * @param {boolean} dateOnly @param {Date} now
 * @returns {QuickFilterItem[]}
 */
function dateRangeItems(dateOnly, now) {
  const today = dayStart(now)
  const end = dayEnd(now)
  /** @param {string} key @param {string} label @param {Date} a @param {Date} b */
  const between = (key, label, a, b) => ({ key, label, op: 'between', value: `${fmt(a, dateOnly)},${fmt(b, dateOnly)}` })
  return [
    between('today', 'Today', today, end),
    between('yesterday', 'Yesterday', dayStart(addDays(now, -1)), dayEnd(addDays(now, -1))),
    between('7d', 'Last 7 days', dayStart(addDays(now, -6)), end),
    between('30d', 'Last 30 days', dayStart(addDays(now, -29)), end),
    between('month', 'This month', new Date(now.getFullYear(), now.getMonth(), 1), end),
    between('year', 'This year', new Date(now.getFullYear(), 0, 1), end),
  ]
}

// ── operator label sets ──────────────────────────────────────────────────────
const NUM_OPS = [
  { op: 'eq', label: 'Equals' },
  { op: 'neq', label: 'Not equal' },
  { op: 'gt', label: 'Greater than' },
  { op: 'gte', label: 'Greater or equal' },
  { op: 'lt', label: 'Less than' },
  { op: 'lte', label: 'Less or equal' },
]
const TEXT_OPS = [
  { op: 'eq', label: 'Equals' },
  { op: 'neq', label: 'Not equal' },
  { op: 'contains', label: 'Contains' },
  { op: 'starts_with', label: 'Starts with' },
  { op: 'ends_with', label: 'Ends with' },
]

/** @returns {QuickFilterGroup} */
function nullGroup() {
  return {
    items: [
      { key: 'is_null', label: 'Is null', op: 'is_null', value: '' },
      { key: 'is_not_null', label: 'Is not null', op: 'is_not_null', value: '' },
    ],
  }
}

/** Distinct non-empty values present in the loaded rows, if the column looks categorical. */
function distinctValues(colValues) {
  const seen = new Set()
  let nonNull = 0
  for (const v of colValues) {
    const t = cellText(v)
    if (t === '') continue
    nonNull += 1
    seen.add(t)
    if (seen.size > MAX_DISTINCT) return null
  }
  if (seen.size < 2 || seen.size >= nonNull) return null // no repeats → not categorical
  return [...seen].sort()
}

/**
 * @param {{ name?: string, dataType?: string, data_type?: string, nullable?: boolean } | null | undefined} col
 * @param {unknown} cellValue
 * @param {unknown[]} [colValues] loaded values for this column (for categorical text)
 * @param {Date} [now] injectable clock (tests)
 * @returns {QuickFilter}
 */
export function buildQuickFilter(col, cellValue, colValues = [], now = new Date()) {
  const kind = quickFilterKind(col)
  const colName = col?.name ?? 'value'
  const raw = col?.dataType ?? col?.data_type ?? ''
  const dateOnly = isDateOnlyType(raw)
  const text = cellText(cellValue)
  const isNull = cellValue === null || cellValue === undefined
  /** @type {QuickFilterGroup[]} */
  const groups = []
  /** @param {{op:string,label:string}[]} ops */
  const opItems = (ops) => ops.map((o) => ({ key: o.op, label: o.label, op: o.op, value: text }))

  if (kind === 'boolean' || kind === 'enum') {
    const enumVals = getColumnEnumValues(col)
    const vals = enumVals ?? (distinctValues(colValues) || (kind === 'boolean' ? ['true', 'false'] : []))
    if (vals.length) {
      groups.push({ items: vals.map((v) => ({ key: `v:${v}`, label: String(v), op: 'eq', value: String(v), active: String(v) === text })) })
    }
  } else if (kind === 'date') {
    groups.push({ title: 'Date range', items: dateRangeItems(dateOnly, now) })
    if (!isNull && /^\d{4}-\d{2}-\d{2}/.test(text)) {
      const day = text.slice(0, 10)
      groups.push({
        title: 'This value',
        items: [
          { key: 'on', label: 'On this day', op: 'between', value: dateOnly ? `${day},${day}` : `${day} 00:00:00,${day} 23:59:59` },
          { key: 'before', label: 'Before this', op: 'lt', value: text },
          { key: 'after', label: 'After this', op: 'gt', value: text },
        ],
      })
    }
  } else if (kind === 'json') {
    const keys = jsonKeys(cellValue)
    if (keys.length) {
      groups.push({ title: 'Has key', items: keys.slice(0, MAX_JSON_KEYS).map((k) => ({ key: `k:${k}`, label: k, op: 'contains', value: `"${k}"` })) })
    }
  } else if (kind === 'number') {
    if (!isNull) groups.push({ items: opItems(NUM_OPS) })
  } else {
    if (!isNull) groups.push({ items: opItems(TEXT_OPS) })
    const distinct = distinctValues(colValues)
    if (distinct) {
      groups.push({ title: 'Values in view', items: distinct.slice(0, MAX_DISTINCT_SHOWN).map((v) => ({ key: `v:${v}`, label: v, op: 'eq', value: v, active: v === text })) })
    }
  }

  groups.push(nullGroup())
  return { kind, colName, valueText: clip(text), isNull, groups }
}

/** @param {unknown} value @returns {string[]} */
function jsonKeys(value) {
  let obj = value
  if (typeof value === 'string') {
    try { obj = JSON.parse(value) } catch { return [] }
  }
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) return Object.keys(obj)
  return []
}
