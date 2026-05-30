/**
 * Utilities for converting SQL result sets (columns + rows) into ECharts option objects.
 * All functions return pure JSON — no callbacks — so AI can generate them too.
 */

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
  // Prefer a date/string column for X
  return (
    columns.find(c => colType(c) === 'date') ??
    columns.find(c => colType(c) === 'string') ??
    columns[0]
  )?.name ?? ''
}

/** @param {ColInfo[]} columns @param {string} xCol */
export function guessYCol(columns, xCol) {
  return (
    columns.find(c => c.name !== xCol && colType(c) === 'number')
  )?.name ?? columns.find(c => c.name !== xCol)?.name ?? ''
}

const PALETTE = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#a855f7', '#14b8a6', '#f97316', '#ec4899', '#64748b',
]

/**
 * Common chart grid / tooltip shared across types.
 * @param {boolean} isDark
 */
function baseOption(isDark) {
  const textColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'
  const lineColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'
  const bg = isDark ? 'rgba(24,24,27,0.95)' : 'rgba(255,255,255,0.97)'
  return {
    backgroundColor: 'transparent',
    textStyle: { color: textColor, fontFamily: 'Geist Variable, ui-sans-serif, system-ui, sans-serif', fontSize: 11 },
    tooltip: {
      backgroundColor: bg,
      borderColor: lineColor,
      borderWidth: 1,
      textStyle: { color: isDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.8)', fontSize: 11 },
      extraCssText: 'border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.18);',
    },
    grid: { top: 24, right: 16, bottom: 40, left: 12, containLabel: true },
    axisPointer: { lineStyle: { color: lineColor } },
    splitLine: { lineStyle: { color: lineColor } },
  }
}

/**
 * Build an ECharts option for any chart type.
 * @param {{
 *   type: 'bar'|'line'|'area'|'pie'|'scatter'|'heatmap'
 *   columns: ColInfo[]
 *   rows: Rows
 *   xCol: string
 *   yCol: string
 *   groupCol?: string
 *   isDark?: boolean
 *   title?: string
 * }} cfg
 * @returns {import('echarts').EChartsOption}
 */
export function buildOption({ type, columns, rows, xCol, yCol, groupCol, isDark = false, title }) {
  const base = baseOption(isDark)
  const xi = columns.findIndex(c => c.name === xCol)
  const yi = columns.findIndex(c => c.name === yCol)
  const gi = groupCol ? columns.findIndex(c => c.name === groupCol) : -1

  if (type === 'pie') {
    const data = rows.map(r => ({ name: String(r[xi] ?? ''), value: Number(r[yi]) || 0 }))
    return {
      ...base,
      grid: undefined,
      legend: { orient: 'vertical', right: '4%', top: 'center', textStyle: base.textStyle },
      series: [{ type: 'pie', radius: ['38%', '68%'], center: ['42%', '50%'], data, label: { color: base.textStyle.color } }],
      ...(title ? { title: { text: title, textStyle: { ...base.textStyle, fontSize: 13, fontWeight: 600 } } } : {}),
    }
  }

  if (type === 'scatter') {
    const data = rows.map(r => [Number(r[xi]) || 0, Number(r[yi]) || 0])
    return {
      ...base,
      xAxis: { type: 'value', name: xCol, nameLocation: 'middle', nameGap: 28, nameTextStyle: base.textStyle },
      yAxis: { type: 'value', name: yCol, nameLocation: 'middle', nameGap: 40, nameTextStyle: base.textStyle },
      series: [{ type: 'scatter', data, symbolSize: 7, itemStyle: { color: PALETTE[0] } }],
      tooltip: { ...base.tooltip, trigger: 'item' },
    }
  }

  if (type === 'heatmap') {
    // Needs a groupCol for Y axis; uses value in yCol
    const xVals = [...new Set(rows.map(r => String(r[xi])))]
    const yVals = gi >= 0 ? [...new Set(rows.map(r => String(r[gi])))] : [yCol]
    const data = rows.map(r => [
      xVals.indexOf(String(r[xi])),
      gi >= 0 ? yVals.indexOf(String(r[gi])) : 0,
      Number(r[yi]) || 0,
    ])
    return {
      ...base,
      xAxis: { type: 'category', data: xVals, splitArea: { show: true } },
      yAxis: { type: 'category', data: yVals, splitArea: { show: true } },
      visualMap: { min: 0, max: Math.max(...data.map(d => d[2])), calculable: true, orient: 'horizontal', left: 'center', bottom: 4, textStyle: base.textStyle },
      series: [{ type: 'heatmap', data, label: { show: data.length < 100 } }],
      grid: { ...base.grid, bottom: 70 },
    }
  }

  // Bar, Line, Area — with optional group-by for multi-series
  const xData = [...new Set(rows.map(r => String(r[xi])))]

  /** @type {any[]} */
  let series
  if (gi >= 0) {
    const groups = [...new Set(rows.map(r => String(r[gi])))]
    series = groups.map((grp, i) => {
      const grpRows = rows.filter(r => String(r[gi]) === grp)
      const dataMap = Object.fromEntries(grpRows.map(r => [String(r[xi]), Number(r[yi]) || 0]))
      return makeSeries(type, grp, xData.map(x => dataMap[x] ?? null), PALETTE[i % PALETTE.length])
    })
  } else {
    const dataMap = Object.fromEntries(rows.map(r => [String(r[xi]), Number(r[yi]) || 0]))
    series = [makeSeries(type, yCol, xData.map(x => dataMap[x] ?? null), PALETTE[0])]
  }

  return {
    ...base,
    tooltip: { ...base.tooltip, trigger: 'axis' },
    legend: series.length > 1 ? { textStyle: base.textStyle, top: 4 } : undefined,
    xAxis: {
      type: 'category',
      data: xData,
      axisLabel: { color: base.textStyle.color, rotate: xData.length > 12 ? 30 : 0, overflow: 'truncate', width: 80 },
      axisLine: { lineStyle: { color: 'rgba(128,128,128,0.2)' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: base.textStyle.color },
      splitLine: { lineStyle: { color: baseOption(isDark).splitLine.lineStyle.color } },
    },
    series,
    ...(title ? { title: { text: title, textStyle: { ...base.textStyle, fontSize: 13, fontWeight: 600 }, top: 4, left: 'center' } } : {}),
  }
}

/** @param {'bar'|'line'|'area'} type @param {string} name @param {any[]} data @param {string} color */
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
 * Detect if a column set is suitable for a chart (at least one numeric column and one other).
 * @param {ColInfo[]} columns
 */
export function isChartable(columns) {
  return columns.length >= 2 && columns.some(c => colType(c) === 'number')
}
