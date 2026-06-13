<script>
  import { onMount } from 'svelte'
  import * as monaco from 'monaco-editor'
  import { configureMonacoWorkers, monacoFontFamily } from '$lib/monaco-env.js'
  import { registerMonacoSqlFormatter } from '$lib/format-sql.js'
  import { registerMonacoSqlCompletion } from '$lib/monaco-sql-complete.js'
  import {
    defineStrokeMonacoThemes,
    monacoThemeId,
    readEditorFontOptions,
  } from '$lib/monaco-themes.js'
  import { normalizeThemeId } from '$lib/themes/registry.js'
  import { cn } from '$lib/utils.js'

  /** @typedef {import('$lib/monaco-sql-complete.js').SqlSchemaHints} SqlSchemaHints */

  let {
    value = $bindable(''),
    class: className = '',
    readOnly = false,
    schemaHints = /** @type {SqlSchemaHints} */ ({}),
    onmodk = undefined,
    onmodenter = undefined,
    onmodr = undefined,
    onmods = undefined,
    // Global app shortcuts — registered inside Monaco so they work when editor is focused
    onmodi = undefined,
    onmodb = undefined,
    onmodw = undefined,
    onmodn = undefined,
    onmodm = undefined,
    onmodt = undefined,
    onmodshifte = undefined,
    onmodshiftd = undefined,
    onmodshifto = undefined,
    onmodj = undefined,
    onmodshiftb = undefined,
    /** @param {string} content */
    onchange = undefined,
    /** @type {(actions: { format: () => Promise<void> }) => void} */
    onactionsready = undefined,
  } = $props()

  let container = $state(null)
  /** @type {monaco.editor.IStandaloneCodeEditor | null} */
  let editor = null

  /** Reads current app theme from <html data-theme>. */
  function currentTheme() {
    return normalizeThemeId(document.documentElement.dataset.theme)
  }

  /** @param {monaco.editor.IStandaloneCodeEditor} ed */
  function registerAppShortcuts(ed) {
    const { CtrlCmd, Shift } = monaco.KeyMod
    const { KeyK, KeyR, KeyS, KeyI, KeyB, KeyW, KeyN, KeyM, KeyT, KeyD, KeyO, KeyE, KeyJ, Enter } = monaco.KeyCode

    /** @param {() => void | undefined} fn */
    const run = (fn) => fn?.()

    // Ctrl/Cmd+Enter: use a capture-phase listener on the container so it fires
    // BEFORE Monaco's own key handlers (which call stopPropagation and block
    // global hotkey listeners). This is the only reliable cross-platform approach.
    container.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        run(onmodenter)
      }
    }, { capture: true, passive: false })
    // Still register the action so it appears in Monaco's command palette (F1)
    ed.addAction({
      id: 'stroke.run-query',
      label: 'Run Query',
      run: () => run(onmodenter),
    })

    // Editor-local shortcuts
    ed.addCommand(CtrlCmd | KeyK,     () => run(onmodk))
    ed.addCommand(CtrlCmd | KeyR,     () => run(onmodr))
    ed.addCommand(CtrlCmd | KeyS,     () => run(onmods))

    // Global app shortcuts — work even when Monaco has focus
    ed.addCommand(CtrlCmd | KeyI,           () => run(onmodi))
    ed.addCommand(CtrlCmd | KeyB,           () => run(onmodb))
    ed.addCommand(CtrlCmd | KeyW,           () => run(onmodw))
    ed.addCommand(CtrlCmd | KeyN,           () => run(onmodn))
    ed.addCommand(CtrlCmd | KeyM,           () => run(onmodm))
    ed.addCommand(CtrlCmd | KeyT,           () => run(onmodt))
    ed.addCommand(CtrlCmd | Shift | KeyD,   () => run(onmodshiftd))
    ed.addCommand(CtrlCmd | Shift | KeyE,   () => run(onmodshifte))
    ed.addCommand(CtrlCmd | Shift | KeyO,   () => run(onmodshifto))
    ed.addCommand(CtrlCmd | KeyJ,           () => run(onmodj))
    ed.addCommand(CtrlCmd | Shift | KeyB,   () => run(onmodshiftb))

    async function formatDocument() {
      await ed.getAction('editor.action.formatDocument')?.run()
    }

    onactionsready?.({ format: formatDocument })
  }

  onMount(() => {
    configureMonacoWorkers()
    defineStrokeMonacoThemes()
    registerMonacoSqlFormatter(monaco)
    registerMonacoSqlCompletion(monaco, () => schemaHints)
    if (!container) return

    const { fontSize, lineHeight } = readEditorFontOptions()

    editor = monaco.editor.create(container, {
      value,
      language: 'sql',
      theme: monacoThemeId(currentTheme()),
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: monacoFontFamily(),
      fontSize,
      lineHeight,
      fontLigatures: true,
      fontWeight: '400',
      padding: { top: 14, bottom: 14 },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      readOnly,
      renderLineHighlight: 'line',
      lineNumbers: 'on',
      lineNumbersMinChars: 3,
      glyphMargin: false,
      folding: false,
      scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      quickSuggestions: { other: true, comments: false, strings: true },
      quickSuggestionsDelay: 50,
      suggestOnTriggerCharacters: true,
      tabCompletion: 'on',
      wordBasedSuggestions: 'off',
      acceptSuggestionOnEnter: 'on',
      snippetSuggestions: 'none',
      renderWhitespace: 'none',
      bracketPairColorization: { enabled: true },
      inlineSuggest: { enabled: false },
      suggest: {
        localityBonus: true,
        showKeywords: true,
        showFunctions: true,
        showSnippets: true,
        filterGraceful: true,
        insertMode: 'insert',
        showStatusBar: false,
        preview: false,
      },
      suggestSelection: 'recentlyUsedByPrefix',
      parameterHints: { enabled: true, cycle: true },
    })

    registerAppShortcuts(editor)

    // Document-level capture so Ctrl/Cmd+Enter fires even when the user hasn't
    // yet clicked into the editor (no focus = no container-level events).
    // Guards:
    //   • container.clientWidth === 0 → editor is in a hidden/inactive tab
    //   • activeElement is a real input/textarea outside Monaco → don't steal it
    function docRunHandler(/** @type {KeyboardEvent} */ e) {
      if (!container || container.clientWidth === 0) return
      if (!e.ctrlKey && !e.metaKey) return
      if (e.key !== 'Enter' || e.shiftKey || e.altKey) return
      const ae = document.activeElement
      const isOtherInput = ae && ae !== document.body &&
        !container.contains(ae) &&
        (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' ||
         ae.getAttribute('contenteditable') === 'true')
      if (isOtherInput) return
      e.preventDefault()
      e.stopPropagation()
      onmodenter?.()  // call directly — `run` is scoped to registerAppShortcuts, not here
    }
    document.addEventListener('keydown', docRunHandler, { capture: true, passive: false })

    // Monaco measures char widths at init time. If Geist Mono Variable isn't
    // loaded yet (slow on Linux/Windows), it caches fallback-font widths and
    // never self-corrects even after the font visually arrives.
    document.fonts.ready.then(() => {
      try { editor?.remeasureFonts?.() } catch { /* API not available in this Monaco build */ }
    })

    editor.onDidChangeModelContent(() => {
      const next = editor?.getValue() ?? ''
      if (next !== value) {
        value = next
        onchange?.(next)
      }
    })

    // Watch <html class="dark"> changes — reliable regardless of mode-watcher internals
    const themeObserver = new MutationObserver(() => {
      monaco.editor.setTheme(monacoThemeId(currentTheme()))
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })

    return () => {
      document.removeEventListener('keydown', docRunHandler, { capture: true })
      editor?.dispose()
      editor = null
      themeObserver.disconnect()
    }
  })

  /** Focus the Monaco editor (called when the SQL tab becomes active). */
  export function focus() {
    editor?.focus()
  }

  $effect(() => {
    if (!editor) return
    const current = editor.getValue()
    if (current !== value) editor.setValue(value)
  })

  $effect(() => {
    if (!editor) return
    editor.updateOptions({ readOnly })
  })

  $effect(() => {
    if (!editor) return
    const { fontSize, lineHeight } = readEditorFontOptions()
    editor.updateOptions({ fontSize, lineHeight })
  })
</script>

<div
  bind:this={container}
  class={cn('sql-editor-host h-full min-h-0 w-full overflow-hidden', className)}
></div>

<style>
  .sql-editor-host :global(.monaco-editor),
  .sql-editor-host :global(.monaco-editor .margin),
  .sql-editor-host :global(.monaco-editor-background) {
    border-radius: inherit;
  }

  .sql-editor-host :global(.monaco-editor .view-lines),
  .sql-editor-host :global(.monaco-editor .view-line) {
    font-weight: 400 !important;
  }

  .sql-editor-host :global(.monaco-editor .monaco-editor-background) {
    outline: none !important;
  }

  /* ── Suggestion widget ──────────────────────────────────────────────── */

  .sql-editor-host :global(.suggest-widget) {
    border-radius: 10px !important;
    overflow: hidden !important;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.25) !important;
  }

  /* Details panel (right side when expanded) */
  .sql-editor-host :global(.suggest-widget .suggest-widget-details) {
    border-radius: 0 10px 10px 0 !important;
    border-left-width: 1px !important;
  }

  /* Each row: uniform height + horizontal padding */
  .sql-editor-host :global(.suggest-widget .monaco-list-row) {
    border-radius: 0 !important;
    padding-left: 8px !important;
    padding-right: 8px !important;
  }

  /* Label text: slightly tighter tracking for mono */
  .sql-editor-host :global(.suggest-widget .monaco-list-row .label-name) {
    letter-spacing: -0.01em;
  }

  /* Detail text on right side of each row */
  .sql-editor-host :global(.suggest-widget .details-label) {
    opacity: 0.45 !important;
    font-size: 0.8em !important;
  }

  /* The full documentation text in expanded detail panel */
  .sql-editor-host :global(.suggest-widget .suggest-widget-details .docs) {
    opacity: 0.8;
    font-size: 0.82em !important;
    line-height: 1.5 !important;
    padding: 4px 2px !important;
  }

  /* Signature text (bold param names etc.) */
  .sql-editor-host :global(.suggest-widget .suggest-widget-details .signature) {
    font-size: 0.85em !important;
    letter-spacing: -0.01em;
  }

  /* ── Parameter hints (shows while typing fn args) ───────────────────── */

  .sql-editor-host :global(.parameter-hints-widget) {
    border-radius: 8px !important;
    overflow: hidden !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4) !important;
  }

  .sql-editor-host :global(.parameter-hints-widget .phContent) {
    font-size: 0.85em !important;
    padding: 4px 8px !important;
  }

  /* ── Hover widget ───────────────────────────────────────────────────── */

  .sql-editor-host :global(.monaco-hover) {
    border-radius: 8px !important;
    overflow: hidden !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4) !important;
  }

  /* ── Thin scrollbar inside suggestion list ──────────────────────────── */

  .sql-editor-host :global(.suggest-widget .monaco-scrollable-element > .scrollbar.vertical) {
    width: 4px !important;
  }
  .sql-editor-host :global(.suggest-widget .monaco-scrollable-element > .scrollbar.horizontal) {
    height: 4px !important;
  }
</style>
