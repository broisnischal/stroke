/** Sentinel used when the filter should match across every column. */
export const ANY_COLUMN = '__any__'

/** @typedef {'asc' | 'desc'} SortDirection */

/** @typedef {{ column: string, direction: SortDirection }} TableSort */

/** @typedef {'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'is_null' | 'is_not_null' | 'between'} FilterOp */

/** @typedef {{ id: string, column: string, op: FilterOp, value: string, conjunct: 'and' | 'or' }} TableFilter */

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 250]

export const DEFAULT_PAGE_SIZE = 50

export const MAX_PAGE_SIZE = 2000

export const FILTER_OPS = /** @type {{ value: FilterOp, label: string, needsValue: boolean }[]} */ ([
  { value: 'eq', label: 'equals', needsValue: true },
  { value: 'neq', label: 'not equal', needsValue: true },
  { value: 'contains', label: 'contains', needsValue: true },
  { value: 'not_contains', label: 'does not contain', needsValue: true },
  { value: 'starts_with', label: 'starts with', needsValue: true },
  { value: 'ends_with', label: 'ends with', needsValue: true },
  { value: 'gt', label: 'greater than', needsValue: true },
  { value: 'gte', label: 'greater or equal', needsValue: true },
  { value: 'lt', label: 'less than', needsValue: true },
  { value: 'lte', label: 'less or equal', needsValue: true },
  { value: 'between', label: 'is between', needsValue: true },
  { value: 'is_null', label: 'is null', needsValue: false },
  { value: 'is_not_null', label: 'is not null', needsValue: false },
])

/** Ops shown for boolean columns */
export const BOOL_FILTER_OPS = FILTER_OPS.filter((o) =>
  ['eq', 'neq', 'is_null', 'is_not_null'].includes(o.value),
)

/** Ops shown for date/timestamp columns */
export const DATE_FILTER_OPS = FILTER_OPS.filter((o) =>
  ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'].includes(o.value),
)

/** Ops shown for numeric columns */
export const NUM_FILTER_OPS = FILTER_OPS.filter((o) =>
  ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'].includes(o.value),
)

let filterSeq = 0

export function nextFilterId() {
  filterSeq += 1
  return `filter-${filterSeq}`
}

/** @returns {TableFilter} */
export function createFilter(column = '', op = /** @type {FilterOp} */ ('contains')) {
  return { id: nextFilterId(), column, op, value: '', conjunct: 'and' }
}

/** @param {TableFilter[]} filters */
export function activeFilters(filters) {
  return filters.filter((f) => {
    if (!f.column) return false
    const op = FILTER_OPS.find((o) => o.value === f.op)
    if (!op) return false
    // any-column only makes sense with a value; null-checks don't apply
    if (f.column === ANY_COLUMN) return op.needsValue && f.value.trim().length > 0
    if (!op.needsValue) return true
    return f.value.trim().length > 0
  })
}

/**
 * @param {TableFilter[]} filters
 * @param {{ name: string, dataType?: string }[]} [columns] — when provided, the
 *   column's dataType is included so the backend can cast parameters correctly
 *   and keep filter conditions SARGable (index-eligible) on typed columns.
 */
export function filtersForApi(filters, columns) {
  const typeMap = columns
    ? Object.fromEntries(columns.map((c) => [c.name, c.dataType ?? c.data_type]))
    : {}
  return activeFilters(filters).map(({ column, op, value, conjunct }, i) => ({
    column,
    op,
    value: value.trim() || undefined,
    conjunct: i === 0 ? undefined : (conjunct ?? 'and'),
    dataType: column !== ANY_COLUMN ? (typeMap[column] || undefined) : undefined,
  }))
}

/** Stable key for comparing applied (API) filter state. */
export function filtersApiSignature(filters) {
  return JSON.stringify(filtersForApi(filters))
}

/** @param {TableSort | null} sort */
export function sortForApi(sort) {
  if (!sort?.column) return { sortColumn: undefined, sortDirection: undefined }
  return { sortColumn: sort.column, sortDirection: sort.direction }
}

/** @param {string} search @param {TableFilter[]} filters @param {TableSort | null} sort */
export function hasTableQuery(search, filters, sort) {
  return (
    search.trim().length > 0 ||
    activeFilters(filters).length > 0 ||
    Boolean(sort?.column)
  )
}
