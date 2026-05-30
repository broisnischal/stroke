<script>
  /**
   * Renders AI-generated charts using ECharts + the shared buildOption() utility.
   * Spec format: { type, title, data, x_col, y_col, z_col?, group_col? }
   * where data is an array of row objects from execute_sql.
   */
  import { onDestroy } from 'svelte'
  import { buildOption, colType } from '$lib/chart-utils.js'
  import { isCurrentThemeDark } from '$lib/stores/settings.js'
  import Copy from '@lucide/svelte/icons/copy'
  import Download from '@lucide/svelte/icons/download'
  import { toast } from 'svelte-sonner'

  let { spec = null } = $props()

  /** @type {HTMLDivElement | null} */
  let el = $state(null)
  /** @type {import('echarts').ECharts | null} */
  let chart = $state(null)
  /** @type {ResizeObserver | null} */
  let ro = null

  const isDark = $derived($isCurrentThemeDark)

  // Convert data array-of-objects to columns + rows format for buildOption
  const converted = $derived.by(() => {
    if (!spec?.data?.length) return null
    const keys = Object.keys(spec.data[0] ?? {})
    const columns = keys.map(k => {
      // Infer type from first non-null value
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
        title: spec.title || undefined,
      })
    } catch {
      return {}
    }
  })

  // Mount / destroy ECharts instance
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
      ro?.disconnect(); ro = null
      chart?.dispose(); chart = null
    }
  })

  // Apply option reactively
  $effect(() => {
    const c = chart
    const o = option
    if (c && o && Object.keys(o).length > 0) {
      c.setOption(o, { notMerge: true, lazyUpdate: false })
    }
  })

  onDestroy(() => { ro?.disconnect(); chart?.dispose() })

  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(option, null, 2))
      toast.success('Chart config copied')
    } catch { toast.error('Could not copy') }
  }

  function downloadPng() {
    const canvas = el?.querySelector('canvas')
    const img = canvas?.toDataURL?.('image/png')
    if (!img) { toast.error('Could not export'); return }
    const a = document.createElement('a')
    a.href = img; a.download = `chart_${Date.now()}.png`; a.click()
    toast.success('Chart downloaded')
  }

  const hasData = $derived((spec?.data?.length ?? 0) > 0)
</script>

{#if hasData}
  <div class="group/chart relative rounded-xl border border-border/30 bg-muted/10 overflow-hidden" style="height: 320px">
    <div bind:this={el} class="h-full w-full"></div>
    <!-- Hover actions -->
    <div class="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover/chart:opacity-100">
      <button
        type="button"
        onclick={copyConfig}
        class="inline-flex size-6 items-center justify-center rounded-md border border-border/50 bg-background/80 text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
        title="Copy ECharts config"
      >
        <Copy class="size-3" />
      </button>
      <button
        type="button"
        onclick={downloadPng}
        class="inline-flex size-6 items-center justify-center rounded-md border border-border/50 bg-background/80 text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
        title="Download PNG"
      >
        <Download class="size-3" />
      </button>
    </div>
  </div>
{:else}
  <div class="flex items-center justify-center rounded-xl border border-border bg-muted/20 px-4 py-8 text-ui-sm text-muted-foreground">
    No data to display
  </div>
{/if}
