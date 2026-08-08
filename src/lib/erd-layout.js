/**
 * Post-layout separation for the ER diagram.
 *
 * Two cards must never sit on top of each other, and every pair needs a channel
 * between them wide enough for the relationship lines that run there. Dagre
 * reserves space for the cards it lays out, but that guarantee doesn't survive
 * everything that happens afterwards — a hand-dragged card keeps its saved
 * position, a re-flowed rank packs sub-columns on its own terms, and a card whose
 * column list changed is a different size than the one the layout measured. Any
 * of those can leave cards overlapping, and an overlapping card is worse than a
 * crossed line: it hides data.
 *
 * So the positions are pushed apart until every pair is clear, as the last step
 * before anything is drawn. It's a relaxation, not a re-layout: cards move as
 * little as possible, so the shape Dagre found survives.
 */

/**
 * @typedef {{ id: string, x: number, y: number, w: number, h: number }} Card
 */

/**
 * A pass is one sweep over every pair. Relaxation is the right tool when a
 * layout is mostly clear and a few cards need nudging, which is the real case
 * (Dagre output plus a handful of hand-dragged cards) — but it converges slowly,
 * and from a degenerate start (everything piled on everything) it oscillates
 * instead of settling. So the passes are capped and anything still overlapping
 * afterwards is spilled into open space, which always terminates.
 */
const MAX_PASSES = 60

/**
 * Push cards apart until no two are closer than the given gaps.
 *
 * Overlap is resolved along the axis of *least* penetration, which is what keeps
 * a row a row and a column a column — correcting the long way would scatter the
 * layout into noise. Both cards in a pair move half the correction each, so no
 * single card drifts far from where the layout put it.
 *
 * @param {Card[]} cards
 * @param {{ gapX?: number, gapY?: number, fixed?: Set<string> }} [opts]
 *   `fixed` cards never move (the focused table, say); their partners absorb the
 *   whole correction instead.
 * @returns {Map<string, { x: number, y: number }>} id → adjusted top-left
 */
export function separateCards(cards, opts = {}) {
  const gapX = opts.gapX ?? 120
  const gapY = opts.gapY ?? 80
  const fixed = opts.fixed ?? new Set()

  // Work on a copy, in a stable order: two runs on the same input must agree,
  // or the diagram would jitter every time it re-renders.
  const items = cards
    .map((c) => ({ ...c }))
    .sort((a, b) => a.x - b.x || a.y - b.y || (a.id < b.id ? -1 : 1))

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let moved = false
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j]
        // Penetration of the two rects once each is grown by half a gap.
        const overlapX = Math.min(a.x + a.w + gapX, b.x + b.w + gapX) - Math.max(a.x, b.x)
        if (overlapX <= 0) continue
        const overlapY = Math.min(a.y + a.h + gapY, b.y + b.h + gapY) - Math.max(a.y, b.y)
        if (overlapY <= 0) continue

        // The real gap needed is one gap, not two — measure against the pair.
        const needX = (a.w + b.w) / 2 + gapX
        const needY = (a.h + b.h) / 2 + gapY
        const dx = (b.x + b.w / 2) - (a.x + a.w / 2)
        const dy = (b.y + b.h / 2) - (a.y + a.h / 2)
        const pushX = needX - Math.abs(dx)
        const pushY = needY - Math.abs(dy)
        if (pushX <= 0 || pushY <= 0) continue

        moved = true
        // Cheaper direction wins. A dead heat (two cards at the same point)
        // resolves vertically, which reads better than a sideways drift.
        if (pushY <= pushX) {
          const sign = dy === 0 ? (a.id < b.id ? 1 : -1) : Math.sign(dy)
          shift(a, b, 0, -sign * pushY, fixed)
        } else {
          const sign = dx === 0 ? (a.id < b.id ? 1 : -1) : Math.sign(dx)
          shift(a, b, -sign * pushX, 0, fixed)
        }
      }
    }
    if (!moved) break
  }

  spillStragglers(items, gapX, gapY, fixed)

  const out = new Map()
  for (const it of items) out.set(it.id, { x: Math.round(it.x), y: Math.round(it.y) })
  return out
}

/**
 * Last resort: give any card still overlapping its own place in open space.
 *
 * Relaxation can stall — three cards in a tight triangle push each other around
 * forever — and a diagram is allowed to be wider, but never allowed to hide a
 * card behind another. Stragglers are laid out in a grid below everything that
 * did settle, in stable order, so the result is deterministic and the invariant
 * holds no matter what came in.
 * @param {Card[]} items @param {number} gapX @param {number} gapY @param {Set<string>} fixed
 */
function spillStragglers(items, gapX, gapY, fixed) {
  const overlaps = (/** @type {Card} */ a, /** @type {Card} */ b) =>
    !(b.x >= a.x + a.w + gapX || a.x >= b.x + b.w + gapX) &&
    !(b.y >= a.y + a.h + gapY || a.y >= b.y + b.h + gapY)

  /** @type {Card[]} */
  const kept = []
  /** @type {Card[]} */
  const spill = []
  for (const it of items) {
    // A pinned card is never the one that moves.
    if (fixed.has(it.id) || !kept.some((k) => overlaps(k, it))) kept.push(it)
    else spill.push(it)
  }
  if (!spill.length) return

  let baseX = 0
  let baseY = 0
  if (kept.length) {
    baseX = Math.min(...kept.map((k) => k.x))
    baseY = Math.max(...kept.map((k) => k.y + k.h)) + gapY * 2
  }
  const colW = Math.max(...spill.map((c) => c.w)) + gapX
  const rowH = Math.max(...spill.map((c) => c.h)) + gapY
  // Roughly square, so a big spill spreads across the canvas instead of forming
  // one endless column.
  const cols = Math.max(1, Math.ceil(Math.sqrt(spill.length)))
  spill.forEach((c, i) => {
    c.x = baseX + (i % cols) * colW
    c.y = baseY + Math.floor(i / cols) * rowH
  })
}

/**
 * Move `a` by (dx, dy) and `b` the opposite way, splitting the correction —
 * unless one of them is pinned, in which case the other takes all of it.
 * @param {Card} a @param {Card} b @param {number} dx @param {number} dy @param {Set<string>} fixed
 */
function shift(a, b, dx, dy, fixed) {
  const aFixed = fixed.has(a.id), bFixed = fixed.has(b.id)
  if (aFixed && bFixed) return // nothing we're allowed to move
  if (aFixed) { b.x -= dx; b.y -= dy; return }
  if (bFixed) { a.x += dx; a.y += dy; return }
  a.x += dx / 2
  a.y += dy / 2
  b.x -= dx / 2
  b.y -= dy / 2
}

/**
 * True when every pair of cards clears the given gaps. Used by the tests, and
 * cheap enough to assert with when something looks wrong.
 * @param {Card[]} cards @param {number} gapX @param {number} gapY
 */
export function cardsAreSeparated(cards, gapX = 0, gapY = 0) {
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i], b = cards[j]
      const clearX = b.x >= a.x + a.w + gapX || a.x >= b.x + b.w + gapX
      const clearY = b.y >= a.y + a.h + gapY || a.y >= b.y + b.h + gapY
      if (!clearX && !clearY) return false
    }
  }
  return true
}
