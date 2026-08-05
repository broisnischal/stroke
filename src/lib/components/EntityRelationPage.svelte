<script>
  import { tick, untrack } from 'svelte'
  import dagre from '@dagrejs/dagre'
  import { getSchemaColumnStructure, listIndexes, getTableDdl, saveExportAs } from '$lib/api.js'
  import ErdCanvas from './ErdCanvas.svelte'
  import Loader from '@lucide/svelte/icons/loader'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import Search from '@lucide/svelte/icons/search'
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard'
  import KeyRound from '@lucide/svelte/icons/key-round'
  import Link from '@lucide/svelte/icons/link'
  import X from '@lucide/svelte/icons/x'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import Network from '@lucide/svelte/icons/network'
  import Download from '@lucide/svelte/icons/download'
  import Square from '@lucide/svelte/icons/square'
  import Copy from '@lucide/svelte/icons/copy'
  import Check from '@lucide/svelte/icons/check'
  import LayoutGrid from '@lucide/svelte/icons/layout-grid'
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal'
  import { toast } from "$lib/components/ui/sonner/toast.svelte.js"
  import { svgStringToPngBlob } from '$lib/svg-png.js'
  import { Popover, PopoverTrigger, PopoverContent } from '$lib/components/ui/popover/index.js'
  import { isCurrentThemeDark } from '$lib/stores/settings.js'
  import { loadErdSettings, saveErdSettings, SPACING_PRESETS, SCOPE_DEFAULTS } from '$lib/stores/erd-settings.js'
  import { routeEdges, routeToSvgPath, MAX_ROUTED_NODES } from '$lib/erd-routing.js'
  import { cn } from '$lib/utils.js'

  let {
    schema = 'public',
    schemas = /** @type {string[]} */ ([]),
    /** @type {((schema:string, table:string, opts?:{duplicate?:boolean, viewMode?:string})=>void)|undefined} */
    onopentable = undefined,
    /** When set, the ERD is scoped to this table + the tables directly FK-connected to it. */
    focusTable = '',
    onclearfocus = /** @type {(() => void)|undefined} */ (undefined),
    /** True when the host chrome (the table tab bar) owns the Export menu. The
     *  standalone ERD tab has no such menu, so it keeps its own entries. */
    hostExports = false,
    /** True when this diagram is rendered inside the focused table's own tab. */
    insideTableTab = false,
  } = $props()

  /**
   * @typedef {{ name: string, dataType: string, isNullable: boolean,
   *   columnDefault: string|null, foreignKey: string|null,
   *   fkConstraintName: string|null, ordinalPosition: number }} Col
   * @typedef {{ name: string, columns: Col[], pkCols: Set<string>,
   *   uniqueCols?: Set<string>, hiddenCount?: number }} TableMeta
   * @typedef {'self' | 'related' | 'all'} Scope
   */

  /** @type {{ id: Scope, label: string, hint: string }[]} */
  const SCOPES = [
    { id: 'self',    label: 'Table',   hint: 'Only this table' },
    { id: 'related', label: 'Related', hint: 'This table and everything FK-linked to it' },
    { id: 'all',     label: 'Schema',  hint: 'Every table in the schema' },
  ]

  // ── Config ────────────────────────────────────────────────────────────────
  const NODE_W    = 268
  const ROW_H     = 28
  const HDR_H     = 42
  const PAD_B     = 10
  const BATCH     = 16
  const WARN_MANY = 60

  const cfg = { NODE_W, ROW_H, HDR_H, PAD_B }

  /** @type {ErdCanvas|null} */
  let erd = $state(null)

  // ── State ─────────────────────────────────────────────────────────────────
  let loading       = $state(false)
  let loadedCount   = $state(0)
  let totalCount    = $state(0)
  let error         = $state('')
  let search        = $state('')
  let searchEl      = $state(/** @type {HTMLInputElement | null} */ (null))
  let activeSchema  = $state(untrack(() => schema))
  let schemaOpen    = $state(false)
  let settingsOpen  = $state(false)
  let exporting     = $state(false)
  let settings      = $state(loadErdSettings())
  /** Big schemas open filtered to FK-connected tables - session only, not persisted. */
  let autoConnected = $state(false)
  const connectedOnly = $derived(settings.connectedOnly || autoConnected)
  /** @type {Scope} */
  let scope = $state(untrack(() => (focusTable ? 'related' : 'all')))
  /**
   * What the diagram actually uses: the user's explicit choices win, everything
   * else follows the view's default (a focused table diagram opens wide and
   * unrouted; a whole schema opens denser with routed lines).
   */
  const view = $derived.by(() => {
    const base = focusTable && scope !== 'all' ? SCOPE_DEFAULTS.focused : SCOPE_DEFAULTS.schema
    return {
      ...settings,
      spacing: settings.touched.includes('spacing') ? settings.spacing : base.spacing,
      routing: settings.touched.includes('routing') ? settings.routing : base.routing,
    }
  })
  const gaps = $derived(SPACING_PRESETS[view.spacing] ?? SPACING_PRESETS.comfortable)
  /** @type {string|null} */
  let selectedTable = $state(null)
  /** @type {Map<string, TableMeta>} */
  let tableMeta     = $state(new Map())

  /** @type {any[]} */
  let nodes = $state([])
  /** @type {any[]} */
  let edges = $state([])

  /** @type {Map<string, {x: number, y: number}>} */
  const _posCache = new Map()

  // ── Node height ───────────────────────────────────────────────────────────
  // Must match ErdCanvas' nodeH exactly - the layout reserves the space the
  // canvas then paints, including the "+N more" row in keys-only mode.
  /** @param {TableMeta} t */
  function nodeH(t) {
    return HDR_H + t.columns.length * ROW_H + (t.hiddenCount ? ROW_H : 0) + PAD_B
  }

  /** @param {any} n */
  const hOf = (n) => (n.data ? nodeH(n.data) : HDR_H)

  // ── Layout ────────────────────────────────────────────────────────────────
  /**
   * Focus layout: the opened table sits in the middle, the tables it references
   * (parents) stack to its right and the tables that reference it (children) to
   * its left, each side packed into height-capped sub-columns. Cards never share
   * a band, and every band is separated by a full `colGap`, which is what gives
   * the edge router a clear corridor instead of a path across a table.
   *
   * @param {any[]} ns @param {any[]} es @param {string} focus
   */
  function layoutFocus(ns, es, focus) {
    const focusNode = ns.find(n => n.id === focus)
    if (!focusNode) return null

    /** @type {Set<string>} */
    const parents = new Set()
    /** @type {Set<string>} */
    const children = new Set()
    for (const e of es) {
      if (e.source === focus && e.target !== focus) parents.add(e.target)
      else if (e.target === focus && e.source !== focus) children.add(e.source)
    }
    // A table on both sides is drawn once, on the parent side.
    for (const id of parents) children.delete(id)

    const focusH  = hOf(focusNode)
    const focusMid = focusH / 2
    /** @type {Map<string, {x:number,y:number}>} */
    const placed = new Map([[focus, { x: 0, y: 0 }]])

    /** Pack one side into sub-columns growing away from the focus card.
     *  @param {any[]} items @param {1|-1} dir */
    function packSide(items, dir) {
      if (!items.length) return
      const maxH = items.reduce((m, n) => Math.max(m, hOf(n)), HDR_H)
      // Keep a side no taller than a few cards so the whole graph stays legible
      // at fit-zoom; overflow spills into another sub-column instead.
      const targetH = Math.max(focusH, maxH * 4 + gaps.rowGap * 3)
      const rows = Math.max(1, Math.floor(targetH / (maxH + gaps.rowGap)))
      const cols = Math.ceil(items.length / rows)

      // Balance columns by height: tallest card into the shortest column. Slicing
      // in order leaves one full column beside a stub, which is what makes the
      // fan look clumped with holes in it.
      /** @type {any[][]} */
      const colItems = Array.from({ length: cols }, () => [])
      const colH = new Array(cols).fill(0)
      for (const n of [...items].sort((a, b) => hOf(b) - hOf(a))) {
        let k = 0
        for (let j = 1; j < cols; j++) if (colH[j] < colH[k]) k = j
        colItems[k].push(n)
        colH[k] += hOf(n) + gaps.rowGap
      }

      for (let col = 0; col < cols; col++) {
        const slice = colItems[col].sort(byName)
        if (!slice.length) continue
        const total = colH[col] - gaps.rowGap
        const x = dir > 0
          ? NODE_W + gaps.sideGap + col * (NODE_W + gaps.colGap)
          : -gaps.sideGap - (col + 1) * NODE_W - col * gaps.colGap
        let y = focusMid - total / 2
        for (const n of slice) {
          placed.set(n.id, { x, y })
          y += hOf(n) + gaps.rowGap
        }
      }
    }

    const byName = (/** @type {any} */ a, /** @type {any} */ b) => a.id.localeCompare(b.id)
    let right = ns.filter(n => parents.has(n.id)).sort(byName)
    let left  = ns.filter(n => children.has(n.id)).sort(byName)
    // Keep the focused table literally in the middle: when every neighbour points
    // the same way, split them across both sides instead of stacking one wing.
    if (!left.length && right.length > 3) {
      const half = Math.ceil(right.length / 2)
      left = right.slice(half); right = right.slice(0, half)
    } else if (!right.length && left.length > 3) {
      const half = Math.ceil(left.length / 2)
      right = left.slice(half); left = left.slice(0, half)
    }
    packSide(right, 1)
    packSide(left, -1)

    // Not linked to the focus table directly (only reachable through a neighbour):
    // park them in a row well below, so they never sit inside a routing corridor.
    const rest = ns.filter(n => n.id !== focus && !placed.has(n.id))
    const restY = focusH + gaps.rowGap * 3
    rest.forEach((n, i) => placed.set(n.id, { x: i * (NODE_W + gaps.colGap), y: restY }))

    let minX = Infinity, minY = Infinity
    for (const p of placed.values()) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y) }
    return ns.map(n => {
      const p = placed.get(n.id) ?? { x: 0, y: 0 }
      return { ...n, position: { x: Math.round(p.x - minX + 40), y: Math.round(p.y - minY + 40) } }
    })
  }

  /**
   * Connected nodes → Dagre LR.
   * Orphan nodes (no FK edges) → compact grid below connected graph.
   */
  function layoutNodes(ns, es) {
    if (focusTable && scope === 'related' && ns.length > 1) {
      const laid = layoutFocus(ns, es, focusTable)
      if (laid) return laid
    }
    const linked = new Set()
    for (const e of es) { linked.add(e.source); linked.add(e.target) }

    const conn    = ns.filter(n => linked.has(n.id))
    const orphans = ns.filter(n => !linked.has(n.id))

    let laidConn = []
    let bottomY  = 0

    if (conn.length) {
      const g = new dagre.graphlib.Graph()
      g.setGraph({ rankdir: 'LR', ranksep: gaps.rankSep, nodesep: gaps.nodeSep, marginx: 80, marginy: 80 })
      g.setDefaultEdgeLabel(() => ({}))
      for (const n of conn) {
        g.setNode(n.id, { width: NODE_W, height: hOf(n) })
      }
      for (const e of es) g.setEdge(e.source, e.target)
      dagre.layout(g)

      // Dagre already minimises edge crossings - so for a normal schema we trust
      // its coordinates directly and the graph reads clean (few/no crossings).
      // The one case it handles poorly is a single rank that fans into a huge
      // vertical stack (a hub referenced by dozens of tables): there we re-flow
      // that rank into height-capped sub-columns so it becomes a readable grid
      // instead of one unreadable tall smear.
      /** @type {Map<number, {n:any,y:number,h:number}[]>} */
      const ranks = new Map()
      for (const n of conn) {
        const p = g.node(n.id)
        const key = Math.round(p.x)
        if (!ranks.has(key)) ranks.set(key, [])
        ranks.get(key)?.push({ n, y: p.y, h: hOf(n) })
      }
      /** @type {Map<string, {x:number,y:number}>} */
      const placed = new Map()
      const MAX_STACK = 10
      const oversized = [...ranks.values()].some((items) => items.length > MAX_STACK)

      if (!oversized) {
        // Honest Dagre layout: convert node centres → top-left and normalise so the
        // graph begins a little in from the origin. This is what removes the
        // crossings the sub-column re-pack used to introduce.
        let minX = Infinity, minY = Infinity
        for (const n of conn) {
          const p = g.node(n.id)
          const h = hOf(n)
          minX = Math.min(minX, p.x - NODE_W / 2)
          minY = Math.min(minY, p.y - h / 2)
        }
        for (const n of conn) {
          const p = g.node(n.id)
          const h = hOf(n)
          placed.set(n.id, {
            x: Math.round(p.x - NODE_W / 2 - minX + 40),
            y: Math.round(p.y - h / 2 - minY + 40),
          })
        }
      } else {
        // Huge fan: re-flow each rank into sub-columns capped at TARGET_H so a hub
        // spreads into a grid. Generous gaps keep cards from crowding and give
        // edges room; RANK_GAP stays modest so a deep graph doesn't stretch into an
        // unreadable sliver.
        const TARGET_H = 2600
        let cursorX = 40
        for (const key of [...ranks.keys()].sort((a, b) => a - b)) {
          const items = (ranks.get(key) ?? []).sort((a, b) => a.y - b.y)
          const maxH = items.reduce((m, it) => Math.max(m, it.h), HDR_H)
          const rows = Math.max(1, Math.floor(TARGET_H / (maxH + gaps.rowGap)))
          const cols = Math.ceil(items.length / rows)
          const colY = new Array(cols).fill(40) // per sub-column running Y (packs tight)
          for (let i = 0; i < items.length; i++) {
            const col = Math.floor(i / rows)
            placed.set(items[i].n.id, { x: cursorX + col * (NODE_W + gaps.colGap), y: colY[col] })
            colY[col] += items[i].h + gaps.rowGap
          }
          cursorX += cols * (NODE_W + gaps.colGap) + gaps.rankSep
        }
      }

      laidConn = conn.map(n => {
        const pos = placed.get(n.id) ?? { x: 0, y: 0 }
        bottomY = Math.max(bottomY, pos.y + hOf(n))
        return { ...n, position: pos }
      })
    }

    // Orphans in a responsive grid below the connected graph
    const orphanY = laidConn.length ? bottomY + gaps.rowGap * 2 : 0
    const maxH = orphans.reduce((m, n) => Math.max(m, hOf(n)), HDR_H)
    const GCOLS = Math.max(3, Math.min(6, Math.ceil(Math.sqrt(orphans.length * 1.8))))
    const laidOrphans = orphans.map((n, i) => ({
      ...n,
      position: {
        x: (i % GCOLS) * (NODE_W + gaps.colGap),
        y: orphanY + Math.floor(i / GCOLS) * (maxH + gaps.rowGap),
      },
    }))

    return [...laidConn, ...laidOrphans]
  }

  // ── Edge list ─────────────────────────────────────────────────────────────
  /** @param {TableMeta[]} all */
  function buildEdgeData(all) {
    /** @type {any[]} */
    const rawEdges = []
    /** @type {Set<string>} */
    const connected = new Set()
    for (const t of all) {
      for (const col of t.columns) {
        if (!col.foreignKey) continue
        const parts    = col.foreignKey.split('.')
        const refTable = parts.length >= 3 ? parts[1] : parts[0]
        const refCol   = parts.length >= 3 ? parts[2] : parts[1]
        if (!tableMeta.has(refTable)) continue
        // Cardinality straight off the schema: the FK side is "many" unless that
        // column is itself unique or the PK (then it's one-to-one), and a nullable
        // FK means the parent side is optional (zero-or-one).
        const unique = t.pkCols.has(col.name) || t.uniqueCols?.has(col.name) === true
        rawEdges.push({
          id:           `${t.name}__${col.name}__${refTable}`,
          source:       t.name,
          target:       refTable,
          sourceHandle: `src-${col.name}`,
          targetHandle: refCol ? `tgt-${refCol}` : 'tgt',
          type:         'relation',
          many:         !unique,
          optional:     col.isNullable === true,
        })
        connected.add(t.name)
        connected.add(refTable)
      }
    }
    return { rawEdges, connected }
  }

  // ── Build graph ───────────────────────────────────────────────────────────
  /** @param {boolean} [forceLayout] */
  function buildGraph(forceLayout = false) {
    const all = [...tableMeta.values()]
    const { rawEdges, connected } = buildEdgeData(all)
    const scoped = focusTable && tableMeta.has(focusTable)
    let visible
    if (scoped && scope === 'self') {
      visible = all.filter(t => t.name === focusTable)
    } else if (scoped && scope === 'related') {
      // Per-table ERD: the focused table + every table directly FK-connected to it.
      const neighbors = new Set([focusTable])
      for (const e of rawEdges) {
        if (e.source === focusTable) neighbors.add(e.target)
        if (e.target === focusTable) neighbors.add(e.source)
      }
      visible = all.filter(t => neighbors.has(t.name))
    } else {
      visible = all.filter(t => !connectedOnly || connected.has(t.name))
    }
    const visibleIds = new Set(visible.map(t => t.name))
    let filteredEdges = rawEdges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target))
    // In the per-table view, only the focused table's own relationships are drawn.
    // Neighbour-to-neighbour FKs would add long runs across the whole canvas that
    // say nothing about the table you opened.
    if (scoped && scope === 'related') {
      filteredEdges = filteredEdges.filter(e => e.source === focusTable || e.target === focusTable)
    }

    const keysOnly = view.columnMode === 'keys'
    const rawNodes = visible.map(t => {
      // Keys-only trims every card to its PK/FK rows: shorter cards mean shorter
      // ranks, which is the cheapest way to make a wide schema readable.
      const columns = keysOnly
        ? t.columns.filter(col => t.pkCols.has(col.name) || !!col.foreignKey)
        : t.columns
      return {
        id:       t.name,
        type:     'tableNode',
        position: _posCache.get(t.name) ?? { x: 0, y: 0 },
        data: {
          ...t,
          columns,
          hiddenCount: t.columns.length - columns.length,
          highlighted: true,
          selected:    t.name === selectedTable,
          isFocus:     !!focusTable && t.name === focusTable,
          onSelect: (/** @type {string} */ name) => { selectedTable = selectedTable === name ? null : name },
          onOpen:   (/** @type {string} */ name) => openTable(name),
        },
      }
    })

    const needsLayout = forceLayout || visible.some(t => !_posCache.has(t.name))
    if (needsLayout) {
      const laid = layoutNodes(rawNodes, filteredEdges)
      for (const n of laid) _posCache.set(n.id, n.position)
      nodes = laid
    } else {
      nodes = rawNodes
    }
    edges = filteredEdges
    if (search.trim()) _applySearch(search.trim().toLowerCase())
  }

  // Re-scope + re-layout when the focused table changes (e.g. opened from the sidebar).
  let _prevFocus = untrack(() => focusTable)
  $effect(() => {
    if (focusTable === _prevFocus) return
    _prevFocus = focusTable
    scope = focusTable ? 'related' : 'all'
    _posCache.clear()
    buildGraph(true)
    void tick().then(() => erd?.reveal?.())
  })

  // Scope / card geometry / gutters all change the shape of the graph, so they
  // need a fresh layout rather than a rebuild on cached positions.
  let _shapeKey = untrack(() => `${scope}|${view.columnMode}|${view.spacing}|${connectedOnly}`)
  $effect(() => {
    const key = `${scope}|${view.columnMode}|${view.spacing}|${connectedOnly}`
    if (key === _shapeKey) return
    _shapeKey = key
    if (tableMeta.size === 0) return
    _posCache.clear()
    buildGraph(true)
    void tick().then(() => erd?.reveal?.())
  })

  // ── Search ────────────────────────────────────────────────────────────────
  /** @param {string} q */
  function _applySearch(q) {
    if (!q) {
      nodes = nodes.map(n => ({ ...n, data: { ...n.data, highlighted: true } }))
      return
    }
    const hi = new Set()
    for (const [name, t] of tableMeta) {
      if (name.toLowerCase().includes(q) || t.columns.some(c => c.name.toLowerCase().includes(q)))
        hi.add(name)
    }
    nodes = nodes.map(n => ({ ...n, data: { ...n.data, highlighted: hi.has(n.id) } }))
  }

  let _rebuildTimer = /** @type {ReturnType<typeof setTimeout>|null} */ (null)
  function scheduleRebuild() {
    if (_rebuildTimer) clearTimeout(_rebuildTimer)
    _rebuildTimer = setTimeout(() => { buildGraph(); _rebuildTimer = null }, 80)
  }

  function reLayout() {
    _posCache.clear()
    buildGraph(true)
    tick().then(() => erd?.reveal?.())
  }

  /** Persist a dragged node's new position so rebuilds and exports keep it. */
  function onNodeMoved(/** @type {string} */ id, /** @type {number} */ x, /** @type {number} */ y) {
    _posCache.set(id, { x, y })
    nodes = nodes.map((n) => (n.id === id ? { ...n, position: { x, y } } : n))
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  async function load() {
    loading     = true
    loadedCount = 0
    totalCount  = 0
    error       = ''
    tableMeta   = new Map()
    nodes       = []
    edges       = []
    _posCache.clear()
    if (_rebuildTimer) { clearTimeout(_rebuildTimer); _rebuildTimer = null }

    try {
      // One call for the whole schema. This used to fan out one request per
      // table, which meant the diagram couldn't start drawing until N round
      // trips had completed — the dominant cost on any non-trivial schema.
      const schemaCols = await getSchemaColumnStructure(activeSchema)
      totalCount = schemaCols.length
      autoConnected = schemaCols.length > WARN_MANY

      for (const { table, columns } of schemaCols) {
        const cols = /** @type {Col[]} */ (columns)
        // Provisional keys: enough to draw with. refineKeys() replaces these
        // with the real primary/unique indexes as soon as they land.
        const pkCols = new Set(
          cols.filter(c =>
            c.columnDefault?.includes('nextval') ||
            (c.name === 'id' && !c.isNullable && !c.foreignKey)
          ).map(c => c.name)
        )
        tableMeta.set(table, /** @type {TableMeta} */ ({ name: table, columns: cols, pkCols }))
      }
      loadedCount = schemaCols.length
      tableMeta = new Map(tableMeta)
      await tick()
      buildGraph(true)
      void refineKeys()
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }

  /** Exact PK columns, plus the single-column unique keys that make a FK 1:1. */
  async function refineKeys() {
    try {
      const idxs = /** @type {{ tableName: string, isPrimary: boolean, isUnique: boolean, columns: string }[]} */ (
        await listIndexes(activeSchema)
      )
      let changed = false
      for (const idx of idxs) {
        const meta = tableMeta.get(idx.tableName)
        if (!meta) continue
        const cols = idx.columns.split(',').map(s => s.trim().replace(/"/g, '')).filter(Boolean)
        if (idx.isPrimary) {
          meta.pkCols = new Set(cols)
          changed = true
        } else if (idx.isUnique && cols.length === 1) {
          meta.uniqueCols = new Set([...(meta.uniqueCols ?? []), cols[0]])
          changed = true
        }
      }
      if (changed) { tableMeta = new Map(tableMeta); buildGraph() }
    } catch { /* non-critical */ }
  }

  // ── Reactivity ────────────────────────────────────────────────────────────
  $effect(() => { void activeSchema; void load() })


  $effect(() => {
    const q = search.trim().toLowerCase()
    const sel = selectedTable
    untrack(() => {
      if (!nodes.length) return
      nodes = nodes.map(n => ({
        ...n,
        data: {
          ...n.data,
          selected: n.id === sel,
          highlighted: q
            ? (n.id.toLowerCase().includes(q) ||
               (tableMeta.get(n.id)?.columns.some(c => c.name.toLowerCase().includes(q)) ?? false))
            : true,
        },
      }))
    })
  })

  const focusNodeId = $derived.by(() => {
    const q = search.trim().toLowerCase()
    if (!q) return null
    const names = [...tableMeta.keys()]
    const exact = names.find(n => n.toLowerCase() === q)
    if (exact) return exact
    const hits = names.filter(n => n.toLowerCase().includes(q))
    return hits.length === 1 ? hits[0] : null
  })

  $effect(() => {
    const id = focusNodeId
    if (id) untrack(() => erd?.focus(id))
  })

  /** The scoped table, only once it actually exists in the loaded schema. */
  const focusId = $derived(focusTable && tableMeta.has(focusTable) ? focusTable : null)

  /** Table whose DDL was just copied - drives the tick on the inspector button. */
  let copiedDdl = $state('')
  /** @type {ReturnType<typeof setTimeout>|null} */
  let _copiedTimer = null

  /** Copy a table's CREATE statement straight from the inspector. @param {string} name */
  async function copyDdl(name) {
    try {
      const ddl = await getTableDdl(activeSchema, name)
      await navigator.clipboard.writeText(ddl)
      copiedDdl = name
      if (_copiedTimer) clearTimeout(_copiedTimer)
      _copiedTimer = setTimeout(() => { copiedDdl = '' }, 1800)
    } catch (e) {
      toast.error('Could not copy DDL', { description: String(e) })
    }
  }

  /**
   * Open a table from the diagram. Opening the table this diagram belongs to would
   * just re-activate the tab we are already in - which is still showing the
   * diagram, so nothing appears to happen. Ask for a duplicate tab in table view
   * instead, which is what "Open table" means from here.
   * @param {string} name
   */
  function openTable(name) {
    const duplicate = insideTableTab && !!focusTable && name === focusTable
    onopentable?.(activeSchema, name, duplicate ? { duplicate: true, viewMode: 'table' } : undefined)
  }

  /** @param {Partial<import('$lib/stores/erd-settings.js').ErdSettings>} patch */
  function updateSettings(patch) {
    settings = saveErdSettings(patch)
    if ('connectedOnly' in patch) autoConnected = false
  }

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

  // ── Export / Download ─────────────────────────────────────────────────────
  // The export used to render on a fixed dark sheet with hardcoded ink, so a
  // diagram exported from a light theme came back as someone else's dark
  // diagram. It samples the running theme instead — same tokens the canvas
  // resolves, so the file matches what's on screen.
  //
  // Ink that carries meaning (PK amber, FK blue, focus teal) stays authored here
  // in OKLCH, in a light and a dark variant: those hues aren't in the token set,
  // and picking by polarity keeps them legible on either sheet.
  const INK = {
    dark:  { edge: 'oklch(0.55 0.03 255)', pk: 'oklch(0.80 0.12 82)', fk: 'oklch(0.70 0.11 252)', focus: 'oklch(0.80 0.11 192)' },
    light: { edge: 'oklch(0.62 0.04 255)', pk: 'oklch(0.60 0.13 72)', fk: 'oklch(0.52 0.14 255)', focus: 'oklch(0.55 0.10 196)' },
  }

  // The on-screen legend and the column key/link glyphs use the same ink as the
  // canvas, so they have to follow theme polarity rather than sit on the dark set.
  const ink = $derived($isCurrentThemeDark ? INK.dark : INK.light)

  /**
   * Snapshot the theme the export should be drawn in. Tokens are read as
   * computed values so the SVG carries concrete colours rather than `var(--…)`
   * references, which resolve to nothing once the file leaves the app.
   */
  function exportPalette() {
    const css = getComputedStyle(document.documentElement)
    const tok = (/** @type {string} */ n, /** @type {string} */ fallback) =>
      css.getPropertyValue(n).trim() || fallback
    const dark = document.documentElement.classList.contains('dark')
    const ink = dark ? INK.dark : INK.light
    return {
      ...ink,
      sheet:  tok('--background', dark ? '#0d0d10' : '#ffffff'),
      card:   tok('--card', dark ? '#141418' : '#ffffff'),
      header: tok('--muted', dark ? '#1d1d26' : '#f4f4f5'),
      border: tok('--border', dark ? '#252535' : '#e4e4e7'),
      text:   tok('--foreground', dark ? '#e2e2ea' : '#18181b'),
      muted:  tok('--muted-foreground', dark ? '#6b6b80' : '#71717a'),
      faint:  tok('--muted-foreground', dark ? '#333345' : '#a1a1aa'),
      accent: tok('--primary', 'oklch(0.62 0.19 275)'),
      dot:    dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      shadow: dark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.10)',
      rule:   dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    }
  }

  /**
   * Crow's foot marker as SVG path data, oriented along the line.
   * @param {{x:number,y:number}} at @param {{x:number,y:number}} toward
   * @param {'fork'|'bar'} kind @param {boolean} ring
   */
  function svgMarker(at, toward, kind, ring) {
    const dx = toward.x - at.x, dy = toward.y - at.y
    const m = Math.hypot(dx, dy) || 1
    const ux = dx / m, uy = dy / m
    const px = -uy, py = ux
    const L = 11, W = 5.5
    if (kind === 'fork') {
      const bx = at.x + ux * L, by = at.y + uy * L
      return `M${bx} ${by}L${at.x + px * W} ${at.y + py * W}` +
             `M${bx} ${by}L${at.x - px * W} ${at.y - py * W}` +
             `M${bx} ${by}L${at.x} ${at.y}`
    }
    const bx = at.x + ux * (L * 0.55), by = at.y + uy * (L * 0.55)
    let d = `M${bx + px * W} ${by + py * W}L${bx - px * W} ${by - py * W}`
    if (ring) {
      const cx = at.x + ux * (L * 1.5), cy = at.y + uy * (L * 1.5)
      d += `M${cx - 3} ${cy}a3 3 0 1 0 6 0a3 3 0 1 0 -6 0`
    }
    return d
  }

  /** @param {string} s */
  function xesc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function generateSvg() {
    const vis = nodes.filter(n => n.data?.highlighted !== false)
    if (!vis.length) return null

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const n of vis) {
      const h = nodeH(n.data)
      x0 = Math.min(x0, n.position.x)
      y0 = Math.min(y0, n.position.y)
      x1 = Math.max(x1, n.position.x + NODE_W)
      y1 = Math.max(y1, n.position.y + h)
    }
    const P = 56
    const W = x1 - x0 + P * 2
    const H = y1 - y0 + P * 2
    const dx = -x0 + P
    const dy = -y0 + P
    const FONT = 'ui-monospace,Cascadia Code,Menlo,Consolas,monospace'
    const visIds = new Set(vis.map(n => n.id))
    const c = exportPalette()

    const o = []
    o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`)
    o.push(`<rect width="${W}" height="${H}" fill="${c.sheet}"/>`)
    o.push(`<defs><pattern id="dp" width="22" height="22" patternUnits="userSpaceOnUse">`)
    o.push(`<circle cx="1.2" cy="1.2" r="0.8" fill="${c.dot}"/></pattern></defs>`)
    o.push(`<rect width="${W}" height="${H}" fill="url(#dp)"/>`)

    // Edges first (behind nodes), routed by the same engine the canvas uses so an
    // exported diagram matches what's on screen - no lines across tables.
    const boxes = vis.map(n => ({
      id: n.id, x: n.position.x + dx, y: n.position.y + dy, w: NODE_W, h: nodeH(n.data),
    }))
    /** @type {import('$lib/erd-routing.js').Link[]} */
    const links = []
    for (const e of edges) {
      if (!visIds.has(e.source) || !visIds.has(e.target)) continue
      const sn = vis.find(n => n.id === e.source)
      const tn = vis.find(n => n.id === e.target)
      if (!sn || !tn) continue
      const scols = sn.data?.columns ?? []
      const tcols = tn.data?.columns ?? []
      const ci = scols.findIndex(c => `src-${c.name}` === e.sourceHandle)
      const ti = tcols.findIndex(c => `tgt-${c.name}` === e.targetHandle)
      const rowY = (/** @type {number} */ y, /** @type {number} */ i) =>
        y + HDR_H + (i >= 0 ? i * ROW_H + ROW_H / 2 : -HDR_H / 2)
      const leftToRight = tn.position.x >= sn.position.x
      links.push({
        id: e.id,
        source: e.source,
        target: e.target,
        sx: sn.position.x + dx + (leftToRight ? NODE_W : 0),
        sy: rowY(sn.position.y + dy, ci),
        tx: tn.position.x + dx + (leftToRight ? 0 : NODE_W),
        ty: rowY(tn.position.y + dy, ti),
        sdir: leftToRight ? 1 : -1,
        tdir: leftToRight ? -1 : 1,
      })
    }
    const routed = routeEdges(boxes, links)
    // One path element for every line, so a crossing never paints twice as bright.
    const lineD = []
    const markD = []
    for (const l of links) {
      const pts = routed.get(l.id)
      lineD.push(pts
        ? routeToSvgPath(pts)
        : `M${l.sx} ${l.sy} C${(l.sx + l.tx) / 2} ${l.sy} ${(l.sx + l.tx) / 2} ${l.ty} ${l.tx} ${l.ty}`)
      const a0 = pts?.[0] ?? { x: l.sx, y: l.sy }
      const a1 = pts?.[1] ?? { x: l.sx + l.sdir, y: l.sy }
      const z0 = pts?.[pts.length - 1] ?? { x: l.tx, y: l.ty }
      const z1 = pts?.[pts.length - 2] ?? { x: l.tx + l.tdir, y: l.ty }
      const edge = edges.find(e => e.id === l.id)
      markD.push(svgMarker(a0, a1, edge?.many === false ? 'bar' : 'fork', false))
      markD.push(svgMarker(z0, z1, 'bar', edge?.optional === true))
    }
    o.push(`<path d="${lineD.join(' ')}" fill="none" stroke="${EDGE_INK}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`)
    o.push(`<path d="${markD.join(' ')}" fill="none" stroke="${EDGE_INK}" stroke-width="1.2" stroke-linecap="round"/>`)

    // nodes
    for (const n of vis) {
      const cols = n.data?.columns ?? []
      const pkCols = n.data?.pkCols ?? new Set()
      const h = nodeH(n.data)
      const nx = n.position.x + dx
      const ny = n.position.y + dy
      const isSel = n.data?.selected
      const isFocus = n.data?.isFocus

      // shadow
      o.push(`<rect x="${nx+3}" y="${ny+4}" width="${NODE_W}" height="${h}" rx="8" fill="rgba(0,0,0,0.45)"/>`)
      // focus halo - marks the table the diagram was scoped to
      if (isFocus) {
        o.push(`<rect x="${nx-6}" y="${ny-6}" width="${NODE_W+12}" height="${h+12}" rx="13" fill="rgba(99,102,241,0.10)" stroke="rgba(99,102,241,0.4)" stroke-width="1.5"/>`)
      }
      // card bg
      o.push(`<rect x="${nx}" y="${ny}" width="${NODE_W}" height="${h}" rx="8" fill="#141418" stroke="${isFocus || isSel ? '#6366f1' : '#252535'}" stroke-width="${isFocus ? 2 : isSel ? 1.5 : 1}"/>`)
      // header
      o.push(`<clipPath id="hc${n.id.replace(/\W/g,'_')}"><rect x="${nx}" y="${ny}" width="${NODE_W}" height="${HDR_H + 8}" rx="8"/></clipPath>`)
      o.push(`<rect x="${nx}" y="${ny}" width="${NODE_W}" height="${HDR_H + 8}" fill="${isFocus ? '#252546' : '#1d1d26'}" clip-path="url(#hc${n.id.replace(/\W/g,'_')})"/>`)
      o.push(`<line x1="${nx}" y1="${ny+HDR_H}" x2="${nx+NODE_W}" y2="${ny+HDR_H}" stroke="${isFocus ? 'rgba(99,102,241,0.55)' : '#252535'}" stroke-width="1"/>`)
      o.push(`<text x="${nx+12}" y="${ny+HDR_H/2+4}" font-size="11" font-weight="600" font-family="${FONT}" fill="#e2e2ea">${xesc(n.data.name)}</text>`)
      if (isFocus) {
        o.push(`<rect x="${nx+NODE_W-62}" y="${ny+HDR_H/2-7}" width="50" height="14" rx="4" fill="#6366f1"/>`)
        o.push(`<text x="${nx+NODE_W-37}" y="${ny+HDR_H/2+4}" font-size="8" font-weight="700" font-family="${FONT}" fill="#fff" text-anchor="middle">current</text>`)
      }

      for (let i = 0; i < cols.length; i++) {
        const col = cols[i]
        const isPk = pkCols.has(col.name)
        const isFk = !!col.foreignKey
        const cy = ny + HDR_H + i * ROW_H
        if (i > 0) o.push(`<line x1="${nx}" y1="${cy}" x2="${nx+NODE_W}" y2="${cy}" stroke="${c.rule}" stroke-width="0.5"/>`)
        const nc = isPk ? c.pk : isFk ? c.fk : c.muted
        const ts = view.showTypes ? String(col.dataType ?? '').slice(0, 11) : ''
        const tyY = cy + ROW_H / 2 + 4
        o.push(`<text x="${nx+12}" y="${tyY}" font-size="10" font-family="${FONT}" fill="${nc}">${xesc(col.name)}</text>`)
        if (isPk || isFk) {
          const b  = isPk ? 'pk' : 'fk'
          const tc = isPk ? c.pk : c.fk
          o.push(`<rect x="${nx+NODE_W-42}" y="${cy+5}" width="18" height="13" rx="2" fill="${tc}" fill-opacity="0.15"/>`)
          o.push(`<text x="${nx+NODE_W-33}" y="${cy+15}" font-size="7.5" font-weight="700" font-family="${FONT}" fill="${tc}" text-anchor="middle">${b}</text>`)
          if (ts) o.push(`<text x="${nx+NODE_W-50}" y="${tyY}" font-size="9" font-family="${FONT}" fill="${c.faint}" fill-opacity="0.7" text-anchor="end">${xesc(ts)}</text>`)
        } else if (ts) {
          o.push(`<text x="${nx+NODE_W-12}" y="${tyY}" font-size="9" font-family="${FONT}" fill="${c.faint}" fill-opacity="0.7" text-anchor="end">${xesc(ts)}</text>`)
        }
      }

      if (n.data?.hiddenCount) {
        const cy = ny + HDR_H + cols.length * ROW_H
        o.push(`<line x1="${nx}" y1="${cy}" x2="${nx+NODE_W}" y2="${cy}" stroke="${c.rule}" stroke-width="0.5"/>`)
        o.push(`<text x="${nx+12}" y="${cy+ROW_H/2+4}" font-size="9" font-family="${FONT}" fill="${c.faint}">+${n.data.hiddenCount} more</text>`)
      }
    }
    o.push('</svg>')
    return o.join('')
  }

  /**
   * Save an export through the native dialog and report where it landed.
   * @param {Blob | string} payload
   * @param {string} name
   * @param {{ name: string, extensions: string[] }} filter
   * @param {string} label what was exported, for the toast title
   */
  async function saveExport(payload, name, filter, label) {
    const path = await saveExportAs(payload, name, filter)
    if (!path) return  // dialog cancelled
    toast.success(`Exported ${label}`, { description: `Saved to ${path}` })
  }

  async function exportMermaid() {
    const visIds = new Set(nodes.map(n => n.id))
    const lines = ['# ER Diagram', '', '```mermaid', 'erDiagram']
    // relationships
    for (const e of edges) {
      if (!visIds.has(e.source) || !visIds.has(e.target)) continue
      const sm = tableMeta.get(e.source)
      const fkCol = sm?.columns.find(c => `src-${c.name}` === e.sourceHandle)
      lines.push(`    ${e.source} }|--|| ${e.target} : "${fkCol?.name ?? ''}"`)
    }
    // entities
    for (const n of nodes) {
      const t = tableMeta.get(n.id)
      if (!t) continue
      lines.push(`    ${t.name} {`)
      for (const col of t.columns) {
        const typ = (col.dataType || 'text').replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/, '')
        const flags = [t.pkCols.has(col.name) && 'PK', !!col.foreignKey && 'FK'].filter(Boolean)
        lines.push(`        ${typ || 'text'} ${col.name}${flags.length ? ' ' + flags.join(',') : ''}`)
      }
      lines.push('    }')
    }
    lines.push('```')
    try {
      await saveExport(
        lines.join('\n'), `erd-${activeSchema}.md`,
        { name: 'Markdown', extensions: ['md'] }, 'Mermaid markdown',
      )
    } catch (e) {
      toast.error('Export failed', { description: String(e) })
    }
  }

  async function exportSVG() {
    try {
      const svg = generateSvg()
      if (!svg) return
      await saveExport(
        svg, `erd-${activeSchema}.svg`,
        { name: 'SVG image', extensions: ['svg'] }, 'diagram as SVG',
      )
    } catch (e) {
      toast.error('Export failed', { description: String(e) })
    }
  }

  // Public API: the diagram's export actions are driven from the tab bar's
  // Export menu (StudioShell), so the canvas toolbar stays free of chrome.
  export function exportDiagram(/** @type {'png'|'copy-png'|'svg'|'mermaid'} */ kind) {
    if (kind === 'png') return void renderPng('download')
    if (kind === 'copy-png') return void renderPng('clipboard')
    if (kind === 'svg') return exportSVG()
    return exportMermaid()
  }
  /** @param {'download'|'clipboard'} sink */
  async function renderPng(sink) {
    exporting = true
    try {
      const svg = generateSvg()
      if (!svg) return
      const m = svg.match(/width="(\d+)" height="(\d+)"/)
      const W = m ? +m[1] : 1200
      const H = m ? +m[2] : 800
      // 3x keeps 8px badge text legible when the diagram is viewed at 100%.
      // MAX_PX is the safety rail: WebKit refuses to allocate a canvas past
      // roughly 16k on a side, and a wide schema hits that well before 3x.
      const MAX_PX = 12000
      const scale = Math.max(1, Math.min(3, MAX_PX / Math.max(W, H)))
      // The sheet rect inside the SVG already covers this; the canvas fill is
      // the backstop so the PNG is never transparent where a viewer would
      // composite it against its own (possibly white) page.
      const blob = await svgStringToPngBlob(svg, { width: W, height: H, scale, background: exportPalette().sheet })
      if (sink === 'download') {
        await saveExport(
          blob, `erd-${activeSchema}.png`,
          { name: 'PNG image', extensions: ['png'] }, 'diagram as PNG',
        )
        return
      }
      await copyPngToClipboard(blob)
      toast.success('Diagram copied as PNG')
    } catch (e) {
      toast.error(sink === 'clipboard' ? 'Copy failed' : 'Export failed', { description: String(e) })
    } finally {
      exporting = false
    }
  }

  /**
   * Put a PNG on the OS clipboard. The webview's async Clipboard API is denied in
   * WebKitGTW/WKWebView without a trusted gesture, so the native plugin is the
   * primary path and the web API is only the fallback (browser dev).
   * @param {Blob} blob
   */
  async function copyPngToClipboard(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    try {
      const { writeImage } = await import('@tauri-apps/plugin-clipboard-manager')
      await writeImage(bytes)
      return
    } catch (nativeErr) {
      const w = /** @type {any} */ (window)
      if (typeof w.ClipboardItem === 'function' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new w.ClipboardItem({ 'image/png': blob })])
        return
      }
      throw nativeErr
    }
  }
</script>

<svelte:window onkeydown={(e) => {
  if (!searchEl || !searchEl.offsetParent) return
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === 'f') {
    e.preventDefault(); searchEl.focus(); searchEl.select()
  }
}} />

{#snippet segmented(/** @type {{value:string,label:string,hint?:string}[]} */ items, /** @type {string} */ current, /** @type {(v:string)=>void} */ pick)}
  <div class="inline-flex h-7 shrink-0 items-center rounded-lg border border-border/50 bg-muted/25 p-0.5">
    {#each items as it (it.value)}
      <button
        type="button"
        title={it.hint}
        aria-pressed={current === it.value}
        onclick={() => pick(it.value)}
        class={cn(
          'inline-flex h-6 items-center rounded-[6px] px-2 text-ui-xs whitespace-nowrap transition-colors',
          current === it.value
            ? 'bg-background font-medium text-foreground ring-1 ring-inset ring-border/70'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >{it.label}</button>
    {/each}
  </div>
{/snippet}

{#snippet switchRow(/** @type {string} */ label, /** @type {string} */ desc, /** @type {boolean} */ checked, /** @type {() => void} */ ontoggle)}
  <div class="flex items-center justify-between gap-3 px-3 py-2">
    <div class="min-w-0">
      <p class="text-ui-sm text-foreground">{label}</p>
      <p class="mt-0.5 text-ui-2xs leading-snug text-muted-foreground/70">{desc}</p>
    </div>
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label}
      onclick={ontoggle}
      class={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150',
        checked ? 'bg-primary' : 'bg-muted',
      )}
    >
      <span class={cn('pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform duration-150', checked ? 'translate-x-4' : 'translate-x-0.5')}></span>
    </button>
  </div>
{/snippet}

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <!-- ── Toolbar ──────────────────────────────────────────────────────────── -->
  <div class="studio-chrome flex h-9 shrink-0 items-center gap-2 border-b border-border bg-panel px-3" data-studio-chrome>
    <Network class="size-3.5 shrink-0 text-muted-foreground" aria-label="ER diagram" />

    {#if schemas.length > 1}
      <Popover bind:open={schemaOpen}>
        <PopoverTrigger
          class="ml-1 flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-input bg-input/30 px-2.5 text-ui-sm font-medium text-foreground transition-colors hover:bg-accent focus:outline-none data-[state=open]:bg-accent"
        >
          {activeSchema}
          <ChevronDown class="size-3 shrink-0 text-muted-foreground/60" />
        </PopoverTrigger>
        <PopoverContent class="max-h-72 w-44 overflow-y-auto p-1" align="start">
          {#each schemas as s (s)}
            <button
              type="button"
              class="flex w-full rounded-md px-2 py-1.5 text-ui-sm transition-colors hover:bg-accent hover:text-foreground {s === activeSchema ? 'font-medium text-foreground' : 'text-muted-foreground'}"
              onclick={() => { activeSchema = s; schemaOpen = false }}
            >{s}</button>
          {/each}
        </PopoverContent>
      </Popover>
    {/if}

    <div class="relative flex min-w-0 shrink items-center">
      <Search class="pointer-events-none absolute left-2 size-3.5 text-muted-foreground/50" />
      <input
        type="text"
        bind:this={searchEl}
        bind:value={search}
        placeholder="Search tables…"
        class="h-7 w-40 min-w-0 rounded-lg border-2 border-border bg-input/30 pl-7 pr-6 text-ui-sm outline-none placeholder:text-muted-foreground/45 focus:border-ring/55 focus:ring-2 focus:ring-ring/15"
      />
      {#if search}
        <button type="button" onclick={() => (search = '')} class="absolute right-2 text-muted-foreground/50 hover:text-foreground">
          <X class="size-3" />
        </button>
      {/if}
    </div>

    {#if focusTable}
      <!-- Scope: what the diagram covers, relative to the table it was opened for.
           Icons only - the table's name is already in the tab and on its card. -->
      <div class="ml-0.5 flex shrink-0 items-center gap-1">
        <div class="inline-flex h-7 shrink-0 items-center rounded-lg border border-border/50 bg-muted/25 p-0.5">
          {#each SCOPES as s (s.id)}
            <button
              type="button"
              title={s.hint}
              aria-label={s.label}
              aria-pressed={scope === s.id}
              onclick={() => (scope = s.id)}
              class={cn(
                'inline-flex size-6 items-center justify-center rounded-[6px] transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97]',
                scope === s.id
                  ? 'bg-background text-foreground ring-1 ring-inset ring-border/70'
                  : 'text-muted-foreground/70 hover:text-foreground',
              )}
            >
              {#if s.id === 'self'}<Square class="size-3.5" />
              {:else if s.id === 'related'}<Network class="size-3.5" />
              {:else}<LayoutGrid class="size-3.5" />{/if}
            </button>
          {/each}
        </div>
        {#if onclearfocus}
          <button
            type="button"
            class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-[background-color,color,transform] duration-150 ease-out hover:bg-accent hover:text-foreground active:scale-[0.97]"
            title="Clear focus on {focusTable}"
            onclick={onclearfocus}
          ><X class="size-3" /></button>
        {/if}
      </div>
    {/if}

    <div class="ml-auto flex shrink-0 items-center gap-1.5">
      {#if loading && totalCount > 0}
        <div class="flex items-center gap-2 pr-1">
          <div class="h-1 w-24 overflow-hidden rounded-full bg-muted/40">
            <div class="h-full rounded-full bg-primary/60 transition-all duration-200" style="width:{Math.round(loadedCount/totalCount*100)}%"></div>
          </div>
          <span class="font-mono text-ui-2xs text-muted-foreground/50">{loadedCount}/{totalCount}</span>
        </div>
      {:else if tableMeta.size > 0 && !loading}
        <span class="whitespace-nowrap pr-1 font-mono text-ui-2xs tabular-nums text-muted-foreground/55">
          {nodes.length}/{tableMeta.size} tables · {edges.length} fk
        </span>
      {/if}

      <div class="h-4 w-px shrink-0 bg-border/60"></div>

      <!-- Diagram settings -->
      <Popover bind:open={settingsOpen}>
        <PopoverTrigger
          class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-accent hover:text-foreground active:scale-[0.97] focus:outline-none data-[state=open]:bg-accent data-[state=open]:text-foreground"
          title="Diagram settings"
        >
          <SlidersHorizontal class="size-3.5" />
        </PopoverTrigger>
        <PopoverContent class="w-72 py-1" align="end">
          <div class="px-3 pb-1.5 pt-2">
            <p class="text-ui-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground/45">Cards</p>
          </div>
          <div class="flex items-center justify-between gap-3 px-3 pb-2">
            <span class="text-ui-sm text-foreground">Columns</span>
            {@render segmented(
              [{ value: 'all', label: 'All' }, { value: 'keys', label: 'Keys only', hint: 'Show only PK/FK columns' }],
              view.columnMode,
              (v) => updateSettings({ columnMode: /** @type {'all'|'keys'} */ (v) }),
            )}
          </div>
          {@render switchRow('Data types', 'Show each column’s type on the card', view.showTypes, () => updateSettings({ showTypes: !view.showTypes }))}

          <div class="mt-1 border-t border-border/40"></div>
          <div class="px-3 pb-1.5 pt-2">
            <p class="text-ui-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground/45">Layout</p>
          </div>
          <div class="flex items-center justify-between gap-3 px-3 pb-2">
            <span class="text-ui-sm text-foreground">Spacing</span>
            {@render segmented(
              [{ value: 'compact', label: 'S' }, { value: 'comfortable', label: 'M' }, { value: 'spacious', label: 'L' }],
              view.spacing,
              (v) => updateSettings({ spacing: /** @type {'compact'|'comfortable'|'spacious'} */ (v) }),
            )}
          </div>
          <div class="flex items-center justify-between gap-3 px-3 pb-1">
            <span class="text-ui-sm text-foreground">Relationships</span>
            {@render segmented(
              [
                { value: 'smart', label: 'Routed', hint: 'Route lines around tables' },
                { value: 'direct', label: 'Direct', hint: 'Straight elbows - faster on huge diagrams' },
              ],
              view.routing,
              (v) => updateSettings({ routing: /** @type {'smart'|'direct'} */ (v) }),
            )}
          </div>
          {#if view.routing === 'smart' && nodes.length > MAX_ROUTED_NODES}
            <p class="px-3 pb-2 text-ui-2xs leading-snug text-muted-foreground/70">
              Drawing direct lines: routing is capped at {MAX_ROUTED_NODES} tables and this view has {nodes.length}.
            </p>
          {/if}
          {@render switchRow('Only linked tables', 'Hide tables without any foreign key', connectedOnly, () => updateSettings({ connectedOnly: !connectedOnly }))}
          {@render switchRow('Grid dots', 'Dotted background on the canvas', view.grid, () => updateSettings({ grid: !view.grid }))}

          <div class="mt-1 border-t border-border/40 pt-1">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-ui-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onclick={() => { reLayout(); settingsOpen = false }}
            >
              <LayoutDashboard class="size-3.5 shrink-0" />
              Re-run auto layout
            </button>
            {#if !hostExports}
              {#each [
                { kind: /** @type {const} */ ('copy-png'), label: 'Copy as PNG' },
                { kind: /** @type {const} */ ('png'), label: 'Download PNG' },
                { kind: /** @type {const} */ ('svg'), label: 'Download SVG' },
                { kind: /** @type {const} */ ('mermaid'), label: 'Download Mermaid' },
              ] as item (item.kind)}
                <button
                  type="button"
                  disabled={exporting || tableMeta.size === 0}
                  class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-ui-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  onclick={() => { exportDiagram(item.kind); settingsOpen = false }}
                >
                  {#if exporting}<Loader class="size-3.5 shrink-0 animate-spin" />{:else}<Download class="size-3.5 shrink-0" />{/if}
                  {item.label}
                </button>
              {/each}
            {/if}
          </div>
        </PopoverContent>
      </Popover>

      <button
        type="button"
        class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-accent hover:text-foreground active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
        onclick={reLayout}
        title="Re-run automatic layout"
      >
        <LayoutDashboard class="size-3.5" />
      </button>


      <button
        type="button"
        disabled={loading}
        class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-accent hover:text-foreground active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
        onclick={() => void load()}
        title="Reload schema"
      >
        <RefreshCw class="size-3.5 {loading ? 'animate-spin' : ''}" />
      </button>
    </div>
  </div>

  <!-- ── Canvas + docked inspector ─────────────────────────────────────────── -->
  <div class="flex min-h-0 flex-1">
  <div class="relative min-h-0 min-w-0 flex-1">
    {#if loading && tableMeta.size === 0}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background">
        <Loader class="size-6 animate-spin text-muted-foreground/30" />
        <p class="font-mono text-ui-xs text-muted-foreground/50">Loading schema structure…</p>
      </div>

    {:else if loading && totalCount > 0}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background">
        <div class="flex flex-col items-center gap-2">
          <Loader class="size-5 animate-spin text-muted-foreground/40" />
          <p class="font-mono text-ui-xs text-muted-foreground/50">Loading {loadedCount}/{totalCount} tables…</p>
        </div>
        <div class="h-1 w-48 overflow-hidden rounded-full bg-muted/40">
          <div class="h-full rounded-full bg-primary/60 transition-all duration-200" style="width:{Math.round(loadedCount/totalCount*100)}%"></div>
        </div>
      </div>

    {:else if error}
      <div class="absolute inset-0 flex items-center justify-center bg-background">
        <p class="max-w-sm text-center font-mono text-ui-xs text-destructive">{error}</p>
      </div>

    {:else}
      <ErdCanvas
        bind:this={erd}
        {nodes}
        {edges}
        {cfg}
        selectedId={selectedTable}
        {focusId}
        routing={view.routing}
        showTypes={view.showTypes}
        grid={view.grid}
        onselect={(id) => (selectedTable = id)}
        onopen={(name) => openTable(name)}
        onnodemoved={onNodeMoved}
      />

      {#if tableMeta.size === 0 && !loading}
        <div class="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
          <div class="rounded-lg border border-border/50 bg-panel px-4 py-3 font-mono text-ui-xs text-muted-foreground/60">
            No tables found in <span class="text-foreground/70">{activeSchema}</span>
          </div>
        </div>
      {/if}

      <!-- ── Legend ───────────────────────────────────────────────────────── -->
      {#if tableMeta.size > 0}
        <div class="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <div class="flex h-6 items-center gap-2.5 rounded-full border border-border/40 bg-panel/75 px-2.5 text-ui-3xs text-muted-foreground/60 backdrop-blur-sm">
            <span class="flex items-center gap-1"><span class="size-1.5 rounded-full" style="background:{ink.pk}"></span>PK</span>
            <span class="flex items-center gap-1"><span class="size-1.5 rounded-full" style="background:{ink.fk}"></span>FK</span>
            <span class="h-2.5 w-px bg-border/60"></span>
            <!-- Crow's foot: fork on the FK side, bar on the referenced side. -->
            <span class="flex items-center gap-1" title="One-to-many: the fork sits on the foreign key side">
              <svg width="20" height="7" viewBox="0 0 20 7" aria-hidden="true" class="shrink-0 opacity-80">
                <path d="M1 1v5M2 3.5h12M14 3.5l5-2.5M14 3.5l5 2.5M14 3.5h5" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" />
              </svg>
              1:N
            </span>
            <span class="flex items-center gap-1" title="One-to-one: the foreign key column is unique">
              <svg width="16" height="7" viewBox="0 0 16 7" aria-hidden="true" class="shrink-0 opacity-80">
                <path d="M1 1v5M2 3.5h11M14 1v5" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" />
              </svg>
              1:1
            </span>
            {#if focusId}
              <span class="h-2.5 w-px bg-border/60"></span>
              <!-- Matches the rim on the card. Teal, not the theme blue: blue is
                   already the foreign-key colour and the two collided. -->
              <span class="flex items-center gap-1">
                <span class="size-2 rounded-[3px] border" style="border-color:{ink.focus};background:color-mix(in oklab, {ink.focus} 24%, transparent)"></span>
                Current
              </span>
            {/if}
          </div>
        </div>
      {/if}

    {/if}
  </div>

  <!-- ── Inspector: docked, not floating over the diagram ────────────────── -->
  {#if selMeta}
    <aside class="flex w-72 shrink-0 flex-col overflow-hidden border-l border-border bg-panel">
      <div class="flex h-9 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <span class="min-w-0 flex-1 truncate font-mono text-ui-xs font-semibold text-foreground">{selMeta.name}</span>
        <button
          type="button"
          class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-[background-color,color,transform] duration-150 ease-out hover:bg-accent hover:text-foreground active:scale-[0.97]"
          title="Copy CREATE statement"
          onclick={() => void copyDdl(selMeta.name)}
        >
          {#if copiedDdl === selMeta.name}
            <Check class="size-3.5 text-success" />
          {:else}
            <Copy class="size-3.5" />
          {/if}
        </button>
        <button
          type="button"
          class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-[background-color,color,transform] duration-150 ease-out hover:bg-accent hover:text-foreground active:scale-[0.97]"
          title="Close inspector"
          onclick={() => (selectedTable = null)}
        ><X class="size-3.5" /></button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <p class="px-3 pt-2.5 pb-1 text-ui-3xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/45">
          Columns <span class="font-normal tabular-nums text-muted-foreground/35">{selMeta.columns.length}</span>
        </p>
        {#each selMeta.columns as col (col.name)}
          {@const isPk = selMeta.pkCols.has(col.name)}
          {@const isFk = !!col.foreignKey}
          <div class="flex items-center gap-2 px-3 py-1">
            {#if isPk}<KeyRound class="size-3 shrink-0" style="color:{ink.pk}" />
            {:else if isFk}<Link class="size-3 shrink-0" style="color:{ink.fk}" />
            {:else}<span class="size-3 shrink-0"></span>{/if}
            <span class="min-w-0 flex-1 truncate font-mono text-ui-2xs {isPk ? 'font-medium text-foreground' : 'text-foreground/75'}">{col.name}</span>
            <span class="shrink-0 font-mono text-ui-3xs text-muted-foreground/45">{col.dataType}</span>
          </div>
        {/each}

        {#if selFks.length > 0}
          <p class="mt-2 border-t border-border/40 px-3 pt-2.5 pb-1 text-ui-3xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/45">References</p>
          {#each selFks as fk (fk.name)}
            {@const ref = fk.foreignKey?.split('.') ?? []}
            <button
              type="button"
              class="flex w-full items-baseline gap-1.5 px-3 py-1 text-left transition-colors hover:bg-accent/60"
              onclick={() => { selectedTable = ref[1] ?? null }}
            >
              <span class="min-w-0 truncate font-mono text-ui-2xs text-muted-foreground/70">{fk.name}</span>
              <span class="shrink-0 text-ui-3xs text-muted-foreground/30">→</span>
              <span class="min-w-0 truncate font-mono text-ui-2xs text-foreground/80">{ref[1]}.{ref[2]}</span>
            </button>
          {/each}
        {/if}

        {#if refBy.length > 0}
          <p class="mt-2 border-t border-border/40 px-3 pt-2.5 pb-1 text-ui-3xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/45">Referenced by</p>
          {#each refBy as t (t.name)}
            <button
              type="button"
              class="flex w-full items-center gap-1.5 px-3 py-1 text-left transition-colors hover:bg-accent/60"
              onclick={() => { selectedTable = t.name }}
            >
              <span class="shrink-0 text-ui-3xs text-muted-foreground/30">←</span>
              <span class="min-w-0 truncate font-mono text-ui-2xs text-muted-foreground/75">{t.name}</span>
            </button>
          {/each}
        {/if}
      </div>

      <div class="shrink-0 border-t border-border/60 p-2">
        <button
          type="button"
          class="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border/60 bg-input/20 text-ui-xs font-medium text-foreground transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.99]"
          onclick={() => openTable(selMeta.name)}
        >Open table</button>
      </div>
    </aside>
  {/if}
  </div>
</div>
