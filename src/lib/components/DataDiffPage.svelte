<script>
  import * as monaco from 'monaco-editor'
  import GitCompare from '@lucide/svelte/icons/git-compare'
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down'
  import Plus from '@lucide/svelte/icons/plus'
  import Minus from '@lucide/svelte/icons/minus'
  import X from '@lucide/svelte/icons/x'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import Search from '@lucide/svelte/icons/search'
  import { onMount, untrack } from 'svelte'
  import { cn } from '$lib/utils.js'
  import {
    getTableRows,
    executeSql,
    executeSqlOnConnection,
    listSchemasOnConnection,
    listTablesOnConnection,
  } from '$lib/api.js'

  /**
   * @typedef {import('$lib/stores/connections.js').SavedConnection} SavedConnection
   * @typedef {{ name: string, dataType?: string }} ColInfo
   * @typedef {{ status: 'added'|'removed'|'modified'|'unchanged', left: unknown[]|null, right: unknown[]|null, changedCols?: Set<number> }} DiffRow
   * @typedef {{
   *   connId: string, database: string, databases: string[], loadingDbs: boolean,
   *   schema: string, schemas: string[], loadingSchemas: boolean,
   *   table: string, tables: string[], loadingTables: boolean,
   *   mode: 'table'|'sql', sql: string,
   * }} SourceState
   *
   * @type {{
   *   schemas: string[], tables: Array<{ name: string }>, activeSchema: string,
   *   connections: SavedConnection[], currentConnectionId: string,
   * }}
   */
  let { schemas, tables, activeSchema, connections = [], currentConnectionId = '' } = $props()

  // svelte-ignore state_referenced_locally
  const _init = activeSchema

  // System/catalog schemas that sort ahead of the user's real schema (e.g.
  // Cockroach's crdb_internal, PG's pg_catalog) — picking schemas[0] would land
  // on one of these and every table lookup fails ("relation X does not exist").
  const SYSTEM_SCHEMAS = new Set([
    'crdb_internal', 'information_schema', 'pg_catalog', 'pg_toast', 'pg_extension',
    'sys', 'mysql', 'performance_schema', 'sys_catalog',
  ])
  /** Best default schema: prefer `public`, then any non-system schema, else the first. */
  function pickDefaultSchema(/** @type {string[]} */ list) {
    if (!list.length) return ''
    if (list.includes('public')) return 'public'
    return list.find((s) => !SYSTEM_SCHEMAS.has(s.toLowerCase())) ?? list[0]
  }

  /** @param {string} connId @param {string} database @param {string} schema @returns {SourceState} */
  function makeSource(connId, database, schema) {
    return { connId, database, databases: [], loadingDbs: false, schema, schemas: [], loadingSchemas: false, table: '', tables: [], loadingTables: false, mode: 'table', sql: '' }
  }

  /** @type {SourceState} */
  // svelte-ignore state_referenced_locally
  let L = $state(makeSource(currentConnectionId, '', _init))
  /** @type {SourceState} */
  // svelte-ignore state_referenced_locally
  let R = $state(makeSource(currentConnectionId, '', _init))

  // ── Dropdown ──────────────────────────────────────────────────────────────────
  let openDropdown = $state('')
  let dropdownSearch = $state('')
  let ddTop = $state(0)
  let ddLeft = $state(0)
  let ddFlipUp = $state(false)
  const DD_HEIGHT = 280

  /** @param {string} id @param {MouseEvent} e */
  function openDd(id, e) {
    const rect = /** @type {HTMLElement} */ (e.currentTarget).getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    ddFlipUp = spaceBelow < DD_HEIGHT && rect.top > DD_HEIGHT
    ddTop = ddFlipUp ? rect.top - 4 : rect.bottom + 4
    ddLeft = Math.min(rect.left, window.innerWidth - 248)
    openDropdown = id
    dropdownSearch = ''
  }
  function closeDd() { openDropdown = ''; dropdownSearch = '' }

  /** @param {HTMLElement} node */
  function focusNode(node) { setTimeout(() => node.focus(), 0) }

  // ── Monaco SQL editors ────────────────────────────────────────────────────────
  /** @type {HTMLElement|null} */
  let lSqlEl = $state(null)
  /** @type {HTMLElement|null} */
  let rSqlEl = $state(null)
  /** @type {monaco.editor.IStandaloneCodeEditor|null} */
  let lMonaco = null
  /** @type {monaco.editor.IStandaloneCodeEditor|null} */
  let rMonaco = null

  const MONACO_OPTS = /** @type {monaco.editor.IStandaloneEditorConstructionOptions} */ ({
    language: 'sql',
    theme: 'vs-dark',
    minimap: { enabled: false },
    lineNumbers: 'off',
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    fontSize: 12,
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    lineDecorationsWidth: 6,
    lineNumbersMinChars: 0,
    glyphMargin: false,
    folding: false,
    // automaticLayout:false — it polls via setInterval(100ms) per editor (two here)
    // and never stops, even when this tab is hidden. ResizeObserver is event-driven.
    automaticLayout: false,
    scrollbar: { vertical: 'auto', horizontal: 'hidden', alwaysConsumeMouseWheel: false },
    quickSuggestions: { other: true, comments: false, strings: true },
    suggestOnTriggerCharacters: true,
    tabCompletion: 'on',
    padding: { top: 8, bottom: 8 },
  })

  $effect(() => {
    const el = lSqlEl
    if (!el) return
    const ed = monaco.editor.create(el, { ...MONACO_OPTS, value: untrack(() => L.sql) })
    ed.onDidChangeModelContent(() => { L = { ...L, sql: ed.getValue() } })
    lMonaco = ed
    const ro = new ResizeObserver(() => ed.layout())
    ro.observe(el)
    return () => { ro.disconnect(); ed.dispose(); lMonaco = null }
  })

  $effect(() => {
    const el = rSqlEl
    if (!el) return
    const ed = monaco.editor.create(el, { ...MONACO_OPTS, value: untrack(() => R.sql) })
    ed.onDidChangeModelContent(() => { R = { ...R, sql: ed.getValue() } })
    rMonaco = ed
    const ro = new ResizeObserver(() => ed.layout())
    ro.observe(el)
    return () => { ro.disconnect(); ed.dispose(); rMonaco = null }
  })

  // ── Key columns ───────────────────────────────────────────────────────────────
  /** @type {string[]} */
  let keyColSuggestions = $state([])
  /** @type {Set<string>} */
  let selectedKeyCols = $state(new Set())

  // ── Results ───────────────────────────────────────────────────────────────────
  let comparing = $state(false)
  let error = $state('')
  /** @type {ColInfo[]} */
  let columns = $state([])
  /** @type {DiffRow[]} */
  let diffRows = $state([])

  // ── Filter: single-select radio ───────────────────────────────────────────────
  /** @type {'all'|'changed'|'added'|'modified'|'removed'|'unchanged'} */
  let activeFilter = $state('changed')
  let searchQuery = $state('')

  // ── Virtual scroll ────────────────────────────────────────────────────────────
  const ROW_HEIGHT = 36
  const BUFFER = 10
  let scrollTop = $state(0)
  let clientHeight = $state(600)
  let scrollRaf = 0

  function handleTableScroll(/** @type {Event} */ e) {
    const el = /** @type {HTMLElement} */ (e.currentTarget)
    if (scrollRaf) return
    scrollRaf = requestAnimationFrame(() => {
      scrollTop = el.scrollTop
      clientHeight = el.clientHeight
      scrollRaf = 0
    })
  }

  // ── Column widths (resizable) ─────────────────────────────────────────────────
  let colWidths = $state(/** @type {number[]} */ ([]))
  $effect(() => { if (columns.length) colWidths = Array(columns.length).fill(200) })
  const totalWidth = $derived(24 + colWidths.reduce((a, b) => a + b, 0))

  let resizingCol = $state(-1)
  let resizeStartX = 0
  let resizeStartWidth = 0

  function startResize(/** @type {number} */ ci, /** @type {MouseEvent} */ e) {
    e.preventDefault(); e.stopPropagation()
    resizingCol = ci; resizeStartX = e.clientX; resizeStartWidth = colWidths[ci]
  }
  function onResizeMove(/** @type {MouseEvent} */ e) {
    if (resizingCol < 0) return
    const w = Math.max(80, resizeStartWidth + e.clientX - resizeStartX)
    colWidths = colWidths.map((v, i) => i === resizingCol ? w : v)
  }
  function onResizeUp() { resizingCol = -1 }

  const stats = $derived.by(() => ({
    added:     diffRows.filter((r) => r.status === 'added').length,
    removed:   diffRows.filter((r) => r.status === 'removed').length,
    modified:  diffRows.filter((r) => r.status === 'modified').length,
    unchanged: diffRows.filter((r) => r.status === 'unchanged').length,
  }))

  const displayRows = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase()
    return diffRows.filter((r) => {
      const pass =
        activeFilter === 'all' ? true :
        activeFilter === 'changed' ? r.status !== 'unchanged' :
        r.status === activeFilter
      if (!pass) return false
      if (!q) return true
      const cells = r.left ?? r.right ?? []
      return cells.some((c) => c !== null && String(c).toLowerCase().includes(q))
    })
  })

  const vStart = $derived(Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER))
  const vEnd   = $derived(Math.min(displayRows.length, Math.ceil((scrollTop + clientHeight) / ROW_HEIGHT) + BUFFER))
  const topPad = $derived(vStart * ROW_HEIGHT)
  const bottomPad = $derived(Math.max(0, (displayRows.length - vEnd) * ROW_HEIGHT))

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const connById  = (/** @type {string} */ id) => connections.find((c) => c.id === id) ?? null
  const isCurrent = (/** @type {string} */ id) => id === currentConnectionId

  /** @param {SourceState} src @returns {SavedConnection|null} */
  function effectiveConfig(src) {
    const conn = connById(src.connId)
    if (!conn) return null
    if (src.database && src.database !== conn.database) return /** @type {SavedConnection} */ ({ ...conn, database: src.database })
    return conn
  }

  /** @param {SavedConnection} conn */
  async function fetchDatabases(conn) {
    const t = conn.type
    if (t === 'sqlite' || t === 'd1' || t === 'libsql') return ['main']
    try {
      const q = t === 'postgres'
        ? "SELECT datname FROM pg_database WHERE datallowconn=true AND datname NOT IN ('template0','template1') ORDER BY datname"
        : 'SHOW DATABASES'
      const res = isCurrent(conn.id) ? await executeSql(q) : await executeSqlOnConnection(conn, q)
      return (res.rows ?? []).map((r) => String(r[0]))
    } catch { return conn.database ? [conn.database] : [] }
  }

  onMount(() => {
    const cL = connById(L.connId), cR = connById(R.connId)
    if (cL) void loadDatabases({ ...L }, cL, (s) => { L = s })
    if (cR) void loadDatabases({ ...R }, cR, (s) => { R = s })
  })

  async function loadDatabases(/** @type {SourceState} */ src, /** @type {SavedConnection} */ conn, /** @type {(s:SourceState)=>void} */ set) {
    set({ ...src, loadingDbs: true, databases: [], database: '', schemas: [], schema: '', tables: [], table: '' })
    const dbs = await fetchDatabases(conn)
    const defaultDb = conn.database || dbs[0] || ''
    const next = { ...src, loadingDbs: false, databases: dbs, database: defaultDb, schemas: [], schema: '', tables: [], table: '' }
    set(next)
    await loadSchemas(next, dbs.length ? { ...conn, database: defaultDb } : conn, set)
  }

  async function loadSchemas(/** @type {SourceState} */ src, /** @type {SavedConnection} */ cfg, /** @type {(s:SourceState)=>void} */ set) {
    if (!cfg) return
    if (isCurrent(src.connId) && cfg.database === connById(src.connId)?.database) {
      const schema = pickDefaultSchema(schemas)
      const next = { ...src, schemas, schema, tables: [], table: '', loadingSchemas: false }
      set(next); await loadTables(next, cfg, set); return
    }
    set({ ...src, loadingSchemas: true, schemas: [], schema: '', tables: [], table: '' })
    try {
      const s = await listSchemasOnConnection(cfg)
      const schema = pickDefaultSchema(s)
      const next = { ...src, loadingSchemas: false, schemas: s, schema, tables: [], table: '' }
      set(next)
      if (schema) await loadTables(next, cfg, set)
    } catch { set({ ...src, loadingSchemas: false }) }
  }

  async function loadTables(/** @type {SourceState} */ src, /** @type {SavedConnection} */ cfg, /** @type {(s:SourceState)=>void} */ set) {
    if (!src.schema || !cfg) return
    if (isCurrent(src.connId) && cfg.database === connById(src.connId)?.database) {
      set({ ...src, loadingTables: false, tables: tables.map((t) => t.name) }); return
    }
    set({ ...src, loadingTables: true, tables: [], table: '' })
    try {
      const t = await listTablesOnConnection(cfg, src.schema)
      set({ ...src, loadingTables: false, tables: t, table: '' })
    } catch { set({ ...src, loadingTables: false }) }
  }

  function onConnChange(/** @type {'L'|'R'} */ side) {
    const src = side === 'L' ? L : R, set = side === 'L' ? (s) => { L = s } : (s) => { R = s }
    const conn = connById(src.connId)
    if (conn) void loadDatabases(src, conn, set)
  }
  function onDatabaseChange(/** @type {'L'|'R'} */ side) {
    const src = side === 'L' ? L : R, set = side === 'L' ? (s) => { L = s } : (s) => { R = s }
    const conn = connById(src.connId)
    if (conn) void loadSchemas(src, /** @type {SavedConnection} */ ({ ...conn, database: src.database }), set)
  }
  function onSchemaChange(/** @type {'L'|'R'} */ side) {
    const src = side === 'L' ? L : R, set = side === 'L' ? (s) => { L = s } : (s) => { R = s }
    const conn = connById(src.connId)
    if (conn) void loadTables(src, /** @type {SavedConnection} */ ({ ...conn, database: src.database }), set)
  }

  function swapSources() {
    const tmp = L; L = R; R = tmp
  }

  // Source/target share one input mode — a single toggle drives both.
  const mode = $derived(L.mode)
  function setMode(/** @type {'table'|'sql'} */ m) {
    L = { ...L, mode: m }
    R = { ...R, mode: m }
  }

  $effect(() => {
    if (!columns.length) return
    const suggested = columns.map((c) => c.name).filter((n) => {
      const lo = n.toLowerCase()
      return lo === 'id' || lo === 'uuid' || lo === 'uid' || lo.endsWith('_id') || lo === 'key'
    })
    const next = suggested.length ? suggested : columns.slice(0, 2).map((c) => c.name)
    keyColSuggestions = next
    if (next.length && untrack(() => selectedKeyCols.size === 0)) selectedKeyCols = new Set([next[0]])
  })

  function toggleKeyCol(/** @type {string} */ col) {
    const next = new Set(selectedKeyCols)
    if (next.has(col)) { if (next.size > 1) next.delete(col) } else next.add(col)
    selectedKeyCols = next
  }

  async function runFetch(/** @type {SourceState} */ src) {
    if (src.mode === 'sql') {
      const res = isCurrent(src.connId) ? await executeSql(src.sql) : await executeSqlOnConnection(effectiveConfig(src), src.sql)
      return { columns: res.columns ?? [], rows: res.rows ?? [] }
    }
    if (isCurrent(src.connId) && effectiveConfig(src)?.database === connById(src.connId)?.database) {
      const res = await getTableRows(src.schema, src.table, 10000, 0)
      return { columns: res.columns ?? [], rows: res.rows ?? [] }
    }
    const sql = `SELECT * FROM "${src.schema}"."${src.table}" LIMIT 10000`
    const res = await executeSqlOnConnection(effectiveConfig(src), sql)
    return { columns: res.columns ?? [], rows: res.rows ?? [] }
  }

  async function compare() {
    if (comparing) return
    error = ''
    const lReady = L.mode === 'table' ? !!L.table : !!L.sql.trim()
    const rReady = R.mode === 'table' ? !!R.table : !!R.sql.trim()
    if (!lReady || !rReady) { error = 'Configure both sources first.'; return }
    comparing = true
    try {
      const [lRes, rRes] = await Promise.all([runFetch(L), runFetch(R)])
      columns = lRes.columns.length ? lRes.columns : rRes.columns
      const keyNames = selectedKeyCols.size ? [...selectedKeyCols].map((s) => s.toLowerCase()) : null
      const keyIdx = keyNames ? keyNames.map((n) => columns.findIndex((c) => c.name.toLowerCase() === n)).filter((i) => i >= 0) : [0]
      if (!keyIdx.length) { error = 'Key columns not found in result set.'; return }
      diffRows = computeDiff(lRes.rows, rRes.rows, columns.length, keyIdx)
      activeFilter = 'changed'
      searchQuery = ''
    } catch (e) {
      error = String(/** @type {Error} */ (e).message ?? e)
    } finally { comparing = false }
  }

  function computeDiff(/** @type {unknown[][]} */ lRows, /** @type {unknown[][]} */ rRows, /** @type {number} */ colCount, /** @type {number[]} */ keyIdx) {
    const key = (/** @type {unknown[]} */ r) => keyIdx.map((i) => String(r[i] ?? '')).join('\0')
    const lMap = new Map(lRows.map((r) => [key(r), r]))
    const rMap = new Map(rRows.map((r) => [key(r), r]))
    /** @type {DiffRow[]} */
    const out = []
    for (const [k, lr] of lMap) {
      const rr = rMap.get(k)
      if (!rr) { out.push({ status: 'removed', left: lr, right: null }); continue }
      const changed = new Set(Array.from({ length: colCount }, (_, i) => i).filter((i) => String(lr[i] ?? '') !== String(rr[i] ?? '')))
      out.push({ status: changed.size ? 'modified' : 'unchanged', left: lr, right: rr, changedCols: changed })
    }
    for (const [k, rr] of rMap) if (!lMap.has(k)) out.push({ status: 'added', left: null, right: rr })
    out.sort((a, b) => ({ removed: 0, modified: 1, added: 2, unchanged: 3 }[a.status] - { removed: 0, modified: 1, added: 2, unchanged: 3 }[b.status]))
    return out
  }

  /**
   * @param {string} text
   * @param {string} query
   * @returns {Array<{text:string, match:boolean}>}
   */
  function splitHighlight(text, query) {
    if (!query) return [{ text, match: false }]
    const out = [], lo = text.toLowerCase(), ql = query.toLowerCase()
    let i = 0
    while (i < text.length) {
      const idx = lo.indexOf(ql, i)
      if (idx === -1) { out.push({ text: text.slice(i), match: false }); break }
      if (idx > i) out.push({ text: text.slice(i, idx), match: false })
      out.push({ text: text.slice(idx, idx + ql.length), match: true })
      i = idx + ql.length
    }
    return out
  }
</script>

<svelte:window
  onmousemove={onResizeMove}
  onmouseup={onResizeUp}
/>

<!-- Dropdown backdrop -->
{#if openDropdown}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-30" onpointerdown={closeDd}></div>
{/if}

<!-- ── Searchable select ──────────────────────────────────────────────────────── -->
{#snippet SearchSelect({ id, value, options, loading, placeholder = 'select…', onchange })}
  {@const isOpen = openDropdown === id}
  {@const filtered = dropdownSearch ? options.filter((o) => o.toLowerCase().includes(dropdownSearch.toLowerCase())) : options}
  <div class="relative inline-flex">
    <button
      type="button"
      onclick={(e) => { e.stopPropagation(); if (isOpen) closeDd(); else if (!loading && options.length > 0) openDd(id, e) }}
      disabled={loading || (!value && options.length === 0 && !loading)}
      class={cn(
        'flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors select-none',
        loading
          ? 'border-border/30 bg-muted/15 text-muted-foreground/40'
          : value
            ? 'border-border/40 bg-muted/25 text-foreground/90 hover:bg-muted/45'
            : options.length
              ? 'border-dashed border-border/40 bg-transparent text-muted-foreground/45 hover:border-border/60 hover:text-muted-foreground/75'
              : 'cursor-default border-border/20 bg-transparent text-muted-foreground/20 pointer-events-none',
        isOpen && 'border-border/70 bg-muted/50 text-foreground',
      )}
    >
      {#if loading}
        <Loader2 class="size-3 animate-spin text-muted-foreground/30" />
        <span class="text-muted-foreground/40">{placeholder}</span>
      {:else}
        <span class={cn('max-w-[140px] truncate', value && 'font-medium')}>{value || placeholder}</span>
        {#if options.length > 0 || value}
          <ChevronDown class={cn('ml-auto size-3 shrink-0 text-muted-foreground/40 transition-transform', isOpen && 'rotate-180')} />
        {/if}
      {/if}
    </button>
    {#if isOpen}
      <div
        role="presentation"
        class={cn('fixed z-40 w-56 overflow-hidden rounded-lg border border-border/50 bg-popover shadow-2xl', ddFlipUp && '-translate-y-full')}
        style="top:{ddTop}px;left:{ddLeft}px"
        onpointerdown={(e) => e.stopPropagation()}
      >
        <div class="flex items-center gap-2 border-b border-border/25 px-3 py-2">
          <Search class="size-3 shrink-0 text-muted-foreground/35" />
          <input use:focusNode type="text" bind:value={dropdownSearch} placeholder="Search…"
            class="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/25" />
          {#if dropdownSearch}<button onclick={() => { dropdownSearch = '' }} class="text-muted-foreground/35 hover:text-foreground"><X class="size-3" /></button>{/if}
        </div>
        <div class="max-h-52 overflow-y-auto py-1">
          {#if filtered.length === 0}
            <p class="px-3 py-2 text-xs text-muted-foreground/35">No results</p>
          {:else}
            {#each filtered as opt}
              <button type="button" onclick={() => { onchange(opt); closeDd() }}
                class={cn('flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-muted/35', value === opt && 'text-primary')}
              >
                <span class={cn('w-3 shrink-0 text-center text-[10px]', value === opt ? 'text-primary' : 'opacity-0')}>✓</span>
                {opt}
              </button>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/snippet}

<!-- ── Connection select ──────────────────────────────────────────────────────── -->
{#snippet ConnSelect({ id, value, onchange })}
  {@const isOpen = openDropdown === id}
  {@const selected = connections.find((c) => c.id === value)}
  {@const filtered = dropdownSearch ? connections.filter((c) => c.name.toLowerCase().includes(dropdownSearch.toLowerCase())) : connections}
  <div class="relative inline-flex">
    <button type="button"
      onclick={(e) => { e.stopPropagation(); if (isOpen) closeDd(); else openDd(id, e) }}
      class={cn('flex h-7 max-w-[200px] items-center gap-1.5 rounded-md border border-border/40 bg-muted/25 px-2.5 text-xs font-medium text-foreground/90 transition-colors hover:bg-muted/45 select-none', isOpen && 'border-border/70 bg-muted/50 text-foreground')}
    >
      {#if value === currentConnectionId}<span class="size-1.5 shrink-0 rounded-full bg-blue-400" title="Active connection"></span>{/if}
      <span class="max-w-[140px] truncate">{selected?.name ?? 'Connection'}</span>
      <ChevronDown class={cn('ml-auto size-3 shrink-0 text-muted-foreground/40 transition-transform', isOpen && 'rotate-180')} />
    </button>
    {#if isOpen}
      <div
        role="presentation"
        class={cn('fixed z-40 w-64 overflow-hidden rounded-lg border border-border/50 bg-popover shadow-2xl', ddFlipUp && '-translate-y-full')}
        style="top:{ddTop}px;left:{ddLeft}px"
        onpointerdown={(e) => e.stopPropagation()}
      >
        <div class="flex items-center gap-2 border-b border-border/25 px-3 py-2">
          <Search class="size-3 shrink-0 text-muted-foreground/35" />
          <input use:focusNode type="text" bind:value={dropdownSearch} placeholder="Search connections…"
            class="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/25" />
        </div>
        <div class="max-h-52 overflow-y-auto py-1">
          {#if filtered.length === 0}
            <p class="px-3 py-2 text-xs text-muted-foreground/35">No results</p>
          {:else}
            {#each filtered as conn}
              <button type="button" onclick={() => { onchange(conn.id); closeDd() }}
                class={cn('flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted/35', value === conn.id && 'text-primary')}
              >
                <span class={cn('w-3 shrink-0 text-center text-[10px]', value === conn.id ? 'text-primary' : 'opacity-0')}>✓</span>
                <span class="flex-1 truncate text-left">{conn.name}</span>
                {#if conn.id === currentConnectionId}<span class="shrink-0 text-[9px] text-blue-400/60">active</span>{/if}
              </button>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/snippet}

<!-- ── Mode toggle ────────────────────────────────────────────────────────────── -->
{#snippet ModeToggle({ mode, onset })}
  <div class="flex shrink-0 items-center rounded-md border border-border/40 bg-muted/15 p-0.5 text-[11px]">
    <button onclick={() => onset('table')}
      class={cn('rounded px-2 py-0.5 font-medium transition-colors', mode === 'table' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground/45 hover:text-muted-foreground/80')}>Table</button>
    <button onclick={() => onset('sql')}
      class={cn('rounded px-2 py-0.5 font-medium transition-colors', mode === 'sql' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground/45 hover:text-muted-foreground/80')}>SQL</button>
  </div>
{/snippet}

<div class="flex h-full min-h-0 flex-col overflow-hidden">

  <!-- ══ Config ════════════════════════════════════════════════════════════════ -->
  <div class="shrink-0 border-b border-border/30 bg-background">

    <div class="flex items-stretch">
      <!-- Source / Target stacked -->
      <div class="min-w-0 flex-1">

        <!-- SOURCE row -->
        <div class="flex items-center gap-2.5 px-5 py-2.5">
          <span class="flex w-[74px] shrink-0 items-center gap-1.5">
            <span class="size-1.5 shrink-0 rounded-full bg-blue-500"></span>
            <span class="text-[10px] font-semibold uppercase tracking-wider text-blue-500/90">Source</span>
          </span>
          {@render ConnSelect({ id: 'L.conn', value: L.connId, onchange: (v) => { L = { ...L, connId: v }; onConnChange('L') } })}
          {#if L.mode === 'table'}
            {@render SearchSelect({ id: 'L.db', value: L.database, options: L.databases, loading: L.loadingDbs, placeholder: 'database', onchange: (v) => { L = { ...L, database: v }; onDatabaseChange('L') } })}
            {@render SearchSelect({ id: 'L.schema', value: L.schema, options: L.schemas, loading: L.loadingSchemas, placeholder: 'schema', onchange: (v) => { L = { ...L, schema: v, table: '', tables: [] }; onSchemaChange('L') } })}
            {@render SearchSelect({ id: 'L.table', value: L.table, options: L.tables, loading: L.loadingTables, placeholder: 'table', onchange: (v) => { L = { ...L, table: v } } })}
          {:else}
            <div bind:this={lSqlEl} class="min-h-[64px] flex-1 overflow-hidden rounded-md" style="border: 1px solid rgba(255,255,255,0.06)"></div>
          {/if}
        </div>

        <div class="relative flex items-center px-5">
          <div class="h-px flex-1 bg-border/10"></div>
          <button
            onclick={swapSources}
            title="Swap source and target"
            aria-label="Swap source and target"
            class="mx-2 flex size-6 items-center justify-center rounded-md border border-border/40 bg-muted/20 text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <ArrowUpDown class="size-3" />
          </button>
          <div class="h-px flex-1 bg-border/10"></div>
        </div>

        <!-- TARGET row -->
        <div class="flex items-center gap-2.5 px-5 py-2.5">
          <span class="flex w-[74px] shrink-0 items-center gap-1.5">
            <span class="size-1.5 shrink-0 rounded-full bg-emerald-500"></span>
            <span class="text-[10px] font-semibold uppercase tracking-wider text-emerald-500/90">Target</span>
          </span>
          {@render ConnSelect({ id: 'R.conn', value: R.connId, onchange: (v) => { R = { ...R, connId: v }; onConnChange('R') } })}
          {#if R.mode === 'table'}
            {@render SearchSelect({ id: 'R.db', value: R.database, options: R.databases, loading: R.loadingDbs, placeholder: 'database', onchange: (v) => { R = { ...R, database: v }; onDatabaseChange('R') } })}
            {@render SearchSelect({ id: 'R.schema', value: R.schema, options: R.schemas, loading: R.loadingSchemas, placeholder: 'schema', onchange: (v) => { R = { ...R, schema: v, table: '', tables: [] }; onSchemaChange('R') } })}
            {@render SearchSelect({ id: 'R.table', value: R.table, options: R.tables, loading: R.loadingTables, placeholder: 'table', onchange: (v) => { R = { ...R, table: v } } })}
          {:else}
            <div bind:this={rSqlEl} class="min-h-[64px] flex-1 overflow-hidden rounded-md" style="border: 1px solid rgba(255,255,255,0.06)"></div>
          {/if}
        </div>

      </div>

      <!-- Single shared mode toggle for both rows -->
      <div class="flex shrink-0 items-center border-l border-border/15 px-4">
        {@render ModeToggle({ mode, onset: setMode })}
      </div>
    </div>

    <!-- Key cols + compare -->
    <div class="flex items-center gap-2.5 border-t border-border/15 px-5 py-2.5">
      <span class="w-[74px] shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40" title="Columns used to match rows between source and target">Key cols</span>
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {#each [...selectedKeyCols] as col}
          <button onclick={() => toggleKeyCol(col)}
            class="flex items-center gap-1 rounded-full bg-primary/12 px-2.5 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
          >{col}<X class="size-2.5" /></button>
        {/each}
        {#each keyColSuggestions.filter((c) => !selectedKeyCols.has(c)) as col}
          <button onclick={() => toggleKeyCol(col)}
            class="flex items-center gap-1 rounded-full border border-dashed border-border/40 px-2.5 py-0.5 text-[11px] text-muted-foreground/40 transition-colors hover:border-primary/40 hover:text-primary"
          ><Plus class="size-2.5" />{col}</button>
        {/each}
        {#if !keyColSuggestions.length && !selectedKeyCols.size}
          <span class="text-[11px] italic text-muted-foreground/20">auto — uses first column</span>
        {/if}
      </div>
      <button onclick={compare} disabled={comparing}
        class="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
      >
        {#if comparing}<Loader2 class="size-3.5 animate-spin" />{:else}<GitCompare class="size-3.5" />{/if}
        Compare
      </button>
    </div>

    {#if error}
      <div class="mx-5 mb-2 rounded bg-destructive/8 px-3 py-1.5 text-xs text-destructive">{error}</div>
    {/if}
  </div>

  <!-- ══ Results ════════════════════════════════════════════════════════════════ -->
  {#if diffRows.length > 0}

    <!-- Filter + search bar (tab-style, Vercel/Resend inspired) ── -->
    <div class="flex shrink-0 items-end gap-0 border-b border-border/15 px-5">

      {#each [
        { key: 'all',       label: 'All',       count: diffRows.length,                          badge: 'bg-muted/30 text-muted-foreground/50',           active: 'text-foreground' },
        { key: 'changed',   label: 'Changed',   count: stats.added+stats.modified+stats.removed, badge: 'bg-muted/30 text-muted-foreground/50',           active: 'text-foreground' },
        { key: 'added',     label: 'Added',     count: stats.added,                              badge: 'bg-emerald-500/10 text-emerald-400',             active: 'text-emerald-400' },
        { key: 'modified',  label: 'Modified',  count: stats.modified,                           badge: 'bg-yellow-500/10 text-yellow-400',               active: 'text-yellow-400' },
        { key: 'removed',   label: 'Removed',   count: stats.removed,                            badge: 'bg-red-500/10 text-red-400',                     active: 'text-red-400' },
        { key: 'unchanged', label: 'Unchanged', count: stats.unchanged,                          badge: 'bg-muted/30 text-muted-foreground/50',           active: 'text-foreground' },
      ] as f}
        <button
          onclick={() => { activeFilter = f.key }}
          class={cn(
            'flex items-center gap-1.5 border-b-2 pb-2.5 pt-2 px-3 text-xs transition-all',
            activeFilter === f.key
              ? cn('border-current font-medium', f.active)
              : 'border-transparent text-muted-foreground/55 hover:text-muted-foreground/80'
          )}
        >
          {f.label}
          {#if f.count > 0}
            <span class={cn(
              'rounded px-1.5 py-0.5 font-mono text-[10px] leading-none transition-colors',
              activeFilter === f.key ? f.badge : 'bg-muted/30 text-muted-foreground/45'
            )}>{f.count}</span>
          {/if}
        </button>
      {/each}

      <div class="ml-auto flex items-center gap-2 pb-2 pl-4">
        <Search class="size-3 shrink-0 text-muted-foreground/50" />
        <input type="text" bind:value={searchQuery} placeholder="Search rows…"
          class="w-36 bg-transparent text-xs outline-none placeholder:text-muted-foreground/40 focus:w-52 transition-all" />
        {#if searchQuery}
          <button onclick={() => { searchQuery = '' }} class="text-muted-foreground/50 hover:text-foreground transition-colors">
            <X class="size-3" />
          </button>
        {:else}
          <span class="text-[11px] text-muted-foreground/40 tabular-nums">
            {displayRows.length}{displayRows.length !== diffRows.length ? `/${diffRows.length}` : ''}
          </span>
        {/if}
      </div>
    </div>

    <!-- Virtual-scroll table ── -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="min-h-0 flex-1 overflow-auto"
      class:cursor-col-resize={resizingCol >= 0}
      onscroll={handleTableScroll}
    >
      <table class="w-full border-collapse text-xs" style="table-layout:fixed;min-width:{totalWidth}px">
        <colgroup>
          <col style="width:26px" />
          {#each colWidths as w}<col style="width:{w}px" />{/each}
          <!-- Flexible filler so the grid always fills the pane (no empty "hole") -->
          <col />
        </colgroup>
        <thead class="sticky top-0 z-20">
          <tr>
            <th class="border-b border-border/25 bg-background select-none"></th>
            {#each columns as col, ci}
              <th
                class="group relative border-b border-border/25 bg-background p-0 text-left select-none overflow-hidden"
                style="width:{colWidths[ci]}px;min-width:{colWidths[ci]}px;max-width:{colWidths[ci]}px"
              >
                <div class="flex min-w-0 items-baseline gap-1.5 px-3 py-2 pr-5">
                  <span class="truncate font-semibold text-foreground/75 text-[11px]">{col.name}</span>
                  {#if col.dataType && col.dataType.toLowerCase() !== 'null'}<span class="shrink-0 font-normal text-muted-foreground/35 text-[10px]">{col.dataType}</span>{/if}
                </div>
                <!-- Resize handle -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="absolute right-0 top-0 h-full w-4 cursor-col-resize"
                  onmousedown={(e) => startResize(ci, e)}
                >
                  <div class={cn('absolute right-1.5 top-1/2 h-3 w-px -translate-y-1/2 transition-opacity', resizingCol === ci ? 'bg-primary/60 opacity-100' : 'bg-border/40 opacity-0 group-hover:opacity-100')}></div>
                </div>
              </th>
            {/each}
            <th class="border-b border-border/25 bg-background select-none"></th>
          </tr>
        </thead>
        <tbody>
          {#if topPad > 0}<tr style="height:{topPad}px"><td colspan={columns.length + 2}></td></tr>{/if}
          {#each displayRows.slice(vStart, vEnd) as row}
            {@const isAdded    = row.status === 'added'}
            {@const isRemoved  = row.status === 'removed'}
            {@const isModified = row.status === 'modified'}
            {@const rowBg =
              isAdded    ? 'bg-emerald-500/[0.04]' :
              isRemoved  ? 'bg-red-500/[0.04]' :
              isModified ? 'bg-amber-500/[0.025]' : ''}
            {@const statusGlyph =
              isAdded   ? '+' : isRemoved ? '−' : isModified ? '~' : ''}
            {@const statusColor =
              isAdded   ? 'text-emerald-500' :
              isRemoved ? 'text-red-400' :
              isModified? 'text-amber-400/80' :
              'text-muted-foreground/15'}
            {@const accentColor =
              isAdded   ? 'bg-emerald-500/35' :
              isRemoved ? 'bg-red-500/35' :
              isModified? 'bg-amber-500/25' : ''}
            <tr class="{rowBg || 'hover:bg-foreground/[0.025]'} border-b border-border/8 transition-colors" style="height:{ROW_HEIGHT}px">
              <td class="relative select-none px-2 text-center font-mono text-[10px] font-bold {statusColor}">
                {#if accentColor}<span class="absolute inset-y-0 left-0 w-[2px] {accentColor}"></span>{/if}
                {statusGlyph}
              </td>
              {#each columns as _col, ci}
                {@const isChanged = isModified && row.changedCols?.has(ci)}
                {@const oldVal    = row.left?.[ci] ?? null}
                {@const newVal    = row.right?.[ci] ?? null}
                {@const dispVal   = isRemoved ? oldVal : newVal}
                {@const dispStr   = dispVal === null ? '' : String(dispVal)}
                <td class="overflow-hidden px-3 font-mono text-[11px]">
                  {#if isChanged}
                    <div class="flex min-w-0 items-center gap-1.5">
                      {#if oldVal === null}
                        <span class="shrink-0 text-[10px] italic text-red-400/45 line-through">NULL</span>
                      {:else}
                        <span class="min-w-0 flex-1 truncate text-[10px] text-red-400/55 line-through">{String(oldVal)}</span>
                      {/if}
                      <span class="shrink-0 font-sans text-[9px] text-muted-foreground/25">→</span>
                      {#if newVal === null}
                        <span class="shrink-0 text-[10px] italic text-emerald-400/70">NULL</span>
                      {:else}
                        <span class="min-w-0 flex-1 truncate text-emerald-300/90">{String(newVal)}</span>
                      {/if}
                    </div>
                  {:else if dispVal === null}
                    <span class="italic text-muted-foreground/15">NULL</span>
                  {:else if searchQuery}
                    <span class="block overflow-hidden text-ellipsis whitespace-nowrap {isAdded ? 'text-emerald-300/80' : isRemoved ? 'text-red-300/60' : ''}">
                      {#each splitHighlight(dispStr, searchQuery) as seg}
                        {#if seg.match}<mark class="rounded-[2px] bg-primary/20 text-primary not-italic">{seg.text}</mark>{:else}{seg.text}{/if}
                      {/each}
                    </span>
                  {:else}
                    <span class="block overflow-hidden text-ellipsis whitespace-nowrap {isAdded ? 'text-emerald-300/80' : isRemoved ? 'text-red-300/60' : ''}">{dispStr}</span>
                  {/if}
                </td>
              {/each}
              <td class="border-b border-border/8"></td>
            </tr>
          {/each}
          {#if bottomPad > 0}<tr style="height:{bottomPad}px"><td colspan={columns.length + 2}></td></tr>{/if}
        </tbody>
      </table>
    </div>

  {:else if comparing}
    <div class="flex flex-1 items-center justify-center">
      <Loader2 class="size-5 animate-spin text-muted-foreground/30" />
    </div>
  {:else}
    <div class="flex flex-1 flex-col items-center justify-center gap-4">
      <div class="flex size-14 items-center justify-center rounded-full border border-border/15 bg-muted/8">
        <GitCompare class="size-6 opacity-20" />
      </div>
      <div class="text-center">
        <p class="text-sm font-medium text-foreground/40">Compare any two data sources</p>
        <p class="mt-1 text-xs text-muted-foreground/25">Tables or SQL — even across different hosts</p>
      </div>
    </div>
  {/if}
</div>
