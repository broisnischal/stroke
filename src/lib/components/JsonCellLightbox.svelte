<script>
  import { untrack } from 'svelte'
  import X from '@lucide/svelte/icons/x'
  import Copy from '@lucide/svelte/icons/copy'
  import CheckCheck from '@lucide/svelte/icons/check-check'
  import Braces from '@lucide/svelte/icons/braces'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import { oversizeCellInfo, formatByteSize } from '$lib/cell-value.js'
  import * as monaco from 'monaco-editor'
  import { configureMonacoWorkers, editorFontFamily } from '$lib/monaco-env.js'
  import { defineStrokeMonacoThemes, applyMonacoTheme, monacoThemeId, readEditorFontOptions } from '$lib/monaco-themes.js'
  import { normalizeThemeId } from '$lib/themes/registry.js'

  /**
   * @type {{
   *   data: { value: unknown, colName: string } | null,
   *   onclose: () => void
   * }}
   */
  let { data = null, onclose } = $props()

  // Oversized cells arrive as a backend sentinel carrying only a preview -
  // show that preview directly instead of pretty-printing the sentinel wrapper.
  const oversize = $derived(data ? oversizeCellInfo(data.value) : null)
  const jsonString = $derived.by(() => {
    if (!data) return ''
    if (oversize) return oversize.preview
    const s = JSON.stringify(data.value, null, 2)
    // Defensive cap for engines without backend cell capping - Monaco chokes
    // on multi-MB documents created synchronously on the main thread.
    return s.length > 2_000_000 ? s.slice(0, 2_000_000) + '\n… [truncated]' : s
  })

  /** @type {HTMLElement | null} */
  let container = $state(null)
  /** @type {HTMLElement | null} */
  let backdropEl = $state(null)
  /** @type {monaco.editor.IStandaloneCodeEditor | null} */
  let editor = null
  let copied = $state(false)
  /** @type {ReturnType<typeof setTimeout> | null} */
  let copiedTimer = null

  function currentTheme() {
    return normalizeThemeId(document.documentElement.dataset.theme)
  }

  $effect(() => {
    if (data) {
      copied = false
      Promise.resolve().then(() => backdropEl?.focus())
    }
  })

  // Init Monaco when the container element appears; dispose on removal.
  // jsonString is read via untrack so changing the value doesn't re-create the editor.
  $effect(() => {
    const el = container
    if (!el) return

    configureMonacoWorkers()
    defineStrokeMonacoThemes()
    const { fontSize, lineHeight } = readEditorFontOptions()

    const ed = monaco.editor.create(el, {
      value: untrack(() => jsonString),
      language: 'json',
      theme: monacoThemeId(currentTheme()),
      readOnly: true,
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: editorFontFamily(),
      fontSize,
      lineHeight,
      fontLigatures: false,
      fontWeight: 'normal',
      padding: { top: 12, bottom: 12 },
      scrollBeyondLastLine: false,
      wordWrap: 'off',
      renderLineHighlight: 'none',
      lineNumbers: 'on',
      lineNumbersMinChars: 3,
      glyphMargin: false,
      folding: true,
      foldingHighlight: false,
      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      smoothScrolling: true,
      cursorStyle: 'line-thin',
      contextmenu: false,
      selectionHighlight: false,
      occurrencesHighlight: 'off',
      codeLens: false,
      renderValidationDecorations: 'off',
    })
    editor = ed

    const themeObs = new MutationObserver(() => {
      applyMonacoTheme(currentTheme())
    })
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })

    return () => {
      ed.dispose()
      editor = null
      themeObs.disconnect()
    }
  })

  // Keep Monaco value in sync when switching between JSON cells without closing.
  $effect(() => {
    const s = jsonString
    const ed = editor
    if (!ed) return
    if (ed.getValue() !== s) ed.setValue(s)
  })

  function handleCopy() {
    navigator.clipboard.writeText(jsonString).then(() => {
      copied = true
      if (copiedTimer) clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => { copied = false }, 2000)
    })
  }

  /** @param {KeyboardEvent} e */
  function handleKey(e) {
    if (!data) return
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onclose() }
  }
</script>

<svelte:window onkeydown={handleKey} />

{#if data}
  <div
    bind:this={backdropEl}
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-label="JSON viewer"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/65 outline-none"
    onclick={onclose}
    onkeydown={handleKey}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div
      role="presentation"
      class="relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-background elevate-3-rim"
      style="width: min(90vw, 900px); height: min(85vh, 700px)"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="flex shrink-0 items-center justify-between border-b border-border/50 px-4 py-2">
        <div class="flex items-center gap-2">
          <Braces class="size-3.5 text-muted-foreground" />
          <span class="font-mono text-ui-sm font-medium text-foreground">{data.colName}</span>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-ui-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onclick={handleCopy}
          >
            {#if copied}
              <CheckCheck class="size-3.5 shrink-0 text-success" />
              <span>Copied</span>
            {:else}
              <Copy class="size-3.5 shrink-0" />
              <span>Copy</span>
            {/if}
          </button>
          <div class="mx-0.5 h-4 w-px bg-border/60"></div>
          <button
            type="button"
            class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Close (Esc)"
            onclick={onclose}
          >
            <X class="size-4" />
          </button>
        </div>
      </div>
      {#if oversize}
        <div class="flex shrink-0 items-center gap-2 border-b border-border/50 bg-warning/10 px-4 py-1.5 text-ui-xs text-warning">
          <TriangleAlert class="size-3.5 shrink-0" />
          <span>
            Truncated preview, full value is {formatByteSize(oversize.bytes)}{oversize.dataType ? ` (${oversize.dataType})` : ''}.
            Query it with SQL to retrieve it in full.
          </span>
        </div>
      {/if}
      <!-- Monaco editor fills the remaining space -->
      <div class="min-h-0 flex-1 overflow-hidden">
        <div bind:this={container} class="h-full w-full"></div>
      </div>
    </div>
  </div>
{/if}
