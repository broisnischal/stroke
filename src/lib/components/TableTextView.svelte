<script>
  import Icon from './Icon.svelte'
  import { cn } from '$lib/utils.js'
  import MonacoTextView from './MonacoTextView.svelte'
  import { registerDelimitedLanguages, CSV_LANG, TSV_LANG } from '$lib/monaco-delimited.js'
  import {
    rowsToCsv,
    rowsToTsv,
    rowsToMarkdown,
    rowsToJsonl,
    buildExportFilename,
    saveExportFile,
  } from '$lib/export.js'

  /**
   * Text mode for the data table — CSV / TSV / Markdown / JSON Lines views of
   * the current page, rendered through the shared read-only Monaco surface
   * (smooth virtualized scrolling, ⌘F find, full selection). CSV/TSV get
   * colored values via a tiny Monarch tokenizer; Markdown tables are
   * column-aligned and copy exactly what's displayed.
   */
  let {
    /** @type {Array<{ name: string }>} */
    columns = [],
    /** @type {unknown[][]} */
    rows = [],
    /** @type {string | null} */
    tableName = null,
  } = $props()

  registerDelimitedLanguages()

  /** @type {Array<{ id: 'csv' | 'tsv' | 'md' | 'jsonl', label: string, lang: string }>} */
  const FORMATS = [
    { id: 'csv', label: 'CSV', lang: CSV_LANG },
    { id: 'tsv', label: 'TSV', lang: TSV_LANG },
    { id: 'md', label: 'Markdown', lang: 'markdown' },
    { id: 'jsonl', label: 'JSON Lines', lang: 'json' },
  ]

  const STORAGE_KEY = 'stroke:text-view-format'

  /** @returns {'csv' | 'tsv' | 'md' | 'jsonl'} */
  function loadFormat() {
    try {
      const v = localStorage.getItem(STORAGE_KEY)
      const found = FORMATS.find((f) => f.id === v)
      return found ? found.id : 'csv'
    } catch {
      return 'csv'
    }
  }

  let format = $state(loadFormat())

  /** @param {'csv' | 'tsv' | 'md' | 'jsonl'} next */
  function setFormat(next) {
    format = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // localStorage unavailable — format just won't persist
    }
  }

  const text = $derived.by(() => {
    if (columns.length === 0) return ''
    if (format === 'tsv') return rowsToTsv(columns, rows)
    if (format === 'md') return rowsToMarkdown(columns, rows)
    if (format === 'jsonl') return rowsToJsonl(columns, rows)
    return rowsToCsv(columns, rows)
  })

  const language = $derived(FORMATS.find((f) => f.id === format)?.lang ?? 'plaintext')

  let copied = $state(false)
  /** @type {ReturnType<typeof setTimeout> | null} */
  let copiedTimer = null

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      copied = true
      if (copiedTimer) clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => {
        copied = false
      }, 2000)
    })
  }

  function handleDownload() {
    void saveExportFile(text, buildExportFilename(tableName, format), format)
  }
</script>

<div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
  <!-- Format bar -->
  <div class="studio-chrome flex h-8 shrink-0 items-center gap-0.5 border-b border-border bg-panel px-2">
    {#each FORMATS as f (f.id)}
      <button
        type="button"
        class={cn(
          'rounded-md px-2 py-1 font-mono text-ui-2xs transition-colors',
          format === f.id
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
        aria-pressed={format === f.id}
        onclick={() => setFormat(f.id)}
      >
        {f.label}
      </button>
    {/each}

    <div class="ml-auto flex shrink-0 items-center gap-0.5">
      {#if rows.length > 0}
        <span class="select-none px-2 font-mono text-ui-2xs text-muted-foreground">{rows.length} rows</span>
        <div class="h-4 w-px bg-border/60"></div>
      {/if}

      <button
        type="button"
        title="Copy to clipboard"
        class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-ui-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onclick={handleCopy}
      >
        {#if copied}
          <Icon name="check" class="size-3 shrink-0 text-green-500" />
          <span>Copied</span>
        {:else}
          <Icon name="copy" class="size-3 shrink-0" />
          <span>Copy</span>
        {/if}
      </button>

      <button
        type="button"
        title="Download file"
        class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onclick={handleDownload}
      >
        <Icon name="download" class="size-3 shrink-0" />
      </button>
    </div>
  </div>

  <!-- Monaco text body (⌘F to search) -->
  {#if columns.length === 0}
    <div class="flex min-h-0 flex-1 items-center justify-center bg-panel">
      <p class="font-mono text-ui-sm text-muted-foreground/40">No data to display</p>
    </div>
  {:else}
    <MonacoTextView {text} {language} />
  {/if}
</div>
