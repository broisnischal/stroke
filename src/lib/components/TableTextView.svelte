<script>
  import Icon from './Icon.svelte'
  import { cn } from '$lib/utils.js'
  import VirtualCodeView from './VirtualCodeView.svelte'
  import { escapeHtml, highlightJsonHtml } from '$lib/json-inspector.js'
  import {
    rowsToCsv,
    rowsToTsv,
    rowsToMarkdown,
    rowsToJsonl,
    csvEscape,
    singleLine,
    mdEscape,
    mdPad,
    markdownColumnWidths,
    buildExportFilename,
    saveExportFile,
  } from '$lib/export.js'

  /**
   * Text mode for the data table — CSV / TSV / Markdown / JSON Lines views of
   * the current page. Rendering is virtualized and lazy: a line's text is only
   * built (and colorized) when it scrolls into view, and the full document
   * string is only materialized on Copy / Download. Values are colored by their
   * real type (we render from row data, not by re-parsing the text), so quoted
   * delimiters can't confuse the highlighting.
   */
  let {
    /** @type {Array<{ name: string }>} */
    columns = [],
    /** @type {unknown[][]} */
    rows = [],
    /** @type {string | null} */
    tableName = null,
  } = $props()

  /** @type {Array<{ id: 'csv' | 'tsv' | 'md' | 'jsonl', label: string }>} */
  const FORMATS = [
    { id: 'csv', label: 'CSV' },
    { id: 'tsv', label: 'TSV' },
    { id: 'md', label: 'Markdown' },
    { id: 'jsonl', label: 'JSON Lines' },
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

  const DIM = 'text-muted-foreground/40'

  /** CSS class for a value span based on its runtime type. */
  function valueCls(/** @type {unknown} */ v) {
    if (v === null || v === undefined) return 'json-tok-null'
    if (typeof v === 'number' || typeof v === 'bigint') return 'json-tok-num'
    if (typeof v === 'boolean') return 'json-tok-bool'
    return ''
  }

  /**
   * One delimited line as colored HTML: escaped cell texts joined by a dimmed
   * delimiter, each cell tinted by its value's type.
   * @param {string[]} texts @param {(string | '')[]} classes @param {string} delimHtml
   */
  function delimitedLineHtml(texts, classes, delimHtml) {
    let out = ''
    for (let i = 0; i < texts.length; i++) {
      if (i > 0) out += delimHtml
      const t = escapeHtml(texts[i])
      out += classes[i] ? `<span class="${classes[i]}">${t}</span>` : t
    }
    return out
  }

  // Markdown column widths — only computed when the format needs them.
  const mdWidths = $derived(format === 'md' ? markdownColumnWidths(columns, rows) : [])

  const headerCls = $derived(columns.map(() => 'json-tok-key'))

  // Total line count per format (header rows included).
  const count = $derived.by(() => {
    if (columns.length === 0) return 0
    if (format === 'jsonl') return rows.length
    if (format === 'md') return rows.length + 2
    return rows.length + 1
  })

  const lineHtml = $derived((/** @type {number} */ idx) => {
    if (format === 'jsonl') {
      const row = rows[idx]
      if (!row) return ''
      /** @type {Record<string, unknown>} */
      const record = {}
      columns.forEach((col, i) => { record[col.name] = row[i] ?? null })
      return highlightJsonHtml(JSON.stringify(record))
    }

    if (format === 'md') {
      const pipe = `<span class="${DIM}">|</span>`
      if (idx === 0) {
        const cells = columns.map((c, i) => mdPad(mdEscape(c.name), mdWidths[i]))
        return `${pipe} ${delimitedLineHtml(cells, headerCls, ` ${pipe} `)} ${pipe}`
      }
      if (idx === 1) {
        return `<span class="${DIM}">| ${mdWidths.map((w) => '-'.repeat(w)).join(' | ')} |</span>`
      }
      const row = rows[idx - 2]
      if (!row) return ''
      const cells = row.map((v, i) => mdPad(mdEscape(v), mdWidths[i]))
      return `${pipe} ${delimitedLineHtml(cells, row.map(valueCls), ` ${pipe} `)} ${pipe}`
    }

    // csv / tsv
    const delim = format === 'tsv' ? '\t' : `<span class="${DIM}">,</span>`
    const esc = format === 'tsv' ? singleLine : csvEscape
    if (idx === 0) {
      return delimitedLineHtml(columns.map((c) => esc(c.name)), headerCls, delim)
    }
    const row = rows[idx - 1]
    if (!row) return ''
    return delimitedLineHtml(row.map(esc), row.map(valueCls), delim)
  })

  // Horizontal scroll estimate: Markdown is exact; the rest sample early rows.
  const maxChars = $derived.by(() => {
    if (columns.length === 0) return 0
    if (format === 'md') return mdWidths.reduce((a, w) => a + w, 0) + columns.length * 3 + 1
    const esc = format === 'tsv' ? singleLine : csvEscape
    let max = columns.reduce((a, c) => a + esc(c.name).length + 1, 0)
    const sample = Math.min(rows.length, 300)
    for (let r = 0; r < sample; r++) {
      const row = rows[r]
      let len = 0
      if (format === 'jsonl') {
        for (let i = 0; i < columns.length; i++) {
          len += columns[i].name.length + String(row[i] ?? 'null').length + 8
        }
      } else {
        for (const v of row) len += esc(v).length + 1
      }
      if (len > max) max = len
    }
    return max
  })

  /** Full document text — built only for Copy / Download. */
  function buildText() {
    if (format === 'tsv') return rowsToTsv(columns, rows)
    if (format === 'md') return rowsToMarkdown(columns, rows, markdownColumnWidths(columns, rows))
    if (format === 'jsonl') return rowsToJsonl(columns, rows)
    return rowsToCsv(columns, rows)
  }

  let copied = $state(false)
  /** @type {ReturnType<typeof setTimeout> | null} */
  let copiedTimer = null

  function handleCopy() {
    navigator.clipboard.writeText(buildText()).then(() => {
      copied = true
      if (copiedTimer) clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => {
        copied = false
      }, 2000)
    })
  }

  function handleDownload() {
    void saveExportFile(buildText(), buildExportFilename(tableName, format), format)
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

  <!-- Virtualized text body -->
  {#if columns.length === 0}
    <div class="flex min-h-0 flex-1 items-center justify-center bg-panel">
      <p class="font-mono text-ui-sm text-muted-foreground/40">No data to display</p>
    </div>
  {:else}
    <VirtualCodeView {count} {lineHtml} {maxChars} />
  {/if}
</div>
