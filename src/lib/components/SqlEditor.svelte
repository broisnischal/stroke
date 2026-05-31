<script>
  import { onMount } from 'svelte'
  import * as monaco from 'monaco-editor'
  import { configureMonacoWorkers } from '$lib/monaco-env.js'
  import { registerMonacoSqlFormatter } from '$lib/format-sql.js'
  import { registerMonacoSqlCompletion } from '$lib/monaco-sql-complete.js'
  import {
    defineDbStudioMonacoThemes,
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

    // Ctrl+Enter: override Monaco's built-in insertLineAfter which steals this binding.
    // addAction has higher priority than the built-in keybinding registry.
    ed.addAction({
      id: 'db-studio.run-query',
      label: 'Run Query',
      keybindings: [CtrlCmd | Enter],
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
    defineDbStudioMonacoThemes()
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
      fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
      fontSize,
      lineHeight,
      fontLigatures: false,
      fontWeight: 'normal',
      padding: { top: 12, bottom: 12 },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      readOnly,
      renderLineHighlight: 'line',
      lineNumbers: 'on',
      lineNumbersMinChars: 3,
      glyphMargin: false,
      folding: false,
      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      quickSuggestions: { other: true, comments: false, strings: true },
      suggestOnTriggerCharacters: true,
      tabCompletion: 'on',
      wordBasedSuggestions: 'off',
      acceptSuggestionOnEnter: 'on',
      snippetSuggestions: 'inline',
      renderWhitespace: 'none',
      bracketPairColorization: { enabled: true },
      inlineSuggest: { enabled: false },
    })

    registerAppShortcuts(editor)

    // Monaco measures char widths at init time. If Geist Mono Variable isn't
    // loaded yet (slow on Linux/Windows), it caches fallback-font widths and
    // never self-corrects even after the font visually arrives.
    document.fonts.ready.then(() => editor?.remeasureFonts())

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
      editor?.dispose()
      editor = null
      themeObserver.disconnect()
    }
  })

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

  /* Remove the default focus outline Monaco adds */
  .sql-editor-host :global(.monaco-editor .monaco-editor-background) {
    outline: none !important;
  }
</style>
