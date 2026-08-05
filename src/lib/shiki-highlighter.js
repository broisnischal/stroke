/** @typedef {import('$lib/themes/registry.js').ThemeId} ThemeId */

import { bundledLanguages, createHighlighter } from 'shiki'
import { DEFAULT_THEME_ID, shikiThemeId } from '$lib/themes/registry.js'

/** Bundled Shiki themes - aligned with app.css (vitesse-light / vitesse-dark). */
const THEME_IDS = ['vitesse-light', 'vitesse-dark']

// Only the grammars we actually hit on nearly every render are preloaded. Each
// TextMate grammar is a large JSON blob that has to be fetched and parsed on the
// main thread, so loading the full set up front cost ~75ms before the first code
// block could paint; with just these two it is ~1ms. Everything else is fetched
// on demand by `ensureLang` the first time a block in that language shows up.
const PRELOAD_LANG_IDS = ['sql', 'plaintext']

let highlighterPromise = null

/** In-flight/completed on-demand grammar loads, so N blocks share one fetch. */
const langLoads = new Map()

function loadHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: THEME_IDS,
      langs: PRELOAD_LANG_IDS.map((id) => bundledLanguages[id]).filter(Boolean),
    })
  }
  return highlighterPromise
}

/**
 * Make sure `lang`'s grammar is loaded before highlighting with it.
 * @param {Awaited<ReturnType<typeof createHighlighter>>} highlighter
 * @param {string} lang
 */
async function ensureLang(highlighter, lang) {
  if (highlighter.getLoadedLanguages().includes(lang)) return
  const input = bundledLanguages[lang]
  if (!input) return
  let pending = langLoads.get(lang)
  if (!pending) {
    // Swallow failures - `highlightCode` falls back to plaintext.
    pending = highlighter.loadLanguage(input).catch(() => {})
    langLoads.set(lang, pending)
  }
  await pending
}

/** @param {string} [lang] */
export function resolveShikiLang(lang) {
  const id = String(lang ?? '')
    .toLowerCase()
    .trim()
  const aliases = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    sh: 'bash',
    shell: 'bash',
    yml: 'yaml',
    postgres: 'sql',
    postgresql: 'sql',
    psql: 'sql',
  }
  const normalized = aliases[id] ?? id
  if (normalized in bundledLanguages) return normalized
  return 'plaintext'
}

/**
 * @param {string} code
 * @param {string} [lang]
 * @param {ThemeId} [theme]
 */
export async function highlightCode(code, lang, theme = DEFAULT_THEME_ID) {
  const highlighter = await loadHighlighter()
  const resolved = resolveShikiLang(lang)
  const shikiTheme = shikiThemeId(theme)
  await ensureLang(highlighter, resolved)
  try {
    return highlighter.codeToHtml(code, {
      lang: resolved,
      theme: shikiTheme,
    })
  } catch {
    return highlighter.codeToHtml(code, {
      lang: 'plaintext',
      theme: shikiTheme,
    })
  }
}
