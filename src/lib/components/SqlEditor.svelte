<script>
  import { onMount } from 'svelte'
  import * as monaco from 'monaco-editor'
  import { configureMonacoWorkers, editorFontFamily } from '$lib/monaco-env.js'
  import { registerMonacoSqlFormatter } from '$lib/format-sql.js'
  import { registerMonacoSqlCompletion, setSqlHintsForModel } from '$lib/monaco-sql-complete.js'
  import {
    defineStrokeMonacoThemes,
    monacoThemeId,
    readEditorFontOptions,
  } from '$lib/monaco-themes.js'
  import { normalizeThemeId } from '$lib/themes/registry.js'
  import { splitSqlStatements, statementAtOffset } from '$lib/sql-statements.js'
  import { cn } from '$lib/utils.js'

  /** @typedef {import('$lib/monaco-sql-complete.js').SqlSchemaHints} SqlSchemaHints */

  let {
    value = $bindable(''),
    class: className = '',
    readOnly = false,
    schemaHints = /** @type {SqlSchemaHints} */ ({}),
    onmodk = undefined,
    onmodenter = undefined,
    /**
     * Run a single statement (Ctrl/Cmd+R) — receives the selected text, or the
     * statement under the cursor when there is no selection.
     * @type {((sql: string) => void) | undefined}
     */
    onrunstatement = undefined,
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

  /**
   * Statement under the cursor (or containing the selection anchor).
   * @param {monaco.editor.IStandaloneCodeEditor} ed
   */
  function statementAtCursor(ed) {
    const model = ed.getModel()
    const pos = ed.getPosition()
    if (!model || !pos) return null
    return statementAtOffset(splitSqlStatements(model.getValue()), model.getOffsetAt(pos))
  }

  /** @param {monaco.editor.IStandaloneCodeEditor} ed */
  function registerAppShortcuts(ed) {
    const { CtrlCmd, Shift } = monaco.KeyMod
    const { KeyK, KeyL, KeyR, KeyS, KeyI, KeyB, KeyW, KeyN, KeyM, KeyT, KeyD, KeyO, KeyE, KeyJ, Enter } = monaco.KeyCode

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
    ed.addCommand(CtrlCmd | KeyS,     () => run(onmods))

    // Ctrl/Cmd+L — select the statement under the cursor
    ed.addCommand(CtrlCmd | KeyL, () => {
      const stmt = statementAtCursor(ed)
      const model = ed.getModel()
      if (!stmt || !model) return
      const s = model.getPositionAt(stmt.start)
      const e = model.getPositionAt(stmt.end)
      ed.setSelection(new monaco.Selection(s.lineNumber, s.column, e.lineNumber, e.column))
      ed.revealRangeInCenterIfOutsideViewport(
        new monaco.Range(s.lineNumber, s.column, e.lineNumber, e.column),
      )
    })

    // Ctrl/Cmd+R — run the selection if any, else the statement under the cursor
    ed.addCommand(CtrlCmd | KeyR, () => {
      if (!onrunstatement) return
      const model = ed.getModel()
      const sel = ed.getSelection()
      const selText = model && sel && !sel.isEmpty() ? model.getValueInRange(sel).trim() : ''
      const stmt = selText || statementAtCursor(ed)?.text || ''
      if (stmt) onrunstatement(stmt)
    })
    ed.addAction({
      id: 'stroke.run-statement',
      label: 'Run Statement at Cursor',
      run: () => {
        const stmt = statementAtCursor(ed)?.text
        if (stmt && onrunstatement) onrunstatement(stmt)
      },
    })

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
      // automaticLayout:false — that option runs a 100ms setInterval per editor
      // that never stops, even while this tab is hidden (tabs are kept alive, not
      // unmounted). A ResizeObserver fires only on actual size changes. See below.
      automaticLayout: false,
      minimap: { enabled: false },
      fontFamily: editorFontFamily(),
      fontSize,
      lineHeight,
      fontLigatures: true,
      fontWeight: '450',
      letterSpacing: 0.2,
      padding: { top: 14, bottom: 14 },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      readOnly,
      renderLineHighlight: 'line',
      lineNumbers: 'on',
      // Tighter gutter: only as wide as the digits need, and no extra decoration
      // strip between the numbers and the code.
      lineNumbersMinChars: 2,
      lineDecorationsWidth: 6,
      glyphMargin: false,
      folding: false,
      scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      cursorStyle: 'line',
      cursorWidth: 2,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      fixedOverflowWidgets: true,
      quickSuggestions: { other: true, comments: false, strings: false },
      quickSuggestionsDelay: 0,
      suggestOnTriggerCharacters: true,
      tabCompletion: 'on',
      wordBasedSuggestions: 'off',
      // 'smart' — Enter inserts a newline unless the suggestion actually
      // changes the typed text; 'on' stole Enter constantly while writing SQL.
      acceptSuggestionOnEnter: 'smart',
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
        // Match anywhere in the identifier: "email" finds "user_email"
        matchOnWordStartOnly: false,
        insertMode: 'insert',
        showStatusBar: false,
        preview: false,
      },
      suggestSelection: 'first',
      parameterHints: { enabled: true, cycle: true },
    })

    // Bind this model to this component's (live) schema hints — the completion
    // provider is global, so hints must be looked up per model, not captured
    // from whichever editor happened to register first.
    setSqlHintsForModel(editor.getModel(), () => schemaHints)

    registerAppShortcuts(editor)

    // Subtle gutter bar marking the statement the cursor is in — only shown
    // when the buffer holds more than one statement, so single queries stay clean.
    const stmtDecorations = editor.createDecorationsCollection()
    function refreshActiveStatement() {
      const model = editor?.getModel()
      const pos = editor?.getPosition()
      if (!model || !pos) return
      const stmts = splitSqlStatements(model.getValue())
      const stmt = stmts.length > 1 ? statementAtOffset(stmts, model.getOffsetAt(pos)) : null
      if (!stmt) {
        stmtDecorations.clear()
        return
      }
      const s = model.getPositionAt(stmt.start)
      const e = model.getPositionAt(stmt.end)
      stmtDecorations.set([
        {
          range: new monaco.Range(s.lineNumber, 1, e.lineNumber, 1),
          options: { isWholeLine: true, linesDecorationsClassName: 'stmt-active-gutter' },
        },
      ])
    }
    editor.onDidChangeCursorPosition(refreshActiveStatement)

    // Replaces automaticLayout's polling loop: relayout only when the container
    // actually resizes.
    const ro = new ResizeObserver(() => editor?.layout())
    ro.observe(container)

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

    // Monaco caches glyph widths at init time. If the primary monospace font
    // hasn't loaded yet (font-display:swap means it may arrive after CSS parse),
    // Monaco uses fallback metrics and never self-corrects. Explicitly loading the
    // font and then calling remeasureFonts + layout forces correct re-measurement.
    const remeasure = () => {
      try {
        // remeasureFonts is a STATIC method on monaco.editor, not on the instance.
        monaco.editor.remeasureFonts()
        requestAnimationFrame(() => editor?.layout())
      } catch { /* API not available in this Monaco build */ }
    }
    // Wait for the editor's primary font specifically before remeasuring.
    document.fonts.load(`450 ${fontSize}px "JetBrains Mono Variable"`).then(remeasure, remeasure)

    editor.onDidChangeModelContent(() => {
      const next = editor?.getValue() ?? ''
      if (next !== value) {
        value = next
        onchange?.(next)
      }
      refreshActiveStatement()
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
      ro.disconnect()
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

  .sql-editor-host :global(.monaco-editor .monaco-editor-background) {
    outline: none !important;
  }

  /* Active-statement marker in the line-decorations gutter strip */
  .sql-editor-host :global(.stmt-active-gutter) {
    width: 2px !important;
    margin-left: 1px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--primary) 45%, transparent);
  }

  /* ── Suggestion widget ──────────────────────────────────────────────── */
  /* fixedOverflowWidgets:true moves these to <body>, so no host ancestor.
     Widgets lose the editor's inherited font — set it explicitly. */

  :global(.suggest-widget) {
    font-family: var(--editor-font-family) !important;
    border-radius: 10px !important;
    overflow: hidden !important;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.25) !important;
  }

  /* Details panel (right side when expanded) */
  :global(.suggest-widget .suggest-widget-details) {
    border-radius: 0 10px 10px 0 !important;
    border-left-width: 1px !important;
  }

  /* Each row: uniform height + horizontal padding */
  :global(.suggest-widget .monaco-list-row) {
    border-radius: 0 !important;
    padding-left: 8px !important;
    padding-right: 8px !important;
  }

  /* Label text: slightly tighter tracking for mono */
  :global(.suggest-widget .monaco-list-row .label-name) {
    letter-spacing: -0.01em;
  }

  /* Detail text on right side of each row */
  :global(.suggest-widget .details-label) {
    opacity: 0.45 !important;
    font-size: 0.8em !important;
  }

  /* The full documentation text in expanded detail panel */
  :global(.suggest-widget .suggest-widget-details .docs) {
    opacity: 0.8;
    font-size: 0.82em !important;
    line-height: 1.5 !important;
    padding: 4px 2px !important;
  }

  /* Signature text (bold param names etc.) */
  :global(.suggest-widget .suggest-widget-details .signature) {
    font-size: 0.85em !important;
    letter-spacing: -0.01em;
  }

  /* ── Parameter hints (shows while typing fn args) ───────────────────── */

  :global(.parameter-hints-widget) {
    font-family: var(--editor-font-family) !important;
    border-radius: 8px !important;
    overflow: hidden !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4) !important;
  }

  :global(.parameter-hints-widget .phContent) {
    font-size: 0.85em !important;
    padding: 4px 8px !important;
  }

  /* ── Hover widget ───────────────────────────────────────────────────── */

  :global(.monaco-hover) {
    border-radius: 8px !important;
    overflow: hidden !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4) !important;
  }

  /* ── Thin scrollbar inside suggestion list ──────────────────────────── */

  :global(.suggest-widget .monaco-scrollable-element > .scrollbar.vertical) {
    width: 4px !important;
  }
  :global(.suggest-widget .monaco-scrollable-element > .scrollbar.horizontal) {
    height: 4px !important;
  }
</style>
