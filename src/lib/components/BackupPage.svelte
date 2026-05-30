<script>
  import { onDestroy } from 'svelte'
  import { toast } from 'svelte-sonner'
  import Download from '@lucide/svelte/icons/download'
  import Upload from '@lucide/svelte/icons/upload'
  import Check from '@lucide/svelte/icons/check'
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle'
  import Loader from '@lucide/svelte/icons/loader'
  import FileText from '@lucide/svelte/icons/file-text'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import SquareCheck from '@lucide/svelte/icons/square-check'
  import Square from '@lucide/svelte/icons/square'
  import { backupExport, backupImport } from '$lib/api.js'

  /** @typedef {{ name: string, rowCount?: number }} TableRow */

  let {
    /** @type {'postgres'|'sqlite'|'mysql'|'d1'|null} */
    dbType = null,
    activeSchema = /** @type {string|null} */ (null),
    schemas = /** @type {string[]} */ ([]),
    /** @type {TableRow[]} */
    tables = [],
  } = $props()

  // ── Derived ───────────────────────────────────────────────────────────────
  const supportsSchemaFilter = $derived(dbType === 'postgres' || dbType === 'mysql')
  const dbLabel = $derived(
    dbType === 'postgres' ? 'PostgreSQL'
    : dbType === 'mysql'  ? 'MySQL'
    : dbType === 'sqlite' ? 'SQLite'
    : dbType === 'd1'     ? 'Cloudflare D1'
    : 'Unknown'
  )

  // ── Export state ──────────────────────────────────────────────────────────
  let exportSchema = $state(activeSchema ?? '')
  /** @type {'idle'|'running'|'done'|'error'} */
  let exportPhase = $state('idle')
  /** @type {{sql:string,tableCount:number,rowCount:number}|null} */
  let exportResult = $state(null)
  let exportError = $state('')

  // Table selection
  /** @type {Set<string>} */
  let selectedTables = $state(new Set(tables.map(t => t.name)))
  $effect(() => { selectedTables = new Set(tables.map(t => t.name)) })
  const allSelected = $derived(tables.length > 0 && selectedTables.size === tables.length)
  const someSelected = $derived(selectedTables.size > 0 && selectedTables.size < tables.length)

  function toggleTable(name) {
    const next = new Set(selectedTables)
    next.has(name) ? next.delete(name) : next.add(name)
    selectedTables = next
  }
  function selectAll() { selectedTables = new Set(tables.map(t => t.name)) }
  function selectNone() { selectedTables = new Set() }

  // Live log
  /** @type {{level:string,message:string,ts:number}[]} */
  let logs = $state([])
  let logEl = $state(/** @type {HTMLElement|null} */ (null))
  let unlisten = /** @type {(() => void)|null} */ (null)

  async function startLogListener() {
    try {
      const { listen } = await import('@tauri-apps/api/event')
      unlisten = await listen('backup-log', (/** @type {any} */ e) => {
        logs = [...logs, { ...e.payload, ts: Date.now() }]
        // Auto-scroll to bottom
        setTimeout(() => { if (logEl) logEl.scrollTop = logEl.scrollHeight }, 0)
      })
    } catch { /* dev mode */ }
  }

  function stopLogListener() {
    if (unlisten) { unlisten(); unlisten = null }
  }

  onDestroy(stopLogListener)

  // ── Export ────────────────────────────────────────────────────────────────
  async function runExport() {
    if (selectedTables.size === 0) { toast.error('Select at least one table'); return }
    exportPhase = 'running'
    exportResult = null
    exportError = ''
    logs = []
    await startLogListener()
    try {
      const schema = supportsSchemaFilter && exportSchema ? exportSchema : null
      const tableList = tables.length > 0 && selectedTables.size < tables.length
        ? [...selectedTables]
        : null  // null = all tables
      const result = await backupExport(schema, tableList)
      exportResult = result
      exportPhase = 'done'
    } catch (e) {
      exportError = String(/** @type {any} */ (e)?.message ?? e)
      exportPhase = 'error'
      toast.error('Export failed')
    } finally {
      stopLogListener()
    }
  }

  function downloadSql() {
    if (!exportResult?.sql) return
    const blob = new Blob([exportResult.sql], { type: 'text/sql;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const ts = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
    const schemaSlug = supportsSchemaFilter && exportSchema ? `_${exportSchema}` : ''
    a.download = `backup_${dbLabel.toLowerCase().replace(/\s+/g, '_')}${schemaSlug}_${ts}.sql`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Backup file downloaded')
  }

  function resetExport() {
    exportPhase = 'idle'
    exportResult = null
    exportError = ''
    logs = []
  }

  // ── Import ────────────────────────────────────────────────────────────────
  /** @type {'idle'|'running'|'done'|'error'} */
  let importPhase = $state('idle')
  /** @type {{statementsOk:number,statementsErr:number,errors:string[]}|null} */
  let importResult = $state(null)
  let importError = $state('')
  let importSql = $state('')
  let importFileName = $state('')
  let showImportErrors = $state(false)
  let importConfirmed = $state(false)

  function onFileSelect(/** @type {Event} */ e) {
    const input = /** @type {HTMLInputElement} */ (e.target)
    const file = input.files?.[0]
    if (!file) return
    importFileName = file.name
    importConfirmed = false
    const reader = new FileReader()
    reader.onload = (ev) => { importSql = /** @type {string} */ (ev.target?.result ?? '') }
    reader.readAsText(file)
    input.value = ''
  }

  async function runImport() {
    if (!importSql.trim()) { toast.error('No SQL loaded'); return }
    importPhase = 'running'
    importResult = null
    importError = ''
    showImportErrors = false
    try {
      const result = await backupImport(importSql)
      importResult = result
      importPhase = 'done'
      if (result.statementsErr === 0) {
        toast.success(`Restore complete — ${result.statementsOk} statements`)
      } else {
        toast.warning(`Restore finished with ${result.statementsErr} error(s)`)
      }
    } catch (e) {
      importError = String(/** @type {any} */ (e)?.message ?? e)
      importPhase = 'error'
      toast.error('Restore failed')
    }
  }

  function resetImport() {
    importPhase = 'idle'
    importResult = null
    importError = ''
    importSql = ''
    importFileName = ''
    showImportErrors = false
    importConfirmed = false
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fmtRows(n) {
    if (n == null || n < 0) return '—'
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
    return String(n)
  }
  function fmtBytes(sql) {
    const b = new TextEncoder().encode(sql).length
    if (b >= 1_048_576) return (b / 1_048_576).toFixed(1) + ' MB'
    if (b >= 1_024) return (b / 1_024).toFixed(1) + ' KB'
    return b + ' B'
  }
  const logColor = { info: 'text-muted-foreground', ok: 'text-green-400', warn: 'text-amber-400', error: 'text-destructive' }
</script>

<div class="flex min-h-0 flex-1 overflow-hidden">

  <!-- ── Left panel: Export ───────────────────────────────────────────────── -->
  <div class="flex w-[340px] min-w-0 shrink-0 flex-col border-r border-border/50">

    <!-- Header -->
    <div class="studio-chrome flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3" data-studio-chrome>
      <Download class="size-3.5 text-muted-foreground/60 shrink-0" />
      <div class="min-w-0 flex-1">
        <p class="text-xs font-semibold text-foreground">Export</p>
        <p class="text-[10px] text-muted-foreground truncate">{dbLabel} · SQL dump</p>
      </div>
      {#if exportPhase === 'done' && exportResult}
        <button type="button" onclick={resetExport} class="text-[10px] text-muted-foreground/50 hover:text-muted-foreground">Reset</button>
      {/if}
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">

      <!-- Schema picker (PostgreSQL / MySQL) -->
      {#if supportsSchemaFilter && schemas.length > 0}
        <div class="border-b border-border/30 px-4 py-3">
          <label class="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Schema</label>
          <div class="relative">
            <select
              bind:value={exportSchema}
              class="h-8 w-full appearance-none rounded-md border border-border/60 bg-background pl-3 pr-8 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="">All schemas</option>
              {#each schemas as s (s)}<option value={s}>{s}</option>{/each}
            </select>
            <ChevronDown class="pointer-events-none absolute right-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/50" />
          </div>
        </div>
      {/if}

      <!-- Table list -->
      {#if tables.length > 0}
        <div class="border-b border-border/30 px-4 py-2">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Tables
              <span class="ml-1 text-muted-foreground/50">{selectedTables.size}/{tables.length}</span>
            </span>
            <div class="flex gap-2 text-[10px] text-muted-foreground">
              <button type="button" class="hover:text-foreground" onclick={selectAll}>All</button>
              <span class="text-border">·</span>
              <button type="button" class="hover:text-foreground" onclick={selectNone}>None</button>
            </div>
          </div>
          <div class="flex flex-col divide-y divide-border/20 rounded-md border border-border/40 overflow-hidden max-h-60 overflow-y-auto">
            {#each tables as t (t.name)}
              {@const checked = selectedTables.has(t.name)}
              <button
                type="button"
                class="flex items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors hover:bg-accent/20 {checked ? '' : 'opacity-50'}"
                onclick={() => toggleTable(t.name)}
              >
                {#if checked}
                  <SquareCheck class="size-3.5 shrink-0 text-primary" />
                {:else}
                  <Square class="size-3.5 shrink-0 text-muted-foreground/30" />
                {/if}
                <span class="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{t.name}</span>
                {#if t.rowCount != null && t.rowCount >= 0}
                  <span class="shrink-0 font-mono text-[10px] text-muted-foreground/50">{fmtRows(t.rowCount)}</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Export result summary / error -->
      {#if exportPhase === 'done' && exportResult}
        <div class="px-4 py-3">
          <div class="rounded-md border border-green-700/30 bg-green-900/10 p-3">
            <div class="flex items-center gap-2">
              <Check class="size-3.5 shrink-0 text-green-400" />
              <span class="text-xs font-medium text-foreground">Export ready</span>
            </div>
            <div class="mt-2 grid grid-cols-3 gap-1 font-mono text-[10px] text-muted-foreground">
              <span>{exportResult.tableCount} table{exportResult.tableCount === 1 ? '' : 's'}</span>
              <span>{fmtRows(exportResult.rowCount)} rows</span>
              <span>{fmtBytes(exportResult.sql)}</span>
            </div>
          </div>
        </div>
      {:else if exportPhase === 'error'}
        <div class="px-4 py-3">
          <div class="rounded-md border border-destructive/30 bg-destructive/8 p-3 text-xs text-destructive">
            <AlertTriangle class="mb-1 size-3.5" />
            <span class="break-words">{exportError}</span>
          </div>
        </div>
      {/if}
    </div>

    <!-- Action button -->
    <div class="shrink-0 border-t border-border/40 p-3">
      {#if exportPhase === 'idle' || exportPhase === 'error'}
        <button
          type="button"
          disabled={selectedTables.size === 0}
          onclick={runExport}
          class="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          <Download class="size-3.5" />
          Export {selectedTables.size} table{selectedTables.size === 1 ? '' : 's'}
        </button>
      {:else if exportPhase === 'running'}
        <button disabled class="flex w-full items-center justify-center gap-2 rounded-md bg-primary/60 px-4 py-2 text-xs font-medium text-primary-foreground">
          <Loader class="size-3.5 animate-spin" />
          Exporting…
        </button>
      {:else if exportPhase === 'done' && exportResult}
        <button
          type="button"
          onclick={downloadSql}
          class="flex w-full items-center justify-center gap-2 rounded-md bg-green-700 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-green-600"
        >
          <Download class="size-3.5" />
          Download .sql — {fmtBytes(exportResult.sql)}
        </button>
      {/if}
    </div>

  </div>

  <!-- ── Center panel: Live log ────────────────────────────────────────────── -->
  <div class="flex min-w-0 flex-1 flex-col border-r border-border/50">

    <div class="studio-chrome flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3" data-studio-chrome>
      <span class="text-xs font-semibold text-foreground">Live log</span>
      {#if exportPhase === 'running'}
        <Loader class="ml-auto size-3.5 animate-spin text-muted-foreground" />
      {:else if logs.length > 0}
        <span class="ml-auto text-[10px] text-muted-foreground">{logs.length} entries</span>
      {/if}
    </div>

    <div
      bind:this={logEl}
      class="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-4 font-mono"
    >
      {#if logs.length === 0}
        <p class="text-[11px] text-muted-foreground/30">
          {exportPhase === 'idle' ? 'Run an export to see progress here.' : 'Waiting for log entries…'}
        </p>
      {:else}
        {#each logs as entry (entry.ts + entry.message)}
          <div class="mb-0.5 text-[11px] leading-relaxed {logColor[entry.level] ?? 'text-muted-foreground'}">
            {entry.message}
          </div>
        {/each}
        {#if exportPhase === 'running'}
          <div class="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
            <Loader class="size-3 animate-spin" />
            <span>Running…</span>
          </div>
        {/if}
      {/if}
    </div>

  </div>

  <!-- ── Right panel: Restore ──────────────────────────────────────────────── -->
  <div class="flex w-[300px] shrink-0 flex-col">

    <div class="studio-chrome flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3" data-studio-chrome>
      <Upload class="size-3.5 text-muted-foreground/60 shrink-0" />
      <div class="flex-1">
        <p class="text-xs font-semibold text-foreground">Restore</p>
        <p class="text-[10px] text-muted-foreground">Execute a SQL backup file</p>
      </div>
      {#if importPhase === 'done' || importPhase === 'error'}
        <button type="button" onclick={resetImport} class="text-[10px] text-muted-foreground/50 hover:text-muted-foreground">Reset</button>
      {/if}
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-4">

      {#if importPhase === 'idle'}
        <!-- File picker -->
        <label class="block cursor-pointer">
          <input type="file" accept=".sql,.txt" class="sr-only" onchange={onFileSelect} />
          <div class="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border/50 bg-muted/20 px-4 py-8 text-center transition-colors hover:bg-muted/40">
            <FileText class="size-8 text-muted-foreground/30" />
            {#if importFileName}
              <div>
                <p class="max-w-full truncate font-mono text-xs text-foreground">{importFileName}</p>
                <p class="mt-0.5 text-[10px] text-muted-foreground">{fmtBytes(importSql)}</p>
              </div>
            {:else}
              <div>
                <p class="text-xs text-muted-foreground">Click to select a <strong>.sql</strong> file</p>
                <p class="mt-0.5 text-[10px] text-muted-foreground/50">or drag and drop</p>
              </div>
            {/if}
          </div>
        </label>

        {#if importSql}
          <!-- Confirmation checkbox -->
          <label class="mt-3 flex cursor-pointer items-start gap-2">
            <input type="checkbox" bind:checked={importConfirmed} class="mt-0.5 shrink-0" />
            <span class="text-[11px] text-muted-foreground">
              I understand this will execute SQL against <strong class="text-foreground">{dbLabel}</strong> and may overwrite existing data.
            </span>
          </label>
        {/if}

      {:else if importPhase === 'running'}
        <div class="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
          <Loader class="size-4 animate-spin" />
          Executing statements…
        </div>

      {:else if importPhase === 'done' && importResult}
        <div class="rounded-md border {importResult.statementsErr === 0 ? 'border-green-700/30 bg-green-900/10' : 'border-amber-700/30 bg-amber-900/10'} p-3">
          <div class="flex items-center gap-2">
            {#if importResult.statementsErr === 0}
              <Check class="size-3.5 text-green-400" />
              <span class="text-xs font-medium text-foreground">Restore complete</span>
            {:else}
              <AlertTriangle class="size-3.5 text-amber-400" />
              <span class="text-xs font-medium text-foreground">Finished with errors</span>
            {/if}
          </div>
          <div class="mt-2 grid grid-cols-2 gap-1 font-mono text-[10px] text-muted-foreground">
            <span class="text-green-400/80">{importResult.statementsOk} ok</span>
            {#if importResult.statementsErr > 0}
              <span class="text-destructive/80">{importResult.statementsErr} failed</span>
            {/if}
          </div>
          {#if importResult.errors.length > 0}
            <button type="button" class="mt-2 text-[10px] text-muted-foreground underline" onclick={() => showImportErrors = !showImportErrors}>
              {showImportErrors ? 'Hide' : 'Show'} {importResult.errors.length} error{importResult.errors.length === 1 ? '' : 's'}
            </button>
            {#if showImportErrors}
              <div class="mt-2 max-h-32 overflow-y-auto rounded border border-border/40 bg-background p-2">
                {#each importResult.errors as err, i (i)}
                  <p class="font-mono text-[10px] text-destructive/80">{err}</p>
                {/each}
              </div>
            {/if}
          {/if}
        </div>

      {:else if importPhase === 'error'}
        <div class="rounded-md border border-destructive/30 bg-destructive/8 p-3">
          <div class="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle class="mt-0.5 size-3.5 shrink-0" />
            <span class="break-words">{importError}</span>
          </div>
        </div>
      {/if}

    </div>

    <!-- Restore action -->
    <div class="shrink-0 border-t border-border/40 p-3">
      {#if importPhase === 'idle'}
        <button
          type="button"
          disabled={!importSql || !importConfirmed}
          onclick={runImport}
          class="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          <Upload class="size-3.5" />
          Execute restore
        </button>
      {:else if importPhase === 'running'}
        <button disabled class="flex w-full items-center justify-center gap-2 rounded-md bg-primary/60 px-4 py-2 text-xs font-medium text-primary-foreground">
          <Loader class="size-3.5 animate-spin" />
          Running…
        </button>
      {:else}
        <button type="button" onclick={resetImport}
          class="flex w-full items-center justify-center gap-2 rounded-md border border-border/60 px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/20">
          New restore
        </button>
      {/if}
    </div>

  </div>
</div>
