// A complete Stroke plugin, and the shortest useful one I could write.
//
// It runs inside a Worker with no DOM, no network and no access to the app, and
// its whole job is to turn a value into a render directive. The entry file is
// evaluated as a CommonJS module, so assign the plugin to `module.exports`.

// Columns worth colouring. A formatter that applies to everything is a
// formatter that slows down every table, so be specific here: `appliesTo` is
// asked once per column, and a "no" means this plugin is never consulted for
// that column's cells again.
const COLUMN = /(^|_)(latency|latency_ms|duration_ms|score|health|uptime|percent|pct|cpu|memory)($|_)/i

/** Green under `warn`, amber under `bad`, red above. */
const THRESHOLDS = { warn: 70, bad: 90 }

const COLORS = {
  good: { bg: 'rgba(34,197,94,0.16)', fg: 'rgb(74,222,128)' },
  warn: { bg: 'rgba(245,158,11,0.17)', fg: 'rgb(251,191,36)' },
  bad: { bg: 'rgba(239,68,68,0.16)', fg: 'rgb(248,113,113)' },
}

module.exports = {
  /**
   * @param {string} type column type as the engine reports it
   * @param {string} name column name
   * @returns {boolean} whether format() should be called for this column
   */
  appliesTo(type, name) {
    return COLUMN.test(name) && /int|float|double|numeric|decimal|real|number/i.test(type)
  },

  /**
   * @param {unknown} value the cell value
   * @param {{ type: string, name: string, config: Record<string, unknown> }} ctx
   * @returns {object | null} a render directive, or null to leave the cell alone
   */
  format(value, ctx) {
    const n = Number(value)
    if (!Number.isFinite(n)) return null
    const band = n >= THRESHOLDS.bad ? 'bad' : n >= THRESHOLDS.warn ? 'warn' : 'good'
    return {
      badge: COLORS[band],
      title: `${ctx.name} = ${n} (${band})`,
    }
  },
}
