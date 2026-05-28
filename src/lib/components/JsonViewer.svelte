<script>
  import { onMount } from 'svelte'
  import * as monaco from 'monaco-editor'
  import { defineDbStudioMonacoThemes, monacoThemeId, readEditorFontOptions } from '$lib/monaco-themes.js'
  import { normalizeThemeId } from '$lib/themes/registry.js'
  import Table2 from '@lucide/svelte/icons/table-2'
  import Copy from '@lucide/svelte/icons/copy'
  import Download from '@lucide/svelte/icons/download'
  import CheckCheck from '@lucide/svelte/icons/check-check'
  import { evalJsonPath, getCompletions, applyCompletion, describeResult } from '$lib/jsonpath.js'

  let {
    json = '[]',
    rowCount = 0,
    onshowtable = () => {},
    ondownload = /** @type {(() => void) | undefined} */ (undefined),
  } = $props()

  /** @type {HTMLElement | null} */
  let container = $state(null)
  /** @type {monaco.editor.IStandaloneCodeEditor | null} */
  let editor = null
  let copied = $state(false)
  /** @type {ReturnType<typeof setTimeout> | null} */
  let copiedTimer = null

  // ── JSONPath ──────────────────────────────────────────────────────────────
  let jsonPath = $state('')
  let pathFocused = $state(false)
  let activeIdx = $state(-1)
  /** @type {HTMLInputElement | null} */
  let pathInput = $state(null)

  const parsedJson = $derived.by(() => {
    try { return JSON.parse(json) } catch { return null }
  })

  const pathResult = $derived.by(() => {
    const p = jsonPath.trim()
    if (!p || p === '$') return null
    if (parsedJson === null) return null
    return evalJsonPath(parsedJson, p)
  })

  const displayedJson = $derived.by(() => {
    if (!pathResult?.ok) return json
    return JSON.stringify(pathResult.value, null, 2)
  })

  const completions = $derived.by(() => {
    if (!pathFocused || parsedJson === null) return []
    return getCompletions(parsedJson, jsonPath).slice(0, 8)
  })

  $effect(() => {
    if (!pathFocused || completions.length === 0) activeIdx = -1
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

  function currentTheme() {
    return normalizeThemeId(document.documentElement.dataset.theme)
  }

  function handleCopy() {
    navigator.clipboard.writeText(displayedJson).then(() => {
      copied = true
      if (copiedTimer) clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => { copied = false }, 2000)
    })
  }

  onMount(() => {
    defineDbStudioMonacoThemes()
    if (!container) return

    const { fontSize, lineHeight } = readEditorFontOptions()

    editor = monaco.editor.create(container, {
      value: json,
      language: 'json',
      theme: monacoThemeId(currentTheme()),
      readOnly: true,
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
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

    const themeObs = new MutationObserver(() => {
      monaco.editor.setTheme(monacoThemeId(currentTheme()))
    })
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })

    return () => {
      editor?.dispose()
      editor = null
      themeObs.disconnect()
    }
  })

  $effect(() => {
    if (!editor) return
    if (editor.getValue() !== displayedJson) editor.setValue(displayedJson)
  })
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
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

    <!-- toolbar right side -->
    <div class="ml-auto flex shrink-0 items-center gap-0.5">
      {#if rowCount > 0}
        <span class="select-none px-2 font-mono text-ui-2xs text-muted-foreground">{rowCount} rows</span>
        <div class="h-4 w-px bg-border/60"></div>
      {/if}

      <button
        type="button"
        title="Copy JSON"
        class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-ui-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onclick={handleCopy}
      >
        {#if copied}
          <CheckCheck class="size-3 shrink-0 text-green-500" />
          <span>Copied</span>
        {:else}
          <Copy class="size-3 shrink-0" />
          <span>Copy</span>
        {/if}
      </button>

      {#if ondownload}
        <button
          type="button"
          title="Download JSON"
          class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onclick={ondownload}
        >
          <Download class="size-3 shrink-0" />
        </button>
      {/if}

      <div class="h-4 w-px bg-border/60"></div>

      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-ui-2xs font-medium text-foreground transition-colors hover:bg-muted"
        onclick={onshowtable}
      >
        <Table2 class="size-3 shrink-0" />
        Show table
      </button>
    </div>
  </div>

  <!-- Monaco JSON editor -->
  <div class="relative min-h-0 flex-1 overflow-hidden">
    <div bind:this={container} class="absolute inset-0 h-full w-full"></div>
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
