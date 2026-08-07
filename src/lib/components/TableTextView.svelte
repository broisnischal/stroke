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
   * Text mode for the data table - CSV / TSV / Markdown / JSON Lines views of
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
      // localStorage unavailable - format just won't persist
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
  <div class="studio-chrome flex h-9 shrink-0 items-center gap-2 border-b border-border bg-panel px-2">
    <!-- One segmented control, not four loose buttons: the formats are mutually
         exclusive, so they get a shared boundary and the app's standard active
         fill. Labels are sans - mono is for data, not chrome. -->
    <div
      role="group"
      aria-label="Text format"
      class="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-lg border border-border/50 bg-muted/20 p-0.5"
    >
      {#each FORMATS as f (f.id)}
        <button
          type="button"
          class={cn(
            'inline-flex h-full items-center rounded-md px-2.5 text-ui-xs font-medium transition-colors',
            'focus-visible:ring-2 focus-visible:ring-ring/18 focus-visible:outline-none',
            format === f.id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          aria-pressed={format === f.id}
          onclick={() => setFormat(f.id)}
        >
          {f.label}
        </button>
      {/each}
    </div>

    <div class="ml-auto flex shrink-0 items-center gap-1">
      {#if rows.length > 0}
        <span class="select-none px-1 text-ui-2xs tabular-nums text-muted-foreground">
          {rows.length.toLocaleString('en-US')}
          {rows.length === 1 ? 'row' : 'rows'}
        </span>
        <div class="mx-0.5 h-4 w-px bg-border"></div>
      {/if}

      <button
        type="button"
        title="Copy to clipboard"
        class="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/18 focus-visible:outline-none"
        onclick={handleCopy}
      >
        {#if copied}
          <Icon name="check" class="size-3.5 shrink-0 text-success" />
        {:else}
          <Icon name="copy" class="size-3.5 shrink-0" />
        {/if}
        <!-- Fixed width: "Copy" → "Copied" otherwise resizes the button under the
             cursor at the exact moment it is clicked, nudging Download sideways. -->
        <span class="w-14 text-left">{copied ? 'Copied' : 'Copy'}</span>
      </button>

      <button
        type="button"
        title="Download file"
        aria-label="Download file"
        class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/18 focus-visible:outline-none"
        onclick={handleDownload}
      >
        <Icon name="download" class="size-3.5 shrink-0" />
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
