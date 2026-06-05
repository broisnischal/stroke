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

/** Read editor font metrics from CSS (falls back to 16 / 26). */
export function readEditorFontOptions() {
  if (typeof document === 'undefined') {
    return { fontSize: 16, lineHeight: 26 }
  }
  const root = document.documentElement
  const size = parseFloat(getComputedStyle(root).getPropertyValue('--editor-font-size'))
  const line = parseFloat(getComputedStyle(root).getPropertyValue('--editor-line-height'))
  return {
    fontSize: Number.isFinite(size) && size >= 12 ? size : 16,
    lineHeight: Number.isFinite(line) && line >= 16 ? line : 26,
  }
}
