<script>
  import { renderMermaidSync, THEMES } from 'beautiful-mermaid'
  import { default as mermaid } from 'mermaid'
  import { mermaidThemeFor, normalizeThemeId } from '$lib/themes/registry.js'
  import { cn } from '$lib/utils.js'

  /** @type {{ code: string, class?: string }} */
  let { code, class: className = '' } = $props()

  // ── Theme helpers ───────────────────────────────────────────────────────────

  /** @param {import('$lib/themes/registry.js').ThemeId} themeId */
  function resolveMermaidTheme(themeId) {
    const base = themeId === 'light' ? THEMES['zinc-light'] : THEMES['zinc-dark']
    return { ...base, ...mermaidThemeFor(themeId) }
  }

  /** @param {SVGSVGElement} svg @param {ReturnType<typeof resolveMermaidTheme>} theme */
  function applyMermaidThemeVars(svg, theme) {
    svg.style.setProperty('--bg', theme.bg)
    svg.style.setProperty('--fg', theme.fg)
    if (theme.muted) svg.style.setProperty('--muted', theme.muted)
    if (theme.line) svg.style.setProperty('--line', theme.line)
    if (theme.accent) svg.style.setProperty('--accent', theme.accent)
    if (theme.border) svg.style.setProperty('--border', theme.border)
    svg.style.background = theme.bg
    const bgRect = /** @type {SVGRectElement|null} */ (svg.querySelector('rect.background, rect[class*="background"]'))
    if (bgRect) bgRect.style.fill = theme.bg
  }

  // ── Rendering pipeline ──────────────────────────────────────────────────────

  function normalizeMermaidCode(c) {
    return c.replace(/^usecaseDiagram\b/m, 'flowchart TD')
  }

  /** @type {Map<string, string>} */
  const mermaidCache = new Map()
  const MERMAID_CACHE_MAX = 30
  const ASYNC_MAX = 20
  let _asyncDiagrams = $state(/** @type {Record<string,string>} */ ({}))
  let _asyncKeys = /** @type {string[]} */ ([])
  let _mermaidJsInit = false

  async function _ensureMermaidJs() {
    if (_mermaidJsInit) return
    _mermaidJsInit = true
    mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' })
  }

  async function _renderWithMermaidJs(c, asyncKey) {
    if (_asyncDiagrams[asyncKey] !== undefined) return
    _asyncDiagrams[asyncKey] = ''
    _asyncKeys.push(asyncKey)
    if (_asyncKeys.length > ASYNC_MAX) {
      const evicted = _asyncKeys.shift()
      if (evicted) { const { [evicted]: _, ...rest } = _asyncDiagrams; _asyncDiagrams = rest }
    }
    try {
      await _ensureMermaidJs()
      const id = `mermaid-${Math.random().toString(36).slice(2)}`
      const { svg } = await mermaid.render(id, c)
      _asyncDiagrams[asyncKey] = svg
    } catch (e) {
      const msg = String(e).replace(/</g, '&lt;').replace(/>/g, '&gt;')
      _asyncDiagrams[asyncKey] = `<div class="flex flex-col gap-1.5 p-3 rounded border border-destructive/30 bg-destructive/5 text-ui-xs"><p class="font-medium text-destructive">Render failed</p><pre class="font-mono text-[10px] text-muted-foreground/70 whitespace-pre-wrap">${msg}</pre></div>`
    }
  }

  function processMermaidSvg(c) {
    const themeId = normalizeThemeId(document.documentElement.dataset.theme)
    const normalized = normalizeMermaidCode(c)
    const cacheKey = `${themeId}:${normalized}`
    if (mermaidCache.has(cacheKey)) return /** @type {string} */ (mermaidCache.get(cacheKey))
    const asyncKey = `async:${cacheKey}`
    if (_asyncDiagrams[asyncKey] !== undefined) {
      return _asyncDiagrams[asyncKey] === ''
        ? `<div class="flex items-center gap-2 p-4 text-ui-xs text-muted-foreground/60"><span class="size-3 animate-spin rounded-full border-2 border-border border-t-muted-foreground inline-block shrink-0"></span>Rendering…</div>`
        : _asyncDiagrams[asyncKey]
    }
    try {
      const svg = renderMermaidSync(normalized, resolveMermaidTheme(themeId))
      if (mermaidCache.size >= MERMAID_CACHE_MAX) mermaidCache.delete(/** @type {string} */ (mermaidCache.keys().next().value))
      mermaidCache.set(cacheKey, svg)
      return svg
    } catch { /* fall through to async */ }
    void _renderWithMermaidJs(normalized, asyncKey)
    return `<div class="flex items-center gap-2 p-4 text-ui-xs text-muted-foreground/60"><span class="size-3 animate-spin rounded-full border-2 border-border border-t-muted-foreground inline-block shrink-0"></span>Rendering…</div>`
  }

  // ── Pan / zoom action ───────────────────────────────────────────────────────

  /** Svelte action applied to the container. Uses a MutationObserver to detect
   *  when the SVG is injected (handles both sync and async rendering), then
   *  attaches pan/zoom/theme listeners. Re-initialises when the SVG is replaced. */
  function mermaidInteractiveAction(node) {
    /** @type {{ destroy: () => void } | null} */
    let handle = null

    function applyBg() {
      const themeId = normalizeThemeId(document.documentElement.dataset.theme)
      const theme = resolveMermaidTheme(themeId)
      node.style.background = theme.bg
      const svg = /** @type {SVGSVGElement|null} */ (node.querySelector('svg'))
      if (svg) applyMermaidThemeVars(svg, theme)
    }

    function teardown() {
      handle?.destroy()
      handle = null
    }

    function setup() {
      teardown()
      const svg = /** @type {SVGSVGElement|null} */ (node.querySelector('svg'))
      if (!svg) return

      // ── Theme ──
      applyMermaidThemeVars(svg, resolveMermaidTheme(normalizeThemeId(document.documentElement.dataset.theme)))
      node.style.background = resolveMermaidTheme(normalizeThemeId(document.documentElement.dataset.theme)).bg

      const themeObs = new MutationObserver(applyBg)
      themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })

      // ── Pan / zoom ──
      svg.style.transformOrigin = '0 0'
      let scale = 1, tx = 0, ty = 0
      let dragging = false, ox = 0, oy = 0
      let rafId = 0

      function applyTransform(animate = false) {
        svg.style.transition = animate ? 'transform 0.25s ease' : 'none'
        svg.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`
      }

      const onWheel = (/** @type {WheelEvent} */ e) => {
        if (!e.ctrlKey && !e.metaKey) return
        e.preventDefault()
        const { left, top } = node.getBoundingClientRect()
        const mx = e.clientX - left, my = e.clientY - top
        const factor = e.deltaY < 0 ? 1.12 : 0.89
        const ns = Math.max(0.1, Math.min(10, scale * factor))
        tx = mx - (mx - tx) * (ns / scale)
        ty = my - (my - ty) * (ns / scale)
        scale = ns
        applyTransform()
      }

      const onMove = (/** @type {MouseEvent} */ e) => {
        if (!dragging) return
        tx = e.clientX - ox; ty = e.clientY - oy
        if (rafId) cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(() => { rafId = 0; applyTransform() })
      }

      const onUp = () => {
        if (!dragging) return
        dragging = false
        node.style.cursor = 'grab'
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }

      const onDown = (/** @type {MouseEvent} */ e) => {
        if (e.button !== 0) return
        dragging = true
        ox = e.clientX - tx; oy = e.clientY - ty
        node.style.cursor = 'grabbing'
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      }

      const onDblClick = () => { scale = 1; tx = 0; ty = 0; applyTransform(true) }
      const onZoomIn    = () => { scale = Math.min(10, scale * 1.25); applyTransform() }
      const onZoomOut   = () => { scale = Math.max(0.1, scale / 1.25); applyTransform() }
      const onZoomReset = () => { scale = 1; tx = 0; ty = 0; applyTransform(true) }

      node.style.cursor = 'grab'
      node.addEventListener('wheel', onWheel, { passive: false })
      node.addEventListener('mousedown', onDown)
      node.addEventListener('dblclick', onDblClick)
      node.addEventListener('diagram:zoomin', onZoomIn)
      node.addEventListener('diagram:zoomout', onZoomOut)
      node.addEventListener('diagram:reset', onZoomReset)

      handle = {
        destroy() {
          themeObs.disconnect()
          if (rafId) cancelAnimationFrame(rafId)
          node.style.cursor = ''
          node.removeEventListener('wheel', onWheel)
          node.removeEventListener('mousedown', onDown)
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
          node.removeEventListener('dblclick', onDblClick)
          node.removeEventListener('diagram:zoomin', onZoomIn)
          node.removeEventListener('diagram:zoomout', onZoomOut)
          node.removeEventListener('diagram:reset', onZoomReset)
        },
      }
    }

    // Apply background immediately (before SVG arrives)
    applyBg()
    const bgObs = new MutationObserver(applyBg)
    bgObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })

    // Detect SVG arrival / replacement via DOM mutations on the container
    setup()
    const svgObs = new MutationObserver(setup)
    svgObs.observe(node, { childList: true })

    return {
      destroy() {
        bgObs.disconnect()
        svgObs.disconnect()
        teardown()
      },
    }
  }

  // ── Reactive rendering ──────────────────────────────────────────────────────

  let svgContent = $state('')

  $effect(() => {
    svgContent = processMermaidSvg(code)
  })

  // ── Container ref (needed for dispatch + export) ────────────────────────────

  /** @type {HTMLDivElement | null} */
  let container = $state(null)

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Dispatch a pan/zoom control event on the canvas. */
  export function dispatch(name) {
    container?.dispatchEvent(new CustomEvent(name))
  }

  /** Download the current diagram as an SVG file. */
  export function exportSvg(filename = 'diagram.svg') {
    const svg = container?.querySelector('svg')
    if (!svg) return
    const xml = new XMLSerializer().serializeToString(svg)
    const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n', xml], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  /** Download the current diagram as a PNG file. */
  export async function exportPng(filename = 'diagram.png') {
    const svg = container?.querySelector('svg')
    if (!svg) return
    const clone = /** @type {SVGSVGElement} */ (svg.cloneNode(true))
    const vb = svg.viewBox.baseVal
    const w = vb.width || svg.clientWidth || 1200
    const h = vb.height || svg.clientHeight || 800
    clone.setAttribute('width', String(w))
    clone.setAttribute('height', String(h))
    const xml = new XMLSerializer().serializeToString(clone)
    const blob = new Blob([xml], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    await new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const dpr = window.devicePixelRatio || 2
        const canvas = document.createElement('canvas')
        canvas.width = w * dpr; canvas.height = h * dpr
        const ctx = canvas.getContext('2d')
        ctx?.scale(dpr, dpr)
        ctx?.drawImage(img, 0, 0)
        URL.revokeObjectURL(url)
        canvas.toBlob((b) => {
          if (b) { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = filename; a.click() }
          resolve(undefined)
        })
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve(undefined) }
      img.src = url
    })
  }
</script>

<div
  bind:this={container}
  use:mermaidInteractiveAction
  class={cn('mermaid-canvas relative overflow-hidden', className)}
>
  {@html svgContent}
</div>

<style>
  .mermaid-canvas { user-select: none; }
  .mermaid-canvas :global(svg) { display: block; max-width: none; }
</style>
