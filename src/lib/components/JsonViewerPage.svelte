<script>
  import { onMount } from 'svelte'
  import * as monaco from 'monaco-editor'
  import { configureMonacoWorkers } from '$lib/monaco-env.js'
  import { defineDbStudioMonacoThemes, monacoThemeId, readEditorFontOptions } from '$lib/monaco-themes.js'
  import { normalizeThemeId } from '$lib/themes/registry.js'
  import ResizeHandle from './ResizeHandle.svelte'
  import { loadLayout, saveLayout } from '$lib/stores/layout.js'
  import Copy from '@lucide/svelte/icons/copy'
  import CheckCheck from '@lucide/svelte/icons/check-check'
  import Braces from '@lucide/svelte/icons/braces'
  import { evalJsonPath, getCompletions, applyCompletion, describeResult } from '$lib/jsonpath.js'
  import { cn } from '$lib/utils.js'

  let { active = false } = $props()

  // ── Layout ────────────────────────────────────────────────────────────────
  const PANEL_MIN = 120
  const stored = loadLayout()
  // Reuse sqlEditorHeight as the input panel height for the JSON page
  let inputHeight = $state(Math.max(PANEL_MIN, Math.min(stored.sqlEditorHeight, 480)))
  let resizeStart = $state(Math.max(PANEL_MIN, Math.min(stored.sqlEditorHeight, 480)))

  /** @type {HTMLElement | null} */
  let pageEl = $state(null)

  function clampHeight(h) {
    const total = pageEl?.clientHeight ?? 0
    const max = total > 0 ? Math.max(PANEL_MIN, total - PANEL_MIN) : 720
    return Math.round(Math.min(max, Math.max(PANEL_MIN, h)))
  }

  // ── Input Monaco ─────────────────────────────────────────────────────────
  /** @type {HTMLElement | null} */
  let inputContainer = $state(null)
  /** @type {monaco.editor.IStandaloneCodeEditor | null} */
  let inputEditor = null

  // ── Result Monaco ─────────────────────────────────────────────────────────
  /** @type {HTMLElement | null} */
  let resultContainer = $state(null)
  /** @type {monaco.editor.IStandaloneCodeEditor | null} */
  let resultEditor = null

  // ── JSONPath ──────────────────────────────────────────────────────────────
  let jsonPath = $state('')
  let pathFocused = $state(false)
  let activeIdx = $state(-1)
  /** @type {HTMLInputElement | null} */
  let pathInput = $state(null)
  let rawJson = $state('')
  let copied = $state(false)
  /** @type {ReturnType<typeof setTimeout> | null} */
  let copiedTimer = null

  const parsedJson = $derived.by(() => {
    try { return JSON.parse(rawJson) } catch { return null }
  })

  const pathResult = $derived.by(() => {
    const p = jsonPath.trim()
    if (!p || p === '$') return null
    if (parsedJson === null) return null
    return evalJsonPath(parsedJson, p)
  })

  const resultJson = $derived.by(() => {
    if (!pathResult?.ok) return rawJson
    return JSON.stringify(pathResult.value, null, 2)
  })

  const completions = $derived.by(() => {
    if (!pathFocused || parsedJson === null) return []
    return getCompletions(parsedJson, jsonPath).slice(0, 8)
  })

  $effect(() => {
    if (!pathFocused || completions.length === 0) activeIdx = -1
  })

  $effect(() => {
    if (!resultEditor) return
    if (resultEditor.getValue() !== resultJson) resultEditor.setValue(resultJson)
  })

  /** @param {string} completion */
  function pickCompletion(completion) {
    jsonPath = applyCompletion(jsonPath, completion)
    activeIdx = -1
    pathInput?.focus()
  }

  /** @param {KeyboardEvent} e */
  function handlePathKeydown(e) {
    if (!completions.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIdx = (activeIdx + 1) % completions.length
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIdx = (activeIdx - 1 + completions.length) % completions.length
    } else if ((e.key === 'Tab' || e.key === 'Enter') && activeIdx >= 0) {
      e.preventDefault()
      pickCompletion(completions[activeIdx])
    } else if (e.key === 'Escape') {
      activeIdx = -1
      pathFocused = false
      pathInput?.blur()
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(resultJson).then(() => {
      copied = true
      if (copiedTimer) clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => { copied = false }, 2000)
    })
  }

  function currentTheme() {
    return normalizeThemeId(document.documentElement.dataset.theme)
  }

  const MONACO_BASE = {
    language: 'json',
    automaticLayout: true,
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
    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
    smoothScrolling: true,
    renderLineHighlight: /** @type {'none'} */ ('none'),
    contextmenu: false,
    selectionHighlight: false,
    occurrencesHighlight: /** @type {'off'} */ ('off'),
    codeLens: false,
    renderValidationDecorations: /** @type {'off'} */ ('off'),
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
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
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

    inputEditor.onDidChangeModelContent(() => {
      rawJson = inputEditor?.getValue() ?? ''
    })

    const themeObs = new MutationObserver(() => {
      const t = monacoThemeId(currentTheme())
      monaco.editor.setTheme(t)
    })
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })

    return () => {
      inputEditor?.dispose()
      resultEditor?.dispose()
      inputEditor = null
      resultEditor = null
      themeObs.disconnect()
    }
  })
</script>

<div bind:this={pageEl} class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <!-- Input panel header -->
  <div class="studio-chrome flex h-8 shrink-0 items-center gap-2 border-b border-border bg-panel px-3">
    <Braces class="size-3.5 shrink-0 text-muted-foreground/60" />
    <span class="font-mono text-ui-xs text-muted-foreground/70">JSON Input</span>
    <span class="font-mono text-ui-2xs text-muted-foreground/40">— paste or type JSON here</span>
    {#if parsedJson === null && rawJson.trim()}
      <span class="ml-auto font-mono text-ui-2xs text-destructive">invalid JSON</span>
    {:else if parsedJson !== null}
      <span class="ml-auto font-mono text-ui-2xs text-muted-foreground/50">
        {Array.isArray(parsedJson) ? `${parsedJson.length} items` : `${Object.keys(parsedJson).length} keys`}
      </span>
    {/if}
  </div>

  <!-- Input Monaco editor -->
  <div class="relative shrink-0 overflow-hidden" style="height: {inputHeight}px">
    <div bind:this={inputContainer} class="absolute inset-0 h-full w-full"></div>
  </div>

  <ResizeHandle
    axis="y"
    edge="end"
    onresizestart={() => { resizeStart = inputHeight }}
    onresize={(dy) => { inputHeight = clampHeight(resizeStart + dy) }}
    onresizeend={() => { saveLayout({ sqlEditorHeight: inputHeight }) }}
  />

  <!-- JSONPath bar -->
  <div class="studio-chrome relative flex h-8 shrink-0 items-center gap-1.5 border-b border-border bg-panel px-3">
    <span class="select-none font-mono text-ui-xs text-muted-foreground/60">$</span>
    <input
      bind:this={pathInput}
      type="text"
      bind:value={jsonPath}
      placeholder=".field  ·  [0]  ·  .items[*].name  ·  ..key"
      class="min-w-0 flex-1 bg-transparent font-mono text-ui-xs text-foreground placeholder:text-muted-foreground/35 focus:outline-none"
      spellcheck="false"
      autocomplete="off"
      onfocus={() => { pathFocused = true }}
      onblur={() => setTimeout(() => { pathFocused = false }, 120)}
      onkeydown={handlePathKeydown}
    />

    {#if pathResult && !pathResult.ok}
      <span class="shrink-0 font-mono text-ui-2xs text-destructive">{pathResult.error}</span>
    {:else if pathResult?.ok}
      <span class="shrink-0 font-mono text-ui-2xs text-muted-foreground/50">{describeResult(pathResult.value)}</span>
    {/if}

    <!-- Autocomplete dropdown -->
    {#if pathFocused && completions.length > 0}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <ul
        class="absolute left-0 top-full z-50 mt-px min-w-48 overflow-hidden rounded-b-md border border-border bg-popover shadow-lg"
        onmousedown={(e) => e.preventDefault()}
      >
        {#each completions as completion, i (completion)}
          <li>
            <button
              type="button"
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-ui-xs transition-colors {i === activeIdx ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}"
              onclick={() => pickCompletion(completion)}
            >
              {#if completion.startsWith('[')}
                <span class="shrink-0 text-[10px] text-muted-foreground/50">[idx]</span>
              {:else}
                <span class="shrink-0 text-[10px] text-muted-foreground/50">.key</span>
              {/if}
              <span class="truncate">{completion.startsWith('.') ? completion.slice(1) : completion}</span>
              <span class="ml-auto shrink-0 text-muted-foreground/40">{completion}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <!-- Right side actions -->
    <div class="ml-auto flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-ui-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onclick={handleCopy}
      >
        {#if copied}
          <CheckCheck class="size-3 shrink-0 text-green-500" />
          <span>Copied</span>
        {:else}
          <Copy class="size-3 shrink-0" />
          <span>Copy result</span>
        {/if}
      </button>
    </div>
  </div>

  <!-- Result Monaco editor -->
  <div class="relative min-h-0 flex-1 overflow-hidden">
    <div bind:this={resultContainer} class="absolute inset-0 h-full w-full"></div>

    {#if !rawJson.trim()}
      <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
        <Braces class="size-8 text-muted-foreground/15" />
        <p class="font-mono text-ui-sm text-muted-foreground/40">Paste JSON in the editor above</p>
        <p class="font-mono text-ui-2xs text-muted-foreground/25">Then use the path bar to explore it</p>
      </div>
    {/if}
  </div>
</div>

<style>
  div :global(.monaco-editor),
  div :global(.monaco-editor .margin),
  div :global(.monaco-editor-background) {
    border-radius: 0 !important;
  }

  div :global(.monaco-editor .view-lines),
  div :global(.monaco-editor .view-line) {
    font-weight: 400 !important;
  }
</style>
