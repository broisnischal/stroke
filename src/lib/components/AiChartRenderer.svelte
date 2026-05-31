<script>
  /**
   * Renders AI-generated charts using ECharts + the shared buildOption() utility.
   * Spec format: { type, title, data, x_col, y_col, z_col?, group_col? }
   */
  import { onDestroy } from 'svelte'
  import { buildOption } from '$lib/chart-utils.js'
  import { isCurrentThemeDark } from '$lib/stores/settings.js'
  import { toast } from 'svelte-sonner'

  let {
    spec = null,
    /** Suppress the in-chart title (caller shows it in the card header) */
    noTitle = false,
  } = $props()

  /** @type {HTMLDivElement | null} */
  let el = $state(null)
  /** @type {import('echarts').ECharts | null} */
  let chart = $state(null)
  /** @type {ResizeObserver | null} */
  let ro = null

  const isDark = $derived($isCurrentThemeDark)

  const converted = $derived.by(() => {
    if (!spec?.data?.length) return null
    const keys = Object.keys(spec.data[0] ?? {})
    const columns = keys.map(k => {
      const sample = spec.data.find(r => r[k] != null)?.[k]
      const dt = typeof sample === 'number' ? 'numeric'
        : typeof sample === 'string' && /^\d{4}-\d{2}/.test(sample) ? 'timestamp'
        : 'text'
      return { name: k, dataType: dt, data_type: dt }
    })
    const rows = spec.data.map(obj => keys.map(k => obj[k]))
    return { columns, rows }
  })

  const option = $derived.by(() => {
    if (!converted || !spec) return {}
    const { columns, rows } = converted
    try {
      return buildOption({
        type: spec.type ?? 'bar',
        columns,
        rows,
        xCol: spec.x_col ?? columns[0]?.name ?? '',
        yCol: spec.y_col ?? columns[1]?.name ?? '',
        zCol: spec.z_col || undefined,
        groupCol: spec.group_col || undefined,
        isDark,
        title: noTitle ? undefined : (spec.title || undefined),
        noTitle,
      })
    } catch {
      return {}
    }
  })

  $effect(() => {
    const container = el
    if (!container) return
    let disposed = false
    let initializing = false

    async function tryInit() {
      if (disposed || chart || initializing) return
      if (container.clientWidth === 0 || container.clientHeight === 0) return
      initializing = true
      try {
        const { init } = await import('echarts')
        if (disposed) return
        const instance = init(container, null, {
          renderer: 'canvas',
          devicePixelRatio: window.devicePixelRatio || 2,
        })
        chart = instance
        ro = new ResizeObserver((entries) => {
          const { width, height } = entries[0].contentRect
          if (width === 0 || height === 0) return
          instance.resize()
        })
        ro.observe(container)
      } finally {
        initializing = false
      }
    }

    // Defer init until the container is on-screen
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) void tryInit() },
      { threshold: 0 },
    )
    io.observe(container)

    return () => {
      disposed = true
      io.disconnect()
      ro?.disconnect(); ro = null
      chart?.dispose(); chart = null
    }
  })

  $effect(() => {
    const c = chart
    const o = option
    if (c && o && Object.keys(o).length > 0) {
      c.setOption(o, { notMerge: true, lazyUpdate: true })
    }
  })

  onDestroy(() => { ro?.disconnect(); chart?.dispose() })

  export function downloadPng(filename = 'chart.png') {
    const canvas = el?.querySelector('canvas')
    const img = canvas?.toDataURL?.('image/png')
    if (!img) { toast.error('Could not export chart'); return }
    const a = document.createElement('a')
    a.href = img; a.download = filename; a.click()
    toast.success('Chart saved as PNG')
  }

  const hasData = $derived((spec?.data?.length ?? 0) > 0)
</script>

{#if hasData}
  <div bind:this={el} class="h-full w-full"></div>
{:else}
  <div class="flex items-center justify-center h-full text-ui-xs text-muted-foreground/50">
    No data
  </div>
{/if}
