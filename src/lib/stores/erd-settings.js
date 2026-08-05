const STORAGE_KEY = 'stroke:erd'

/**
 * @typedef {'all' | 'keys'} ColumnMode
 * @typedef {'compact' | 'comfortable' | 'spacious'} Spacing
 * @typedef {'smart' | 'direct'} Routing
 * @typedef {{ columnMode: ColumnMode, showTypes: boolean, connectedOnly: boolean,
 *   spacing: Spacing, routing: Routing, grid: boolean, touched: string[] }} ErdSettings
 */

/**
 * `touched` lists the keys the user has actually chosen. Anything not in it
 * follows the view's own default - a per-table diagram wants different spacing
 * and line routing than a whole-schema one - and stops following it the moment
 * the user picks a value.
 * @type {ErdSettings}
 */
export const DEFAULT_ERD_SETTINGS = {
  columnMode: 'all',
  showTypes: true,
  connectedOnly: false,
  spacing: 'comfortable',
  routing: 'smart',
  grid: true,
  touched: [],
}

/** Defaults per view: a focused table diagram is small and wide-open, a whole
 *  schema is dense and needs its lines routed around the cards. */
export const SCOPE_DEFAULTS = {
  focused: { spacing: /** @type {Spacing} */ ('spacious'), routing: /** @type {Routing} */ ('direct') },
  schema:  { spacing: /** @type {Spacing} */ ('comfortable'), routing: /** @type {Routing} */ ('smart') },
}

/**
 * Layout gutters per spacing preset. `rankSep`/`nodeSep` feed Dagre; the rest
 * drive the focus + fan-out packers. Every value leaves room for an edge lane
 * between two cards - that gap is what the router uses to get around them.
 */
export const SPACING_PRESETS = {
  compact:     { rankSep: 220, nodeSep: 48,  colGap: 96,  rowGap: 56,  sideGap: 240 },
  comfortable: { rankSep: 320, nodeSep: 76,  colGap: 140, rowGap: 84,  sideGap: 340 },
  spacious:    { rankSep: 440, nodeSep: 108, colGap: 190, rowGap: 124, sideGap: 460 },
}

/** @returns {ErdSettings} */
export function loadErdSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_ERD_SETTINGS }
    const p = JSON.parse(raw)
    return {
      columnMode: p.columnMode === 'keys' ? 'keys' : 'all',
      showTypes: p.showTypes !== false,
      connectedOnly: p.connectedOnly === true,
      spacing: p.spacing in SPACING_PRESETS ? p.spacing : DEFAULT_ERD_SETTINGS.spacing,
      routing: p.routing === 'direct' ? 'direct' : 'smart',
      grid: p.grid !== false,
      touched: Array.isArray(p.touched) ? p.touched.filter(k => typeof k === 'string') : [],
    }
  } catch {
    return { ...DEFAULT_ERD_SETTINGS }
  }
}

/** @param {Partial<ErdSettings>} patch */
export function saveErdSettings(patch) {
  const prev = loadErdSettings()
  const keys = Object.keys(patch).filter(k => k !== 'touched')
  const next = { ...prev, ...patch, touched: [...new Set([...prev.touched, ...keys])] }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch (err) {
    console.error('Failed to persist ERD settings:', err)
  }
  return next
}
