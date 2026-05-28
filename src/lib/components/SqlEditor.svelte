<script>
  import { onMount } from 'svelte'
  import * as monaco from 'monaco-editor'
  import { configureMonacoWorkers } from '$lib/monaco-env.js'
  import { registerMonacoSqlFormatter } from '$lib/format-sql.js'
  import { registerMonacoSqlCompletion } from '$lib/monaco-sql-complete.js'
  import { registerMonacoAiCompletion } from '$lib/monaco-ai-complete.js'
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
    const KeyMod = monaco.KeyMod
    const KeyCode = monaco.KeyCode

    /** @param {() => void | undefined} fn */
    function run(fn) { fn?.() }

    ed.addCommand(KeyMod.CtrlCmd | KeyCode.KeyK, () => run(onmodk))
    ed.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, () => run(onmodenter))
    ed.addCommand(KeyMod.CtrlCmd | KeyCode.KeyR, () => run(onmodr))
    ed.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, async () => {
      await formatDocument()
    })

    async function formatDocument() {
      await ed.getAction('editor.action.formatDocument')?.run()
      run(onmods)
    }

    onactionsready?.({ format: formatDocument })
  }

  onMount(() => {
    configureMonacoWorkers()
    defineDbStudioMonacoThemes()
    registerMonacoSqlFormatter(monaco)
    registerMonacoSqlCompletion(monaco, () => schemaHints)
    registerMonacoAiCompletion(monaco, () => schemaHints)
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
      inlineSuggest: { enabled: true, mode: 'subword' },
    })

    registerAppShortcuts(editor)

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
