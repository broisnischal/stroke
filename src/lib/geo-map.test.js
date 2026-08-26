import { describe, it, expect } from 'vitest'
import {
  MAX_LAT,
  toWorld,
  toLonLat,
  worldView,
  toScreen,
  fromScreen,
  viewBounds,
  zoomAbout,
  panBy,
  fitExtent,
  degreesPerPixel,
  walkGeometry,
  distanceToSegmentSq,
  hitTest,
} from './geo-map.js'

describe('projection', () => {
  it('puts the origin at the centre of the world square', () => {
    const w = toWorld(0, 0)
    expect(w.x).toBeCloseTo(0.5, 12)
    expect(w.y).toBeCloseTo(0.5, 12)
  })

  it('maps the antimeridian and the Mercator cut to the square corners', () => {
    expect(toWorld(-180, MAX_LAT).x).toBeCloseTo(0, 9)
    expect(toWorld(-180, MAX_LAT).y).toBeCloseTo(0, 9)
    expect(toWorld(180, -MAX_LAT).x).toBeCloseTo(1, 9)
    expect(toWorld(180, -MAX_LAT).y).toBeCloseTo(1, 9)
  })

  it('clamps past the Mercator cut instead of running to infinity', () => {
    // Without the clamp this is where y becomes unusable - the whole reason
    // every web map cuts the world at ±85°.
    expect(Number.isFinite(toWorld(0, 90).y)).toBe(true)
    expect(toWorld(0, 90).y).toBeCloseTo(toWorld(0, MAX_LAT).y, 12)
  })

  it('round-trips lon/lat through world coordinates', () => {
    for (const [lon, lat] of [
      [0, 0],
      [12.4924, 41.8902],
      [-122.4194, 37.7749],
      [151.2093, -33.8688],
      [85.324, 27.7172],
    ]) {
      const w = toWorld(lon, lat)
      const back = toLonLat(w.x, w.y)
      expect(back.lon).toBeCloseTo(lon, 9)
      expect(back.lat).toBeCloseTo(lat, 9)
    }
  })
})

describe('viewport', () => {
  it('round-trips screen and world coordinates', () => {
    const view = { scale: 4096, x: 0.3, y: 0.6 }
    const s = toScreen(view, 800, 600, 0.31, 0.62)
    const w = fromScreen(view, 800, 600, s.px, s.py)
    expect(w.x).toBeCloseTo(0.31, 12)
    expect(w.y).toBeCloseTo(0.62, 12)
  })

  it('shows the whole world in the default view', () => {
    const view = worldView(900, 600)
    const b = viewBounds(view, 900, 600)
    expect(b.minLon).toBeCloseTo(-180, 6)
    expect(b.maxLon).toBeCloseTo(180, 6)
    expect(b.minLat).toBeCloseTo(-MAX_LAT, 6)
    expect(b.maxLat).toBeCloseTo(MAX_LAT, 6)
  })

  it('clamps bounds to real coordinates when zoomed out past the world', () => {
    const b = viewBounds({ scale: 128, x: 0.5, y: 0.5 }, 1600, 1200)
    expect(b.minLon).toBeGreaterThanOrEqual(-180)
    expect(b.maxLon).toBeLessThanOrEqual(180)
    expect(b.minLat).toBeGreaterThanOrEqual(-MAX_LAT)
    expect(b.maxLat).toBeLessThanOrEqual(MAX_LAT)
  })

  it('keeps the point under the cursor fixed while zooming', () => {
    const view = { scale: 1024, x: 0.5, y: 0.5 }
    const before = fromScreen(view, 800, 600, 200, 150)
    const zoomed = zoomAbout(view, 800, 600, 2, 200, 150)
    const after = fromScreen(zoomed, 800, 600, 200, 150)
    expect(after.x).toBeCloseTo(before.x, 12)
    expect(after.y).toBeCloseTo(before.y, 12)
  })

  it('pans by exactly the pixel delta', () => {
    const view = { scale: 1000, x: 0.5, y: 0.5 }
    const moved = panBy(view, 100, 50)
    expect(moved.x).toBeCloseTo(0.4, 12)
    expect(moved.y).toBeCloseTo(0.45, 12)
  })

  it('will not pan the viewport off the edge of the world', () => {
    // Past the edge there is no land, no rows and no grid - just black. Reaching
    // it reads as the drag having broken, not as the world having ended.
    const view = { scale: 4000, x: 0.5, y: 0.5 }
    const far = panBy(view, -100000, -100000, 800, 600)
    const b = viewBounds(far, 800, 600)
    expect(b.maxLon).toBeLessThanOrEqual(180)
    expect(b.maxLat).toBeLessThanOrEqual(MAX_LAT)
    expect(far.x).toBeCloseTo(1 - 800 / 8000, 12)
    expect(far.y).toBeCloseTo(1 - 600 / 8000, 12)
  })

  it('pins an axis to the middle when the world is smaller than the viewport', () => {
    // Zoomed out past a full world there is no pan freedom left to give.
    const pinned = panBy({ scale: 200, x: 0.5, y: 0.5 }, 5000, 5000, 800, 600)
    expect(pinned.x).toBe(0.5)
    expect(pinned.y).toBe(0.5)
  })

  it('keeps zoom inside the world too', () => {
    // Zooming out while parked at an edge would otherwise walk the viewport off.
    const edge = { scale: 8000, x: 0.98, y: 0.98 }
    const out = zoomAbout(edge, 800, 600, 0.25, 0, 0)
    expect(out.x).toBeLessThanOrEqual(1 - 800 / (2 * out.scale) + 1e-9)
    expect(out.y).toBeLessThanOrEqual(1 - 600 / (2 * out.scale) + 1e-9)
  })

  it('frames an extent so the whole extent is visible', () => {
    const extent = /** @type {[number, number, number, number]} */ ([6, 36, 19, 47])
    const view = fitExtent(extent, 800, 600, 20)
    const b = viewBounds(view, 800, 600)
    expect(b.minLon).toBeLessThanOrEqual(6)
    expect(b.maxLon).toBeGreaterThanOrEqual(19)
    expect(b.minLat).toBeLessThanOrEqual(36)
    expect(b.maxLat).toBeGreaterThanOrEqual(47)
  })

  it('survives an extent with no size', () => {
    // A layer with one distinct location. Naively this divides by zero.
    const view = fitExtent([12.5, 41.9, 12.5, 41.9], 800, 600)
    expect(Number.isFinite(view.scale)).toBe(true)
    expect(view.scale).toBeGreaterThan(0)
    const b = viewBounds(view, 800, 600)
    expect(b.minLon).toBeLessThanOrEqual(12.5)
    expect(b.maxLon).toBeGreaterThanOrEqual(12.5)
  })

  it('reports a smaller pixel size as it zooms in', () => {
    expect(degreesPerPixel({ scale: 360, x: 0.5, y: 0.5 })).toBeCloseTo(1, 12)
    expect(degreesPerPixel({ scale: 3600, x: 0.5, y: 0.5 })).toBeCloseTo(0.1, 12)
  })
})

/** Collect what a geometry draws, in screen space, with an identity projection. */
function trace(geometry) {
  const points = []
  const rings = []
  walkGeometry(geometry, (x, y) => ({ px: x * 1000, py: y * 1000 }), {
    point: (px, py) => points.push([px, py]),
    ring: (pts, closed) => rings.push({ pts, closed }),
  })
  return { points, rings }
}

describe('walkGeometry', () => {
  it('handles every GeoJSON type PostGIS can produce', () => {
    expect(trace({ type: 'Point', coordinates: [0, 0] }).points).toHaveLength(1)
    expect(trace({ type: 'MultiPoint', coordinates: [[0, 0], [1, 1], [2, 2]] }).points).toHaveLength(3)
    expect(trace({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }).rings).toHaveLength(1)
    expect(
      trace({ type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]], [[2, 2], [3, 3]]] }).rings,
    ).toHaveLength(2)
  })

  it('emits a polygon hole as its own ring', () => {
    const { rings } = trace({
      type: 'Polygon',
      coordinates: [
        [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
        [[1, 1], [2, 1], [2, 2], [1, 1]],
      ],
    })
    expect(rings).toHaveLength(2)
    expect(rings.every((r) => r.closed)).toBe(true)
  })

  it('recurses into a geometry collection', () => {
    const { points, rings } = trace({
      type: 'GeometryCollection',
      geometries: [
        { type: 'Point', coordinates: [1, 1] },
        { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
        {
          type: 'GeometryCollection',
          geometries: [{ type: 'Point', coordinates: [2, 2] }],
        },
      ],
    })
    expect(points).toHaveLength(2)
    expect(rings).toHaveLength(1)
  })

  it('ignores nulls and types it does not know', () => {
    expect(trace(null).points).toHaveLength(0)
    expect(trace({ type: 'Nonsense', coordinates: [1, 2] }).points).toHaveLength(0)
  })

  it('drops a degenerate ring rather than drawing a zero-length stroke', () => {
    expect(trace({ type: 'LineString', coordinates: [[0, 0]] }).rings).toHaveLength(0)
  })
})

describe('hitTest', () => {
  const identity = (/** @type {number} */ x, /** @type {number} */ y) => ({ px: x, py: y })

  it('picks a point within the tolerance and rejects one outside it', () => {
    const features = [{ geometry: { type: 'Point', coordinates: [0, 0] }, properties: { id: 1 } }]
    const w = toWorld(0, 0)
    expect(hitTest(features, identity, w.x, w.y, 6)?.feature.properties.id).toBe(1)
    expect(hitTest(features, identity, w.x + 100, w.y, 6)).toBeNull()
  })

  it('picks the last-drawn feature when two overlap', () => {
    const at = { type: 'Point', coordinates: [0, 0] }
    const features = [
      { geometry: at, properties: { id: 'under' } },
      { geometry: at, properties: { id: 'over' } },
    ]
    const w = toWorld(0, 0)
    expect(hitTest(features, identity, w.x, w.y, 6)?.feature.properties.id).toBe('over')
  })

  it('hits a line between its vertices, not only on them', () => {
    const features = [
      { geometry: { type: 'LineString', coordinates: [[-10, 0], [10, 0]] }, properties: {} },
    ]
    const mid = toWorld(0, 0)
    expect(hitTest(features, identity, mid.x, mid.y, 0.01)).not.toBeNull()
  })
})

describe('distanceToSegmentSq', () => {
  it('measures perpendicular distance inside the segment', () => {
    expect(distanceToSegmentSq(5, 3, 0, 0, 10, 0)).toBeCloseTo(9, 12)
  })

  it('clamps to the endpoints outside the segment', () => {
    expect(distanceToSegmentSq(-4, 3, 0, 0, 10, 0)).toBeCloseTo(25, 12)
    expect(distanceToSegmentSq(14, 3, 0, 0, 10, 0)).toBeCloseTo(25, 12)
  })

  it('handles a zero-length segment', () => {
    expect(distanceToSegmentSq(3, 4, 0, 0, 0, 0)).toBeCloseTo(25, 12)
  })
})
