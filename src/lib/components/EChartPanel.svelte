<script>
  import { onDestroy } from 'svelte'

  let {
    /** @type {import('echarts').EChartsOption} */
    option = {},
    height = '100%',
    class: cls = '',
  } = $props()

  /** @type {HTMLDivElement | null} */
  let el = $state(null)
  /** @type {import('echarts').ECharts | null} */
  let chart = $state(null)   // $state so the option effect re-triggers when set
  /** @type {ResizeObserver | null} */
  let ro = null

  $effect(() => {
    const container = el
    if (!container) return

    let disposed = false
    let initializing = false

    async function tryInit() {
      // Guard: skip if already initialized, in progress, or container has no size
      if (disposed || chart || initializing) return
      if (container.clientWidth === 0 && container.clientHeight === 0) return
      initializing = true
      try {
        const { init } = await import('echarts')
        if (disposed || !container) return
        const instance = init(container, null, { renderer: 'canvas' })
        chart = instance
      } finally {
        initializing = false
      }
    }

    // First attempt after layout settles
    requestAnimationFrame(() => { if (!disposed) void tryInit() })

    // ResizeObserver: initialize when the element first gets dimensions
    // (covers hidden→visible tab transitions), resize when already initialized
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

  // Apply option whenever chart instance or option changes
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

<div bind:this={el} style="height: {height}; width: 100%;" class={cls}></div>
