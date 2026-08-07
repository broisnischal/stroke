import { describe, it, expect } from 'vitest'
import { parseVector, vectorBars, vectorSummary, short } from './vector-cell.js'

describe('parseVector', () => {
  it('reads a dense vector and describes its shape', () => {
    const v = parseVector('[0.5,-0.5,0.5,-0.5]')
    expect(v.kind).toBe('dense')
    expect(v.dim).toBe(4)
    expect(v.min).toBe(-0.5)
    expect(v.max).toBe(0.5)
    expect(v.mean).toBe(0)
    expect(v.norm).toBe(1)
    // A unit vector is the normal case for an embedding; saying so is the point.
    expect(v.unit).toBe(true)
  })

  it('flags a vector that is not unit-normalised', () => {
    const v = parseVector('[3,4]')
    expect(v.norm).toBe(5)
    expect(v.unit).toBe(false)
  })

  it('records where the extremes are, not just what they are', () => {
    const v = parseVector('[0.1,0.9,0.2,-0.7]')
    expect(v.maxIndex).toBe(1)
    expect(v.minIndex).toBe(3)
  })

  it('counts exact zeros', () => {
    expect(parseVector('[0,1,0,2]').zeros).toBe(2)
  })

  it('expands a sparse vector into its full dimension', () => {
    const v = parseVector('{1:1.5,3:2.5}/5')
    expect(v.kind).toBe('sparse')
    expect(v.dim).toBe(5)
    expect(v.values).toEqual([1.5, 0, 2.5, 0, 0])
    expect(v.entries).toEqual([{ index: 1, value: 1.5 }, { index: 3, value: 2.5 }])
    expect(v.zeros).toBe(3)
  })

  it('handles the empty cases', () => {
    expect(parseVector('[]').dim).toBe(0)
    expect(parseVector('{}/8').values).toEqual(new Array(8).fill(0))
  })

  it('refuses anything that is not a vector literal', () => {
    // Better to fall back to the text editor than to show a viewer full of NaN.
    expect(parseVector('hello')).toBeNull()
    expect(parseVector('[a,b]')).toBeNull()
    expect(parseVector(null)).toBeNull()
    expect(parseVector(42)).toBeNull()
    expect(parseVector('{"a":1}')).toBeNull()
  })

  it('reads an embedding-sized vector', () => {
    const values = Array.from({ length: 1536 }, (_, i) => (i % 2 ? 0.01 : -0.01))
    const v = parseVector(`[${values.join(',')}]`)
    expect(v.dim).toBe(1536)
    expect(v.mean).toBeCloseTo(0, 6)
  })
})

describe('vectorBars', () => {
  it('returns the values unchanged when they already fit', () => {
    expect(vectorBars([1, 2, 3], 8)).toEqual([1, 2, 3])
  })

  it('keeps the extreme of each bucket so a spike survives downsampling', () => {
    // One big negative spike among small positives must not be averaged away.
    const values = new Array(100).fill(0.01)
    values[42] = -0.9
    const bars = vectorBars(values, 10)
    expect(bars).toHaveLength(10)
    expect(Math.min(...bars)).toBe(-0.9)
  })

  it('covers the whole vector', () => {
    const values = Array.from({ length: 1536 }, (_, i) => i)
    const bars = vectorBars(values, 64)
    expect(bars).toHaveLength(64)
    expect(bars[63]).toBe(1535) // the last bucket reaches the end
  })
})

describe('vectorSummary', () => {
  it('leads with the dimension, which is the readable part', () => {
    expect(vectorSummary('[0.1,0.2,0.3,0.4,0.5]')).toBe('5d · 0.1, 0.2, 0.3, …')
    expect(vectorSummary('[0.1,0.2]')).toBe('2d · 0.1, 0.2')
  })

  it('says how many entries a sparse vector actually sets', () => {
    expect(vectorSummary('{1:1.5,3:2.5}/384')).toBe('384d · 2 set')
  })

  it('passes through anything it cannot parse', () => {
    expect(vectorSummary('not a vector')).toBe('not a vector')
  })
})

describe('short', () => {
  it('keeps numbers comparable without filling the row', () => {
    expect(short(0)).toBe('0')
    expect(short(0.123456789)).toBe('0.1235')
    expect(short(-0.5)).toBe('-0.5')
    expect(short(0.0000123)).toBe('1.23e-5')
    expect(short(12345)).toBe('1.23e+4')
  })
})

describe('vectorSummary width adaptation', () => {
  it('shows the dimension alone when there is no room for values', () => {
    // A narrow column: half a number is noise, the dimension is not.
    expect(vectorSummary('[0.1,0.2,0.3]', 0)).toBe('3d')
  })

  it('shows as many values as it is given room for', () => {
    expect(vectorSummary('[0.1,0.2,0.3,0.4]', 1)).toBe('4d · 0.1, …')
    expect(vectorSummary('[0.1,0.2,0.3,0.4]', 4)).toBe('4d · 0.1, 0.2, 0.3, 0.4')
  })

  it('never trails a separator for an empty vector', () => {
    expect(vectorSummary('[]', 3)).toBe('0d')
  })
})
