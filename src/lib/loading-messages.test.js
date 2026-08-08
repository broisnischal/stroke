import { describe, it, expect, beforeEach } from 'vitest'
import { EASTER_EGGS } from './easter-eggs.js'
import { LOADING_MESSAGES, nextLoadingMessage, resetLoadingHistory } from './loading-messages.js'

describe('nextLoadingMessage', () => {
  beforeEach(() => resetLoadingHistory())

  it('never repeats a line until 10 others have been shown', () => {
    const seen = Array.from({ length: 200 }, () => nextLoadingMessage())
    for (let i = 0; i < seen.length; i++) {
      const window = seen.slice(Math.max(0, i - 10), i)
      expect(window).not.toContain(seen[i])
    }
  })

  it('draws easter eggs about twice as often as an ordinary line', () => {
    const plain = LOADING_MESSAGES.filter((m) => !EASTER_EGGS.includes(m))
    const counts = new Map()
    for (let i = 0; i < 40_000; i++) {
      const m = nextLoadingMessage()
      counts.set(m, (counts.get(m) ?? 0) + 1)
    }
    const avg = (list) => list.reduce((n, m) => n + (counts.get(m) ?? 0), 0) / list.length
    expect(avg(EASTER_EGGS) / avg(plain)).toBeGreaterThan(1.5)
    expect(avg(EASTER_EGGS) / avg(plain)).toBeLessThan(2.5)
  })

  it('still returns a line when the pool is smaller than the no-repeat window', () => {
    const picks = Array.from({ length: 50 }, () => nextLoadingMessage(EASTER_EGGS))
    expect(picks.every((p) => EASTER_EGGS.includes(p))).toBe(true)
    // 4 credits cannot honour a 10-deep window, but consecutive repeats must not happen.
    for (let i = 1; i < picks.length; i++) expect(picks[i]).not.toBe(picks[i - 1])
  })

  it('shares one history across pools, so a credit shown in one loader is not next in the other', () => {
    const egg = nextLoadingMessage(EASTER_EGGS)
    expect(nextLoadingMessage()).not.toBe(egg)
  })
})
