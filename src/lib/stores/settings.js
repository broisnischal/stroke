import { writable, get } from 'svelte/store'
import { setMode } from 'mode-watcher'
import {
  DEFAULT_THEME_ID,
  isDarkTheme,
  THEME_IDS,
  normalizeThemeId,
} from '$lib/themes/registry.js'
import { zoomState, ZOOM_MIN, ZOOM_MAX } from '$lib/stores/canvas-zoom.svelte.js'

const STORAGE_KEY = 'stroke:settings'

/** @typedef {import('$lib/themes/registry.js').ThemeId} ThemeId */
/** @typedef {'geist' | 'serif' | 'apple' | 'inter' | 'mono'} FontId */
/** @typedef {'regular' | 'light' | 'bold'} IconStyleId */
/** @typedef {'lucide' | 'hugeicons' | 'phosphor'} IconSetId */
/** @typedef {{ theme: ThemeId, zoom: number, font: FontId, iconStyle: IconStyleId, iconSet: IconSetId, tableStyle: TableStyleId, mcpAutoStart: boolean, launchAtLogin: boolean, autoReconnectOnStartup: boolean, previewDmlBeforeApply: boolean, defaultDataView: string, paginationMode: string, maxQueryHistory: number, connectTimeoutMs: number, socketTimeoutMs: number, maxAllowedPacket: number, sessionTimezone: string }} AppSettings */

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
  // these presets render identically on every platform — no system fallback.
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
}
/** @type {FontId} */
export const DEFAULT_FONT = 'geist'
/** @returns {FontId} */
function normalizeFont(/** @type {unknown} */ id) {
  return FONT_PRESETS[/** @type {FontId} */ (id)] ? /** @type {FontId} */ (id) : DEFAULT_FONT
}

/**
 * Selectable icon weights. Applied globally as the `stroke-width` of every Lucide
 * icon via a `[data-icon-style]` rule in app.css — no per-component changes. Bold
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
 * per-row grid pass draws separators — it's applied in DataTable's virtualized
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
/** @returns {TableStyleId} */
export function normalizeTableStyle(/** @type {unknown} */ id) {
  return TABLE_STYLES[/** @type {TableStyleId} */ (id)] ? /** @type {TableStyleId} */ (id) : DEFAULT_TABLE_STYLE
}

// ── Query & connection defaults ──────────────────────────────────────────────
// Numeric/text knobs surfaced under Settings → Database. `maxQueryHistory` is
// consumed by the query-history store; the connector values (packet/timeouts/
// timezone) are persisted as MySQL connection defaults.
/** Data-view modes for a table tab (kept in sync with TableToolbar's DATA_VIEW_MODES). */
export const DATA_VIEW_IDS = /** @type {const} */ (['table', 'json', 'record', 'text', 'chart'])
export const DEFAULT_DATA_VIEW = 'table'

// How the grid pages through rows.
//  • offset   — LIMIT/OFFSET; random access (jump to any page) but O(offset) deep.
//  • cursor   — keyset by primary key (opaque cursor); O(1) next/prev, no page jump.
//  • keyset   — same engine as cursor (keyset on the PK); listed separately for clarity.
//  • temporal — keyset on a timestamp column (newest-first); great for logs/events.
// All non-offset modes fall back to offset when their preconditions aren't met
// (no single-column PK, a multi-column sort, or a jump to an arbitrary page).
export const PAGINATION_MODE_IDS = /** @type {const} */ (['offset', 'cursor', 'keyset', 'temporal'])
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

/** @returns {AppSettings} */
export function loadSettings() {
  if (_settingsCache) return { ..._settingsCache }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      _settingsCache = { ...DEFAULT_SETTINGS }
      return { ...DEFAULT_SETTINGS }
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
    _settingsCache = { theme, zoom, font, iconStyle, iconSet, tableStyle, mcpAutoStart, launchAtLogin, autoReconnectOnStartup, previewDmlBeforeApply, defaultDataView, paginationMode, maxQueryHistory, connectTimeoutMs, socketTimeoutMs, maxAllowedPacket, sessionTimezone }
    return { ..._settingsCache }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** @param {AppSettings} settings */
export function saveSettings(settings) {
  // Keep the in-memory cache authoritative even if the localStorage write throws
  // (quota/private-mode) — the running app should still reflect the new settings.
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
// on all editors) — that was the Settings-page lag. Guard every write so only
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

  // Font family — overrides the stylesheet :root defaults inline (inline style
  // wins), so the whole UI + canvas grid pick it up. The canvas re-measures its
  // font metrics via the documentElement style MutationObserver.
  const font = normalizeFont(settings.font)
  setStyleVar(root, '--font-sans', FONT_PRESETS[font].sans)
  setStyleVar(root, '--font-mono', FONT_PRESETS[font].mono)
  setStore(appFont, font)

  // Icon weight — a single [data-icon-style] attribute drives the global Lucide
  // stroke-width rule in app.css. No per-icon or per-component changes needed.
  const iconStyle = normalizeIconStyle(settings.iconStyle)
  setAttr(root, 'data-icon-style', iconStyle)
  setStore(appIconStyle, iconStyle)

  // Icon family — the shared <Icon> wrapper subscribes to appIconSet and swaps
  // between icon families. data-icon-set is exposed for any CSS hooks.
  const iconSet = normalizeIconSet(settings.iconSet)
  setAttr(root, 'data-icon-set', iconSet)
  setStore(appIconSet, iconSet)

  // Grid-write DML preview toggle — DataTable subscribes to gate its confirm dialog.
  setStore(appPreviewDml, settings.previewDmlBeforeApply !== false)
  setStore(appPaginationMode, PAGINATION_MODE_IDS.includes(settings.paginationMode) ? settings.paginationMode : DEFAULT_PAGINATION_MODE)

  // Canvas table grid style — data attribute for any CSS hooks; DataTable reads
  // the store and repaints the virtualized grid pass.
  const tableStyle = normalizeTableStyle(settings.tableStyle)
  setAttr(root, 'data-table-style', tableStyle)
  setStore(appTableStyle, tableStyle)

  // Keep the canvas-table zoom in lockstep with the app zoom so Cmd +/-/0 (and
  // the zoom buttons) scale the grid alongside the rest of the UI. The canvas
  // renderer reads zoomState directly and repaints on change.
  // Drop the legacy per-table key — it drifted from settings.zoom and made only
  // the grid look huge/blurry while the sidebar stayed at normal scale.
  try { localStorage.removeItem('stroke:canvas-zoom') } catch {}
  const canvasZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom))
  if (zoomState.value !== canvasZoom) zoomState.value = canvasZoom
  // Webview page-zoom reset is an IPC round-trip — only needed when zoom changed
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
  // Legacy event — Tauri's zoom polyfill listens on this, not `wheel`.
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
