<script>
  // Self-contained DataTable performance benchmark. Drop it in and mount it
  // anywhere (a dev route, a dialog, a hidden tab) — no database, no props.
  // It generates synthetic rows, mounts the REAL <DataTable>, runs a scripted
  // scroll, and reports generate time, first-paint time, scroll FPS + dropped
  // frames, and JS-heap before/after. Everything (harness + UI) is in this file.
  import DataTable from '$lib/components/DataTable.svelte'

  // ── Measurement harness (inline, no deps) ─────────────────────────────────
  const COLUMNS = [
    { name: 'id', dataType: 'int4' },
    { name: 'name', dataType: 'text' },
    { name: 'category_id', dataType: 'int4' },
    { name: 'price', dataType: 'numeric' },
    { name: 'in_stock', dataType: 'bool' },
    { name: 'created_at', dataType: 'timestamptz' },
    { name: 'metadata', dataType: 'jsonb' },
    { name: 'avatar_url', dataType: 'text' },
  ]
  const WORDS = ['alpha', 'bravo', 'delta', 'echo', 'north', 'ridge', 'harbor', 'quartz', 'ember', 'lunar']

  /** Generate `count` positional rows (grid's real any[][] shape), chunked + async. */
  async function generateRows(count, onProgress) {
    const base = Date.UTC(2020, 0, 1)
    const out = new Array(count)
    for (let i = 0; i < count; i++) {
      const w = WORDS[i % WORDS.length]
      out[i] = [
        i + 1,
        `${w}_${i}`,
        (i % 5000) + 1,
        Math.round((i * 7.13) % 100000) / 100,
        (i & 1) === 0,
        new Date(base + i * 60000).toISOString(),
        { k: w, n: i % 100 },
        `https://avatars.example.com/u/${i % 10000}`,
      ]
      if ((i & 99999) === 99999) { onProgress?.(i + 1); await new Promise((r) => setTimeout(r, 0)) }
    }
    onProgress?.(count)
    return out
  }

  function snapshotMemoryMB() {
    const m = /** @type {any} */ (performance).memory
    if (!m || typeof m.usedJSHeapSize !== 'number') return null
    return +(m.usedJSHeapSize / 1048576).toFixed(1)
  }

  /** Measure frame rate over `durationMs`, calling onFrame(elapsed) each frame. */
  function measureFrameRate(durationMs, onFrame) {
    return new Promise((resolve) => {
      const t0 = performance.now()
      let last = t0, frames = 0, maxFrameMs = 0, longFrames = 0
      const tick = () => {
        const now = performance.now(), dt = now - last
        last = now; frames++
        if (dt > maxFrameMs) maxFrameMs = dt
        if (dt > 16.7) longFrames++
        onFrame?.(now - t0)
        if (now - t0 < durationMs) requestAnimationFrame(tick)
        else {
          const el = now - t0
          resolve({ avgFps: +((frames / el) * 1000).toFixed(1), maxFrameMs: +maxFrameMs.toFixed(1), longFrames, frames })
        }
      }
      requestAnimationFrame(tick)
    })
  }

  async function benchScroll(scrollEl, durationMs = 4000) {
    const max = scrollEl.scrollHeight - scrollEl.clientHeight
    scrollEl.scrollTop = 0
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    const stats = await measureFrameRate(durationMs, (elapsed) => { scrollEl.scrollTop = (elapsed / durationMs) * max })
    scrollEl.scrollTop = 0
    return stats
  }

  const nextPaint = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
  const fmt = (n) => n.toLocaleString()

  // ── State ─────────────────────────────────────────────────────────────────
  const SIZES = [10_000, 100_000, 1_000_000, 5_000_000]
  let rowCount = $state(100_000)
  let rows = $state(/** @type {any[][]} */ ([]))
  let running = $state(false)
  let progress = $state('')
  let wrapEl = $state(/** @type {HTMLElement | null} */ (null))
  /** @type {{ rows: number, gen: number, paint: number, fps: number, maxFrame: number, dropped: number, heapBefore: number|null, heapAfter: number|null }[]} */
  let results = $state([])

  async function run() {
    if (running) return
    running = true
    try {
      progress = 'generating…'
      const heapBefore = snapshotMemoryMB()
      const tGen = performance.now()
      const generated = await generateRows(rowCount, (done) => { progress = `generating ${fmt(done)} / ${fmt(rowCount)}` })
      const gen = performance.now() - tGen

      progress = 'painting…'
      const tPaint = performance.now()
      rows = generated
      await nextPaint()
      const paint = performance.now() - tPaint

      const scrollEl = wrapEl?.querySelector('[data-canvas-table]')
      let fps = 0, maxFrame = 0, dropped = 0
      if (scrollEl instanceof HTMLElement) {
        progress = 'scrolling…'
        const s = await benchScroll(scrollEl, 4000)
        fps = s.avgFps; maxFrame = s.maxFrameMs; dropped = s.longFrames
      }
      const heapAfter = snapshotMemoryMB()

      results = [{ rows: rowCount, gen: +gen.toFixed(0), paint: +paint.toFixed(0), fps, maxFrame, dropped, heapBefore, heapAfter }, ...results]
      progress = ''
    } finally {
      running = false
    }
  }

  function clearGrid() { rows = []; results = [] }
</script>

<div class="flex h-full min-h-0 flex-col bg-background text-foreground">
  <!-- Controls -->
  <div class="flex flex-wrap items-center gap-3 border-b border-border/50 px-4 py-3">
    <h1 class="text-sm font-semibold tracking-tight">DataTable benchmark</h1>
    <div class="flex items-center gap-1 rounded-lg bg-muted/30 p-0.5">
      {#each SIZES as s (s)}
        <button
          type="button"
          disabled={running}
          class={[
            'rounded-md px-2.5 py-1 font-mono text-xs tabular-nums transition-colors disabled:opacity-40',
            rowCount === s ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
          onclick={() => (rowCount = s)}
        >{s >= 1_000_000 ? `${s / 1_000_000}M` : `${s / 1000}k`}</button>
      {/each}
    </div>
    <button
      type="button"
      disabled={running}
      onclick={run}
      class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
    >{running ? 'Running…' : 'Run benchmark'}</button>
    <button
      type="button"
      disabled={running}
      onclick={clearGrid}
      class="inline-flex h-8 items-center rounded-lg border border-border/60 px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-40"
    >Clear</button>
    {#if progress}
      <span class="font-mono text-xs text-muted-foreground/70">{progress}</span>
    {/if}
    <span class="ml-auto font-mono text-[11px] text-muted-foreground/50">
      rendered all-in-memory (exercises canvas virtualization + scroll-height normalization)
    </span>
  </div>

  <!-- Results -->
  {#if results.length}
    <div class="overflow-x-auto border-b border-border/50 px-4 py-2">
      <table class="w-full text-left font-mono text-xs tabular-nums">
        <thead class="text-[10px] uppercase tracking-wider text-muted-foreground/50">
          <tr>
            {#each ['Rows', 'Generate', 'First paint', 'Scroll FPS', 'Worst frame', 'Dropped', 'Heap Δ'] as h (h)}
              <th class="py-1 pr-6 font-medium">{h}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each results as r, i (i)}
            <tr class="border-t border-border/25">
              <td class="py-1 pr-6">{fmt(r.rows)}</td>
              <td class="py-1 pr-6">{fmt(r.gen)} ms</td>
              <td class="py-1 pr-6">{fmt(r.paint)} ms</td>
              <td class="py-1 pr-6 {r.fps >= 55 ? 'text-emerald-500' : r.fps >= 30 ? 'text-amber-500' : 'text-red-500'}">{r.fps || '—'}</td>
              <td class="py-1 pr-6">{r.maxFrame || '—'} ms</td>
              <td class="py-1 pr-6">{r.dropped ?? '—'}</td>
              <td class="py-1 pr-6">{r.heapBefore != null && r.heapAfter != null ? `${r.heapBefore} → ${r.heapAfter} MB` : 'n/a'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- The real grid under test -->
  <div bind:this={wrapEl} class="min-h-0 flex-1">
    {#if rows.length}
      <DataTable columns={COLUMNS} {rows} tableName="benchmark" primaryKey={['id']} embedded={false} />
    {:else}
      <div class="flex h-full items-center justify-center text-sm text-muted-foreground/50">
        Pick a row count and hit “Run benchmark”.
      </div>
    {/if}
  </div>
</div>
