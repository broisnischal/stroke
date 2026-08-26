import { describe, expect, it } from 'vitest'
import { restyleSavedOption } from './chart-utils.js'

/**
 * A saved chart is a JSON snapshot of a built ECharts option, so it carries the
 * theme it was built in. Saved in light mode and rendered on a dark dashboard,
 * its axis labels were dark text on a dark card - invisible, which is what
 * "the chart is broken" looked like.
 */
const SAVED_IN_LIGHT = {
  title: { text: 'Monthly Revenue Trend' },
  textStyle: { color: 'rgba(0,0,0,0.42)', fontSize: 11 },
  xAxis: {
    type: 'category',
    data: ['a', 'b'],
    axisLabel: { color: 'rgba(0,0,0,0.45)' },
    splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } },
  },
  yAxis: { type: 'value', axisLabel: { color: 'rgba(0,0,0,0.45)' } },
  legend: { orient: 'vertical', right: '4%', top: 'center', textStyle: { color: 'rgba(0,0,0,0.42)' } },
  grid: { top: 40, left: 8, right: 8, bottom: 8 },
  series: [{ type: 'line', data: [1, 2] }],
}

const isLightText = (/** @type {string} */ c) => /rgba\(0,\s*0,\s*0/.test(c ?? '')
const isDarkText = (/** @type {string} */ c) => /rgba\(255,\s*255,\s*255/.test(c ?? '')

describe('restyleSavedOption', () => {
  it('re-colours a light-saved chart for a dark view', () => {
    const o = restyleSavedOption(SAVED_IN_LIGHT, { isDark: true })
    expect(isDarkText(o.xAxis.axisLabel.color)).toBe(true)
    expect(isDarkText(o.yAxis.axisLabel.color)).toBe(true)
    expect(isDarkText(o.textStyle.color)).toBe(true)
    expect(isDarkText(o.legend.textStyle.color)).toBe(true)
  })

  it('re-colours a dark-saved chart for a light view', () => {
    const darkSaved = restyleSavedOption(SAVED_IN_LIGHT, { isDark: true })
    const o = restyleSavedOption(darkSaved, { isDark: false })
    expect(isLightText(o.xAxis.axisLabel.color)).toBe(true)
    expect(isLightText(o.textStyle.color)).toBe(true)
  })

  it('keeps the data, series and axis type untouched', () => {
    const o = restyleSavedOption(SAVED_IN_LIGHT, { isDark: true })
    expect(o.xAxis.data).toEqual(['a', 'b'])
    expect(o.xAxis.type).toBe('category')
    expect(o.series).toEqual(SAVED_IN_LIGHT.series)
  })

  it('drops the in-chart title, which the card already shows', () => {
    expect(restyleSavedOption(SAVED_IN_LIGHT, { isDark: true }).title).toBeUndefined()
  })

  it('hides the legend on a tile, where it would cover the plot', () => {
    // The donut's legend is positioned for a full-size chart; on a dashboard
    // tile it lands on the chart itself and its labels get clipped.
    expect(restyleSavedOption(SAVED_IN_LIGHT, { isDark: true, compact: true }).legend.show).toBe(false)
    expect(restyleSavedOption(SAVED_IN_LIGHT, { isDark: true }).legend.show).toBeUndefined()
  })

  it('reclaims the title gap in a tile', () => {
    const o = restyleSavedOption(SAVED_IN_LIGHT, { isDark: true, compact: true })
    expect(o.grid.top).toBeLessThan(SAVED_IN_LIGHT.grid.top)
    expect(o.grid.containLabel).toBe(true)
  })

  it('restores the formatter JSON.stringify dropped from a timestamp axis', () => {
    // The shape the app actually stores - the same strings the axis in a saved
    // dashboard chart shows.
    const withTimestamps = {
      ...SAVED_IN_LIGHT,
      xAxis: {
        ...SAVED_IN_LIGHT.xAxis,
        data: ['2026-02-11 00:00:00 UTC', '2026-03-12 00:00:00 UTC', '2026-04-10 00:00:00 UTC'],
      },
    }
    const o = restyleSavedOption(withTimestamps, { isDark: true })
    expect(typeof o.xAxis.axisLabel.formatter).toBe('function')
    // Without it the axis prints the whole stored string.
    const label = o.xAxis.axisLabel.formatter('2026-02-11 00:00:00 UTC')
    expect(label).not.toBe('2026-02-11 00:00:00 UTC')
    expect(label).toMatch(/Feb/)
  })

  it('leaves a category axis without a formatter', () => {
    const o = restyleSavedOption(SAVED_IN_LIGHT, { isDark: true })
    expect(o.xAxis.axisLabel.formatter).toBeUndefined()
  })

  it('survives an empty or malformed option', () => {
    expect(restyleSavedOption(null, { isDark: true })).toBe(null)
    expect(restyleSavedOption({}, { isDark: true })).toEqual({})
    expect(() => restyleSavedOption({ xAxis: 'nonsense' }, { isDark: true })).not.toThrow()
  })

  it('handles an array of axes', () => {
    const dual = { ...SAVED_IN_LIGHT, yAxis: [SAVED_IN_LIGHT.yAxis, SAVED_IN_LIGHT.yAxis] }
    const o = restyleSavedOption(dual, { isDark: true })
    expect(o.yAxis).toHaveLength(2)
    expect(o.yAxis.every((a) => isDarkText(a.axisLabel.color))).toBe(true)
  })
})
