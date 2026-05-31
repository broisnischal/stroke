<script>
  /**
   * Renders AI-generated charts using ECharts + the shared buildOption() utility.
   * Spec format: { type, title, data, x_col, y_col, z_col?, group_col? }
   */
  import { onDestroy } from 'svelte'
  import { buildOption } from '$lib/chart-utils.js'
  import { isCurrentThemeDark } from '$lib/stores/settings.js'
  import { toast } from 'svelte-sonner'
  import ChoroplethChart from './ChoroplethChart.svelte'
  import CarbonMeterChart from './CarbonMeterChart.svelte'

  let {
    spec = null,
    /** Suppress the in-chart title (caller shows it in the card header) */
    noTitle = false,
    /** When true (fullscreen mode), all scroll zooms — no interception needed */
    scrollZoom = false,
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
      const base = buildOption({
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
      // In scroll-zoom (fullscreen) mode, add inside dataZoom for all axis-based charts
      if (scrollZoom && base && Object.keys(base).length > 0) {
        return { ...base, dataZoom: [{ type: 'inside', zoomOnMouseWheel: true, moveOnMouseWheel: false }] }
      }
      return base
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
        // Scroll zoom:
        // • scrollZoom=true (fullscreen): let ECharts handle all wheel natively — no interception
        // • inline: Ctrl/Cmd+scroll → synthesize plain wheel for ECharts zoom
        //           plain scroll   → stopPropagation so browser scrolls the page naturally
        if (!scrollZoom) {
          container.addEventListener('wheel', (e) => {
            if (!e.isTrusted) return
            e.stopPropagation()
            if (e.ctrlKey || e.metaKey) {
              const canvas = container.querySelector('canvas')
              canvas?.dispatchEvent(new WheelEvent('wheel', {
                deltaY: e.deltaY, deltaMode: e.deltaMode,
                clientX: e.clientX, clientY: e.clientY,
                bubbles: false, cancelable: true,
              }))
            }
          }, { capture: true, passive: false })
        }
        // Double-click → restore to initial view
        container.addEventListener('dblclick', () => {
          instance.dispatchAction({ type: 'restore' })
        })
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

  /** @type {ChoroplethChart|null} */
  let choroplethRef = $state(null)

  export function resetView() {
    if (choroplethRef) { choroplethRef.resetView(); return }
    chart?.dispatchAction({ type: 'restore' })
  }

  const hasData = $derived((spec?.data?.length ?? 0) > 0)
</script>

{#if spec?.type === 'choropleth'}
  <ChoroplethChart bind:this={choroplethRef} {spec} {noTitle} {scrollZoom} />
{:else if spec?.type === 'meter'}
  <CarbonMeterChart {spec} {noTitle} />
{:else if hasData}
  <div bind:this={el} class="h-full w-full"></div>
{:else}
  <div class="flex items-center justify-center h-full text-ui-xs text-muted-foreground/50">
    No data
  </div>
{/if}
