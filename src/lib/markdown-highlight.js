/** @typedef {import('$lib/themes/registry.js').ThemeId} ThemeId */

// Imported lazily, not statically: this module is reached from AiMarkdown, which
// CommandPalette pulls into the boot chunk. A static import would drag Shiki (and
// the grammar/theme graph behind it) into app startup even for users who never
// render a markdown code block. `highlightMarkdownHtml` is already async, so the
// extra await costs nothing at the call site; the module promise dedups.
/** @type {Promise<typeof import('$lib/shiki-highlighter.js')> | null} */
let shikiModule = null
function loadShiki() {
  if (!shikiModule) shikiModule = import('$lib/shiki-highlighter.js')
  return shikiModule
}

/** @param {string} className */
function langFromCodeClass(className) {
  const match = className.match(/language-([\w-]+)/i)
  return match?.[1] ?? ''
}

/**
 * Highlight fenced code blocks inside HTML produced by marked.
 * @param {string} html
 * @param {ThemeId} [theme]
 */
export async function highlightMarkdownHtml(html, theme = 'dark') {
  if (typeof document === 'undefined') return html

  const doc = new DOMParser().parseFromString(`<div id="md-root">${html}</div>`, 'text/html')
  const root = doc.getElementById('md-root')
  if (!root) return html

  const pres = [...root.querySelectorAll('pre')]
  // Nothing to highlight → never pay for the Shiki chunk at all. Still returns
  // the parsed markup, not the input, so the output stays byte-identical to what
  // the highlighting path produces for the same input.
  if (pres.length === 0) return root.innerHTML
  const { highlightCode, resolveShikiLang } = await loadShiki()
  await Promise.all(
    pres.map(async (pre) => {
      const code = pre.querySelector('code')
      if (!code) return
      const lang = langFromCodeClass(code.className)
      const source = code.textContent ?? ''
      if (!source.trim()) return
      try {
        const highlighted = await highlightCode(source, resolveShikiLang(lang), theme)
        const holder = doc.createElement('div')
        holder.innerHTML = highlighted
        const replacement = holder.firstElementChild
        if (replacement) pre.replaceWith(replacement)
      } catch {
        /* keep marked output */
      }
    }),
  )

  return root.innerHTML
}
