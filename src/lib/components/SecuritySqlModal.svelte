<script>
  import { onMount } from 'svelte'
  import * as monaco from 'monaco-editor'
  import { configureMonacoWorkers } from '$lib/monaco-env.js'
  import { registerMonacoSqlFormatter } from '$lib/format-sql.js'
  import {
    defineDbStudioMonacoThemes,
    monacoThemeId,
    readEditorFontOptions,
  } from '$lib/monaco-themes.js'
  import { normalizeThemeId } from '$lib/themes/registry.js'
  import X from '@lucide/svelte/icons/x'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import Play from '@lucide/svelte/icons/play'

  let {
    title = '',
    sql = $bindable(''),
    running = false,
    onclose = () => {},
    onrun = () => {},
  } = $props()

  /** @type {HTMLDivElement | null} */
  let container = $state(null)
  /** @type {monaco.editor.IStandaloneCodeEditor | null} */
  let editor = null

  function currentTheme() {
    return normalizeThemeId(document.documentElement.dataset.theme)
  }

  onMount(() => {
    configureMonacoWorkers()
    defineDbStudioMonacoThemes()
    registerMonacoSqlFormatter(monaco)
    if (!container) return

    const { fontSize, lineHeight } = readEditorFontOptions()

    editor = monaco.editor.create(container, {
      value: sql,
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
    })

    // Ctrl/Cmd+Enter → run
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      if (!running) onrun()
    })
    // Escape → close
    editor.addCommand(monaco.KeyCode.Escape, () => {
      if (!running) onclose()
    })

    editor.onDidChangeModelContent(() => {
      const v = editor?.getValue() ?? ''
      if (v !== sql) sql = v
    })

    const themeObs = new MutationObserver(() => {
      monaco.editor.setTheme(monacoThemeId(currentTheme()))
    })
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })

    // Focus the editor when the modal opens
    editor.focus()

    return () => {
      editor?.dispose()
      editor = null
      themeObs.disconnect()
    }
  })

  // Keep editor value in sync if sql prop changes externally
  $effect(() => {
    const s = sql
    if (editor && editor.getValue() !== s) editor.setValue(s)
  })
</script>

<!-- Backdrop -->
<!-- svelte-ignore a11y_interactive_supports_focus a11y_click_events_have_key_events -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm"
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  onclick={(e) => { if (e.target === e.currentTarget && !running) onclose() }}
  onkeydown={(e) => { if (e.key === 'Escape' && !running) onclose() }}
>
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div
    role="presentation"
    class="flex w-[640px] flex-col overflow-hidden rounded-xl border border-border/50 bg-background shadow-2xl"
    style="height: 420px"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Header -->
    <div class="flex shrink-0 items-center justify-between border-b border-border/50 px-4 py-2.5">
      <span class="font-mono text-sm font-medium text-foreground">{title}</span>
      <button
        type="button"
        class="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onclick={onclose}
        disabled={running}
      >
        <X class="size-3.5" />
      </button>
    </div>

    <!-- Monaco editor fills the space -->
    <div class="security-sql-modal min-h-0 flex-1 overflow-hidden">
      <div bind:this={container} class="h-full w-full"></div>
    </div>

    <!-- Footer -->
    <div class="flex shrink-0 items-center justify-between border-t border-border/50 px-4 py-2.5">
      <p class="font-mono text-ui-2xs text-muted-foreground/50">
        <kbd>⌘↵</kbd> to run
        &nbsp;·&nbsp;
        <kbd>Esc</kbd> to close
      </p>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-md border border-border/60 px-3 py-1.5 font-mono text-ui-xs text-muted-foreground transition-colors hover:bg-muted"
          onclick={onclose}
          disabled={running}
        >Cancel</button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-mono text-ui-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          onclick={onrun}
          disabled={running || !sql.trim()}
        >
          {#if running}
            <RefreshCw class="size-3 animate-spin" />Running…
          {:else}
            <Play class="size-3" />Run SQL
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .security-sql-modal :global(.monaco-editor),
  .security-sql-modal :global(.monaco-editor .margin),
  .security-sql-modal :global(.monaco-editor-background) {
    border-radius: 0 !important;
  }

  .security-sql-modal :global(.monaco-editor .view-lines),
  .security-sql-modal :global(.monaco-editor .view-line) {
    font-weight: 400 !important;
  }
</style>
