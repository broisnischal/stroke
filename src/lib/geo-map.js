/**
 * Projection and viewport maths for the map view.
 *
 * The map draws in Web Mercator, the projection every web map uses, so the world
 * outline and the data agree with what people expect a map to look like. All the
 * geometry here works in a *unit square*: longitude/latitude project into
 * `[0,1]²` once, and the viewport is only a scale and an offset on top of that.
 * That keeps zoom and pan to two numbers and makes the whole module pure — no
 * canvas, no DOM, no Svelte — which is why it can be tested directly.
 *
 * Screen coordinates are CSS pixels. Device pixel ratio is the canvas's problem,
 * not this module's.
 */

/**
 * Mercator diverges at the poles, so every web map cuts the world at the
 * latitude where the projection turns square. Past this the maths still works
 * but y runs to infinity, so clamping here is what keeps a pole-adjacent point
 * on screen instead of at 1e17.
 */
export const MAX_LAT = 85.0511287798066

/** @typedef {{ scale: number, x: number, y: number }} View
 * `scale` is the pixel width of the whole world; `x`/`y` are the world-unit
 * coordinates at the centre of the viewport. */

/** @typedef {{ minLon: number, minLat: number, maxLon: number, maxLat: number }} Bounds */

const clamp = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) =>
  v < lo ? lo : v > hi ? hi : v

/**
 * Longitude/latitude to the unit square, y increasing southward so it maps
 * straight onto screen coordinates.
 * @param {number} lon @param {number} lat
 * @returns {{ x: number, y: number }}
 */
export function toWorld(lon, lat) {
  const φ = (clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180
  return {
    x: (lon + 180) / 360,
    y: 0.5 - Math.log(Math.tan(Math.PI / 4 + φ / 2)) / (2 * Math.PI),
  }
}

/**
 * The inverse of {@link toWorld}.
 * @param {number} x @param {number} y
 * @returns {{ lon: number, lat: number }}
 */
export function toLonLat(x, y) {
  const n = Math.PI * (1 - 2 * y)
  return {
    lon: x * 360 - 180,
    lat: (180 / Math.PI) * Math.atan(Math.sinh(n)),
  }
}

/**
 * A view showing the whole world in the given canvas.
 * @param {number} width @param {number} height
 * @returns {View}
 */
export function worldView(width, height) {
  // The world is square in Mercator, so the smaller axis decides the scale — the
  // alternative crops one axis, and losing half the world by default is worse
  // than empty margins.
  return { scale: Math.max(1, Math.min(width, height)), x: 0.5, y: 0.5 }
}

/**
 * World-unit point to canvas pixels.
 * @param {View} view @param {number} width @param {number} height
 * @param {number} x @param {number} y
 * @returns {{ px: number, py: number }}
 */
export function toScreen(view, width, height, x, y) {
  return {
    px: (x - view.x) * view.scale + width / 2,
    py: (y - view.y) * view.scale + height / 2,
  }
}

/**
 * Canvas pixels back to world units.
 * @param {View} view @param {number} width @param {number} height
 * @param {number} px @param {number} py
 * @returns {{ x: number, y: number }}
 */
export function fromScreen(view, width, height, px, py) {
  return {
    x: (px - width / 2) / view.scale + view.x,
    y: (py - height / 2) / view.scale + view.y,
  }
}

/**
 * The longitude/latitude box currently visible — the bbox the server filters on.
 *
 * Zoomed far out the viewport is wider than the world; the result is clamped to
 * real coordinates so the query gets a box a database can use rather than
 * longitudes past ±180.
 * @param {View} view @param {number} width @param {number} height
 * @returns {Bounds}
 */
export function viewBounds(view, width, height) {
  const tl = fromScreen(view, width, height, 0, 0)
  const br = fromScreen(view, width, height, width, height)
  const a = toLonLat(clamp(tl.x, 0, 1), clamp(tl.y, 0, 1))
  const b = toLonLat(clamp(br.x, 0, 1), clamp(br.y, 0, 1))
  return {
    minLon: clamp(Math.min(a.lon, b.lon), -180, 180),
    minLat: clamp(Math.min(a.lat, b.lat), -MAX_LAT, MAX_LAT),
    maxLon: clamp(Math.max(a.lon, b.lon), -180, 180),
    maxLat: clamp(Math.max(a.lat, b.lat), -MAX_LAT, MAX_LAT),
  }
}

/** Smallest scale that still shows the whole world height. */
const MIN_SCALE = 128
/** Roughly street level; past this Mercator's precision stops helping. */
const MAX_SCALE = 1 << 26

/**
 * Zoom about a fixed screen point, so the coordinate under the cursor stays
 * under the cursor. Anchoring on the centre instead is the classic mistake — it
 * makes wheel-zoom feel like the map is running away from the pointer.
 * @param {View} view @param {number} width @param {number} height
 * @param {number} factor @param {number} px @param {number} py
 * @returns {View}
 */
export function zoomAbout(view, width, height, factor, px, py) {
  const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE)
  const actual = scale / view.scale
  const anchor = fromScreen(view, width, height, px, py)
  return clampView(
    {
      scale,
      x: anchor.x + (view.x - anchor.x) / actual,
      y: anchor.y + (view.y - anchor.y) / actual,
    },
    width,
    height,
  )
}

/**
 * Keep the viewport over the world.
 *
 * There is nothing outside the unit square — no land, no rows, no grid. Letting
 * a pan or a zoom carry the viewport past its edge slides the map off into
 * blackness, which reads as the drag having broken rather than as having reached
 * the end of the world.
 *
 * When the world is larger than the viewport the centre is held far enough in
 * that the edges stay off screen. When it is smaller — zoomed out past a full
 * world — there is no freedom left on that axis, so it is pinned to the middle.
 *
 * @param {View} view @param {number} width @param {number} height
 * @returns {View}
 */
export function clampView(view, width, height) {
  if (!width || !height) return view
  const halfW = width / (2 * view.scale)
  const halfH = height / (2 * view.scale)
  return {
    scale: view.scale,
    x: halfW >= 0.5 ? 0.5 : clamp(view.x, halfW, 1 - halfW),
    y: halfH >= 0.5 ? 0.5 : clamp(view.y, halfH, 1 - halfH),
  }
}

/**
 * Pan by a pixel delta, kept over the world.
 * @param {View} view @param {number} dx @param {number} dy
 * @param {number} [width] @param {number} [height]
 * @returns {View}
 */
export function panBy(view, dx, dy, width = 0, height = 0) {
  return clampView(
    {
      scale: view.scale,
      x: view.x - dx / view.scale,
      y: view.y - dy / view.scale,
    },
    width,
    height,
  )
}

/**
 * The view that frames a `[minLon, minLat, maxLon, maxLat]` extent.
 *
 * A degenerate extent — one point, or a layer with a single distinct location —
 * has no size to fit, so it gets a fixed neighbourhood-level scale instead of a
 * division by zero.
 * @param {[number, number, number, number]} extent
 * @param {number} width @param {number} height @param {number} [padding]
 * @returns {View}
 */
export function fitExtent(extent, width, height, padding = 32) {
  const [minLon, minLat, maxLon, maxLat] = extent
  const a = toWorld(minLon, maxLat)
  const b = toWorld(maxLon, minLat)
  const w = Math.abs(b.x - a.x)
  const h = Math.abs(b.y - a.y)
  const usableW = Math.max(1, width - padding * 2)
  const usableH = Math.max(1, height - padding * 2)
  const scale =
    w < 1e-9 && h < 1e-9
      ? 1 << 16
      : Math.min(w > 1e-9 ? usableW / w : Infinity, h > 1e-9 ? usableH / h : Infinity)
  return clampView(
    {
      scale: clamp(scale, MIN_SCALE, MAX_SCALE),
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    },
    width,
    height,
  )
}

/**
 * Degrees of longitude per screen pixel — the simplification tolerance to ask
 * the server for. Vertices closer together than this cannot be told apart on
 * screen, so dropping them costs nothing visible and is what makes a 30k-row
 * road layer render at all.
 * @param {View} view
 */
export function degreesPerPixel(view) {
  return 360 / view.scale
}

/**
 * Grid size, in degrees of longitude, for server-side clustering: about 54
 * screen pixels per cell.
 *
 * Small cells give many small marks, which at city scale means one place broken
 * into a dozen dots that mean nothing individually. 54px is wide enough that a
 * cluster is a legible marker with its own count printed inside it, and that a
 * town collapses to one marker rather than a constellation.
 *
 * The server squares this against Mercator before snapping, so a cell is the
 * same size on screen at every latitude.
 * @param {View} view
 */
export function clusterCell(view) {
  return degreesPerPixel(view) * 54
}

// ── Drawing ───────────────────────────────────────────────────────────────────

/**
 * Walk a GeoJSON geometry, calling back with each ring of screen coordinates.
 *
 * One traversal serves points, lines, polygons and collections because they only
 * differ in nesting depth, and a `GeometryCollection` can hold any of them —
 * including, from an untyped PostGIS column, a mix in a single feature.
 *
 * @param {any} geometry
 * @param {(x: number, y: number) => { px: number, py: number }} project
 * @param {{ point: (px: number, py: number) => void, ring: (pts: number[], closed: boolean) => void }} sink
 */
export function walkGeometry(geometry, project, sink) {
  if (!geometry) return
  const pt = (/** @type {number[]} */ c) => {
    const w = toWorld(c[0], c[1])
    const s = project(w.x, w.y)
    return s
  }
  const ring = (/** @type {number[][]} */ coords, /** @type {boolean} */ closed) => {
    /** @type {number[]} */
    const flat = []
    for (const c of coords) {
      const s = pt(c)
      flat.push(s.px, s.py)
    }
    if (flat.length >= 4) sink.ring(flat, closed)
  }
  switch (geometry.type) {
    case 'Point': {
      const s = pt(geometry.coordinates)
      sink.point(s.px, s.py)
      break
    }
    case 'MultiPoint':
      for (const c of geometry.coordinates) {
        const s = pt(c)
        sink.point(s.px, s.py)
      }
      break
    case 'LineString':
      ring(geometry.coordinates, false)
      break
    case 'MultiLineString':
      for (const line of geometry.coordinates) ring(line, false)
      break
    case 'Polygon':
      for (const r of geometry.coordinates) ring(r, true)
      break
    case 'MultiPolygon':
      for (const poly of geometry.coordinates) for (const r of poly) ring(r, true)
      break
    case 'GeometryCollection':
      for (const g of geometry.geometries || []) walkGeometry(g, project, sink)
      break
    default:
      break
  }
}

/**
 * Squared distance from a point to a segment, in pixels. Used for hit-testing
 * lines, where "did I click this road" means "am I within a few pixels of it".
 * @param {number} px @param {number} py
 * @param {number} ax @param {number} ay @param {number} bx @param {number} by
 */
export function distanceToSegmentSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = clamp(t, 0, 1)
  const cx = ax + t * dx
  const cy = ay + t * dy
  return (px - cx) ** 2 + (py - cy) ** 2
}

/**
 * The topmost feature within `tolerance` pixels of a point, or null.
 *
 * Searched back to front so the feature drawn last — the one visibly on top —
 * is the one that gets picked, which is what a click on overlapping shapes means.
 *
 * @param {any[]} features
 * @param {(x: number, y: number) => { px: number, py: number }} project
 * @param {number} px @param {number} py @param {number} [tolerance]
 * @returns {{ index: number, feature: any } | null}
 */
export function hitTest(features, project, px, py, tolerance = 6) {
  const tolSq = tolerance * tolerance
  for (let i = features.length - 1; i >= 0; i--) {
    let hit = false
    walkGeometry(features[i]?.geometry, project, {
      point(x, y) {
        if (!hit && (x - px) ** 2 + (y - py) ** 2 <= tolSq) hit = true
      },
      ring(pts) {
        if (hit) return
        for (let j = 0; j + 3 < pts.length; j += 2) {
          if (distanceToSegmentSq(px, py, pts[j], pts[j + 1], pts[j + 2], pts[j + 3]) <= tolSq) {
            hit = true
            return
          }
        }
      },
    })
    if (hit) return { index: i, feature: features[i] }
  }
  return null
}
