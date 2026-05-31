<script>
  import { tick, untrack } from 'svelte'
  import { listTables, getTableColumnStructure, listIndexes } from '$lib/api.js'
  import RelationTreeNode from './RelationTreeNode.svelte'
  import Loader from '@lucide/svelte/icons/loader'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import Search from '@lucide/svelte/icons/search'
  import X from '@lucide/svelte/icons/x'
  import KeyRound from '@lucide/svelte/icons/key-round'
  import Link from '@lucide/svelte/icons/link'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import GitBranch from '@lucide/svelte/icons/git-branch'
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right'
  import ArrowDownRight from '@lucide/svelte/icons/arrow-down-right'
  import ExternalLink from '@lucide/svelte/icons/external-link'
  import Table2 from '@lucide/svelte/icons/table-2'

  let {
    schema = 'public',
    schemas = /** @type {string[]} */ ([]),
    onopentable = /** @type {((schema:string, table:string)=>void)|undefined} */ (undefined),
  } = $props()

  /**
   * @typedef {{ name: string, dataType: string, isNullable: boolean,
   *   columnDefault: string|null, foreignKey: string|null,
   *   fkConstraintName: string|null, ordinalPosition: number }} Col
   * @typedef {{ name: string, columns: Col[], pkCols: Set<string> }} TableMeta
   */

  // ── State ─────────────────────────────────────────────────────────────────
  let loading      = $state(false)
  let loadedCount  = $state(0)
  let totalCount   = $state(0)
  let error        = $state('')
  let activeSchema = $state(untrack(() => schema))
  let schemaOpen   = $state(false)
  let listSearch   = $state('')
  let listSearchEl = $state(/** @type {HTMLInputElement | null} */ (null))
  /** @type {string|null} */
  let focusedTable = $state(null)

  /** @type {Map<string, TableMeta>} */
  let tableMeta = $state(new Map())

  // ── Expand / column-show tracking ────────────────────────────────────────
  /** @type {Set<string>} */
  let expanded = $state(new Set())
  /** @type {Set<string>} */
  let showCols = $state(new Set())

  /** @param {string} key */
  function toggleExpand(key) {
    const n = new Set(expanded); n.has(key) ? n.delete(key) : n.add(key); expanded = n
  }
  /** @param {string} key */
  function toggleCols(key) {
    const n = new Set(showCols); n.has(key) ? n.delete(key) : n.add(key); showCols = n
  }

  // Reset when focused table changes
  $effect(() => { focusedTable; expanded = new Set(); showCols = new Set() })

  // ── Derived relationship maps ──────────────────────────────────────────────
  const outbound = $derived.by(() => {
    /** @type {Map<string, {col:string, refTable:string, refCol:string}[]>} */
    const m = new Map()
    for (const t of tableMeta.values()) {
      const refs = []
      for (const c of t.columns) {
        if (!c.foreignKey) continue
        const p = c.foreignKey.split('.')
        if (p.length < 3) continue
        refs.push({ col: c.name, refTable: p[1], refCol: p[2] })
      }
      m.set(t.name, refs)
    }
    return m
  })

  const inbound = $derived.by(() => {
    /** @type {Map<string, {fromTable:string, fromCol:string, refCol:string}[]>} */
    const m = new Map()
    for (const t of tableMeta.values()) m.set(t.name, [])
    for (const t of tableMeta.values()) {
      for (const c of t.columns) {
        if (!c.foreignKey) continue
        const p = c.foreignKey.split('.')
        if (p.length < 3) continue
        const list = m.get(p[1])
        if (list) list.push({ fromTable: t.name, fromCol: c.name, refCol: p[2] })
      }
    }
    return m
  })

  // ── Filtered table list ───────────────────────────────────────────────────
  const filteredTables = $derived.by(() => {
    const q = listSearch.trim().toLowerCase()
    const all = [...tableMeta.values()].sort((a, b) => a.name.localeCompare(b.name))
    return q ? all.filter(t => t.name.toLowerCase().includes(q)) : all
  })

  // ── Load — batched ────────────────────────────────────────────────────────
  const BATCH = 8

  async function load() {
    loading = true; loadedCount = 0; error = ''; tableMeta = new Map()
    try {
      const tableList = /** @type {{ name: string }[]} */ (await listTables(activeSchema))
      totalCount = tableList.length
      for (let i = 0; i < tableList.length; i += BATCH) {
        const chunk = tableList.slice(i, i + BATCH)
        const results = await Promise.allSettled(
          chunk.map(async t => {
            const cols = /** @type {Col[]} */ (await getTableColumnStructure(activeSchema, t.name))
            const pkCols = new Set(cols.filter(c =>
              c.columnDefault?.includes('nextval') || (c.name === 'id' && !c.isNullable && !c.foreignKey)
            ).map(c => c.name))
            return /** @type {TableMeta} */ ({ name: t.name, columns: cols, pkCols })
          })
        )
        for (const r of results) {
          if (r.status === 'fulfilled') tableMeta.set(r.value.name, r.value)
        }
        loadedCount += chunk.length
        tableMeta = new Map(tableMeta)
        await tick()
      }
      // Refine PKs from indexes
      try {
        const idxs = /** @type {{ tableName:string, isPrimary:boolean, columns:string }[]} */ (
          await listIndexes(activeSchema)
        )
        for (const idx of idxs) {
          if (!idx.isPrimary) continue
          const m = tableMeta.get(idx.tableName)
          if (m) m.pkCols = new Set(idx.columns.split(',').map(s => s.trim().replace(/"/g, '')))
        }
        tableMeta = new Map(tableMeta)
      } catch { /* non-critical */ }

      // Auto-focus first table with relationships
      if (!focusedTable) {
        const first = [...tableMeta.values()].find(t =>
          (outbound.get(t.name)?.length ?? 0) > 0 || (inbound.get(t.name)?.length ?? 0) > 0
        )
        focusedTable = first?.name ?? (tableMeta.size > 0 ? [...tableMeta.keys()][0] : null)
      }
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }

  $effect(() => { activeSchema; void load() })
</script>

<svelte:window onkeydown={(e) => {
  if (!listSearchEl || !listSearchEl.offsetParent) return
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === 'f') {
    e.preventDefault(); listSearchEl.focus(); listSearchEl.select()
  }
}} />

<div class="flex min-h-0 flex-1 overflow-hidden">

  <!-- ── Left: table list ──────────────────────────────────────────────────── -->
  <div class="flex w-56 shrink-0 flex-col border-r border-border/50 bg-panel">
    <div class="studio-chrome flex h-10 shrink-0 items-center gap-2 border-b border-border/60 px-3" data-studio-chrome>
      <GitBranch class="size-3.5 shrink-0 text-muted-foreground/50" />
      <span class="font-mono text-ui-xs font-semibold text-foreground/70">Relation Tree</span>
      <button
        type="button"
        disabled={loading}
        class="ml-auto flex size-6 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
        onclick={() => void load()}
      >
        <RefreshCw class="size-3 {loading ? 'animate-spin' : ''}" />
      </button>
    </div>

    <!-- Search -->
    <div class="relative px-2 py-1.5">
      <Search class="pointer-events-none absolute left-4 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/40" />
      <input
        type="text"
        bind:this={listSearchEl}
        bind:value={listSearch}
        placeholder="Filter tables…"
        class="h-7 w-full rounded-md border border-border/40 bg-background/60 pl-7 pr-2 font-mono text-ui-xs outline-none placeholder:text-muted-foreground/30 focus:border-ring focus:ring-1 focus:ring-ring/30"
      />
    </div>

    <!-- Progress -->
    {#if loading && totalCount > 0}
      <div class="mx-2 mb-1 h-0.5 overflow-hidden rounded-full bg-muted/30">
        <div class="h-full rounded-full bg-primary/50 transition-all" style="width:{Math.round(loadedCount/totalCount*100)}%"></div>
      </div>
    {/if}

    <!-- Table list -->
    <div class="min-h-0 flex-1 overflow-y-auto">
      {#if loading && tableMeta.size === 0}
        <div class="flex items-center gap-2 px-3 py-3">
          <Loader class="size-3.5 animate-spin text-muted-foreground/40" />
          <span class="font-mono text-ui-xs text-muted-foreground/50">Loading…</span>
        </div>
      {:else if error}
        <p class="px-3 py-3 font-mono text-ui-xs text-destructive">{error}</p>
      {:else}
        {#each filteredTables as t (t.name)}
          {@const hasOut = (outbound.get(t.name)?.length ?? 0) > 0}
          {@const hasIn  = (inbound.get(t.name)?.length ?? 0) > 0}
          {@const active = focusedTable === t.name}
          <button
            type="button"
            class="flex w-full items-center gap-2 border-b border-border/10 px-3 py-1.5 text-left transition-colors last:border-0
              {active ? 'bg-primary/10 text-foreground' : 'text-muted-foreground/70 hover:bg-accent/30 hover:text-foreground'}"
            onclick={() => (focusedTable = t.name)}
          >
            <Table2 class="size-3 shrink-0 {active ? 'text-primary/70' : 'text-muted-foreground/30'}" />
            <span class="min-w-0 flex-1 truncate font-mono text-ui-xs">{t.name}</span>
            <span class="flex shrink-0 items-center gap-0.5">
              {#if hasOut}<ArrowUpRight class="size-2.5 text-blue-400/60" />{/if}
              {#if hasIn}<ArrowDownRight class="size-2.5 text-green-400/60" />{/if}
            </span>
          </button>
        {:else}
          <p class="px-3 py-4 font-mono text-ui-xs text-muted-foreground/40">No tables</p>
        {/each}
      {/if}
    </div>
  </div>

  <!-- ── Right: tree ───────────────────────────────────────────────────────── -->
  <div class="min-h-0 min-w-0 flex-1 overflow-y-auto bg-background p-4">
    {#if !focusedTable || !tableMeta.has(focusedTable)}
      <div class="flex h-full min-h-[200px] flex-col items-center justify-center gap-3">
        <GitBranch class="size-10 text-muted-foreground/15" />
        <p class="font-mono text-ui-xs text-muted-foreground/40">Select a table to explore its relationships</p>
      </div>
    {:else}
      {@const rootMeta = tableMeta.get(focusedTable)}
      {@const rootOut  = outbound.get(focusedTable) ?? []}
      {@const rootIn   = inbound.get(focusedTable) ?? []}
      {@const shared   = { tableMeta, outbound, inbound, expanded, showCols, toggleExpand, toggleCols, activeSchema, onopentable, onfocustable: (name) => (focusedTable = name) }}

      <div class="mx-auto max-w-3xl">
        <!-- Root card -->
        <div class="mb-6 overflow-hidden rounded-xl border border-primary/30 bg-primary/5 shadow-sm">
          <div class="flex items-center gap-3 border-b border-primary/20 px-4 py-3">
            <div class="flex size-8 items-center justify-center rounded-lg bg-primary/15">
              <Table2 class="size-4 text-primary/80" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="font-mono text-ui-sm font-bold text-foreground">{focusedTable}</p>
              <p class="font-mono text-ui-2xs text-muted-foreground/60">
                {rootMeta?.columns.length ?? 0} columns ·
                {rootOut.length} outgoing FK ·
                {rootIn.length} incoming FK
              </p>
            </div>
            <button
              type="button"
              class="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-ui-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              onclick={() => onopentable?.(activeSchema, focusedTable)}
            >
              <ExternalLink class="size-3" />Open
            </button>
          </div>

          <!-- Root columns toggle -->
          {#if rootMeta}
            {@const ck = 'root-cols'}
            {@const open = showCols.has(ck)}
            <button
              type="button"
              class="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-primary/5"
              onclick={() => toggleCols(ck)}
            >
              {#if open}<ChevronDown class="size-3 text-muted-foreground/50" />{:else}<ChevronRight class="size-3 text-muted-foreground/50" />{/if}
              <span class="font-mono text-ui-2xs text-muted-foreground/60">Columns ({rootMeta.columns.length})</span>
            </button>
            {#if open}
              <div class="border-t border-primary/10 bg-background/60 px-4 pb-2 pt-1">
                {#each rootMeta.columns as col (col.name)}
                  {@const isPk = rootMeta.pkCols.has(col.name)}
                  {@const isFk = !!col.foreignKey}
                  <div class="flex items-center gap-2 py-0.5">
                    {#if isPk}<KeyRound class="size-3 shrink-0 text-amber-400/80" />
                    {:else if isFk}<Link class="size-3 shrink-0 text-blue-400/60" />
                    {:else}<span class="size-3 shrink-0"></span>{/if}
                    <span class="font-mono text-[10px] {isPk ? 'font-semibold text-amber-300/90' : isFk ? 'text-blue-300/75' : 'text-foreground/60'}">{col.name}</span>
                    <span class="ml-auto font-mono text-[9px] text-muted-foreground/35">{col.dataType}</span>
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        </div>

        <!-- Outgoing FKs (this → other) -->
        {#if rootOut.length > 0}
          <section class="mb-6">
            <div class="mb-3 flex items-center gap-2">
              <ArrowUpRight class="size-4 text-blue-400/70" />
              <h3 class="font-mono text-ui-xs font-semibold text-foreground/70">
                References <span class="text-muted-foreground/50">({rootOut.length})</span>
              </h3>
              <div class="flex-1 border-t border-border/30"></div>
              <span class="font-mono text-[10px] text-muted-foreground/40">this FK → other PK</span>
            </div>
            <div class="flex flex-col gap-2 pl-4">
              {#each rootOut as rel (rel.col)}
                <RelationTreeNode
                  tableName={rel.refTable}
                  fromCol={rel.col}
                  toCol={rel.refCol}
                  direction="out"
                  depth={1}
                  path="{focusedTable}>{rel.refTable}"
                  {...shared}
                />
              {/each}
            </div>
          </section>
        {/if}

        <!-- Incoming FKs (other → this) -->
        {#if rootIn.length > 0}
          <section class="mb-6">
            <div class="mb-3 flex items-center gap-2">
              <ArrowDownRight class="size-4 text-green-400/70" />
              <h3 class="font-mono text-ui-xs font-semibold text-foreground/70">
                Referenced by <span class="text-muted-foreground/50">({rootIn.length})</span>
              </h3>
              <div class="flex-1 border-t border-border/30"></div>
              <span class="font-mono text-[10px] text-muted-foreground/40">other FK → this PK</span>
            </div>
            <div class="flex flex-col gap-2 pl-4">
              {#each rootIn as rel (`${rel.fromTable}${rel.fromCol}`)}
                <RelationTreeNode
                  tableName={rel.fromTable}
                  fromCol={rel.fromCol}
                  toCol={rel.refCol}
                  direction="in"
                  depth={1}
                  path="{focusedTable}<{rel.fromTable}"
                  {...shared}
                />
              {/each}
            </div>
          </section>
        {/if}

        {#if rootOut.length === 0 && rootIn.length === 0}
          <div class="flex flex-col items-center gap-2 py-10 text-center">
            <Table2 class="size-8 text-muted-foreground/15" />
            <p class="font-mono text-ui-xs text-muted-foreground/40">No FK relationships found for this table</p>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
