import { describe, it, expect } from 'vitest'
import {
  isGeometryType,
  parseGeometry,
  geometrySummary,
  mercatorToLonLat,
  formatLonLat,
  lonLatOf,
  sridLabel,
  projectGeometry,
} from './geometry-cell.js'

describe('isGeometryType', () => {
  it('matches geometry and geography, with or without type args', () => {
    expect(isGeometryType('geometry')).toBe(true)
    expect(isGeometryType('geometry(Point,4326)')).toBe(true)
    expect(isGeometryType('geography(Polygon, 4326)')).toBe(true)
    expect(isGeometryType('GEOMETRY')).toBe(true)
  })
  it('rejects everything else', () => {
    expect(isGeometryType('text')).toBe(false)
    expect(isGeometryType('vector(1536)')).toBe(false)
    expect(isGeometryType(null)).toBe(false)
  })
})

describe('parseGeometry', () => {
  it('parses an EWKT point with SRID', () => {
    const g = parseGeometry('SRID=4326;POINT(72.35 18.92)')
    expect(g).not.toBeNull()
    expect(g.srid).toBe(4326)
    expect(g.type).toBe('Point')
    expect(g.dims).toBe('XY')
    expect(g.points).toEqual([[{ x: 72.35, y: 18.92, dims: 'XY' }]])
    expect(g.vertexCount).toBe(1)
    expect(g.bbox).toEqual({ minX: 72.35, minY: 18.92, maxX: 72.35, maxY: 18.92 })
  })

  it('parses plain WKT without SRID', () => {
    const g = parseGeometry('LINESTRING(0 0, 10 5, 20 0)')
    expect(g.srid).toBeNull()
    expect(g.type).toBe('LineString')
    expect(g.lines[0]).toHaveLength(3)
    expect(g.bbox).toEqual({ minX: 0, minY: 0, maxX: 20, maxY: 5 })
  })

  it('parses Z / M / ZM modifiers, attached or spaced', () => {
    expect(parseGeometry('POINT Z (1 2 3)').dims).toBe('XYZ')
    expect(parseGeometry('POINT M (1 2 3)').dims).toBe('XYM')
    expect(parseGeometry('POINT ZM (1 2 3 4)').dims).toBe('XYZM')
    expect(parseGeometry('POINTZ(1 2 3)').dims).toBe('XYZ')
    // Arity alone also decides when there is no modifier.
    expect(parseGeometry('POINT(1 2 3)').dims).toBe('XYZ')
  })

  it('parses polygons with holes', () => {
    const g = parseGeometry('POLYGON((0 0, 10 0, 10 10, 0 10, 0 0), (2 2, 4 2, 4 4, 2 4, 2 2))')
    expect(g.type).toBe('Polygon')
    expect(g.polygons).toHaveLength(1)
    expect(g.polygons[0]).toHaveLength(2)
    expect(g.vertexCount).toBe(10)
  })

  it('parses MULTIPOINT in both syntaxes', () => {
    expect(parseGeometry('MULTIPOINT(1 2, 3 4)').points).toHaveLength(2)
    expect(parseGeometry('MULTIPOINT((1 2),(3 4))').points).toHaveLength(2)
  })

  it('parses MULTIPOLYGON and counts parts', () => {
    const g = parseGeometry('MULTIPOLYGON(((0 0,1 0,1 1,0 0)),((5 5,6 5,6 6,5 5)))')
    expect(g.type).toBe('MultiPolygon')
    expect(g.polygons).toHaveLength(2)
    expect(g.parts).toBe(2)
  })

  it('parses GEOMETRYCOLLECTION recursively', () => {
    const g = parseGeometry('GEOMETRYCOLLECTION(POINT(1 2), LINESTRING(0 0, 1 1))')
    expect(g.type).toBe('GeometryCollection')
    expect(g.points).toHaveLength(1)
    expect(g.lines).toHaveLength(1)
    expect(g.vertexCount).toBe(3)
  })

  it('handles EMPTY', () => {
    const g = parseGeometry('SRID=4326;POLYGON EMPTY')
    expect(g.empty).toBe(true)
    expect(g.bbox).toBeNull()
  })

  it('rejects non-geometry text', () => {
    expect(parseGeometry('hello world')).toBeNull()
    expect(parseGeometry('[0.1, 0.2]')).toBeNull()
    expect(parseGeometry('POINT(1)')).toBeNull()
    expect(parseGeometry('POINT(a b)')).toBeNull()
    expect(parseGeometry(42)).toBeNull()
  })
})

describe('coordinate helpers', () => {
  it('inverts web mercator to lon/lat', () => {
    const { lon, lat } = mercatorToLonLat(0, 0)
    expect(lon).toBeCloseTo(0)
    expect(lat).toBeCloseTo(0)
    // Paris-ish: 261848 E, 6250565 N ≈ 2.352°E 48.857°N
    const p = mercatorToLonLat(261848, 6250565)
    expect(p.lon).toBeCloseTo(2.3522, 3)
    expect(p.lat).toBeCloseTo(48.8566, 3)
  })

  it('formats lon/lat with hemispheres', () => {
    expect(formatLonLat(72.35, 18.92)).toBe('18.9200° N, 72.3500° E')
    expect(formatLonLat(-73.99, -40.7)).toBe('40.7000° S, 73.9900° W')
  })

  it('derives lon/lat only for known SRIDs', () => {
    expect(lonLatOf({ x: 10, y: 20 }, 4326)).toEqual({ lon: 10, lat: 20 })
    expect(lonLatOf({ x: 0, y: 0 }, 3857)).toEqual({ lon: 0, lat: 0 })
    expect(lonLatOf({ x: 10, y: 20 }, 27700)).toBeNull()
  })

  it('labels the common SRIDs', () => {
    expect(sridLabel(4326)).toContain('WGS 84')
    expect(sridLabel(3857)).toContain('Mercator')
    expect(sridLabel(null)).toBe('no SRID')
    expect(sridLabel(27700)).toBe('EPSG:27700')
  })
})

describe('geometrySummary', () => {
  it('summarizes a point with its coordinates', () => {
    expect(geometrySummary('SRID=4326;POINT(72.35 18.92)')).toBe('Point · 4326 · 72.35 18.92')
  })
  it('summarizes other types by name', () => {
    expect(geometrySummary('SRID=4326;MULTIPOLYGON(((0 0,1 0,1 1,0 0)))')).toBe('MultiPolygon · 4326')
    expect(geometrySummary('LINESTRING(0 0, 1 1)')).toBe('LineString')
  })
  it('marks EMPTY and passes through non-geometry', () => {
    expect(geometrySummary('SRID=4326;POLYGON EMPTY')).toBe('Polygon · 4326 · empty')
    expect(geometrySummary('not geometry')).toBe('not geometry')
  })
})

describe('projectGeometry', () => {
  it('fits and y-flips into the viewport', () => {
    const g = parseGeometry('LINESTRING(0 0, 10 10)')
    const p = projectGeometry(g, 100, 100, 10)
    expect(p.vertices).toHaveLength(2)
    const [a, b] = p.vertices
    // (0,0) lands bottom-left, (10,10) top-right — y grows downward in SVG.
    expect(a.y).toBeGreaterThan(b.y)
    expect(a.x).toBeLessThan(b.x)
  })

  it('centers a single point instead of dividing by zero', () => {
    const g = parseGeometry('POINT(5 5)')
    const p = projectGeometry(g, 200, 100, 10)
    expect(p.points[0].x).toBeCloseTo(100)
    expect(p.points[0].y).toBeCloseTo(50)
  })

  it('returns null for empty geometries', () => {
    expect(projectGeometry(parseGeometry('POLYGON EMPTY'), 100, 100)).toBeNull()
  })
})
