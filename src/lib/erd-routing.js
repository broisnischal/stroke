/**
 * Obstacle-aware orthogonal edge router for the ER diagram.
 *
 * Cards are obstacles, not decoration: a relationship line must never cross a
 * table, and it must keep a visible gap from every card it passes. Routing is a
 * shortest-path search, not a heuristic guess, so a route either avoids every
 * card or the router reports failure - it never "gives up into" a card.
 *
 * How it works:
 *   1. Inflate every card by CLEAR. That band is the gap the user sees.
 *   2. Build a sparse grid (Hanan grid) from the inflated card edges, the port
 *      stubs, and the mid-line of every wide corridor between them.
 *   3. Mark each grid segment free/blocked once per layout.
 *   4. A* per link over (cell, direction) with a turn penalty, plus a small
 *      penalty for segments other routes already used, so parallel lines fan out
 *      into neighbouring lanes instead of stacking on top of each other.
 *
 * Shared by the canvas renderer and the SVG/PNG export so both draw identical
 * geometry.
 */

/** Clearance kept around every card - the visible gap between card and line. */
export const CLEAR = 22
/** Straight run off a card before the first turn. Must exceed CLEAR so the stub
 *  ends outside its own clearance band, i.e. on a free grid node. */
export const STUB = 30
/** Corner radius used when stroking a route. */
export const CORNER = 10

/**
 * Lane pitch. Every corridor between two cards is sliced into lanes this far
 * apart, so N relationships crossing the same corridor each get their own line
 * instead of piling onto one. Widened automatically if the grid gets too big.
 */
const LANE_PITCH = 26
/** Cost of changing direction, in world units. Keeps routes from staircasing. */
const TURN_COST = 90
/**
 * Anti-overlap: a segment another route already occupies is expensive, so routes
 * spread across neighbouring lanes rather than stacking. Overlap is what makes a
 * diagram unreadable - two relationships on one line cannot be told apart.
 */
const SHARE_COST = 46
/** Grids larger than this fall back to a direct elbow (pathological schemas). */
const MAX_CELLS = 160_000
/**
 * Above this many cards routing is skipped entirely. It used to be 120 because
 * the router built ONE grid over the whole diagram — O(cards²) cells — which
 * blew the cell budget at around a hundred tables, returned nothing, and left
 * every relationship drawn as a direct elbow straight through the cards in its
 * way. Edges are now routed against only the cards near them, so the cost no
 * longer depends on how big the rest of the diagram is.
 */
export const MAX_ROUTED_NODES = 600

/**
 * How far past a link's own endpoints to look for cards when routing it alone.
 * Wide enough that the detour room around a card is inside the window, including
 * the ring the grid adds beyond the outermost obstacle.
 */
const WINDOW_PAD = STUB * 3 + CLEAR

/**
 * @typedef {{ id: string, x0: number, y0: number, x1: number, y1: number }} Rect
 * @typedef {{ x: number, y: number }} Pt
 * @typedef {{ id: string, x: number, y: number, w: number, h: number }} Box
 * @typedef {{ id: string, source: string, target: string, sx: number, sy: number,
 *   tx: number, ty: number, sdir: number, tdir: number }} Link
 */

/**
 * Turn a set of card boundaries into a routing axis: every boundary, plus evenly
 * spaced lanes across each corridor between them. The lane count is what decides
 * how many relationships can cross a corridor without sharing a line.
 * @param {number[]} values @param {number} pitch
 */
function axis(values, pitch) {
  const uniq = [...new Set(values.map(v => Math.round(v)))].sort((a, b) => a - b)
  /** @type {number[]} */
  const out = []
  for (let i = 0; i < uniq.length; i++) {
    out.push(uniq[i])
    if (i + 1 >= uniq.length) break
    const gap = uniq[i + 1] - uniq[i]
    const lanes = Math.floor(gap / pitch) - 1
    if (lanes < 1) continue
    const step = gap / (lanes + 1)
    for (let k = 1; k <= lanes; k++) out.push(Math.round(uniq[i] + step * k))
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

/** Index of `v` in a sorted array, or -1. @param {number[]} arr @param {number} v */
function indexOf(arr, v) {
  const target = Math.round(v)
  let lo = 0, hi = arr.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] === target) return mid
    if (arr[mid] < target) lo = mid + 1
    else hi = mid - 1
  }
  return -1
}

/** Minimal binary heap over [priority, value] pairs. */
function heap() {
  /** @type {number[]} */
  const pri = []
  /** @type {number[]} */
  const val = []
  return {
    get size() { return pri.length },
    /** @param {number} p @param {number} v */
    push(p, v) {
      pri.push(p); val.push(v)
      let i = pri.length - 1
      while (i > 0) {
        const parent = (i - 1) >> 1
        if (pri[parent] <= pri[i]) break
        ;[pri[parent], pri[i]] = [pri[i], pri[parent]]
        ;[val[parent], val[i]] = [val[i], val[parent]]
        i = parent
      }
    },
    pop() {
      const top = val[0]
      const lastP = pri.pop(), lastV = val.pop()
      if (pri.length && lastP !== undefined && lastV !== undefined) {
        pri[0] = lastP; val[0] = lastV
        let i = 0
        for (;;) {
          const l = i * 2 + 1, r = l + 1
          let m = i
          if (l < pri.length && pri[l] < pri[m]) m = l
          if (r < pri.length && pri[r] < pri[m]) m = r
          if (m === i) break
          ;[pri[m], pri[i]] = [pri[i], pri[m]]
          ;[val[m], val[i]] = [val[i], val[m]]
          i = m
        }
      }
      return top
    },
  }
}

/**
 * Grid of free/blocked segments plus the usage counters that keep parallel
 * routes apart.
 * @param {Rect[]} obs @param {Link[]} links
 */
function buildGrid(obs, links) {
  /** @type {number[]} */
  const xv = []
  /** @type {number[]} */
  const yv = []
  for (const r of obs) { xv.push(r.x0, r.x1); yv.push(r.y0, r.y1) }
  for (const l of links) {
    xv.push(l.sx + l.sdir * STUB, l.tx + l.tdir * STUB)
    yv.push(l.sy, l.ty)
  }
  if (!xv.length || !yv.length) return null
  // A ring outside everything, so a route can always go around the whole graph.
  const pad = STUB * 2
  xv.push(Math.min(...xv) - pad, Math.max(...xv) + pad)
  yv.push(Math.min(...yv) - pad, Math.max(...yv) + pad)

  // Start at the tightest lane pitch and back off until the grid fits the budget,
  // so a small diagram gets many lanes and a huge one still routes.
  let xs = [], ys = [], nx = 0, ny = 0
  for (let pitch = LANE_PITCH; pitch <= LANE_PITCH * 8; pitch *= 2) {
    xs = axis(xv, pitch)
    ys = axis(yv, pitch)
    nx = xs.length; ny = ys.length
    if (nx * ny <= MAX_CELLS) break
    xs = []
  }
  if (!xs.length) return null

  // hFree[iy * (nx-1) + ix]: segment xs[ix]→xs[ix+1] at ys[iy]
  const hFree = new Uint8Array(Math.max(0, (nx - 1) * ny)).fill(1)
  // vFree[ix * (ny-1) + iy]: segment ys[iy]→ys[iy+1] at xs[ix]
  const vFree = new Uint8Array(Math.max(0, nx * (ny - 1))).fill(1)

  for (const r of obs) {
    // Rows strictly inside the card's band cannot carry a horizontal run.
    for (let iy = 0; iy < ny; iy++) {
      if (ys[iy] <= r.y0 || ys[iy] >= r.y1) continue
      for (let ix = 0; ix < nx - 1; ix++) {
        if (xs[ix + 1] <= r.x0 || xs[ix] >= r.x1) continue
        hFree[iy * (nx - 1) + ix] = 0
      }
    }
    // Columns strictly inside the card's band cannot carry a vertical run.
    for (let ix = 0; ix < nx; ix++) {
      if (xs[ix] <= r.x0 || xs[ix] >= r.x1) continue
      for (let iy = 0; iy < ny - 1; iy++) {
        if (ys[iy + 1] <= r.y0 || ys[iy] >= r.y1) continue
        vFree[ix * (ny - 1) + iy] = 0
      }
    }
  }

  return {
    xs, ys, nx, ny, hFree, vFree,
    hUse: new Uint16Array(hFree.length),
    vUse: new Uint16Array(vFree.length),
  }
}

/**
 * A* over (cell, incoming direction). Dirs: 0 = +x, 1 = -x, 2 = +y, 3 = -y.
 * Buffers are owned by the caller and reset here - a big schema would otherwise
 * allocate megabytes per edge.
 * @param {ReturnType<typeof buildGrid>} g
 * @param {{gScore:Float32Array, cameFrom:Int32Array, closed:Uint8Array}} buf
 * @param {number} six @param {number} siy @param {number} tix @param {number} tiy
 */
function search(g, buf, six, siy, tix, tiy) {
  if (!g) return null
  const { xs, ys, nx, ny, hFree, vFree, hUse, vUse } = g
  const { gScore, cameFrom, closed } = buf
  gScore.fill(Infinity)
  cameFrom.fill(-1)
  closed.fill(0)
  const open = heap()

  const cellOf = (/** @type {number} */ ix, /** @type {number} */ iy) => iy * nx + ix
  const h = (/** @type {number} */ ix, /** @type {number} */ iy) =>
    Math.abs(xs[ix] - xs[tix]) + Math.abs(ys[iy] - ys[tiy])

  const startCell = cellOf(six, siy)
  const goalCell = cellOf(tix, tiy)
  for (let d = 0; d < 4; d++) {
    const s = startCell * 4 + d
    gScore[s] = 0
    open.push(h(six, siy), s)
  }

  let bestGoal = -1
  while (open.size) {
    const cur = open.pop()
    if (closed[cur]) continue
    closed[cur] = 1
    const cell = cur >> 2
    if (cell === goalCell) { bestGoal = cur; break }
    const ix = cell % nx, iy = (cell - (cell % nx)) / nx
    const dir = cur & 3
    for (let nd = 0; nd < 4; nd++) {
      let jx = ix, jy = iy, step = 0, freeIdx = -1, useIdx = -1, horizontal = false
      if (nd === 0) {
        if (ix + 1 >= nx) continue
        freeIdx = iy * (nx - 1) + ix; horizontal = true
        step = xs[ix + 1] - xs[ix]; jx = ix + 1
      } else if (nd === 1) {
        if (ix - 1 < 0) continue
        freeIdx = iy * (nx - 1) + (ix - 1); horizontal = true
        step = xs[ix] - xs[ix - 1]; jx = ix - 1
      } else if (nd === 2) {
        if (iy + 1 >= ny) continue
        freeIdx = ix * (ny - 1) + iy
        step = ys[iy + 1] - ys[iy]; jy = iy + 1
      } else {
        if (iy - 1 < 0) continue
        freeIdx = ix * (ny - 1) + (iy - 1)
        step = ys[iy] - ys[iy - 1]; jy = iy - 1
      }
      if ((horizontal ? hFree[freeIdx] : vFree[freeIdx]) === 0) continue
      useIdx = freeIdx
      // Push off lanes other routes already took, so lines stay separable.
      const shared = (horizontal ? hUse[useIdx] : vUse[useIdx]) * SHARE_COST
      const turn = nd === dir ? 0 : TURN_COST
      const next = cellOf(jx, jy) * 4 + nd
      const cost = gScore[cur] + step + turn + shared
      if (cost >= gScore[next]) continue
      gScore[next] = cost
      cameFrom[next] = cur
      open.push(cost + h(jx, jy), next)
    }
  }
  if (bestGoal < 0) return null

  /** @type {Pt[]} */
  const pts = []
  for (let s = bestGoal; s >= 0; s = cameFrom[s]) {
    const cell = s >> 2
    const ix = cell % nx, iy = (cell - (cell % nx)) / nx
    pts.push({ x: xs[ix], y: ys[iy] })
    // Charge the segment we arrived on, so the next route prefers another lane.
    const prev = cameFrom[s]
    if (prev >= 0) {
      const pcell = prev >> 2
      const pix = pcell % nx, piy = (pcell - (pcell % nx)) / nx
      if (piy === iy) hUse[iy * (nx - 1) + Math.min(ix, pix)]++
      else vUse[ix * (ny - 1) + Math.min(iy, piy)]++
    }
  }
  pts.reverse()
  return pts
}

/** Drop duplicate and collinear points so corner rounding behaves. @param {Pt[]} pts */
function tidy(pts) {
  /** @type {Pt[]} */
  const out = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue
    out.push(p)
  }
  for (let i = 1; i < out.length - 1; ) {
    const a = out[i - 1], b = out[i], d = out[i + 1]
    const flatX = Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - d.x) < 0.5
    const flatY = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - d.y) < 0.5
    if (flatX || flatY) out.splice(i, 1)
    else i++
  }
  return out
}

/** True when segment a→b passes through rect r. Touching an edge is allowed. */
function hits(/** @type {Pt} */ a, /** @type {Pt} */ b, /** @type {Rect} */ r) {
  if (a.y === b.y) {
    if (a.y <= r.y0 || a.y >= r.y1) return false
    const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x)
    return hi > r.x0 && lo < r.x1
  }
  if (a.x <= r.x0 || a.x >= r.x1) return false
  const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y)
  return hi > r.y0 && lo < r.y1
}

/**
 * The promise this module makes: a route crosses no card, or there is no route.
 * The endpoints' own cards are exempt — the last stub lands on their edge by
 * definition. Checked against the raw card rects, so a line legitimately running
 * through the clearance band is not thrown away.
 * @param {Pt[]} pts @param {Rect[]} cards @param {string} from @param {string} to
 */
function clearOfCards(pts, cards, from, to) {
  for (let i = 1; i < pts.length; i++) {
    for (const r of cards) {
      if (r.id === from || r.id === to) continue
      if (hits(pts[i - 1], pts[i], r)) return false
    }
  }
  return true
}

/**
 * Route one link on its own small grid, built from the cards near it.
 *
 * This is what makes a hundred-table diagram routable: the search space is set
 * by the link's own neighbourhood, not by the size of the schema, so the lane
 * pitch stays tight instead of being coarsened until the grid fits a budget.
 * @param {Link} l @param {Rect[]} obs @param {Rect[]} cards @param {number} pad
 */
function routeOne(l, obs, cards, pad) {
  const x0 = Math.min(l.sx, l.tx) - pad, x1 = Math.max(l.sx, l.tx) + pad
  const y0 = Math.min(l.sy, l.ty) - pad, y1 = Math.max(l.sy, l.ty) + pad
  const near = obs.filter(
    (r) => r.x1 > x0 && r.x0 < x1 && r.y1 > y0 && r.y0 < y1,
  )
  const grid = buildGrid(near, [l])
  if (!grid) return null
  const states = grid.nx * grid.ny * 4
  const path = search(
    grid,
    {
      gScore: new Float32Array(states),
      cameFrom: new Int32Array(states),
      closed: new Uint8Array(states),
    },
    indexOf(grid.xs, Math.round(l.sx + l.sdir * STUB)),
    indexOf(grid.ys, Math.round(l.sy)),
    indexOf(grid.xs, Math.round(l.tx + l.tdir * STUB)),
    indexOf(grid.ys, Math.round(l.ty)),
  )
  if (!path) return null
  const pts = tidy([{ x: l.sx, y: l.sy }, ...path, { x: l.tx, y: l.ty }])
  return clearOfCards(pts, cards, l.source, l.target) ? pts : null
}

/**
 * Route every link around the given cards.
 * @param {Box[]} boxes
 * @param {Link[]} links
 * @returns {Map<string, Pt[]>} link id → polyline (missing entry = no clear route)
 */
export function routeEdges(boxes, links) {
  /** @type {Map<string, Pt[]>} */
  const out = new Map()
  if (!boxes.length || !links.length) return out

  /** @type {Rect[]} */
  const obs = boxes.map(b => ({
    id: b.id,
    x0: Math.round(b.x - CLEAR),
    y0: Math.round(b.y - CLEAR),
    x1: Math.round(b.x + b.w + CLEAR),
    y1: Math.round(b.y + b.h + CLEAR),
  }))
  /** Raw card rects, for the final "does this cross anything" check. */
  const cards = boxes.map((b) => ({ id: b.id, x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h }))

  const grid = buildGrid(obs, links)
  if (!grid) {
    // No global grid (too many cards for one): route each link on its own.
    for (const l of links) {
      const pts = routeOne(l, obs, cards, WINDOW_PAD) ?? routeOne(l, obs, cards, WINDOW_PAD * 3)
      if (pts) out.set(l.id, pts)
    }
    return out
  }
  const states = grid.nx * grid.ny * 4
  const buf = {
    gScore: new Float32Array(states),
    cameFrom: new Int32Array(states),
    closed: new Uint8Array(states),
  }

  // Short links first: they have the fewest lane choices, so let them claim the
  // obvious corridor before the long ones start detouring.
  const order = links
    .map((l, i) => ({ l, i, d: Math.abs(l.tx - l.sx) + Math.abs(l.ty - l.sy) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)

  for (const { l } of order) {
    const ax = Math.round(l.sx + l.sdir * STUB)
    const bx = Math.round(l.tx + l.tdir * STUB)
    const six = indexOf(grid.xs, ax), siy = indexOf(grid.ys, l.sy)
    const tix = indexOf(grid.xs, bx), tiy = indexOf(grid.ys, l.ty)
    if (six < 0 || siy < 0 || tix < 0 || tiy < 0) continue
    const path = search(grid, buf, six, siy, tix, tiy)
    const pts = path ? tidy([{ x: l.sx, y: l.sy }, ...path, { x: l.tx, y: l.ty }]) : null
    // The global grid coarsens its lanes to fit the cell budget, which can leave
    // a link with no clean route through it. Give that link its own tight grid
    // rather than handing the renderer a line through a card.
    const clean =
      pts && clearOfCards(pts, cards, l.source, l.target)
        ? pts
        : routeOne(l, obs, cards, WINDOW_PAD) ?? routeOne(l, obs, cards, WINDOW_PAD * 3)
    if (clean) out.set(l.id, clean)
  }
  return out
}

/**
 * SVG path data for a route, with rounded corners.
 * @param {Pt[]} pts
 */
export function routeToSvgPath(pts) {
  if (pts.length < 2) return ''
  let d = `M${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], n = pts[i + 1]
    const inLen = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
    const outLen = Math.abs(n.x - b.x) + Math.abs(n.y - b.y)
    const r = Math.max(0, Math.min(CORNER, inLen / 2, outLen / 2))
    const si = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) }
    const so = { x: Math.sign(n.x - b.x), y: Math.sign(n.y - b.y) }
    d += ` L${b.x - si.x * r} ${b.y - si.y * r}`
    d += ` Q${b.x} ${b.y} ${b.x + so.x * r} ${b.y + so.y * r}`
  }
  const last = pts[pts.length - 1]
  d += ` L${last.x} ${last.y}`
  return d
}
