import { describe, it, expect } from 'vitest'
import { separateCards, cardsAreSeparated } from './erd-layout.js'

/** @param {Array<[string, number, number, number, number]>} rows */
const cards = (rows) => rows.map(([id, x, y, w, h]) => ({ id, x, y, w, h }))

/** Apply the result back onto the cards, the way the page does. */
function applied(list, opts) {
  const pos = separateCards(list, opts)
  return list.map((c) => ({ ...c, ...pos.get(c.id) }))
}

describe('separateCards', () => {
  it('leaves a layout that is already clear alone', () => {
    const list = cards([
      ['a', 0, 0, 268, 200],
      ['b', 500, 0, 268, 200],
      ['c', 0, 400, 268, 200],
    ])
    const pos = separateCards(list, { gapX: 120, gapY: 80 })
    for (const c of list) expect(pos.get(c.id)).toEqual({ x: c.x, y: c.y })
  })

  it('pulls apart two cards drawn on top of each other', () => {
    // The failure from the diagram: a tall card sitting over its neighbour.
    const list = cards([
      ['offer', 680, 205, 268, 260],
      ['artworks', 690, 395, 268, 120],
    ])
    const out = applied(list, { gapX: 120, gapY: 80 })
    expect(cardsAreSeparated(out, 120, 80)).toBe(true)
  })

  it('separates cards stacked at the exact same point', () => {
    const list = cards([
      ['a', 100, 100, 268, 180],
      ['b', 100, 100, 268, 180],
      ['c', 100, 100, 268, 180],
    ])
    const out = applied(list, { gapX: 120, gapY: 80 })
    expect(cardsAreSeparated(out, 120, 80)).toBe(true)
  })

  it('opens a channel wide enough for lines between neighbours', () => {
    // Touching cards: there is nowhere for a relationship line to run.
    const list = cards([
      ['a', 0, 0, 268, 200],
      ['b', 268, 0, 268, 200],
    ])
    const out = applied(list, { gapX: 140, gapY: 84 })
    const [a, b] = out
    // Whichever side they ended up on, the gap between them is the channel.
    expect(Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w))).toBeGreaterThanOrEqual(139)
  })

  it('never moves a pinned card', () => {
    const list = cards([
      ['focus', 500, 500, 268, 300],
      ['other', 520, 520, 268, 300],
    ])
    const pos = separateCards(list, { gapX: 120, gapY: 80, fixed: new Set(['focus']) })
    expect(pos.get('focus')).toEqual({ x: 500, y: 500 })
    expect(cardsAreSeparated(list.map((c) => ({ ...c, ...pos.get(c.id) })), 120, 80)).toBe(true)
  })

  it('is deterministic — the same input never jitters', () => {
    const list = cards([
      ['a', 10, 10, 268, 200],
      ['b', 30, 40, 268, 340],
      ['c', 60, 20, 268, 120],
      ['d', 15, 300, 268, 260],
    ])
    const first = separateCards(list, { gapX: 120, gapY: 80 })
    const second = separateCards(list, { gapX: 120, gapY: 80 })
    for (const c of list) expect(second.get(c.id)).toEqual(first.get(c.id))
  })

  it('resolves a dense pile-up of a hundred cards', () => {
    // Every card overlapping several others, the worst case a re-flow can leave.
    const list = cards(
      Array.from({ length: 100 }, (_, i) => [
        `t${i}`,
        (i % 10) * 60,
        Math.floor(i / 10) * 60,
        268,
        180 + (i % 5) * 40,
      ]),
    )
    const started = Date.now()
    const out = applied(list, { gapX: 120, gapY: 80 })
    expect(Date.now() - started).toBeLessThan(1500)
    expect(cardsAreSeparated(out, 120, 80)).toBe(true)
  })

  it('keeps cards near where the layout put them', () => {
    const list = cards([
      ['a', 0, 0, 268, 200],
      ['b', 300, 10, 268, 200],
      ['c', 600, 20, 268, 200],
    ])
    const out = applied(list, { gapX: 120, gapY: 80 })
    // Left-to-right order is what Dagre decided; separation must not reshuffle it.
    expect(out.map((c) => c.id).sort((p, q) => out.find((o) => o.id === p).x - out.find((o) => o.id === q).x))
      .toEqual(['a', 'b', 'c'])
  })
})
