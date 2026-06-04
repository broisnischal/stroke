<script>
  import { marked } from 'marked'
  import { appThemeId } from '$lib/stores/settings.js'
  import { highlightMarkdownHtml } from '$lib/markdown-highlight.js'
  import { cn } from '$lib/utils.js'

  let { content = '', class: className = '', debounceMs = 0, streaming = false } = $props()

  // ── Custom marked renderer ────────────────────────────────────────────────
  // Images are NEVER rendered as <img> tags — they cause massive performance
  // problems when DB results contain image URL columns (dozens of network
  // requests fire simultaneously). Show a compact link chip instead.
  const renderer = new marked.Renderer()
  renderer.image = ({ href, title, text }) => {
    const url = href ?? ''
    const label = text || title || url.split('/').pop()?.split('?')[0] || 'image'
    const escaped = url.replace(/"/g, '&quot;')
    return `<a href="${escaped}" target="_blank" rel="noopener noreferrer" class="prose-ai-img-link" title="${escaped}">${label}</a>`
  }
  const markedOpts = /** @type {marked.MarkedOptions} */ ({ breaks: true, gfm: true, renderer })

  /** @param {HTMLElement} node */
  function copyButtons(node) {
    function inject() {
      node.querySelectorAll('pre.shiki:not([data-copy-injected])').forEach((pre) => {
        pre.setAttribute('data-copy-injected', '1')
        pre.style.position = 'relative'
        const wrapper = document.createElement('div')
        wrapper.className = 'shiki-copy-wrap'
        wrapper.style.cssText = 'position:relative;display:contents'
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.setAttribute('aria-label', 'Copy code')
        btn.className =
          'shiki-copy-btn absolute right-2 top-2 z-10 inline-flex size-6 items-center justify-center rounded border border-[var(--border)] bg-[var(--background)]/80 text-[var(--muted-foreground)] opacity-0 transition-opacity backdrop-blur-sm hover:text-[var(--foreground)]'
        btn.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'
        btn.addEventListener('click', async () => {
          const text = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
          await navigator.clipboard.writeText(text).catch(() => {})
          btn.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#22c55e"><polyline points="20 6 9 17 4 12"/></svg>'
          setTimeout(() => {
            btn.innerHTML =
              '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'
          }, 1500)
        })
        pre.addEventListener('mouseenter', () => { btn.style.opacity = '1' })
        pre.addEventListener('mouseleave', () => { btn.style.opacity = '0' })
        pre.appendChild(btn)
      })
    }

    /**
     * Forward vertical-dominant wheel events out of <pre> code blocks.
     *
     * The `.prose-ai pre` global CSS sets `overflow-x: auto` so wide code can
     * scroll horizontally. But WebKitGTK treats that as a wheel-event consumer
     * for ALL wheel directions, so vertical scrolling over a code block dies
     * inside the <pre> and never reaches the AI chat scroll container.
     *
     * Capture-phase listener intercepts the wheel before <pre>'s default scroll
     * runs, redirects deltaY to the nearest vertically-scrollable ancestor, and
     * leaves horizontal wheel untouched so horizontal code scroll still works.
     */
    function onWheelCapture(/** @type {WheelEvent} */ e) {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const target = e.target instanceof Element ? e.target : null
      if (!target?.closest('pre')) return
      let parent = /** @type {HTMLElement | null} */ (node.parentElement)
      while (parent) {
        if (parent.scrollHeight > parent.clientHeight) {
          const oy = getComputedStyle(parent).overflowY
          if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') {
            e.preventDefault()
            parent.scrollTop += e.deltaY
            return
          }
        }
        parent = parent.parentElement
      }
    }

    const obs = new MutationObserver(inject)
    obs.observe(node, { childList: true, subtree: true })
    inject()
    node.addEventListener('wheel', onWheelCapture, { capture: true, passive: false })
    return {
      destroy() {
        obs.disconnect()
        node.removeEventListener('wheel', onWheelCapture, true)
      },
    }
  }

  let html = $state('')
  let loading = $state(false)

  const appTheme = $derived($appThemeId)

  // Streaming: re-render on every content change using fast synchronous parse.
  // No syntax highlighting — when streaming ends, item is replaced with a fully
  // highlighted assistant item anyway.
  $effect(() => {
    if (!streaming) return
    const md = content
    if (!md.trim()) { html = ''; return }
    const result = marked.parse(md, markedOpts)
    html = typeof result === 'string' ? result : ''
  })

  // Non-streaming: full async render with syntax highlighting + optional debounce.
  $effect(() => {
    if (streaming) return
    const md = content
    const theme = appTheme
    const wait = debounceMs
    let cancelled = false
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer

    async function render() {
      if (!md.trim()) {
        html = ''
        loading = false
        return
      }
      loading = true
      try {
        const raw = /** @type {string} */ (marked.parse(md, markedOpts))
        const highlighted = await highlightMarkdownHtml(raw, theme)
        if (!cancelled) html = highlighted
      } catch {
        if (!cancelled) {
          html = /** @type {string} */ (marked.parse(md, markedOpts))
        }
      } finally {
        if (!cancelled) loading = false
      }
    }

    if (wait > 0) {
      timer = setTimeout(() => void render(), wait)
      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    }

    void render()
    return () => {
      cancelled = true
    }
  })
</script>

<div class={cn('prose-ai', className, loading && 'prose-ai-loading')} use:copyButtons>
  {@html html}
</div>
