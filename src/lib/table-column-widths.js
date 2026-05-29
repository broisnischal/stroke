export const COL_WIDTH_MIN = 48
export const COL_WIDTH_MAX = 1600

/** Sensible fixed default width (px) sized to typical content per data type. */
export function defaultColumnWidth(dataType) {
  const t = String(dataType ?? '')
    .toLowerCase()
    .replace(/\(.+\)$/, '')
    .trim()
  const has = (...needles) => needles.some((n) => t.includes(n))

  // Wide free-form content
  if (has('json')) return 420
  if (has('text')) return 420

  // Identifier-like strings — uuid (36 chars) / cuid are stored as
  // char/varchar/text; give them room to show the full value plus the
  // FK/copy affordances without truncating.
  if (has('uuid')) return 380
  if (has('char', 'varchar', 'string')) return 380

  // Date/time — timestamptz carries the +00 offset, so it needs the most room.
  if (has('timestamptz', 'with time zone')) return 300
  if (has('timestamp', 'datetime')) return 270
  if (has('date', 'time')) return 220

  // Compact scalars
  if (has('bool')) return 150
  if (has('int', 'serial', 'numeric', 'decimal', 'float', 'double', 'real', 'money')) return 210

  // Everything else — comfortable average
  return 240
}

/** @param {number} width */
export function clampColumnWidth(width) {
  return Math.round(Math.min(COL_WIDTH_MAX, Math.max(COL_WIDTH_MIN, width)))
}
