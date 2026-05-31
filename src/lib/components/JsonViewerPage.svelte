<script>
  import { onMount, tick, untrack } from 'svelte'
  import * as monaco from 'monaco-editor'
  import { configureMonacoWorkers } from '$lib/monaco-env.js'
  import { defineDbStudioMonacoThemes, monacoThemeId, readEditorFontOptions } from '$lib/monaco-themes.js'
  import { normalizeThemeId } from '$lib/themes/registry.js'
  import ResizeHandle from './ResizeHandle.svelte'
  import { loadLayout, saveLayout } from '$lib/stores/layout.js'
  import Copy from '@lucide/svelte/icons/copy'
  import CheckCheck from '@lucide/svelte/icons/check-check'
  import Braces from '@lucide/svelte/icons/braces'
  import Wand2 from '@lucide/svelte/icons/wand-2'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import { evalJsonPath, getCompletionItems, applyCompletion, describeResult } from '$lib/jsonpath.js'

  let { active = false } = $props()

  // ── Layout ────────────────────────────────────────────────────────────────
  const PANEL_MIN = 100
  const stored = loadLayout()
  let inputHeight = $state(untrack(() => Math.max(PANEL_MIN, Math.min(stored.sqlEditorHeight ?? 320, 520))))
  let resizeStart = $state(0)
  /** @type {HTMLElement | null} */
  let pageEl = $state(null)

  function clampHeight(h) {
    const total = pageEl?.clientHeight ?? 0
    const max = total > 0 ? Math.max(PANEL_MIN, total - PANEL_MIN - 32) : 600
    return Math.round(Math.min(max, Math.max(PANEL_MIN, h)))
  }

  // ── Editors ───────────────────────────────────────────────────────────────
  /** @type {HTMLElement | null} */  let inputContainer  = $state(null)
  /** @type {HTMLElement | null} */  let resultContainer = $state(null)
  /** @type {monaco.editor.IStandaloneCodeEditor | null} */  let inputEditor  = null
  /** @type {monaco.editor.IStandaloneCodeEditor | null} */  let resultEditor = null
  let editorsReady = $state(false)

  // ── Raw JSON: split into "immediate" (for header) + "debounced" (for parse).
  //    JSON.parse() on every keystroke for large documents is the main CPU hog.
  let rawJson          = $state('')   // updated immediately — drives header
  let rawJsonDebounced = $state('')   // updated 250ms after typing stops
  /** @type {ReturnType<typeof setTimeout> | null} */
  let parseDebounceTimer = null

  // ── JSONPath ──────────────────────────────────────────────────────────────
  let jsonPath    = $state('')
  let pathFocused = $state(false)
  let activeIdx   = $state(-1)
  /** @type {HTMLInputElement | null} */
  let pathInput = $state(null)
  let copied      = $state(false)
  let copiedInput = $state(false)
  /** @type {ReturnType<typeof setTimeout> | null} */
  let copiedTimer = null
  /** @type {ReturnType<typeof setTimeout> | null} */
  let copiedInputTimer = null

  // ── Derived — use debounced JSON so parse runs at most once per 250ms ─────
  const parsedJson = $derived.by(() => {
    try { return JSON.parse(rawJsonDebounced) } catch { return null }
  })

  const pathResult = $derived.by(() => {
    const p = jsonPath.trim()
    if (!p || p === '$') return null
    if (parsedJson === null) return null
    return evalJsonPath(parsedJson, p.startsWith('$') ? p : '$' + p)
  })

  const resultJson = $derived.by(() => {
    if (!pathResult?.ok) return null
    return JSON.stringify(pathResult.value, null, 2)
  })

  /** @type {import('$lib/jsonpath.js').CompletionItem[]} */
  const completionItems = $derived.by(() => {
    if (!pathFocused || parsedJson === null) return []
    return getCompletionItems(parsedJson, jsonPath).slice(0, 10)
  })

  const inputSummary = $derived.by(() => {
    if (!rawJson.trim()) return null
    if (parsedJson === null) return rawJson.trim() ? 'invalid JSON' : null
    if (Array.isArray(parsedJson)) return `${parsedJson.length} ${parsedJson.length === 1 ? 'item' : 'items'}`
    if (typeof parsedJson === 'object' && parsedJson !== null) return `${Object.keys(parsedJson).length} keys`
    return typeof parsedJson
  })

  // ── Effects ───────────────────────────────────────────────────────────────

  $effect(() => {
    if (!pathFocused || completionItems.length === 0) activeIdx = -1
  })

  // Track resultJson BEFORE the guard — Svelte only registers deps that are
  // read during execution. Reading after an early-return skips registration.
  $effect(() => {
    const content = resultJson
    if (!editorsReady || !resultEditor) return
    const next = content ?? ''
    if (resultEditor.getValue() !== next) resultEditor.setValue(next)
  })

  $effect(() => {
    if (active && inputEditor && !rawJson.trim()) {
      void tick().then(() => inputEditor?.focus())
    }
  })

  // ── Completion helpers ────────────────────────────────────────────────────

  /** @param {import('$lib/jsonpath.js').CompletionItem} item */
  function pickCompletion(item) {
    jsonPath = applyCompletion(jsonPath, item.insert)
    activeIdx = -1
    pathInput?.focus()
  }

  /** @param {KeyboardEvent} e */
  function handlePathKeydown(e) {
    if (completionItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        activeIdx = (activeIdx + 1) % completionItems.length
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        activeIdx = (activeIdx - 1 + completionItems.length) % completionItems.length
        return
      }
      // Tab: accept first item if nothing selected, else accept selected
      if (e.key === 'Tab') {
        e.preventDefault()
        pickCompletion(completionItems[activeIdx >= 0 ? activeIdx : 0])
        return
      }
      // Enter: only accept if a row is explicitly highlighted
      if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault()
        pickCompletion(completionItems[activeIdx])
        return
      }
    }
    if (e.key === 'Escape') {
      activeIdx = -1
      pathFocused = false
      pathInput?.blur()
    }
  }

  // ── Kind icon + color (minimal — single letter, no text chars like "{}") ──
  /** @param {import('$lib/jsonpath.js').CompletionItem['kind']} kind */
  function kindMeta(kind) {
    switch (kind) {
      case 'object':   return { dot: 'bg-blue-400',   label: 'obj' }
      case 'array':    return { dot: 'bg-amber-400',  label: 'arr' }
      case 'string':   return { dot: 'bg-green-400',  label: 'str' }
      case 'number':   return { dot: 'bg-yellow-400', label: 'num' }
      case 'boolean':  return { dot: 'bg-purple-400', label: 'bool' }
      case 'null':     return { dot: 'bg-slate-400',  label: 'null' }
      case 'wildcard': return { dot: 'bg-cyan-400',   label: 'all' }
      case 'index':    return { dot: 'bg-indigo-400', label: 'idx' }
      case 'filter':   return { dot: 'bg-rose-400',   label: 'fn' }
      case 'slice':    return { dot: 'bg-teal-400',   label: 'slc' }
      default:         return { dot: 'bg-muted-foreground/40', label: '·' }
    }
  }

  /** Highlight matched prefix in label */
  function matchParts(label, typedPath) {
    const token = (() => {
      const t = typedPath.startsWith('$') ? typedPath.slice(1) : typedPath
      const i = Math.max(t.lastIndexOf('.'), t.lastIndexOf('['))
      return i >= 0 ? t.slice(i + 1) : t
    })()
    if (!token || !label.toLowerCase().startsWith(token.toLowerCase())) return null
    return { head: label.slice(0, token.length), tail: label.slice(token.length) }
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  function handleCopyResult() {
    if (!resultJson) return
    navigator.clipboard.writeText(resultJson).then(() => {
      copied = true
      if (copiedTimer) clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => { copied = false }, 2000)
    })
  }

  function handleCopyInput() {
    navigator.clipboard.writeText(rawJson).then(() => {
      copiedInput = true
      if (copiedInputTimer) clearTimeout(copiedInputTimer)
      copiedInputTimer = setTimeout(() => { copiedInput = false }, 2000)
    })
  }

  function formatJson() {
    if (!inputEditor || parsedJson === null) return
    inputEditor.setValue(JSON.stringify(parsedJson, null, 2))
    inputEditor.focus()
  }

  function clearInput() {
    inputEditor?.setValue('')
    jsonPath = ''
    inputEditor?.focus()
  }

  function currentTheme() {
    return normalizeThemeId(document.documentElement.dataset.theme)
  }

  // ── Monaco base config ────────────────────────────────────────────────────
  const MONACO_BASE = {
    language: 'json',
    // automaticLayout: false — we use a single ResizeObserver instead.
    // Monaco's automaticLayout uses setInterval(100ms) per editor instance,
    // which means two continuous polling loops running the whole time the
    // page is open. A ResizeObserver fires only when the size actually changes.
    automaticLayout: false,
    minimap: { enabled: false },
    fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
    fontLigatures: false,
    fontWeight: 'normal',
    scrollBeyondLastLine: false,
    wordWrap: 'off',
    lineNumbers: /** @type {'on'} */ ('on'),
    lineNumbersMinChars: 3,
    glyphMargin: false,
    folding: true,
    foldingHighlight: false,
    scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
    smoothScrolling: false,  // smoothScrolling has a small CPU cost on every scroll event
    renderLineHighlight: /** @type {'none'} */ ('none'),
    contextmenu: true,
    selectionHighlight: false,
    occurrencesHighlight: /** @type {'off'} */ ('off'),
    codeLens: false,
    renderValidationDecorations: /** @type {'off'} */ ('off'),
    // Disable features that scan the document on every edit
    hover: { enabled: false },
    links: false,
  }

  onMount(() => {
    configureMonacoWorkers()
    defineDbStudioMonacoThemes()
    if (!inputContainer || !resultContainer) return

    const { fontSize, lineHeight } = readEditorFontOptions()
    const theme = monacoThemeId(currentTheme())

    inputEditor = monaco.editor.create(inputContainer, {
      ...MONACO_BASE,
      value: '',
      theme,
      readOnly: false,
      fontSize,
      lineHeight,
      padding: { top: 12, bottom: 12 },
      cursorBlinking: 'blink',
      bracketPairColorization: { enabled: true },
      quickSuggestions: false,
      suggest: { showWords: false },
    })

    resultEditor = monaco.editor.create(resultContainer, {
      ...MONACO_BASE,
      value: '',
      theme,
      readOnly: true,
      fontSize,
      lineHeight,
      padding: { top: 12, bottom: 12 },
      cursorStyle: /** @type {'line-thin'} */ ('line-thin'),
    })

    // Single ResizeObserver for both containers — much cheaper than two
    // automaticLayout polling loops. Calls layout() only when size changes.
    const ro = new ResizeObserver(() => {
      inputEditor?.layout()
      resultEditor?.layout()
    })
    ro.observe(inputContainer)
    ro.observe(resultContainer)

    inputEditor.onDidChangeModelContent(() => {
      const val = inputEditor?.getValue() ?? ''
      rawJson = val  // immediate: drives the header summary

      // Debounce the expensive parse so it runs at most once per 250ms
      // instead of on every single keystroke. For a 500kb JSON file this
      // prevents multiple full parse passes per second.
      if (parseDebounceTimer !== null) clearTimeout(parseDebounceTimer)
      parseDebounceTimer = setTimeout(() => {
        parseDebounceTimer = null
        rawJsonDebounced = val
      }, 250)
    })

    const themeObs = new MutationObserver(() => {
      monaco.editor.setTheme(monacoThemeId(currentTheme()))
    })
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })

    editorsReady = true

    return () => {
      ro.disconnect()
      if (parseDebounceTimer !== null) clearTimeout(parseDebounceTimer)
      inputEditor?.dispose(); resultEditor?.dispose()
      inputEditor = null; resultEditor = null
      themeObs.disconnect()
    }
  })
</script>

<div bind:this={pageEl} class="flex min-h-0 flex-1 flex-col overflow-hidden">

  <!-- ── Input panel header ────────────────────────────────────────────── -->
  <div class="studio-chrome flex h-8 shrink-0 items-center gap-2 border-b border-border bg-panel px-3" data-studio-chrome>
    <Braces class="size-3.5 shrink-0 text-muted-foreground/50" />
    <span class="font-mono text-ui-xs font-medium text-foreground/70">JSON Input</span>

    {#if inputSummary === 'invalid JSON'}
      <span class="font-mono text-ui-2xs text-destructive/70">invalid JSON</span>
    {:else if inputSummary}
      <span class="font-mono text-ui-2xs text-muted-foreground/45">{inputSummary}</span>
    {:else}
      <span class="font-mono text-ui-2xs text-muted-foreground/30">paste or type JSON here</span>
    {/if}

    <div class="ml-auto flex shrink-0 items-center gap-0.5">
      {#if parsedJson !== null}
        <button type="button"
          class="inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-ui-2xs text-muted-foreground/55 transition-colors hover:bg-muted hover:text-foreground"
          onclick={formatJson}
        ><Wand2 class="size-2.5" />Format</button>
      {/if}
      {#if rawJson.trim()}
        <button type="button"
          class="inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-ui-2xs text-muted-foreground/55 transition-colors hover:bg-muted hover:text-foreground"
          onclick={handleCopyInput}
        >
          {#if copiedInput}<CheckCheck class="size-2.5 text-green-500" />{:else}<Copy class="size-2.5" />{/if}
          Copy
        </button>
        <button type="button"
          class="inline-flex size-6 items-center justify-center rounded text-muted-foreground/35 transition-colors hover:bg-destructive/10 hover:text-destructive"
          onclick={clearInput}
        ><Trash2 class="size-3" /></button>
      {/if}
    </div>
  </div>

  <!-- ── Input Monaco ──────────────────────────────────────────────────── -->
  <div class="relative shrink-0 overflow-hidden" style="height: {inputHeight}px">
    <div bind:this={inputContainer} class="absolute inset-0 h-full w-full"></div>
    {#if !rawJson.trim()}
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
        <p class="font-mono text-ui-sm text-muted-foreground/25">Paste or type JSON here</p>
      </div>
    {/if}
  </div>

  <ResizeHandle
    axis="y"
    edge="end"
    onresizestart={() => { resizeStart = inputHeight }}
    onresize={(dy) => { inputHeight = clampHeight(resizeStart + dy) }}
    onresizeend={() => saveLayout({ sqlEditorHeight: inputHeight })}
  />

  <!-- ── JSONPath bar ──────────────────────────────────────────────────── -->
  <div class="studio-chrome relative flex h-8 shrink-0 items-center gap-1.5 border-b border-border bg-panel px-3" data-studio-chrome>
    <span class="select-none font-mono text-ui-xs text-muted-foreground/45">$</span>
    <input
      bind:this={pathInput}
      type="text"
      bind:value={jsonPath}
      placeholder=".field  ·  [0]  ·  [*].name  ·  ..key  ·  [?(@.x > 0)]"
      class="min-w-0 flex-1 bg-transparent font-mono text-ui-xs text-foreground placeholder:text-muted-foreground/25 focus:outline-none"
      spellcheck="false"
      autocomplete="off"
      onfocus={() => { pathFocused = true }}
      onblur={() => setTimeout(() => { pathFocused = false }, 120)}
      onkeydown={handlePathKeydown}
    />

    {#if pathResult && !pathResult.ok}
      <span class="shrink-0 font-mono text-ui-2xs text-destructive/70">{pathResult.error}</span>
    {:else if pathResult?.ok}
      <span class="shrink-0 font-mono text-ui-2xs text-muted-foreground/45">{describeResult(pathResult.value)}</span>
    {/if}

    <!-- Minimal VSCode-style suggestion list -->
    {#if pathFocused && completionItems.length > 0}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <ul
        class="absolute left-0 top-full z-50 mt-px w-full max-w-[480px] overflow-hidden rounded-b-lg border border-t-0 border-border/60 bg-popover shadow-lg"
        onmousedown={(e) => e.preventDefault()}
        role="listbox"
      >
        {#each completionItems as item, i (item.insert)}
          {@const meta = kindMeta(item.kind)}
          {@const parts = matchParts(item.label, jsonPath)}
          <li role="option" aria-selected={i === activeIdx}>
            <button
              type="button"
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors {i === activeIdx ? 'bg-accent' : 'hover:bg-accent/40'}"
              onclick={() => pickCompletion(item)}
            >
              <!-- Color dot (no text icons — just a colored 6px circle) -->
              <span class="size-1.5 shrink-0 rounded-full {meta.dot}"></span>

              <!-- Label: highlighted match prefix + remainder -->
              <span class="min-w-0 flex-1 truncate font-mono text-ui-xs">
                {#if parts}
                  <span class="text-foreground">{parts.head}</span><span class="text-muted-foreground/60">{parts.tail}</span>
                {:else}
                  <span class="{i === activeIdx ? 'text-foreground' : 'text-muted-foreground/75'}">{item.label}</span>
                {/if}
              </span>

              <!-- Type tag -->
              <span class="shrink-0 font-mono text-[10px] text-muted-foreground/40">{item.detail}</span>

              <!-- Value preview only on selected row -->
              {#if i === activeIdx && item.preview}
                <span class="max-w-36 shrink-0 truncate font-mono text-[10px] text-muted-foreground/35">{item.preview}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="ml-auto flex shrink-0 items-center gap-0.5">
      <button type="button"
        class="inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-ui-2xs transition-colors {resultJson ? 'text-muted-foreground/55 hover:bg-muted hover:text-foreground' : 'cursor-default text-muted-foreground/20'}"
        disabled={!resultJson}
        onclick={handleCopyResult}
      >
        {#if copied}
          <CheckCheck class="size-2.5 text-green-500" />Copied
        {:else}
          <Copy class="size-2.5" />Copy result
        {/if}
      </button>
    </div>
  </div>

  <!-- ── Result Monaco ─────────────────────────────────────────────────── -->
  <div class="relative min-h-0 flex-1 overflow-hidden">
    <div bind:this={resultContainer} class="absolute inset-0 h-full w-full"></div>

    {#if !rawJson.trim()}
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
        <p class="font-mono text-ui-xs text-muted-foreground/25">Paste JSON above, then query it here</p>
      </div>
    {:else if parsedJson === null}
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
        <p class="font-mono text-ui-xs text-destructive/40">Fix JSON errors to run queries</p>
      </div>
    {:else if !jsonPath.trim() || jsonPath.trim() === '$'}
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
        <div class="space-y-1">
          <p class="font-mono text-ui-xs text-muted-foreground/30">Enter a JSONPath expression above</p>
          <p class="font-mono text-ui-2xs text-muted-foreground/20">[*].id · .name · ..email · [?(@.active)]</p>
        </div>
      </div>
    {:else if pathResult && !pathResult.ok}
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
        <p class="font-mono text-ui-xs text-destructive/40">{pathResult.error}</p>
      </div>
    {/if}
  </div>

</div>

<style>
  :global(.monaco-editor),
  :global(.monaco-editor .margin),
  :global(.monaco-editor-background) {
    border-radius: 0 !important;
  }
  :global(.monaco-editor .view-lines),
  :global(.monaco-editor .view-line) {
    font-weight: 400 !important;
  }
</style>
