/**
 * Utilities for converting SQL result sets (columns + rows) into ECharts option objects.
 * All functions return pure JSON — no callbacks — so AI can generate them too.
 *
 * echarts-wordcloud auto-registers when imported.
 */
import 'echarts-wordcloud'

/** @typedef {{ name: string, dataType?: string, data_type?: string }} ColInfo */
/** @typedef {unknown[][]} Rows */

/** @param {ColInfo} col */
export function colType(col) {
  const dt = (col.dataType ?? col.data_type ?? '').toLowerCase().replace(/\(.+\)$/, '').trim()
  if (/^(int|integer|bigint|smallint|numeric|decimal|real|double|float|serial|money|number)/.test(dt)) return 'number'
  if (/^(date|timestamp|timestamptz|timetz|time)/.test(dt)) return 'date'
  if (dt === 'boolean' || dt === 'bool') return 'boolean'
  return 'string'
}

/** @param {ColInfo[]} columns */
export function guessXCol(columns) {
  return (
    columns.find((c) => colType(c) === 'date') ??
    columns.find((c) => colType(c) === 'string') ??
    columns[0]
  )?.name ?? ''
}

/** @param {ColInfo[]} columns @param {string} xCol */
export function guessYCol(columns, xCol) {
  return (
    columns.find((c) => c.name !== xCol && colType(c) === 'number')
  )?.name ?? columns.find((c) => c.name !== xCol)?.name ?? ''
}

/**
 * @param {string} chartType
 * @returns {{ x: string, y: string, z?: string, group?: string }}
 */
export function getRequiredAxes(chartType) {
  switch (chartType) {
    case 'scatter':
      return { x: 'X (number)', y: 'Y (number)' }
    case 'bubble':
      return { x: 'X (number)', y: 'Y (number)', z: 'Size (number)' }
    case 'heatmap':
      return { x: 'X category', y: 'Value', group: 'Y category' }
    case 'pie':
    case 'donut':
    case 'funnel':
      return { x: 'Label', y: 'Value' }
    case 'gauge':
      return { x: 'Label', y: 'Value (0–100)' }
    case 'radar':
      return { x: 'Category', y: 'Value' }
    case 'histogram':
      return { x: 'Value (numeric)', y: '' }
    case 'box-plot':
      return { x: 'Group', y: 'Value (numeric)' }
    case 'word-cloud':
      return { x: 'Word', y: 'Size/Count' }
    case 'tree':
    case 'dendrogram':
      return { x: 'Name', y: '', group: 'Parent' }
    case 'choropleth':
      return { x: 'Country / Region', y: 'Value' }
    case 'meter':
      return { x: 'Segment label', y: 'Value', z: 'Total (optional)' }
    case 'sankey':
      return { x: 'Source', y: 'Value', group: 'Target' }
    case 'treemap':
    case 'circle-pack':
      return { x: 'Name', y: 'Value', group: 'Parent (optional)' }
    case 'bullet':
      return { x: 'Category', y: 'Actual', z: 'Target' }
    case 'lollipop-h':
      return { x: 'Category', y: 'Value' }
    case 'combo':
      return { x: 'Category', y: 'Bar series', z: 'Line series' }
    case 'bar-floating':
      return { x: 'Category', y: 'Min', z: 'Max' }
    case 'bar-grouped':
    case 'bar-stacked':
    case 'bar-stacked-100':
    case 'area-stacked':
      return { x: 'Category', y: 'Value', group: 'Series' }
    default:
      return { x: 'Category', y: 'Value', group: 'Group (optional)' }
  }
}

const PALETTE = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#a855f7', '#14b8a6', '#f97316', '#ec4899', '#64748b',
]

/**
 * Format a raw value for tooltip display.
 * Timestamps from PostgreSQL arrive as strings like "2025-12-01 00:00:00 UTC"
 * or ISO "2026-01-01T00:00:00.000Z" — convert to "Dec 2025" / "Jan 2026".
 */
function fmtTooltipValue(val) {
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    try {
      const d = new Date(val.replace(' UTC', 'Z').replace(' ', 'T'))
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      }
    } catch {}
  }
  if (typeof val === 'number' && !isNaN(val)) {
    if (Math.abs(val) >= 1e6) return val.toLocaleString()
    if (!Number.isInteger(val)) return val.toFixed(2)
    return val.toLocaleString()
  }
  return String(val ?? '')
}

/** @param {boolean} isDark @param {boolean} [noTitle] */
function baseOption(isDark, noTitle = false) {
  const textColor = isDark ? 'rgba(255,255,255,0.50)' : 'rgba(0,0,0,0.42)'
  const lineColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'
  const bg = isDark ? 'rgba(20,20,23,0.97)' : 'rgba(255,255,255,0.97)'
  return {
    backgroundColor: 'transparent',
    textStyle: { color: textColor, fontFamily: 'Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif', fontSize: 11 },
    tooltip: {
      backgroundColor: bg,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)', fontSize: 12, fontFamily: 'Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif' },
      extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.20);',
      formatter(params) {
        const items = Array.isArray(params) ? params : [params]
        const header = fmtTooltipValue(items[0]?.axisValue ?? items[0]?.name ?? '')
        const rows = items.map(p => {
          const color = p.color ?? '#6366f1'
          const val = fmtTooltipValue(p.value ?? p.data)
          return `<div style="display:flex;align-items:center;gap:6px;margin-top:3px">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>
            <span style="opacity:0.65;font-size:11px">${p.seriesName ?? ''}</span>
            <span style="margin-left:auto;padding-left:12px;font-weight:600">${val}</span>
          </div>`
        }).join('')
        return `<div style="font-size:11px;opacity:0.65;margin-bottom:2px">${header}</div>${rows}`
      },
    },
    grid: { top: noTitle ? 12 : 12, right: 16, bottom: 36, left: 12, containLabel: true },
    axisPointer: { lineStyle: { color: lineColor } },
    splitLine: { lineStyle: { color: lineColor } },
  }
}

/** @param {boolean} isDark */
function axisStyle(isDark) {
  const textColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'
  const lineColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'
  return {
    axisLabel: { color: textColor },
    axisLine: { lineStyle: { color: 'rgba(128,128,128,0.2)' } },
    splitLine: { lineStyle: { color: lineColor } },
  }
}

/** Detect if an array of strings looks like timestamps */
/** Exported so chart previews in ChartsPage can re-apply the formatter after JSON round-trip */
export function isTimestampAxis(xData) {
  const sample = xData.find(v => v && v !== 'null')
  return typeof sample === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sample)
}

/** Format a timestamp x-axis label to a short readable form */
export function fmtAxisLabel(val) {
  if (typeof val !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(val)) return val
  try {
    const d = new Date(val.replace(' UTC', 'Z').replace(' ', 'T'))
    if (isNaN(d.getTime())) return val
    // Day-level: show "Jan 15", Month-level: show "Jan 2026"
    const hasTime = /\d{2}:\d{2}/.test(val)
    const isMonthStart = d.getDate() === 1 && (!hasTime || val.includes('00:00:00'))
    if (isMonthStart) return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return val }
}

/** @param {boolean} isDark @param {string[]} xData */
function categoryXAxis(isDark, xData) {
  const isTs = isTimestampAxis(xData)
  return {
    type: 'category',
    data: xData,
    ...axisStyle(isDark),
    axisLabel: {
      ...axisStyle(isDark).axisLabel,
      rotate: !isTs && xData.length > 12 ? 30 : 0,
      overflow: isTs ? 'none' : 'truncate',
      width: isTs ? undefined : 80,
      ...(isTs ? { formatter: fmtAxisLabel } : {}),
    },
  }
}

/** @param {boolean} isDark */
function valueYAxis(isDark) {
  return { type: 'value', ...axisStyle(isDark) }
}

/**
 * Build an ECharts option for any supported chart type.
 * @param {{
 *   type: string
 *   columns: ColInfo[]
 *   rows: Rows
 *   xCol: string
 *   yCol: string
 *   zCol?: string
 *   groupCol?: string
 *   isDark?: boolean
 *   title?: string
 *   noTitle?: boolean
 * }} cfg
 * @returns {import('echarts').EChartsOption}
 */
export function buildOption({ type, columns, rows, xCol, yCol, zCol, groupCol, isDark = false, title, noTitle = false }) {
  const base = baseOption(isDark, noTitle)
  const xi = columns.findIndex((c) => c.name === xCol)
  const yi = columns.findIndex((c) => c.name === yCol)
  const zi = zCol ? columns.findIndex((c) => c.name === zCol) : -1
  const gi = groupCol ? columns.findIndex((c) => c.name === groupCol) : -1

  /** @param {string} text */
  const titleOpt = (text) =>
    (!noTitle && text) ? { title: { text, textStyle: { ...base.textStyle, fontSize: 13, fontWeight: 600 }, top: 4, left: 'center' } } : {}

  // ── Pie ────────────────────────────────────────────────────────────────────
  if (type === 'pie') {
    const data = rows.map((r) => ({ name: String(r[xi] ?? ''), value: Number(r[yi]) || 0 }))
    return {
      ...base,
      grid: undefined,
      legend: { orient: 'vertical', right: '4%', top: 'center', textStyle: base.textStyle },
      series: [{ type: 'pie', radius: '65%', center: ['42%', '52%'], data, label: { color: base.textStyle.color }, color: PALETTE }],
      ...titleOpt(title ?? ''),
    }
  }

  // ── Donut ──────────────────────────────────────────────────────────────────
  if (type === 'donut') {
    const data = rows.map((r) => ({ name: String(r[xi] ?? ''), value: Number(r[yi]) || 0 }))
    return {
      ...base,
      grid: undefined,
      legend: { orient: 'vertical', right: '4%', top: 'center', textStyle: base.textStyle },
      series: [{ type: 'pie', radius: ['40%', '68%'], center: ['42%', '52%'], data, label: { color: base.textStyle.color }, color: PALETTE }],
      ...titleOpt(title ?? ''),
    }
  }

  // ── Funnel ─────────────────────────────────────────────────────────────────
  if (type === 'funnel') {
    const data = rows
      .map((r) => ({ name: String(r[xi] ?? ''), value: Number(r[yi]) || 0 }))
      .sort((a, b) => b.value - a.value)
    return {
      ...base,
      grid: undefined,
      tooltip: { ...base.tooltip, trigger: 'item' },
      series: [{
        type: 'funnel',
        left: '10%',
        width: '80%',
        data,
        color: PALETTE,
        label: { color: base.textStyle.color },
      }],
      ...titleOpt(title ?? ''),
    }
  }

  // ── Gauge ──────────────────────────────────────────────────────────────────
  if (type === 'gauge') {
    const val = rows.length > 0 ? Number(rows[0][yi]) || 0 : 0
    const maxVal = Math.max(...rows.map((r) => Number(r[yi]) || 0), 100)
    return {
      ...base,
      grid: undefined,
      series: [{
        type: 'gauge',
        max: maxVal,
        data: [{ value: val, name: xCol }],
        detail: { color: base.textStyle.color, fontSize: 18 },
        title: { color: base.textStyle.color, fontSize: 12 },
        axisLabel: { color: base.textStyle.color, fontSize: 10 },
        pointer: { itemStyle: { color: PALETTE[0] } },
        itemStyle: { color: PALETTE[0] },
        progress: { show: true, itemStyle: { color: PALETTE[0] } },
      }],
      ...titleOpt(title ?? ''),
    }
  }

  // ── Scatter ────────────────────────────────────────────────────────────────
  if (type === 'scatter') {
    const data = rows.map((r) => [Number(r[xi]) || 0, Number(r[yi]) || 0])
    return {
      ...base,
      xAxis: { type: 'value', name: xCol, nameLocation: 'middle', nameGap: 28, nameTextStyle: base.textStyle, ...axisStyle(isDark) },
      yAxis: { type: 'value', name: yCol, nameLocation: 'middle', nameGap: 40, nameTextStyle: base.textStyle, ...axisStyle(isDark) },
      series: [{ type: 'scatter', data, symbolSize: 7, itemStyle: { color: PALETTE[0] } }],
      tooltip: { ...base.tooltip, trigger: 'item' },
      ...titleOpt(title ?? ''),
    }
  }

  // ── Bubble ─────────────────────────────────────────────────────────────────
  if (type === 'bubble') {
    const data = rows.map((r) => [
      Number(r[xi]) || 0,
      Number(r[yi]) || 0,
      zi >= 0 ? Number(r[zi]) || 0 : 10,
    ])
    const maxZ = Math.max(...data.map((d) => d[2]), 1)
    return {
      ...base,
      xAxis: { type: 'value', name: xCol, nameLocation: 'middle', nameGap: 28, nameTextStyle: base.textStyle, ...axisStyle(isDark) },
      yAxis: { type: 'value', name: yCol, nameLocation: 'middle', nameGap: 40, nameTextStyle: base.textStyle, ...axisStyle(isDark) },
      series: [{
        type: 'scatter',
        data,
        symbolSize: /** @param {number[]} d */ (d) => Math.max(8, (d[2] / maxZ) * 48),
        itemStyle: { color: PALETTE[0], opacity: 0.75 },
      }],
      tooltip: { ...base.tooltip, trigger: 'item' },
      ...titleOpt(title ?? ''),
    }
  }

  // ── Heatmap ────────────────────────────────────────────────────────────────
  if (type === 'heatmap') {
    const xVals = [...new Set(rows.map((r) => String(r[xi])))]
    const yVals = gi >= 0 ? [...new Set(rows.map((r) => String(r[gi])))] : [yCol]
    const data = rows.map((r) => [
      xVals.indexOf(String(r[xi])),
      gi >= 0 ? yVals.indexOf(String(r[gi])) : 0,
      Number(r[yi]) || 0,
    ])
    const lineColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'
    return {
      ...base,
      xAxis: { type: 'category', data: xVals, splitArea: { show: true }, ...axisStyle(isDark) },
      yAxis: { type: 'category', data: yVals, splitArea: { show: true }, ...axisStyle(isDark) },
      visualMap: { min: 0, max: Math.max(...data.map((d) => d[2])), calculable: true, orient: 'horizontal', left: 'center', bottom: 4, textStyle: base.textStyle },
      series: [{ type: 'heatmap', data, label: { show: data.length < 100 } }],
      grid: { ...base.grid, bottom: 70 },
      splitLine: { lineStyle: { color: lineColor } },
      ...titleOpt(title ?? ''),
    }
  }

  // ── Radar ──────────────────────────────────────────────────────────────────
  if (type === 'radar') {
    // Each non-xCol numeric column becomes an indicator; each row becomes a series
    const numCols = columns.filter((c) => c.name !== xCol && colType(c) === 'number')
    const indicators = numCols.map((c) => ({
      name: c.name,
      max: Math.max(...rows.map((r) => {
        const i = columns.findIndex((cc) => cc.name === c.name)
        return Number(r[i]) || 0
      }), 1) * 1.2,
    }))
    const seriesData = rows.map((r) => ({
      name: String(r[xi] ?? ''),
      value: numCols.map((c) => {
        const i = columns.findIndex((cc) => cc.name === c.name)
        return Number(r[i]) || 0
      }),
    }))
    return {
      ...base,
      grid: undefined,
      legend: { textStyle: base.textStyle, top: 4 },
      radar: {
        indicator: indicators,
        name: { textStyle: { color: base.textStyle.color } },
        axisLine: { lineStyle: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' } },
        splitLine: { lineStyle: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' } },
      },
      series: [{
        type: 'radar',
        data: seriesData.map((s, i) => ({ ...s, itemStyle: { color: PALETTE[i % PALETTE.length] }, areaStyle: { opacity: 0.15 } })),
      }],
      tooltip: { ...base.tooltip, trigger: 'item' },
      ...titleOpt(title ?? ''),
    }
  }

  // ── Histogram ─────────────────────────────────────────────────────────────
  if (type === 'histogram') {
    const vals = rows.map((r) => Number(r[yi >= 0 ? yi : xi]) || 0).filter(isFinite)
    const bins = 20
    if (vals.length === 0) return { ...base, series: [] }
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const step = (max - min) / bins || 1
    const counts = Array(bins).fill(0)
    vals.forEach((v) => {
      const i = Math.min(Math.floor((v - min) / step), bins - 1)
      counts[i]++
    })
    const labels = counts.map((_, i) => {
      const lo = min + i * step
      const hi = lo + step
      return `${lo.toFixed(1)}–${hi.toFixed(1)}`
    })
    return {
      ...base,
      tooltip: { ...base.tooltip, trigger: 'axis' },
      xAxis: categoryXAxis(isDark, labels),
      yAxis: valueYAxis(isDark),
      series: [{ type: 'bar', data: counts, itemStyle: { color: PALETTE[0], borderRadius: [3, 3, 0, 0] }, barCategoryGap: '2%' }],
      ...titleOpt(title ?? ''),
    }
  }

  // ── Box Plot ───────────────────────────────────────────────────────────────
  if (type === 'box-plot') {
    const groups = gi >= 0
      ? [...new Set(rows.map((r) => String(r[gi])))]
      : ['All']
    const boxData = groups.map((grp) => {
      const vals = (gi >= 0 ? rows.filter((r) => String(r[gi]) === grp) : rows)
        .map((r) => Number(r[yi]) || 0)
        .sort((a, b) => a - b)
      if (vals.length === 0) return [0, 0, 0, 0, 0]
      const q = (p) => {
        const idx = (vals.length - 1) * p
        const lo = Math.floor(idx)
        const hi = Math.ceil(idx)
        return vals[lo] + (vals[hi] - vals[lo]) * (idx - lo)
      }
      return [vals[0], q(0.25), q(0.5), q(0.75), vals[vals.length - 1]]
    })
    return {
      ...base,
      tooltip: { ...base.tooltip, trigger: 'item' },
      xAxis: categoryXAxis(isDark, groups),
      yAxis: valueYAxis(isDark),
      series: [{ type: 'boxplot', data: boxData, itemStyle: { color: PALETTE[0], borderColor: PALETTE[0] } }],
      ...titleOpt(title ?? ''),
    }
  }

  // ── Word Cloud ─────────────────────────────────────────────────────────────
  if (type === 'word-cloud') {
    const data = rows.map((r) => ({ name: String(r[xi] ?? ''), value: Number(r[yi]) || 1 }))
    return {
      ...base,
      grid: undefined,
      tooltip: { ...base.tooltip, trigger: 'item' },
      series: [{
        type: 'wordCloud',
        shape: 'circle',
        width: '90%',
        height: '90%',
        gridSize: 8,
        sizeRange: [12, 60],
        rotationRange: [-45, 45],
        rotationStep: 45,
        drawOutOfBound: false,
        textStyle: { color: PALETTE.concat(PALETTE) },
        emphasis: { textStyle: { fontWeight: 'bold' } },
        data,
      }],
      ...titleOpt(title ?? ''),
    }
  }

  // ── Treemap ────────────────────────────────────────────────────────────────
  if (type === 'treemap') {
    const data = rows.map((r) => ({ name: String(r[xi] ?? ''), value: Number(r[yi]) || 0 }))
    return {
      ...base,
      grid: undefined,
      tooltip: { ...base.tooltip, trigger: 'item' },
      series: [{
        type: 'treemap',
        data,
        color: PALETTE,
        label: { color: '#fff', fontSize: 11 },
        breadcrumb: { show: false },
      }],
      ...titleOpt(title ?? ''),
    }
  }

  // ── Circle Pack (treemap approximation) ───────────────────────────────────
  if (type === 'circle-pack') {
    const data = rows.map((r) => ({ name: String(r[xi] ?? ''), value: Number(r[yi]) || 0 }))
    return {
      ...base,
      grid: undefined,
      tooltip: { ...base.tooltip, trigger: 'item' },
      series: [{
        type: 'treemap',
        data,
        color: PALETTE,
        label: { color: '#fff', fontSize: 10 },
        breadcrumb: { show: false },
        itemStyle: { borderRadius: 99, gapWidth: 4 },
        levels: [{ itemStyle: { borderRadius: 99 } }],
      }],
      ...titleOpt(title ?? ''),
    }
  }

  // ── Tree ───────────────────────────────────────────────────────────────────
  if (type === 'tree') {
    // Build adjacency list from xCol=name, groupCol=parent
    /** @type {Map<string, { name: string, children: any[] }>} */
    const nodeMap = new Map()
    rows.forEach((r) => {
      const name = String(r[xi] ?? '')
      if (!nodeMap.has(name)) nodeMap.set(name, { name, children: [] })
    })
    /** @type {any[]} */
    const roots = []
    rows.forEach((r) => {
      const name = String(r[xi] ?? '')
      const parent = gi >= 0 ? String(r[gi] ?? '') : ''
      const node = nodeMap.get(name)
      if (!node) return
      if (parent && nodeMap.has(parent)) {
        nodeMap.get(parent)?.children.push(node)
      } else {
        roots.push(node)
      }
    })
    const treeData = roots.length > 0 ? roots : [{ name: 'Root', children: [...nodeMap.values()] }]
    return {
      ...base,
      grid: undefined,
      tooltip: { ...base.tooltip, trigger: 'item' },
      series: [{
        type: 'tree',
        data: treeData,
        top: '5%',
        left: '7%',
        bottom: '5%',
        right: '20%',
        symbolSize: 7,
        label: { position: 'left', verticalAlign: 'middle', align: 'right', fontSize: 10, color: base.textStyle.color },
        leaves: { label: { position: 'right', verticalAlign: 'middle', align: 'left' } },
        roam: true,
        expandAndCollapse: true,
        animationDuration: 400,
        lineStyle: { color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' },
      }],
      ...titleOpt(title ?? ''),
    }
  }

  // ── Dendrogram ─────────────────────────────────────────────────────────────
  if (type === 'dendrogram') {
    // Same adjacency-list data as 'tree', rendered as a radial dendrogram
    /** @type {Map<string, { name: string, children: any[] }>} */
    const nodeMap = new Map()
    rows.forEach((r) => {
      const name = String(r[xi] ?? '')
      if (!nodeMap.has(name)) nodeMap.set(name, { name, children: [] })
    })
    /** @type {any[]} */
    const roots = []
    rows.forEach((r) => {
      const name = String(r[xi] ?? '')
      const parent = gi >= 0 ? String(r[gi] ?? '') : ''
      const node = nodeMap.get(name)
      if (!node) return
      if (parent && nodeMap.has(parent)) {
        nodeMap.get(parent)?.children.push(node)
      } else {
        roots.push(node)
      }
    })
    const treeData = roots.length > 0 ? roots : [{ name: 'Root', children: [...nodeMap.values()] }]
    return {
      ...base,
      grid: undefined,
      tooltip: { ...base.tooltip, trigger: 'item', formatter: '{b}' },
      series: [{
        type: 'tree',
        data: treeData,
        layout: 'radial',
        top: '5%', left: '5%', bottom: '5%', right: '5%',
        symbolSize: 6,
        symbol: 'circle',
        itemStyle: { color: PALETTE[0], borderWidth: 0 },
        label: { fontSize: 10, color: base.textStyle.color, distance: 8 },
        lineStyle: {
          color: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)',
          width: 1.5,
          curveness: 0.5,
        },
        roam: true,
        expandAndCollapse: true,
        initialTreeDepth: 3,
        animationDuration: 400,
      }],
      ...titleOpt(title ?? ''),
    }
  }

  // ── Choropleth / Meter — handled by dedicated Svelte components ────────────
  // buildOption is not called for these types; return empty so callers get {}
  if (type === 'choropleth' || type === 'meter') return {}

  // ── Sankey ─────────────────────────────────────────────────────────────────
  if (type === 'sankey') {
    const nodeSet = new Set()
    rows.forEach((r) => {
      nodeSet.add(String(r[xi] ?? ''))
      if (gi >= 0) nodeSet.add(String(r[gi] ?? ''))
    })
    const nodes = [...nodeSet].map((name) => ({ name }))
    const links = rows.map((r) => ({
      source: String(r[xi] ?? ''),
      target: gi >= 0 ? String(r[gi] ?? '') : '',
      value: Number(r[yi]) || 1,
    })).filter((l) => l.source && l.target && l.source !== l.target)
    return {
      ...base,
      grid: undefined,
      tooltip: { ...base.tooltip, trigger: 'item' },
      series: [{
        type: 'sankey',
        data: nodes,
        links,
        emphasis: { focus: 'adjacency' },
        lineStyle: { color: 'gradient', opacity: 0.4 },
        label: { color: base.textStyle.color, fontSize: 11 },
      }],
      ...titleOpt(title ?? ''),
    }
  }

  // ── Lollipop ───────────────────────────────────────────────────────────────
  if (type === 'lollipop') {
    const xData = rows.map((r) => String(r[xi] ?? ''))
    const yData = rows.map((r) => Number(r[yi]) || 0)
    return {
      ...base,
      tooltip: { ...base.tooltip, trigger: 'axis' },
      xAxis: categoryXAxis(isDark, xData),
      yAxis: valueYAxis(isDark),
      series: [
        {
          type: 'line',
          data: yData,
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: { width: 0 },
          itemStyle: { color: PALETTE[0] },
          markLine: {
            silent: true,
            symbol: 'none',
            label: { show: false },
            lineStyle: { color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)', type: 'solid' },
            data: [{ yAxis: 0 }],
          },
        },
        {
          type: 'bar',
          data: yData.map((v) => [v, 0]),
          barMaxWidth: 2,
          itemStyle: { color: PALETTE[0] },
          silent: true,
        },
      ],
      ...titleOpt(title ?? ''),
    }
  }

  // ── Lollipop Horizontal ──────────────────────────────────────────────────
  if (type === 'lollipop-h') {
    const yData = rows.map((r) => String(r[xi] ?? ''))
    const xData = rows.map((r) => Number(r[yi]) || 0)
    return {
      ...base,
      tooltip: { ...base.tooltip, trigger: 'axis' },
      xAxis: { ...valueYAxis(isDark) },
      yAxis: { type: 'category', data: yData, ...axisStyle(isDark) },
      series: [
        {
          type: 'bar', data: xData, barMaxWidth: 2,
          itemStyle: { color: PALETTE[0] }, silent: true,
        },
        {
          type: 'scatter', data: xData.map((v, i) => [v, i]),
          symbolSize: 10, itemStyle: { color: PALETTE[0] },
        },
      ],
      ...titleOpt(title ?? ''),
    }
  }

  // ── Combo (Bar + Line dual axis) ──────────────────────────────────────────
  if (type === 'combo') {
    const xData = rows.map((r) => String(r[xi] ?? ''))
    const barData = rows.map((r) => Number(r[yi]) || 0)
    const lineData = zi >= 0 ? rows.map((r) => Number(r[zi]) || 0) : []
    const hasLine = lineData.length > 0
    return {
      ...base,
      tooltip: { ...base.tooltip, trigger: 'axis' },
      legend: { textStyle: base.textStyle, top: 4, data: [yCol, ...(hasLine ? [zCol ?? 'line'] : [])] },
      xAxis: categoryXAxis(isDark, xData),
      yAxis: hasLine
        ? [{ ...valueYAxis(isDark), name: yCol }, { ...valueYAxis(isDark), name: zCol ?? '', splitLine: { show: false } }]
        : valueYAxis(isDark),
      series: [
        { type: 'bar', name: yCol, data: barData, itemStyle: { color: PALETTE[0], borderRadius: [3,3,0,0] }, barMaxWidth: 48, yAxisIndex: 0 },
        ...(hasLine ? [{
          type: 'line', name: zCol ?? 'line', data: lineData, smooth: true,
          symbol: 'circle', symbolSize: 5,
          lineStyle: { color: PALETTE[1], width: 2 }, itemStyle: { color: PALETTE[1] },
          yAxisIndex: 1,
        }] : []),
      ],
      ...titleOpt(title ?? ''),
    }
  }

  // ── Bar Floating ──────────────────────────────────────────────────────────
  if (type === 'bar-floating') {
    const xData = rows.map((r) => String(r[xi] ?? ''))
    const data = rows.map((r) => [Number(r[yi]) || 0, zi >= 0 ? Number(r[zi]) || 0 : Number(r[yi]) || 0])
    return {
      ...base,
      tooltip: { ...base.tooltip, trigger: 'axis' },
      xAxis: categoryXAxis(isDark, xData),
      yAxis: valueYAxis(isDark),
      series: [{ type: 'bar', data, itemStyle: { color: PALETTE[0], borderRadius: [3, 3, 0, 0] }, barMaxWidth: 48 }],
      ...titleOpt(title ?? ''),
    }
  }

  // ── Bullet ────────────────────────────────────────────────────────────────
  if (type === 'bullet') {
    const categories = rows.map((r) => String(r[xi] ?? ''))
    const actuals = rows.map((r) => Number(r[yi]) || 0)
    const targets = rows.map((r) => zi >= 0 ? Number(r[zi]) || 0 : 0)
    const maxVal = Math.max(...actuals, ...targets, 1)
    return {
      ...base,
      tooltip: { ...base.tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'value', max: maxVal * 1.1, ...axisStyle(isDark) },
      yAxis: { type: 'category', data: categories, ...axisStyle(isDark) },
      series: [
        {
          type: 'bar',
          name: yCol,
          data: actuals,
          itemStyle: { color: PALETTE[0], borderRadius: [0, 3, 3, 0] },
          barMaxWidth: 20,
        },
        {
          type: 'scatter',
          name: zCol ?? 'Target',
          data: targets.map((v, i) => [v, i]),
          symbol: 'rect',
          symbolSize: [4, 20],
          itemStyle: { color: PALETTE[3] },
          z: 10,
        },
      ],
      legend: { textStyle: base.textStyle, top: 4 },
      ...titleOpt(title ?? ''),
    }
  }

  // ── Bar Horizontal ─────────────────────────────────────────────────────────
  if (type === 'bar-horizontal') {
    const xData = [...new Set(rows.map((r) => String(r[xi] ?? '')))]
    const dataMap = Object.fromEntries(rows.map((r) => [String(r[xi]), Number(r[yi]) || 0]))
    return {
      ...base,
      tooltip: { ...base.tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'value', ...axisStyle(isDark) },
      yAxis: { type: 'category', data: xData, ...axisStyle(isDark) },
      series: [{ type: 'bar', data: xData.map((x) => dataMap[x] ?? null), itemStyle: { color: PALETTE[0], borderRadius: [0, 3, 3, 0] }, barMaxWidth: 32 }],
      grid: { ...base.grid, left: 16 },
      ...titleOpt(title ?? ''),
    }
  }

  // ── Bar Grouped ────────────────────────────────────────────────────────────
  if (type === 'bar-grouped') {
    const xData = [...new Set(rows.map((r) => String(r[xi] ?? '')))]
    const groups = gi >= 0 ? [...new Set(rows.map((r) => String(r[gi])))] : [yCol]
    const series = groups.map((grp, i) => {
      const dataMap = gi >= 0
        ? Object.fromEntries(rows.filter((r) => String(r[gi]) === grp).map((r) => [String(r[xi]), Number(r[yi]) || 0]))
        : Object.fromEntries(rows.map((r) => [String(r[xi]), Number(r[yi]) || 0]))
      return { type: 'bar', name: grp, data: xData.map((x) => dataMap[x] ?? null), itemStyle: { color: PALETTE[i % PALETTE.length], borderRadius: [3, 3, 0, 0] }, barMaxWidth: 32 }
    })
    return {
      ...base,
      tooltip: { ...base.tooltip, trigger: 'axis' },
      legend: { textStyle: base.textStyle, top: 4 },
      xAxis: categoryXAxis(isDark, xData),
      yAxis: valueYAxis(isDark),
      series,
      ...titleOpt(title ?? ''),
    }
  }

  // ── Bar Stacked ────────────────────────────────────────────────────────────
  if (type === 'bar-stacked') {
    const xData = [...new Set(rows.map((r) => String(r[xi] ?? '')))]
    const groups = gi >= 0 ? [...new Set(rows.map((r) => String(r[gi])))] : [yCol]
    const series = groups.map((grp, i) => {
      const dataMap = gi >= 0
        ? Object.fromEntries(rows.filter((r) => String(r[gi]) === grp).map((r) => [String(r[xi]), Number(r[yi]) || 0]))
        : Object.fromEntries(rows.map((r) => [String(r[xi]), Number(r[yi]) || 0]))
      return { type: 'bar', name: grp, stack: 'total', data: xData.map((x) => dataMap[x] ?? null), itemStyle: { color: PALETTE[i % PALETTE.length] }, barMaxWidth: 48 }
    })
    return {
      ...base,
      tooltip: { ...base.tooltip, trigger: 'axis' },
      legend: { textStyle: base.textStyle, top: 4 },
      xAxis: categoryXAxis(isDark, xData),
      yAxis: valueYAxis(isDark),
      series,
      ...titleOpt(title ?? ''),
    }
  }

  // ── Bar Stacked 100% ───────────────────────────────────────────────────────
  if (type === 'bar-stacked-100') {
    const xData = [...new Set(rows.map((r) => String(r[xi] ?? '')))]
    const groups = gi >= 0 ? [...new Set(rows.map((r) => String(r[gi])))] : [yCol]
    // Compute totals per x category
    const totals = Object.fromEntries(xData.map((x) => [x, 0]))
    rows.forEach((r) => { totals[String(r[xi])] = (totals[String(r[xi])] || 0) + (Number(r[yi]) || 0) })
    const series = groups.map((grp, i) => {
      const dataMap = gi >= 0
        ? Object.fromEntries(rows.filter((r) => String(r[gi]) === grp).map((r) => [String(r[xi]), Number(r[yi]) || 0]))
        : Object.fromEntries(rows.map((r) => [String(r[xi]), Number(r[yi]) || 0]))
      return {
        type: 'bar',
        name: grp,
        stack: 'total',
        data: xData.map((x) => totals[x] > 0 ? +((dataMap[x] ?? 0) / totals[x] * 100).toFixed(2) : 0),
        itemStyle: { color: PALETTE[i % PALETTE.length] },
        barMaxWidth: 48,
      }
    })
    return {
      ...base,
      tooltip: { ...base.tooltip, trigger: 'axis' },
      legend: { textStyle: base.textStyle, top: 4 },
      xAxis: categoryXAxis(isDark, xData),
      yAxis: { type: 'value', max: 100, axisLabel: { ...axisStyle(isDark).axisLabel, formatter: '{value}%' }, ...axisStyle(isDark) },
      series,
      ...titleOpt(title ?? ''),
    }
  }

  // ── Area Stacked ──────────────────────────────────────────────────────────
  if (type === 'area-stacked') {
    const xData = [...new Set(rows.map((r) => String(r[xi] ?? '')))]
    const groups = gi >= 0 ? [...new Set(rows.map((r) => String(r[gi])))] : [yCol]
    const series = groups.map((grp, i) => {
      const dataMap = gi >= 0
        ? Object.fromEntries(rows.filter((r) => String(r[gi]) === grp).map((r) => [String(r[xi]), Number(r[yi]) || 0]))
        : Object.fromEntries(rows.map((r) => [String(r[xi]), Number(r[yi]) || 0]))
      const color = PALETTE[i % PALETTE.length]
      return {
        type: 'line',
        name: grp,
        stack: 'total',
        data: xData.map((x) => dataMap[x] ?? null),
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { color, width: 1.5 },
        itemStyle: { color },
        areaStyle: { opacity: 0.2 },
      }
    })
    return {
      ...base,
      tooltip: { ...base.tooltip, trigger: 'axis' },
      legend: { textStyle: base.textStyle, top: 4 },
      xAxis: categoryXAxis(isDark, xData),
      yAxis: valueYAxis(isDark),
      series,
      ...titleOpt(title ?? ''),
    }
  }

  // ── Bar / Line / Area (with optional group) ────────────────────────────────
  const xData = [...new Set(rows.map((r) => String(r[xi] ?? '')))]

  /** @type {any[]} */
  let series
  if (gi >= 0) {
    const groups = [...new Set(rows.map((r) => String(r[gi])))]
    series = groups.map((grp, i) => {
      const grpRows = rows.filter((r) => String(r[gi]) === grp)
      const dataMap = Object.fromEntries(grpRows.map((r) => [String(r[xi]), Number(r[yi]) || 0]))
      return makeSeries(type, grp, xData.map((x) => dataMap[x] ?? null), PALETTE[i % PALETTE.length])
    })
  } else {
    const dataMap = Object.fromEntries(rows.map((r) => [String(r[xi]), Number(r[yi]) || 0]))
    series = [makeSeries(type, yCol, xData.map((x) => dataMap[x] ?? null), PALETTE[0])]
  }

  return {
    ...base,
    tooltip: { ...base.tooltip, trigger: 'axis' },
    legend: series.length > 1 ? { textStyle: base.textStyle, top: 4 } : undefined,
    xAxis: categoryXAxis(isDark, xData),
    yAxis: valueYAxis(isDark),
    series,
    ...titleOpt(title ?? ''),
  }
}

/** @param {string} type @param {string} name @param {any[]} data @param {string} color */
function makeSeries(type, name, data, color) {
  if (type === 'bar') {
    return { type: 'bar', name, data, itemStyle: { color, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 48 }
  }
  const isArea = type === 'area'
  return {
    type: 'line',
    name,
    data,
    smooth: true,
    symbol: 'circle',
    symbolSize: 4,
    lineStyle: { color, width: 2 },
    itemStyle: { color },
    ...(isArea ? { areaStyle: { color, opacity: 0.12 } } : {}),
  }
}

/**
 * Detect if a column set is suitable for a chart (at least one numeric and one other col).
 * @param {ColInfo[]} columns
 */
export function isChartable(columns) {
  return columns.length >= 2 && columns.some((c) => colType(c) === 'number')
}

/**
 * All 26 chart types with metadata for the picker and AI integration.
 */
export const CHART_CATALOG = [
  {
    id: 'bar',
    label: 'Bar',
    group: 'Bar',
    icon: 'bar-chart-2',
    description: 'Vertical bars comparing values across categories',
    axes: { x: 'category', y: 'value', group: 'optional' },
    requires: { x: 'any', y: 'number', group: 'optional-category' },
    aiHint: 'Use GROUP BY with COUNT/SUM/AVG for Y axis',
  },
  {
    id: 'bar-horizontal',
    label: 'H-Bar',
    group: 'Bar',
    icon: 'bar-chart',
    description: 'Horizontal bars, good for long category labels',
    axes: { x: 'category', y: 'value' },
    requires: { x: 'any', y: 'number' },
    aiHint: 'Same as bar but rendered horizontally',
  },
  {
    id: 'bar-grouped',
    label: 'Grouped',
    group: 'Bar',
    icon: 'bar-chart-horizontal-big',
    description: 'Side-by-side bars per group',
    axes: { x: 'category', y: 'value', group: 'required' },
    requires: { x: 'any', y: 'number', group: 'category' },
    aiHint: 'Use GROUP BY category, series with SUM/COUNT',
  },
  {
    id: 'bar-stacked',
    label: 'Stacked',
    group: 'Bar',
    icon: 'layers',
    description: 'Stacked bars showing part-to-whole with absolute values',
    axes: { x: 'category', y: 'value', group: 'required' },
    requires: { x: 'any', y: 'number', group: 'category' },
    aiHint: 'Use GROUP BY category, series with SUM',
  },
  {
    id: 'bar-stacked-100',
    label: '100%',
    group: 'Bar',
    icon: 'bar-chart-big',
    description: '100% stacked bars showing proportions',
    axes: { x: 'category', y: 'value', group: 'required' },
    requires: { x: 'any', y: 'number', group: 'category' },
    aiHint: 'Use GROUP BY category, series; values normalized to 100%',
  },
  {
    id: 'bar-floating',
    label: 'Floating',
    group: 'Bar',
    icon: 'align-vertical-distribute-center',
    description: 'Bars from min to max (Gantt-style)',
    axes: { x: 'category', y: 'min', z: 'max' },
    requires: { x: 'any', y: 'number', z: 'number' },
    aiHint: 'Query min and max values per category',
  },
  {
    id: 'lollipop',
    label: 'Lollipop',
    group: 'Bar',
    icon: 'circle-dot',
    description: 'Dot-on-stick variant of a vertical bar chart',
    axes: { x: 'category', y: 'value' },
    requires: { x: 'any', y: 'number' },
    aiHint: 'Same data shape as a bar chart',
  },
  {
    id: 'lollipop-h',
    label: 'Lollipop H',
    group: 'Bar',
    icon: 'minus',
    description: 'Horizontal lollipop — good for ranked categories',
    axes: { x: 'category', y: 'value' },
    requires: { x: 'any', y: 'number' },
    aiHint: 'ORDER BY value DESC for ranking effect',
  },
  {
    id: 'combo',
    label: 'Combo',
    group: 'Line & Area',
    icon: 'layers',
    description: 'Bar + Line on dual Y axes for two different measures',
    axes: { x: 'category', y: 'bar value', z: 'line value' },
    requires: { x: 'any', y: 'number', z: 'number' },
    aiHint: 'Query two numeric columns per category; y_col=bar, z_col=line',
  },
  {
    id: 'line',
    label: 'Line',
    group: 'Line & Area',
    icon: 'line-chart',
    description: 'Line chart for trends over time or sequence',
    axes: { x: 'date or category', y: 'value', group: 'optional' },
    requires: { x: 'any', y: 'number', group: 'optional-category' },
    aiHint: 'ORDER BY date/sequence column for correct line order',
  },
  {
    id: 'area',
    label: 'Area',
    group: 'Line & Area',
    icon: 'area-chart',
    description: 'Filled area under a line',
    axes: { x: 'date or category', y: 'value', group: 'optional' },
    requires: { x: 'any', y: 'number', group: 'optional-category' },
    aiHint: 'ORDER BY date for time series',
  },
  {
    id: 'area-stacked',
    label: 'Stacked Area',
    group: 'Line & Area',
    icon: 'layers-2',
    description: 'Multiple areas stacked on top of each other',
    axes: { x: 'date or category', y: 'value', group: 'required' },
    requires: { x: 'any', y: 'number', group: 'category' },
    aiHint: 'GROUP BY date, series column with SUM',
  },
  {
    id: 'scatter',
    label: 'Scatter',
    group: 'Correlation',
    icon: 'scatter-chart',
    description: 'Points on X/Y axes to show correlation',
    axes: { x: 'number', y: 'number' },
    requires: { x: 'number', y: 'number' },
    aiHint: 'Both X and Y must be numeric columns',
  },
  {
    id: 'bubble',
    label: 'Bubble',
    group: 'Correlation',
    icon: 'circle',
    description: 'Scatter with bubble size as a third dimension',
    axes: { x: 'number', y: 'number', z: 'size' },
    requires: { x: 'number', y: 'number', z: 'number' },
    aiHint: 'Three numeric columns: X position, Y position, bubble size',
  },
  {
    id: 'heatmap',
    label: 'Heatmap',
    group: 'Correlation',
    icon: 'grid-3x3',
    description: 'Color-encoded grid for dense comparisons',
    axes: { x: 'category', y: 'value', group: 'Y category' },
    requires: { x: 'any', y: 'number', group: 'category' },
    aiHint: 'Use GROUP BY row_label, col_label with AVG/SUM value',
  },
  {
    id: 'radar',
    label: 'Radar',
    group: 'Correlation',
    icon: 'radar',
    description: 'Spider chart comparing multiple numeric dimensions',
    axes: { x: 'category', y: 'multiple numeric columns' },
    requires: { x: 'any', y: 'number' },
    aiHint: 'Each row is one entity; numeric columns become radar axes',
  },
  {
    id: 'histogram',
    label: 'Histogram',
    group: 'Distribution',
    icon: 'chart-no-axes-combined',
    description: 'Frequency distribution of a numeric column',
    axes: { x: 'numeric value', y: 'auto-count' },
    requires: { x: 'number', y: 'number' },
    aiHint: 'Pass raw numeric values; bins are computed automatically',
  },
  {
    id: 'box-plot',
    label: 'Box Plot',
    group: 'Distribution',
    icon: 'box',
    description: 'Shows median, quartiles, and outliers per group',
    axes: { x: 'group', y: 'numeric values' },
    requires: { x: 'any', y: 'number', group: 'optional-category' },
    aiHint: 'Pass raw rows; quartiles are computed from the data',
  },
  {
    id: 'pie',
    label: 'Pie',
    group: 'Part-to-Whole',
    icon: 'pie-chart',
    description: 'Classic pie chart for proportions',
    axes: { x: 'label', y: 'value' },
    requires: { x: 'any', y: 'number' },
    aiHint: 'Use GROUP BY label with SUM/COUNT for values',
  },
  {
    id: 'donut',
    label: 'Donut',
    group: 'Part-to-Whole',
    icon: 'donut',
    description: 'Donut chart with center hole',
    axes: { x: 'label', y: 'value' },
    requires: { x: 'any', y: 'number' },
    aiHint: 'Same as pie; center hole is decorative',
  },
  {
    id: 'gauge',
    label: 'Gauge',
    group: 'Part-to-Whole',
    icon: 'gauge',
    description: 'Speedometer-style gauge for a single KPI',
    axes: { x: 'label', y: 'value (0–max)' },
    requires: { x: 'any', y: 'number' },
    aiHint: 'First row\'s Y value is displayed on the gauge',
  },
  {
    id: 'funnel',
    label: 'Funnel',
    group: 'Part-to-Whole',
    icon: 'filter',
    description: 'Ordered funnel from largest to smallest',
    axes: { x: 'stage label', y: 'value' },
    requires: { x: 'any', y: 'number' },
    aiHint: 'Query stage names and counts; sorted by value descending automatically',
  },
  {
    id: 'bullet',
    label: 'Bullet',
    group: 'Part-to-Whole',
    icon: 'target',
    description: 'Bar with a target line for actual-vs-target comparison',
    axes: { x: 'category', y: 'actual', z: 'target' },
    requires: { x: 'any', y: 'number', z: 'number' },
    aiHint: 'Query category, actual_value, target_value columns',
  },
  {
    id: 'treemap',
    label: 'Treemap',
    group: 'Hierarchical',
    icon: 'layout-grid',
    description: 'Nested rectangles sized by value',
    axes: { x: 'name', y: 'value', group: 'parent (optional)' },
    requires: { x: 'any', y: 'number' },
    aiHint: 'Query name and numeric size/value columns',
  },
  {
    id: 'tree',
    label: 'Tree',
    group: 'Hierarchical',
    icon: 'network',
    description: 'Hierarchical tree diagram from parent-child data',
    axes: { x: 'name', group: 'parent' },
    requires: { x: 'any', group: 'category' },
    aiHint: 'Query id/name and parent_id/parent_name for adjacency list',
  },
  {
    id: 'circle-pack',
    label: 'Circle Pack',
    group: 'Hierarchical',
    icon: 'circles',
    description: 'Packed circles sized by value',
    axes: { x: 'name', y: 'value' },
    requires: { x: 'any', y: 'number' },
    aiHint: 'Query name and numeric size columns; nesting is optional',
  },
  {
    id: 'sankey',
    label: 'Sankey',
    group: 'Flow',
    icon: 'git-merge',
    description: 'Flow diagram between nodes with proportional links',
    axes: { x: 'source', group: 'target', y: 'value' },
    requires: { x: 'any', group: 'category', y: 'number' },
    aiHint: 'Query source, target, and flow_value columns',
  },
  {
    id: 'word-cloud',
    label: 'Word Cloud',
    group: 'Other',
    icon: 'type',
    description: 'Word cloud sized by frequency or weight',
    axes: { x: 'word/term', y: 'count/weight' },
    requires: { x: 'any', y: 'number' },
    aiHint: 'Query term and COUNT(*) or weight columns',
  },
  {
    id: 'dendrogram',
    label: 'Dendrogram',
    group: 'Hierarchical',
    icon: 'git-fork',
    description: 'Radial tree dendrogram from parent-child data',
    axes: { x: 'name', group: 'parent' },
    requires: { x: 'any', group: 'category' },
    aiHint: 'Query id/name and parent_id/parent_name for adjacency list',
  },
  {
    id: 'choropleth',
    label: 'Choropleth',
    group: 'Geographic',
    icon: 'map',
    description: 'World map colored by numeric value per country',
    axes: { x: 'country name', y: 'value' },
    requires: { x: 'any', y: 'number' },
    aiHint: 'Query country name (English) and a numeric metric column',
  },
  {
    id: 'meter',
    label: 'Meter',
    group: 'Part-to-Whole',
    icon: 'gauge',
    description: 'Proportional meter showing segments of a total',
    axes: { x: 'segment label', y: 'value', z: 'total (optional)' },
    requires: { x: 'any', y: 'number' },
    aiHint: 'Query segment name and numeric value columns; optionally a total column',
  },
]
