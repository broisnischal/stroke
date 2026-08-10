import { writable, get } from 'svelte/store'
import { setMode } from 'mode-watcher'
import {
  DEFAULT_THEME_ID,
  isDarkTheme,
  THEME_IDS,
  normalizeThemeId,
} from '$lib/themes/registry.js'
import { zoomState, ZOOM_MIN, ZOOM_MAX } from '$lib/stores/canvas-zoom.svelte.js'
import { detectOs } from '$lib/platform.js'
import { SQL_FORMAT_DEFAULTS, normalizeSqlFormat, setSqlFormatOptions } from '$lib/sql-format-options.js'

const STORAGE_KEY = 'stroke:settings'

/** @typedef {import('$lib/themes/registry.js').ThemeId} ThemeId */
/** @typedef {'geist' | 'serif' | 'apple' | 'inter' | 'mono' | 'fira' | 'plex' | 'space' | 'source'} FontId */
/** @typedef {'regular' | 'light' | 'bold'} IconStyleId */
/** @typedef {'lucide' | 'hugeicons' | 'phosphor'} IconSetId */
/** @typedef {{ theme: ThemeId, zoom: number, font: FontId, iconStyle: IconStyleId, iconSet: IconSetId, tableStyle: TableStyleId, mcpAutoStart: boolean, launchAtLogin: boolean, autoReconnectOnStartup: boolean, previewDmlBeforeApply: boolean, defaultDataView: string, paginationMode: string, maxQueryHistory: number, connectTimeoutMs: number, socketTimeoutMs: number, maxAllowedPacket: number, sessionTimezone: string, vimMode: boolean, cmdkAiEnabled: boolean, liveModeEnabled: boolean, nullSortOrder: string, agentChatFontSize: number, agentCodeFontSize: number, agentThinkingStyle: string, agentShowQueryCards: boolean, agentWebAccess: boolean, tableTextAlign: string, telemetry: boolean, jsonWordWrap: boolean, nativeScroll: boolean, rowSpacing: RowSpacingId, zebraRows: boolean, autoSaveQueries: boolean, sqlFormat: import('$lib/sql-format-options.js').SqlFormatOptions }} AppSettings */

/** UI zoom scale (font + layout). 1 = 100%. */
export const ZOOM_STEPS = [0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.25, 1.5]
const DEFAULT_ZOOM = 1

/**
 * Selectable font stacks. Each sets the UI (`--font-sans`) and data/SQL/grid
 * (`--font-mono`) families. Stacks fall back gracefully when a font isn't
 * installed, so an unavailable option degrades instead of breaking.
 * @type {Record<FontId, { label: string, description: string, sans: string, mono: string }>}
 */
export const FONT_PRESETS = {
  geist: {
    label: 'Geist',
    description: 'Clean variable sans',
    sans: '"Geist Variable", ui-sans-serif, system-ui, sans-serif',
    mono: '"Geist Mono Variable", ui-monospace, monospace',
  },
  serif: {
    label: 'Serif',
    description: 'Editorial serif UI',
    sans: 'ui-serif, "New York", "Iowan Old Style", Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace',
  },
  apple: {
    label: 'Apple',
    description: 'San Francisco + SF Mono',
    sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif',
    mono: 'ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace',
  },
  // Both faces below ship with the app (fontsource imports in app.css), so
  // these presets render identically on every platform - no system fallback.
  inter: {
    label: 'Inter',
    description: 'Inter + JetBrains Mono',
    sans: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
    mono: '"JetBrains Mono Variable", ui-monospace, monospace',
  },
  mono: {
    label: 'Mono',
    description: 'All-monospace terminal feel',
    sans: '"JetBrains Mono Variable", ui-monospace, monospace',
    mono: '"JetBrains Mono Variable", ui-monospace, monospace',
  },
  // The four below also ship with the app (fontsource imports in app.css).
  fira: {
    label: 'Fira Code',
    description: 'Inter + Fira Code ligatures',
    sans: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
    mono: '"Fira Code Variable", ui-monospace, monospace',
  },
  plex: {
    label: 'IBM Plex',
    description: 'IBM Plex Sans + Mono',
    sans: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace',
  },
  space: {
    label: 'Space Grotesk',
    description: 'Geometric sans + JetBrains Mono',
    sans: '"Space Grotesk Variable", ui-sans-serif, system-ui, sans-serif',
    mono: '"JetBrains Mono Variable", ui-monospace, monospace',
  },
  source: {
    label: 'Source Code Pro',
    description: 'Inter + Source Code Pro',
    sans: '"Inter Variable", ui-sans-serif, system-ui, sans-serif',
    mono: '"Source Code Pro Variable", ui-monospace, monospace',
  },
}
/** @type {FontId} */
export const DEFAULT_FONT = 'geist'
/** @returns {FontId} */
function normalizeFont(/** @type {unknown} */ id) {
  return FONT_PRESETS[/** @type {FontId} */ (id)] ? /** @type {FontId} */ (id) : DEFAULT_FONT
}

/**
 * Selectable icon weights. Applied globally as the `stroke-width` of every Lucide
 * icon via a `[data-icon-style]` rule in app.css - no per-component changes. Bold
 * also aids low-vision readability of small nav/toolbar glyphs.
 * @type {Record<IconStyleId, { label: string, description: string, strokeWidth: number }>}
 */
export const ICON_STYLES = {
  regular: { label: 'Regular', description: 'Balanced default weight', strokeWidth: 2 },
  light:   { label: 'Light',   description: 'Thin and minimal',        strokeWidth: 1.5 },
  bold:    { label: 'Bold',    description: 'Heavier, high-visibility', strokeWidth: 2.5 },
}
/** @type {IconStyleId} */
export const DEFAULT_ICON_STYLE = 'regular'
/** @returns {IconStyleId} */
function normalizeIconStyle(/** @type {unknown} */ id) {
  return ICON_STYLES[/** @type {IconStyleId} */ (id)] ? /** @type {IconStyleId} */ (id) : DEFAULT_ICON_STYLE
}

/**
 * Selectable icon families. `lucide` is the built-in stroke set (also honors the
 * icon-weight setting above). `hugeicons` swaps in the Hugeicons stroke set wherever
 * a component renders through the shared `Icon` wrapper; unmapped glyphs fall back
 * to Lucide, so coverage can grow without ever breaking the UI.
 * @type {Record<IconSetId, { label: string, description: string }>}
 */
export const ICON_SETS = {
  lucide:    { label: 'Lucide',    description: 'Crisp, minimal built-in set' },
  hugeicons: { label: 'Hugeicons', description: 'Rounded, expressive premium set' },
  phosphor:  { label: 'Phosphor',  description: 'Friendly, geometric open set' },
}
/** @type {IconSetId} */
export const DEFAULT_ICON_SET = 'lucide'
/** @returns {IconSetId} */
function normalizeIconSet(/** @type {unknown} */ id) {
  return ICON_SETS[/** @type {IconSetId} */ (id)] ? /** @type {IconSetId} */ (id) : DEFAULT_ICON_SET
}

/**
 * @typedef {'lines'|'dotted'|'dots'|'minimal'|'bordered'|'striped'|'dashed'|'columns'} TableStyleId
 * @typedef {{ label: string, description: string,
 *   rows: boolean, cols: boolean, dash: number[]|null, dots: boolean, strong?: boolean, zebra?: boolean }} TableStyleDef
 */

/**
 * Data-grid style presets for the canvas table. Each preset only changes how the
 * per-row grid pass draws separators - it's applied in DataTable's virtualized
 * draw(), so it costs O(visible cells) and never scales with total row count.
 *   - rows/cols: draw horizontal / vertical separators
 *   - dash:      canvas setLineDash pattern (null = solid)
 *   - dots:      draw a small dot at each cell join instead of lines
 * @type {Record<TableStyleId, TableStyleDef>}
 */
export const TABLE_STYLES = {
  lines:    { label: 'Lines',    description: 'Solid grid lines (classic)',        rows: true,  cols: true,  dash: null,   dots: false },
  bordered: { label: 'Bordered', description: 'Bold high-contrast grid lines',     rows: true,  cols: true,  dash: null,   dots: false, strong: true },
  striped:  { label: 'Striped',  description: 'Alternating even/odd row shading',  rows: true,  cols: false, dash: null,   dots: false, zebra: true },
  dotted:   { label: 'Dotted',   description: 'Fine dotted grid, softer feel',     rows: true,  cols: true,  dash: [1, 3], dots: false },
  dots:     { label: 'Dots',     description: 'Corner dots + soft row shading',    rows: false, cols: false, dash: null,   dots: true,  zebra: true },
  minimal:  { label: 'Minimal',  description: 'Row separators only, no columns',   rows: true,  cols: false, dash: null,   dots: false },
  dashed:   { label: 'Dashed',   description: 'Dashed grid, drafting-table feel',  rows: true,  cols: true,  dash: [5, 4], dots: false },
  columns:  { label: 'Columns',  description: 'Vertical rails only, open rows',    rows: false, cols: true,  dash: null,   dots: false },
}
/** @type {TableStyleId} */
export const DEFAULT_TABLE_STYLE = 'lines'

/**
 * Row spacing for the data grid, as a row height in CSS pixels at 100% zoom.
 * The grid multiplies by the canvas zoom, so these stay proportional.
 * Compact fits roughly a third more rows on screen; relaxed is easier to track
 * across wide tables and kinder at small font sizes.
 * @typedef {'compact' | 'standard' | 'relaxed'} RowSpacingId
 * @type {Record<RowSpacingId, { label: string, height: number }>}
 */
export const ROW_SPACINGS = {
  compact: { label: 'Compact', height: 20 },
  standard: { label: 'Standard', height: 24 },
  relaxed: { label: 'Relaxed', height: 32 },
}
/** @type {RowSpacingId} */
export const DEFAULT_ROW_SPACING = 'standard'
export const ROW_SPACING_IDS = /** @type {RowSpacingId[]} */ (Object.keys(ROW_SPACINGS))
/** @param {unknown} id @returns {RowSpacingId} */
export function normalizeRowSpacing(id) {
  return ROW_SPACING_IDS.includes(/** @type {any} */ (id)) ? /** @type {RowSpacingId} */ (id) : DEFAULT_ROW_SPACING
}
/** Row height in px at 100% zoom for a spacing id. @param {unknown} id */
export function rowSpacingHeight(id) {
  return ROW_SPACINGS[normalizeRowSpacing(id)].height
}
/** @returns {TableStyleId} */
export function normalizeTableStyle(/** @type {unknown} */ id) {
  return TABLE_STYLES[/** @type {TableStyleId} */ (id)] ? /** @type {TableStyleId} */ (id) : DEFAULT_TABLE_STYLE
}

// ── Query & connection defaults ──────────────────────────────────────────────
// Numeric/text knobs surfaced under Settings → Database. `maxQueryHistory` is
// consumed by the query-history store; the connector values (packet/timeouts/
// timezone) are persisted as MySQL connection defaults.
/**
 * Grid cell alignment.
 * 'numbers' is the convention every spreadsheet and DB client uses: digits line
 * up by place value so you can compare magnitudes down a column, while prose
 * stays left where the eye finds the start of each line.
 */
export const TABLE_ALIGN_OPTIONS = /** @type {const} */ ([
  { id: 'left', label: 'Left' },
  { id: 'numbers', label: 'Numbers right' },
  { id: 'right', label: 'Right' },
])
export const TABLE_ALIGN_IDS = TABLE_ALIGN_OPTIONS.map((o) => o.id)
export const DEFAULT_TABLE_ALIGN = 'left'

// Must stay in step with DATA_VIEW_MODES in TableToolbar.svelte — that list is
// what a tab can actually switch to, this one is what you may pick as the
// default. 'erd' was added to the toolbar without being added here, so it was
// the one view you could open but never default to.
export const DATA_VIEW_IDS = /** @type {const} */ (['table', 'json', 'record', 'text', 'chart', 'erd'])
export const DEFAULT_DATA_VIEW = 'table'

// How the grid pages through rows.
//  • offset   - LIMIT/OFFSET; random access (jump to any page) but O(offset) deep.
//  • cursor   - keyset by primary key (opaque cursor); O(1) next/prev, no page jump.
//  • keyset   - same engine as cursor (keyset on the PK); listed separately for clarity.
//  • temporal - keyset on a timestamp column (newest-first); great for logs/events.
// All non-offset modes fall back to offset when their preconditions aren't met
// (no single-column PK, a multi-column sort, or a jump to an arbitrary page).
export const PAGINATION_MODE_IDS = /** @type {const} */ (['offset', 'cursor', 'keyset', 'temporal'])
/** Null placement for quick-query ORDER BY (dialects that support it). */
export const NULL_SORT_IDS = /** @type {const} */ (['unset', 'first', 'last'])
export const DEFAULT_NULL_SORT = 'unset'

/** Selectable font sizes (px) for the AI/agent chat + code blocks. */
export const AGENT_FONT_SIZES = /** @type {const} */ ([12, 13, 14, 15, 16])
export const DEFAULT_AGENT_CHAT_FONT = 16
export const DEFAULT_AGENT_CODE_FONT = 16

/**
 * Chat and code both used to default to the app's 14/13px UI scale, which is the
 * right size for dense chrome and the wrong one for prose you actually read. The
 * defaults below moved to 16px; these are what they used to be, so a stored value
 * that still matches can be recognised as "never chosen" and moved up with them.
 * @see migrateAgentFont
 */
const LEGACY_AGENT_CHAT_FONT = 14
const LEGACY_AGENT_CODE_FONT = 13

/**
 * Existing installs have the old default written into localStorage - not because
 * anyone picked it, but because saving any unrelated setting persists the whole
 * object. Left alone they would keep 14/13 forever and never see the new default.
 * A value that still equals the old default is treated as unset; anything else is
 * a real choice and is left exactly as it is.
 * @param {unknown} stored @param {number} legacy @param {number} next
 */
function migrateAgentFont(stored, legacy, next) {
  if (!AGENT_FONT_SIZES.includes(/** @type {never} */ (stored))) return next
  return stored === legacy ? next : /** @type {number} */ (stored)
}
/** Thinking-indicator visual styles for the agent chat. */
export const THINKING_STYLES = /** @type {const} */ ([
  { id: 'shimmer', label: 'Shimmer' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'static', label: 'Static' },
])
export const THINKING_STYLE_IDS = THINKING_STYLES.map((s) => s.id)
export const DEFAULT_THINKING_STYLE = 'shimmer'
export const DEFAULT_PAGINATION_MODE = 'offset'
export const DEFAULT_MAX_QUERY_HISTORY = 100
export const DEFAULT_CONNECT_TIMEOUT_MS = 60000
export const DEFAULT_SOCKET_TIMEOUT_MS = 600000
export const DEFAULT_MAX_ALLOWED_PACKET = 1073741824
export const DEFAULT_SESSION_TIMEZONE = 'SYSTEM'

/**
 * Coerce a persisted value to an integer within [min, max], falling back to
 * `def` when it isn't a finite number.
 * @param {unknown} value @param {number} def @param {number} [min] @param {number} [max]
 */
function normalizeInt(value, def, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, n))
}

/** @type {AppSettings} */
export const DEFAULT_SETTINGS = {
  theme: DEFAULT_THEME_ID,
  zoom: DEFAULT_ZOOM,
  font: DEFAULT_FONT,
  iconStyle: DEFAULT_ICON_STYLE,
  iconSet: DEFAULT_ICON_SET,
  tableStyle: DEFAULT_TABLE_STYLE,
  mcpAutoStart: false,
  launchAtLogin: false,
  autoReconnectOnStartup: true,
  previewDmlBeforeApply: true,
  defaultDataView: DEFAULT_DATA_VIEW,
  paginationMode: DEFAULT_PAGINATION_MODE,
  maxQueryHistory: DEFAULT_MAX_QUERY_HISTORY,
  connectTimeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
  socketTimeoutMs: DEFAULT_SOCKET_TIMEOUT_MS,
  maxAllowedPacket: DEFAULT_MAX_ALLOWED_PACKET,
  sessionTimezone: DEFAULT_SESSION_TIMEZONE,
  vimMode: false,
  cmdkAiEnabled: false,
  // Soft-wrap in every JSON viewer. Off by default: unwrapped keeps the
  // structure scannable down the left edge, and one embedding value can run to
  // tens of thousands of characters — wrapped, it buries every row around it.
  jsonWordWrap: false,
  // Off by default, i.e. the grid and the sidebar scroll with the app's own eased
  // scrolling. Turning it on hands both back to the OS - which is what you want
  // if your system already does momentum/inertia scrolling well, or if you drive
  // the app through a trackpad or a screen reader whose behaviour we shouldn't
  // second-guess.
  nativeScroll: false,
  rowSpacing: DEFAULT_ROW_SPACING,
  // SQL formatter preferences. Defaults live with the formatter (format-sql.js)
  // so there is one source for what a valid option set is.
  sqlFormat: { ...SQL_FORMAT_DEFAULTS },
  // Independent of the grid-style preset: two of those presets (Striped, Dots)
  // shade alternate rows as part of their look, and this turns the same shading
  // on for any of the others without changing the separators you picked.
  zebraRows: false,
  // Off by default: every executed statement is already in Query History, and
  // saving each one would bury the handful you deliberately kept. On, a run that
  // succeeded is filed under Saved Queries too, deduplicated by its SQL.
  autoSaveQueries: false,
  // On by default, and stated plainly in Settings. What it sends is a fixed
  // list of event names, the version and the OS — never a query, a table name
  // or anything about a connection. See src/lib/telemetry.js.
  telemetry: true,
  liveModeEnabled: false,
  nullSortOrder: DEFAULT_NULL_SORT,
  agentChatFontSize: DEFAULT_AGENT_CHAT_FONT,
  agentCodeFontSize: DEFAULT_AGENT_CODE_FONT,
  agentThinkingStyle: DEFAULT_THINKING_STYLE,
  // On by default: seeing the SQL the agent ran, and what it returned, is how
  // you tell a right answer from a confident one.
  agentShowQueryCards: true,
  // Off by default. Everything else the agent does stays between the app and
  // your database; searching sends your question to a third party, so it is a
  // decision the user makes rather than one they discover afterwards.
  agentWebAccess: false,
  tableTextAlign: DEFAULT_TABLE_ALIGN,
}

/** Reactive app font id (synced by applySettings). */
export const appFont = writable(/** @type {FontId} */ (DEFAULT_FONT))

/** Reactive app icon style (synced by applySettings). */
export const appIconStyle = writable(/** @type {IconStyleId} */ (DEFAULT_ICON_STYLE))

/** Reactive app icon set / family (synced by applySettings). */
export const appIconSet = writable(/** @type {IconSetId} */ (DEFAULT_ICON_SET))

/** Reactive app zoom scale (synced by applySettings). Monaco editors subscribe
 *  to this to rescale their font/line-height in lockstep with the rest of the UI. */
export const appZoom = writable(DEFAULT_ZOOM)

/** Reactive app theme id (synced by applySettings). */
export const appThemeId = writable(/** @type {ThemeId} */ (DEFAULT_THEME_ID))

/** Reactive: show a SQL preview/confirm before applying grid writes (synced by applySettings). */
export const appPreviewDml = writable(true)

/** Reactive: experimental app-wide Vim mode enabled (synced by applySettings). */
export const appVimMode = writable(false)

/** Reactive: experimental ⌘K "Ask AI" enabled (off by default; synced by applySettings). */
export const appCmdkAi = writable(false)

/** Reactive JSON soft-wrap preference (synced by applySettings).
 *  Every JSON viewer subscribes, so flipping it in Settings — or from the Wrap
 *  button on any one of them — reflows all of them at once instead of leaving
 *  each open view on whatever it happened to be created with. */
export const appJsonWordWrap = writable(false)

/** Reactive data-grid row spacing (synced by applySettings); DataTable derives its
 *  row height from it and repaints. */
export const appRowSpacing = writable(/** @type {RowSpacingId} */ (DEFAULT_ROW_SPACING))

/** Reactive: shade alternate grid rows regardless of the style preset. */
export const appZebraRows = writable(false)

/** Reactive: file every successful run under Saved Queries as well as History. */
export const appAutoSaveQueries = writable(false)

/** Reactive: use the OS's native scrolling instead of the app's eased scrolling
 *  (off by default). The grid and the sidebar both subscribe, so flipping it
 *  applies without reopening anything. */
export const appNativeScroll = writable(false)

/** Reactive: experimental Live mode (auto-refresh) status-bar toggle enabled (off by default). */
export const appLiveMode = writable(false)

/** Whether the agent transcript shows a card per executed query. */
export const appAgentQueryCards = writable(true)

/** Whether the agent may search the web and read pages. */
export const appAgentWebAccess = writable(false)

/** Grid cell alignment - the canvas table subscribes and repaints on change. */
export const appTableAlign = writable(/** @type {string} */ (DEFAULT_TABLE_ALIGN))

/** Reactive pagination strategy (offset | cursor | keyset | temporal), synced by applySettings. */
export const appPaginationMode = writable(/** @type {string} */ (DEFAULT_PAGINATION_MODE))

/** Reactive canvas-table grid style preset (synced by applySettings). DataTable
 *  subscribes to repaint when it changes. */
export const appTableStyle = writable(/** @type {TableStyleId} */ (DEFAULT_TABLE_STYLE))

const LAST_DARK_KEY  = 'stroke:last-dark-theme'
const LAST_LIGHT_KEY = 'stroke:last-light-theme'

/** @param {ThemeId} id */
function saveLastForMode(id) {
  try {
    if (isDarkTheme(id)) localStorage.setItem(LAST_DARK_KEY, id)
    else                  localStorage.setItem(LAST_LIGHT_KEY, id)
  } catch {}
}

/** @returns {{ dark: ThemeId, light: ThemeId }} */
function loadLastForMode() {
  try {
    const dark  = normalizeThemeId(localStorage.getItem(LAST_DARK_KEY)  ?? 'dark')
    const light = normalizeThemeId(localStorage.getItem(LAST_LIGHT_KEY) ?? 'light')
    return { dark, light }
  } catch {
    return { dark: 'dark', light: 'light' }
  }
}

/** @type {ThemeId[]} */
let themeHistoryStack = []
let restoringTheme = false

/** @param {ThemeId} theme */
function recordThemeBeforeChange(theme) {
  const top = themeHistoryStack[themeHistoryStack.length - 1]
  if (top !== theme) themeHistoryStack.push(theme)
  if (themeHistoryStack.length > 32) themeHistoryStack.shift()
}

// In-memory cache of the normalized settings. All reads go through loadSettings
// and all writes through saveSettings, so this stays authoritative for the app's
// (single) window and lets the zoom/pinch hot path skip a localStorage getItem +
// JSON.parse (× the two loadSettings calls each updateSettings made) per step.
/** @type {AppSettings | null} */
let _settingsCache = null

/**
 * On a fresh install (no saved settings) pick the theme to match the OS
 * appearance: Light Studio for a light system, Dark Studio otherwise. Only ever
 * consulted on the very first load — once the user has any saved settings their
 * chosen theme wins and this is never used again.
 * @returns {ThemeId}
 */
function systemPreferredTheme() {
  try {
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: light)').matches
    ) {
      return 'light'
    }
  } catch {}
  return DEFAULT_THEME_ID
}

/**
 * Windows renders the UI a touch small at 100% (higher default DPI handling than
 * macOS), so new installs there default to 125%. Other platforms keep 100%.
 * First-launch only — the user's saved zoom always wins afterwards.
 * @returns {number}
 */
function defaultZoomForPlatform() {
  try {
    if (detectOs() === 'windows' && ZOOM_STEPS.includes(1.25)) return 1.25
  } catch {}
  return DEFAULT_ZOOM
}

/** @returns {AppSettings} */
export function loadSettings() {
  if (_settingsCache) return { ..._settingsCache }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      _settingsCache = {
        ...DEFAULT_SETTINGS,
        theme: systemPreferredTheme(),
        zoom: defaultZoomForPlatform(),
      }
      return { ..._settingsCache }
    }
    const parsed = JSON.parse(raw)
    const theme = normalizeThemeId(parsed.theme)
    let zoom = DEFAULT_ZOOM
    if (parsed.zoom != null) {
      zoom = Number(parsed.zoom)
    } else if (parsed.fontSize != null) {
      const fs = Number(parsed.fontSize)
      if (Number.isFinite(fs) && fs >= 10 && fs <= 24) zoom = fs / 14
    }
    if (!Number.isFinite(zoom)) zoom = DEFAULT_ZOOM
    if (!ZOOM_STEPS.includes(zoom)) {
      zoom = ZOOM_STEPS.reduce((prev, step) =>
        Math.abs(step - zoom) < Math.abs(prev - zoom) ? step : prev,
      )
    }
    const mcpAutoStart = parsed.mcpAutoStart === true
    const launchAtLogin = parsed.launchAtLogin === true
    const autoReconnectOnStartup = parsed.autoReconnectOnStartup !== false
    const previewDmlBeforeApply = parsed.previewDmlBeforeApply !== false
    const font = normalizeFont(parsed.font)
    const iconStyle = normalizeIconStyle(parsed.iconStyle)
    const iconSet = normalizeIconSet(parsed.iconSet)
    const tableStyle = normalizeTableStyle(parsed.tableStyle)
    const defaultDataView = DATA_VIEW_IDS.includes(parsed.defaultDataView) ? parsed.defaultDataView : DEFAULT_DATA_VIEW
    const paginationMode = PAGINATION_MODE_IDS.includes(parsed.paginationMode) ? parsed.paginationMode : DEFAULT_PAGINATION_MODE
    const maxQueryHistory = normalizeInt(parsed.maxQueryHistory, DEFAULT_MAX_QUERY_HISTORY, 1, 100000)
    const connectTimeoutMs = normalizeInt(parsed.connectTimeoutMs, DEFAULT_CONNECT_TIMEOUT_MS, 0)
    const socketTimeoutMs = normalizeInt(parsed.socketTimeoutMs, DEFAULT_SOCKET_TIMEOUT_MS, 0)
    const maxAllowedPacket = normalizeInt(parsed.maxAllowedPacket, DEFAULT_MAX_ALLOWED_PACKET, 1024)
    const sessionTimezone =
      typeof parsed.sessionTimezone === 'string' && parsed.sessionTimezone.trim()
        ? parsed.sessionTimezone.trim()
        : DEFAULT_SESSION_TIMEZONE
    const vimMode = parsed.vimMode === true
    // Absent means on: only an explicit false opts out.
    const telemetry = parsed.telemetry !== false
    const cmdkAiEnabled = parsed.cmdkAiEnabled === true
    const jsonWordWrap = parsed.jsonWordWrap === true
    const nativeScroll = parsed.nativeScroll === true
    const rowSpacing = normalizeRowSpacing(parsed.rowSpacing)
    const sqlFormat = normalizeSqlFormat(parsed.sqlFormat)
    const zebraRows = parsed.zebraRows === true
    const autoSaveQueries = parsed.autoSaveQueries === true
    const liveModeEnabled = parsed.liveModeEnabled === true
    const nullSortOrder = NULL_SORT_IDS.includes(parsed.nullSortOrder) ? parsed.nullSortOrder : DEFAULT_NULL_SORT
    const agentChatFontSize = migrateAgentFont(parsed.agentChatFontSize, LEGACY_AGENT_CHAT_FONT, DEFAULT_AGENT_CHAT_FONT)
    const agentCodeFontSize = migrateAgentFont(parsed.agentCodeFontSize, LEGACY_AGENT_CODE_FONT, DEFAULT_AGENT_CODE_FONT)
    const agentThinkingStyle = THINKING_STYLE_IDS.includes(parsed.agentThinkingStyle) ? parsed.agentThinkingStyle : DEFAULT_THINKING_STYLE
    const agentShowQueryCards = parsed.agentShowQueryCards !== false
    const agentWebAccess = parsed.agentWebAccess === true
    const tableTextAlign = TABLE_ALIGN_IDS.includes(parsed.tableTextAlign) ? parsed.tableTextAlign : DEFAULT_TABLE_ALIGN
    _settingsCache = { theme, zoom, font, iconStyle, iconSet, tableStyle, mcpAutoStart, launchAtLogin, autoReconnectOnStartup, previewDmlBeforeApply, defaultDataView, paginationMode, maxQueryHistory, connectTimeoutMs, socketTimeoutMs, maxAllowedPacket, sessionTimezone, vimMode, cmdkAiEnabled, liveModeEnabled, nullSortOrder, agentChatFontSize, agentCodeFontSize, agentThinkingStyle, agentShowQueryCards, agentWebAccess, tableTextAlign, telemetry, jsonWordWrap, nativeScroll, rowSpacing, zebraRows, autoSaveQueries, sqlFormat }
    return { ..._settingsCache }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** @param {AppSettings} settings */
export function saveSettings(settings) {
  // Keep the in-memory cache authoritative even if the localStorage write throws
  // (quota/private-mode) - the running app should still reflect the new settings.
  _settingsCache = { ...settings }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (err) {
    console.error('Failed to persist settings:', err)
  }
}

// ── Change-aware appliers ─────────────────────────────────────────────────────
// applySettings runs on EVERY updateSettings call (any toggle in the Settings
// dialog). Unconditional root style/attribute writes fire the canvas table's
// MutationObserver (colour-reader rebuild + font re-measure + full repaint) and
// unconditional store.set() re-notifies every subscriber (Monaco updateOptions
// on all editors) - that was the Settings-page lag. Guard every write so only
// values that actually changed touch the DOM or notify subscribers.
/** @param {HTMLElement} el @param {string} prop @param {string} value */
function setStyleVar(el, prop, value) {
  if (el.style.getPropertyValue(prop) !== value) el.style.setProperty(prop, value)
}
/** @param {HTMLElement} el @param {string} name @param {string} value */
function setAttr(el, name, value) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}
/** @param {import('svelte/store').Writable<any>} store @param {any} value */
function setStore(store, value) {
  if (get(store) !== value) store.set(value)
}

let _lastAppliedZoom = /** @type {number | null} */ (null)

/** @param {AppSettings} settings */
export function applySettings(settings) {
  const root = document.documentElement
  const theme = normalizeThemeId(settings.theme)
  const zoom = settings.zoom
  const dark = isDarkTheme(theme)

  setAttr(root, 'data-theme', theme)
  if (root.classList.contains('dark') !== dark) root.classList.toggle('dark', dark)
  setMode(dark ? 'dark' : 'light')
  setStore(appThemeId, theme)
  setStore(isCurrentThemeDark, dark)
  // Linux/WebKitGTK at 1x DPI: 14px strokes are too thin for reliable readability.
  // Bump the base from 14 → 15px so the zoom ladder scales from a legible root.
  // The canvas table reads --app-font-size, so it scales with zoom automatically.
  const basePx = root.dataset.os === 'linux' ? 15 : 14
  setStyleVar(root, '--app-zoom', String(zoom))
  setStyleVar(root, '--app-font-size', `${Math.round(basePx * zoom)}px`)

  // Monaco editors read --editor-font-size / --editor-line-height directly (Monaco
  // takes pixel values, not CSS units, so it can't inherit --app-font-size). Scale
  // them off the same base + zoom so the editor grows in lockstep with the UI.
  // The appZoom subscription in monaco-env.js pushes these to live editor instances.
  setStyleVar(root, '--editor-font-size', `${Math.round(basePx * zoom)}px`)
  setStyleVar(root, '--editor-line-height', `${Math.round(basePx * 1.5 * zoom)}px`)
  setStore(appZoom, zoom)

  // Font family - overrides the stylesheet :root defaults inline (inline style
  // wins), so the whole UI + canvas grid pick it up. The canvas re-measures its
  // font metrics via the documentElement style MutationObserver.
  const font = normalizeFont(settings.font)
  setStyleVar(root, '--font-sans', FONT_PRESETS[font].sans)
  setStyleVar(root, '--font-mono', FONT_PRESETS[font].mono)
  setStore(appFont, font)

  // AI/agent chat typography - consumed by the chat surfaces (AiMarkdown, code blocks).
  const chatFont = AGENT_FONT_SIZES.includes(settings.agentChatFontSize) ? settings.agentChatFontSize : DEFAULT_AGENT_CHAT_FONT
  const codeFont = AGENT_FONT_SIZES.includes(settings.agentCodeFontSize) ? settings.agentCodeFontSize : DEFAULT_AGENT_CODE_FONT
  setStyleVar(root, '--ai-chat-font-size', `${chatFont}px`)
  setStyleVar(root, '--ai-code-font-size', `${codeFont}px`)
  const thinkStyle = THINKING_STYLE_IDS.includes(settings.agentThinkingStyle) ? settings.agentThinkingStyle : DEFAULT_THINKING_STYLE
  if (root.getAttribute('data-thinking-style') !== thinkStyle) root.setAttribute('data-thinking-style', thinkStyle)

  // Icon weight - a single [data-icon-style] attribute drives the global Lucide
  // stroke-width rule in app.css. No per-icon or per-component changes needed.
  const iconStyle = normalizeIconStyle(settings.iconStyle)
  setAttr(root, 'data-icon-style', iconStyle)
  setStore(appIconStyle, iconStyle)

  // Icon family - the shared <Icon> wrapper subscribes to appIconSet and swaps
  // between icon families. data-icon-set is exposed for any CSS hooks.
  const iconSet = normalizeIconSet(settings.iconSet)
  setAttr(root, 'data-icon-set', iconSet)
  setStore(appIconSet, iconSet)

  // Grid-write DML preview toggle - DataTable subscribes to gate its confirm dialog.
  setStore(appPreviewDml, settings.previewDmlBeforeApply !== false)
  setStore(appVimMode, settings.vimMode === true)
  setStore(appCmdkAi, settings.cmdkAiEnabled === true)
  setStore(appJsonWordWrap, settings.jsonWordWrap === true)
  setStore(appNativeScroll, settings.nativeScroll === true)
  setStore(appRowSpacing, normalizeRowSpacing(settings.rowSpacing))
  // Push formatter prefs into the shared option holder that format-sql.js reads.
  setSqlFormatOptions(settings.sqlFormat)
  setStore(appZebraRows, settings.zebraRows === true)
  setStore(appAutoSaveQueries, settings.autoSaveQueries === true)
  setStore(appLiveMode, settings.liveModeEnabled === true)
  setStore(appAgentQueryCards, settings.agentShowQueryCards !== false)
  setStore(appAgentWebAccess, settings.agentWebAccess === true)
  setStore(appTableAlign, TABLE_ALIGN_IDS.includes(settings.tableTextAlign) ? settings.tableTextAlign : DEFAULT_TABLE_ALIGN)
  setStore(appPaginationMode, PAGINATION_MODE_IDS.includes(settings.paginationMode) ? settings.paginationMode : DEFAULT_PAGINATION_MODE)

  // Canvas table grid style - data attribute for any CSS hooks; DataTable reads
  // the store and repaints the virtualized grid pass.
  const tableStyle = normalizeTableStyle(settings.tableStyle)
  setAttr(root, 'data-table-style', tableStyle)
  setStore(appTableStyle, tableStyle)

  // Keep the canvas-table zoom in lockstep with the app zoom so Cmd +/-/0 (and
  // the zoom buttons) scale the grid alongside the rest of the UI. The canvas
  // renderer reads zoomState directly and repaints on change.
  // Drop the legacy per-table key - it drifted from settings.zoom and made only
  // the grid look huge/blurry while the sidebar stayed at normal scale.
  try { localStorage.removeItem('stroke:canvas-zoom') } catch {}
  const canvasZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom))
  if (zoomState.value !== canvasZoom) zoomState.value = canvasZoom
  // Webview page-zoom reset is an IPC round-trip - only needed when zoom changed
  // (or on the first apply, to undo any stale native zoom from a prior session).
  if (_lastAppliedZoom !== zoom) {
    _lastAppliedZoom = zoom
    resetWebviewZoom()
  }
}

/** Snap native webview page-zoom back to 1 (macOS pinch / Tauri polyfill leak). */
export function resetWebviewZoom() {
  void import('@tauri-apps/api/webview')
    .then(({ getCurrentWebview }) => getCurrentWebview().setZoom(1))
    .catch(() => {})
}

let zoomListenerInstalled = false

/** @param {KeyboardEvent} e */
function handleZoomKeydown(e) {
  if (!e.ctrlKey && !e.metaKey) return
  if (e.altKey) return

  const { key, code } = e

  if (key === '0' || code === 'Digit0' || code === 'Numpad0') {
    e.preventDefault()
    e.stopPropagation()
    resetZoom()
    return
  }

  if (
    key === '=' ||
    key === '+' ||
    code === 'Equal' ||
    code === 'NumpadAdd' ||
    (e.shiftKey && code === 'Equal')
  ) {
    e.preventDefault()
    e.stopPropagation()
    increaseZoom()
    return
  }

  if (key === '-' || key === '_' || code === 'Minus' || code === 'NumpadSubtract') {
    e.preventDefault()
    e.stopPropagation()
    decreaseZoom()
    return
  }

}

/**
 * Block every Ctrl/Cmd + scroll zoom path. Zoom is keyboard-only (Cmd +/-/0).
 * macOS trackpad pinch arrives as ctrl+wheel near column resize handles and
 * page-zooms the webview (devicePixelRatio drift → canvas looks huge/blurry
 * while the sidebar, scaled via --app-font-size, stays normal).
 * @param {Event} e
 */
function blockNativeScrollZoom(e) {
  const we = /** @type {WheelEvent} */ (e)
  if (!(we.ctrlKey || we.metaKey)) return
  // Let mermaid diagrams handle their own Ctrl+scroll zoom.
  if (/** @type {Element} */ (e.target)?.closest?.('.mermaid-canvas')) return
  e.preventDefault()
  e.stopImmediatePropagation()
  resetWebviewZoom()
}

/**
 * Block macOS WebKit (WKWebView) native trackpad pinch-magnification.
 * @param {Event} e
 */
function handleZoomGesture(e) {
  if (/** @type {Element} */ (e.target)?.closest?.('.mermaid-canvas')) return
  e.preventDefault()
  e.stopImmediatePropagation()
  resetWebviewZoom()
}

export function installZoomShortcuts() {
  if (zoomListenerInstalled || typeof window === 'undefined') return
  zoomListenerInstalled = true
  window.addEventListener('keydown', handleZoomKeydown, true)
  window.addEventListener('wheel', blockNativeScrollZoom, { capture: true, passive: false })
  // Legacy event - Tauri's zoom polyfill listens on this, not `wheel`.
  window.addEventListener('mousewheel', blockNativeScrollZoom, { capture: true, passive: false })
  // WebKit-only pinch magnification (macOS). No-op on Chromium.
  window.addEventListener('gesturestart', handleZoomGesture, { capture: true, passive: false })
  window.addEventListener('gesturechange', handleZoomGesture, { capture: true, passive: false })
  window.addEventListener('gestureend', handleZoomGesture, { capture: true, passive: false })
}

/** @param {Partial<AppSettings>} patch */
export function updateSettings(patch) {
  const current = loadSettings()
  const next = { ...current, ...patch }

  if (!restoringTheme && patch.theme != null && patch.theme !== current.theme) {
    recordThemeBeforeChange(current.theme)
    saveLastForMode(patch.theme)
  }

  saveSettings(next)
  applySettings(next)
  return next
}

export function increaseZoom() {
  const current = loadSettings()
  const idx = ZOOM_STEPS.indexOf(current.zoom)
  if (idx < ZOOM_STEPS.length - 1) {
    return updateSettings({ zoom: ZOOM_STEPS[idx + 1] })
  }
  return current
}

export function decreaseZoom() {
  const current = loadSettings()
  const idx = ZOOM_STEPS.indexOf(current.zoom)
  if (idx > 0) {
    return updateSettings({ zoom: ZOOM_STEPS[idx - 1] })
  }
  return current
}

export function resetZoom() {
  return updateSettings({ zoom: DEFAULT_ZOOM })
}

/** Cycle only through themes of the same darkness as the current theme. */
export function cycleTheme() {
  const current = loadSettings()
  const dark = isDarkTheme(current.theme)
  const sameMode = THEME_IDS.filter(id => isDarkTheme(id) === dark)
  const idx = sameMode.indexOf(current.theme)
  const next = sameMode[(idx + 1) % sameMode.length]
  return updateSettings({ theme: next })
}

/** Toggle between the user's last-used dark theme and last-used light theme. */
export function toggleLightDark() {
  const current = loadSettings()
  // Record the theme being *left* before reading the other mode's memory.
  // `updateSettings` only ever records the theme being set, so a theme that was
  // chosen in an earlier session — or before this per-mode memory existed, or on
  // a first launch where the default came from the OS appearance — was never
  // written down. Toggling away from it then fell back to plain Dark/Light
  // Studio and the choice was lost on the way back. Recording here makes the
  // round-trip lossless: whatever you are looking at is what you return to.
  saveLastForMode(current.theme)
  const { dark, light } = loadLastForMode()
  const target = isDarkTheme(current.theme) ? light : dark
  return updateSettings({ theme: target })
}

/** Whether the current active theme is dark (reactive). */
export const isCurrentThemeDark = writable(isDarkTheme(DEFAULT_THEME_ID))

/** Revert to the theme used before the most recent change (⌘/Ctrl+Shift+M). */
export function restorePreviousTheme() {
  const current = loadSettings()
  const prev = themeHistoryStack.pop()
  if (!prev || prev === current.theme) return current

  restoringTheme = true
  try {
    return updateSettings({ theme: prev })
  } finally {
    restoringTheme = false
  }
}

export function canIncreaseZoom(zoom) {
  return ZOOM_STEPS.indexOf(zoom) < ZOOM_STEPS.length - 1
}

export function canDecreaseZoom(zoom) {
  return ZOOM_STEPS.indexOf(zoom) > 0
}
