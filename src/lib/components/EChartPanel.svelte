<script>
  import { onDestroy } from 'svelte'

  let {
    /** @type {import('echarts').EChartsOption} */
    option = {},
    height = '100%',
    /**
     * 'svg' (default): resolution-independent, always crisp, lower memory.
     * 'canvas': use only when GPU acceleration is needed (interactive 3D, etc).
     */
    renderer = /** @type {'svg' | 'canvas'} */ ('canvas'),
    class: cls = '',
  } = $props()

  /** @type {HTMLDivElement | null} */
  let el = $state(null)
  /** @type {import('echarts').ECharts | null} */
  let chart = $state(null)
  /** @type {ResizeObserver | null} */
  let ro = null
  /** @type {IntersectionObserver | null} */
  let io = null
  /** @type {number} rAF handle for coalescing resize bursts */
  let resizeRaf = 0

  $effect(() => {
    const container = el
    const r = renderer  // track so effect re-runs if renderer prop changes
    if (!container) return

    let disposed = false
    let initializing = false

    async function tryInit() {
      if (disposed || chart || initializing) return
      // Guard: skip if container has no renderable area.
      // Avoids ECharts "Can't get DOM width or height" warning on hidden elements.
      if (container.clientWidth === 0 || container.clientHeight === 0) return
      initializing = true
      try {
        const { init } = await import('echarts')
        // Register the wordcloud series plugin lazily (keeps echarts out of startup bundle).
        await import('echarts-wordcloud')
        if (disposed) return
        const opts = renderer === 'canvas'
          ? { renderer: /** @type {'canvas'} */ ('canvas'), devicePixelRatio: window.devicePixelRatio || 2 }
          : { renderer: /** @type {'svg'} */ ('svg') }
        chart = init(container, null, opts)
      } finally {
        initializing = false
      }
    }

    // IntersectionObserver: defer init until the container is actually on-screen.
    // Charts in hidden tabs or below the fold are never initialized until visible,
    // which eliminates the 0-dimension warning and reduces idle memory usage.
    io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) void tryInit() },
      { threshold: 0, rootMargin: '100px' },
    )
    io.observe(container)

    // ResizeObserver: react to layout changes.
    // Guard the 0-dimension case here too - hidden containers fire with 0×0
    // and calling chart.resize() on a 0×0 canvas triggers the ECharts warning.
    ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width === 0 || height === 0) return
      if (!chart) { void tryInit(); return }
      // Coalesce resize bursts (pane drags / window resizes fire many events per
      // frame) into a single chart.resize() per animation frame - a synchronous
      // resize on every event janks the whole UI.
      if (resizeRaf) return
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        if (!disposed) chart?.resize()
      })
    })
    ro.observe(container)

    return () => {
      disposed = true
      if (resizeRaf) { cancelAnimationFrame(resizeRaf); resizeRaf = 0 }
      io?.disconnect(); io = null
      ro?.disconnect(); ro = null
      chart?.dispose(); chart = null
    }
  })

  // Keep chart in sync with option changes.
  // lazyUpdate batches setOption calls that arrive in the same task - reduces
  // unnecessary redraws when multiple reactive updates fire together.
  $effect(() => {
    const c = chart
    const o = option
    if (c && o && Object.keys(o).length > 0) {
      c.setOption(o, { notMerge: true, lazyUpdate: true })
    }
  })

  onDestroy(() => {
    io?.disconnect()
    ro?.disconnect()
    chart?.dispose()
  })
</script>

<div
  bind:this={el}
  style={cls ? '' : `height: ${height}; width: 100%;`}
  class={cls || ''}
></div>
