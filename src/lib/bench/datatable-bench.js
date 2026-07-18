// DataTable performance benchmark harness.
//
// There was no benchmark before — this is the measurement layer for quantifying
// the 5M-row / windowing / scroll work. It has NO UI; a benchmark *page* imports
// these helpers and renders the results. Everything runs client-side and needs
// no database, so the grid can be stress-tested in isolation.
//
// Intended page (build this on top of the exports below):
//   • a row-count picker (10k / 100k / 1M / 5M) + column-count picker
//   • a "Run" button that generates rows, mounts <DataTable rows={rows} …/>,
//     then runs benchScroll() and shows the result cards
//   • cards for: generate time, first-paint time, scroll FPS (avg / p1-low),
//     dropped frames, and JS heap before/after (Chromium/WebView only)
//   • ideally a small results table so runs can be compared across builds
//
// Grid row shape is positional (array-of-arrays) to match what the backend and
// DataTable actually use — see readRowsResponse() / rows: any[][].

/** @typedef {{ name: string, dataType: string }} BenchColumn */

/** A representative column set (id, text, fk, numeric, bool, timestamp, json, url). */
export const SAMPLE_COLUMNS = /** @type {BenchColumn[]} */ ([
  { name: 'id', dataType: 'int4' },
  { name: 'name', dataType: 'text' },
  { name: 'category_id', dataType: 'int4' },
  { name: 'price', dataType: 'numeric' },
  { name: 'in_stock', dataType: 'bool' },
  { name: 'created_at', dataType: 'timestamptz' },
  { name: 'metadata', dataType: 'jsonb' },
  { name: 'avatar_url', dataType: 'text' },
])

const WORDS = ['alpha', 'bravo', 'delta', 'echo', 'north', 'ridge', 'harbor', 'quartz', 'ember', 'lunar']

/**
 * Generate `count` synthetic rows as positional arrays matching SAMPLE_COLUMNS
 * (or a custom width). Deterministic (seeded by index) so runs are comparable.
 * Built in chunks so a 5M generation doesn't block a single macrotask forever;
 * pass an onProgress callback to drive a progress bar.
 * @param {number} count
 * @param {{ columns?: BenchColumn[], onProgress?: (done: number) => void }} [opts]
 * @returns {Promise<any[][]>}
 */
export async function generateRows(count, opts = {}) {
  const cols = opts.columns ?? SAMPLE_COLUMNS
  const width = cols.length
  /** @type {any[][]} */
  const rows = new Array(count)
  const base = Date.UTC(2020, 0, 1)
  const CHUNK = 100_000
  for (let i = 0; i < count; i++) {
    const w = WORDS[i % WORDS.length]
    const row = new Array(width)
    // Fill the representative columns; extra columns (if width > 8) repeat text.
    row[0] = i + 1
    row[1] = `${w}_${i}`
    row[2] = width > 2 ? (i % 5000) + 1 : undefined
    row[3] = width > 3 ? Math.round((i * 7.13) % 100000) / 100 : undefined
    row[4] = width > 4 ? (i & 1) === 0 : undefined
    row[5] = width > 5 ? new Date(base + i * 60000).toISOString() : undefined
    row[6] = width > 6 ? { k: w, n: i % 100 } : undefined
    row[7] = width > 7 ? `https://avatars.example.com/u/${i % 10000}` : undefined
    for (let c = 8; c < width; c++) row[c] = `${w}-${c}-${i}`
    rows[i] = row
    if ((i & (CHUNK - 1)) === CHUNK - 1) {
      opts.onProgress?.(i + 1)
      // Yield so a huge generation stays interruptible and the UI can paint.
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  opts.onProgress?.(count)
  return rows
}

/** JS heap snapshot in MB (Chromium / WebView only; null elsewhere). */
export function snapshotMemoryMB() {
  const mem = /** @type {any} */ (performance).memory
  if (!mem || typeof mem.usedJSHeapSize !== 'number') return null
  return {
    usedMB: +(mem.usedJSHeapSize / 1048576).toFixed(1),
    totalMB: +(mem.totalJSHeapSize / 1048576).toFixed(1),
    limitMB: +(mem.jsHeapSizeLimit / 1048576).toFixed(1),
  }
}

/** Measure the frame rate over `durationMs` while `onFrame` optionally drives motion.
 * @param {number} durationMs
 * @param {(elapsed: number) => void} [onFrame]
 * @returns {Promise<{ frames: number, durationMs: number, avgFps: number, minFrameMs: number, maxFrameMs: number, longFrames: number }>}
 */
export function measureFrameRate(durationMs, onFrame) {
  return new Promise((resolve) => {
    const t0 = performance.now()
    let last = t0
    let frames = 0
    let minFrameMs = Infinity
    let maxFrameMs = 0
    let longFrames = 0 // frames slower than 16.7ms (i.e. dropped below 60fps)
    const tick = () => {
      const now = performance.now()
      const dt = now - last
      last = now
      frames++
      if (dt < minFrameMs) minFrameMs = dt
      if (dt > maxFrameMs) maxFrameMs = dt
      if (dt > 16.7) longFrames++
      onFrame?.(now - t0)
      if (now - t0 < durationMs) requestAnimationFrame(tick)
      else {
        const elapsed = now - t0
        resolve({
          frames,
          durationMs: +elapsed.toFixed(1),
          avgFps: +((frames / elapsed) * 1000).toFixed(1),
          minFrameMs: +minFrameMs.toFixed(2),
          maxFrameMs: +maxFrameMs.toFixed(2),
          longFrames,
        })
      }
    }
    requestAnimationFrame(tick)
  })
}

/**
 * Scripted scroll benchmark: drives `scrollEl` from top to `distancePx` over the
 * measured window and reports the frame stats. Point this at the DataTable's
 * scroll container (`[data-canvas-table]`).
 * @param {{ scrollEl: HTMLElement, distancePx?: number, durationMs?: number }} o
 */
export async function benchScroll({ scrollEl, distancePx, durationMs = 4000 }) {
  const max = scrollEl.scrollHeight - scrollEl.clientHeight
  const dist = Math.min(distancePx ?? max, max)
  scrollEl.scrollTop = 0
  await new Promise((r) => requestAnimationFrame(() => r(null)))
  const stats = await measureFrameRate(durationMs, (elapsed) => {
    scrollEl.scrollTop = (elapsed / durationMs) * dist
  })
  scrollEl.scrollTop = 0
  return { ...stats, distancePx: Math.round(dist) }
}

/** Time an async step (e.g. generate, mount, first paint). @param {() => Promise<T> | T} fn @returns {Promise<{ ms: number, value: T }>} @template T */
export async function timeStep(fn) {
  const t0 = performance.now()
  const value = await fn()
  return { ms: +(performance.now() - t0).toFixed(1), value }
}

/** Convenience: wait two frames so a just-mounted grid has painted once. */
export function nextPaint() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
}
