export const COL_WIDTH_MIN = 48
export const COL_WIDTH_MAX = 720

/** Sensible fixed default width (px) sized to typical content per data type. */
export function defaultColumnWidth(dataType) {
  const t = String(dataType ?? '')
    .toLowerCase()
    .replace(/\(.+\)$/, '')
    .trim()
  const has = (...needles) => needles.some((n) => t.includes(n))

  // Wide free-form content
  if (has('json')) return 360
  if (has('text')) return 360

  // Identifier-like strings — uuid (36 chars) / cuid are stored as
  // char/varchar/text; give them room to show the full value plus the
  // FK/copy affordances without truncating.
  if (has('uuid')) return 340
  if (has('char', 'varchar', 'string')) return 340

  // Date/time — timestamptz carries the +00 offset, so it needs the most room.
  if (has('timestamptz', 'with time zone')) return 270
  if (has('timestamp', 'datetime')) return 240
  if (has('date', 'time')) return 190

  // Compact scalars
  if (has('bool')) return 130
  if (has('int', 'serial', 'numeric', 'decimal', 'float', 'double', 'real', 'money')) return 180

  // Everything else — comfortable average
  return 200
}

/** @param {number} width */
export function clampColumnWidth(width) {
  return Math.round(Math.min(COL_WIDTH_MAX, Math.max(COL_WIDTH_MIN, width)))
}
