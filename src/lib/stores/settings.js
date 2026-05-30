import { writable } from 'svelte/store'
import { setMode } from 'mode-watcher'
import {
  DEFAULT_THEME_ID,
  isDarkTheme,
  THEME_IDS,
  normalizeThemeId,
} from '$lib/themes/registry.js'

const STORAGE_KEY = 'db-studio:settings'

/** @typedef {import('$lib/themes/registry.js').ThemeId} ThemeId */
/** @typedef {{ theme: ThemeId, zoom: number, mcpAutoStart: boolean }} AppSettings */

/** UI zoom scale (font + layout). 1 = 100%. */
export const ZOOM_STEPS = [0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.25, 1.5]
const DEFAULT_ZOOM = 1

/** @type {AppSettings} */
export const DEFAULT_SETTINGS = {
  theme: DEFAULT_THEME_ID,
  zoom: DEFAULT_ZOOM,
  mcpAutoStart: false,
}

/** Reactive app theme id (synced by applySettings). */
export const appThemeId = writable(/** @type {ThemeId} */ (DEFAULT_THEME_ID))

const LAST_DARK_KEY  = 'db-studio:last-dark-theme'
const LAST_LIGHT_KEY = 'db-studio:last-light-theme'

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
      // First launch — follow the OS theme, don't save so we keep tracking it
      const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
      const prefersDark = mq ? mq.matches : true
      return { ...DEFAULT_SETTINGS, theme: normalizeThemeId(prefersDark ? 'dark' : 'light') }
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
    return { theme, zoom, mcpAutoStart }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** @param {AppSettings} settings */
export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
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
  root.style.setProperty('--app-zoom', String(zoom))
  root.style.setProperty('--app-font-size', `${Math.round(14 * zoom)}px`)
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

/** Block Tauri webview zoom (Ctrl/Cmd + wheel) when hotkeys are enabled in the shell. */
function handleZoomWheel(e) {
  if (e.ctrlKey || e.metaKey) {
    // Let mermaid diagrams handle their own Ctrl+scroll zoom
    if (/** @type {Element} */ (e.target)?.closest?.('.mermaid-canvas')) return
    e.preventDefault()
    e.stopPropagation()
  }
}

/** Register Ctrl/Cmd +/-/0 zoom shortcuts (capture phase, works in inputs). */
export function installZoomShortcuts() {
  if (zoomListenerInstalled || typeof window === 'undefined') return
  zoomListenerInstalled = true
  window.addEventListener('keydown', handleZoomKeydown, true)
  window.addEventListener('wheel', handleZoomWheel, { capture: true, passive: false })
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
