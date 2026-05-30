<script>
  import EChartPanel from './EChartPanel.svelte'
  import { buildOption, guessXCol, guessYCol, isChartable, colType } from '$lib/chart-utils.js'
  import { isCurrentThemeDark } from '$lib/stores/settings.js'
  import { cn } from '$lib/utils.js'
  import BarChart2 from '@lucide/svelte/icons/bar-chart-2'
  import LineChart from '@lucide/svelte/icons/line-chart'
  import AreaChart from '@lucide/svelte/icons/area-chart'
  import PieChart from '@lucide/svelte/icons/pie-chart'
  import Scatter from '@lucide/svelte/icons/scatter-chart'
  import Grid3x3 from '@lucide/svelte/icons/grid-3x3'
  import Download from '@lucide/svelte/icons/download'
  import Copy from '@lucide/svelte/icons/copy'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import { toast } from 'svelte-sonner'

  /** @typedef {'bar'|'line'|'area'|'pie'|'scatter'|'heatmap'} ChartType */
  /** @typedef {{ name: string, dataType?: string, data_type?: string }} ColInfo */

  let {
    /** @type {ColInfo[]} */
    columns = [],
    /** @type {unknown[][]} */
    rows = [],
  } = $props()

  // ── Chart type ────────────────────────────────────────────────────────────
  /** @type {ChartType} */
  let chartType = $state('bar')

  const CHART_TYPES = /** @type {const} */ ([
    { id: 'bar',      label: 'Bar',      Icon: BarChart2  },
    { id: 'line',     label: 'Line',     Icon: LineChart  },
    { id: 'area',     label: 'Area',     Icon: AreaChart  },
    { id: 'pie',      label: 'Pie',      Icon: PieChart   },
    { id: 'scatter',  label: 'Scatter',  Icon: Scatter    },
    { id: 'heatmap',  label: 'Heatmap',  Icon: Grid3x3    },
  ])

  // ── Axis selection ────────────────────────────────────────────────────────
  const numericCols = $derived(columns.filter(c => colType(c) === 'number'))
  const allCols     = $derived(columns.map(c => c.name))

  let xCol    = $state('')
  let yCol    = $state('')
  let groupCol = $state('')

  // Auto-pick sensible defaults when columns change
  $effect(() => {
    const gx = guessXCol(columns)
    const gy = guessYCol(columns, gx)
    xCol = gx
    yCol = gy
    groupCol = ''
  })

  // ── Build ECharts option ──────────────────────────────────────────────────
  const isDark = $derived($isCurrentThemeDark)

  const option = $derived.by(() => {
    if (!xCol || !yCol || rows.length === 0) return {}
    return buildOption({
      type: chartType,
      columns,
      rows,
      xCol,
      yCol,
      groupCol: groupCol || undefined,
      isDark,
    })
  })

  // ── Export helpers ────────────────────────────────────────────────────────
  /** @type {import('./EChartPanel.svelte').default | null} */
  let panelEl = $state(null)

  function downloadPng() {
    // @ts-ignore — echarts instance is exposed via the bound element
    const img = panelEl?.$el?.querySelector('canvas')?.toDataURL?.('image/png')
    if (!img) { toast.error('Could not export chart'); return }
    const a = document.createElement('a')
    a.href = img
    a.download = `chart_${Date.now()}.png`
    a.click()
    toast.success('Chart downloaded')
  }

  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(option, null, 2))
      toast.success('ECharts config copied')
    } catch {
      toast.error('Could not copy')
    }
  }

  const chartable = $derived(isChartable(columns))

  const btnBase = 'inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-ui-xs transition-colors'
  const iconOnlyBtn = 'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">

  {#if !chartable}
    <div class="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <BarChart2 class="size-8 text-muted-foreground/20" />
      <p class="text-ui-sm text-muted-foreground/50">Need at least one numeric column to chart</p>
    </div>
  {:else}

    <!-- ── Toolbar ─────────────────────────────────────────────────────── -->
    <div class="studio-chrome flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/50 bg-panel px-3 py-1.5" data-studio-chrome>

      <!-- Chart type pills -->
      <div class="flex items-center gap-0.5 rounded-lg border border-border/50 bg-muted/30 p-0.5">
        {#each CHART_TYPES as t (t.id)}
          <button
            type="button"
            title={t.label}
            class={cn(
              btnBase,
              'gap-1 px-2 py-1',
              chartType === t.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onclick={() => (chartType = /** @type {ChartType} */ (t.id))}
          >
            <t.Icon class="size-3.5" />
            <span class="hidden sm:inline">{t.label}</span>
          </button>
        {/each}
      </div>

      <div class="mx-1 h-4 w-px shrink-0 bg-border/50"></div>

      <!-- Axis pickers -->
      <div class="flex flex-wrap items-center gap-1.5">

        <!-- X axis -->
        <div class="flex items-center gap-1">
          <span class="text-ui-2xs font-medium text-muted-foreground/60 uppercase tracking-wide">
            {chartType === 'scatter' ? 'X' : chartType === 'pie' ? 'Label' : 'X'}
          </span>
          <div class="relative">
            <select
              bind:value={xCol}
              class="h-6 appearance-none rounded border border-border/50 bg-background/60 pl-2 pr-6 font-mono text-ui-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
            >
              {#each allCols as col (col)}
                <option value={col}>{col}</option>
              {/each}
            </select>
            <ChevronDown class="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/50" />
          </div>
        </div>

        <!-- Y axis -->
        <div class="flex items-center gap-1">
          <span class="text-ui-2xs font-medium text-muted-foreground/60 uppercase tracking-wide">
            {chartType === 'scatter' ? 'Y' : chartType === 'pie' ? 'Value' : 'Y'}
          </span>
          <div class="relative">
            <select
              bind:value={yCol}
              class="h-6 appearance-none rounded border border-border/50 bg-background/60 pl-2 pr-6 font-mono text-ui-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
            >
              {#each numericCols as col (col.name)}
                <option value={col.name}>{col.name}</option>
              {/each}
            </select>
            <ChevronDown class="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/50" />
          </div>
        </div>

        <!-- Group / series (bar, line, area, heatmap only) -->
        {#if chartType !== 'pie' && chartType !== 'scatter'}
          <div class="flex items-center gap-1">
            <span class="text-ui-2xs font-medium text-muted-foreground/60 uppercase tracking-wide">
              {chartType === 'heatmap' ? 'Y axis' : 'Group'}
            </span>
            <div class="relative">
              <select
                bind:value={groupCol}
                class="h-6 appearance-none rounded border border-border/50 bg-background/60 pl-2 pr-6 font-mono text-ui-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
              >
                <option value="">None</option>
                {#each allCols.filter(c => c !== xCol && c !== yCol) as col (col)}
                  <option value={col}>{col}</option>
                {/each}
              </select>
              <ChevronDown class="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/50" />
            </div>
          </div>
        {/if}
      </div>

      <!-- Spacer + actions -->
      <div class="ml-auto flex items-center gap-0.5">
        <span class="font-mono text-ui-2xs text-muted-foreground/40">{rows.length.toLocaleString()} rows</span>
        <div class="mx-1.5 h-4 w-px bg-border/50"></div>
        <button type="button" class={iconOnlyBtn} title="Copy ECharts config (for AI)" onclick={copyConfig}>
          <Copy class="size-3.5" />
        </button>
        <button type="button" class={iconOnlyBtn} title="Download as PNG" onclick={downloadPng}>
          <Download class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- ── Chart canvas ────────────────────────────────────────────────── -->
    <div class="min-h-0 flex-1 p-3">
      {#if rows.length === 0}
        <div class="flex h-full items-center justify-center">
          <p class="text-ui-sm text-muted-foreground/40">No data to display</p>
        </div>
      {:else}
        <EChartPanel {option} height="100%" />
      {/if}
    </div>

  {/if}
</div>
