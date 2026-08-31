<script>
  import { onMount } from 'svelte'
  import * as monaco from '$lib/monaco.js'
  import { configureMonacoWorkers, editorFontFamily } from '$lib/monaco-env.js'
  import { defineStrokeMonacoThemes, monacoThemeId, readEditorFontOptions } from '$lib/monaco-themes.js'
  import { normalizeThemeId } from '$lib/themes/registry.js'

  /**
   * Shared read-only Monaco surface for large generated documents (table JSON
   * and text views). Monaco's renderer is already virtualized and gives smooth
   * native scrolling, ⌘F find, and full text selection - the "large document
   * lag" came from whole-document passes, which this wrapper disables or makes
   * adaptive:
   *
   * - language falls back to plaintext above PLAINTEXT_OVER_CHARS, skipping
   *   tokenization AND the json validation worker for huge payloads
   * - folding (an O(document) indent scan) turns off above FOLDING_MAX_LINES
   * - bracket-pair colorization, unicode highlighting, occurrence/selection
   *   highlighting, link detection and smooth-scroll animation are off
   */
  let {
    text = '',
    /** Desired language id; may be downgraded to plaintext for huge documents. */
    language = 'plaintext',
    /** Off by default: wrapping costs a re-layout per width change, which the
     *  huge JSON/text payloads this wraps can't afford. Views showing hand-sized
     *  documents (DDL) turn it on. */
    wordWrap = /** @type {'on' | 'off'} */ ('off'),
  } = $props()

  const PLAINTEXT_OVER_CHARS = 4_000_000
  const FOLDING_MAX_LINES = 50_000

  /** @type {HTMLElement | null} */
  let container = $state(null)
  /** @type {monaco.editor.IStandaloneCodeEditor | null} */
  let editor = null
  /** @type {monaco.editor.ITextModel | null} */
  let model = null
  // Last applied text, compared by reference - model.getValue() would copy
  // the whole (potentially multi-MB) document just to diff it.
  let appliedText = /** @type {string | null} */ (null)

  const effectiveLanguage = $derived(text.length > PLAINTEXT_OVER_CHARS ? 'plaintext' : language)

  function currentTheme() {
    return normalizeThemeId(document.documentElement.dataset.theme)
  }

  onMount(() => {
    configureMonacoWorkers()
    defineStrokeMonacoThemes()
    if (!container) return

    const { fontSize, lineHeight } = readEditorFontOptions()
    model = monaco.editor.createModel(text, effectiveLanguage)
    appliedText = text

    editor = monaco.editor.create(container, {
      model,
      theme: monacoThemeId(currentTheme()),
      readOnly: true,
      domReadOnly: true,
      // automaticLayout:false - that option runs a 100ms setInterval per editor
      // forever; a ResizeObserver (below) handles relayout without the polling.
      automaticLayout: false,
      minimap: { enabled: false },
      fontFamily: editorFontFamily(),
      fontSize,
      lineHeight,
      fontLigatures: false,
      fontWeight: 'normal',
      padding: { top: 12, bottom: 12 },
      scrollBeyondLastLine: false,
      wordWrap,
      renderLineHighlight: 'none',
      lineNumbers: 'on',
      // Matches the JSON views: a character of inset on the left, 6px on the
      // right, so the gutter reads as evenly padded rather than flush to the edge.
      lineNumbersMinChars: 4,
      lineDecorationsWidth: 6,
      glyphMargin: false,
      folding: model.getLineCount() <= FOLDING_MAX_LINES,
      foldingHighlight: false,
      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      // Two ruler lanes so ⌘F match marks stay visible in the scrollbar.
      overviewRulerLanes: 2,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      smoothScrolling: false,
      cursorStyle: 'line-thin',
      contextmenu: false,
      links: false,
      matchBrackets: 'never',
      selectionHighlight: false,
      occurrencesHighlight: 'off',
      bracketPairColorization: { enabled: false },
      guides: { indentation: false, bracketPairs: false },
      unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false },
      renderValidationDecorations: 'off',
      renderWhitespace: 'none',
      codeLens: false,
      largeFileOptimizations: true,
      stickyScroll: { enabled: false },
    })

    // Theme changes are handled by the single shared <html> observer installed
    // in configureMonacoWorkers() - no per-instance observer needed.
    const ro = new ResizeObserver(() => editor?.layout())
    ro.observe(container)

    return () => {
      ro.disconnect()
      editor?.dispose()
      editor = null
      model?.dispose()
      model = null
    }
  })

  $effect(() => {
    const w = wordWrap
    editor?.updateOptions({ wordWrap: w })
  })

  $effect(() => {
    const t = text
    const lang = effectiveLanguage
    if (!editor || !model) return
    if (appliedText !== t) {
      appliedText = t
      model.setValue(t)
      editor.setScrollPosition({ scrollTop: 0, scrollLeft: 0 })
      editor.updateOptions({ folding: model.getLineCount() <= FOLDING_MAX_LINES })
    }
    if (model.getLanguageId() !== lang) monaco.editor.setModelLanguage(model, lang)
  })
</script>

<div class="relative min-h-0 flex-1 overflow-hidden">
  <div bind:this={container} class="absolute inset-0 h-full w-full"></div>
</div>

<style>
  div :global(.monaco-editor),
  div :global(.monaco-editor .margin),
  div :global(.monaco-editor-background) {
    border-radius: 0 !important;
  }
</style>
