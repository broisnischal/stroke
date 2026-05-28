<script>
  import Play from "@lucide/svelte/icons/play";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Braces from "@lucide/svelte/icons/braces";
  import Wand2 from "@lucide/svelte/icons/wand-2";
  import CheckCheck from "@lucide/svelte/icons/check-check";
  import X from "@lucide/svelte/icons/x";
  import Loader2 from "@lucide/svelte/icons/loader-2";
  import History from "@lucide/svelte/icons/history";
  import Bookmark from "@lucide/svelte/icons/bookmark";
  import Code2 from "@lucide/svelte/icons/code-2";
  import Plus from "@lucide/svelte/icons/plus";
  import SqlEditor from "./SqlEditor.svelte";
  import { sqlToDrizzle, sqlToPrisma } from "$lib/orm-builder.js";
  import QueryHistoryPanel from "./QueryHistoryPanel.svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { queryTitle } from "$lib/stores/query-history.js";
  import DataTable from "./DataTable.svelte";
  import DataTableSkeleton from "./DataTableSkeleton.svelte";
  import TableLoading from "./TableLoading.svelte";
  import ResizeHandle from "./ResizeHandle.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    clampSqlEditorHeight,
    loadLayout,
    saveLayout,
  } from "$lib/stores/layout.js";
  import { untrack } from "svelte";
  import { chatCompletionStream, parseAssistantMessage, buildSystemPrompt } from "$lib/ai.js";
  import { loadAiSettings } from "$lib/stores/ai-settings.js";

  /** @typedef {import('$lib/monaco-sql-complete.js').SqlSchemaHints} SqlSchemaHints */

  let {
    sql = $bindable("SELECT 1;"),
    columns = [],
    rows = [],
    queryMs = 0,
    message = "",
    loading = false,
    error = "",
    schemaHints = /** @type {SqlSchemaHints} */ ({}),
    schemaContext = /** @type {Parameters<typeof buildSystemPrompt>[0] | null} */ (null),
    onrun = () => {},
    onmodk = undefined,
    onmodenter = undefined,
    onmods = undefined,
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
  } = $props();

  /**
   * @typedef {{ id: string, name: string, content: string }} SqlTab
   */

  /** @type {SqlTab[]} */
  let sqlTabs = $state([{ id: crypto.randomUUID(), name: 'Query 1', content: sql }])
  let activeTabId = $state(sqlTabs[0].id)
  let tabCounter = $state(1)

  const activeTab = $derived(sqlTabs.find((t) => t.id === activeTabId) ?? sqlTabs[0])

  // Sentinel to break bidirectional sync cycles
  let _lastSyncedSql = sql

  // External write (history select, AI fix) → update active tab
  $effect(() => {
    const incoming = sql
    if (incoming !== _lastSyncedSql) {
      _lastSyncedSql = incoming
      untrack(() => {
        const tab = sqlTabs.find((t) => t.id === activeTabId)
        if (tab) tab.content = incoming
      })
    }
  })

  // Active tab content → sync back to bindable so parent stays in sync
  $effect(() => {
    const content = activeTab.content
    untrack(() => {
      if (content !== _lastSyncedSql) {
        _lastSyncedSql = content
        sql = content
      }
    })
  })

  function addTab() {
    tabCounter += 1
    const id = crypto.randomUUID()
    sqlTabs = [...sqlTabs, { id, name: `Query ${tabCounter}`, content: '' }]
    activeTabId = id
  }

  /** @param {string} id */
  function closeTab(id) {
    if (sqlTabs.length === 1) return
    const idx = sqlTabs.findIndex((t) => t.id === id)
    const next = sqlTabs[idx === 0 ? 1 : idx - 1]
    sqlTabs = sqlTabs.filter((t) => t.id !== id)
    if (activeTabId === id) activeTabId = next.id
  }

  let selected = $state(new Set());
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

  // AI fix state
  /** @type {'idle' | 'fixing' | 'done' | 'error'} */
  let fixStatus = $state('idle')
  let fixedSql = $state('')
  let fixExplanation = $state('')
  let fixErrMsg = $state('')
  /** @type {AbortController | null} */
  let fixAbort = $state(null)

  // Reset fix state when the error message or sql changes
  $effect(() => {
    // Track these two deps; read/write fixStatus outside tracking to avoid cycles
    error; sql
    untrack(() => {
      if (fixStatus !== 'idle') {
        fixAbort?.abort()
        fixStatus = 'idle'
        fixedSql = ''
        fixExplanation = ''
        fixErrMsg = ''
      }
    })
  })

  async function fixWithAi() {
    if (!error || !sql.trim()) return
    fixAbort?.abort()
    const ctrl = new AbortController()
    fixAbort = ctrl
    fixStatus = 'fixing'
    fixedSql = ''
    fixExplanation = ''
    fixErrMsg = ''

    try {
      const settings = loadAiSettings()
      const systemPrompt = schemaContext
        ? buildSystemPrompt(schemaContext)
        : 'You are an expert SQL assistant. Fix the SQL error provided. Return the corrected SQL in a ```sql code block.'

      // Build an explicit schema section so the AI sees exact column names/casing
      // even if the table hasn't been browsed yet.
      let schemaSection = ''
      if (schemaContext) {
        /** @param {{ name: string, dataType: string, nullable?: boolean }} c */
        const colLine = (c) => `  ${c.name}  ${c.dataType}${c.nullable === false ? '  NOT NULL' : ''}`
        const blocks = []
        const activeKey = schemaContext.activeTable
          ? `${schemaContext.activeSchema}.${schemaContext.activeTable}`
          : null
        if (schemaContext.activeTable && schemaContext.columns.length) {
          blocks.push(`${activeKey}:\n${schemaContext.columns.map(colLine).join('\n')}`)
        }
        for (const [key, cols] of Object.entries(schemaContext.allTableColumns ?? {})) {
          if (key === activeKey) continue
          blocks.push(`${key}:\n${cols.map(colLine).join('\n')}`)
        }
        if (blocks.length) {
          schemaSection = `\n\nDatabase schema (use column names EXACTLY as shown — casing matters in quoted identifiers):\n${blocks.join('\n\n')}`
        }
      }

      const userMsg =
        `Fix this SQL error.${schemaSection}\n\nError:\n${error}\n\nSQL:\n\`\`\`sql\n${sql.trim()}\n\`\`\`\n\n` +
        `Return the corrected SQL in a \`\`\`sql code block and a brief one-sentence explanation. ` +
        `Use column names exactly as shown in the schema above — do NOT normalize casing or guess column names.`

      let fullContent = ''

      for await (const chunk of chatCompletionStream(
        settings,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg },
        ],
        null,
        ctrl.signal,
      )) {
        if (chunk.textDelta) {
          fullContent += chunk.textDelta
          // Live-extract SQL as it streams in
          const parts = parseAssistantMessage(fullContent)
          const sqlPart = parts.find((p) => p.type === 'sql')
          if (sqlPart) fixedSql = sqlPart.content
        }
      }

      const parts = parseAssistantMessage(fullContent)
      const sqlPart = parts.find((p) => p.type === 'sql')
      const textPart = parts.find((p) => p.type === 'text')

      if (!sqlPart) throw new Error('AI did not return a SQL fix')

      fixedSql = sqlPart.content
      fixExplanation = textPart?.content ?? ''
      fixStatus = 'done'
    } catch (/** @type {any} */ e) {
      if (e?.name === 'AbortError') return
      fixErrMsg = String(e)
      fixStatus = 'error'
    }
  }

  function applyFix() {
    sql = fixedSql
    fixStatus = 'idle'
  }

  function dismissFix() {
    fixAbort?.abort()
    fixStatus = 'idle'
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

  function copyAsDrizzle() {
    const drizzle = sqlToDrizzle(sql)
    navigator.clipboard.writeText(drizzle).then(() => {
      ormCopied = 'drizzle'
      if (ormCopiedTimer) clearTimeout(ormCopiedTimer)
      ormCopiedTimer = setTimeout(() => { ormCopied = null }, 2000)
    })
  }

  function copyAsPrisma() {
    const prisma = sqlToPrisma(sql, [])
    navigator.clipboard.writeText(prisma).then(() => {
      ormCopied = 'prisma'
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
</script>

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
    class="studio-chrome flex h-9 shrink-0 items-center gap-2 border-b border-border bg-panel px-3"
    data-studio-chrome
  >
    <Button
      type="button"
      variant="default"
      size="sm"
      class="h-7 shrink-0 gap-2 pl-2.5 pr-2 font-medium shadow-sm"
      disabled={loading || !sql.trim()}
      onclick={() => onrun()}
    >
      <Play class="size-3.5 shrink-0" data-icon="inline-start" />
      Run
    </Button>

    <div class="h-4 w-px shrink-0 bg-border" aria-hidden="true"></div>

    <div class="flex min-w-0 items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
        disabled={loading || !sql.trim()}
        title="Re-run query"
        onclick={() => onrun()}
      >
        <RefreshCw class="size-3.5 shrink-0" />
        <span class="text-ui-xs">Refresh</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
        disabled={!sql.trim()}
        title="Format SQL"
        onclick={() => void formatSql?.()}
      >
        <Braces class="size-3.5 shrink-0" />
        <span class="text-ui-xs">Format</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class={queryHistoryVisible
          ? "h-7 gap-1.5 px-2 text-foreground"
          : "h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"}
        title="Query history"
        onclick={() => (queryHistoryVisible = !queryHistoryVisible)}
      >
        <History class="size-3.5 shrink-0" />
        <span class="text-ui-xs">History</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
        disabled={!sql.trim()}
        title="Save query"
        onclick={openSaveDialog}
      >
        <Bookmark class="size-3.5 shrink-0" />
        <span class="text-ui-xs">Save</span>
      </Button>

      <div class="h-4 w-px shrink-0 bg-border" aria-hidden="true"></div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
        disabled={!sql.trim()}
        title="Copy SQL as Drizzle ORM query"
        onclick={copyAsDrizzle}
      >
        {#if ormCopied === 'drizzle'}
          <CheckCheck class="size-3.5 shrink-0 text-green-500" />
        {:else}
          <Code2 class="size-3.5 shrink-0" />
        {/if}
        <span class="text-ui-xs">{ormCopied === 'drizzle' ? 'Copied!' : 'Drizzle'}</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
        disabled={!sql.trim()}
        title="Copy SQL as Prisma query"
        onclick={copyAsPrisma}
      >
        {#if ormCopied === 'prisma'}
          <CheckCheck class="size-3.5 shrink-0 text-green-500" />
        {:else}
          <Code2 class="size-3.5 shrink-0" />
        {/if}
        <span class="text-ui-xs">{ormCopied === 'prisma' ? 'Copied!' : 'Prisma'}</span>
      </Button>
    </div>

    <div class="ml-auto flex min-w-0 items-center gap-3">
      {#if queryMs > 0}
        <span class="shrink-0 font-mono text-ui-xs tabular-nums text-muted-foreground">
          {queryMs}ms
        </span>
      {/if}
      {#if message}
        <span class="min-w-0 truncate text-ui-xs text-muted-foreground">{message}</span>
      {/if}
    </div>
  </div>

  <!-- SQL Tabs -->
  <div class="flex h-8 shrink-0 items-stretch gap-0 overflow-x-auto border-b border-border bg-panel px-1" style="scrollbar-width:none">
    {#each sqlTabs as tab (tab.id)}
      {@const isActive = tab.id === activeTabId}
      <div
        class="group relative flex min-w-0 shrink-0 items-stretch"
      >
        <button
          type="button"
          class="flex min-w-0 items-center gap-1.5 rounded-t py-1 pl-3 font-mono text-ui-xs transition-colors {sqlTabs.length > 1 ? 'pr-5' : 'pr-3'} {isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'}"
          onclick={() => (activeTabId = tab.id)}
          title={tab.name}
        >
          <span class="max-w-[100px] truncate">{tab.name}</span>
        </button>
        {#if sqlTabs.length > 1}
          <button
            type="button"
            class="absolute right-1 top-1/2 -translate-y-1/2 flex size-4 items-center justify-center rounded opacity-0 transition-[opacity,color] hover:text-foreground group-hover:opacity-100 {isActive ? 'text-muted-foreground' : 'text-muted-foreground/60'}"
            onclick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
            title="Close tab"
          >
            <X class="size-2.5" />
          </button>
        {/if}
      </div>
    {/each}
    <button
      type="button"
      class="flex shrink-0 items-center justify-center px-1.5 text-muted-foreground/50 transition-colors hover:text-foreground"
      onclick={addTab}
      title="New tab"
    >
      <Plus class="size-3.5" />
    </button>
  </div>

  <div
    class="relative shrink-0 overflow-hidden border-b border-border bg-panel"
    style="height: {editorHeight}px"
  >
    <SqlEditor
      bind:value={activeTab.content}
      class="absolute inset-0"
      {schemaHints}
      {onmodk}
      onmodenter={onmodenter ?? (() => onrun())}
      onmodr={() => onrun()}
      {onmods}
      onchange={(content) => {
        if (content !== _lastSyncedSql) {
          _lastSyncedSql = content
          sql = content
        }
      }}
      onactionsready={(actions) => {
        formatSql = actions.format;
      }}
    />
  </div>

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

  {#if error}
    <!-- Console-style error strip between editor and results -->
    <div class="shrink-0 border-b border-destructive/20 bg-destructive/5">
      <div class="flex items-start gap-2 px-3 py-2">
        <span class="mt-px shrink-0 font-mono text-ui-2xs font-bold uppercase tracking-wide text-destructive/70">error</span>
        <pre class="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-ui-xs leading-relaxed text-destructive">{error}</pre>
        <div class="flex shrink-0 items-center gap-1.5">
          {#if fixStatus === 'idle' || fixStatus === 'error'}
            <button
              type="button"
              onclick={() => void fixWithAi()}
              class="inline-flex items-center gap-1 rounded border border-destructive/25 bg-destructive/8 px-2 py-0.5 font-mono text-ui-2xs text-destructive transition-colors hover:bg-destructive/15"
            >
              <Wand2 class="size-2.5 shrink-0" />
              fix with ai
            </button>
          {:else if fixStatus === 'fixing'}
            <button
              type="button"
              onclick={dismissFix}
              class="inline-flex items-center gap-1 rounded border border-destructive/25 bg-destructive/8 px-2 py-0.5 font-mono text-ui-2xs text-destructive/60"
            >
              <Loader2 class="size-2.5 shrink-0 animate-spin" />
              fixing…
            </button>
          {:else if fixStatus === 'done'}
            <button
              type="button"
              onclick={dismissFix}
              class="inline-flex items-center justify-center rounded border border-border/60 px-2 py-0.5 font-mono text-ui-2xs text-muted-foreground transition-colors hover:bg-muted"
            >
              <X class="size-2.5" />
            </button>
          {/if}
        </div>
      </div>

      {#if fixStatus === 'fixing' && fixedSql}
        <div class="border-t border-destructive/10 px-3 py-2">
          <p class="mb-1 font-mono text-ui-2xs text-muted-foreground">generating fix…</p>
          <pre class="overflow-x-auto rounded bg-muted/60 px-2.5 py-2 font-mono text-ui-xs leading-relaxed text-foreground">{fixedSql}</pre>
        </div>
      {/if}

      {#if fixStatus === 'done'}
        <div class="border-t border-destructive/10 px-3 py-2">
          <div class="flex items-center gap-2 pb-1.5">
            <Wand2 class="size-3 shrink-0 text-primary/60" />
            <span class="flex-1 font-mono text-ui-2xs text-muted-foreground">{fixExplanation || 'suggested fix'}</span>
          </div>
          <pre class="overflow-x-auto rounded bg-muted/60 px-2.5 py-2 font-mono text-ui-xs leading-relaxed text-foreground">{fixedSql}</pre>
          <div class="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onclick={dismissFix}
              class="font-mono text-ui-2xs text-muted-foreground transition-colors hover:text-foreground"
            >dismiss</button>
            <button
              type="button"
              onclick={applyFix}
              class="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 font-mono text-ui-2xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <CheckCheck class="size-2.5 shrink-0" />
              apply fix
            </button>
          </div>
        </div>
      {/if}

      {#if fixStatus === 'error'}
        <p class="border-t border-destructive/10 px-3 pb-2 font-mono text-ui-2xs text-destructive/70">{fixErrMsg}</p>
      {/if}
    </div>
  {/if}

  <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
    {#if columns.length > 0}
      <DataTable {columns} {rows} {loading} bind:selected />
    {:else if loading}
      <TableLoading />
    {:else}
      <div class="flex h-full flex-col items-center justify-center gap-2 text-center">
        <Play class="size-6 text-muted-foreground/20" />
        <p class="font-mono text-ui-sm text-muted-foreground/50">
          Run a query to see results
        </p>
      </div>
    {/if}
  </div>
  </div>
</div>

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
