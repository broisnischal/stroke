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
 *   4. A* per link over (cell, direction) with a turn penalty. Nothing charges a
 *      route for reusing a lane another one took: relationships going the same
 *      way are meant to run together. See the note above TURN_COST.
 *
 * Shared by the canvas renderer and the SVG/PNG export so both draw identical
 * geometry.
 */

/** Clearance kept around every card - the visible gap between card and line. */
export const CLEAR = 22
/**
 * Ports are NOT spread, deliberately.
 *
 * Lines converging on one column used to be fanned apart so they would not all
 * land on the same pixel - first across the whole card, then across the row's
 * own band. Both are the same idea as the anti-overlap penalty above, and wrong
 * for the same reason: ten tables referencing `users.id` are ten lines that mean
 * one thing, and separating their arrivals turned the card's edge into a comb of
 * elbows without telling the reader anything the diagram did not already say.
 *
 * They land on the column they reference, all of them, and the router brings
 * them in along a shared trunk. One line arrives. Which of its tables you are
 * looking at is what selecting a table answers.
 */
/** Straight run off a card before the first turn. Must exceed CLEAR so the stub
 *  ends outside its own clearance band, i.e. on a free grid node. */
export const STUB = 30
/** Corner radius used when stroking a route. */
export const CORNER = 10

/**
 * Lane pitch. Every corridor between two cards is sliced into lanes this far
 * apart, so a route has somewhere to go when it does need to pass another one.
 * Widened automatically if the grid gets too big.
 */
const LANE_PITCH = 26
/** Cost of changing direction, in world units. Keeps routes from staircasing. */
const TURN_COST = 90
/**
 * Routes are NOT charged for sharing a lane, deliberately.
 *
 * There used to be an anti-overlap penalty here on the theory that two
 * relationships drawn on one line cannot be told apart. Measured on a 135-card
 * schema with 164 relationships, it was the single worst thing in the diagram:
 * every line detoured into a free lane rather than run alongside its neighbours,
 * which took the average line from 3.7 corners to 10.6, put 247k pixels of line
 * on a canvas that needs 70k, and made routing take 1.67s instead of 0.21s. What
 * it produced was not separable lines, it was a mesh.
 *
 * Sharing is the right answer at this size, and it is the same thing every tool
 * that draws a whole schema does: relationships going the same way run together
 * as one trunk and split at the ends, where their ports differ. Tracing a single
 * relationship is what selecting its table is for - that lifts its lines into
 * their own band, over the top of everything else.
 *
 * The cliff is sharp. A penalty of 1 already doubles the ink. So there is no
 * constant to tune here, and no per-segment use counters to keep either.
 */
/** Grids larger than this fall back to a direct elbow (pathological schemas). */
const MAX_CELLS = 160_000
/**
 * Above this many cards routing is skipped entirely. It used to be 120 because
 * the router built ONE grid over the whole diagram - O(cards²) cells - which
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
 *   tx: number, ty: number, sdx: number, sdy: number,
 *   tdx: number, tdy: number }} Link
 * `sdx`/`sdy` is the unit direction the line leaves its card in - exactly one of
 * the pair is non-zero. A left or right port is horizontal and keeps the line on
 * the row it means; a top or bottom port is what two cards sitting above each
 * other need, and is chosen only when they overlap in x, where a side port would
 * send the line out and back around.
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

/** Monotonic clock, where there is one. Slicing needs elapsed time, not a date. */
const now = () =>
  typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()

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
    // Both axes for both ends: a port may leave sideways or vertically, so the
    // grid needs a line through the port AND through the stub in each case.
    xv.push(l.sx, l.tx, l.sx + l.sdx * STUB, l.tx + l.tdx * STUB)
    yv.push(l.sy, l.ty, l.sy + l.sdy * STUB, l.ty + l.tdy * STUB)
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
  }
}

/**
 * @typedef {{ states:number, gen:number, gScore:Float32Array, cameFrom:Int32Array,
 *   seen:Int32Array, closed:Int32Array }} Buf
 */

/** A pool of A* scratch buffers, grown to fit the biggest grid a run has seen. */
function newBuf() {
  return {
    states: 0, gen: 0,
    gScore: new Float32Array(0), cameFrom: new Int32Array(0),
    seen: new Int32Array(0), closed: new Int32Array(0),
  }
}

/**
 * Hand back the pool sized for `states`, one generation older.
 *
 * Nothing is cleared: `seen[i] === gen` is what makes a slot's score valid this
 * search, and `closed[i] === gen` what makes it closed. Clearing instead meant
 * three passes over every slot per edge - at the cell budget, two million writes
 * before a single relationship could be drawn, times one per edge. That was the
 * bulk of the freeze on a large schema.
 * @param {Buf} buf @param {number} states
 */
function prepare(buf, states) {
  if (buf.states < states) {
    buf.gScore = new Float32Array(states)
    buf.cameFrom = new Int32Array(states)
    buf.seen = new Int32Array(states)
    buf.closed = new Int32Array(states)
    buf.states = states
    buf.gen = 0
  }
  buf.gen += 1
  return buf
}

/**
 * A* over (cell, incoming direction). Dirs: 0 = +x, 1 = -x, 2 = +y, 3 = -y.
 * @param {ReturnType<typeof buildGrid>} g
 * @param {Buf} buf pooled scratch, stamped rather than cleared
 * @param {number} six @param {number} siy @param {number} tix @param {number} tiy
 */
function search(g, buf, six, siy, tix, tiy) {
  if (!g) return null
  const { xs, ys, nx, ny, hFree, vFree } = g
  const { gScore, cameFrom, seen, closed } = prepare(buf, nx * ny * 4)
  const gen = buf.gen
  const open = heap()

  const cellOf = (/** @type {number} */ ix, /** @type {number} */ iy) => iy * nx + ix
  const h = (/** @type {number} */ ix, /** @type {number} */ iy) =>
    Math.abs(xs[ix] - xs[tix]) + Math.abs(ys[iy] - ys[tiy])

  const startCell = cellOf(six, siy)
  const goalCell = cellOf(tix, tiy)
  for (let d = 0; d < 4; d++) {
    const s = startCell * 4 + d
    gScore[s] = 0
    seen[s] = gen
    cameFrom[s] = -1
    open.push(h(six, siy), s)
  }

  let bestGoal = -1
  while (open.size) {
    const cur = open.pop()
    if (closed[cur] === gen) continue
    closed[cur] = gen
    const cell = cur >> 2
    if (cell === goalCell) { bestGoal = cur; break }
    const ix = cell % nx, iy = (cell - (cell % nx)) / nx
    const dir = cur & 3
    for (let nd = 0; nd < 4; nd++) {
      let jx = ix, jy = iy, step = 0, freeIdx = -1, horizontal = false
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
      const turn = nd === dir ? 0 : TURN_COST
      const next = cellOf(jx, jy) * 4 + nd
      const cost = gScore[cur] + step + turn
      if (seen[next] === gen && cost >= gScore[next]) continue
      seen[next] = gen
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
 * The endpoints' own cards are exempt - the last stub lands on their edge by
 * definition. Checked against the raw card rects, so a line legitimately running
 * through the clearance band is not thrown away.
 *
 * Cards are rejected against the route's bounding box first. The check used to
 * run every card against every segment - on a big diagram that is the whole
 * schema tested twenty times over, per edge, and almost every one of those tests
 * is a card nowhere near the line.
 * @param {Pt[]} pts @param {Rect[]} cards @param {string} from @param {string} to
 */
function clearOfCards(pts, cards, from, to) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of pts) {
    if (p.x < x0) x0 = p.x
    if (p.x > x1) x1 = p.x
    if (p.y < y0) y0 = p.y
    if (p.y > y1) y1 = p.y
  }
  for (const r of cards) {
    if (r.id === from || r.id === to) continue
    if (r.x1 <= x0 || r.x0 >= x1 || r.y1 <= y0 || r.y0 >= y1) continue
    for (let i = 1; i < pts.length; i++) {
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
 * @param {Buf} buf
 */
function routeOne(l, obs, cards, pad, buf) {
  const x0 = Math.min(l.sx, l.tx) - pad, x1 = Math.max(l.sx, l.tx) + pad
  const y0 = Math.min(l.sy, l.ty) - pad, y1 = Math.max(l.sy, l.ty) + pad
  const near = obs.filter(
    (r) => r.x1 > x0 && r.x0 < x1 && r.y1 > y0 && r.y0 < y1,
  )
  const grid = buildGrid(near, [l])
  if (!grid) return null
  const path = search(
    grid,
    buf,
    indexOf(grid.xs, Math.round(l.sx + l.sdx * STUB)),
    indexOf(grid.ys, Math.round(l.sy + l.sdy * STUB)),
    indexOf(grid.xs, Math.round(l.tx + l.tdx * STUB)),
    indexOf(grid.ys, Math.round(l.ty + l.tdy * STUB)),
  )
  if (!path) return null
  const pts = tidy([{ x: l.sx, y: l.sy }, ...path, { x: l.tx, y: l.ty }])
  return clearOfCards(pts, cards, l.source, l.target) ? pts : null
}

/**
 * A routing run you can spend time on in slices.
 *
 * Routing a whole schema is seconds of A*, and doing it in one synchronous call
 * is what froze the window: no frame could be painted until the last edge was
 * placed. The run keeps its grid, its lane usage and its scratch buffers, and
 * `step(budgetMs)` routes as many links as fit in that budget. Everything not
 * routed yet simply has no entry, which the renderer already draws as a plain
 * elbow - so lines appear immediately and sharpen into routed ones as the work
 * lands.
 * @param {Box[]} boxes @param {Link[]} links
 */
export function createRouteRun(boxes, links) {
  /** @type {Map<string, Pt[]>} */
  const out = new Map()
  const buf = newBuf()

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

  const empty = !boxes.length || !links.length
  const grid = empty ? null : buildGrid(obs, links)

  // Short links first: they have the fewest lane choices, so let them claim the
  // obvious corridor before the long ones start detouring.
  const order = empty
    ? []
    : grid
      ? links
          .map((l, i) => ({ l, i, d: Math.abs(l.tx - l.sx) + Math.abs(l.ty - l.sy) }))
          .sort((a, b) => a.d - b.d || a.i - b.i)
          .map(({ l }) => l)
      : links.slice()

  /** Own grid, tight lanes, cards near this link only. @param {Link} l */
  const alone = (l) =>
    routeOne(l, obs, cards, WINDOW_PAD, buf) ?? routeOne(l, obs, cards, WINDOW_PAD * 3, buf)

  /** @param {Link} l */
  function place(l) {
    if (!grid) {
      const pts = alone(l)
      if (pts) out.set(l.id, pts)
      return
    }
    const six = indexOf(grid.xs, Math.round(l.sx + l.sdx * STUB))
    const siy = indexOf(grid.ys, Math.round(l.sy + l.sdy * STUB))
    const tix = indexOf(grid.xs, Math.round(l.tx + l.tdx * STUB))
    const tiy = indexOf(grid.ys, Math.round(l.ty + l.tdy * STUB))
    if (six < 0 || siy < 0 || tix < 0 || tiy < 0) return
    const path = search(grid, buf, six, siy, tix, tiy)
    const pts = path ? tidy([{ x: l.sx, y: l.sy }, ...path, { x: l.tx, y: l.ty }]) : null
    // The global grid coarsens its lanes to fit the cell budget, which can leave
    // a link with no clean route through it. Give that link its own tight grid
    // rather than handing the renderer a line through a card.
    const clean = pts && clearOfCards(pts, cards, l.source, l.target) ? pts : alone(l)
    if (clean) out.set(l.id, clean)
  }

  let i = 0
  return {
    /** Routes placed so far. The same Map throughout - it grows as steps run. */
    routes: out,
    get done() { return i >= order.length },
    get placed() { return i },
    get total() { return order.length },
    /**
     * Route until the budget runs out. Always places at least one link, so a
     * budget too small to fit an edge still makes progress instead of spinning.
     * @param {number} [budgetMs] @returns {boolean} true once every link is placed
     */
    step(budgetMs = Infinity) {
      const deadline = Number.isFinite(budgetMs) ? now() + budgetMs : Infinity
      while (i < order.length) {
        place(order[i])
        i += 1
        if (now() >= deadline) break
      }
      return i >= order.length
    },
  }
}

/**
 * Route every link around the given cards, in one go.
 * @param {Box[]} boxes
 * @param {Link[]} links
 * @returns {Map<string, Pt[]>} link id → polyline (missing entry = no clear route)
 */
export function routeEdges(boxes, links) {
  const run = createRouteRun(boxes, links)
  run.step()
  return run.routes
}

/**
 * The line a layout already decided on, drawn as right angles.
 *
 * A ranked layout (Dagre, Graphviz) routes every edge through dummy nodes it
 * reserved space for while placing the cards, so the polyline it hands back is
 * guaranteed to miss every card - a promise no router applied afterwards can
 * make, because by then the space is already taken.
 *
 * Joining those points with straight segments is the obvious reading and the
 * wrong one: in a left-to-right layout they sit at different heights, so every
 * relationship came out as a long diagonal, and a canvas of crossing diagonals
 * is unreadable however it is stroked. This walks the same points but only ever
 * moves along one axis at a time. Horizontal runs stay on the lane the layout
 * reserved for that edge; the turn between two lanes is taken midway between
 * their points, which in a ranked layout is the gutter between two ranks. So
 * every segment still lies in space the layout kept clear - which is what stops
 * a line vanishing under a card - and the result is the right-angled connector
 * an ER diagram is meant to have.
 *
 * @param {{sx:number,sy:number,tx:number,ty:number,sdx:number,sdy:number,tdx:number,tdy:number}} port
 * @param {Pt[]} [corridor] interior points from the layout, ends included
 * Lines converging on one card all turn in the same gutter, and they are meant
 * to: their verticals coincide into a single trunk that splits at the ends where
 * their ports differ. Spreading them into a column each was tried and measured
 * against - see the note above TURN_COST.
 *
 * @returns {Pt[]}
 */
export function corridorPathOrtho(port, corridor) {
  /** @type {Pt[]} */
  const pts = [
    { x: port.sx, y: port.sy },
    { x: port.sx + port.sdx * STUB, y: port.sy + port.sdy * STUB },
  ]
  /** @type {Pt[]} */
  const via = []
  if (corridor) for (let i = 1; i < corridor.length - 1; i++) via.push(corridor[i])
  // The stub in front of the target port is the last waypoint: the run into the
  // card is then always square to its edge, which is where the marker sits.
  via.push({ x: port.tx + port.tdx * STUB, y: port.ty + port.tdy * STUB })

  for (const p of via) {
    const a = pts[pts.length - 1]
    const sameY = Math.abs(p.y - a.y) < 0.5
    const sameX = Math.abs(p.x - a.x) < 0.5
    if (sameY) { pts.push({ x: p.x, y: a.y }); continue }
    if (sameX) { pts.push({ x: a.x, y: p.y }); continue }
    // Halfway between the two waypoints, which in a ranked layout is the gutter
    // between their ranks - so the vertical run lands in space the layout kept
    // clear rather than on a card.
    const mx = (a.x + p.x) / 2
    // The waypoint itself closes the pair. Leaving it out was invisible while
    // every port was on a card's side - the run into the port shared its y, so
    // the last leg was flat either way - and drew a diagonal the moment a port
    // sat on a horizontal edge instead. `tidy` drops it again where it is
    // collinear, so the side-port paths are unchanged.
    pts.push({ x: mx, y: a.y }, { x: mx, y: p.y }, p)
  }
  pts.push({ x: port.tx, y: port.ty })
  return tidy(pts)
}

/**
 * Does a routed line pass through `rect`, grown by `pad`?
 *
 * Segment by segment, not by the line's bounding box: a line that goes around a
 * card has a box covering it, and answering from the box would throw away every
 * route near anything that moved.
 *
 * @param {Pt[]} pts @param {Box} rect @param {number} [pad]
 */
export function pathHitsRect(pts, rect, pad = CLEAR) {
  const x0 = rect.x - pad, y0 = rect.y - pad
  const x1 = rect.x + rect.w + pad, y1 = rect.y + rect.h + pad
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    if (Math.max(a.x, b.x) <= x0 || Math.min(a.x, b.x) >= x1) continue
    if (Math.max(a.y, b.y) <= y0 || Math.min(a.y, b.y) >= y1) continue
    return true
  }
  return false
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
