<script>
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import Icon from './Icon.svelte'
  import ShikiBlock from './ShikiBlock.svelte'
  import { cn } from '$lib/utils.js'
  import { getTableRows, getTableDdl } from '$lib/api.js'
  import { readRowsResponse } from '$lib/table-query.js'
  import {
    genSelectStar,
    genSelectFields,
    genInsert,
    genUpdate,
    genDelete,
    genUpsert,
  } from '$lib/sql-generate.js'

  /**
   * "Generate SQL" — ready-to-paste statement skeletons for a table (create /
   * select / insert / update / delete / upsert), with `:name` placeholders and
   * the same per-engine identifier quoting the grid's own writes use.
   */
  let {
    open = $bindable(false),
    schema = 'public',
    /** @type {string | null} */
    table = null,
    /** @type {import('$lib/dml-preview.js').Dialect} */
    dialect = 'postgres',
    /** @type {(sql: string) => void} */
    onopeninsql = () => {},
  } = $props()

  let loading = $state(false)
  let error = $state('')
  /** @type {Array<{ name: string, dataType?: string }>} */
  let columns = $state([])
  /** @type {string[]} */
  let primaryKey = $state([])
  let ddl = $state('')
  let activeTab = $state('create')
  let requestSeq = 0

  $effect(() => {
    if (!open || !table) return
    const t = table
    const s = schema
    const req = ++requestSeq
    loading = true
    error = ''
    columns = []
    primaryKey = []
    ddl = ''
    Promise.all([
      getTableRows(s, t, 1, 0, { includeCount: false }),
      getTableDdl(s, t).catch(() => ''),
    ])
      .then(([rowsRes, ddlText]) => {
        if (req !== requestSeq) return
        const data = readRowsResponse(rowsRes)
        columns = data.columns
        primaryKey = data.primaryKey
        ddl = typeof ddlText === 'string' ? ddlText.trim() : ''
        activeTab = ddl ? 'create' : 'select'
      })
      .catch((e) => {
        if (req === requestSeq) error = String(e?.message ?? e)
      })
      .finally(() => {
        if (req === requestSeq) loading = false
      })
  })

  const tabs = $derived.by(() => {
    if (!table || columns.length === 0) return []
    const ctx = { dialect, schema, table, columns, primaryKey }
    /** @type {Array<{ id: string, label: string, icon: string, sql: string }>} */
    const out = []
    if (ddl) out.push({ id: 'create', label: 'Create Table', icon: 'table-2', sql: ddl })
    out.push({ id: 'select', label: 'Select *', icon: 'eye', sql: genSelectStar(ctx) })
    out.push({ id: 'fields', label: 'Select [fields]', icon: 'columns-3', sql: genSelectFields(ctx) })
    out.push({ id: 'insert', label: 'Insert', icon: 'plus', sql: genInsert(ctx) })
    out.push({ id: 'update', label: 'Update', icon: 'pencil', sql: genUpdate(ctx) })
    out.push({ id: 'delete', label: 'Delete', icon: 'trash-2', sql: genDelete(ctx) })
    const upsert = genUpsert(ctx)
    if (upsert) out.push({ id: 'upsert', label: 'Upsert', icon: 'refresh-cw', sql: upsert })
    return out
  })

  const currentSql = $derived(
    tabs.find((t) => t.id === activeTab)?.sql ?? tabs[0]?.sql ?? '',
  )

  let copied = $state(false)
  /** @type {ReturnType<typeof setTimeout> | null} */
  let copiedTimer = null

  function handleCopy() {
    navigator.clipboard.writeText(currentSql).then(() => {
      copied = true
      if (copiedTimer) clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => { copied = false }, 2000)
    })
  }

  function handleOpenInEditor() {
    if (!currentSql) return
    onopeninsql(currentSql)
    open = false
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="w-[min(760px,calc(100vw-2rem))] gap-0 overflow-hidden p-0 sm:max-w-none">
    <!-- Header -->
    <div class="flex items-center gap-2.5 border-b border-border px-4 py-3">
      <span class="inline-flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon name="code-2" class="size-3.5" />
      </span>
      <Dialog.Title class="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
        Generated SQL: <span class="font-mono">{table}</span>
      </Dialog.Title>
      <span class="shrink-0 rounded border border-border/60 px-1.5 py-0.5 font-mono text-ui-3xs uppercase text-muted-foreground/70">{dialect}</span>
    </div>

    <!-- Statement tabs -->
    <div class="flex items-center gap-0.5 overflow-x-auto border-b border-border/60 bg-panel/50 px-2 py-1.5">
      {#each tabs as t (t.id)}
        <button
          type="button"
          class={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-ui-xs transition-colors',
            activeTab === t.id
              ? 'bg-muted font-medium text-foreground'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          )}
          onclick={() => (activeTab = t.id)}
        >
          <Icon name={t.icon} class="size-3" />
          {t.label}
        </button>
      {/each}
    </div>

    <!-- SQL body -->
    <div class="h-[360px] min-h-0 overflow-auto bg-panel">
      {#if loading}
        <div class="flex h-full items-center justify-center">
          <Icon name="loader-2" class="size-4 animate-spin text-muted-foreground" />
        </div>
      {:else if error}
        <div class="flex h-full items-center justify-center px-6 text-center">
          <p class="font-mono text-ui-xs text-destructive">{error}</p>
        </div>
      {:else if currentSql}
        {#key activeTab}
          <ShikiBlock code={currentSql} lang="sql" />
        {/key}
      {/if}
    </div>

    <!-- Footer -->
    <div class="flex items-center gap-2 border-t border-border px-4 py-2.5">
      <p class="min-w-0 flex-1 truncate text-ui-2xs text-muted-foreground/60">
        Values use <span class="font-mono">:name</span> placeholders — replace before running.
      </p>
      <button
        type="button"
        class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        disabled={!currentSql}
        onclick={handleCopy}
      >
        {#if copied}
          <Icon name="check" class="size-3 text-green-500" />
          Copied
        {:else}
          <Icon name="copy" class="size-3" />
          Copy
        {/if}
      </button>
      <button
        type="button"
        class="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-ui-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        disabled={!currentSql}
        onclick={handleOpenInEditor}
      >
        <Icon name="terminal" class="size-3" />
        Open in SQL editor
      </button>
    </div>
  </Dialog.Content>
</Dialog.Root>
