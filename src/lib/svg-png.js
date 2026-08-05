// Rasterize an inline <svg> (mermaid diagrams, ER charts) to a PNG.
//
// WebKit marks a canvas as tainted the moment an SVG image loaded from a
// `blob:` URL is drawn into it, so the following `toBlob()` / `toDataURL()`
// fails with `SecurityError: The operation is insecure`. A base64 `data:` URL
// counts as origin-clean, so it rasterizes normally - that is the only reason
// we go through one here instead of the shorter blob URL.

/**
 * Rasterize an inline SVG element to a PNG blob.
 *
 * @param {SVGSVGElement} svg
 * @param {{ scale?: number, background?: string | null }} [opts]
 *   scale - pixel density multiplier (2 = retina).
 *   background - fill painted behind the diagram; null keeps it transparent.
 * @returns {Promise<Blob>}
 */
export async function svgToPngBlob(svg, opts = {}) {
  const { scale = 2, background = null } = opts
  const vb = svg.viewBox?.baseVal
  const w = vb?.width || svg.clientWidth || 1200
  const h = vb?.height || svg.clientHeight || 800

  // Clone so the export gets an explicit size (WebKit rasterizes a 0x0 image
  // without one) and drops the viewer's live pan/zoom transform, which would
  // otherwise be baked into the file.
  const clone = /** @type {SVGSVGElement} */ (svg.cloneNode(true))
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  clone.style.removeProperty('transform')
  clone.style.removeProperty('transition')

  const xml = new XMLSerializer().serializeToString(clone)
  return svgStringToPngBlob(xml, { width: w, height: h, scale, background })
}

/**
 * Rasterize serialized SVG markup to a PNG blob. Use this when the SVG is built
 * as a string rather than mounted in the DOM.
 *
 * @param {string} xml
 * @param {{ width: number, height: number, scale?: number, background?: string | null }} opts
 * @returns {Promise<Blob>}
 */
export async function svgStringToPngBlob(xml, opts) {
  const { width: w, height: h, scale = 2, background = null } = opts
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))

  // Rasterize the vector *at* the output size rather than drawing a 1x bitmap
  // scaled up: an <img> from an SVG data URL is rasterized at its intrinsic
  // size, so upscaling it in drawImage() resamples 10px label text and the
  // result reads as blurry. Restating width/height at the target resolution
  // (with a viewBox to keep the coordinate system) makes the engine lay the
  // text out at full density instead.
  const img = await loadImage(`data:image/svg+xml;base64,${base64Utf8(retargetSvg(xml, w, h, cw, ch))}`)

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))),
      'image/png',
    )
  })
}

/**
 * Save a blob to disk under `filename`.
 *
 * Inside the desktop shell this opens a native save dialog and writes through
 * the backend — WKWebView ignores `<a download>` on a blob URL, so the anchor
 * path below silently did nothing there. It stays as the browser-dev fallback.
 *
 * @returns {Promise<string | null>} the chosen path, '' when the browser
 *   fallback handled it, or null if the user cancelled the dialog.
 */
export async function downloadBlob(/** @type {Blob} */ blob, /** @type {string} */ filename) {
  const ext = filename.split('.').pop() || 'bin'
  try {
    const { saveExportAs } = await import('$lib/api.js')
    return await saveExportAs(blob, filename, { name: ext.toUpperCase(), extensions: [ext] })
  } catch {
    return anchorDownload(blob, filename)
  }
}

/** @returns {''} */
function anchorDownload(/** @type {Blob} */ blob, /** @type {string} */ filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  try {
    document.body.appendChild(a)
    a.click()
  } finally {
    a.remove()
    // Defer the revoke so the click-triggered download has picked up the blob;
    // revoking synchronously can cancel it.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  return ''
}

/**
 * Restate the root `<svg>` at the raster's pixel size, adding a viewBox over the
 * original user-space box so nothing inside has to change.
 * @param {string} xml
 * @param {number} w user-space width
 * @param {number} h user-space height
 * @param {number} pw pixel width
 * @param {number} ph pixel height
 */
function retargetSvg(xml, w, h, pw, ph) {
  return xml.replace(/<svg\b[^>]*>/i, (tag) => {
    const hasViewBox = /\sviewBox\s*=/i.test(tag)
    const body = tag
      .replace(/\s(?:width|height)\s*=\s*"[^"]*"/gi, '')
      .replace(/^<svg/i, '<svg')
      .slice(4) // drop the leading "<svg", re-added with the new attributes below
    return `<svg width="${pw}" height="${ph}"${hasViewBox ? '' : ` viewBox="0 0 ${w} ${h}"`}${body}`
  })
}

/**
 * A canvas element's contents as a PNG blob, or null when there is nothing to
 * export. `toBlob` rather than `toDataURL` because the save path wants bytes,
 * and a base64 round trip of a large chart is pure waste.
 * @param {HTMLCanvasElement | null} canvas
 * @returns {Promise<Blob | null>}
 */
export function canvasToPngBlob(canvas) {
  if (!canvas || typeof canvas.toBlob !== 'function') return Promise.resolve(null)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}

/** @returns {Promise<HTMLImageElement>} */
function loadImage(/** @type {string} */ src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load the diagram for export'))
    img.src = src
  })
}

/** btoa() only accepts latin-1, and diagram labels are routinely non-ASCII. */
function base64Utf8(/** @type {string} */ text) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  // Chunked so a large diagram doesn't blow the argument limit of `apply`.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, /** @type {any} */ (bytes.subarray(i, i + 0x8000)))
  }
  return btoa(binary)
}
