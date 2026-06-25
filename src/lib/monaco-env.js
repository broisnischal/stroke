import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { appFont, appZoom } from '$lib/stores/settings.js'
import { readEditorFontOptions } from '$lib/monaco-themes.js'

const MONO_FALLBACK = '"Geist Mono Variable", ui-monospace, monospace'

/** The app's active monospace stack (the `--font-mono` the font setting drives). */
export function monacoFontFamily() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim()
    return v || MONO_FALLBACK
  } catch {
    return MONO_FALLBACK
  }
}

/**
 * Dedicated code font for Monaco editors (`--editor-font-family`), independent
 * of the data-grid/UI mono so the editor keeps its VS Code-style typeface
 * regardless of the app font preset. Falls back to the app mono, then system.
 */
export function editorFontFamily() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--editor-font-family').trim()
    return v || monacoFontFamily()
  } catch {
    return MONO_FALLBACK
  }
}

// Workers spawn lazily, only when a model of the matching language is created.
// This app only ever creates json (viewer/cells), javascript|typescript (ORM),
// and sql/postgresql (tokenizer-only — no worker) models, so css/html/scss/less
// workers are never instantiated; any stray label falls back to editorWorker.
let configured = false

/** Configure Monaco web workers once (Vite `?worker` imports). */
export function configureMonacoWorkers() {
  if (configured || typeof globalThis === 'undefined') return
  configured = true

  globalThis.MonacoEnvironment = {
    getWorker(_, label) {
      if (label === 'json') return new jsonWorker()
      if (label === 'typescript' || label === 'javascript' || label === 'typescriptreact') {
        return new tsWorker()
      }
      return new editorWorker()
    },
  }

  // Keep every live editor on the dedicated code font. The subscription fires on
  // app font-preset changes; we re-assert the editor font (not `--font-mono`) so a
  // preset switch never clobbers the editor's VS Code-style typeface. Covers all
  // current + future editor instances via monaco.editor.getEditors().
  appFont.subscribe(() => {
    const ff = editorFontFamily()
    try {
      for (const ed of monaco.editor.getEditors?.() ?? []) ed.updateOptions({ fontFamily: ff })
    } catch { /* getEditors unavailable — editors pick up the font on next create */ }
  })

  // Rescale every live editor when the app zoom changes. Monaco can't inherit the
  // CSS-driven --app-font-size (it needs pixel values), so applySettings writes the
  // zoom-scaled --editor-font-size / --editor-line-height and we push them here.
  appZoom.subscribe(() => {
    const { fontSize, lineHeight } = readEditorFontOptions()
    try {
      for (const ed of monaco.editor.getEditors?.() ?? []) ed.updateOptions({ fontSize, lineHeight })
    } catch { /* getEditors unavailable — editors pick up the size on next create */ }
  })

  // Disable external schema fetching — network requests fail in Tauri desktop env.
  // Still validates JSON syntax; just no $schema-driven remote schema downloads.
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    enableSchemaRequest: false,
    schemas: [],
  })
}
