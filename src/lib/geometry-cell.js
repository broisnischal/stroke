// A geometry cell, read rather than dumped.
//
// PostGIS values arrive as EWKT (`SRID=4326;POINT(72.35 18.92)`). The grid and
// the generic editor showed that string raw — technically the value,
// practically unreadable past a point or two. These helpers parse EWKT/WKT
// into something a viewer can draw and summarize. Parsing is tolerant of the
// shapes PostGIS actually emits (Z/M modifiers, attached or spaced; EMPTY;
// MULTIPOINT with or without per-point parens; nested collections).

/** @typedef {{ x: number, y: number, z?: number, m?: number }} Vertex */
/**
 * @typedef {Object} ParsedGeometry
 * @property {number | null} srid
 * @property {string} type        Normalized type name, e.g. "Point", "MultiPolygon".
 * @property {'XY'|'XYZ'|'XYM'|'XYZM'} dims
 * @property {boolean} empty
 * @property {Vertex[][]} points      Standalone points (one entry per point).
 * @property {Vertex[][]} lines       Linestrings.
 * @property {Vertex[][][]} polygons  Polygons: [rings][vertices]; ring 0 is the shell.
 * @property {number} vertexCount
 * @property {number} parts       Top-level components (1 for simple geometries).
 * @property {{ minX: number, minY: number, maxX: number, maxY: number } | null} bbox
 */

/** Column types that open the geometry viewer. */
export function isGeometryType(colType) {
  return /^(geometry|geography)\b/i.test(String(colType ?? '').trim())
}

const TYPE_RE = /^\s*(GEOMETRYCOLLECTION|MULTIPOLYGON|MULTILINESTRING|MULTIPOINT|POLYGON|LINESTRING|POINT)\s*(ZM|Z|M)?\s*/i

/**
 * Parse an EWKT/WKT literal. Returns null when the text isn't geometry.
 * @param {unknown} raw
 * @returns {ParsedGeometry | null}
 */
export function parseGeometry(raw) {
  if (typeof raw !== 'string') return null
  let text = raw.trim()
  if (!text) return null

  let srid = null
  const sm = /^SRID=(\d+)\s*;\s*/i.exec(text)
  if (sm) {
    srid = Number(sm[1])
    text = text.slice(sm[0].length)
  }

  const acc = { points: [], lines: [], polygons: [], parts: 0 }
  const parsed = parseGeomText(text, acc)
  if (!parsed) return null

  let vertexCount = 0
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const visit = (/** @type {Vertex[]} */ vs) => {
    for (const v of vs) {
      vertexCount++
      if (v.x < minX) minX = v.x
      if (v.x > maxX) maxX = v.x
      if (v.y < minY) minY = v.y
      if (v.y > maxY) maxY = v.y
    }
  }
  for (const p of acc.points) visit(p)
  for (const l of acc.lines) visit(l)
  for (const poly of acc.polygons) for (const ring of poly) visit(ring)

  return {
    srid,
    type: parsed.type,
    dims: parsed.dims,
    empty: vertexCount === 0,
    points: acc.points,
    lines: acc.lines,
    polygons: acc.polygons,
    vertexCount,
    parts: acc.parts,
    bbox: vertexCount ? { minX, minY, maxX, maxY } : null,
  }
}

/**
 * Recursive descent over one geometry body. Pushes drawable primitives into
 * `acc`; returns the outermost { type, dims } or null on parse failure.
 */
function parseGeomText(text, acc) {
  const m = TYPE_RE.exec(text)
  if (!m) return null
  const keyword = m[1].toUpperCase()
  const modifier = (m[2] ?? '').toUpperCase()
  let rest = text.slice(m[0].length).trim()

  const dims = modifier === 'ZM' ? 'XYZM' : modifier === 'Z' ? 'XYZ' : modifier === 'M' ? 'XYM' : 'XY'
  const type = NORMALIZED[keyword]

  if (/^EMPTY$/i.test(rest)) return { type, dims }

  if (!rest.startsWith('(') || !rest.endsWith(')')) return null
  const body = rest.slice(1, -1)

  switch (keyword) {
    case 'POINT': {
      const v = parseVertex(body, modifier)
      if (!v) return null
      acc.points.push([v])
      acc.parts += 1
      return { type, dims: v.dims }
    }
    case 'LINESTRING': {
      const vs = parseVertexList(body, modifier)
      if (!vs) return null
      acc.lines.push(vs.list)
      acc.parts += 1
      return { type, dims: vs.dims }
    }
    case 'POLYGON': {
      const rings = parseRings(body, modifier)
      if (!rings) return null
      acc.polygons.push(rings.rings)
      acc.parts += 1
      return { type, dims: rings.dims }
    }
    case 'MULTIPOINT': {
      // Both `MULTIPOINT(1 2, 3 4)` and `MULTIPOINT((1 2),(3 4))` are valid.
      let d = dims
      for (const item of splitTopLevel(body)) {
        const inner = item.startsWith('(') && item.endsWith(')') ? item.slice(1, -1) : item
        const v = parseVertex(inner, modifier)
        if (!v) return null
        acc.points.push([v])
        acc.parts += 1
        d = v.dims
      }
      return { type, dims: d }
    }
    case 'MULTILINESTRING': {
      let d = dims
      for (const item of splitTopLevel(body)) {
        if (!item.startsWith('(') || !item.endsWith(')')) return null
        const vs = parseVertexList(item.slice(1, -1), modifier)
        if (!vs) return null
        acc.lines.push(vs.list)
        acc.parts += 1
        d = vs.dims
      }
      return { type, dims: d }
    }
    case 'MULTIPOLYGON': {
      let d = dims
      for (const item of splitTopLevel(body)) {
        if (!item.startsWith('(') || !item.endsWith(')')) return null
        const rings = parseRings(item.slice(1, -1), modifier)
        if (!rings) return null
        acc.polygons.push(rings.rings)
        acc.parts += 1
        d = rings.dims
      }
      return { type, dims: d }
    }
    case 'GEOMETRYCOLLECTION': {
      let d = dims
      for (const item of splitTopLevel(body)) {
        const sub = parseGeomText(item.trim(), acc)
        if (!sub) return null
        d = sub.dims
      }
      return { type, dims: d }
    }
  }
  return null
}

const NORMALIZED = {
  POINT: 'Point',
  LINESTRING: 'LineString',
  POLYGON: 'Polygon',
  MULTIPOINT: 'MultiPoint',
  MULTILINESTRING: 'MultiLineString',
  MULTIPOLYGON: 'MultiPolygon',
  GEOMETRYCOLLECTION: 'GeometryCollection',
}

/** Polygon body = comma-separated parenthesized rings. */
function parseRings(body, modifier) {
  const rings = []
  let dims = 'XY'
  for (const item of splitTopLevel(body)) {
    if (!item.startsWith('(') || !item.endsWith(')')) return null
    const vs = parseVertexList(item.slice(1, -1), modifier)
    if (!vs) return null
    rings.push(vs.list)
    dims = vs.dims
  }
  return rings.length ? { rings, dims } : null
}

function parseVertexList(body, modifier) {
  const list = []
  let dims = 'XY'
  for (const item of splitTopLevel(body)) {
    const v = parseVertex(item, modifier)
    if (!v) return null
    list.push(v)
    dims = v.dims
  }
  return list.length ? { list, dims } : null
}

/** One vertex: 2-4 whitespace-separated numbers, arity + modifier decide dims. */
function parseVertex(text, modifier) {
  const nums = text.trim().split(/\s+/).map(Number)
  if (nums.length < 2 || nums.length > 4 || nums.some((n) => !Number.isFinite(n))) return null
  const [x, y, a, b] = nums
  /** @type {Vertex & { dims: 'XY'|'XYZ'|'XYM'|'XYZM' }} */
  const v = { x, y, dims: 'XY' }
  if (nums.length === 4) { v.z = a; v.m = b; v.dims = 'XYZM' }
  else if (nums.length === 3) {
    if (modifier === 'M') { v.m = a; v.dims = 'XYM' }
    else { v.z = a; v.dims = 'XYZ' }
  }
  return v
}

/** Split on commas at paren depth 0. */
function splitTopLevel(s) {
  const out = []
  let depth = 0, start = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      out.push(s.slice(start, i).trim())
      start = i + 1
    }
  }
  const last = s.slice(start).trim()
  if (last) out.push(last)
  return out
}

// ── Coordinate systems ────────────────────────────────────────────────────────

const EARTH_R = 6378137

/** EPSG:3857 meters → lon/lat degrees. */
export function mercatorToLonLat(x, y) {
  const lon = (x / EARTH_R) * (180 / Math.PI)
  const lat = (2 * Math.atan(Math.exp(y / EARTH_R)) - Math.PI / 2) * (180 / Math.PI)
  return { lon, lat }
}

/** Human name for the SRIDs that show up constantly; EPSG code otherwise. */
export function sridLabel(srid) {
  if (srid === 4326) return 'WGS 84 · degrees'
  if (srid === 3857) return 'Web Mercator · meters'
  if (srid === null || srid === 0) return 'no SRID'
  return `EPSG:${srid}`
}

/** `72.3500° E, 18.9219° N` — the way a human reads a WGS 84 coordinate. */
export function formatLonLat(lon, lat) {
  const fmt = (v, pos, neg) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`
  return `${fmt(lat, 'N', 'S')}, ${fmt(lon, 'E', 'W')}`
}

/**
 * The lon/lat reading for a vertex, when the SRID makes one derivable.
 * @param {Vertex} v @param {number | null} srid
 */
export function lonLatOf(v, srid) {
  if (srid === 4326) return { lon: v.x, lat: v.y }
  if (srid === 3857) return mercatorToLonLat(v.x, v.y)
  return null
}

/** Compact number for coordinate display. */
export function shortCoord(v) {
  if (!Number.isFinite(v)) return String(v)
  const abs = Math.abs(v)
  if (abs !== 0 && (abs >= 1e7 || abs < 1e-4)) return v.toExponential(3)
  return String(Number(v.toFixed(abs >= 1000 ? 1 : 6)))
}

/**
 * Short label for a grid cell, cheap enough for the canvas draw path: reads
 * only the EWKT header (plus the first pair, for points) — never a full parse.
 * `Point · 4326 · 72.35 18.92` / `MultiPolygon · 4326 · …`
 * @param {unknown} raw
 */
export function geometrySummary(raw) {
  if (typeof raw !== 'string') return String(raw ?? '')
  const m = /^(?:SRID=(\d+);)?\s*(GEOMETRYCOLLECTION|MULTIPOLYGON|MULTILINESTRING|MULTIPOINT|POLYGON|LINESTRING|POINT)\s*(?:ZM|Z|M)?\s*(EMPTY|\()/i.exec(raw.trim())
  if (!m) return raw
  const type = NORMALIZED[m[2].toUpperCase()]
  const srid = m[1] ? ` · ${m[1]}` : ''
  if (m[3].toUpperCase() === 'EMPTY') return `${type}${srid} · empty`
  if (m[2].toUpperCase() === 'POINT') {
    const c = /\(\s*(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/.exec(raw)
    if (c) return `${type}${srid} · ${shortCoord(Number(c[1]))} ${shortCoord(Number(c[2]))}`
  }
  return `${type}${srid}`
}

// ── SVG projection ────────────────────────────────────────────────────────────

/**
 * Project a parsed geometry into SVG space (y flipped, aspect preserved,
 * centered). Returns path strings for lines/polygons and screen positions for
 * every vertex, so the component draws without doing math.
 *
 * @param {ParsedGeometry} g
 * @param {number} width @param {number} height @param {number} [padding]
 */
export function projectGeometry(g, width, height, padding = 24) {
  if (!g.bbox) return null
  const { minX, minY, maxX, maxY } = g.bbox
  const spanX = maxX - minX
  const spanY = maxY - minY
  const innerW = width - padding * 2
  const innerH = height - padding * 2
  // A single point (or an axis-aligned line) has a zero span — any positive
  // scale centers it, so pick 1 to avoid dividing by zero.
  const scale = Math.min(
    spanX > 0 ? innerW / spanX : Infinity,
    spanY > 0 ? innerH / spanY : Infinity,
  )
  const s = Number.isFinite(scale) ? scale : 1
  const offX = (width - spanX * s) / 2
  const offY = (height - spanY * s) / 2

  const px = (/** @type {Vertex} */ v) => offX + (v.x - minX) * s
  const py = (/** @type {Vertex} */ v) => offY + (maxY - v.y) * s

  const lineD = (/** @type {Vertex[]} */ vs, close = false) =>
    vs.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(v).toFixed(2)} ${py(v).toFixed(2)}`).join('') + (close ? 'Z' : '')

  return {
    scale: s,
    /** All polygon rings joined per polygon, for a single evenodd-filled path. */
    polygons: g.polygons.map((rings) => rings.map((r) => lineD(r, true)).join('')),
    lines: g.lines.map((l) => lineD(l)),
    points: g.points.map(([v]) => ({ x: px(v), y: py(v), v })),
    /** Screen position of every vertex, for hover lookup (capped by caller). */
    vertices: allVertices(g).map((v) => ({ x: px(v), y: py(v), v })),
  }
}

/** @param {ParsedGeometry} g @returns {Vertex[]} */
export function allVertices(g) {
  const out = []
  for (const p of g.points) out.push(...p)
  for (const l of g.lines) out.push(...l)
  for (const poly of g.polygons) for (const ring of poly) out.push(...ring)
  return out
}
