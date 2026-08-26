import { describe, it, expect } from 'vitest'
import { virtualWindow, VIRT_THRESHOLD, VIRT_BUFFER } from './virtual-window.js'

const base = { scrollTop: 0, viewportHeight: 600, offsetTop: 0, rowH: 27 }

describe('virtualWindow', () => {
  it('renders a short list whole', () => {
    const w = virtualWindow({ ...base, count: VIRT_THRESHOLD })
    expect(w).toEqual({ virtualized: false, start: 0, end: VIRT_THRESHOLD, topPad: 0, botPad: 0 })
  })

  it('renders nothing for an empty list', () => {
    expect(virtualWindow({ ...base, count: 0 }).end).toBe(0)
  })

  it('windows a long list around the viewport, with a buffer each side', () => {
    const w = virtualWindow({ ...base, count: 10_000, scrollTop: 2700 })
    expect(w.virtualized).toBe(true)
    expect(w.start).toBe(100 - VIRT_BUFFER)
    // 2700 + 600 = 3300 / 27 = 122.2, rounded up to 123, plus the buffer.
    expect(w.end).toBe(123 + VIRT_BUFFER)
    expect(w.topPad).toBe(w.start * 27)
    expect(w.botPad).toBe((10_000 - w.end) * 27)
  })

  it('keeps total height equal to the full list at any scroll position', () => {
    for (const scrollTop of [0, 500, 12_345, 269_000]) {
      const w = virtualWindow({ ...base, count: 10_000, scrollTop })
      const rendered = (w.end - w.start) * 27
      expect(w.topPad + rendered + w.botPad).toBe(10_000 * 27)
    }
  })

  it('subtracts the list offset, so a list below the fold renders its head', () => {
    const w = virtualWindow({ ...base, count: 5_000, scrollTop: 0, offsetTop: 4_000 })
    expect(w.start).toBe(0)
    expect(w.end).toBe(0)
    expect(w.botPad).toBe(5_000 * 27)
  })

  it('clamps past the end instead of running negative', () => {
    const w = virtualWindow({ ...base, count: 100, scrollTop: 99_999 })
    expect(w.start).toBe(100)
    expect(w.end).toBe(100)
    expect(w.botPad).toBe(0)
  })

  it('waits for a measured row stride rather than dividing by zero', () => {
    const w = virtualWindow({ ...base, count: 10_000, rowH: 0 })
    expect(w.virtualized).toBe(false)
    expect(w.end).toBe(10_000)
  })
})
