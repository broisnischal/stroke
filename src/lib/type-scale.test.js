import { describe, expect, it } from 'vitest'
import { buildTypeScale, rootPxFor, ROOT_BASE_PX, ZOOM_STEPS } from './type-scale.js'

describe('type scale', () => {
  it('gives every zoom rung its own root size', () => {
    const roots = ZOOM_STEPS.map(rootPxFor)
    expect(new Set(roots).size).toBe(roots.length)
  })

  it('renders each rung within 3pp of the ratio it advertises', () => {
    for (const zoom of ZOOM_STEPS) {
      expect(Math.abs(rootPxFor(zoom) / ROOT_BASE_PX - zoom)).toBeLessThan(0.03)
    }
  })

  it('keeps every step strictly larger than the one below it', () => {
    // The bug this guards: rounding each step alone collapsed neighbours at small
    // roots (at root 12, `3xs` and `2xs` both landed on 9px), flattening the
    // hierarchy the scale exists to express.
    for (const zoom of ZOOM_STEPS) {
      const px = buildTypeScale(rootPxFor(zoom)).map(([, size]) => size)
      for (let i = 1; i < px.length; i++) {
        expect(px[i], `zoom ${zoom}, step ${i}`).toBeGreaterThan(px[i - 1])
      }
    }
  })

  it('pins `base` to the root, so the canvas grid and the DOM agree', () => {
    for (const zoom of ZOOM_STEPS) {
      const root = rootPxFor(zoom)
      const base = buildTypeScale(root).find(([step]) => step === 'base')
      expect(base?.[1]).toBe(root)
    }
  })

  it('keeps the smallest step legible at the lowest rung', () => {
    const smallest = buildTypeScale(rootPxFor(ZOOM_STEPS[0]))[0][1]
    expect(smallest).toBeGreaterThanOrEqual(9)
  })
})
