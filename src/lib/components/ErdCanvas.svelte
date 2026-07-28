<script>
  import { onMount, onDestroy } from 'svelte'
  import Plus from '@lucide/svelte/icons/plus'
  import Minus from '@lucide/svelte/icons/minus'
  import Maximize from '@lucide/svelte/icons/maximize'

  /**
   * High-FPS canvas ER renderer. Consumes the same node/edge model the page
   * builds for Dagre and draws it on a single 2D canvas with viewport culling
   * and level-of-detail, so large schemas stay smooth where a DOM graph chokes.
   *
   * @typedef {{ id:string, position:{x:number,y:number}, data:any }} FlowNode
   * @typedef {{ id:string, source:string, target:string, sourceHandle?:string }} FlowEdge
   */

  let {
    nodes = /** @type {FlowNode[]} */ ([]),
    edges = /** @type {FlowEdge[]} */ ([]),
    cfg = { NODE_W: 230, ROW_H: 22, HDR_H: 34, PAD_B: 4 },
    selectedId = /** @type {string|null} */ (null),
    onselect = /** @type {(id:string|null)=>void} */ (() => {}),
    onopen = /** @type {(id:string)=>void} */ (() => {}),
    onnodemoved = /** @type {(id:string,x:number,y:number)=>void} */ (() => {}),
  } = $props()

  // Layout constants from the parent's config. $derived so they track `cfg` if
  // the parent swaps it - plain destructuring freezes the initial values, which
  // is what Svelte's `state_referenced_locally` warning flags.
  const NODE_W = $derived(cfg.NODE_W)
  const ROW_H  = $derived(cfg.ROW_H)
  const HDR_H  = $derived(cfg.HDR_H)
  const PAD_B  = $derived(cfg.PAD_B)

  // Match the app's type system (Geist / Geist Mono) - the generic ui-monospace
  // fallback renders poorly on Linux/WebKitGTK. Names use sans, types use mono.
  const FONT_SANS = '"Geist Variable", ui-sans-serif, system-ui, sans-serif'
  const FONT_MONO = '"Geist Mono Variable", ui-monospace, monospace'

  // ── Element / context ───────────────────────────────────────────────────
  let host = $state(/** @type {HTMLDivElement|null} */ (null))
  let canvas = $state(/** @type {HTMLCanvasElement|null} */ (null))
  let mini = $state(/** @type {HTMLCanvasElement|null} */ (null))
  /** @type {CanvasRenderingContext2D|null} */
  let ctx = null
  let dpr = 1
  let cssW = 0
  let cssH = 0

  // ── Camera (world→screen: sx = wx*zoom + panX) ──────────────────────────
  const MIN_ZOOM = 0.04
  const MAX_ZOOM = 2.5
  let cam = { panX: 0, panY: 0, zoom: 1 }

  // Level-of-detail thresholds (world→screen zoom).
  const LOD_ROWS = 0.5   // draw full column rows at/above this
  const LOD_NAME = 0.16  // draw only the table name below LOD_ROWS

  // ── Interaction state ────────────────────────────────────────────────────
  let hoveredId = $state(/** @type {string|null} */ (null))
  /** @type {{ mode:'none'|'pan'|'drag'|'mini', id?:string, ox:number, oy:number, sx:number, sy:number, moved:boolean }} */
  let drag = { mode: 'none', ox: 0, oy: 0, sx: 0, sy: 0, moved: false }
  /** Local position override for the node being dragged (avoids parent churn per frame). */
  let dragPos = /** @type {{id:string,x:number,y:number}|null} */ (null)

  // ── Theme palette (resolved from CSS tokens to concrete rgb) ─────────────
  /** @type {Record<string,string>} */
  let pal = {}
  const PK = '251,191,36'
  const FK = '96,165,250'
  /** @type {HTMLSpanElement|null} */
  let probe = null

  /** @type {CanvasRenderingContext2D|null} */
  let probeCtx = null
  /**
   * Resolve a CSS custom property (e.g. '--card') to concrete "r,g,b".
   * Themes store tokens as full oklch() colors; the canvas fillStyle getter
   * preserves the oklch string rather than converting it, so we rasterize a
   * single pixel and read it back - that always yields device sRGB bytes,
   * correct for oklch / hsl / hex alike.
   * @param {string} name
   */
  function resolveRgb(name) {
    const el = probe || host || document.documentElement
    const raw = getComputedStyle(el).getPropertyValue(name).trim()
    if (!raw) return '128,128,128'
    if (!probeCtx) {
      const cv = document.createElement('canvas')
      cv.width = cv.height = 1
      probeCtx = cv.getContext('2d', { willReadFrequently: true })
    }
    if (!probeCtx) return '128,128,128'
    probeCtx.clearRect(0, 0, 1, 1)
    probeCtx.fillStyle = '#808080' // fallback if `raw` is not a valid color
    probeCtx.fillStyle = raw
    probeCtx.fillRect(0, 0, 1, 1)
    const d = probeCtx.getImageData(0, 0, 1, 1).data
    return `${d[0]},${d[1]},${d[2]}`
  }
  function refreshTheme() {
    pal = {
      bg: resolveRgb('--background'),
      card: resolveRgb('--card'),
      panel: resolveRgb('--panel'),
      border: resolveRgb('--border'),
      fg: resolveRgb('--foreground'),
      mfg: resolveRgb('--muted-foreground'),
      muted: resolveRgb('--muted'),
      primary: resolveRgb('--primary'),
    }
    markDirty()
  }
  /** @param {string} name @param {number} a */
  const c = (name, a = 1) => `rgba(${pal[name] ?? '128,128,128'},${a})`

  // ── Geometry helpers ───────────────────────────────────────────────────
  /** @param {any} data */
  const nodeH = (data) => HDR_H + (data?.columns?.length ?? 0) * ROW_H + PAD_B
  /** @param {FlowNode} n */
  const posOf = (n) => (dragPos && dragPos.id === n.id ? dragPos : n.position)

  /** @type {Map<string,FlowNode>} */
  let byId = new Map()
  // Auto-fit the first time nodes populate (they load async, after mount), then
  // never again until the graph empties - so search/rebuild doesn't reset the view.
  let _fitted = false
  // Zoom below which cards stop being legible - a big/deep schema whose whole
  // bounding box would fit only under this is NOT fit-to-view (that produces an
  // unreadable sliver). Instead we land at READABLE_ZOOM anchored at the graph's
  // top-left so real cards are visible and the user pans to explore.
  const READABLE_ZOOM = 0.62
  function ensureFit() {
    if (_fitted || !cssW || !nodes.length) return
    _fitted = true
    // Graph bounding box (world coords).
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const n of nodes) {
      const p = posOf(n), h = nodeH(n.data)
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y)
      x1 = Math.max(x1, p.x + NODE_W); y1 = Math.max(y1, p.y + h)
    }
    const bw = x1 - x0 || 1, bh = y1 - y0 || 1
    const zFit = Math.min(cssW / bw, cssH / bh) * (1 - 0.12)
    if (zFit >= READABLE_ZOOM) {
      // Small enough to show entirely at a legible size - fit-and-centre.
      fit()
      return
    }
    // Too large to fit legibly: land readable at the top-left of the graph so the
    // first ranks are visible; the user pans right/down through the rest.
    const M = 56 // screen-px margin from the viewport's top-left
    cam.zoom = READABLE_ZOOM
    cam.panX = M - x0 * READABLE_ZOOM
    // Centre vertically when the graph is shorter than the viewport, else top-anchor.
    cam.panY = bh * READABLE_ZOOM < cssH - M
      ? (cssH - bh * READABLE_ZOOM) / 2 - y0 * READABLE_ZOOM
      : M - y0 * READABLE_ZOOM
    markDirty()
  }
  $effect(() => {
    byId = new Map(nodes.map((n) => [n.id, n]))
    if (!nodes.length) _fitted = false
    ensureFit()
    markDirty()
  })
  $effect(() => { void edges; void selectedId; markDirty() })

  // ── Render scheduling ───────────────────────────────────────────────────
  let rafId = 0
  function markDirty() {
    if (rafId || !ctx) return
    rafId = requestAnimationFrame(() => { rafId = 0; draw() })
  }

  function draw() {
    if (!ctx) return
    const { panX, panY, zoom } = cam

    // Clear to transparent - the themed page background shows through, so we
    // never depend on resolving --background (which can misparse per webview).
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)

    // World transform - everything below is drawn in world coordinates.
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * panX, dpr * panY)
    const vx0 = -panX / zoom, vy0 = -panY / zoom
    const vx1 = (cssW - panX) / zoom, vy1 = (cssH - panY) / zoom

    if (zoom > 0.45) drawGrid(vx0, vy0, vx1, vy1)

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const e of edges) drawEdge(e, vx0, vy0, vx1, vy1)
    for (const n of nodes) {
      const p = posOf(n), h = nodeH(n.data)
      if (p.x > vx1 || p.x + NODE_W < vx0 || p.y > vy1 || p.y + h < vy0) continue
      drawNode(n, p, h, zoom)
    }
    drawMinimap()
  }

  /** @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 */
  function drawGrid(x0, y0, x1, y1) {
    const G = 22
    ctx.fillStyle = c('mfg', 0.14)
    const sx = Math.floor(x0 / G) * G, sy = Math.floor(y0 / G) * G
    for (let x = sx; x < x1; x += G)
      for (let y = sy; y < y1; y += G) ctx.fillRect(x, y, 1, 1)
  }

  /** @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r */
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  /** Stable non-negative hash of a string - used to fan parallel edges into
   *  separate lanes without any global bookkeeping. */
  function hashStr(/** @type {string} */ s) {
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
    return Math.abs(h)
  }

  /** @param {FlowEdge} e */
  function drawEdge(e, vx0, vy0, vx1, vy1) {
    const s = byId.get(e.source), t = byId.get(e.target)
    if (!s || !t) return
    const sp = posOf(s), tp = posOf(t)
    const sh = nodeH(s.data), th = nodeH(t.data)
    const scols = s.data?.columns ?? []
    const tcols = t.data?.columns ?? []
    const ci = e.sourceHandle ? scols.findIndex((/** @type {any} */ col) => `src-${col.name}` === e.sourceHandle) : -1
    const ti = e.targetHandle ? tcols.findIndex((/** @type {any} */ col) => `tgt-${col.name}` === e.targetHandle) : -1

    // Anchor each end to its column row (FK column → referenced key column). Past
    // the row LOD the rows aren't drawn, so fall back to the card's centre.
    const rowsShown = cam.zoom >= LOD_ROWS
    const rowY = (/** @type {number} */ y, /** @type {number} */ i, /** @type {number} */ h) =>
      rowsShown && i >= 0 ? y + HDR_H + i * ROW_H + ROW_H / 2 : y + (rowsShown ? HDR_H / 2 : h / 2)

    // Exit whichever side of each card faces the other, so the elbow reads cleanly.
    const leftToRight = tp.x >= sp.x
    const sx = leftToRight ? sp.x + NODE_W : sp.x
    const sy = rowY(sp.y, ci, sh)
    const tx = leftToRight ? tp.x : tp.x + NODE_W
    const ty = rowY(tp.y, ti, th)

    // Cull: skip when the edge's bounding box misses the viewport.
    if (Math.max(sx, tx) < vx0 || Math.min(sx, tx) > vx1 || Math.max(sy, ty) < vy0 || Math.min(sy, ty) > vy1) return

    const active = e.source === selectedId || e.target === selectedId
    const dim = s.data?.highlighted === false && t.data?.highlighted === false

    // Orthogonal (right-angle) routing with rounded corners: exit the FK row
    // horizontally, drop straight down/up a shared mid-column, then run into the
    // referenced key row. Reads as a structured schema diagram. A per-edge lane
    // offset on the mid-column fans parallel edges (e.g. several FKs off one
    // table) so they don't collapse onto a single line.
    const vGap = ty - sy
    const lane = (((ci >= 0 ? ci : 0) % 5) - 2) * 12 + ((hashStr(e.id) % 3) - 1) * 6
    let midX = sx + (tx - sx) * 0.5 + (leftToRight ? lane : -lane)
    // Keep the elbow in the gap between the two cards, with room for the corners.
    const loX = Math.min(sx, tx) + 12, hiX = Math.max(sx, tx) - 12
    midX = loX <= hiX ? Math.max(loX, Math.min(hiX, midX)) : (sx + tx) / 2
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    if (Math.abs(vGap) < 1) {
      // Same row height - a straight horizontal run reads cleaner than a flat jog.
      ctx.lineTo(tx, ty)
    } else {
      const r = Math.min(12, Math.abs(midX - sx), Math.abs(midX - tx), Math.abs(vGap) / 2)
      ctx.arcTo(midX, sy, midX, ty, r)
      ctx.arcTo(midX, ty, tx, ty, r)
      ctx.lineTo(tx, ty)
    }
    ctx.lineWidth = (active ? 2 : 1.3) / cam.zoom
    ctx.strokeStyle = active ? c('primary', 0.95) : dim ? c('mfg', 0.12) : `rgba(${FK},0.6)`
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()

    // Endpoint nubs on both column rows.
    const dr = 2.8 / cam.zoom
    ctx.fillStyle = active ? c('primary', 0.95) : dim ? c('mfg', 0.15) : `rgba(${FK},0.85)`
    ctx.beginPath(); ctx.arc(sx, sy, dr, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(tx, ty, dr, 0, Math.PI * 2); ctx.fill()
  }

  /** @param {FlowNode} n @param {{x:number,y:number}} p @param {number} h @param {number} zoom */
  function drawNode(n, p, h, zoom) {
    const d = n.data ?? {}
    const dim = d.highlighted === false
    const sel = n.id === selectedId
    const hov = n.id === hoveredId
    ctx.globalAlpha = dim ? 0.18 : 1

    // Card + border.
    roundRect(p.x, p.y, NODE_W, h, 8)
    ctx.fillStyle = c('card', 1)
    ctx.fill()
    ctx.lineWidth = (sel ? 2 : 1) / zoom
    ctx.strokeStyle = sel ? c('primary', 0.85) : hov ? c('border', 1) : c('border', 0.45)
    ctx.stroke()

    // Header band.
    ctx.save()
    roundRect(p.x, p.y, NODE_W, Math.min(HDR_H + 8, h), 8)
    ctx.clip()
    ctx.fillStyle = c('muted', 0.6)
    ctx.fillRect(p.x, p.y, NODE_W, HDR_H)
    ctx.restore()
    ctx.beginPath()
    ctx.moveTo(p.x, p.y + HDR_H); ctx.lineTo(p.x + NODE_W, p.y + HDR_H)
    ctx.lineWidth = 1 / zoom; ctx.strokeStyle = c('border', 0.4); ctx.stroke()

    ctx.textBaseline = 'middle'
    if (zoom >= LOD_NAME) {
      ctx.font = `600 13.5px ${FONT_SANS}`
      ctx.fillStyle = c('fg', 1)
      ctx.textAlign = 'left'
      fillClipped(d.name ?? '', p.x + 16, p.y + HDR_H / 2, NODE_W - 32, 13.5)
    }

    if (zoom < LOD_ROWS) { ctx.globalAlpha = 1; return }

    // Column rows.
    const pk = d.pkCols ?? new Set()
    const cols = d.columns ?? []
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i]
      const isPk = pk.has(col.name)
      const isFk = !!col.foreignKey
      const cy = p.y + HDR_H + i * ROW_H
      if (i > 0) {
        ctx.beginPath()
        ctx.moveTo(p.x, cy); ctx.lineTo(p.x + NODE_W, cy)
        ctx.lineWidth = 0.75 / zoom; ctx.strokeStyle = c('border', 0.12); ctx.stroke()
      }
      const midY = cy + ROW_H / 2
      const badge = isPk ? 'pk' : isFk ? 'fk' : ''
      const typeRight = p.x + NODE_W - (badge ? 52 : 16)

      // Column name.
      ctx.font = `${isPk ? '600 ' : ''}12px ${FONT_SANS}`
      ctx.fillStyle = isPk ? `rgba(${PK},0.95)` : isFk ? `rgba(${FK},0.95)` : c('fg', 0.82)
      ctx.textAlign = 'left'
      fillClipped(col.name ?? '', p.x + 16, midY, typeRight - (p.x + 20), 12)

      // Data type.
      ctx.font = `11px ${FONT_MONO}`
      ctx.fillStyle = c('mfg', 0.6)
      ctx.textAlign = 'right'
      fillClipped(String(col.dataType ?? ''), typeRight, midY, 72, 11, true)

      // PK / FK badge.
      if (badge) {
        const bw = 26, bx = p.x + NODE_W - bw - 12
        roundRect(bx, cy + 6, bw, ROW_H - 12, 3)
        ctx.fillStyle = isPk ? `rgba(${PK},0.16)` : `rgba(${FK},0.14)`
        ctx.fill()
        ctx.font = `700 9px ${FONT_MONO}`
        ctx.fillStyle = isPk ? `rgba(${PK},1)` : `rgba(${FK},1)`
        ctx.textAlign = 'center'
        ctx.fillText(badge, bx + bw / 2, midY + 0.5)
      }
    }
    ctx.globalAlpha = 1
  }

  /**
   * Draw monospace text clipped to a max pixel width (ellipsis by char count).
   * @param {string} text @param {number} x @param {number} y @param {number} maxW @param {number} size @param {boolean} [rightAlign]
   */
  function fillClipped(text, x, y, maxW, size, rightAlign = false) {
    const charW = size * 0.6
    const max = Math.max(1, Math.floor(maxW / charW))
    let s = text
    if (s.length > max) s = s.slice(0, Math.max(1, max - 1)) + '…'
    ctx.fillText(s, x, y)
    void rightAlign
  }

  // ── Minimap ──────────────────────────────────────────────────────────────
  const MINI_W = 168, MINI_H = 116, MINI_PAD = 8
  /** @type {{s:number,ox:number,oy:number}|null} */
  let miniXf = null
  function drawMinimap() {
    if (!mini || !nodes.length) return
    const mctx = mini.getContext('2d')
    if (!mctx) return
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const n of nodes) {
      const p = posOf(n), h = nodeH(n.data)
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y)
      x1 = Math.max(x1, p.x + NODE_W); y1 = Math.max(y1, p.y + h)
    }
    const bw = x1 - x0 || 1, bh = y1 - y0 || 1
    const s = Math.min((MINI_W - MINI_PAD * 2) / bw, (MINI_H - MINI_PAD * 2) / bh)
    const ox = MINI_PAD - x0 * s + (MINI_W - MINI_PAD * 2 - bw * s) / 2
    const oy = MINI_PAD - y0 * s + (MINI_H - MINI_PAD * 2 - bh * s) / 2
    miniXf = { s, ox, oy }

    mini.width = MINI_W * dpr; mini.height = MINI_H * dpr
    mini.style.width = MINI_W + 'px'; mini.style.height = MINI_H + 'px'
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    mctx.fillStyle = c('panel', 1); mctx.fillRect(0, 0, MINI_W, MINI_H)
    for (const n of nodes) {
      const p = posOf(n), h = nodeH(n.data)
      mctx.fillStyle = n.id === selectedId ? c('primary', 0.9) : c('mfg', n.data?.highlighted === false ? 0.15 : 0.4)
      mctx.fillRect(p.x * s + ox, p.y * s + oy, NODE_W * s, h * s)
    }
    // Viewport rectangle.
    const { panX, panY, zoom } = cam
    const rx = (-panX / zoom) * s + ox, ry = (-panY / zoom) * s + oy
    const rw = (cssW / zoom) * s, rh = (cssH / zoom) * s
    mctx.strokeStyle = c('fg', 0.5); mctx.lineWidth = 1
    mctx.strokeRect(rx, ry, rw, rh)
  }

  // ── Camera ops ─────────────────────────────────────────────────────────
  export function fit(padding = 0.12) {
    if (!nodes.length || !cssW) return
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const n of nodes) {
      const p = posOf(n), h = nodeH(n.data)
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y)
      x1 = Math.max(x1, p.x + NODE_W); y1 = Math.max(y1, p.y + h)
    }
    const bw = x1 - x0 || 1, bh = y1 - y0 || 1
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(cssW / bw, cssH / bh) * (1 - padding)))
    cam.zoom = z
    cam.panX = (cssW - bw * z) / 2 - x0 * z
    cam.panY = (cssH - bh * z) / 2 - y0 * z
    markDirty()
  }

  /** @param {string} id */
  export function focus(id) {
    const n = byId.get(id)
    if (!n || !cssW) return
    const p = posOf(n), h = nodeH(n.data)
    const z = Math.max(cam.zoom, 0.8)
    cam.zoom = z
    cam.panX = cssW / 2 - (p.x + NODE_W / 2) * z
    cam.panY = cssH / 2 - (p.y + h / 2) * z
    markDirty()
  }

  /** @param {number} factor @param {number} [cx] @param {number} [cy] */
  function zoomBy(factor, cx = cssW / 2, cy = cssH / 2) {
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom * factor))
    const wx = (cx - cam.panX) / cam.zoom, wy = (cy - cam.panY) / cam.zoom
    cam.zoom = z
    cam.panX = cx - wx * z; cam.panY = cy - wy * z
    markDirty()
  }
  export function zoomIn() { zoomBy(1.25) }
  export function zoomOut() { zoomBy(0.8) }

  // ── Hit testing ───────────────────────────────────────────────────────
  /** @param {number} sx @param {number} sy */
  function hitNode(sx, sy) {
    const wx = (sx - cam.panX) / cam.zoom, wy = (sy - cam.panY) / cam.zoom
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i], p = posOf(n), h = nodeH(n.data)
      if (wx >= p.x && wx <= p.x + NODE_W && wy >= p.y && wy <= p.y + h) return n
    }
    return null
  }

  // ── Pointer / wheel handlers ──────────────────────────────────────────
  /** @param {PointerEvent} e */
  function onPointerDown(e) {
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    const r = canvas.getBoundingClientRect()
    const sx = e.clientX - r.left, sy = e.clientY - r.top
    const hit = hitNode(sx, sy)
    drag = { mode: hit ? 'drag' : 'pan', id: hit?.id, ox: sx, oy: sy, sx, sy, moved: false }
    if (hit) {
      const p = hit.position
      drag.ox = (sx - cam.panX) / cam.zoom - p.x
      drag.oy = (sy - cam.panY) / cam.zoom - p.y
    }
  }
  /** @param {PointerEvent} e */
  function onPointerMove(e) {
    if (!canvas) return
    const r = canvas.getBoundingClientRect()
    const sx = e.clientX - r.left, sy = e.clientY - r.top
    if (drag.mode === 'none') {
      const hit = hitNode(sx, sy)
      const id = hit?.id ?? null
      if (id !== hoveredId) { hoveredId = id; canvas.style.cursor = id ? 'pointer' : 'default'; markDirty() }
      return
    }
    if (Math.abs(sx - drag.sx) + Math.abs(sy - drag.sy) > 3) drag.moved = true
    if (drag.mode === 'pan') {
      cam.panX += sx - drag.ox; cam.panY += sy - drag.oy
      drag.ox = sx; drag.oy = sy; markDirty()
    } else if (drag.mode === 'drag' && drag.id) {
      dragPos = { id: drag.id, x: (sx - cam.panX) / cam.zoom - drag.ox, y: (sy - cam.panY) / cam.zoom - drag.oy }
      markDirty()
    }
  }
  /** @param {PointerEvent} e */
  function onPointerUp(e) {
    if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    if (drag.mode === 'drag' && drag.id) {
      if (drag.moved && dragPos) onnodemoved(drag.id, dragPos.x, dragPos.y)
      else onselect(drag.id)
      dragPos = null
    } else if (drag.mode === 'pan' && !drag.moved) {
      onselect(null)
    }
    drag = { mode: 'none', ox: 0, oy: 0, sx: 0, sy: 0, moved: false }
    markDirty()
  }
  /** @param {MouseEvent} e */
  function onDblClick(e) {
    if (!canvas) return
    const r = canvas.getBoundingClientRect()
    const hit = hitNode(e.clientX - r.left, e.clientY - r.top)
    if (hit) onopen(hit.id)
  }
  /** @param {WheelEvent} e */
  function onWheel(e) {
    e.preventDefault()
    if (!canvas) return
    const r = canvas.getBoundingClientRect()
    zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
  }

  // Click the minimap to recenter there.
  /** @param {PointerEvent} e */
  function onMiniDown(e) {
    if (!mini || !miniXf) return
    const r = mini.getBoundingClientRect()
    const wx = (e.clientX - r.left - miniXf.ox) / miniXf.s
    const wy = (e.clientY - r.top - miniXf.oy) / miniXf.s
    cam.panX = cssW / 2 - wx * cam.zoom
    cam.panY = cssH / 2 - wy * cam.zoom
    markDirty()
  }

  // ── Resize ────────────────────────────────────────────────────────────
  /** @type {ResizeObserver|null} */
  let ro = null
  function resize() {
    if (!host || !canvas) return
    dpr = window.devicePixelRatio || 1
    cssW = host.clientWidth; cssH = host.clientHeight
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr)
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px'
    ensureFit()
    markDirty()
  }

  /** @type {MutationObserver|null} */
  let themeObs = null
  onMount(() => {
    ctx = canvas?.getContext('2d') ?? null
    refreshTheme()
    resize()
    ro = new ResizeObserver(resize)
    if (host) ro.observe(host)
    themeObs = new MutationObserver(refreshTheme)
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] })
    // Fit once positions are in (nodes may already be present, or arrive later).
    requestAnimationFrame(ensureFit)
    // Webfonts (Geist) load async; redraw once ready so text isn't stuck on the
    // fallback face.
    document.fonts?.ready?.then(() => markDirty())
  })
  onDestroy(() => {
    ro?.disconnect()
    themeObs?.disconnect()
    if (rafId) cancelAnimationFrame(rafId)
  })
</script>

<div bind:this={host} class="absolute inset-0 overflow-hidden">
  <span bind:this={probe} class="pointer-events-none absolute size-0 opacity-0" aria-hidden="true"></span>

  <canvas
    bind:this={canvas}
    class="block touch-none select-none"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    ondblclick={onDblClick}
    onwheel={onWheel}
  ></canvas>

  <!-- Zoom controls -->
  <div class="absolute left-4 bottom-4 flex flex-col overflow-hidden rounded-lg border border-border/50 bg-panel elevate-2-rim">
    <button type="button" class="flex size-8 items-center justify-center border-b border-border/40 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" onclick={zoomIn} title="Zoom in">
      <Plus class="size-3.5" />
    </button>
    <button type="button" class="flex size-8 items-center justify-center border-b border-border/40 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" onclick={zoomOut} title="Zoom out">
      <Minus class="size-3.5" />
    </button>
    <button type="button" class="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" onclick={() => fit()} title="Fit to view">
      <Maximize class="size-3.5" />
    </button>
  </div>

  <!-- Minimap -->
  {#if nodes.length}
    <canvas
      bind:this={mini}
      class="absolute right-4 bottom-4 cursor-pointer rounded-lg border border-border/50 elevate-2-rim"
      onpointerdown={onMiniDown}
    ></canvas>
  {/if}
</div>
