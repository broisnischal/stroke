import { writable } from 'svelte/store'
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
/** @typedef {'geist' | 'serif' | 'apple'} FontId */
/** @typedef {'regular' | 'light' | 'bold'} IconStyleId */
/** @typedef {{ theme: ThemeId, zoom: number, font: FontId, iconStyle: IconStyleId, mcpAutoStart: boolean, launchAtLogin: boolean, autoReconnectOnStartup: boolean, previewDmlBeforeApply: boolean }} AppSettings */

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

/** @type {AppSettings} */
export const DEFAULT_SETTINGS = {
  theme: DEFAULT_THEME_ID,
  zoom: DEFAULT_ZOOM,
  font: DEFAULT_FONT,
  iconStyle: DEFAULT_ICON_STYLE,
  mcpAutoStart: false,
  launchAtLogin: false,
  autoReconnectOnStartup: true,
  previewDmlBeforeApply: true,
}

/** Reactive app font id (synced by applySettings). */
export const appFont = writable(/** @type {FontId} */ (DEFAULT_FONT))

/** Reactive app icon style (synced by applySettings). */
export const appIconStyle = writable(/** @type {IconStyleId} */ (DEFAULT_ICON_STYLE))

/** Reactive app zoom scale (synced by applySettings). Monaco editors subscribe
 *  to this to rescale their font/line-height in lockstep with the rest of the UI. */
export const appZoom = writable(DEFAULT_ZOOM)

/** Reactive app theme id (synced by applySettings). */
export const appThemeId = writable(/** @type {ThemeId} */ (DEFAULT_THEME_ID))

/** Reactive: show a SQL preview/confirm before applying grid writes (synced by applySettings). */
export const appPreviewDml = writable(true)

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

/** @returns {AppSettings} */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
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
    return { theme, zoom, font, iconStyle, mcpAutoStart, launchAtLogin, autoReconnectOnStartup, previewDmlBeforeApply }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** @param {AppSettings} settings */
export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (err) {
    console.error('Failed to persist settings:', err)
  }
}

/** @param {AppSettings} settings */
export function applySettings(settings) {
  const root = document.documentElement
  const theme = normalizeThemeId(settings.theme)
  const zoom = settings.zoom
  const dark = isDarkTheme(theme)

  root.setAttribute('data-theme', theme)
  root.classList.toggle('dark', dark)
  setMode(dark ? 'dark' : 'light')
  appThemeId.set(theme)
  isCurrentThemeDark.set(dark)
  // Linux/WebKitGTK at 1x DPI: 14px strokes are too thin for reliable readability.
  // Bump the base from 14 → 15px so the zoom ladder scales from a legible root.
  // The canvas table reads --app-font-size, so it scales with zoom automatically.
  const basePx = root.dataset.os === 'linux' ? 15 : 14
  root.style.setProperty('--app-zoom', String(zoom))
  root.style.setProperty('--app-font-size', `${Math.round(basePx * zoom)}px`)

  // Monaco editors read --editor-font-size / --editor-line-height directly (Monaco
  // takes pixel values, not CSS units, so it can't inherit --app-font-size). Scale
  // them off the same base + zoom so the editor grows in lockstep with the UI.
  // The appZoom subscription in monaco-env.js pushes these to live editor instances.
  root.style.setProperty('--editor-font-size', `${Math.round(basePx * zoom)}px`)
  root.style.setProperty('--editor-line-height', `${Math.round(basePx * 1.5 * zoom)}px`)
  appZoom.set(zoom)

  // Font family — overrides the stylesheet :root defaults inline (inline style
  // wins), so the whole UI + canvas grid pick it up. The canvas re-measures its
  // font metrics via the documentElement style MutationObserver.
  const font = normalizeFont(settings.font)
  root.style.setProperty('--font-sans', FONT_PRESETS[font].sans)
  root.style.setProperty('--font-mono', FONT_PRESETS[font].mono)
  appFont.set(font)

  // Icon weight — a single [data-icon-style] attribute drives the global Lucide
  // stroke-width rule in app.css. No per-icon or per-component changes needed.
  const iconStyle = normalizeIconStyle(settings.iconStyle)
  root.setAttribute('data-icon-style', iconStyle)
  appIconStyle.set(iconStyle)

  // Grid-write DML preview toggle — DataTable subscribes to gate its confirm dialog.
  appPreviewDml.set(settings.previewDmlBeforeApply !== false)

  // Keep the canvas-table zoom in lockstep with the app zoom so Cmd +/-/0 (and
  // the zoom buttons) scale the grid alongside the rest of the UI. The canvas
  // renderer reads zoomState directly and repaints on change.
  // Drop the legacy per-table key — it drifted from settings.zoom and made only
  // the grid look huge/blurry while the sidebar stayed at normal scale.
  try { localStorage.removeItem('stroke:canvas-zoom') } catch {}
  const canvasZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom))
  if (zoomState.value !== canvasZoom) zoomState.value = canvasZoom
  resetWebviewZoom()
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
