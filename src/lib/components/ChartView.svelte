<script>
  import { untrack } from 'svelte'
  import EChartPanel from './EChartPanel.svelte'
  import {
    buildOption, guessXCol, guessYCol, isChartable,
    colType, getRequiredAxes, CHART_CATALOG, resolveChartAccent,
  } from '$lib/chart-utils.js'
  import { isCurrentThemeDark } from '$lib/stores/settings.js'
  import { chartGroups, saveChart, addGroup } from '$lib/stores/saved-charts.js'
  import { cn } from '$lib/utils.js'
  import { toast } from '$lib/components/ui/sonner/toast.svelte.js'
  import ChevronDown  from '@lucide/svelte/icons/chevron-down'
  import Download     from '@lucide/svelte/icons/download'
  import Copy         from '@lucide/svelte/icons/copy'
  import Bookmark     from '@lucide/svelte/icons/bookmark'
  import X            from '@lucide/svelte/icons/x'
  import Check        from '@lucide/svelte/icons/check'
  import BarChart2    from '@lucide/svelte/icons/bar-chart-2'
  import Plus         from '@lucide/svelte/icons/plus'
  import Search       from '@lucide/svelte/icons/search'
  import CarbonMeterChart from './CarbonMeterChart.svelte'

  /** @typedef {{ name: string, dataType?: string, data_type?: string }} ColInfo */

  let {
    /** @type {ColInfo[]} */
    columns = [],
    /** @type {unknown[][]} */
    rows = [],
    /** @type {string} */
    sql = '',
    /** @type {string} */
    connectionId = '',
    initialChartType = 'bar',
    oncharttypechange = undefined,
  } = $props()

  // ── Chart type ────────────────────────────────────────────────────────────
  let chartType = $state(untrack(() => initialChartType ?? 'bar'))

  const currentEntry = $derived(CHART_CATALOG.find(c => c.id === chartType) ?? CHART_CATALOG[0])

  // ── Picker popover ────────────────────────────────────────────────────────
  let pickerOpen = $state(false)
  let pickerSearch = $state('')
  /** @type {HTMLDivElement | null} */
  let pickerRef = $state(null)
  /** @type {HTMLButtonElement | null} */
  let pickerTrigger = $state(null)

  const GROUPS_ORDER = ['Bar','Line & Area','Part-to-Whole','Correlation','Distribution','Hierarchical','Flow','Other']

  const filteredCatalog = $derived.by(() => {
    const q = pickerSearch.toLowerCase().trim()
    if (!q) return CHART_CATALOG
    return CHART_CATALOG.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.group.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q)
    )
  })

  const filteredByGroup = $derived(
    GROUPS_ORDER
      .map(g => ({ group: g, charts: filteredCatalog.filter(c => c.group === g) }))
      .filter(g => g.charts.length > 0)
  )

  function selectChartType(id) {
    chartType = id
    oncharttypechange?.(id)
    pickerOpen = false
    pickerSearch = ''
  }

  function onPickerKeydown(/** @type {KeyboardEvent} */ e) {
    if (e.key === 'Escape') { pickerOpen = false; pickerSearch = '' }
  }

  // Close on outside click
  $effect(() => {
    if (!pickerOpen) return
    function handler(e) {
      if (
        pickerRef && !pickerRef.contains(/** @type {Node} */ (e.target)) &&
        pickerTrigger && !pickerTrigger.contains(/** @type {Node} */ (e.target))
      ) {
        pickerOpen = false
        pickerSearch = ''
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  })

  // ── Axis selection ────────────────────────────────────────────────────────

  // Cap the rows that reach chart building. Past this, uniform sampling keeps
  // rendering responsive and prevents the O(n) coercion pass and buildOption's
  // aggregation/Math ops from freezing or crashing on huge (≈1M-row) results.
  // Aggregating charts (bar/pie/line) still represent the whole set closely; the
  // toolbar flags when data was sampled.
  const MAX_CHART_ROWS = 50_000
  const sampled = $derived(rows.length > MAX_CHART_ROWS)
  const chartRows = $derived.by(() => {
    if (rows.length <= MAX_CHART_ROWS) return rows
    const step = rows.length / MAX_CHART_ROWS
    const out = new Array(MAX_CHART_ROWS)
    for (let i = 0; i < MAX_CHART_ROWS; i++) out[i] = rows[Math.floor(i * step)]
    return out
  })

  // Sniff row data to detect numeric columns that the DB reported with no/wrong type
  const effectiveColumns = $derived.by(() => {
    if (!rows.length) return columns
    return columns.map((col, i) => {
      if (colType(col) === 'number') return col
      const samples = chartRows.slice(0, 20).map(r => /** @type {any} */ (r)[i]).filter(v => v != null && v !== '')
      if (samples.length === 0) return col
      const allNumeric = samples.every(v =>
        typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)))
      )
      return allNumeric ? { ...col, dataType: 'number', data_type: 'number' } : col
    })
  })

  // Coerce string-encoded numerics to actual numbers in rows
  const effectiveRows = $derived.by(() => {
    if (!rows.length) return rows
    return chartRows.map(row =>
      /** @type {any[]} */ (row).map((v, i) => {
        if (effectiveColumns[i] && colType(effectiveColumns[i]) === 'number' && typeof v === 'string') {
          const n = Number(v)
          return isNaN(n) ? v : n
        }
        return v
      })
    )
  })

  const numericCols = $derived(effectiveColumns.filter(c => colType(c) === 'number'))
  const allCols     = $derived(effectiveColumns.map(c => c.name))
  const requiredAxes = $derived(getRequiredAxes(chartType))

  let xCol     = $state('')
  let yCol     = $state('')
  let zCol     = $state('')
  let groupCol = $state('')

  // Seed / repair the axis selections when the available columns change, but
  // KEEP the user's manual picks as long as they still refer to a real column.
  // (The old version reset all four on every columns change, silently undoing
  // whatever axes the user had chosen whenever the derived column list churned.)
  $effect(() => {
    const names = new Set(effectiveColumns.map((c) => c.name))
    untrack(() => {
      const gx = xCol && names.has(xCol) ? xCol : guessXCol(effectiveColumns)
      xCol = gx
      yCol = yCol && names.has(yCol) ? yCol : guessYCol(effectiveColumns, gx)
      if (zCol && !names.has(zCol)) zCol = ''
      if (groupCol && !names.has(groupCol)) groupCol = ''
    })
  })

  // ── Chart option ──────────────────────────────────────────────────────────
  const isDark = $derived($isCurrentThemeDark)

  // Resolve the app's --primary token to a concrete rgb() string so charts follow
  // the current theme. Reading the CSS var directly yields oklch(), which
  // zrender/ECharts can't parse - painting it onto a probe element lets the
  // browser normalise it to rgb(). Recomputes when the theme (isDark) flips.
  // Re-resolve the theme accent whenever the theme flips. buildOption also
  // resolves it internally as a default, so non-ChartView chart paths (AI charts,
  // previews) stay themed too; passing it here keeps the table/SQL charts
  // reactive to live theme changes.
  const accent = $derived.by(() => {
    void isDark // dep: re-resolve on theme change
    return resolveChartAccent()
  })

  // Canvas renderer is faster for data charts; SVG only for small previews.
  // Threshold at 500: below that SVG is fine, above that canvas wins noticeably.
  const renderer = $derived(effectiveRows.length > 500 ? 'canvas' : 'svg')

  const option = $derived.by(() => {
    if (!xCol || effectiveRows.length === 0) return {}
    const needsY = !['histogram', 'tree'].includes(chartType)
    if (needsY && !yCol) return {}
    // Degrade a bad build to an empty chart instead of throwing into the render
    // tree (the <svelte:boundary> below is the backstop for render-time throws).
    try {
      return buildOption({ type: chartType, columns: effectiveColumns, rows: effectiveRows, xCol, yCol: yCol || xCol, zCol: zCol || undefined, groupCol: groupCol || undefined, isDark, accent })
    } catch (e) {
      console.error('chart buildOption failed', e)
      return {}
    }
  })

  const meterSpec = $derived.by(() => {
    if (chartType !== 'meter') return null
    const xi2 = effectiveColumns.findIndex(c => c.name === xCol)
    const yi2 = effectiveColumns.findIndex(c => c.name === yCol)
    const zi2 = zCol ? effectiveColumns.findIndex(c => c.name === zCol) : -1
    return { data: effectiveRows, x_col: xi2, y_col: yi2, z_col: zi2 >= 0 ? zi2 : undefined }
  })

  // ── Actions ───────────────────────────────────────────────────────────────
  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(option, null, 2))
      toast.success('ECharts config copied')
    } catch { toast.error('Could not copy') }
  }

  function downloadPng() {
    const canvas = document.querySelector('.chart-canvas-host canvas')
    const img = /** @type {HTMLCanvasElement|null} */ (canvas)?.toDataURL?.('image/png')
    if (!img) { toast.error('Could not export chart'); return }
    const a = document.createElement('a')
    a.href = img
    a.download = `chart_${Date.now()}.png`
    a.click()
    toast.success('Chart downloaded')
  }

  // ── Save panel ────────────────────────────────────────────────────────────
  let saveOpen      = $state(false)
  let saveName      = $state('')
  let saveGroup     = $state('Default')
  let newGroupMode  = $state(false)
  let newGroupName  = $state('')

  function openSavePanel() {
    saveName = ''; saveGroup = $chartGroups[0] ?? 'Default'
    newGroupMode = false; newGroupName = ''; saveOpen = true
  }

  function commitSave() {
    const name = saveName.trim()
    if (!name) { toast.error('Enter a chart name'); return }
    let group = saveGroup
    if (newGroupMode) {
      const ng = newGroupName.trim()
      if (!ng) { toast.error('Enter a group name'); return }
      addGroup(ng); group = ng
    }
    saveChart({ name, group, connectionId, sql, config: { type: chartType, xCol, yCol, zCol: zCol||undefined, groupCol: groupCol||undefined }, previewOption: Object.keys(option).length > 0 ? option : undefined })
    toast.success(`"${name}" saved`)
    saveOpen = false
  }

  const chartable = $derived(isChartable(effectiveColumns))

  const axisToken = 'relative flex h-7 items-center overflow-hidden rounded-md border border-border/40 bg-muted/20 transition-colors hover:border-border/60 focus-within:border-ring/50'
  const axisLabel = 'shrink-0 select-none border-r border-border/30 px-2 text-ui-2xs font-semibold uppercase tracking-widest text-muted-foreground/35'
  const axisSelect = 'h-full cursor-pointer appearance-none bg-transparent pl-2 pr-5 font-mono text-ui-xs text-foreground outline-none'
  const iconBtn = 'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground'
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">

  {#if !chartable}
    <div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <BarChart2 class="size-9 text-muted-foreground/20" />
      <p class="text-ui-sm text-muted-foreground/50">Need at least one numeric column to chart</p>
    </div>
  {:else}

    <!-- ── Single-row toolbar ─────────────────────────────────────────── -->
    <div
      class="studio-chrome relative flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/50 bg-panel px-3 py-1.5"
      data-studio-chrome
    >

      <!-- Chart type trigger -->
      <div class="relative">
        <button
          bind:this={pickerTrigger}
          type="button"
          onclick={() => { pickerOpen = !pickerOpen; pickerSearch = '' }}
          class={cn(
            'flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-ui-xs font-medium transition-colors',
            pickerOpen
              ? 'border-ring/60 bg-accent text-foreground'
              : 'border-border/40 bg-muted/20 text-foreground hover:border-border/60 hover:bg-muted/30',
          )}
        >
          <BarChart2 class="size-3.5 shrink-0 text-muted-foreground" />
          <span>{currentEntry?.label ?? 'Chart'}</span>
          <ChevronDown class={cn('size-3 shrink-0 text-muted-foreground/60 transition-transform', pickerOpen && 'rotate-180')} />
        </button>

        <!-- Searchable chart picker popover -->
        {#if pickerOpen}
          <div
            role="listbox"
            tabindex="-1"
            bind:this={pickerRef}
            onkeydown={onPickerKeydown}
            class="absolute left-0 top-full z-50 mt-1 w-[480px] overflow-hidden rounded-xl border border-border/60 bg-popover/95 shadow-xl backdrop-blur-xl"
          >
            <!-- Search -->
            <div class="flex items-center gap-2 border-b border-border/40 px-3 py-2">
              <Search class="size-3.5 shrink-0 text-muted-foreground/50" />
              <input
                type="text"
                placeholder="Search chart types…"
                bind:value={pickerSearch}
                class="flex-1 bg-transparent font-mono text-ui-xs text-foreground outline-none placeholder:text-muted-foreground/40"
              />
              {#if pickerSearch}
                <button type="button" onclick={() => (pickerSearch = '')} class="text-muted-foreground/40 hover:text-muted-foreground">
                  <X class="size-3.5" />
                </button>
              {/if}
            </div>

            <!-- Chart grid -->
            <div class="max-h-72 overflow-y-auto p-2">
              {#if filteredByGroup.length === 0}
                <p class="py-6 text-center text-ui-xs text-muted-foreground/40">No charts match "{pickerSearch}"</p>
              {:else}
                {#each filteredByGroup as grp (grp.group)}
                  <div class="mb-2">
                    <p class="mb-1 px-1 text-ui-2xs font-semibold uppercase tracking-widest text-muted-foreground/40">{grp.group}</p>
                    <div class="flex flex-wrap gap-1">
                      {#each grp.charts as t (t.id)}
                        <button
                          type="button"
                          title={t.description}
                          onclick={() => selectChartType(t.id)}
                          class={cn(
                            'flex h-7 items-center rounded-md px-2.5 text-ui-xs transition-colors',
                            chartType === t.id
                              ? 'bg-primary text-primary-foreground font-medium'
                              : 'bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground',
                          )}
                        >
                          {t.label}
                        </button>
                      {/each}
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- Separator -->
      <span class="h-4 w-px shrink-0 bg-border/50"></span>

      <!-- Axis pickers, integrated label + select tokens -->
      {#if requiredAxes.x}
        <div class={axisToken}>
          <span class={axisLabel}>{requiredAxes.x.split(' ')[0]}</span>
          <select bind:value={xCol} class={axisSelect}>
            {#each allCols as col (col)}<option value={col}>{col}</option>{/each}
          </select>
          <ChevronDown class="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/40" />
        </div>
      {/if}

      {#if requiredAxes.y}
        <div class={axisToken}>
          <span class={axisLabel}>{requiredAxes.y.split(' ')[0]}</span>
          <select bind:value={yCol} class={axisSelect}>
            {#each (['scatter','bubble'].includes(chartType) ? allCols : numericCols.map(c => c.name)) as col (col)}
              <option value={col}>{col}</option>
            {/each}
          </select>
          <ChevronDown class="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/40" />
        </div>
      {/if}

      {#if requiredAxes.z}
        <div class={axisToken}>
          <span class={axisLabel}>{requiredAxes.z.split(' ')[0]}</span>
          <select bind:value={zCol} class={axisSelect}>
            <option value="">—</option>
            {#each numericCols.map(c => c.name).filter(n => n !== xCol && n !== yCol) as col (col)}
              <option value={col}>{col}</option>
            {/each}
          </select>
          <ChevronDown class="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/40" />
        </div>
      {/if}

      {#if requiredAxes.group}
        <div class={axisToken}>
          <span class={axisLabel}>Group</span>
          <select bind:value={groupCol} class={axisSelect}>
            <option value="">—</option>
            {#each allCols.filter(c => c !== xCol && c !== yCol) as col (col)}
              <option value={col}>{col}</option>
            {/each}
          </select>
          <ChevronDown class="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/40" />
        </div>
      {/if}

      <!-- Right actions -->
      <div class="ml-auto flex items-center gap-0.5">
        <span class="mr-1.5 tabular-nums font-mono text-ui-2xs text-muted-foreground/30">{rows.length.toLocaleString()} rows</span>
        <button type="button" class={iconBtn} title="Save chart" onclick={openSavePanel}>
          <Bookmark class="size-3.5" />
        </button>
        <button type="button" class={iconBtn} title="Copy ECharts JSON (AI-ready)" onclick={copyConfig}>
          <Copy class="size-3.5" />
        </button>
        <button type="button" class={iconBtn} title="Download PNG" onclick={downloadPng}>
          <Download class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- ── Save panel (inline below toolbar) ─────────────────────────── -->
    {#if saveOpen}
      <div class="flex shrink-0 items-center gap-2 border-b border-border/40 bg-muted/20 px-3 py-1.5">
        <span class="text-ui-2xs font-medium text-muted-foreground/60">Save as</span>
        <input
          type="text"
          placeholder="Chart name…"
          bind:value={saveName}
          class="h-6 w-40 rounded-lg border-2 border-border bg-background/80 px-2 font-mono text-ui-xs text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-ring focus:ring-1 focus:ring-ring"
        />

        {#if !newGroupMode}
          <div class="relative">
            <select bind:value={saveGroup} class="h-6 appearance-none rounded border border-border/50 bg-background/60 pl-2 pr-6 font-mono text-ui-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring">
              {#each $chartGroups as g (g)}<option value={g}>{g}</option>{/each}
            </select>
            <ChevronDown class="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/50" />
          </div>
          <button type="button" class="inline-flex size-6 items-center justify-center rounded text-muted-foreground/50 hover:text-foreground" title="New group" onclick={() => { newGroupMode = true }}>
            <Plus class="size-3.5" />
          </button>
        {:else}
          <input
            type="text"
            placeholder="New group name…"
            bind:value={newGroupName}
            class="h-6 w-36 rounded-lg border-2 border-border bg-background/80 px-2 font-mono text-ui-xs text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-ring focus:ring-1 focus:ring-ring"
          />
          <button type="button" class="inline-flex size-6 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground" onclick={() => (newGroupMode = false)}>
            <X class="size-3" />
          </button>
        {/if}

        <button
          type="button"
          onclick={commitSave}
          class="inline-flex h-6 items-center gap-1 rounded-md bg-primary px-2.5 text-ui-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Check class="size-3" />Save
        </button>
        <button
          type="button"
          onclick={() => (saveOpen = false)}
          class="inline-flex h-6 items-center gap-1 rounded-md px-2 text-ui-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    {/if}

    <!-- ── Chart ──────────────────────────────────────────────────────── -->
    <div class="chart-canvas-host relative min-h-0 flex-1">
      <!-- Contain any render/ECharts throw to this panel so a bad chart shows an
           inline message instead of taking down the tab / app. -->
      <svelte:boundary>
        {#if rows.length === 0}
          <div class="absolute inset-0 flex items-center justify-center">
            <p class="text-ui-sm text-muted-foreground/40">No data to display</p>
          </div>
        {:else if chartType === 'meter' && meterSpec}
          <CarbonMeterChart spec={meterSpec} />
        {:else}
          <EChartPanel {option} {renderer} class="absolute inset-0" />
        {/if}
        {#if sampled}
          <div class="pointer-events-none absolute bottom-1 right-2 rounded bg-background/70 px-1.5 py-0.5 font-mono text-ui-3xs text-muted-foreground/70">
            sampled {MAX_CHART_ROWS.toLocaleString()} of {rows.length.toLocaleString()} rows
          </div>
        {/if}
        {#snippet failed(error, reset)}
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
            <p class="text-ui-sm font-medium text-foreground/80">This chart couldn't render</p>
            <p class="max-w-md font-mono text-ui-2xs text-muted-foreground/60">{error instanceof Error ? error.message : String(error)}</p>
            <button type="button" class="mt-1 rounded-md border border-border px-2 py-1 text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" onclick={reset}>Retry</button>
          </div>
        {/snippet}
      </svelte:boundary>
    </div>

  {/if}
</div>
