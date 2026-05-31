<script>
  import { tick, untrack } from 'svelte'
  import { SvelteFlow, Background, Controls, MiniMap, Panel } from '@xyflow/svelte'
  import '@xyflow/svelte/dist/style.css'
  import dagre from '@dagrejs/dagre'
  import { listTables, getTableColumnStructure, listIndexes } from '$lib/api.js'
  import ErdTableNode from './ErdTableNode.svelte'
  import ErdFocusController from './ErdFocusController.svelte'
  import Loader from '@lucide/svelte/icons/loader'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import Search from '@lucide/svelte/icons/search'
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard'
  import KeyRound from '@lucide/svelte/icons/key-round'
  import Link from '@lucide/svelte/icons/link'
  import X from '@lucide/svelte/icons/x'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import Network from '@lucide/svelte/icons/network'

  let {
    schema = 'public',
    schemas = /** @type {string[]} */ ([]),
    onopentable = /** @type {((schema:string, table:string)=>void)|undefined} */ (undefined),
  } = $props()

  // ── Types ─────────────────────────────────────────────────────────────────
  /**
   * @typedef {{ name: string, dataType: string, isNullable: boolean,
   *   columnDefault: string|null, foreignKey: string|null,
   *   fkConstraintName: string|null, ordinalPosition: number }} Col
   * @typedef {{ name: string, columns: Col[], pkCols: Set<string> }} TableMeta
   */

  // ── Config ────────────────────────────────────────────────────────────────
  const NODE_W    = 220
  const ROW_H     = 22
  const HDR_H     = 36
  const PAD_H     = 8
  const BATCH     = 8   // tables loaded per async chunk
  const WARN_MANY = 60  // show "connected only" hint above this count

  const nodeTypes = { tableNode: ErdTableNode }

  // ── State ─────────────────────────────────────────────────────────────────
  let loading       = $state(false)
  let loadedCount   = $state(0)
  let totalCount    = $state(0)
  let error         = $state('')
  let search        = $state('')
  let searchEl      = $state(/** @type {HTMLInputElement | null} */ (null))
  let activeSchema  = $state(untrack(() => schema))
  let schemaOpen    = $state(false)
  let connectedOnly = $state(false)   // hide tables with no FK in/out
  /** @type {string|null} */
  let selectedTable = $state(null)
  /** @type {Map<string, TableMeta>} */
  let tableMeta     = $state(new Map())

  // XYFlow controlled state
  /** @type {any[]} */
  let nodes = $state([])
  /** @type {any[]} */
  let edges = $state([])

  // debounce handle for graph rebuilds
  let _rebuildTimer = /** @type {ReturnType<typeof setTimeout>|null} */ (null)
  function scheduleRebuild() {
    if (_rebuildTimer) clearTimeout(_rebuildTimer)
    _rebuildTimer = setTimeout(() => { buildGraph(); _rebuildTimer = null }, 60)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  /** @param {TableMeta} t */
  function nodeH(t) { return HDR_H + t.columns.length * ROW_H + PAD_H }

  /**
   * Dagre auto-layout.
   * @param {any[]} ns  @param {any[]} es
   * @returns {any[]}
   */
  function layoutNodes(ns, es) {
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'LR', ranksep: 90, nodesep: 36, marginx: 40, marginy: 40 })
    g.setDefaultEdgeLabel(() => ({}))
    for (const n of ns) g.setNode(n.id, { width: NODE_W, height: nodeH(n.data) })
    for (const e of es) g.setEdge(e.source, e.target)
    dagre.layout(g)
    return ns.map(n => {
      const p = g.node(n.id)
      return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - nodeH(n.data) / 2 } }
    })
  }

  // ── Graph build ───────────────────────────────────────────────────────────
  function buildGraph() {
    const all = [...tableMeta.values()]
    const q   = search.trim().toLowerCase()

    // Build edge list first (needed for connected-only filter)
    const rawEdges = /** @type {any[]} */ ([])
    /** @type {Set<string>} */
    const connected = new Set()
    for (const t of all) {
      for (const col of t.columns) {
        if (!col.foreignKey) continue
        const parts    = col.foreignKey.split('.')
        const refTable = parts.length >= 3 ? parts[1] : parts[0]
        if (!tableMeta.has(refTable)) continue
        rawEdges.push({
          id:           `${t.name}__${col.name}__${refTable}`,
          source:       t.name,
          target:       refTable,
          sourceHandle: `src-${col.name}`,
          targetHandle: 'tgt',
          type:         'default',
          style:        'stroke:hsl(var(--primary)/0.55); stroke-width:1.5',
          animated:     true,
        })
        connected.add(t.name)
        connected.add(refTable)
      }
    }

    // Search highlighting
    /** @type {Set<string>} */
    const hi = new Set()
    if (q) {
      for (const t of all) {
        if (t.name.toLowerCase().includes(q) ||
            t.columns.some(c => c.name.toLowerCase().includes(q)))
          hi.add(t.name)
      }
    }

    // Filter tables
    const visible = all.filter(t => {
      if (connectedOnly && !connected.has(t.name)) return false
      return true
    })

    const rawNodes = visible.map(t => ({
      id:       t.name,
      type:     'tableNode',
      position: { x: 0, y: 0 },
      data: {
        ...t,
        highlighted: q ? hi.has(t.name) : true,
        selected:    selectedTable === t.name,
        onSelect: (/** @type {string} */ name) => { selectedTable = selectedTable === name ? null : name },
        onOpen:   (/** @type {string} */ name) => onopentable?.(activeSchema, name),
      },
    }))

    const visibleIds = new Set(rawNodes.map(n => n.id))
    const filteredEdges = rawEdges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target))

    nodes = layoutNodes(rawNodes, filteredEdges)
    edges = filteredEdges
  }

  // ── Load — batch strategy so UI stays responsive on large schemas ─────────
  async function load() {
    loading     = true
    loadedCount = 0
    error       = ''
    tableMeta   = new Map()
    if (_rebuildTimer) { clearTimeout(_rebuildTimer); _rebuildTimer = null }
    try {
      const tableList = /** @type {{ name: string }[]} */ (await listTables(activeSchema))
      totalCount = tableList.length

      // Auto-enable connectedOnly when schema is very large (user can toggle off)
      if (tableList.length > WARN_MANY) connectedOnly = true

      // Load in chunks so each batch renders as it arrives
      for (let i = 0; i < tableList.length; i += BATCH) {
        const chunk = tableList.slice(i, i + BATCH)
        const results = await Promise.allSettled(
          chunk.map(async t => {
            const cols = /** @type {Col[]} */ (await getTableColumnStructure(activeSchema, t.name))
            const pkCols = new Set(
              cols.filter(c =>
                c.columnDefault?.includes('nextval') ||
                (c.name === 'id' && !c.isNullable && !c.foreignKey)
              ).map(c => c.name)
            )
            return /** @type {TableMeta} */ ({ name: t.name, columns: cols, pkCols })
          })
        )
        for (const r of results) {
          if (r.status === 'fulfilled') tableMeta.set(r.value.name, r.value)
        }
        loadedCount += chunk.length
        tableMeta = new Map(tableMeta) // trigger reactivity
        await tick()
        buildGraph() // incremental render after each batch
      }

      void refinePk()
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }

  async function refinePk() {
    try {
      const idxs = /** @type {{ tableName: string, isPrimary: boolean, columns: string }[]} */ (
        await listIndexes(activeSchema)
      )
      let changed = false
      for (const idx of idxs) {
        if (!idx.isPrimary) continue
        const meta = tableMeta.get(idx.tableName)
        if (!meta) continue
        meta.pkCols = new Set(idx.columns.split(',').map(s => s.trim().replace(/"/g, '')))
        changed = true
      }
      if (changed) {
        tableMeta = new Map(tableMeta)
        buildGraph()
      }
    } catch { /* non-critical */ }
  }

  // ── Reactivity ────────────────────────────────────────────────────────────
  $effect(() => {
    void load()
    // eslint-disable-next-line no-unused-expressions
    activeSchema
  })

  $effect(() => { search; connectedOnly; if (tableMeta.size > 0) scheduleRebuild() })
  $effect(() => { selectedTable; if (tableMeta.size > 0) scheduleRebuild() })

  function reLayout() { buildGraph() }

  // ── Focus on exact or single search match ─────────────────────────────────
  const focusNodeId = $derived.by(() => {
    const q = search.trim().toLowerCase()
    if (!q) return null
    const names = [...tableMeta.keys()]
    const exact = names.find(n => n.toLowerCase() === q)
    if (exact) return exact
    const hits = names.filter(n => n.toLowerCase().includes(q))
    return hits.length === 1 ? hits[0] : null
  })

  // ── Detail panel data ─────────────────────────────────────────────────────
  const selMeta = $derived(selectedTable ? (tableMeta.get(selectedTable) ?? null) : null)
  const selFks  = $derived(selMeta?.columns.filter(c => c.foreignKey) ?? [])
  const refBy   = $derived(
    selectedTable
      ? [...tableMeta.values()].filter(t =>
          t.name !== selectedTable &&
          t.columns.some(c => {
            const p = c.foreignKey?.split('.')
            return p && p.length >= 3 && p[1] === selectedTable
          })
        )
      : []
  )
</script>

<svelte:window onkeydown={(e) => {
  if (!searchEl || !searchEl.offsetParent) return
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === 'f') {
    e.preventDefault(); searchEl.focus(); searchEl.select()
  }
}} />

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <!-- ── Toolbar ──────────────────────────────────────────────────────────── -->
  <div class="studio-chrome flex h-10 shrink-0 items-center gap-2 border-b border-border bg-panel px-3" data-studio-chrome>
    <Network class="size-4 shrink-0 text-muted-foreground/50" />
    <span class="shrink-0 whitespace-nowrap font-mono text-ui-xs font-semibold text-foreground/80">ER Diagram</span>

    <!-- Schema selector (only when multiple schemas) -->
    {#if schemas.length > 1}
      <div class="relative ml-1 shrink-0">
        <button
          type="button"
          class="flex h-7 items-center gap-1.5 rounded-md border border-border/50 bg-background/60 px-2.5 font-mono text-ui-xs font-medium transition-colors hover:bg-accent"
          onclick={() => (schemaOpen = !schemaOpen)}
        >
          {activeSchema}
          <ChevronDown class="size-3 text-muted-foreground/60" />
        </button>
        {#if schemaOpen}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="absolute left-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
            onmouseleave={() => (schemaOpen = false)}
          >
            {#each schemas as s (s)}
              <button
                type="button"
                class="flex w-full px-3 py-1.5 font-mono text-ui-xs transition-colors hover:bg-accent {s === activeSchema ? 'font-medium text-foreground' : 'text-muted-foreground'}"
                onclick={() => { activeSchema = s; schemaOpen = false }}
              >{s}</button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Search -->
    <div class="relative flex min-w-0 shrink items-center">
      <Search class="pointer-events-none absolute left-2.5 size-3 text-muted-foreground/40" />
      <input
        type="text"
        bind:this={searchEl}
        bind:value={search}
        placeholder="Search tables…"
        class="h-7 w-36 min-w-0 rounded-md border border-border/50 bg-background/60 pl-7 pr-6 font-mono text-ui-xs outline-none placeholder:text-muted-foreground/35 focus:border-ring focus:ring-1 focus:ring-ring/30"
      />
      {#if search}
        <button type="button" onclick={() => (search = '')} class="absolute right-2 text-muted-foreground/50 hover:text-foreground">
          <X class="size-3" />
        </button>
      {/if}
    </div>

    <div class="ml-auto flex shrink-0 items-center gap-2">
      <!-- Loading progress / stats -->
      {#if loading && totalCount > 0}
        <div class="flex items-center gap-2">
          <div class="h-1 w-20 overflow-hidden rounded-full bg-muted/40">
            <div class="h-full rounded-full bg-primary/60 transition-all duration-300" style="width:{Math.round(loadedCount/totalCount*100)}%"></div>
          </div>
          <span class="font-mono text-ui-2xs text-muted-foreground/50">{loadedCount}/{totalCount}</span>
        </div>
      {:else if tableMeta.size > 0}
        <span class="whitespace-nowrap font-mono text-ui-2xs text-muted-foreground/45">
          {nodes.length}/{tableMeta.size} · {edges.length} fk
        </span>
      {/if}

      <!-- Connected-only toggle -->
      {#if tableMeta.size > 0}
        <button
          type="button"
          class="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 font-mono text-ui-xs whitespace-nowrap transition-colors {connectedOnly ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15' : 'border-border/50 text-muted-foreground hover:bg-accent hover:text-foreground'}"
          onclick={() => (connectedOnly = !connectedOnly)}
          title="Only show tables that have FK relationships"
        >
          <Link class="size-3.5 shrink-0" />
          Connected
        </button>
      {/if}

      <button
        type="button"
        class="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onclick={reLayout}
        title="Re-run automatic layout"
      >
        <LayoutDashboard class="size-3.5" />
      </button>

      <button
        type="button"
        disabled={loading}
        class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
        onclick={() => void load()}
        title="Reload schema"
      >
        <RefreshCw class="size-3.5 {loading ? 'animate-spin' : ''}" />
      </button>
    </div>
  </div>

  <!-- ── Canvas ───────────────────────────────────────────────────────────── -->
  <div class="relative min-h-0 flex-1">
    {#if loading && tableMeta.size === 0}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background">
        <Loader class="size-6 animate-spin text-muted-foreground/30" />
        <p class="font-mono text-ui-xs text-muted-foreground/50">Loading schema structure…</p>
      </div>

    {:else if error}
      <div class="absolute inset-0 flex items-center justify-center bg-background">
        <p class="max-w-sm text-center font-mono text-ui-xs text-destructive">{error}</p>
      </div>

    {:else}
      <SvelteFlow
        bind:nodes
        bind:edges
        {nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.08}
        maxZoom={2.5}
        class="erd-canvas"
        style="background: hsl(var(--background))"
        onpaneclick={() => (selectedTable = null)}
      >
        <Background
          variant="dots"
          gap={20}
          size={1}
          class="opacity-20"
        />

        <Controls showInteractive={false} />

        <MiniMap
          nodeColor={() => 'hsl(var(--muted))'}
          maskColor="hsl(var(--background)/0.75)"
          style="background:hsl(var(--panel)); border:1px solid hsl(var(--border)/0.5); border-radius:8px; right:16px; bottom:16px;"
        />

        <ErdFocusController {focusNodeId} />

        {#if tableMeta.size === 0 && !loading}
          <Panel position="top-center">
            <div class="mt-4 rounded-lg border border-border/50 bg-panel px-4 py-3 font-mono text-ui-xs text-muted-foreground/60">
              No tables found in <span class="text-foreground/70">{activeSchema}</span>
            </div>
          </Panel>
        {/if}
      </SvelteFlow>

      <!-- ── Detail panel ───────────────────────────────────────────────── -->
      {#if selMeta}
        <div class="absolute right-4 top-4 z-50 w-64 overflow-hidden rounded-xl border border-border/60 bg-card shadow-xl">
          <!-- Header -->
          <div class="flex items-center gap-2 border-b border-border/40 bg-panel px-3 py-2.5">
            <Network class="size-3.5 shrink-0 text-primary/60" />
            <span class="min-w-0 flex-1 truncate font-mono text-ui-xs font-bold text-foreground">{selMeta.name}</span>
            <button
              type="button"
              class="flex size-5 items-center justify-center rounded text-muted-foreground/50 hover:bg-accent hover:text-foreground"
              onclick={() => (selectedTable = null)}
            ><X class="size-3" /></button>
          </div>

          <!-- Column list -->
          <div class="max-h-56 overflow-y-auto">
            {#each selMeta.columns as col (col.name)}
              {@const isPk = selMeta.pkCols.has(col.name)}
              {@const isFk = !!col.foreignKey}
              <div class="flex items-center gap-2 border-b border-border/15 px-3 py-1 last:border-0
                {isPk ? 'bg-amber-500/5' : isFk ? 'bg-blue-500/4' : ''}">
                {#if isPk}<KeyRound class="size-3 shrink-0 text-amber-400/80" />
                {:else if isFk}<Link class="size-3 shrink-0 text-blue-400/60" />
                {:else}<span class="size-3 shrink-0"></span>{/if}
                <span class="min-w-0 flex-1 truncate font-mono text-[10px]
                  {isPk ? 'font-semibold text-amber-300/90' : isFk ? 'text-blue-300/75' : 'text-foreground/65'}"
                >{col.name}</span>
                <span class="shrink-0 font-mono text-[9px] text-muted-foreground/40">{col.dataType}</span>
              </div>
            {/each}
          </div>

          <!-- FK references -->
          {#if selFks.length > 0}
            <div class="border-t border-border/40 bg-muted/10 px-3 py-2">
              <p class="mb-1 font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50">References</p>
              {#each selFks as fk (fk.name)}
                {@const ref = fk.foreignKey?.split('.') ?? []}
                <div class="flex items-baseline gap-1.5 py-0.5">
                  <span class="font-mono text-[10px] text-muted-foreground/55">{fk.name}</span>
                  <span class="text-[10px] text-muted-foreground/30">→</span>
                  <button
                    type="button"
                    class="font-mono text-[10px] text-blue-400/80 hover:underline"
                    onclick={() => { selectedTable = ref[1] ?? null }}
                  >{ref[1]}.{ref[2]}</button>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Referenced by -->
          {#if refBy.length > 0}
            <div class="border-t border-border/40 bg-muted/10 px-3 py-2">
              <p class="mb-1 font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/50">Referenced by</p>
              {#each refBy as t (t.name)}
                <button
                  type="button"
                  class="block py-0.5 font-mono text-[10px] text-muted-foreground/65 hover:text-foreground"
                  onclick={() => { selectedTable = t.name }}
                >← {t.name}</button>
              {/each}
            </div>
          {/if}

          <!-- Open table -->
          <div class="border-t border-border/40 px-3 py-2.5">
            <button
              type="button"
              class="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-ui-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              onclick={() => onopentable?.(activeSchema, selMeta.name)}
            >Open table →</button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  /* Strip XYFlow's default node chrome so our ErdTableNode card shows cleanly */
  :global(.erd-canvas .svelte-flow__node) {
    background: transparent !important;
    border: none !important;
    padding: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }
  :global(.erd-canvas .svelte-flow__node.selected) {
    box-shadow: none !important;
  }
  :global(.erd-canvas .svelte-flow__edge-path) {
    stroke-width: 1.5;
  }
  :global(.erd-canvas .svelte-flow__controls) {
    background: hsl(var(--panel));
    border: 1px solid hsl(var(--border)/0.5);
    border-radius: 8px;
    overflow: hidden;
    gap: 0;
  }
  :global(.erd-canvas .svelte-flow__controls-button) {
    background: hsl(var(--panel));
    border-bottom: 1px solid hsl(var(--border)/0.4);
    color: hsl(var(--muted-foreground));
    padding: 7px;
  }
  :global(.erd-canvas .svelte-flow__controls-button:hover) {
    background: hsl(var(--accent));
    color: hsl(var(--foreground));
  }
  :global(.erd-canvas .svelte-flow__controls-button svg) {
    fill: currentColor;
  }
  :global(.erd-canvas .svelte-flow__handle) {
    pointer-events: none;
  }
  :global(.erd-canvas .svelte-flow__attribution) {
    display: none;
  }
</style>
