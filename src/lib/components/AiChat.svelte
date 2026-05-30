<script>
  import { tick, onMount, onDestroy } from 'svelte'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import Bot from '@lucide/svelte/icons/bot'
  import Send from '@lucide/svelte/icons/send'
  import Square from '@lucide/svelte/icons/square'
  import Settings2 from '@lucide/svelte/icons/settings-2'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import Plus from '@lucide/svelte/icons/plus'
  import Play from '@lucide/svelte/icons/play'
  import PenLine from '@lucide/svelte/icons/pen-line'
  import Copy from '@lucide/svelte/icons/copy'
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle'
  import Table2 from '@lucide/svelte/icons/table-2'
  import MessageSquare from '@lucide/svelte/icons/message-square'
  import Zap from '@lucide/svelte/icons/zap'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import PanelLeft from '@lucide/svelte/icons/panel-left'
  import X from '@lucide/svelte/icons/x'
  import Database from '@lucide/svelte/icons/database'
  import Upload from '@lucide/svelte/icons/upload'
  import BookOpen from '@lucide/svelte/icons/book-open'
  import BarChart2 from '@lucide/svelte/icons/bar-chart-2'
  import Cpu from '@lucide/svelte/icons/cpu'
  import Maximize2 from '@lucide/svelte/icons/maximize-2'
  import Minimize2 from '@lucide/svelte/icons/minimize-2'
  import Download from '@lucide/svelte/icons/download'
  import ZoomIn from '@lucide/svelte/icons/zoom-in'
  import ZoomOut from '@lucide/svelte/icons/zoom-out'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import { cn } from '$lib/utils.js'
  import { executeSql } from '$lib/api.js'
  import DataTable from '$lib/components/DataTable.svelte'
  import AiMarkdown from '$lib/components/AiMarkdown.svelte'
  import AiSqlBlock from '$lib/components/AiSqlBlock.svelte'
  import ShikiBlock from '$lib/components/ShikiBlock.svelte'
  import AiChartRenderer from '$lib/components/AiChartRenderer.svelte'
  import {
    chatCompletionStream,
    manageHistory,
    MAX_AI_RETRIES,
    AI_TOOLS,
    isDestructiveSql,
    parseAssistantMessage,
    buildSystemPrompt,
    classifyDbError,
    filterSchemaForQuery,
    stripThinkTags,
  } from '$lib/ai.js'
  import { loadSkills, saveSkills, parseSkillFile } from '$lib/stores/ai-skills.js'
  import { renderMermaidSync, THEMES } from 'beautiful-mermaid'
  import { mermaidThemeFor, normalizeThemeId } from '$lib/themes/registry.js'
  import mermaid from 'mermaid'
  import { toast } from 'svelte-sonner'
  import { aiSettings, aiProfiles, activeProfileId } from '$lib/stores/ai-settings.js'
  import AiModelPicker from './AiModelPicker.svelte'
  import {
    listConversations,
    createConversation,
    updateConversation,
    deleteConversation,
  } from '$lib/stores/conversations.js'
  import { generateSuggestions } from '$lib/ai-suggestions.js'
  import { formatCompactCount } from '$lib/table-list.js'

  /**
   * @typedef {
   *   | { id: string, kind: 'user', text: string }
   *   | { id: string, kind: 'assistant', parts: import('$lib/ai.js').AssistantPart[] }
   *   | { id: string, kind: 'streaming' }
   *   | { id: string, kind: 'result', sql: string, columns: {name:string,dataType?:string}[], rows: unknown[][], total: number, error: string|null, isSchema?: boolean, capped?: boolean }
   *   | { id: string, kind: 'chart', spec: { type: string, title: string, data: object[], x_key: string, y_keys: {key:string,label:string}[] }, error: string|null }
   *   | { id: string, kind: 'confirm', sql: string, resolve: (ok: boolean) => void }
   *   | { id: string, kind: 'thinking' }
   *   | { id: string, kind: 'executing', sql: string }
   * } ChatItem
   */

  let {
    schemaContext = {
      schemas: [],
      activeSchema: 'public',
      tables: [],
      activeTable: null,
      columns: [],
      primaryKey: [],
      foreignKeys: [],
    },
    connectionId = '',
    isActive = false,
    /** 'tab' = embedded in tab, 'full' = fullscreen AI mode */
    mode = /** @type {'tab' | 'full'} */ ('tab'),
    /** Callback to exit fullscreen AI mode (null when in tab mode) */
    onexit = /** @type {(() => void) | null} */ (null),
    /** @param {string} sql */
    onwritesql = (sql) => {},
    /** Open the dedicated AI model settings dialog. */
    onopenmodelsettings = () => {},
  } = $props()

  $effect(() => {
    if (isActive) {
      // Re-focus the input whenever the AI tab becomes visible
      void Promise.resolve().then(() => inputRef?.focus())
    }
  })

  // ── Settings ──────────────────────────────────────────────────────────────
  /** Model config is the shared reactive store, edited in the dedicated dialog. */
  const settings = $derived($aiSettings)
  let settingsOpen = $state(false)
  /** @type {string | null} */
  let imageViewerSrc = $state(null)
  /** @type {'model'|'skills'|'context'} */
  let settingsTab = $state('model')

  // ── Skills ────────────────────────────────────────────────────────────────
  /** @type {import('$lib/stores/ai-skills.js').AiSkill[]} */
  let skills = $state(loadSkills())

  let newSkillOpen = $state(false)
  let newSkillName = $state('')
  let newSkillDesc = $state('')
  let newSkillContent = $state('')

  function createSkill() {
    const name = newSkillName.trim()
    const content = newSkillContent.trim()
    if (!name || !content) return
    const skill = { id: crypto.randomUUID(), name, description: newSkillDesc.trim(), content }
    skills = [...skills, skill]
    saveSkills(skills)
    newSkillOpen = false
    newSkillName = ''
    newSkillDesc = ''
    newSkillContent = ''
  }

  function removeSkill(/** @type {string} */ id) {
    skills = skills.filter((s) => s.id !== id)
    saveSkills(skills)
  }

  /** @param {Event} e */
  function handleSkillFileUpload(e) {
    const files = /** @type {HTMLInputElement} */ (e.target).files
    if (!files?.length) return
    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const content = /** @type {string} */ (ev.target?.result ?? '')
        const skill = parseSkillFile(file.name, content)
        skills = [...skills, skill]
        saveSkills(skills)
      }
      reader.readAsText(file)
    })
    /** @type {HTMLInputElement} */ (e.target).value = ''
  }

  // ── Conversations list (IndexedDB) ─────────────────────────────────────────
  /** @type {import('$lib/stores/conversations.js').Conversation[]} */
  let convList = $state([])
  /** @type {string | null} */
  let activeConvId = $state(null)

  async function loadConvList() {
    convList = await listConversations(connectionId || undefined)
  }

  async function selectConversation(/** @type {string} */ id) {
    if (id === activeConvId) return
    abortCurrentRequest()
    // Save current before switching
    await persistCurrent()
    const conv = convList.find((c) => c.id === id)
    if (!conv) return
    activeConvId = id
    // Restore — filter out ephemeral items (including any stuck streaming items)
    items = /** @type {ChatItem[]} */ (
      (conv.items ?? []).filter(
        (i) =>
          /** @type {any} */ (i).kind !== 'thinking' &&
          /** @type {any} */ (i).kind !== 'confirm' &&
          /** @type {any} */ (i).kind !== 'streaming' &&
          /** @type {any} */ (i).kind !== 'executing',
      )
    )
    apiHistory = /** @type {import('$lib/ai.js').ApiMessage[]} */ (conv.apiHistory ?? [])
    rawApiHistory = /** @type {import('$lib/ai.js').ApiMessage[]} */ (conv.apiHistory ?? [])
    error = ''
    await scrollBottom()
  }

  async function newConversation() {
    abortCurrentRequest()
    await persistCurrent()
    activeConvId = null
    items = []
    apiHistory = []
    rawApiHistory = []
    error = ''
    await tick()
    inputRef?.focus()
  }

  async function removeConversation(/** @type {string} */ id) {
    closeContextMenu()
    await deleteConversation(id)
    convList = convList.filter((c) => c.id !== id)
    if (activeConvId === id) {
      activeConvId = null
      items = []
      apiHistory = []
      rawApiHistory = []
      error = ''
    }
  }

  // ── Context menu ───────────────────────────────────────────────────────────
  /** @type {{ id: string, x: number, y: number } | null} */
  let contextMenu = $state(null)

  function showContextMenu(/** @type {string} */ id, /** @type {MouseEvent} */ e) {
    e.preventDefault()
    e.stopPropagation()
    contextMenu = { id, x: e.clientX, y: e.clientY }
  }

  function closeContextMenu() {
    contextMenu = null
  }

  /** Persist current chat to IndexedDB (upsert). Updates convList in-place — no re-sort. */
  async function persistCurrent() {
    if (items.length === 0) return
    const saveable = items.filter((i) => i.kind !== 'thinking' && i.kind !== 'confirm' && i.kind !== 'executing')
    if (saveable.length === 0) return
    const firstUser = saveable.find((i) => i.kind === 'user')
    const title =
      firstUser?.kind === 'user'
        ? firstUser.text.slice(0, 60) + (firstUser.text.length > 60 ? '…' : '')
        : 'Conversation'
    const plainItems = $state.snapshot(saveable)
    const plainHistory = $state.snapshot(rawApiHistory)
    if (activeConvId) {
      await updateConversation(activeConvId, { title, items: plainItems, apiHistory: plainHistory })
      // Patch title in place — no re-sort, no visual shuffle
      convList = convList.map((c) => c.id === activeConvId ? { ...c, title } : c)
    } else {
      const conv = await createConversation({
        title,
        schema: schemaContext.activeSchema,
        connectionId,
        items: plainItems,
        apiHistory: plainHistory,
      })
      activeConvId = conv.id
      // Prepend new conversation at the top (it is the newest)
      convList = [conv, ...convList]
    }
  }

  // ── Platform ───────────────────────────────────────────────────────────────
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)
  const modKey = isMac ? '⌘' : 'Ctrl'
  const newChatShortcut = $derived(`${modKey}⇧T`)

  // ── Chat state ─────────────────────────────────────────────────────────────
  /** @type {ChatItem[]} */
  let items = $state([])
  /** @type {import('$lib/ai.js').ApiMessage[]} */
  let apiHistory = $state([])
  /** Full uncompressed history — never trimmed, always saved to IndexedDB */
  let rawApiHistory = $state([])
  let loading = $state(false)
  let error = $state('')
  /** Shown on the thinking row while waiting on rate-limit retries */
  let aiStatusHint = $state('')
  let inputText = $state('')
  const isDraftChat = $derived(!activeConvId && items.length > 0)
  /** Tracks all (name:args) combos executed this turn — prevents exact duplicate calls */
  let executedCalls = new Set()
  /**
   * Tracks failure count + last error per callKey this turn.
   * @type {Map<string, { count: number, lastError: string }>}
   */
  let failureTracker = new Map()

  // ── Streaming & abort ──────────────────────────────────────────────────────
  /** Accumulates text for the currently-streaming assistant turn */
  let streamingContent = $state('')
  /** Buffered full content waiting to be committed to state */
  let _pendingStreamContent = ''
  /** Pending commit timer (null = no pending update) */
  let _streamTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null)
  let _lastStreamCommit = 0
  /** Min ms between streaming commits — caps marked.parse churn so long answers (tables/diagrams) stay smooth. */
  const STREAM_COMMIT_MS = 90

  /**
   * Throttle streaming content updates. Re-parsing the full growing markdown on
   * every token is O(n²) and janks the UI; committing at most every ~90ms keeps
   * generation smooth even for large tables and diagrams.
   */
  function scheduleStreamingUpdate(content) {
    _pendingStreamContent = content
    if (_streamTimer !== null) return
    const elapsed = performance.now() - _lastStreamCommit
    const delay = elapsed >= STREAM_COMMIT_MS ? 0 : STREAM_COMMIT_MS - elapsed
    _streamTimer = setTimeout(() => {
      _streamTimer = null
      _lastStreamCommit = performance.now()
      streamingContent = _pendingStreamContent
    }, delay)
  }

  /** Flush any buffered streaming content immediately (called by stop() and finally block). */
  function flushStreamingContent() {
    if (_streamTimer !== null) {
      clearTimeout(_streamTimer)
      _streamTimer = null
      _lastStreamCommit = performance.now()
      streamingContent = _pendingStreamContent
    }
  }

  /** Streaming display strips <think>...</think> blocks in real time */
  const displayStreamingContent = $derived(
    // Fast path: most models never emit <think>, so skip the regex scans over
    // the (growing) streamed string entirely unless a think tag is present.
    streamingContent.includes('<think>')
      ? streamingContent
          // Complete think blocks — hide entirely
          .replace(/<think>[\s\S]*?<\/think>/g, '')
          // Partial/open think block currently being written — hide from cursor onwards
          .replace(/<think>[\s\S]*$/, '')
          .trim()
      : streamingContent.trim()
  )
  /** ID of the `streaming` ChatItem in `items` (null when not streaming) */
  let streamingId = $state(/** @type {string | null} */ (null))
  /** AbortController for the in-flight fetch; replaced each send() call */
  let abortController = /** @type {AbortController | null} */ (null)

  /** rAF handle for scroll debouncing during streaming */
  let rafId = /** @type {number | null} */ (null)
  /** True when user has manually scrolled away from bottom during streaming */
  let userScrolledUp = $state(false)

  function onScrollAreaScroll() {
    if (!scrollEl) return
    const distFromBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight
    userScrolledUp = distFromBottom > 80
  }

  /** Scroll to bottom on the next animation frame (throttled; skipped if user scrolled up). */
  function scrollBottomSoon() {
    if (userScrolledUp) return
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight
    })
  }

  function jumpToBottom() {
    userScrolledUp = false
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight
  }

  function stop() {
    if (!abortController || abortController.signal.aborted) return
    abortController.abort()
    // Flush any buffered content before reading it
    flushStreamingContent()
    // Immediately finalize UI — don't wait for the async finally block
    const partial = streamingContent.trim()
    const sid = streamingId
    loading = false
    streamingContent = ''
    streamingId = null
    items = items
      .filter((i) => i.kind !== 'thinking' && i.kind !== 'executing')
      .map((i) => {
        if (sid && i.id === sid) {
          return /** @type {ChatItem} */ ({ id: sid, kind: 'assistant', parts: parseAssistantMessage(partial || '…') })
        }
        return i
      })
      .filter((i) => i.kind !== 'streaming')
  }

  function abortCurrentRequest() {
    if (_streamTimer !== null) { clearTimeout(_streamTimer); _streamTimer = null }
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    loading = false
    streamingId = null
    streamingContent = ''
    _pendingStreamContent = ''
    // Remove in-flight ephemeral items so the UI doesn't show a frozen state
    items = items.filter((i) => i.kind !== 'thinking' && i.kind !== 'executing' && i.kind !== 'streaming')
  }

  // ── Mermaid ───────────────────────────────────────────────────────────────
  /** App :root defines --muted, --accent, --border which inherit into SVG and override
   *  beautiful-mermaid's color-mix fallbacks — ER attributes/lines become illegible. */
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
  }

  /** @type {Map<string, string>} */
  const mermaidCache = new Map()
  const MERMAID_CACHE_MAX = 30

  /** `usecaseDiagram` is not a real Mermaid type — auto-correct it. */
  function normalizeMermaidCode(code) {
    return code.replace(/^usecaseDiagram\b/m, 'flowchart TD')
  }

  /** Reactive store for async-rendered diagrams (from full mermaid.js). */
  /** @type {Record<string, string>} */
  /** Capped LRU object for async mermaid SVGs — prevents unbounded memory growth. */
  const ASYNC_DIAGRAMS_MAX = 20
  let _asyncDiagrams = $state({})
  let _asyncDiagramKeys = /** @type {string[]} */ ([])
  let _mermaidJsInit = false

  async function _ensureMermaidJs() {
    if (_mermaidJsInit) return
    _mermaidJsInit = true
    mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' })
  }

  async function _renderWithMermaidJs(code, asyncKey) {
    if (_asyncDiagrams[asyncKey] !== undefined) return
    _asyncDiagrams[asyncKey] = '' // mark as pending
    _asyncDiagramKeys.push(asyncKey)
    if (_asyncDiagramKeys.length > ASYNC_DIAGRAMS_MAX) {
      const evicted = _asyncDiagramKeys.shift()
      if (evicted) {
        const { [evicted]: _, ...rest } = _asyncDiagrams
        _asyncDiagrams = rest
      }
    }
    try {
      await _ensureMermaidJs()
      const id = `mermaid-${Math.random().toString(36).slice(2)}`
      const { svg } = await mermaid.render(id, code)
      _asyncDiagrams[asyncKey] = svg
    } catch (e) {
      const msg = String(e).replace(/</g, '&lt;').replace(/>/g, '&gt;')
      _asyncDiagrams[asyncKey] = `<div class="flex flex-col gap-1.5 p-3 rounded border border-destructive/30 bg-destructive/5"><p class="text-ui-xs font-medium text-destructive">Diagram render failed</p><p class="font-mono text-[10px] text-muted-foreground/70 whitespace-pre-wrap">${msg}</p></div>`
    }
  }

  /** Render mermaid code to SVG. Tries beautiful-mermaid (sync), falls back to full mermaid.js (async). */
  function processMermaidSvg(code) {
    const themeId = normalizeThemeId(document.documentElement.dataset.theme)
    const normalized = normalizeMermaidCode(code)
    const cacheKey = `${themeId}:${normalized}`

    // Sync cache hit (beautiful-mermaid)
    if (mermaidCache.has(cacheKey)) return /** @type {string} */ (mermaidCache.get(cacheKey))

    // Async cache (full mermaid.js)
    const asyncKey = `async:${cacheKey}`
    if (_asyncDiagrams[asyncKey] !== undefined) {
      if (_asyncDiagrams[asyncKey] === '') {
        return `<div class="flex items-center gap-2 p-4 text-ui-xs text-muted-foreground"><span class="size-3 animate-spin rounded-full border-2 border-border border-t-muted-foreground inline-block"></span>Rendering diagram…</div>`
      }
      return _asyncDiagrams[asyncKey]
    }

    // Try beautiful-mermaid (sync, fast, themed)
    try {
      const svg = renderMermaidSync(normalized, resolveMermaidTheme(themeId))
      if (mermaidCache.size >= MERMAID_CACHE_MAX) {
        mermaidCache.delete(/** @type {string} */ (mermaidCache.keys().next().value))
      }
      mermaidCache.set(cacheKey, svg)
      return svg
    } catch {
      // Fall through to full mermaid.js
    }

    // Trigger async render and show loading spinner
    void _renderWithMermaidJs(normalized, asyncKey)
    return `<div class="flex items-center gap-2 p-4 text-ui-xs text-muted-foreground"><span class="size-3 animate-spin rounded-full border-2 border-border border-t-muted-foreground inline-block"></span>Rendering diagram…</div>`
  }

  /** Svelte action: applies live dark/light theming + pan/zoom to the mermaid canvas.
   *  Zoom: Ctrl/Meta + scroll (so regular chat scroll is never blocked).
   *  Pan: drag. Reset: double-click. */
  function mermaidInteractive(/** @type {HTMLDivElement} */ node) {
    const svg = /** @type {SVGSVGElement|null} */ (node.querySelector('svg'))
    if (!svg) return {}

    // ── Theming ────────────────────────────────────────────────────────────
    function applyTheme() {
      const themeId = normalizeThemeId(document.documentElement.dataset.theme)
      const theme = resolveMermaidTheme(themeId)
      applyMermaidThemeVars(svg, theme)
      node.style.background = theme.bg
    }
    applyTheme()
    const themeObs = new MutationObserver(applyTheme)
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })

    // ── Pan / zoom ─────────────────────────────────────────────────────────
    svg.style.transformOrigin = '0 0'
    let scale = 1, tx = 0, ty = 0
    let dragging = false, ox = 0, oy = 0

    function applyTransform(animate = false) {
      svg.style.transition = animate ? 'transform 0.25s ease' : ''
      svg.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`
    }

    const onWheel = (/** @type {WheelEvent} */ e) => {
      if (!e.ctrlKey && !e.metaKey) return   // regular scroll → let it bubble for chat scroll
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

    let rafId = 0
    const onMove = (/** @type {MouseEvent} */ e) => {
      if (!dragging) return
      tx = e.clientX - ox; ty = e.clientY - oy
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => { rafId = 0; applyTransform() })
    }

    const onUp = () => {
      if (!dragging) return
      dragging = false
      node.classList.remove('is-dragging')
      // Detach the global move/up listeners until the next drag begins, so we
      // don't run a window-wide mousemove handler whenever a diagram is shown.
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    const onDown = (/** @type {MouseEvent} */ e) => {
      if (e.button !== 0) return
      dragging = true
      ox = e.clientX - tx; oy = e.clientY - ty
      node.classList.add('is-dragging')
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }

    const onDblClick = () => {
      scale = 1; tx = 0; ty = 0
      applyTransform(true)
    }

    const onZoomIn  = () => { scale = Math.min(10, scale * 1.25); applyTransform() }
    const onZoomOut = () => { scale = Math.max(0.1, scale / 1.25); applyTransform() }
    const onZoomReset = () => { scale = 1; tx = 0; ty = 0; applyTransform(true) }

    node.addEventListener('wheel', onWheel, { passive: false })
    node.addEventListener('mousedown', onDown)
    node.addEventListener('dblclick', onDblClick)
    node.addEventListener('diagram:zoomin', onZoomIn)
    node.addEventListener('diagram:zoomout', onZoomOut)
    node.addEventListener('diagram:reset', onZoomReset)

    return {
      destroy() {
        themeObs.disconnect()
        if (rafId) cancelAnimationFrame(rafId)
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

  // ── Diagram fullscreen ─────────────────────────────────────────────────────
  /** @type {string | null} */
  let fullscreenDiagramCode = $state(null)
  /** @type {HTMLDivElement | null} */
  let fullscreenCanvasEl = $state(null)

  function openDiagramFullscreen(code) {
    fullscreenDiagramCode = code
  }

  function closeDiagramFullscreen() {
    fullscreenDiagramCode = null
  }

  function dispatchDiagramEvent(name) {
    fullscreenCanvasEl?.dispatchEvent(new CustomEvent(name))
  }

  function exportDiagramSvg(code) {
    const canvas = fullscreenCanvasEl ?? document.querySelector('.mermaid-canvas')
    const svgEl = canvas?.querySelector('svg') ?? document.querySelector('.mermaid-canvas svg')
    if (!svgEl) { toast.error('No diagram to export'); return }
    const serializer = new XMLSerializer()
    const svgStr = '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(svgEl)
    const blob = new Blob([svgStr], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'diagram.svg'; a.click()
    URL.revokeObjectURL(url)
    toast.success('SVG exported', { description: 'diagram.svg saved to your downloads' })
  }

  async function exportDiagramPng(code) {
    const canvas = fullscreenCanvasEl ?? document.querySelector('.mermaid-canvas')
    const svgEl = canvas?.querySelector('svg') ?? document.querySelector('.mermaid-canvas svg')
    if (!svgEl) { toast.error('No diagram to export'); return }
    const serializer = new XMLSerializer()
    const svgStr = serializer.serializeToString(svgEl)
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      const w = svgEl.viewBox.baseVal.width || svgEl.clientWidth || 800
      const h = svgEl.viewBox.baseVal.height || svgEl.clientHeight || 600
      c.width = w * 2; c.height = h * 2  // 2x for retina
      const ctx2 = c.getContext('2d')
      if (!ctx2) { URL.revokeObjectURL(url); return }
      ctx2.fillStyle = '#ffffff'
      ctx2.fillRect(0, 0, c.width, c.height)
      ctx2.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      c.toBlob((b) => {
        if (!b) { toast.error('Failed to export PNG'); return }
        const pngUrl = URL.createObjectURL(b)
        const a = document.createElement('a')
        a.href = pngUrl; a.download = 'diagram.png'; a.click()
        URL.revokeObjectURL(pngUrl)
        toast.success('PNG exported', { description: 'diagram.png saved to your downloads' })
      }, 'image/png')
    }
    img.onerror = () => { URL.revokeObjectURL(url); toast.error('Failed to export PNG') }
    img.src = url
  }

  /** @type {HTMLDivElement | null} */
  let scrollEl = $state(null)
  /** @type {HTMLTextAreaElement | null} */
  let inputRef = $state(null)

  // ── Input undo / redo ─────────────────────────────────────────────────────
  /** @type {string[]} */
  let inputHistory = ['']
  let inputHistoryIdx = 0
  /** @type {ReturnType<typeof setTimeout> | null} */
  let historyTimer = null

  function pushHistory(text) {
    if (historyTimer) clearTimeout(historyTimer)
    historyTimer = setTimeout(() => {
      historyTimer = null
      if (text === inputHistory[inputHistoryIdx]) return
      inputHistory = [...inputHistory.slice(0, inputHistoryIdx + 1), text]
      inputHistoryIdx = inputHistory.length - 1
    }, 250)
  }

  function undoInput() {
    if (historyTimer) { clearTimeout(historyTimer); historyTimer = null }
    if (inputText !== inputHistory[inputHistoryIdx]) {
      inputHistory = [...inputHistory.slice(0, inputHistoryIdx + 1), inputText]
      inputHistoryIdx = inputHistory.length - 1
    }
    if (inputHistoryIdx <= 0) return
    inputHistoryIdx--
    inputText = inputHistory[inputHistoryIdx]
    void tick().then(() => { resizeInput(); inputRef?.focus() })
  }

  function redoInput() {
    if (inputHistoryIdx >= inputHistory.length - 1) return
    inputHistoryIdx++
    inputText = inputHistory[inputHistoryIdx]
    void tick().then(() => { resizeInput(); inputRef?.focus() })
  }

  function resetHistory() {
    if (historyTimer) { clearTimeout(historyTimer); historyTimer = null }
    inputHistory = ['']
    inputHistoryIdx = 0
  }

  const canUndo = $derived(inputHistoryIdx > 0 || inputText !== inputHistory[inputHistoryIdx])
  const canRedo = $derived(inputHistoryIdx < inputHistory.length - 1)

  // ── `/` global focus shortcut ─────────────────────────────────────────────
  onMount(() => {
    function onSlash(/** @type {KeyboardEvent} */ e) {
      if (!isActive || e.key !== '/') return
      const tag = /** @type {HTMLElement | null} */ (document.activeElement)?.tagName ?? ''
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (/** @type {HTMLElement | null} */ (document.activeElement)?.isContentEditable) return
      e.preventDefault()
      inputRef?.focus()
    }
    document.addEventListener('keydown', onSlash)
    onDestroy(() => document.removeEventListener('keydown', onSlash))
  })

  let seq = 0
  const uid = () => `c${++seq}`

  const hasPendingConfirm = $derived(items.some((i) => i.kind === 'confirm'))
  const suggestions = $derived(generateSuggestions(schemaContext))
  /** Show a persistent activity row while loading when no thinking/streaming/executing row is already visible. */
  const showWorking = $derived(
    loading && !items.some((i) => i.kind === 'thinking' || i.kind === 'streaming' || i.kind === 'executing'),
  )

  /** System prompt for the current AI turn — built fresh each send() with selective schema injection */
  let turnSystemPrompt = $state('')

  /**
   * Session-level schema cache: key = "schema.table", value = column list.
   * Accumulates across all turns so we only fetch each table once per session.
   * Gets merged into allTableColumns when building the system prompt.
   * @type {Record<string, {name:string, dataType:string, nullable?:boolean}[]>}
   */
  let fetchedSchemas = $state({})

  // ── Context window stats ──────────────────────────────────────────────────
  /** Rough token estimate: 1 token ≈ 4 chars (GPT/Mistral rule of thumb) */
  function tokEst(chars) {
    const t = Math.round(chars / 4)
    if (t >= 10_000) return `~${(t / 1000).toFixed(0)}k`
    if (t >= 1_000) return `~${(t / 1000).toFixed(1)}k`
    return `~${t}`
  }

  const contextStats = $derived.by(() => {
    const historyChars = apiHistory.reduce((s, m) => s + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content ?? '').length), 0)
    const promptChars = turnSystemPrompt.length || 0
    const totalChars = historyChars + promptChars
    const maxChars = 120_000
    const historyTokens = Math.round(historyChars / 4)
    const promptTokens = Math.round(promptChars / 4)
    const totalTokens = Math.round(totalChars / 4)
    const maxTokens = Math.round(maxChars / 4)
    const pct = Math.min(100, Math.round((totalTokens / maxTokens) * 100))
    return { historyChars, promptChars, totalChars, historyTokens, promptTokens, totalTokens, maxChars, maxTokens, pct, messages: apiHistory.length }
  })

  // ── AI sidebar visibility (persisted) ─────────────────────────────────────
  const AI_SIDEBAR_KEY = 'db-studio:ai-sidebar-open'

  function loadSidebarPref() {
    try { return localStorage.getItem(AI_SIDEBAR_KEY) !== 'false' } catch { return true }
  }

  function saveSidebarPref(v) {
    try { localStorage.setItem(AI_SIDEBAR_KEY, String(v)) } catch {}
  }

  let sidebarVisible = $state(loadSidebarPref())

  function toggleAiSidebar() {
    sidebarVisible = !sidebarVisible
    saveSidebarPref(sidebarVisible)
  }

  /** Accordion: ID of the currently expanded result card (null = all collapsed) */
  let openResultId = $state(/** @type {string | null} */ (null))
  /** Whether the user has manually collapsed results — respected by auto-open logic */
  let userPrefersCollapsed = $state(false)

  /** @param {string} id */
  function toggleResult(id) {
    if (openResultId === id) {
      openResultId = null
      userPrefersCollapsed = true
    } else {
      openResultId = id
      userPrefersCollapsed = false
    }
  }

  /** Open a result card. Schema results (isSchema=true) are always kept collapsed. */
  function autoOpenResult(/** @type {string} */ id, isSchema = false) {
    if (!userPrefersCollapsed && !isSchema) openResultId = id
  }

  /** Code blocks collapsed by user (in set = collapsed; default open) */
  let collapsed = $state(/** @type {Set<string>} */ (new Set()))
  /** SQL blocks expanded by user (in set = expanded; default collapsed) */
  let sqlExpanded = $state(/** @type {Set<string>} */ (new Set()))

  /** @param {string} key */
  function toggleCollapse(key) {
    const next = new Set(collapsed)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    collapsed = next
  }

  /** @param {string} key */
  function toggleSqlExpand(key) {
    const next = new Set(sqlExpanded)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    sqlExpanded = next
  }

  // ── Input auto-resize ──────────────────────────────────────────────────────
  function resizeInput() {
    const el = inputRef
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  function resetInputHeight() {
    if (inputRef) inputRef.style.height = 'auto'
  }

  async function scrollBottom() {
    await tick()
    userScrolledUp = false
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(/** @type {KeyboardEvent} */ e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
      return
    }
    // Ctrl/Cmd + Z → undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undoInput()
      return
    }
    // Ctrl/Cmd + Shift + Z  or  Ctrl + Y → redo
    if (
      ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) ||
      (e.ctrlKey && e.key === 'y')
    ) {
      e.preventDefault()
      redoInput()
      return
    }
    // Ctrl/Cmd + Backspace → clear the entire input
    if (e.key === 'Backspace' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      inputText = ''
      resetInputHeight()
    }
  }

  /**
   * Fetch column definitions for ALL tables in the active schema that aren't yet cached.
   * After the first call this is a no-op (all tables cached). Stores in fetchedSchemas,
   * NOT in apiHistory — gets merged into the system prompt each turn.
   */
  async function ensureFullSchemaCache() {
    if (!schemaContext.tables?.length) return
    const isMysql = schemaContext.dbType === 'mysql'
    const sc = schemaContext.activeSchema

    // Determine which tables we still need column data for
    const combined = { ...schemaContext.allTableColumns, ...fetchedSchemas }
    const missing = schemaContext.tables.filter((t) => !combined[`${sc}.${t.name}`])
    if (!missing.length) return

    try {
      const scSafe = sc.replace(/'/g, "''")
      // One query fetches all missing tables at once
      // For PostgreSQL, resolve USER-DEFINED to the actual enum/type name so the AI
      // sees 'account_status' instead of 'USER-DEFINED' and can query enum values.
      const sql = isMysql
        ? `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${scSafe}' ORDER BY TABLE_NAME, ORDINAL_POSITION`
        : `SELECT c.table_name, c.column_name, CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name ELSE c.data_type END AS data_type, c.is_nullable FROM information_schema.columns c WHERE c.table_schema = '${scSafe}' ORDER BY c.table_name, c.ordinal_position`
      const data = await executeSql(sql)
      /** @type {Record<string, {name:string, dataType:string, nullable:boolean}[]>} */
      const byTable = {}
      for (const row of (data.rows ?? [])) {
        const key = `${sc}.${String(row[0])}`
        if (!byTable[key]) byTable[key] = []
        byTable[key].push({ name: String(row[1]), dataType: String(row[2]), nullable: String(row[3]).toUpperCase() === 'YES' })
      }
      // Merge into session cache (preserves any existing entries)
      fetchedSchemas = { ...fetchedSchemas, ...byTable }
    } catch {
      // Non-fatal — AI will call describe_table if schema fetch fails
    }
  }

  async function send(/** @type {string} */ [overrideText] = []) {
    const text = (overrideText ?? inputText).trim()
    if (!text || loading || hasPendingConfirm) return
    error = ''
    aiStatusHint = ''
    if (!overrideText) { inputText = ''; resetInputHeight(); resetHistory() }

    items.push(/** @type {ChatItem} */ ({ id: uid(), kind: 'user', text }))
    apiHistory.push({ role: 'user', content: text })
    rawApiHistory.push({ role: 'user', content: text })
    await scrollBottom()

    const thinkingId = uid()
    items.push(/** @type {ChatItem} */ ({ id: thinkingId, kind: 'thinking' }))
    await scrollBottom()

    loading = true
    abortController = new AbortController()
    executedCalls = new Set()
    failureTracker = new Map()

    // Proactively fetch column definitions for all tables into session cache
    // only when the query looks like it's asking about data (not a trivial message).
    const looksLikeDataQuery = text.length > 4 || /select|from|show|list|count|table|schema|column|insert|update|delete/i.test(text)
    if (looksLikeDataQuery) {
      aiStatusHint = 'Analyzing schema…'
      await ensureFullSchemaCache()
      aiStatusHint = ''
    }

    // Build query-filtered system prompt for this turn (merge session cache)
    const filteredCtx = filterSchemaForQuery({ ...schemaContext, allTableColumns: { ...schemaContext.allTableColumns, ...fetchedSchemas }, userSkills: skills }, text)
    turnSystemPrompt = buildSystemPrompt(filteredCtx)

    // Smart context management: sliding window + optional summarization.
    // managedLen marks where new messages start after the turn — used to append to rawApiHistory.
    const { history: managedHistory, summarized } = await manageHistory(settings, apiHistory, {
      maxChars: 200_000,
      keepLastN: 14,
      summarizeThreshold: 60_000,
      onStatus: (msg) => { aiStatusHint = msg },
    })
    const managedLen = managedHistory.length
    if (summarized) {
      apiHistory = managedHistory
      aiStatusHint = ''
    } else {
      apiHistory = managedHistory
    }

    try {
      await runAiTurn(0)
      // Append all messages added during this turn to the full uncompressed history
      rawApiHistory.push(...apiHistory.slice(managedLen))
      await persistCurrent()
    } catch (e) {
      if (/** @type {any} */ (e)?.name !== 'AbortError') error = String(e)
    } finally {
      // Flush any rAF-buffered content before reading it
      flushStreamingContent()
      // Finalize any in-progress streaming item (abort or error mid-stream)
      if (streamingId) {
        const partial = streamingContent.trim()
        const sid = streamingId
        items = items
          .filter((i) => i.kind !== 'thinking' && i.kind !== 'executing')
          .map((i) =>
            i.id === sid
              ? /** @type {ChatItem} */ ({ id: sid, kind: 'assistant', parts: parseAssistantMessage(partial || '…') })
              : i,
          )
        streamingId = null
        streamingContent = ''
        _pendingStreamContent = ''
      } else {
        items = items.filter((i) => i.kind !== 'thinking' && i.kind !== 'executing')
      }
      abortController = null
      loading = false
      openResultId = null
      await tick()
      inputRef?.focus()
    }
  }

  /** Max rows fetched from DB per AI tool call — prevents OOM on large tables */
  const AI_ROW_LIMIT = 500
  /** Max rows kept in chat state for display */
  const AI_DISPLAY_ROWS = 200

  /**
   * Append LIMIT to SELECT/CTE queries that lack one.
   * DML/DDL pass through unchanged.
   * @param {string} sql
   * @returns {{ sql: string, capped: boolean }}
   */
  function guardSelectLimit(sql) {
    // Strip trailing semicolons first — appending "\nLIMIT N" after a ";" produces
    // a bare LIMIT statement that PostgreSQL rejects with a syntax error.
    const cleaned = sql.trimEnd().replace(/;+$/, '')
    const t = cleaned.trimStart()
    if (!/^(with\b|select\b)/i.test(t)) return { sql: cleaned, capped: false }
    if (/\blimit\s+\d/i.test(t)) return { sql: cleaned, capped: false }
    return { sql: `${cleaned}\nLIMIT ${AI_ROW_LIMIT}`, capped: true }
  }

  /** @param {number} depth */
  async function runAiTurn(depth) {
    if (depth > 40) throw new Error('Too many AI iterations — aborting runaway execution')
    if (abortController?.signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })

    // Space out follow-up turns after tool calls to avoid burst rate limits
    if (depth > 0) {
      await new Promise((r) => setTimeout(r, 300))
      if (abortController?.signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
    }

    let fullContent = ''
    /** @type {import('$lib/ai.js').ToolCall[]} */
    let toolCalls = []
    /** ID of the streaming placeholder item created on first text token */
    let itemId = /** @type {string | null} */ (null)

    for await (const chunk of chatCompletionStream(
      settings,
      [{ role: 'system', content: turnSystemPrompt }, ...apiHistory],
      AI_TOOLS,
      abortController?.signal,
      ({ attempt, waitMs }) => {
        const sec = Math.ceil(waitMs / 1000)
        aiStatusHint = `Rate limited — retrying in ${sec}s (attempt ${attempt}/${MAX_AI_RETRIES})…`
      },
    )) {
      if (chunk.textDelta) {
        aiStatusHint = ''
        fullContent += chunk.textDelta
        if (!itemId) {
          itemId = uid()
          streamingId = itemId
          // Remove the thinking indicator the moment the first token arrives, then append streaming placeholder
          const thinkIdx = items.findIndex((i) => i.kind === 'thinking')
          if (thinkIdx >= 0) items.splice(thinkIdx, 1)
          items.push(/** @type {ChatItem} */ ({ id: itemId, kind: 'streaming' }))
        }
        scheduleStreamingUpdate(fullContent)
        scrollBottomSoon()
      }
      if (chunk.toolCalls) {
        toolCalls = chunk.toolCalls
      }
    }

    // Bail out immediately if the user stopped generation — stop() already finalized UI
    if (abortController?.signal.aborted) {
      throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
    }

    // Flush any buffered streaming content before finalizing
    flushStreamingContent()

    // Promote the streaming placeholder to a finalized assistant item
    if (itemId && streamingId) {
      streamingId = null
      streamingContent = ''
      _pendingStreamContent = ''
      items = items.map((i) =>
        i.id === itemId
          ? /** @type {ChatItem} */ ({ id: itemId, kind: 'assistant', parts: parseAssistantMessage(fullContent) })
          : i,
      )
    }

    if (toolCalls.length > 0) {
      // Drop the "Thinking…" placeholder so the executing rows are the live indicator.
      const thinkIdx = items.findIndex((i) => i.kind === 'thinking')
      if (thinkIdx >= 0) items.splice(thinkIdx, 1)
      apiHistory.push({ role: 'assistant', content: fullContent || null, tool_calls: toolCalls })
      for (const call of toolCalls) {
        await runToolCall(call)
      }
      items.push(/** @type {ChatItem} */ ({ id: uid(), kind: 'thinking' }))
      scrollBottomSoon()
      await runAiTurn(depth + 1)
    } else if (fullContent) {
      apiHistory.push({ role: 'assistant', content: fullContent })
      // Fallback: if no streaming item was created (non-streaming endpoint), add it now
      if (!itemId) {
        items.push(/** @type {ChatItem} */ ({ id: uid(), kind: 'assistant', parts: parseAssistantMessage(fullContent) }))
        await scrollBottom()
      }
    }
  }

  /** @param {import('$lib/ai.js').ToolCall} call */
  async function runToolCall(call) {
    const callKey = `${call.function.name}:${call.function.arguments}`
    if (executedCalls.has(callKey)) {
      apiHistory.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'Duplicate call — this exact operation already ran this turn. Use the previous result instead of calling again.' }) })
      return
    }
    const prior = failureTracker.get(callKey)
    if (prior && prior.count >= 2) {
      apiHistory.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({
        error: `This call has already failed ${prior.count} times this turn. Do NOT retry it again.`,
        last_error: prior.lastError,
        instruction: 'Analyze the error, use a different approach, or explain to the user why this cannot be done.',
      }) })
      return
    }
    executedCalls.add(callKey)

    let toolResult = ''
    try {
      const args = JSON.parse(call.function.arguments || '{}')

      if (call.function.name === 'execute_sql') {
        const sql = String(args.sql ?? '').trim()
        if (!sql) {
          apiHistory.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'Empty SQL provided' }) })
          return
        }
        if (isDestructiveSql(sql)) {
          const confirmed = await waitForConfirm(sql)
          if (!confirmed) {
            apiHistory.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ cancelled: true, message: 'User declined this operation.' }) })
            return
          }
        }
        const { sql: guardedSql, capped: frontendCapped } = guardSelectLimit(sql)
        const execId = uid()
        items.push(/** @type {ChatItem} */ ({ id: execId, kind: 'executing', sql }))
        await scrollBottom()
        try {
          const data = await executeSql(guardedSql)
          const cols = data.columns ?? []
          const rows = data.rows ?? []
          const total = data.rowCount ?? rows.length
          const backendCapped = typeof data.message === 'string' && data.message.startsWith('Showing first')
          const resultId = uid()
          // Replace executing indicator with result card in one operation
          const execIdx = items.findIndex((i) => i.id === execId)
          const resultItem = /** @type {ChatItem} */ ({ id: resultId, kind: 'result', sql, columns: cols, rows: rows.slice(0, AI_DISPLAY_ROWS), total, error: null, capped: frontendCapped })
          if (execIdx >= 0) items.splice(execIdx, 1, resultItem)
          else items.push(resultItem)
          autoOpenResult(resultId)
          await scrollBottom()
          toolResult = JSON.stringify({
            columns: cols.map((c) => c.name),
            rows: rows.slice(0, 30),
            total_rows: total,
            ...(backendCapped ? { notice: data.message ?? 'Results capped. Use WHERE or LIMIT to narrow results.' } : {}),
            message: data.message ?? null,
          })
        } catch (sqlErr) {
          // Remove executing indicator silently — AI sees the error via toolResult
          const execIdx = items.findIndex((i) => i.id === execId)
          if (execIdx >= 0) items.splice(execIdx, 1)
          const msg = String(sqlErr)
          const hint = classifyDbError(msg)
          const existing = failureTracker.get(callKey) ?? { count: 0, lastError: '' }
          failureTracker.set(callKey, { count: existing.count + 1, lastError: msg })
          toolResult = JSON.stringify({ error: msg, ...(hint ? { hint } : {}), attempt: existing.count + 1 })
        }

      } else if (call.function.name === 'describe_table') {
        const schema = String(args.schema ?? schemaContext.activeSchema).replace(/'/g, "''")
        const table = String(args.table ?? '').replace(/'/g, "''")
        const execId = uid()
        items.push(/** @type {ChatItem} */ ({ id: execId, kind: 'executing', sql: `${schema}.${table} schema` }))
        await scrollBottom()
        const descSql = schemaContext.dbType === 'mysql'
          ? `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${table}' ORDER BY ORDINAL_POSITION`
          : `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = '${table}' ORDER BY ordinal_position`
        const data = await executeSql(descSql)
        const cols = data.columns ?? []
        const rows = data.rows ?? []
        const schemaResultId = uid()
        const schemaResultItem = /** @type {ChatItem} */ ({ id: schemaResultId, kind: 'result', sql: `${schema}.${table} schema`, columns: cols, rows, total: rows.length, error: null, isSchema: true })
        const execIdx = items.findIndex((i) => i.id === execId)
        if (execIdx >= 0) items.splice(execIdx, 1, schemaResultItem)
        else items.push(schemaResultItem)
        autoOpenResult(schemaResultId, true)
        await scrollBottom()
        toolResult = JSON.stringify({
          table: `${schema}.${table}`,
          columns: rows.map((r) => ({ name: r[0], type: r[1], nullable: r[2] === 'YES', default: r[3] ?? null })),
        })

      } else if (call.function.name === 'render_chart') {
        const chartSpec = args
        const chartId = uid()
        if (!chartSpec.data?.length) {
          items.push(/** @type {ChatItem} */ ({ id: chartId, kind: 'chart', spec: chartSpec, error: 'No data provided to render_chart. Call execute_sql first.' }))
          toolResult = JSON.stringify({ error: 'No data provided. Execute a SQL query first and pass the results.' })
        } else {
          items.push(/** @type {ChatItem} */ ({ id: chartId, kind: 'chart', spec: chartSpec, error: null }))
          await scrollBottom()
          toolResult = JSON.stringify({ success: true, message: 'Chart rendered successfully.' })
        }

      } else if (call.function.name === 'list_tables') {
        const tableNames = schemaContext.tables.map((t) => ({ name: t.name, rowCount: t.rowCount }))
        toolResult = JSON.stringify({ schema: schemaContext.activeSchema, tables: tableNames, total: tableNames.length })

      } else if (call.function.name === 'get_schema') {
        const targetTable = String(args.table ?? '').trim()
        const execId = uid()
        items.push(/** @type {ChatItem} */ ({ id: execId, kind: 'executing', sql: targetTable ? `schema: ${targetTable}` : `schema: all tables` }))
        await scrollBottom()
        try {
          const isMysql = schemaContext.dbType === 'mysql'
          const sc = schemaContext.activeSchema.replace(/'/g, "''")
          if (targetTable) {
            const tt = targetTable.replace(/'/g, "''")
            const sql = isMysql
              ? `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${sc}' AND TABLE_NAME = '${tt}' ORDER BY ORDINAL_POSITION`
              : `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = '${sc}' AND table_name = '${tt}' ORDER BY ordinal_position`
            const data = await executeSql(sql)
            const cols = (data.rows ?? []).map((r) => ({ name: r[0], type: r[1], nullable: r[2] === 'YES', default: r[3] ?? null }))
            const execIdx = items.findIndex((i) => i.id === execId)
            if (execIdx >= 0) items.splice(execIdx, 1)
            toolResult = JSON.stringify({ table: `${schemaContext.activeSchema}.${targetTable}`, columns: cols })
          } else {
            const sql = isMysql
              ? `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${sc}' ORDER BY TABLE_NAME, ORDINAL_POSITION`
              : `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = '${sc}' ORDER BY table_name, ordinal_position`
            const data = await executeSql(sql)
            const byTable = /** @type {Record<string, unknown[]>} */ ({})
            for (const row of (data.rows ?? [])) {
              const tName = String(row[0])
              if (!byTable[tName]) byTable[tName] = []
              byTable[tName].push({ name: row[1], type: row[2], nullable: row[3] === 'YES' })
            }
            const execIdx = items.findIndex((i) => i.id === execId)
            if (execIdx >= 0) items.splice(execIdx, 1)
            toolResult = JSON.stringify({ schema: schemaContext.activeSchema, tables: byTable })
          }
        } catch (e) {
          const execIdx = items.findIndex((i) => i.id === execId)
          if (execIdx >= 0) items.splice(execIdx, 1)
          toolResult = JSON.stringify({ error: String(e) })
        }

      } else {
        toolResult = JSON.stringify({ error: `Unknown tool: ${call.function.name}` })
      }
    } catch (e) {
      // Outer catch: JSON parse errors, unexpected exceptions — remove executing indicator silently
      items = items.filter((i) => i.kind !== 'executing')
      const msg = String(e)
      const hint = classifyDbError(msg)
      const existing = failureTracker.get(callKey) ?? { count: 0, lastError: '' }
      failureTracker.set(callKey, { count: existing.count + 1, lastError: msg })
      toolResult = JSON.stringify({ error: msg, ...(hint ? { hint } : {}), attempt: existing.count + 1 })
    }
    apiHistory.push({ role: 'tool', tool_call_id: call.id, content: toolResult })
  }

  /** Run SQL from a text-mode code block (user pressed Run). */
  async function runSqlBlock(/** @type {string} */ sql) {
    if (loading) return
    error = ''
    if (isDestructiveSql(sql)) {
      const confirmed = await waitForConfirm(sql)
      if (!confirmed) return
    }
    loading = true
    const execId = uid()
    items.push(/** @type {ChatItem} */ ({ id: execId, kind: 'executing', sql }))
    await scrollBottom()
    try {
      const data = await executeSql(sql)
      const cols = data.columns ?? []
      const rows = data.rows ?? []
      const sqlResId = uid()
      const resultItem = /** @type {ChatItem} */ ({ id: sqlResId, kind: 'result', sql, columns: cols, rows, total: data.rowCount ?? rows.length, error: null })
      const execIdx = items.findIndex((i) => i.id === execId)
      if (execIdx >= 0) items.splice(execIdx, 1, resultItem)
      else items.push(resultItem)
      autoOpenResult(sqlResId)
      await scrollBottom()
      await persistCurrent()
    } catch (e) {
      const sqlErrId = uid()
      const errItem = /** @type {ChatItem} */ ({ id: sqlErrId, kind: 'result', sql, columns: [], rows: [], total: 0, error: String(e) })
      const execIdx = items.findIndex((i) => i.id === execId)
      if (execIdx >= 0) items.splice(execIdx, 1, errItem)
      else items.push(errItem)
      autoOpenResult(sqlErrId)
      await scrollBottom()
    } finally {
      loading = false
    }
  }

  /** @param {string} sql @returns {Promise<boolean>} */
  function waitForConfirm(sql) {
    return new Promise((resolve) => {
      const itemId = uid()
      items.push(/** @type {ChatItem} */ ({
        id: itemId,
        kind: 'confirm',
        sql,
        resolve: (ok) => {
          const idx = items.findIndex((i) => i.id === itemId)
          if (idx >= 0) items.splice(idx, 1)
          resolve(ok)
        },
      }))
      void scrollBottom()
    })
  }

  /** @param {string} text */
  async function copyText(text) {
    await navigator.clipboard.writeText(text).catch(() => {})
  }

  function relativeTime(/** @type {number} */ ts) {
    const diff = (Date.now() - ts) / 1000
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return new Date(ts).toLocaleDateString()
  }

  /** @param {KeyboardEvent} e */
  function handleGlobalKey(e) {
    if (!isActive) return
    // Escape closes fullscreen diagram
    if (e.key === 'Escape' && fullscreenDiagramCode) {
      e.preventDefault()
      closeDiagramFullscreen()
      return
    }
    const mod = e.ctrlKey || e.metaKey
    if (!mod || !e.shiftKey) return
    const key = e.key.toLowerCase()
    if (key === 'b') {
      e.preventDefault()
      toggleAiSidebar()
    } else if (key === 't') {
      e.preventDefault()
      void newConversation()
    }
  }

  // Reload conversation list when user connects to a different database
  let prevConnectionId = ''
  $effect(() => {
    const id = connectionId
    if (id === prevConnectionId) return
    prevConnectionId = id
    abortCurrentRequest()
    activeConvId = null
    items = []
    apiHistory = []
    rawApiHistory = []
    error = ''
    loadConvList()
  })

  onMount(() => {
    void tick().then(() => inputRef?.focus())
    document.addEventListener('keydown', handleGlobalKey)
    // Pre-warm schema cache so the first message doesn't pay the fetch cost
    if (schemaContext.tables?.length) void ensureFullSchemaCache()
  })

  onDestroy(() => {
    document.removeEventListener('keydown', handleGlobalKey)
    // Cancel any pending rAF handles to avoid callbacks on destroyed DOM
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
    if (_streamTimer !== null) { clearTimeout(_streamTimer); _streamTimer = null }
    if (historyTimer) { clearTimeout(historyTimer); historyTimer = null }
  })
</script>

<div class="flex h-full min-h-0 overflow-hidden bg-background">

      <!-- ── Conversation sidebar ───────────────────────────────────────── -->
      {#if sidebarVisible}
      <aside class="flex w-56 shrink-0 flex-col border-r border-border bg-panel">
        <div class="flex flex-col gap-2 border-b border-border px-2.5 py-2.5">
          <div class="flex items-center justify-between gap-2 px-0.5">
            <span class="text-ui-xs font-semibold text-foreground">Chats</span>
            <button
              type="button"
              class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
              title="Hide conversation list ({modKey}⇧B)"
              onclick={toggleAiSidebar}
            >
              <PanelLeft class="size-3.5" />
            </button>
          </div>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-md border border-border/80 bg-background px-2.5 py-2 text-left text-ui-xs text-foreground shadow-sm transition-colors hover:border-border hover:text-foreground"
            title="New chat ({newChatShortcut})"
            onclick={() => void newConversation()}
          >
            <Plus class="size-3.5 shrink-0 text-muted-foreground" />
            <span class="font-medium">New chat</span>
            <kbd class="ml-auto">{newChatShortcut}</kbd>
          </button>
        </div>

        <div class="app-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
          {#if isDraftChat}
            <button
              type="button"
              class={cn(
                'group/chat relative flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors',
                'bg-accent/45 ring-1 ring-border/60',
              )}
            >
              <MessageSquare class="mt-0.5 size-3.5 shrink-0 text-primary" />
              <div class="min-w-0 flex-1">
                <span class="block truncate text-ui-xs font-medium text-foreground">New chat</span>
                <span class="text-[10px] text-muted-foreground">Draft · unsaved</span>
              </div>
            </button>
          {/if}

          {#each convList as conv (conv.id)}
            <div class="group relative flex items-stretch">
              <button
                type="button"
                class={cn(
                  'relative flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-2 pr-8 text-left transition-colors hover:bg-accent/35',
                  activeConvId === conv.id
                    ? 'bg-accent/45 ring-1 ring-border/60'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onclick={() => void selectConversation(conv.id)}
                oncontextmenu={(e) => showContextMenu(conv.id, e)}
              >
                {#if activeConvId === conv.id}
                  <span
                    class="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-primary"
                    aria-hidden="true"
                  ></span>
                {/if}
                <MessageSquare
                  class={cn(
                    'mt-0.5 size-3.5 shrink-0',
                    activeConvId === conv.id ? 'text-primary' : 'text-muted-foreground/70',
                  )}
                />
                <div class="min-w-0 flex-1">
                  <span class="block truncate text-ui-xs font-medium leading-snug text-foreground">
                    {conv.title}
                  </span>
                  <span class="text-[10px] text-muted-foreground">{relativeTime(conv.updatedAt)}</span>
                </div>
              </button>
              <button
                type="button"
                class="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[opacity,color] hover:text-destructive group-hover:opacity-100"
                title="Delete conversation"
                onclick={(e) => { e.stopPropagation(); void removeConversation(conv.id) }}
              >
                <Trash2 class="size-3" />
              </button>
            </div>
          {/each}

          {#if convList.length === 0 && !isDraftChat}
            <div class="flex flex-col items-center gap-2 px-3 py-8 text-center">
              <MessageSquare class="size-7 text-muted-foreground/25" />
              <p class="text-[11px] leading-relaxed text-muted-foreground/70">
                No conversations yet
              </p>
              <p class="text-[10px] leading-relaxed text-muted-foreground/50">
                Chats save automatically as you message
              </p>
            </div>
          {/if}
        </div>
      </aside>
      {/if}

      <!-- ── Main chat area ─────────────────────────────────────────────── -->
      <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">

        <!-- Header -->
        <div class="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <button
            type="button"
            class={cn(
              'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground',
              !sidebarVisible && 'bg-accent/50 text-foreground',
            )}
            title={sidebarVisible ? `Hide chats (${modKey}⇧B)` : `Show chats (${modKey}⇧B)`}
            onclick={toggleAiSidebar}
          >
            <PanelLeft class="size-3.5" />
          </button>
          {#if !sidebarVisible}
            <button
              type="button"
              class="inline-flex h-6 items-center gap-1.5 rounded-md border border-border/80 bg-background px-2 text-ui-xs text-muted-foreground transition-colors hover:text-foreground"
              title="New chat ({newChatShortcut})"
              onclick={() => void newConversation()}
            >
              <Plus class="size-3" />
              New chat
            </button>
          {/if}
          <div class="flex items-center gap-1.5">
            <Sparkles class="size-3.5 shrink-0 text-primary" />
            <span class="text-ui-xs font-semibold">AI</span>
          </div>
          <div class="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              class={cn(
                'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                settingsOpen && 'bg-accent text-foreground',
              )}
              title="Model & settings"
              onclick={() => { settingsOpen = !settingsOpen; settingsTab = 'model' }}
            >
              <Settings2 class="size-3.5" />
            </button>
            {#if onexit}
              <button
                type="button"
                class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Close AI panel (⌘⇧E)"
                onclick={onexit}
              >
                <X class="size-3.5" />
              </button>
            {/if}
          </div>
        </div>

        <!-- Messages -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div bind:this={scrollEl} onscroll={onScrollAreaScroll} class="app-scroll min-h-0 flex-1 overflow-y-auto relative [will-change:transform] [overflow-anchor:none]"
          onclick={(e) => {
            const img = /** @type {HTMLElement} */ (e.target)?.closest?.('img')
            if (img instanceof HTMLImageElement && img.closest('.prose-ai')) {
              imageViewerSrc = img.src
            }
          }}
          role="region"
          aria-label="Chat messages"
        >
          <div class={mode === 'full' ? 'mx-auto w-full max-w-6xl px-4 py-6 min-h-full flex flex-col' : 'px-3 py-3'}>
          {#if items.length === 0}
            <!-- Empty state with suggestions -->
            <div class="flex h-full flex-col items-center justify-center {mode === 'full' ? 'gap-8 py-16' : 'gap-4 py-6'}">
              <div class="flex flex-col items-center {mode === 'full' ? 'gap-5' : 'gap-2'} text-center">
                {#if mode === 'full'}
                  <div class="relative flex size-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20 shadow-sm">
                    <Sparkles class="size-8 text-primary" />
                  </div>
                {:else}
                  <Sparkles class="size-7 text-muted-foreground/25" />
                {/if}
                <div>
                  <p class="{mode === 'full' ? 'text-xl font-semibold' : 'text-ui-sm font-medium text-muted-foreground'}">{mode === 'full' ? 'How can I help?' : 'Ask anything about your database'}</p>
                  {#if mode === 'full'}
                    <p class="mt-1.5 max-w-sm text-ui-sm text-muted-foreground">Query data, explore schema, generate reports, and visualize insights.</p>
                  {/if}
                  {#if schemaContext.activeTable}
                  <p class="{mode === 'full' ? 'mt-2 font-mono text-ui-xs text-muted-foreground/50' : 'text-ui-xs text-muted-foreground/60'}">
                    {schemaContext.activeSchema}/{schemaContext.activeTable}
                  </p>
                  {/if}
                </div>
              </div>

              {#if suggestions.length > 0}
                <div class="{mode === 'full' ? 'w-full max-w-lg' : 'w-full'}">
                  {#if mode !== 'full'}
                    <div class="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Zap class="size-3" />
                      <span>Suggestions</span>
                    </div>
                  {/if}
                  <div class="{mode === 'full' ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-1.5'}">
                    {#each (mode === 'full' ? suggestions.slice(0, 4) : suggestions) as s (s.label)}
                      {#if mode === 'full'}
                        <button
                          type="button"
                          class="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3.5 text-left text-ui-sm text-foreground shadow-sm transition-all hover:border-border hover:shadow-md disabled:opacity-40"
                          disabled={loading}
                          onclick={() => void send([s.prompt])}
                        >
                          <MessageSquare class="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" />
                          <span class="leading-snug">{s.label}</span>
                        </button>
                      {:else}
                        <button
                          type="button"
                          class="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-muted/30 px-3 text-xs text-foreground transition-colors hover:bg-accent hover:border-ring/40 disabled:opacity-40"
                          disabled={loading}
                          onclick={() => void send([s.prompt])}
                        >
                          <MessageSquare class="size-3 shrink-0 text-muted-foreground" />
                          {s.label}
                        </button>
                      {/if}
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {:else}
            <div class="flex flex-col gap-5" data-studio-selectable="text">
              {#each items as item (item.id)}

                {#if item.kind === 'user'}
                  <div class="flex justify-end">
                    <div class="max-w-[85%] rounded-2xl rounded-tr-md bg-primary px-3.5 py-2 text-ui leading-relaxed text-primary-foreground shadow-sm">
                      {item.text}
                    </div>
                  </div>

                {:else if item.kind === 'thinking'}
                  <div class="flex items-center gap-2.5 text-ui-xs text-muted-foreground">
                    <div class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Sparkles class="size-3 animate-pulse text-primary" />
                    </div>
                    {#if aiStatusHint}
                      <span class="animate-pulse">{aiStatusHint}</span>
                    {:else}
                      <span class="animate-pulse">Thinking…</span>
                    {/if}
                  </div>

                {:else if item.kind === 'streaming'}
                  <AiMarkdown content={displayStreamingContent} debounceMs={180} streaming />

                {:else if item.kind === 'assistant'}
                  <div class="flex flex-col gap-2">
                    {#each item.parts as part, pi}
                      {#if part.type === 'text'}
                        <AiMarkdown content={part.content} />
                      {:else if part.type === 'mermaid'}
                        <div class="mermaid-output overflow-hidden rounded-lg border border-border">
                          <div class="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/30 px-3 py-1.5">
                            <span class="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Diagram</span>
                            <div class="flex items-center gap-1">
                              <span class="hidden text-[10px] text-muted-foreground/40 sm:block mr-1">drag · Ctrl+scroll zoom</span>
                              <button type="button" class="inline-flex h-5 items-center gap-1 rounded px-1.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground" onclick={() => copyText(part.content)} title="Copy source">
                                <Copy class="size-2.5" />Source
                              </button>
                              <button type="button" class="inline-flex h-5 items-center gap-1 rounded px-1.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground" onclick={() => exportDiagramSvg(part.content)} title="Export SVG">
                                <Download class="size-2.5" />SVG
                              </button>
                              <button type="button" class="inline-flex h-5 items-center gap-1 rounded px-1.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground" onclick={() => void exportDiagramPng(part.content)} title="Export PNG">
                                <Download class="size-2.5" />PNG
                              </button>
                              <button type="button" class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground" onclick={() => openDiagramFullscreen(part.content)} title="Fullscreen">
                                <Maximize2 class="size-3" />
                              </button>
                            </div>
                          </div>
                          <div class="mermaid-canvas" use:mermaidInteractive>
                            {@html processMermaidSvg(part.content)}
                          </div>
                        </div>
                      {:else if part.type === 'sql'}
                        {@const sqlKey = `${item.id}-${pi}`}
                        {@const sqlOpen = sqlExpanded.has(sqlKey)}
                        <div class="overflow-hidden rounded-lg border border-border">
                          <div class="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/40 px-3 py-1.5">
                            <button
                              type="button"
                              class="flex items-center gap-1.5 text-ui-xs text-muted-foreground hover:text-foreground"
                              onclick={() => toggleSqlExpand(sqlKey)}
                            >
                              {#if sqlOpen}<ChevronDown class="size-3" />{:else}<ChevronRight class="size-3" />{/if}
                              <span class="font-mono">SQL</span>
                            </button>
                            <div class="flex items-center gap-1">
                              <button type="button" class="inline-flex h-6 items-center gap-1 rounded px-2 text-ui-xs text-muted-foreground hover:bg-accent hover:text-foreground" onclick={() => copyText(part.content)}>
                                <Copy class="size-3" />Copy
                              </button>
                              <button type="button" class="inline-flex h-6 items-center gap-1 rounded px-2 text-ui-xs text-muted-foreground hover:bg-accent hover:text-foreground" onclick={() => onwritesql(part.content)}>
                                <PenLine class="size-3" />Write
                              </button>
                              <button type="button" class="inline-flex h-6 items-center gap-1 rounded bg-primary px-2 text-ui-xs text-primary-foreground hover:opacity-90 disabled:opacity-50" disabled={loading} onclick={() => void runSqlBlock(part.content)}>
                                <Play class="size-3" />Run
                              </button>
                            </div>
                          </div>
                          <AiSqlBlock sql={part.content} open={sqlOpen} />
                        </div>
                      {:else if part.type === 'error'}
                        <div class="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-ui-xs text-destructive">
                          <AlertTriangle class="mt-0.5 size-3.5 shrink-0" />
                          <span>{part.content}</span>
                        </div>
                      {:else if part.type === 'confirm_prompt'}
                        <div class="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 text-ui-xs text-amber-600 dark:text-amber-400">
                          <AlertTriangle class="mt-0.5 size-3.5 shrink-0" />
                          <span>{part.content}</span>
                        </div>
                      {:else}
                        {@const codeKey = `${item.id}-${pi}`}
                        {@const codeOpen = !collapsed.has(codeKey)}
                        <div class="overflow-hidden rounded-lg border border-border">
                          <div class="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/40 px-3 py-1.5">
                            <button
                              type="button"
                              class="flex items-center gap-1.5 text-ui-xs text-muted-foreground hover:text-foreground"
                              onclick={() => toggleCollapse(codeKey)}
                            >
                              {#if codeOpen}<ChevronDown class="size-3" />{:else}<ChevronRight class="size-3" />{/if}
                              <span class="font-mono">{part.lang || 'code'}</span>
                            </button>
                            <button type="button" class="inline-flex h-6 items-center gap-1 rounded px-2 text-ui-xs text-muted-foreground hover:bg-accent hover:text-foreground" onclick={() => copyText(part.content)}>
                              <Copy class="size-3" />Copy
                            </button>
                          </div>
                          {#if codeOpen}
                            <div class="border-t border-border/50 bg-muted/15">
                              <ShikiBlock code={part.content} lang={part.lang || 'plaintext'} embedded />
                            </div>
                          {/if}
                        </div>
                      {/if}
                    {/each}
                  </div>

                {:else if item.kind === 'executing'}
                  <div class="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-ui-xs text-muted-foreground">
                    <Loader2 class="size-3.5 shrink-0 animate-spin text-primary/70" />
                    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span class="font-medium text-foreground/60">Executing</span>
                      <span class="truncate font-mono text-[10px] text-muted-foreground/60">{item.sql}</span>
                    </div>
                  </div>

                {:else if item.kind === 'result'}
                  {@const resOpen = openResultId === item.id}
                  <div class={cn(
                    'overflow-hidden rounded-xl border text-ui-xs',
                    item.error ? 'border-destructive/40 bg-destructive/5' : 'border-border/70',
                    item.isSchema && 'border-primary/25',
                  )}>
                    <div
                      class={cn(
                        'group/res flex w-full items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/20',
                        item.error ? 'bg-destructive/8'
                          : item.isSchema ? 'bg-primary/6'
                          : 'bg-muted/20',
                        resOpen && 'border-b border-border/40',
                      )}
                    >
                      <button
                        type="button"
                        class="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onclick={() => toggleResult(item.id)}
                      >
                        {#if resOpen}<ChevronDown class="size-3 shrink-0 text-muted-foreground/60" />{:else}<ChevronRight class="size-3 shrink-0 text-muted-foreground/60" />{/if}
                        <Table2 class={cn('size-3 shrink-0', item.isSchema ? 'text-primary/60' : 'text-muted-foreground/60')} />
                        <span class="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground/70">{item.sql || 'Query'}</span>
                      </button>
                      {#if item.sql}
                        <button type="button" class="hidden size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors group-hover/res:inline-flex hover:bg-accent hover:text-foreground" title="Copy SQL" onclick={() => copyText(item.sql)}>
                          <Copy class="size-3" />
                        </button>
                        <button type="button" class="hidden size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors group-hover/res:inline-flex hover:bg-accent hover:text-foreground" title="Write to editor" onclick={() => onwritesql(item.sql)}>
                          <PenLine class="size-3" />
                        </button>
                      {/if}
                      {#if !item.error}
                        <span class="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-muted-foreground">
                          {formatCompactCount(item.total)} {item.total === 1 ? 'row' : 'rows'}
                        </span>
                      {/if}
                    </div>
                    {#if resOpen}
                      {#if item.error}
                        <div class="flex items-start gap-2 px-3 py-2.5">
                          <AlertTriangle class="mt-0.5 size-3.5 shrink-0 text-destructive" />
                          <p class="font-mono text-[11px] leading-relaxed text-destructive">{item.error}</p>
                        </div>
                      {:else if item.rows.length === 0}
                        <p class="px-3 py-3 text-center text-ui-xs italic text-muted-foreground/60">No rows returned.</p>
                      {:else}
                        <div class="overflow-x-auto">
                          <DataTable
                            columns={item.columns}
                            rows={item.rows.slice(0, 15)}
                            embedded
                            showSelection={false}
                          />
                        </div>
                        {#if item.total > 15}
                          <p class="border-t border-border/20 px-3 py-1.5 text-[10px] text-muted-foreground/50">
                            Showing 15 of {formatCompactCount(item.total)} rows{item.capped ? ` (limited to ${AI_ROW_LIMIT})` : ''}
                          </p>
                        {/if}
                      {/if}
                    {/if}
                  </div>

                {:else if item.kind === 'confirm'}
                  <div class="overflow-hidden rounded-lg border border-destructive/40 bg-destructive/5">
                    <div class="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2">
                      <AlertTriangle class="size-3.5 shrink-0 text-destructive" />
                      <span class="text-ui-xs font-medium text-destructive">Confirm destructive operation</span>
                    </div>
                    <pre class="px-3 py-2 font-mono text-ui-xs text-foreground whitespace-pre-wrap">{item.sql}</pre>
                    <div class="flex items-center justify-between gap-2 border-t border-destructive/20 px-3 py-2">
                      <p class="text-ui-xs text-muted-foreground">This cannot be undone.</p>
                      <div class="flex gap-2">
                        <button type="button" class="inline-flex h-7 items-center rounded-md border border-border px-3 text-ui-xs text-muted-foreground hover:bg-accent" onclick={() => item.resolve(false)}>Cancel</button>
                        <button type="button" class="inline-flex h-7 items-center rounded-md bg-destructive px-3 text-ui-xs font-medium text-destructive-foreground hover:opacity-90" onclick={() => item.resolve(true)}>Execute</button>
                      </div>
                    </div>
                  </div>

                {:else if item.kind === 'chart'}
                  <div class="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                    {#if item.error}
                      <div class="flex items-center gap-2 px-4 py-3 text-ui-sm text-destructive">
                        <AlertTriangle class="size-4 shrink-0" />
                        {item.error}
                      </div>
                    {:else}
                      <div class="border-b border-border/50 bg-muted/30 px-4 py-2 flex items-center gap-2">
                        <span class="text-ui-xs font-semibold text-muted-foreground uppercase tracking-wide">{item.spec.title || 'Chart'}</span>
                        <span class="ml-auto text-ui-xs text-muted-foreground/50 capitalize">{item.spec.type} chart</span>
                      </div>
                      <div class="p-4">
                        <AiChartRenderer spec={item.spec} />
                      </div>
                    {/if}
                  </div>
                {/if}

              {/each}

              {#if showWorking}
                <div class="flex items-center gap-2.5 text-ui-xs text-muted-foreground">
                  <Loader2 class="size-3.5 shrink-0 animate-spin text-primary/70" />
                  <span class="animate-pulse">{aiStatusHint || 'Working…'}</span>
                </div>
              {/if}
            </div>
          {/if}
          </div>

        </div>

        <!-- Error bar -->
        {#if error}
          <div class="shrink-0 border-t border-destructive/30 bg-destructive/8 px-3 py-2 text-ui-xs text-destructive">{error}</div>
        {/if}

        <!-- Jump-to-bottom button: shown whenever user has scrolled away from bottom -->
        {#if userScrolledUp}
          <div class="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center">
            <button
              type="button"
              onclick={jumpToBottom}
              class="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-ui-xs font-medium text-foreground shadow-lg transition-all hover:bg-accent"
            >
              <ChevronDown class="size-3.5" />Jump to bottom
            </button>
          </div>
        {/if}

        <!-- Input -->
        <div class="shrink-0 {mode === 'full' ? 'px-6 pb-8 pt-2' : 'px-3 pb-4 pt-2'}">
          <div class="{mode === 'full' ? 'mx-auto w-full max-w-2xl' : ''}">
            <!-- Pill input -->
            <div class={cn(
              'flex items-end gap-2 rounded-full border px-3 py-2 transition-all duration-150',
              mode === 'full' ? 'shadow-lg shadow-black/8' : 'shadow-sm',
              hasPendingConfirm
                ? 'border-border/50 opacity-60'
                : error
                  ? 'border-destructive/50 focus-within:border-destructive/70'
                  : 'border-border/60 focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/10',
            )}>
              <!-- + / context button -->
              <button
                type="button"
                class="mb-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
                onclick={() => { settingsOpen = true; settingsTab = 'context' }}
                title="Context & settings"
              >
                <Plus class="size-4" />
              </button>

              <!-- Textarea -->
              <textarea
                bind:this={inputRef}
                class="min-h-[32px] flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/40 disabled:cursor-not-allowed"
                style="height:auto;max-height:180px;overflow-y:auto"
                placeholder={hasPendingConfirm ? 'Confirm or cancel the operation above…' : 'What do you want to know?'}
                rows={1}
                value={inputText}
                oninput={(e) => { inputText = /** @type {HTMLTextAreaElement} */ (e.target).value; resizeInput(); pushHistory(inputText) }}
                onkeydown={handleKeydown}
                disabled={hasPendingConfirm}
              ></textarea>

              <!-- Model picker -->
              <AiModelPicker onopenSettings={onopenmodelsettings} />

              <!-- Send / Stop button -->
              {#if loading}
                <button
                  type="button"
                  class="mb-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground/70 shadow-sm transition-colors hover:border-ring/60 hover:text-foreground active:scale-95"
                  onclick={stop}
                  aria-label="Stop"
                  title="Stop (Esc)"
                >
                  <Square class="size-3 fill-current" />
                </button>
              {:else}
                <button
                  type="button"
                  class={cn(
                    'mb-0.5 flex size-8 shrink-0 items-center justify-center rounded-full transition-all active:scale-95',
                    inputText.trim() && !hasPendingConfirm
                      ? 'bg-foreground text-background shadow-sm hover:opacity-85'
                      : 'bg-muted/50 text-muted-foreground/25 cursor-not-allowed',
                  )}
                  disabled={hasPendingConfirm || !inputText.trim()}
                  onclick={() => void send()}
                  aria-label="Send"
                >
                  <Send class="size-3.5" />
                </button>
              {/if}
            </div>

            <!-- Hint + context info row -->
            <div class="mt-1.5 flex items-center justify-between px-3">
              <p class="text-[10px] text-muted-foreground/30">
                {#if hasPendingConfirm}
                  Confirm or cancel above
                {:else}
                  ↵ send · ⇧↵ newline
                {/if}
              </p>
              {#if contextStats.messages > 0}
                <button
                  type="button"
                  class="inline-flex items-center gap-1 text-[10px] text-muted-foreground/30 transition-colors hover:text-muted-foreground/60 select-none"
                  onclick={() => { settingsOpen = true; settingsTab = 'context' }}
                  title="Context usage"
                >
                  <BarChart2 class="size-2.5" />
                  {tokEst(contextStats.totalChars)}
                  {#if contextStats.pct >= 70}
                    <span class={contextStats.pct >= 90 ? 'text-destructive/60' : 'text-amber-500/60'}>· {contextStats.pct}%</span>
                  {/if}
                </button>
              {/if}
            </div>
          </div>
        </div>

      </div>

      <!-- ── Right settings panel ─────────────────────────────────────── -->
      {#if settingsOpen}
        <aside class="flex w-72 shrink-0 flex-col border-l border-border bg-panel">
          <!-- Panel header with tabs -->
          <div class="flex shrink-0 items-center gap-0.5 border-b border-border px-2 py-2">
            {#each [{ id: 'model', label: 'Model' }, { id: 'skills', label: 'Skills' }, { id: 'context', label: 'Context' }] as tab (tab.id)}
              <button
                type="button"
                class={cn(
                  'flex-1 rounded-md py-1 text-center text-ui-xs font-medium transition-colors',
                  settingsTab === tab.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onclick={() => (settingsTab = /** @type {'model'|'skills'|'context'} */ (tab.id))}
              >
                {tab.label}{tab.id === 'skills' && skills.length ? ` (${skills.length})` : ''}
              </button>
            {/each}
            <button
              type="button"
              class="ml-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onclick={() => (settingsOpen = false)}
            >
              <X class="size-3.5" />
            </button>
          </div>

          <!-- Panel content (scrollable) -->
          <div class="app-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">

            <!-- ── Model tab ── -->
            {#if settingsTab === 'model'}
              <div class="flex flex-col gap-3 p-3">

                <!-- Status badge: not configured -->
                {#if !settings.apiKey && !settings.baseUrl.includes('localhost')}
                  <div class="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2.5">
                    <AlertTriangle class="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                    <p class="text-ui-xs text-amber-600 dark:text-amber-400">No model configured yet.</p>
                  </div>
                {/if}

                <!-- Current model summary -->
                <div class="flex flex-col gap-2 rounded-lg border border-border/70 bg-background p-3">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">Profile</span>
                    <span class="min-w-0 truncate text-ui-xs font-medium text-foreground">{($aiProfiles.find((p) => p.id === $activeProfileId) ?? $aiProfiles[0])?.name ?? '—'}</span>
                  </div>
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">Model</span>
                    <span class="min-w-0 truncate font-mono text-ui-xs text-foreground">{settings.model}</span>
                  </div>
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">Endpoint</span>
                    <span class="min-w-0 truncate font-mono text-[10px] text-muted-foreground">{settings.baseUrl}</span>
                  </div>
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">API key</span>
                    <span class="font-mono text-[10px] text-muted-foreground">{settings.apiKey ? '•••• set' : 'none'}</span>
                  </div>
                </div>

                <Button class="h-8 w-full text-ui-xs" onclick={onopenmodelsettings}>Configure model…</Button>
                <p class="px-0.5 text-[10px] leading-relaxed text-muted-foreground/70">
                  Shared with the AI sidebar (⌘I).
                </p>
              </div>

            <!-- ── Skills tab ── -->
            {:else if settingsTab === 'skills'}
              <div class="flex flex-col gap-3 p-3">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-ui-xs text-muted-foreground">Skills inject domain knowledge into every AI request.</p>
                  <div class="flex items-center gap-1">
                    <label class="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-2 text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                      <Upload class="size-3" />
                      Upload
                      <input type="file" accept=".md,text/markdown,text/plain" multiple class="sr-only" onchange={handleSkillFileUpload} />
                    </label>
                    <button
                      type="button"
                      class="inline-flex h-7 items-center gap-1 rounded-md border border-primary/30 bg-primary/8 px-2 text-ui-xs text-primary transition-colors hover:bg-primary/15"
                      onclick={() => (newSkillOpen = !newSkillOpen)}
                    >
                      <Plus class="size-3" />
                      Create
                    </button>
                  </div>
                </div>

                {#if newSkillOpen}
                  <div class="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
                    <p class="text-ui-xs font-medium">New skill</p>
                    <div class="flex flex-col gap-1.5">
                      <label for="skill-name" class="text-[10px] text-muted-foreground">Name *</label>
                      <Input id="skill-name" class="h-7 text-ui-xs" placeholder="e.g. postgres-best-practices" bind:value={newSkillName} />
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label for="skill-desc" class="text-[10px] text-muted-foreground">Description</label>
                      <Input id="skill-desc" class="h-7 text-ui-xs" placeholder="When to apply this skill" bind:value={newSkillDesc} />
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <label for="skill-content" class="text-[10px] text-muted-foreground">Content (Markdown) *</label>
                      <textarea
                        id="skill-content"
                        class="min-h-[100px] w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 font-mono text-ui-xs leading-relaxed text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/20 placeholder:text-muted-foreground/50"
                        placeholder="# My Skill&#10;&#10;Write rules, patterns, and guidelines in Markdown..."
                        bind:value={newSkillContent}
                      ></textarea>
                    </div>
                    <div class="flex justify-end gap-2">
                      <button type="button" class="inline-flex h-7 items-center rounded-md border border-border px-3 text-ui-xs text-muted-foreground hover:bg-accent" onclick={() => (newSkillOpen = false)}>Cancel</button>
                      <Button size="sm" class="h-7 px-3 text-ui-xs" disabled={!newSkillName.trim() || !newSkillContent.trim()} onclick={createSkill}>Save</Button>
                    </div>
                  </div>
                {/if}

                <!-- Built-in skills pills -->
                <div class="flex flex-col gap-1">
                  <p class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">Built-in (always on)</p>
                  <div class="flex flex-wrap gap-1">
                    {#each ['PostgreSQL', 'MySQL', 'SQLite', 'Mermaid'] as b}
                      <span class="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                        <span class="size-1.5 rounded-full bg-primary/50"></span>{b}
                      </span>
                    {/each}
                  </div>
                </div>

                {#if skills.length === 0}
                  <div class="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border py-6 text-center">
                    <BookOpen class="size-6 text-muted-foreground/30" />
                    <p class="text-ui-xs text-muted-foreground/60">No custom skills yet</p>
                  </div>
                {:else}
                  <div class="flex flex-col gap-1.5">
                    <p class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">Custom ({skills.length})</p>
                    {#each skills as skill (skill.id)}
                      <div class="flex items-start gap-2 rounded-lg border border-border/60 bg-background p-2.5">
                        <BookOpen class="mt-0.5 size-3.5 shrink-0 text-primary/60" />
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-ui-xs font-medium">{skill.name}</p>
                          {#if skill.description}
                            <p class="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{skill.description}</p>
                          {/if}
                        </div>
                        <button
                          type="button"
                          class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive"
                          onclick={() => removeSkill(skill.id)}
                          title="Remove skill"
                        >
                          <X class="size-3" />
                        </button>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>

            <!-- ── Context tab ── -->
            {:else}
              <div class="flex flex-col gap-4 p-3">

                <!-- Token gauge -->
                <div class="flex flex-col gap-2">
                  <div class="flex items-center justify-between">
                    <span class="text-ui-xs font-medium">Context window</span>
                    <span class="font-mono text-[10px] text-muted-foreground">{tokEst(contextStats.totalChars)} / {tokEst(contextStats.maxChars)} tok</span>
                  </div>
                  <div class="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      class={cn('h-full rounded-full transition-all duration-500',
                        contextStats.pct >= 90 ? 'bg-destructive' : contextStats.pct >= 70 ? 'bg-amber-500' : 'bg-primary')}
                      style="width: {contextStats.pct}%"
                    ></div>
                  </div>
                  <p class="text-[10px] text-muted-foreground/60">{contextStats.pct}% used · auto-compresses at 30k tokens (keeps last 10 turns)</p>
                </div>

                <!-- Stats grid -->
                <div class="grid grid-cols-2 gap-2">
                  {#each [
                    { label: 'Turns', value: String(contextStats.messages) },
                    { label: 'History', value: tokEst(contextStats.historyChars) + ' tok' },
                    { label: 'System', value: tokEst(contextStats.promptChars) + ' tok' },
                    { label: 'Total', value: tokEst(contextStats.totalChars) + ' tok' },
                  ] as stat}
                    <div class="flex flex-col gap-0.5 rounded-lg border border-border/50 bg-background px-2.5 py-2">
                      <span class="font-mono text-sm font-semibold tabular-nums text-foreground">{stat.value}</span>
                      <span class="text-[10px] text-muted-foreground">{stat.label}</span>
                    </div>
                  {/each}
                </div>

                <!-- How it works -->
                <div class="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
                  <p class="mb-2 text-ui-xs font-medium">How it works</p>
                  <ul class="space-y-1.5 text-[11px] text-muted-foreground">
                    <li class="flex items-start gap-1.5"><span class="mt-1 size-1.5 shrink-0 rounded-full bg-primary/60"></span>History re-sent to AI on each turn — keeps full conversation context.</li>
                    <li class="flex items-start gap-1.5"><span class="mt-1 size-1.5 shrink-0 rounded-full bg-primary/60"></span>At 30k tokens, old messages are summarised into a memory block (keeps last 10 turns).</li>
                    <li class="flex items-start gap-1.5"><span class="mt-1 size-1.5 shrink-0 rounded-full bg-primary/60"></span>Only schema for tables you mention is injected (selective).</li>
                    <li class="flex items-start gap-1.5"><span class="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500/70"></span>Failed tool calls blocked after 2 retries per turn.</li>
                  </ul>
                </div>

                <button
                  type="button"
                  class="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-destructive/30 text-ui-xs text-destructive transition-colors hover:bg-destructive/8 hover:border-destructive/50"
                  onclick={() => { apiHistory = []; rawApiHistory = []; fetchedSchemas = {}; error = '' }}
                >
                  <Trash2 class="size-3.5" />
                  Clear history & schema cache
                </button>
              </div>
            {/if}

          </div>
        </aside>
      {/if}

    <!-- ── Right-click context menu ─────────────────────────────────────── -->
    {#if contextMenu}
      {@const menu = contextMenu}
      <!-- invisible backdrop to close on outside click -->
      <div
        role="presentation"
        class="fixed inset-0 z-[200]"
        onclick={closeContextMenu}
        oncontextmenu={closeContextMenu}
      ></div>
      <div
        class="fixed z-[201] min-w-[10rem] overflow-hidden rounded-md border border-border bg-popover py-1 shadow-lg"
        style="left:{menu.x}px;top:{menu.y}px"
      >
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent"
          onclick={() => { void selectConversation(menu.id); closeContextMenu() }}
        >
          Open
        </button>
        <div class="my-1 h-px bg-border"></div>
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
          onclick={() => void removeConversation(menu.id)}
        >
          <Trash2 class="size-3" /> Delete
        </button>
      </div>
    {/if}
</div>

<!-- ── Image viewer ──────────────────────────────────────────────────────── -->
{#if imageViewerSrc}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md"
    onclick={() => (imageViewerSrc = null)}
    onkeydown={(e) => e.key === 'Escape' && (imageViewerSrc = null)}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="relative flex flex-col items-center gap-3" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="presentation">
      <img
        src={imageViewerSrc}
        alt="Preview"
        class="max-h-[80vh] max-w-[90vw] rounded-xl border border-border/40 object-contain shadow-2xl"
      />
      <div class="flex items-center gap-2">
        <a
          href={imageViewerSrc}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm transition-colors hover:border-border hover:text-foreground"
          onclick={(e) => e.stopPropagation()}
        >
          <ZoomIn class="size-3" /> Open full size
        </a>
        <button
          class="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm transition-colors hover:border-border hover:text-foreground"
          onclick={() => (imageViewerSrc = null)}
        >
          <X class="size-3" /> Close
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── Diagram fullscreen modal ──────────────────────────────────────────── -->
{#if fullscreenDiagramCode}
  <!-- Backdrop -->
  <div
    role="dialog"
    aria-modal="true"
    aria-label="Diagram fullscreen"
    class="fixed inset-0 z-[500] flex flex-col bg-background/95 backdrop-blur-sm"
  >
    <!-- Header toolbar -->
    <div class="flex shrink-0 items-center gap-2 border-b border-border bg-background/80 px-4 py-2">
      <span class="text-ui-xs font-medium text-muted-foreground">Diagram</span>
      <div class="ml-auto flex items-center gap-1">
        <!-- Zoom controls -->
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-ui-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          onclick={() => dispatchDiagramEvent('diagram:zoomout')}
          title="Zoom out"
        >
          <ZoomOut class="size-3" />
        </button>
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-ui-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          onclick={() => dispatchDiagramEvent('diagram:reset')}
          title="Reset zoom (double-click canvas)"
        >
          <RotateCcw class="size-3" />Reset
        </button>
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-ui-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          onclick={() => dispatchDiagramEvent('diagram:zoomin')}
          title="Zoom in"
        >
          <ZoomIn class="size-3" />
        </button>
        <div class="mx-1 h-4 w-px bg-border"></div>
        <!-- Export -->
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-ui-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          onclick={() => exportDiagramSvg(fullscreenDiagramCode ?? '')}
          title="Export as SVG"
        >
          <Download class="size-3" />SVG
        </button>
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-ui-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          onclick={() => void exportDiagramPng(fullscreenDiagramCode ?? '')}
          title="Export as PNG"
        >
          <Download class="size-3" />PNG
        </button>
        <div class="mx-1 h-4 w-px bg-border"></div>
        <!-- Close -->
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-ui-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          onclick={closeDiagramFullscreen}
          title="Close (Esc)"
        >
          <Minimize2 class="size-3" />Exit
        </button>
      </div>
    </div>
    <!-- Canvas fills remaining height -->
    <div class="min-h-0 flex-1 overflow-hidden">
      <div
        bind:this={fullscreenCanvasEl}
        class="mermaid-canvas h-full w-full"
        use:mermaidInteractive
      >
        {@html processMermaidSvg(fullscreenDiagramCode)}
      </div>
    </div>
    <p class="shrink-0 border-t border-border/40 px-4 py-1.5 text-center text-[10px] text-muted-foreground/40">
      Drag to pan · Ctrl+scroll to zoom · Double-click to reset
    </p>
  </div>
{/if}

<style>
  :global(.prose-ai) {
    font-family: "Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, ui-sans-serif, sans-serif;
    font-size: 0.9375rem;
    line-height: 1.6;
    color: var(--foreground);
    word-break: break-word;
    font-optical-sizing: auto;
    letter-spacing: -0.014em;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  :global(.prose-ai > *:first-child) { margin-top: 0; }
  :global(.prose-ai > *:last-child) { margin-bottom: 0; }
  :global(.prose-ai p) { margin: 0.4rem 0; }
  :global(.prose-ai strong) { font-weight: 600; }
  :global(.prose-ai em) { font-style: italic; }
  :global(.prose-ai h1, .prose-ai h2, .prose-ai h3, .prose-ai h4) {
    font-weight: 650;
    line-height: 1.3;
    margin: 0.85rem 0 0.3rem;
    color: var(--foreground);
  }
  :global(.prose-ai h1) { font-size: 1.2rem; }
  :global(.prose-ai h2) { font-size: 1.1rem; }
  :global(.prose-ai h3) { font-size: 1rem; }
  :global(.prose-ai ul) { padding-left: 1.35rem; list-style-type: disc; margin: 0.4rem 0; }
  :global(.prose-ai ol) { padding-left: 1.35rem; list-style-type: decimal; margin: 0.4rem 0; }
  :global(.prose-ai li) { margin: 0.2rem 0; }
  :global(.prose-ai code) {
    font-family: ui-monospace, 'Geist Mono', monospace;
    font-size: 0.85em;
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0.1em 0.35em;
  }
  :global(.prose-ai pre:not(.shiki)) {
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem;
    overflow-x: auto;
    margin: 0.5rem 0;
  }
  :global(.prose-ai pre:not(.shiki) code) {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.825rem;
  }
  :global(.prose-ai pre.shiki) {
    margin: 0.5rem 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow-x: auto;
    background: var(--editor-surface) !important;
  }
  :global(.prose-ai pre.shiki code) {
    font-family: ui-monospace, 'Geist Mono', monospace;
    font-size: 0.825rem;
    line-height: 1.6;
  }
  :global(.prose-ai-loading pre.shiki) {
    opacity: 0.7;
  }
  :global(.prose-ai table) {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.875rem;
    margin: 0.5rem 0;
  }
  :global(.prose-ai th) {
    border: 1px solid var(--border);
    padding: 0.35rem 0.75rem;
    background: var(--muted);
    font-weight: 600;
    text-align: left;
    color: var(--muted-foreground);
  }
  :global(.prose-ai td) {
    border: 1px solid var(--border);
    padding: 0.3rem 0.75rem;
    font-family: ui-monospace, 'Geist Mono', monospace;
    font-size: 0.8125rem;
  }
  :global(.prose-ai tr:nth-child(even) td) { background: color-mix(in oklch, var(--muted) 40%, transparent); }
  :global(.prose-ai blockquote) {
    border-left: 2px solid var(--border);
    padding-left: 0.75rem;
    color: var(--muted-foreground);
    margin: 0.35rem 0;
  }
  :global(.prose-ai a) {
    color: var(--link);
    text-decoration: underline;
    text-underline-offset: 2px;
    text-decoration-color: color-mix(in oklch, var(--link) 45%, transparent);
  }
  :global(.prose-ai a:hover) {
    color: var(--link-hover);
    text-decoration-color: var(--link);
  }
  :global(.prose-ai hr) { border: none; border-top: 1px solid var(--border); margin: 0.75rem 0; }

  :global(.mermaid-canvas) {
    cursor: grab;
    overflow: hidden;
    position: relative;
    padding: 1rem;
    /* background is set directly by the mermaidInteractive action */
    background: #ffffff;
    /* Block app :root tokens that collide with beautiful-mermaid variable names */
    --muted: unset;
    --accent: unset;
    --border: unset;
  }
  :global(.mermaid-canvas.is-dragging) { cursor: grabbing; }

  /* ── Inline images in AI responses ─────────────────────────────────────── */
  :global(.prose-ai img) {
    display: inline-block;
    max-width: min(100%, 320px);
    max-height: 200px;
    object-fit: cover;
    border-radius: 10px;
    border: 1px solid var(--border);
    cursor: zoom-in;
    margin: 0.25rem 0;
    transition: opacity 0.15s, box-shadow 0.15s;
    vertical-align: middle;
  }
  :global(.prose-ai img:hover) {
    opacity: 0.9;
    box-shadow: 0 4px 16px hsl(var(--foreground) / 0.12);
  }

  :global(.mermaid-canvas svg) {
    display: block;
    /* Respect the SVG's natural size; shrink only if wider than the container */
    max-width: 100%;
    width: auto;
    height: auto;
    transform-origin: 0 0;
    user-select: none;
    -webkit-user-select: none;
  }
</style>
