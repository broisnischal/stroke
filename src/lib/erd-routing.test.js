import { describe, it, expect } from 'vitest'
import { routeEdges, CLEAR, STUB } from './erd-routing.js'

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
      { id: 'e', source: 'a', target: 'b', sx: 200, sy: 50, tx: 500, ty: 50, sdir: 1, tdir: -1 },
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
      { id: 'e', source: 'a', target: 'b', sx: 200, sy: 50, tx: 700, ty: 50, sdir: 1, tdir: -1 },
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
      { id: 'e', source: 'a', target: 'b', sx: 200, sy: 80, tx: 600, ty: 620, sdir: 1, tdir: -1 },
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
        sx: 260, sy: 950 + i * 20, tx: x, ty: y + 60, sdir: 1, tdir: -1,
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
            sdir: 1, tdir: -1,
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
      { id: 'e', source: 'a', target: 'b', sx: 100, sy: 50, tx: 300, ty: 50, sdir: 1, tdir: -1 },
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
        sx: rightward ? s.x + s.w : s.x, sy: s.y + 60, sdir: rightward ? 1 : -1,
        tx: rightward ? t.x : t.x + t.w, ty: t.y + 60, tdir: rightward ? -1 : 1,
      }
    })

    const routes = routeEdges(boxes, links)
    // Every link is routed — the old global grid returned nothing at this size.
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
    // One link per card, to a card three columns over — a dense schema.
    const links = boxes.slice(0, 60).map((s, i) => {
      const t = byId.get(`t${Math.min(9, (i % 10) + 1)}_${Math.min(9, (i % 7) + 2)}`)
      return {
        id: `e${i}`, source: s.id, target: t.id,
        sx: s.x + s.w, sy: s.y + 40, sdir: 1,
        tx: t.x, ty: t.y + 40, tdir: -1,
      }
    })
    const started = Date.now()
    const routes = routeEdges(boxes, links)
    const ms = Date.now() - started
    expect(routes.size).toBeGreaterThan(links.length * 0.9)
    expect(ms).toBeLessThan(4000)
  })
})
