<script>
  import { onDestroy } from 'svelte'

  let {
    /** @type {import('echarts').EChartsOption} */
    option = {},
    height = '100%',
    /**
     * 'svg' (default): resolution-independent, always crisp on any DPI.
     * 'canvas': use only for interactive charts needing GPU acceleration.
     */
    renderer = /** @type {'svg' | 'canvas'} */ ('svg'),
    class: cls = '',
  } = $props()

  /** @type {HTMLDivElement | null} */
  let el = $state(null)
  /** @type {import('echarts').ECharts | null} */
  let chart = $state(null)
  /** @type {ResizeObserver | null} */
  let ro = null

  $effect(() => {
    const container = el
    if (!container) return

    let disposed = false
    let initializing = false

    async function tryInit() {
      if (disposed || chart || initializing) return
      if (container.clientWidth === 0 && container.clientHeight === 0) return
      initializing = true
      try {
        const { init } = await import('echarts')
        if (disposed || !container) return
        const opts = renderer === 'canvas'
          ? { renderer: /** @type {'canvas'} */ ('canvas'), devicePixelRatio: window.devicePixelRatio || 2 }
          : { renderer: /** @type {'svg'} */ ('svg') }
        const instance = init(container, null, opts)
        chart = instance
      } finally {
        initializing = false
      }
    }

    requestAnimationFrame(() => { if (!disposed) void tryInit() })

    ro = new ResizeObserver(() => {
      if (!chart) {
        void tryInit()
      } else {
        chart.resize()
      }
    })
    ro.observe(container)

    return () => {
      disposed = true
      ro?.disconnect(); ro = null
      chart?.dispose(); chart = null
    }
  })

  $effect(() => {
    const c = chart
    const o = option
    if (c && o && Object.keys(o).length > 0) {
      c.setOption(o, { notMerge: true, lazyUpdate: false })
    }
  })

  onDestroy(() => {
    ro?.disconnect()
    chart?.dispose()
  })
</script>

<div
  bind:this={el}
  style={cls ? '' : `height: ${height}; width: 100%;`}
  class={cls || ''}
></div>
