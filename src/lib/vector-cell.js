/**
 * Reading an embedding.
 *
 * A 1536-number text field is data the eye cannot use: every value is `0.0…`
 * something and the wall of digits says nothing about the vector. What is
 * actually worth knowing is its shape - how many dimensions, how the values are
 * distributed, whether it is unit-normalised (almost every embedding model
 * returns normalised vectors, so a norm that isn't 1 is a real signal), and
 * where the extremes are.
 *
 * Pure functions: text in, numbers out, so the viewer stays a rendering concern.
 */

/**
 * @typedef {object} VectorInfo
 * @property {'dense'|'sparse'} kind
 * @property {number[]} values     dense values, or the expanded sparse vector
 * @property {number} dim          declared dimension (sparse: from the `/n` suffix)
 * @property {number} min
 * @property {number} max
 * @property {number} mean
 * @property {number} norm         L2 norm
 * @property {number} zeros        count of exact zeros
 * @property {number} minIndex
 * @property {number} maxIndex
 * @property {boolean} unit        norm is 1 within a small tolerance
 * @property {Array<{ index: number, value: number }>} [entries] sparse only
 */

/**
 * Parse pgvector's text form: `[1,2,3]` for dense, `{1:1.5,3:2.5}/5` for sparse.
 * @param {unknown} raw
 * @returns {VectorInfo | null} null when this isn't a vector literal
 */
export function parseVector(raw) {
  if (typeof raw !== 'string') return null
  const text = raw.trim()

  // Sparse: `{index:value,…}/dim`, indices 1-based.
  const sparse = /^\{(.*)\}\/(\d+)$/.exec(text)
  if (sparse) {
    const dim = Number(sparse[2])
    /** @type {Array<{ index: number, value: number }>} */
    const entries = []
    if (sparse[1].trim()) {
      for (const pair of sparse[1].split(',')) {
        const [i, v] = pair.split(':')
        const index = Number(i), value = Number(v)
        if (!Number.isFinite(index) || !Number.isFinite(value)) return null
        entries.push({ index, value })
      }
    }
    const values = new Array(Number.isFinite(dim) ? dim : entries.length).fill(0)
    for (const e of entries) {
      if (e.index >= 1 && e.index <= values.length) values[e.index - 1] = e.value
    }
    return { ...stats(values), kind: 'sparse', values, dim: values.length, entries }
  }

  const dense = /^\[(.*)\]$/.exec(text)
  if (!dense) return null
  const body = dense[1].trim()
  if (!body) return { ...stats([]), kind: 'dense', values: [], dim: 0 }
  /** @type {number[]} */
  const values = []
  for (const part of body.split(',')) {
    const n = Number(part)
    // A single non-numeric element means this is not a vector - say so rather
    // than render a viewer full of NaN.
    if (!Number.isFinite(n)) return null
    values.push(n)
  }
  return { ...stats(values), kind: 'dense', values, dim: values.length }
}

/** @param {number[]} values */
function stats(values) {
  let min = Infinity, max = -Infinity, sum = 0, sumSq = 0, zeros = 0
  let minIndex = 0, maxIndex = 0
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v < min) { min = v; minIndex = i }
    if (v > max) { max = v; maxIndex = i }
    sum += v
    sumSq += v * v
    if (v === 0) zeros++
  }
  const n = values.length
  const norm = Math.sqrt(sumSq)
  const mean = n ? sum / n : 0
  return {
    dim: n,
    min: n ? min : 0,
    max: n ? max : 0,
    mean,
    // Population std from the running sums; clamp guards float error when the
    // values are all identical.
    std: n ? Math.sqrt(Math.max(0, sumSq / n - mean * mean)) : 0,
    norm,
    zeros,
    minIndex,
    maxIndex,
    // Embedding models return unit vectors; a norm that isn't 1 usually means
    // the values were stored raw, which changes how distance behaves.
    unit: n > 0 && Math.abs(norm - 1) < 1e-3,
  }
}

/**
 * Histogram of the values themselves (the strip above is indexed by dimension;
 * this answers "how are the values distributed?" - roughly gaussian around 0
 * for a healthy embedding, spikes or heavy tails when something is off).
 * @param {number[]} values @param {number} bins
 * @returns {{ counts: number[], from: number, to: number, max: number }}
 */
export function vectorHistogram(values, bins) {
  if (!values.length || bins < 1) return { counts: [], from: 0, to: 0, max: 0 }
  let from = Infinity, to = -Infinity
  for (const v of values) {
    if (v < from) from = v
    if (v > to) to = v
  }
  // All-equal vectors get one centered bucket instead of a zero-width range.
  if (from === to) { from -= 0.5; to += 0.5 }
  const counts = new Array(bins).fill(0)
  const span = to - from
  for (const v of values) {
    const b = Math.min(bins - 1, Math.floor(((v - from) / span) * bins))
    counts[b]++
  }
  return { counts, from, to, max: Math.max(...counts) }
}

/**
 * Downsample to at most `buckets` bars for a sparkline, keeping the extreme of
 * each bucket so a single spike in a 1536-dim vector stays visible instead of
 * being averaged away.
 * @param {number[]} values @param {number} buckets
 * @returns {number[]}
 */
export function vectorBars(values, buckets) {
  if (values.length <= buckets) return values.slice()
  const per = values.length / buckets
  /** @type {number[]} */
  const out = []
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * per)
    const to = Math.min(values.length, Math.floor((b + 1) * per))
    let peak = 0
    for (let i = from; i < to; i++) {
      if (Math.abs(values[i]) > Math.abs(peak)) peak = values[i]
    }
    out.push(peak)
  }
  return out
}

/**
 * Short label for a grid cell: the dimension, then the first few values.
 * @param {unknown} raw @param {number} [heads]
 */
export function vectorSummary(raw, heads = 3) {
  const info = parseVector(raw)
  if (!info) return typeof raw === 'string' ? raw : String(raw ?? '')
  if (info.kind === 'sparse') {
    return `${info.dim}d · ${info.entries?.length ?? 0} set`
  }
  // No room for values: the dimension alone is still worth showing.
  if (heads <= 0 || info.values.length === 0) return `${info.dim}d`
  const head = info.values.slice(0, heads).map(short).join(', ')
  return info.values.length > heads ? `${info.dim}d · ${head}, …` : `${info.dim}d · ${head}`
}

/** Compact number for display: enough digits to compare, not enough to fill a row. */
export function short(v) {
  if (!Number.isFinite(v)) return String(v)
  if (v === 0) return '0'
  const abs = Math.abs(v)
  if (abs >= 1000 || abs < 0.001) return v.toExponential(2)
  return String(Number(v.toFixed(4)))
}
