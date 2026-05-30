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
  let chart = $state(null)   // $state so the option effect re-runs when this resolves
  /** @type {ResizeObserver | null} */
  let ro = null

  // Mount echarts when the div is ready
  $effect(() => {
    const container = el
    if (!container) return

    let disposed = false

    import('echarts').then(({ init }) => {
      if (disposed || !container) return
      const instance = init(container, null, { renderer: 'canvas' })
      chart = instance
      ro = new ResizeObserver(() => instance.resize())
      ro.observe(container)
    })

    return () => {
      disposed = true
      ro?.disconnect()
      ro = null
      chart?.dispose()
      chart = null
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
