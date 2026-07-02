<script>
  import Play from "@lucide/svelte/icons/play";
  import WifiOff from "@lucide/svelte/icons/wifi-off";
  import Braces from "@lucide/svelte/icons/braces";
  import Wand2 from "@lucide/svelte/icons/wand-2";
  import CheckCheck from "@lucide/svelte/icons/check-check";
  import Loader2 from "@lucide/svelte/icons/loader-2";
  import History from "@lucide/svelte/icons/history";
  import Bookmark from "@lucide/svelte/icons/bookmark";
  import Code2 from "@lucide/svelte/icons/code-2";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Download from "@lucide/svelte/icons/download";
  import Table2 from "@lucide/svelte/icons/table-2";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { cn, isNetworkError } from "$lib/utils.js";
  import { hasPro } from '$lib/stores/license.js'
  import SqlEditor from "./SqlEditor.svelte";
  import { sqlToDrizzle, sqlToPrisma } from "$lib/orm-builder.js";
  import QueryHistoryPanel from "./QueryHistoryPanel.svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { queryTitle } from "$lib/stores/query-history.js";
  import DataTable from "./DataTable.svelte";
  import TableLoading from "./TableLoading.svelte";
  import JsonViewer from "./JsonViewer.svelte";
  import ChartView from "./ChartView.svelte";
  import BarChart2 from "@lucide/svelte/icons/bar-chart-2";
  import ScanSearch from "@lucide/svelte/icons/scan-search";
  import ResizeHandle from "./ResizeHandle.svelte";
  import ExplainPlan from "./ExplainPlan.svelte";
  import { explainSql, cancelQuery } from "$lib/api.js";
  import Square from "@lucide/svelte/icons/square";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    clampSqlEditorHeight,
    loadLayout,
    saveLayout,
  } from "$lib/stores/layout.js";
  import { untrack, onDestroy } from "svelte";
  import { buildSystemPrompt } from "$lib/ai.js";
  import { formatCompactCount } from "$lib/table-list.js";

  /** @typedef {import('$lib/monaco-sql-complete.js').SqlSchemaHints} SqlSchemaHints */

  let {
    /** Whether the SQL tab is the active/visible tab — gates global hotkeys. */
    active = true,
    sql = $bindable("SELECT 1;"),
    columns = [],
    rows = [],
    queryMs = 0,
    message = "",
    loading = false,
    error = "",
    /** @type {any[]} */
    multiResults = [],
    schemaHints = /** @type {SqlSchemaHints} */ ({}),
    schemaContext = /** @type {Parameters<typeof buildSystemPrompt>[0] | null} */ (null),
    /** Run SQL — receives a single-statement override, or undefined to run the whole buffer. */
    onrun = (/** @type {string | undefined} */ statementSql) => {},
    onmodk = undefined,
    onmods = undefined,
    onmodi = undefined,
    onmodb = undefined,
    onmodw = undefined,
    onmodn = undefined,
    onmodm = undefined,
    onmodt = undefined,
    onmodshifte = undefined,
    onmodshiftd = undefined,
    onmodshifto = undefined,
    onmodshiftb = undefined,
    queryHistoryVisible = $bindable(false),
    /** @type {import('$lib/stores/query-history.js').QueryHistoryEntry[]} */
    queryHistory = [],
    /** @type {import('$lib/stores/query-history.js').SavedQuery[]} */
    savedQueries = [],
    onqueryrefresh = async () => {},
    /** @param {string} sql */
    onhistoryselect = (sql) => {},
    /** @param {string} name @param {string} sql */
    onsavequery = async (name, sql) => {},
    /** Called when user clicks "Fix with AI" — parent opens sidebar and sends the message */
    /** @param {{ error: string, sql: string }} detail */
    onfixwithai = /** @type {((detail: { error: string, sql: string }) => void) | undefined} */ (undefined),
    onprorequired = /** @type {() => void} */ (() => {}),
  } = $props();

  /** @type {{ focus: () => void, markExecuted: (ranStatement?: string | null) => void } | null} */
  let sqlEditorRef = $state(null)

  /** Focus the SQL editor — called by the parent when this tab becomes active. */
  export function focusEditor() {
    sqlEditorRef?.focus()
  }

  /**
   * Replace the editor content with `content` and focus it. Used by
   * "Open in SQL editor" and history/AI flows.
   * @param {string} content
   */
  export function openQuery(content) {
    sql = content
    queueMicrotask(() => sqlEditorRef?.focus())
  }

  /** The statement that ran last (⌘R), or null when the whole buffer ran. */
  let lastRanStatement = /** @type {string | null} */ (null)

  /** @param {string | undefined} statementSql */
  function handleRun(statementSql) {
    const single = typeof statementSql === 'string' && statementSql.trim() ? statementSql : undefined
    lastRanStatement = single ?? null
    onrun(single)
  }

  // ── Result view state ───────────────────────────────────────────────────────
  /** @type {'table' | 'chart' | 'json' | 'explain'} */
  let outputView = $state('table')
  let chartType = $state('bar')
  let activeResultIdx = $state(0)
  /** @type {object | null} */
  let explainResult = $state(null)
  let explainLoading = $state(false)
  let explainError = $state('')
  let selected = $state(new Set())

  /** @typedef {{ columns: any[], rows: any[][], message: string, queryMs: number }} ResultSet */

  /** One entry per statement when the last run executed multiple statements. */
  const resultSets = $derived(
    (multiResults?.length ?? 0) > 1
      ? multiResults.map((res) => /** @type {ResultSet} */ ({
          columns: res.columns ?? [],
          rows: res.rows ?? [],
          message: res.message ?? '',
          queryMs: res.query_ms ?? res.queryMs ?? 0,
        }))
      : []
  )

  // A new run replaces the previous results: reset selection and result-set
  // index, and leave the explain view (it shows the previous query's plan).
  $effect(() => {
    if (!loading) return
    untrack(() => {
      selected = new Set()
      activeResultIdx = 0
      if (outputView === 'explain') outputView = 'table'
    })
  })

  // When a run finishes without an error, mark the executed statement(s) with
  // a ✓ in the editor gutter (⌘R marks one, Run marks all).
  let wasLoading = false
  $effect(() => {
    const l = loading
    const err = error
    untrack(() => {
      if (wasLoading && !l && !err) sqlEditorRef?.markExecuted?.(lastRanStatement)
      wasLoading = l
    })
  })

  const currentDisplay = $derived.by(() => {
    if (resultSets.length > 1) {
      const idx = Math.min(activeResultIdx, resultSets.length - 1)
      const s = resultSets[idx]
      return { columns: s.columns, rows: s.rows, queryMs: s.queryMs, message: s.message }
    }
    return { columns, rows, queryMs, message }
  })

  async function handleExplain() {
    const querySql = sql.trim()
    if (!querySql) return
    outputView = 'explain'
    explainLoading = true
    explainError = ''
    explainResult = null
    if (!outputVisible) outputVisible = true
    try {
      explainResult = await explainSql(querySql)
    } catch (e) {
      explainError = String(e)
    } finally {
      explainLoading = false
    }
  }

  let outputVisible = $state(
    (() => { try { return localStorage.getItem('sql-output-visible') !== 'false' } catch { return true } })()
  )

  function toggleOutput() {
    outputVisible = !outputVisible
    try { localStorage.setItem('sql-output-visible', String(outputVisible)) } catch {}
  }

  $effect(() => {
    /** @param {KeyboardEvent} e */
    function onKey(e) {
      // SqlConsole stays mounted (keep-alive) on other tabs; only handle these
      // window-level shortcuts when the SQL tab is actually visible.
      if (!active) return
      const mod = e.metaKey || e.ctrlKey
      if (!mod || e.altKey) return
      if (e.key === 'j' && !e.shiftKey) {
        e.preventDefault()
        toggleOutput()
      } else if ((e.key === 'b' || e.key === 'B') && e.shiftKey) {
        e.preventDefault()
        queryHistoryVisible = !queryHistoryVisible
        onmodshiftb?.()
      } else if (e.key === 's' && !e.shiftKey) {
        e.preventDefault()
        openSaveDialog()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const rowObjects = $derived(
    currentDisplay.columns.length > 0 && currentDisplay.rows.length > 0
      ? currentDisplay.rows.map((row) =>
          Object.fromEntries(
            /** @type {any[]} */ (currentDisplay.columns).map((col, i) => [col.name ?? col, /** @type {any[]} */ (row)[i]])
          )
        )
      : []
  )

  const jsonText = $derived(rowObjects.length > 0 ? JSON.stringify(rowObjects, null, 2) : '[]')

  // ── Export helpers ──────────────────────────────────────────────────────────
  /** Escape a value for CSV (RFC 4180). */
  function _csvCell(v) {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function exportCsv() {
    const cols = currentDisplay.columns.map(c => c.name ?? String(c))
    const header = cols.map(_csvCell).join(',')
    const body = currentDisplay.rows.map(r =>
      /** @type {any[]} */ (r).map(_csvCell).join(',')
    ).join('\n')
    downloadBlob(header + '\n' + body, 'query-result.csv', 'text/csv')
  }

  function exportJson() {
    downloadBlob(jsonText, 'query-result.json', 'application/json')
  }

  /** @type {HTMLElement | null} */
  let consoleEl = $state(null);
  const initialLayout = loadLayout();
  let editorHeight = $state(initialLayout.sqlEditorHeight);
  let resizeStartHeight = initialLayout.sqlEditorHeight;
  /** @type {(() => Promise<void>) | null} */
  let formatSql = $state(null);

  let saveDialogOpen = $state(false);
  let saveQueryName = $state('');
  let savingQuery = $state(false);

  function fixWithAi() {
    if (!error || !sql.trim()) return
    onfixwithai?.({ error, sql: sql.trim() })
  }

  const isMac =
    typeof navigator !== "undefined" &&
    navigator.platform.toUpperCase().includes("MAC");
  const mod = isMac ? "⌘" : "Ctrl";

  /** @param {number} height */
  function clampEditorHeight(height) {
    return clampSqlEditorHeight(height, consoleEl?.clientHeight ?? 0);
  }

  function openSaveDialog() {
    saveQueryName = queryTitle(sql);
    saveDialogOpen = true;
  }

  let ormCopied = $state(/** @type {'drizzle' | 'prisma' | null} */ (null))
  /** @type {ReturnType<typeof setTimeout> | null} */
  let ormCopiedTimer = null
  /** @type {AbortController | null} */
  let fixAbort = null

  /** @param {'drizzle' | 'prisma'} kind */
  function copyAsOrm(kind) {
    const code = kind === 'drizzle' ? sqlToDrizzle(sql) : sqlToPrisma(sql, [])
    navigator.clipboard.writeText(code).then(() => {
      ormCopied = kind
      if (ormCopiedTimer) clearTimeout(ormCopiedTimer)
      ormCopiedTimer = setTimeout(() => { ormCopied = null }, 2000)
    })
  }

  async function confirmSaveQuery() {
    if (!sql.trim() || savingQuery) return;
    savingQuery = true;
    try {
      await onsavequery(saveQueryName, sql);
      saveDialogOpen = false;
    } finally {
      savingQuery = false;
    }
  }

  onDestroy(() => {
    // Abort any in-flight AI fix request so it doesn't stream into a dead component
    fixAbort?.abort()
    // Clear ORM copy feedback timer so it doesn't fire after unmount
    if (ormCopiedTimer) clearTimeout(ormCopiedTimer)
  })
</script>

{#snippet kbd(/** @type {string} */ k)}
  <kbd class="inline-flex h-[17px] min-w-[17px] items-center justify-center rounded border border-border/70 bg-muted/60 px-1 font-mono text-[10px] font-medium leading-none text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]">{k}</kbd>
{/snippet}

{#snippet hint(/** @type {string} */ label, /** @type {string} */ desc, /** @type {string[]} */ keys = [])}
  <div class="flex max-w-[240px] flex-col gap-1">
    <div class="flex items-center justify-between gap-4">
      <span class="text-ui-xs font-medium text-foreground">{label}</span>
      {#if keys.length}
        <span class="flex shrink-0 items-center gap-0.5">
          {#each keys as k (k)}{@render kbd(k)}{/each}
        </span>
      {/if}
    </div>
    {#if desc}
      <p class="text-ui-2xs leading-relaxed text-muted-foreground">{desc}</p>
    {/if}
  </div>
{/snippet}

<Tooltip.Provider delayDuration={250} disableHoverableContent>
<div class="flex min-h-0 flex-1 overflow-hidden">
  <QueryHistoryPanel
    bind:visible={queryHistoryVisible}
    history={queryHistory}
    saved={savedQueries}
    onselect={(text) => onhistoryselect(text)}
    onrefresh={onqueryrefresh}
    onclose={() => (queryHistoryVisible = false)}
  />

  <div bind:this={consoleEl} class="flex min-h-0 min-w-0 flex-1 flex-col">
  <div
    class="studio-chrome flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-panel px-2"
    data-studio-chrome
  >
    {#if loading}
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              type="button"
              variant="destructive"
              size="sm"
              class="h-7 shrink-0 gap-2 pl-2.5 pr-2 font-medium shadow-sm"
              onclick={() => void cancelQuery()}
            >
              <Square class="size-3 shrink-0 fill-current" data-icon="inline-start" />
              Stop
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>
          {@render hint('Stop', 'Cancel the running query.')}
        </Tooltip.Content>
      </Tooltip.Root>
    {:else}
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              type="button"
              variant="default"
              size="sm"
              class="h-7 shrink-0 gap-2 pl-2.5 pr-2 font-medium shadow-sm"
              disabled={!sql.trim()}
              onclick={() => handleRun(undefined)}
            >
              <Play class="size-3.5 shrink-0" data-icon="inline-start" />
              Run
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>
          {@render hint(
            'Run query',
            `Runs every statement — each gets its own result tab. ${mod}R runs only the statement under the cursor, ${mod}L selects it.`,
            [mod, '↵'],
          )}
        </Tooltip.Content>
      </Tooltip.Root>
    {/if}

    <div class="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden="true"></div>

    <div class="flex min-w-0 items-center gap-0.5">
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              type="button"
              variant="ghost"
              size="sm"
              class="size-7 p-0 text-muted-foreground hover:text-foreground"
              disabled={!sql.trim()}
              onclick={() => void formatSql?.()}
            >
              <Braces class="size-3.5 shrink-0" />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>
          {@render hint('Format SQL', 'Reformat the whole editor with consistent casing and indentation.')}
        </Tooltip.Content>
      </Tooltip.Root>

      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              type="button"
              variant="ghost"
              size="sm"
              class="size-7 p-0 text-muted-foreground hover:text-foreground"
              disabled={!sql.trim()}
              onclick={openSaveDialog}
            >
              <Bookmark class="size-3.5 shrink-0" />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>
          {@render hint('Save query', 'Keep this query for later — saved queries live in History → Saved, per connection.', [mod, 'S'])}
        </Tooltip.Content>
      </Tooltip.Root>

      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              type="button"
              variant="ghost"
              size="sm"
              class={cn(
                'size-7 p-0 hover:text-foreground',
                queryHistoryVisible ? 'text-foreground' : 'text-muted-foreground',
              )}
              onclick={() => (queryHistoryVisible = !queryHistoryVisible)}
            >
              <History class="size-3.5 shrink-0" />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>
          {@render hint('Query history', 'Browse and re-run everything you have executed, plus your saved queries.', [mod, '⇧', 'B'])}
        </Tooltip.Content>
      </Tooltip.Root>

      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              type="button"
              variant="ghost"
              size="sm"
              class={cn(
                'size-7 p-0 hover:text-foreground',
                outputView === 'explain' ? 'text-foreground' : 'text-muted-foreground',
              )}
              disabled={!sql.trim() || explainLoading}
              onclick={handleExplain}
            >
              {#if explainLoading}
                <Loader2 class="size-3.5 shrink-0 animate-spin" />
              {:else}
                <ScanSearch class="size-3.5 shrink-0" />
              {/if}
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>
          {@render hint('Explain plan', 'Visualize how the database executes this query — spot slow scans and missing indexes.')}
        </Tooltip.Content>
      </Tooltip.Root>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          class="flex h-7 items-center gap-1 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          disabled={!sql.trim()}
          title="Copy as ORM query — Drizzle or Prisma"
        >
          {#if ormCopied}
            <CheckCheck class="size-3.5 shrink-0 text-green-500" />
          {:else}
            <Code2 class="size-3.5 shrink-0" />
          {/if}
          <ChevronDown class="size-3 shrink-0 opacity-50" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start" class="min-w-36">
          <DropdownMenu.Item class="gap-2 font-mono text-xs" onclick={() => copyAsOrm('drizzle')}>
            <Code2 class="size-3.5 shrink-0 text-muted-foreground/50" />
            Copy as Drizzle
          </DropdownMenu.Item>
          <DropdownMenu.Item class="gap-2 font-mono text-xs" onclick={() => copyAsOrm('prisma')}>
            <Code2 class="size-3.5 shrink-0 text-muted-foreground/50" />
            Copy as Prisma
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  </div>

  <div
    class={outputVisible
      ? "relative shrink-0 overflow-hidden bg-panel"
      : "relative min-h-0 flex-1 overflow-hidden bg-panel"}
    style={outputVisible ? `height: ${editorHeight}px` : undefined}
  >
    <SqlEditor
      bind:this={sqlEditorRef}
      bind:value={sql}
      class="absolute inset-0"
      {schemaHints}
      {onmodk}
      onmodenter={() => handleRun(undefined)}
      onrunstatement={(stmt) => handleRun(stmt)}
      onmods={openSaveDialog}
      {onmodi}
      {onmodb}
      {onmodw}
      {onmodn}
      {onmodm}
      {onmodt}
      {onmodshifte}
      {onmodshiftd}
      {onmodshifto}
      onmodj={toggleOutput}
      onmodshiftb={() => { queryHistoryVisible = !queryHistoryVisible; onmodshiftb?.() }}
      onactionsready={(actions) => {
        formatSql = actions.format;
      }}
    />
  </div>

  {#if outputVisible}
  <ResizeHandle
    axis="y"
    edge="end"
    onresizestart={() => {
      resizeStartHeight = editorHeight;
    }}
    onresize={(dy) => {
      editorHeight = clampEditorHeight(resizeStartHeight + dy);
    }}
    onresizeend={() => {
      resizeStartHeight = editorHeight;
      saveLayout({ sqlEditorHeight: editorHeight });
    }}
  />
  {/if}

  {#if error}
    {#if isNetworkError(error)}
      <!-- Network / offline error -->
      <div class="flex shrink-0 items-center gap-2.5 border-b border-border/30 bg-muted/20 px-3 py-2">
        <WifiOff class="size-3.5 shrink-0 text-muted-foreground/40" />
        <p class="min-w-0 flex-1 font-mono text-ui-xs text-muted-foreground/70">Cannot reach database — check your connection and try again.</p>
      </div>
    {:else}
      <!-- SQL / application error strip -->
      <div class="shrink-0 border-b border-destructive/20 bg-destructive/5">
        <div class="flex items-start gap-2 px-3 py-2">
          <span class="mt-px shrink-0 font-mono text-ui-2xs font-bold uppercase tracking-wide text-destructive/70">error</span>
          <pre class="max-h-24 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-all font-mono text-ui-xs leading-relaxed text-destructive">{error}</pre>
          {#if onfixwithai}
            <button
              type="button"
              onclick={fixWithAi}
              class="inline-flex shrink-0 items-center gap-1 rounded border border-destructive/25 bg-destructive/8 px-2 py-0.5 font-mono text-ui-2xs text-destructive transition-colors hover:bg-destructive/15"
            >
              <Wand2 class="size-2.5 shrink-0" />
              Fix with AI
            </button>
          {/if}
        </div>
      </div>
    {/if}
  {/if}

  <!-- Output panel: header always visible, content toggles with Cmd+J -->
  <div class={outputVisible ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "flex shrink-0 flex-col"}>
    <!-- Output tab bar -->
    <div
      class="studio-chrome flex h-8 shrink-0 items-stretch border-b border-border bg-panel"
      data-studio-chrome
    >
      <!-- Result-set selector tabs (only when multi-result) -->
      {#if resultSets.length > 1}
        {#each resultSets as _rs, i (i)}
          {@const rsActive = Math.min(activeResultIdx, resultSets.length - 1) === i}
          <button
            type="button"
            onclick={() => (activeResultIdx = i)}
            class={cn(
              'relative flex items-center border-b-2 px-2.5 font-mono text-ui-xs transition-colors',
              rsActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground/50 hover:text-muted-foreground',
            )}
          >
            Result {i + 1}
          </button>
        {/each}
        <div class="mx-1.5 h-3.5 w-px shrink-0 self-center bg-border/60"></div>
      {/if}

      <!-- View tabs (icon-only) -->
      <div class="flex items-center gap-0.5 px-1">
        {#each [
          { id: 'table',   label: 'Table',   Icon: Table2,    pro: false },
          { id: 'chart',   label: 'Chart',   Icon: BarChart2, pro: true },
          { id: 'json',    label: 'JSON',    Icon: Braces,    pro: true },
          { id: 'explain', label: 'Explain', Icon: ScanSearch, pro: true },
        ] as tab (tab.id)}
          {@const locked = tab.pro && !$hasPro}
          {@const tabActive = !locked && outputVisible && outputView === tab.id}
          {@const Icon = tab.Icon}
          <button
            type="button"
            onclick={() => {
              if (locked) { onprorequired(); return }
              if (tab.id === 'explain') { void handleExplain() }
              else { outputView = /** @type {'table'|'chart'|'json'} */ (tab.id); if (!outputVisible) toggleOutput() }
            }}
            class={cn(
              'flex size-7 items-center justify-center rounded transition-colors',
              locked
                ? 'cursor-not-allowed opacity-40 text-muted-foreground/30'
                : tabActive ? 'bg-muted/70 text-foreground' : 'text-muted-foreground/50 hover:bg-muted/40 hover:text-muted-foreground',
            )}
            title="{tab.label} view{locked ? ' · Stroke Pro' : ''}"
          >
            <Icon class="size-3.5 shrink-0" />
          </button>
        {/each}
      </div>

      <!-- Right: metadata + toggle -->
      <div class="ml-auto flex shrink-0 items-center gap-3 pr-1.5">
        {#if outputVisible && currentDisplay.rows.length > 0}
          <span class="font-mono text-ui-2xs tabular-nums text-muted-foreground">{formatCompactCount(currentDisplay.rows.length)} rows</span>
        {/if}
        {#if outputVisible && currentDisplay.queryMs > 0}
          <span class="font-mono text-ui-2xs tabular-nums text-muted-foreground">{currentDisplay.queryMs}ms</span>
        {/if}
        {#if outputVisible && currentDisplay.message}
          <span class="max-w-[160px] truncate font-mono text-ui-2xs text-muted-foreground">{currentDisplay.message}</span>
        {/if}

        <!-- Export dropdown — only when there are results -->
        {#if outputVisible && currentDisplay.rows.length > 0}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              class="flex size-6 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-muted/60 hover:text-foreground"
              title="Export results"
            >
              <Download class="size-3.5" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" class="min-w-36">
              <DropdownMenu.Item class="gap-2 font-mono text-xs" onclick={exportCsv}>
                <Download class="size-3.5 shrink-0 text-muted-foreground/50" />
                Export CSV
              </DropdownMenu.Item>
              <DropdownMenu.Item class="gap-2 font-mono text-xs" onclick={exportJson}>
                <Download class="size-3.5 shrink-0 text-muted-foreground/50" />
                Export JSON
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {/if}

        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                onclick={toggleOutput}
                class="inline-flex size-5 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <ChevronDown class={cn('size-3.5 transition-transform duration-150', outputVisible ? '' : 'rotate-180')} />
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="top" align="end">
            {@render hint(outputVisible ? 'Hide results' : 'Show results', 'Collapse the results panel to give the editor the full height.', [mod, 'J'])}
          </Tooltip.Content>
        </Tooltip.Root>
      </div>
    </div>

    {#if outputVisible}
      <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
        {#key `${outputView}:${Math.min(activeResultIdx, Math.max(resultSets.length - 1, 0))}`}
          {#if outputView === 'explain'}
            {#if explainLoading}
              <TableLoading />
            {:else if explainError}
              <div class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <p class="font-mono text-ui-xs text-destructive/70">{explainError}</p>
              </div>
            {:else if explainResult}
              <ExplainPlan result={explainResult} />
            {:else}
              <div class="flex h-full flex-col items-center justify-center gap-2 text-center">
                <ScanSearch class="size-6 text-muted-foreground/20" />
                <p class="font-mono text-ui-sm text-muted-foreground/50">Click Explain to analyze the query plan</p>
              </div>
            {/if}
          {:else if currentDisplay.columns.length > 0}
            {#if outputView === 'json'}
              <JsonViewer json={jsonText} rowCount={currentDisplay.rows.length} onshowtable={() => (outputView = 'table')} />
            {:else if outputView === 'chart'}
              <ChartView
                columns={currentDisplay.columns}
                rows={currentDisplay.rows}
                {sql}
                initialChartType={chartType}
                oncharttypechange={(t) => (chartType = t)}
              />
            {:else}
              <DataTable columns={currentDisplay.columns} rows={currentDisplay.rows} {loading} bind:selected />
            {/if}
          {:else if loading}
            <TableLoading />
          {:else}
            <div class="flex h-full flex-col items-center justify-center gap-2 text-center">
              <Play class="size-6 text-muted-foreground/20" />
              <p class="font-mono text-ui-sm text-muted-foreground/50">Run a query to see results</p>
            </div>
          {/if}
        {/key}
      </div>
    {/if}
  </div>
  </div>
</div>
</Tooltip.Provider>

<Dialog.Root bind:open={saveDialogOpen}>
  <Dialog.Content class="max-w-md gap-4">
    <Dialog.Header>
      <Dialog.Title class="text-sm font-semibold">Save query</Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        Saved queries are stored per connection and appear in History → Saved.
      </Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-2">
      <Label for="save-query-name" class="text-ui-xs">Name</Label>
      <Input
        id="save-query-name"
        bind:value={saveQueryName}
        class="font-mono text-ui-sm"
        placeholder="Query name"
        onkeydown={(e) => {
          if (e.key === 'Enter') void confirmSaveQuery()
        }}
      />
    </div>
    <Dialog.Footer class="gap-2 sm:justify-end">
      <Button type="button" variant="outline" size="sm" onclick={() => (saveDialogOpen = false)}>
        Cancel
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={!sql.trim() || savingQuery}
        onclick={() => void confirmSaveQuery()}
      >
        {savingQuery ? 'Saving…' : 'Save'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
