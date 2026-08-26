import { describe, it, expect } from 'vitest'
import { routeEdges, corridorPathOrtho, createRouteRun, routeToSvgPath, pathHitsRect, CLEAR, STUB } from './erd-routing.js'

/**
 * A route is legal when every segment is axis-aligned and no segment passes
 * through a card other than the two it connects.
 * @param {{x:number,y:number}[]} pts
 * @param {{id:string,x:number,y:number,w:number,h:number}[]} boxes
 * @param {string} source @param {string} target
 */
function assertClear(pts, boxes, source, target) {
  expect(pts.length).toBeGreaterThanOrEqual(2)
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const axisAligned = Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5
    expect(axisAligned, `segment ${i} is diagonal`).toBe(true)
    for (const box of boxes) {
      if (box.id === source || box.id === target) continue
      // Inflate by a hair less than CLEAR: the router is allowed to hug the
      // clearance band, just never enter the card itself.
      const x0 = box.x - 1, y0 = box.y - 1, x1 = box.x + box.w + 1, y1 = box.y + box.h + 1
      const sx0 = Math.min(a.x, b.x), sx1 = Math.max(a.x, b.x)
      const sy0 = Math.min(a.y, b.y), sy1 = Math.max(a.y, b.y)
      const overlaps = sx1 > x0 && sx0 < x1 && sy1 > y0 && sy0 < y1
      expect(overlaps, `segment ${i} crosses ${box.id}`).toBe(false)
    }
  }
}

describe('routeEdges', () => {
  it('runs straight when both ports share a row and nothing is between', () => {
    const boxes = [
      { id: 'a', x: 0, y: 0, w: 200, h: 100 },
      { id: 'b', x: 500, y: 0, w: 200, h: 100 },
    ]
    const links = [
      { id: 'e', source: 'a', target: 'b', sx: 200, sy: 50, tx: 500, ty: 50, sdx: 1, sdy: 0, tdx: -1, tdy: 0 },
    ]
    const pts = routeEdges(boxes, links).get('e')
    expect(pts).toEqual([{ x: 200, y: 50 }, { x: 500, y: 50 }])
  })

  it('routes around a card sitting directly in the way', () => {
    const boxes = [
      { id: 'a', x: 0, y: 0, w: 200, h: 100 },
      { id: 'blocker', x: 300, y: 0, w: 200, h: 100 },
      { id: 'b', x: 700, y: 0, w: 200, h: 100 },
    ]
    const links = [
      { id: 'e', source: 'a', target: 'b', sx: 200, sy: 50, tx: 700, ty: 50, sdx: 1, sdy: 0, tdx: -1, tdy: 0 },
    ]
    const pts = routeEdges(boxes, links).get('e')
    expect(pts).toBeTruthy()
    if (!pts) return
    assertClear(pts, boxes, 'a', 'b')
    // It has to leave the row to get past the blocker.
    expect(pts.some(p => Math.abs(p.y - 50) > 1)).toBe(true)
  })

  it('drops the vertical leg into the gap between two ranks', () => {
    const boxes = [
      { id: 'a', x: 0, y: 0, w: 200, h: 300 },
      { id: 'b', x: 600, y: 500, w: 200, h: 300 },
    ]
    const links = [
      { id: 'e', source: 'a', target: 'b', sx: 200, sy: 80, tx: 600, ty: 620, sdx: 1, sdy: 0, tdx: -1, tdy: 0 },
    ]
    const pts = routeEdges(boxes, links).get('e')
    expect(pts).toBeTruthy()
    if (!pts) return
    assertClear(pts, boxes, 'a', 'b')
    const vertical = pts.find((p, i) => i > 0 && Math.abs(pts[i - 1].x - p.x) < 0.5)
    expect(vertical).toBeTruthy()
    if (vertical) {
      expect(vertical.x).toBeGreaterThan(200 + STUB - 1)
      expect(vertical.x).toBeLessThan(600 - STUB + 1)
    }
  })

  it('keeps every route clear in a hub fan-out', () => {
    /** @type {{id:string,x:number,y:number,w:number,h:number}[]} */
    const boxes = [{ id: 'hub', x: 0, y: 900, w: 260, h: 400 }]
    /** @type {import('./erd-routing.js').Link[]} */
    const links = []
    for (let i = 0; i < 12; i++) {
      const col = i % 3
      const row = Math.floor(i / 3)
      const id = `t${i}`
      const x = 600 + col * 400
      const y = row * 600
      boxes.push({ id, x, y, w: 260, h: 300 })
      links.push({
        id: `e${i}`, source: 'hub', target: id,
        sx: 260, sy: 950 + i * 20, tx: x, ty: y + 60, sdx: 1, sdy: 0, tdx: -1, tdy: 0,
      })
    }
    const routed = routeEdges(boxes, links)
    for (const l of links) {
      const pts = routed.get(l.id)
      expect(pts, `no route for ${l.id}`).toBeTruthy()
      if (pts) assertClear(pts, boxes, l.source, l.target)
    }
  })

  it('routes every link in a dense multi-rank grid without crossing a card', () => {
    // Shaped like the real Dagre output: tall cards packed into ranks, with long
    // edges that span several ranks. This is the case a lane-scan router fails.
    /** @type {{id:string,x:number,y:number,w:number,h:number}[]} */
    const boxes = []
    for (let rank = 0; rank < 6; rank++) {
      for (let row = 0; row < 4; row++) {
        boxes.push({
          id: `r${rank}c${row}`,
          x: rank * (268 + 320),
          y: row * (700 + 84),
          w: 268,
          h: 700,
        })
      }
    }
    /** @type {import('./erd-routing.js').Link[]} */
    const links = []
    let n = 0
    for (let rank = 0; rank < 5; rank++) {
      for (let row = 0; row < 4; row++) {
        // Fan each card to two cards two ranks ahead - deliberately long runs.
        for (const target of [(row + 1) % 4, (row + 3) % 4]) {
          const s = boxes.find(b => b.id === `r${rank}c${row}`)
          const t = boxes.find(b => b.id === `r${Math.min(rank + 2, 5)}c${target}`)
          if (!s || !t || s.id === t.id) continue
          links.push({
            id: `e${n++}`, source: s.id, target: t.id,
            sx: s.x + s.w, sy: s.y + 60 + (n % 8) * 28,
            tx: t.x, ty: t.y + 40 + (n % 5) * 28,
            sdx: 1, sdy: 0, tdx: -1, tdy: 0,
          })
        }
      }
    }
    const routed = routeEdges(boxes, links)
    expect(routed.size).toBe(links.length)
    for (const l of links) {
      const pts = routed.get(l.id)
      expect(pts, `no route for ${l.id}`).toBeTruthy()
      if (pts) assertClear(pts, boxes, l.source, l.target)
    }
  })

  it('never returns a route that enters a card, even when boxed in', () => {
    // Target fully walled off horizontally and vertically: the router must give
    // up rather than draw through a card.
    const boxes = [
      { id: 'a', x: 0, y: 0, w: 100, h: 100 },
      { id: 'wall', x: 100 + CLEAR, y: -400, w: 40, h: 1000 },
      { id: 'b', x: 300, y: 0, w: 100, h: 100 },
    ]
    const links = [
      { id: 'e', source: 'a', target: 'b', sx: 100, sy: 50, tx: 300, ty: 50, sdx: 1, sdy: 0, tdx: -1, tdy: 0 },
    ]
    const pts = routeEdges(boxes, links).get('e')
    if (pts) assertClear(pts, boxes, 'a', 'b')
  })
})

describe('routeEdges at diagram scale', () => {
  /** A grid of cards, the shape a 100-table schema actually lays out in. */
  function bigDiagram(cols = 10, rows = 10, w = 220, h = 260, gapX = 120, gapY = 140) {
    const boxes = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        boxes.push({ id: `t${r}_${c}`, x: c * (w + gapX), y: r * (h + gapY), w, h })
      }
    }
    return boxes
  }

  /** Does segment a→b pass through the interior of a card? */
  function crosses(a, b, box) {
    const x0 = box.x, y0 = box.y, x1 = box.x + box.w, y1 = box.y + box.h
    if (a.y === b.y) {
      if (a.y <= y0 || a.y >= y1) return false
      return Math.max(a.x, b.x) > x0 && Math.min(a.x, b.x) < x1
    }
    if (a.x <= x0 || a.x >= x1) return false
    return Math.max(a.y, b.y) > y0 && Math.min(a.y, b.y) < y1
  }

  it('routes a 100-card diagram without drawing through any card', () => {
    const boxes = bigDiagram()
    const byId = new Map(boxes.map((b) => [b.id, b]))
    // Links that must cross the field: far-apart cards with cards in between.
    const pairs = [
      ['t0_0', 't0_9'], ['t0_0', 't9_9'], ['t5_0', 't5_9'],
      ['t9_0', 't0_8'], ['t2_3', 't7_6'], ['t4_4', 't4_5'],
    ]
    const links = pairs.map(([source, target], i) => {
      const s = byId.get(source), t = byId.get(target)
      const rightward = t.x >= s.x
      return {
        id: `e${i}`, source, target,
        sx: rightward ? s.x + s.w : s.x, sy: s.y + 60, sdx: rightward ? 1 : -1, sdy: 0,
        tx: rightward ? t.x : t.x + t.w, ty: t.y + 60, tdx: rightward ? -1 : 1, tdy: 0,
      }
    })

    const routes = routeEdges(boxes, links)
    // Every link is routed - the old global grid returned nothing at this size.
    expect(routes.size).toBe(links.length)

    for (const l of links) {
      const pts = routes.get(l.id)
      expect(pts.length).toBeGreaterThan(1)
      for (let i = 1; i < pts.length; i++) {
        for (const box of boxes) {
          // Endpoints legitimately land on their own cards' edges.
          if (box.id === l.source || box.id === l.target) continue
          expect(
            crosses(pts[i - 1], pts[i], box),
            `${l.id} segment ${i} crosses ${box.id}`,
          ).toBe(false)
        }
      }
    }
  })

  it('stays fast enough to run on a layout change', () => {
    const boxes = bigDiagram()
    const byId = new Map(boxes.map((b) => [b.id, b]))
    // One link per card, to a card three columns over - a dense schema.
    const links = boxes.slice(0, 60).map((s, i) => {
      const t = byId.get(`t${Math.min(9, (i % 10) + 1)}_${Math.min(9, (i % 7) + 2)}`)
      return {
        id: `e${i}`, source: s.id, target: t.id,
        sx: s.x + s.w, sy: s.y + 40, sdx: 1, sdy: 0,
        tx: t.x, ty: t.y + 40, tdx: -1, tdy: 0,
      }
    })
    const started = Date.now()
    const routes = routeEdges(boxes, links)
    const ms = Date.now() - started
    expect(routes.size).toBeGreaterThan(links.length * 0.9)
    expect(ms).toBeLessThan(4000)
  })
})

describe('corridorPathOrtho', () => {
  const port = { sx: 100, sy: 50, tx: 400, ty: 200, sdx: 1, sdy: 0, tdx: -1, tdy: 0 }
  /** Every segment runs along exactly one axis. */
  const axisAligned = (/** @type {{x:number,y:number}[]} */ pts) =>
    pts.every((p, i) => i === 0 || Math.abs(p.x - pts[i - 1].x) < 0.5 || Math.abs(p.y - pts[i - 1].y) < 0.5)

  it('leaves and arrives square on the ports', () => {
    const pts = corridorPathOrtho(port, [{ x: 100, y: 50 }, { x: 250, y: 120 }, { x: 400, y: 200 }])
    expect(pts[0]).toEqual({ x: 100, y: 50 })
    expect(pts.at(-1)).toEqual({ x: 400, y: 200 })
    // The stub itself is collinear with the run that follows it, so `tidy` drops
    // it - what has to hold is that both ends leave their card square and with
    // at least the stub's clearance, which is what the marker sits on.
    expect(pts[1].y).toBe(50)
    expect(pts[1].x - pts[0].x).toBeGreaterThanOrEqual(STUB)
    expect(pts.at(-2).y).toBe(200)
    expect(pts.at(-1).x - pts.at(-2).x).toBeGreaterThanOrEqual(STUB)
  })

  it('never draws a diagonal', () => {
    expect(axisAligned(corridorPathOrtho(port, [{ x: 100, y: 50 }, { x: 250, y: 120 }, { x: 400, y: 200 }]))).toBe(true)
    expect(axisAligned(corridorPathOrtho(port))).toBe(true)
    expect(axisAligned(corridorPathOrtho({ ...port, tx: 20, sdx: -1, sdy: 0, tdx: 1, tdy: 0 }))).toBe(true)
  })

  it('runs horizontally along every lane the layout reserved', () => {
    const corridor = [{ x: 100, y: 50 }, { x: 250, y: 120 }, { x: 320, y: 90 }, { x: 400, y: 200 }]
    const pts = corridorPathOrtho(port, corridor)
    for (const lane of [120, 90]) {
      const run = pts.filter(p => Math.abs(p.y - lane) < 0.5)
      expect(run.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('keeps every turn between the two points it joins', () => {
    const pts = corridorPathOrtho(port, [{ x: 100, y: 50 }, { x: 250, y: 120 }, { x: 400, y: 200 }])
    for (const p of pts.slice(1, -1)) {
      expect(p.x).toBeGreaterThanOrEqual(port.sx + STUB)
      expect(p.x).toBeLessThanOrEqual(port.tx - STUB)
    }
  })

  it('sends every line converging on a card through the same turn column', () => {
    // Three sources at different heights, one target row: their verticals have
    // to coincide into one trunk, not fan into a column each.
    const turns = [0, 400, 900].map((sy) => {
      const pts = corridorPathOrtho({ sx: 0, sy, tx: 900, ty: 500, sdx: 1, sdy: 0, tdx: -1, tdy: 0 })
      return pts[1].x
    })
    expect(new Set(turns).size).toBe(1)
  })

  it('is one straight run when the two ports already line up', () => {
    const flat = corridorPathOrtho({ sx: 0, sy: 100, tx: 300, ty: 100, sdx: 1, sdy: 0, tdx: -1, tdy: 0 })
    expect(flat).toEqual([{ x: 0, y: 100 }, { x: 300, y: 100 }])
  })
})

describe('routeToSvgPath', () => {
  it('starts at the first point and ends at the last, with rounded corners', () => {
    const d = routeToSvgPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 10 }])
    expect(d.startsWith('M0 0')).toBe(true)
    expect(d.endsWith('L20 10')).toBe(true)
    expect(d).toContain('Q')
  })

  it('has nothing to draw for a single point', () => {
    expect(routeToSvgPath([{ x: 1, y: 1 }])).toBe('')
  })
})

describe('the router bundles rather than separating', () => {
  /** A hub grid the shape of a real schema: 60 cards in 6 columns, all of them
   *  pointing at one of two hubs. */
  const scene = () => {
    const NODE_W = 268, gapX = 110, gapY = 64
    const cards = []
    let col = 0, row = 0, y = 0
    for (let i = 0; i < 60; i++) {
      const h = 120 + (i % 3) * 28
      cards.push({ id: `t${i}`, x: col * (NODE_W + gapX), y, w: NODE_W, h })
      y += h + gapY
      if (++row >= 10) { row = 0; y = 0; col++ }
    }
    const byId = new Map(cards.map((c) => [c.id, c]))
    const links = []
    for (let i = 2; i < cards.length; i++) {
      const s = cards[i]
      const t = byId.get(`t${i % 2}`)
      const ltr = t.x >= s.x
      links.push({
        id: `e${i}`, source: s.id, target: t.id,
        sx: s.x + (ltr ? s.w : 0), sy: s.y + 48, sdx: ltr ? 1 : -1, sdy: 0,
        tx: t.x + (ltr ? 0 : t.w), ty: t.y + 48, tdx: ltr ? -1 : 1, tdy: 0,
        sh: s.h, th: t.h, sTop: s.y, tTop: t.y,
      })
    }
    return { cards, links }
  }

  const run = () => {
    const { cards, links } = scene()
    const r = createRouteRun(cards.map((c) => ({ ...c })), links)
    while (!r.done) r.step(50)
    return { cards, links, routes: r.routes }
  }

  it('routes every relationship', () => {
    const { links, routes } = run()
    expect(routes.size).toBe(links.length)
  })

  it('draws few corners per line', () => {
    // The whole point of dropping the anti-overlap penalty. It used to be 10.6
    // corners a line on a grid this shape, which is what a mesh is made of.
    const { links, routes } = run()
    let turns = 0
    for (const l of links) turns += Math.max(0, (routes.get(l.id)?.length ?? 2) - 2)
    expect(turns / links.length).toBeLessThan(6)
  })

  it('still never crosses a card', () => {
    const { cards, links, routes } = run()
    for (const l of links) {
      const pts = routes.get(l.id) ?? []
      const ends = new Set([l.source, l.target])
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i]
        const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x)
        const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y)
        for (const c of cards) {
          if (ends.has(c.id)) continue
          const clear =
            x1 <= c.x + 0.5 || x0 >= c.x + c.w - 0.5 ||
            y1 <= c.y + 0.5 || y0 >= c.y + c.h - 0.5
          expect(clear).toBe(true)
        }
      }
    }
  })

  it('shares corridors, so the ink on screen is far less than the ink drawn', () => {
    const { links, routes } = run()
    /** @type {Map<string, number>} */
    const cells = new Map()
    let drawn = 0
    for (const l of links) {
      const pts = routes.get(l.id) ?? []
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i]
        drawn += Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
        const flat = Math.abs(a.y - b.y) < 0.5
        const fixed = Math.round((flat ? a.y : a.x) / 4)
        const lo = Math.round(Math.min(flat ? a.x : a.y, flat ? b.x : b.y) / 4)
        const hi = Math.round(Math.max(flat ? a.x : a.y, flat ? b.x : b.y) / 4)
        for (let k = lo; k < hi; k++) {
          const key = `${flat ? 'h' : 'v'}${k},${fixed}`
          cells.set(key, (cells.get(key) ?? 0) + 1)
        }
      }
    }
    const visible = cells.size * 4
    expect(visible).toBeLessThan(drawn * 0.75)
  })
})

describe('vertical ports, for cards that sit above each other', () => {
  const stacked = [
    { id: 'a', x: 0, y: 0, w: 268, h: 200 },
    { id: 'b', x: 40, y: 400, w: 268, h: 200 },
  ]
  const sideways = {
    id: 'h', source: 'a', target: 'b',
    sx: 268, sy: 60, sdx: 1, sdy: 0,
    tx: 40, ty: 460, tdx: -1, tdy: 0,
  }
  const magnet = {
    id: 'v', source: 'a', target: 'b',
    sx: 134, sy: 200, sdx: 0, sdy: 1,
    tx: 174, ty: 400, tdx: 0, tdy: -1,
  }
  const len = (pts) => {
    let d = 0
    for (let i = 1; i < pts.length; i++) d += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y)
    return d
  }

  it('leaves and enters square through a horizontal edge', () => {
    const pts = corridorPathOrtho(magnet)
    expect(pts[0]).toEqual({ x: 134, y: 200 })
    expect(pts[1].x).toBe(134)
    expect(pts[1].y - pts[0].y).toBeGreaterThanOrEqual(STUB)
    expect(pts.at(-1)).toEqual({ x: 174, y: 400 })
    expect(pts.at(-2).x).toBe(174)
  })

  it('draws no diagonal', () => {
    const pts = corridorPathOrtho(magnet)
    for (let i = 1; i < pts.length; i++) {
      const flat = Math.abs(pts[i].y - pts[i - 1].y) < 0.5
      const upright = Math.abs(pts[i].x - pts[i - 1].x) < 0.5
      expect(flat || upright).toBe(true)
    }
  })

  it('routes, and far shorter than going out of the side and back', () => {
    const v = routeEdges(stacked, [magnet]).get('v')
    const h = routeEdges(stacked, [sideways]).get('h')
    expect(v).toBeTruthy()
    expect(h).toBeTruthy()
    if (!v || !h) return
    assertClear(v, stacked, 'a', 'b')
    expect(len(v)).toBeLessThan(len(h) / 2)
    expect(v.length - 2).toBeLessThan(h.length - 2)
  })
})

describe('pathHitsRect', () => {
  const card = { id: 'c', x: 100, y: 100, w: 200, h: 100 }

  it('says no for a line that goes around the card', () => {
    // Its bounding box covers the card completely, which is exactly why this
    // cannot be answered from the box: it is what decides whether a route
    // survives a card being dragged somewhere else.
    const around = [
      { x: 0, y: 150 }, { x: 0, y: 400 }, { x: 400, y: 400 }, { x: 400, y: 150 },
    ]
    expect(pathHitsRect(around, card, 0)).toBe(false)
  })

  it('says yes for a line straight through it', () => {
    expect(pathHitsRect([{ x: 0, y: 150 }, { x: 400, y: 150 }], card, 0)).toBe(true)
  })

  it('counts the clearance a line keeps from a card', () => {
    const grazing = [{ x: 0, y: 100 - CLEAR / 2 }, { x: 400, y: 100 - CLEAR / 2 }]
    expect(pathHitsRect(grazing, card, 0)).toBe(false)
    expect(pathHitsRect(grazing, card)).toBe(true)
  })

  it('says no when the line is nowhere near', () => {
    expect(pathHitsRect([{ x: 0, y: 0 }, { x: 50, y: 0 }], card)).toBe(false)
  })
})
