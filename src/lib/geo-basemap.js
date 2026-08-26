/**
 * Basemap plumbing shared by the map view and the geometry cell viewer.
 *
 * Everything here is DOM-level but Svelte-free: the world outline, its bounding
 * boxes, the raster tile cache and the theme probe. The projection maths lives
 * in `geo-map.js`; this is the layer that knows about images and colours.
 */

import { getWorldGeoJson } from '$lib/geo.js'

/**
 * Basemaps.
 *
 * "Minimal" is the only one that ships with the app: country outlines from
 * `public/world.geo.json`, drawn on canvas, no network. It is the default
 * precisely because a database client should not phone a third party the moment
 * you open a value.
 *
 * The rest are raster tiles from public providers, so choosing one starts
 * fetching images from that host. Satellite and street detail cannot be shipped
 * offline - the imagery is terabytes - so this is the trade being offered, and
 * it is offered explicitly rather than made the default.
 */
export const BASEMAPS = [
  { id: 'minimal', label: 'Minimal', offline: true, url: '', attribution: '', maxZoom: 22 },
  {
    id: 'dark',
    label: 'Dark',
    url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap · © CARTO',
    maxZoom: 20,
  },
  {
    id: 'streets',
    label: 'Streets',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  },
  {
    id: 'satellite',
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri · Maxar · Earthstar Geographics',
    maxZoom: 19,
  },
]

/** @param {string} id */
export function basemapById(id) {
  return BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0]
}

// ── World outline ─────────────────────────────────────────────────────────────

/** @type {any|null} */
let indexedWorld = null
/** @type {Promise<any>|null} */
let worldPromise = null

/**
 * Stamp a lon/lat bounding box onto each feature, once, at load. Zoomed into one
 * city, 216 of the 217 countries are off screen; culling on a precomputed box
 * skips their vertices entirely, which is what keeps a drag at 60fps instead of
 * re-walking the whole basemap every frame.
 * @param {any} data
 */
function indexWorld(data) {
  for (const feature of data?.features || []) {
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity
    const visit = (/** @type {any} */ coords) => {
      if (typeof coords[0] === 'number') {
        if (coords[0] < minLon) minLon = coords[0]
        if (coords[0] > maxLon) maxLon = coords[0]
        if (coords[1] < minLat) minLat = coords[1]
        if (coords[1] > maxLat) maxLat = coords[1]
        return
      }
      for (const c of coords) visit(c)
    }
    if (feature?.geometry?.coordinates) visit(feature.geometry.coordinates)
    feature.__bbox = [minLon, minLat, maxLon, maxLat]
  }
  return data
}

/**
 * The bbox-indexed world outline. Loaded and indexed once per session, however
 * many maps ask for it.
 * @returns {Promise<any>}
 */
export function loadWorldOutline() {
  if (indexedWorld) return Promise.resolve(indexedWorld)
  if (!worldPromise) {
    worldPromise = getWorldGeoJson()
      .then((data) => (indexedWorld = indexWorld(data)))
      .catch((e) => {
        // A failed load must not poison the cache - the next map retries.
        worldPromise = null
        throw e
      })
  }
  return worldPromise
}

// ── Raster tiles ──────────────────────────────────────────────────────────────

/** Tiles held in memory per source. Bounded: panning would otherwise grow without end. */
const TILE_CACHE_MAX = 320

/**
 * A bounded image cache for one map instance.
 *
 * `get` returns the tile if it is decoded, or null and starts loading it - a
 * map that waits for its slowest tile stutters on every pan. A failed tile stays
 * in the cache as a permanent miss, so a dead host is requested once per tile
 * rather than every frame forever, and the failure count is exposed: an online
 * basemap that silently fails looks identical to one that is merely slow.
 *
 * @param {() => void} onLoad Called when a tile arrives, to request a redraw.
 */
export function createTileCache(onLoad) {
  /** @type {Map<string, HTMLImageElement>} */
  const cache = new Map()
  let errors = 0
  return {
    /** @param {string} url */
    get(url) {
      const hit = cache.get(url)
      if (hit) return hit.complete && hit.naturalWidth > 0 ? hit : null
      const img = new Image()
      img.decoding = 'async'
      img.referrerPolicy = 'no-referrer'
      img.onload = onLoad
      img.onerror = () => { errors += 1 }
      img.src = url
      if (cache.size >= TILE_CACHE_MAX) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
      }
      cache.set(url, img)
      return null
    },
    errorCount: () => errors,
    reset() { cache.clear(); errors = 0 },
  }
}

/**
 * Draw the raster tiles covering the viewport.
 *
 * Tiles exist at power-of-two zooms; the one picked is whichever natural size is
 * closest to how big it will be drawn, so the imagery is neither blurry nor
 * downscaled from four times the pixels it needs.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ url: string, offline?: boolean, maxZoom: number }} spec
 * @param {{ scale: number, x: number, y: number }} view
 * @param {number} width @param {number} height
 * @param {{ get: (url: string) => HTMLImageElement | null }} tiles
 * @param {(view: any, w: number, h: number, px: number, py: number) => { x: number, y: number }} fromScreen
 * @param {(view: any, w: number, h: number, x: number, y: number) => { px: number, py: number }} toScreen
 */
export function drawTileLayer(ctx, spec, view, width, height, tiles, fromScreen, toScreen) {
  if (spec.offline || !spec.url) return
  const z = Math.max(0, Math.min(spec.maxZoom, Math.round(Math.log2(view.scale / 256))))
  const n = 1 << z
  const size = view.scale / n
  const tl = fromScreen(view, width, height, 0, 0)
  const br = fromScreen(view, width, height, width, height)
  const x0 = Math.max(0, Math.floor(tl.x * n))
  const x1 = Math.min(n - 1, Math.ceil(br.x * n))
  const y0 = Math.max(0, Math.floor(tl.y * n))
  const y1 = Math.min(n - 1, Math.ceil(br.y * n))
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) return

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const img = tiles.get(
        spec.url.replace('{z}', String(z)).replace('{x}', String(tx)).replace('{y}', String(ty)),
      )
      if (!img) continue
      const at = toScreen(view, width, height, tx / n, ty / n)
      // The extra pixel closes the hairline seams fractional tile sizes leave.
      ctx.drawImage(img, Math.floor(at.px), Math.floor(at.py), Math.ceil(size) + 1, Math.ceil(size) + 1)
    }
  }
}

// ── Theme ─────────────────────────────────────────────────────────────────────

/** @type {CanvasRenderingContext2D|null} */
let probeCtx = null

/**
 * Resolve any CSS colour to "r,g,b".
 *
 * Tokens are oklch strings that canvas keeps verbatim, so each one is rasterized
 * to a pixel and read back as sRGB.
 * @param {string} raw
 */
export function resolveColor(raw) {
  if (!raw) return '128,128,128'
  if (!probeCtx) {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 1
    probeCtx = cv.getContext('2d', { willReadFrequently: true })
  }
  if (!probeCtx) return '128,128,128'
  probeCtx.clearRect(0, 0, 1, 1)
  probeCtx.fillStyle = '#808080'
  probeCtx.fillStyle = raw
  probeCtx.fillRect(0, 0, 1, 1)
  const d = probeCtx.getImageData(0, 0, 1, 1).data
  return `${d[0]},${d[1]},${d[2]}`
}

/**
 * The colour the data is drawn in.
 *
 * Normally the theme's accent, so the map belongs to the rest of the app. But
 * several themes resolve `--primary` to a near-white with no chroma at all
 * (`oklch(0.985 0 0)`), and white data over a neutral basemap on a black canvas
 * is indistinguishable from the basemap - which is the one thing the map exists
 * to show. When the accent has no colour to give, fall back to the app's chart
 * lead, which always does.
 * @param {string} rgb "r,g,b"
 */
export function dataColor(rgb) {
  const [r, g, b] = rgb.split(',').map(Number)
  const chroma = Math.max(r, g, b) - Math.min(r, g, b)
  return chroma >= 24 ? rgb : '99,102,241'
}

/**
 * Read the map palette off an element's computed style.
 * @param {Element | null} el
 */
export function readMapPalette(el) {
  const target = el || document.documentElement
  const read = (/** @type {string} */ n) =>
    resolveColor(getComputedStyle(target).getPropertyValue(n).trim())
  const bg = read('--background')
  const [r, g, b] = bg.split(',').map(Number)
  return {
    land: read('--border'),
    ink: read('--foreground'),
    accent: dataColor(read('--primary')),
    bg,
    /** Additive glow only reads on a dark canvas; on a light one it burns to white. */
    dark: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5,
  }
}
