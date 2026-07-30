import * as monaco from 'monaco-editor'
import { MONACO_THEME_SPECS, monacoThemeDefinition } from '$lib/themes/monaco-presets.js'
import { monacoThemeName, THEME_IDS, getThemeDefinition } from '$lib/themes/registry.js'

let defined = false

/** Register one Monaco theme per app theme id. */
export function defineStrokeMonacoThemes() {
  if (defined) return
  defined = true

  for (const id of THEME_IDS) {
    if (!MONACO_THEME_SPECS[id]) continue
    monaco.editor.defineTheme(monacoThemeName(id), monacoThemeDefinition(id))
  }
}

/**
 * Return the Monaco theme name for the given app theme.
 * Falls back to 'dark' or 'light' if the theme has no custom Monaco spec.
 * @param {import('$lib/themes/registry.js').ThemeId} themeId
 */
export function monacoThemeId(themeId) {
  if (MONACO_THEME_SPECS[themeId]) return monacoThemeName(themeId)
  const def = getThemeDefinition(themeId)
  return monacoThemeName(def?.isDark ? 'dark' : 'light')
}

/**
 * Resolve any CSS colour string to `#rrggbb`, which is all Monaco accepts.
 *
 * Goes through a canvas rather than parsing: the theme tokens are authored in
 * `oklch()` and the browser is the only thing that converts those correctly.
 * @param {string} css
 * @returns {string | null}
 */
function cssColorToHex(css) {
  const value = String(css ?? '').trim()
  if (!value) return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#000'
    ctx.fillStyle = value
    // An unparseable value leaves fillStyle at the previous colour, so a miss
    // reads as black rather than throwing — check before trusting it.
    if (ctx.fillStyle === '#000000' && !/^(#0{3,8}|black)$/i.test(value)) return null
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

/**
 * Point Monaco's editor surface at the app's *live* background/foreground, then
 * activate the theme.
 *
 * The presets carry hand-written hexes that drifted from the CSS tokens: the dark
 * Studio theme paints `oklch(0.132 0 0)` (#080808) while its preset said #1c1c1c,
 * so every editor — the JSON view most visibly, since it fills the pane — sat a
 * shade lighter than the app around it. CSS is the source of truth for theming
 * (DESIGN_SYSTEM §1), so read it instead of duplicating it, and every theme stays
 * matched with no per-preset upkeep.
 *
 * @param {import('$lib/themes/registry.js').ThemeId} themeId
 */
export function applyMonacoTheme(themeId) {
  defineStrokeMonacoThemes()
  const name = monacoThemeId(themeId)
  const specId = MONACO_THEME_SPECS[themeId] ? themeId : (getThemeDefinition(themeId)?.isDark ? 'dark' : 'light')
  const spec = MONACO_THEME_SPECS[specId]
  if (spec) {
    try {
      const css = getComputedStyle(document.documentElement)
      const bg = cssColorToHex(css.getPropertyValue('--background'))
      const fg = cssColorToHex(css.getPropertyValue('--foreground'))
      if (bg || fg) {
        const base = monacoThemeDefinition(specId)
        monaco.editor.defineTheme(name, {
          ...base,
          colors: {
            ...base.colors,
            ...(bg ? { 'editor.background': bg, 'editorGutter.background': bg } : {}),
            ...(fg ? { 'editor.foreground': fg } : {}),
          },
        })
      }
    } catch { /* fall through to the preset as authored */ }
  }
  monaco.editor.setTheme(name)
}

/** Read editor font metrics from CSS (falls back to 13 / 22). */
export function readEditorFontOptions() {
  if (typeof document === 'undefined') {
    return { fontSize: 13, lineHeight: 22 }
  }
  const root = document.documentElement
  const size = parseFloat(getComputedStyle(root).getPropertyValue('--editor-font-size'))
  const line = parseFloat(getComputedStyle(root).getPropertyValue('--editor-line-height'))
  return {
    fontSize: Number.isFinite(size) && size >= 10 ? size : 13,
    lineHeight: Number.isFinite(line) && line >= 14 ? line : 22,
  }
}
