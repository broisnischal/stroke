<script>
  import { onMount, onDestroy } from 'svelte'
  import { Chart, registerables } from 'chart.js'

  Chart.register(...registerables)

  let { spec = null } = $props()

  /** @type {HTMLCanvasElement | null} */
  let canvasEl = $state(null)
  /** @type {Chart | null} */
  let chartInstance = null

  function getThemeColors() {
    const style = getComputedStyle(document.documentElement)
    const get = (v) => style.getPropertyValue(v).trim()
    return {
      gridColor: 'rgba(128,128,128,0.12)',
      tickColor: 'rgba(128,128,128,0.7)',
      tooltipBg: get('--popover') || (document.documentElement.classList.contains('dark') ? '#1c1c1e' : '#ffffff'),
      tooltipText: get('--foreground') || (document.documentElement.classList.contains('dark') ? '#f5f5f5' : '#111111'),
    }
  }

  const PALETTE = [
    '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
  ]

  function buildChartConfig(spec, colors) {
    const { type, title, data = [], x_key, y_keys = [] } = spec
    const labels = data.map((d) => String(d[x_key] ?? ''))
    const isPie = type === 'pie' || type === 'doughnut'

    let datasets
    if (isPie) {
      const key = y_keys[0]?.key ?? (Object.keys(data[0] ?? {}).find((k) => k !== x_key) || 'value')
      datasets = [{
        data: data.map((d) => Number(d[key] ?? 0)),
        backgroundColor: PALETTE.slice(0, data.length),
        borderWidth: 1,
        borderColor: 'transparent',
        hoverBorderColor: 'transparent',
      }]
    } else {
      datasets = y_keys.map((s, i) => {
        const color = PALETTE[i % PALETTE.length]
        const isArea = type === 'area'
        return {
          label: s.label || s.key,
          data: data.map((d) => {
            const v = d[s.key]
            return v != null ? Number(v) : null
          }),
          borderColor: color,
          backgroundColor: isArea ? `${color}26` : type === 'bar' ? `${color}cc` : color,
          fill: isArea,
          tension: type === 'line' || type === 'area' ? 0.35 : 0,
          borderWidth: type === 'bar' ? 0 : 2,
          borderRadius: type === 'bar' ? 4 : 0,
          pointRadius: type === 'scatter' ? 5 : type === 'line' || type === 'area' ? 3 : 0,
          pointHoverRadius: 5,
        }
      })
    }

    const chartType = type === 'area' ? 'line' : type
    const scales = isPie ? {} : {
      x: {
        grid: { color: colors.gridColor, drawBorder: false },
        ticks: { color: colors.tickColor, maxRotation: 45, font: { size: 11 } },
      },
      y: {
        grid: { color: colors.gridColor, drawBorder: false },
        ticks: { color: colors.tickColor, font: { size: 11 } },
        beginAtZero: true,
      },
    }

    return {
      type: chartType,
      data: { labels, datasets },
      options: {
        responsive: true,
        // Fill the fixed-height container instead of deriving height from the
        // aspect ratio. With maintainAspectRatio:true in a non-fixed-height
        // box, the canvas resize feeds back into the container size and Chart.js
        // ResizeObserver loops forever, pegging the CPU. resizeDelay debounces
        // any legitimate resizes.
        maintainAspectRatio: false,
        resizeDelay: 100,
        animation: { duration: 350 },
        plugins: {
          legend: {
            display: isPie || y_keys.length > 1,
            position: isPie ? 'bottom' : 'top',
            labels: { color: colors.tickColor, font: { size: 11 }, boxWidth: 12, padding: 12 },
          },
          title: {
            display: !!title,
            text: title,
            color: colors.tooltipText,
            font: { size: 13, weight: '600' },
            padding: { bottom: 12 },
          },
          tooltip: {
            backgroundColor: colors.tooltipBg,
            titleColor: colors.tooltipText,
            bodyColor: colors.tickColor,
            borderColor: 'rgba(128,128,128,0.2)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
          },
        },
        scales,
      },
    }
  }

  function buildChart() {
    if (!canvasEl || !spec?.data?.length) return
    const colors = getThemeColors()
    const config = buildChartConfig(spec, colors)
    chartInstance?.destroy()
    chartInstance = new Chart(canvasEl, config)
  }

  $effect(() => {
    if (spec && canvasEl) {
      buildChart()
    }
  })

  // Rebuild on theme change
  onMount(() => {
    const obs = new MutationObserver(() => {
      if (chartInstance) buildChart()
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => obs.disconnect()
  })

  onDestroy(() => {
    chartInstance?.destroy()
    chartInstance = null
  })
</script>

{#if spec?.data?.length}
  <!-- Fixed height (not max-height) so maintainAspectRatio:false has a definite
       box to fill and the canvas never feeds its size back into the layout. -->
  <div class="relative w-full" style="height: 320px;">
    <canvas bind:this={canvasEl}></canvas>
  </div>
{:else}
  <div class="flex items-center justify-center rounded-lg border border-border bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
    No data to display
  </div>
{/if}
