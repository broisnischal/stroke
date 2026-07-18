<script>
  import { tick, untrack } from 'svelte'
  import dagre from '@dagrejs/dagre'
  import { listTables, getTableColumnStructure, listIndexes } from '$lib/api.js'
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
  import FileImage from '@lucide/svelte/icons/file-image'
  import FileCode from '@lucide/svelte/icons/file-code'
  import FileText from '@lucide/svelte/icons/file-text'

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
  let downloadOpen  = $state(false)
  let exporting     = $state(false)
  let connectedOnly = $state(false)
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
  /** @param {TableMeta} t */
  function nodeH(t) { return HDR_H + t.columns.length * ROW_H + PAD_B }

  // ── Layout ────────────────────────────────────────────────────────────────
  /**
   * Connected nodes → Dagre LR.
   * Orphan nodes (no FK edges) → compact grid below connected graph.
   */
  function layoutNodes(ns, es) {
    const linked = new Set()
    for (const e of es) { linked.add(e.source); linked.add(e.target) }

    const conn    = ns.filter(n => linked.has(n.id))
    const orphans = ns.filter(n => !linked.has(n.id))

    let laidConn = []
    let bottomY  = 0

    if (conn.length) {
      const g = new dagre.graphlib.Graph()
      g.setGraph({ rankdir: 'LR', ranksep: 240, nodesep: 56, marginx: 80, marginy: 80 })
      g.setDefaultEdgeLabel(() => ({}))
      for (const n of conn) {
        g.setNode(n.id, { width: NODE_W, height: n.data ? nodeH(n.data) : HDR_H })
      }
      for (const e of es) g.setEdge(e.source, e.target)
      dagre.layout(g)

      // Dagre already minimises edge crossings — so for a normal schema we trust
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
        ranks.get(key)?.push({ n, y: p.y, h: n.data ? nodeH(n.data) : HDR_H })
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
          const h = n.data ? nodeH(n.data) : HDR_H
          minX = Math.min(minX, p.x - NODE_W / 2)
          minY = Math.min(minY, p.y - h / 2)
        }
        for (const n of conn) {
          const p = g.node(n.id)
          const h = n.data ? nodeH(n.data) : HDR_H
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
        const COL_GAP = 110, ROW_GAP = 72, RANK_GAP = 200, TARGET_H = 2600
        let cursorX = 40
        for (const key of [...ranks.keys()].sort((a, b) => a - b)) {
          const items = (ranks.get(key) ?? []).sort((a, b) => a.y - b.y)
          const maxH = items.reduce((m, it) => Math.max(m, it.h), HDR_H)
          const rows = Math.max(1, Math.floor(TARGET_H / (maxH + ROW_GAP)))
          const cols = Math.ceil(items.length / rows)
          const colY = new Array(cols).fill(40) // per sub-column running Y (packs tight)
          for (let i = 0; i < items.length; i++) {
            const col = Math.floor(i / rows)
            placed.set(items[i].n.id, { x: cursorX + col * (NODE_W + COL_GAP), y: colY[col] })
            colY[col] += items[i].h + ROW_GAP
          }
          cursorX += cols * (NODE_W + COL_GAP) + RANK_GAP
        }
      }

      laidConn = conn.map(n => {
        const h = n.data ? nodeH(n.data) : HDR_H
        const pos = placed.get(n.id) ?? { x: 0, y: 0 }
        bottomY = Math.max(bottomY, pos.y + h)
        return { ...n, position: pos }
      })
    }

    // Orphans in a responsive grid below the connected graph
    const orphanY = laidConn.length ? bottomY + 120 : 0
    const maxH = orphans.reduce((m, n) => Math.max(m, n.data ? nodeH(n.data) : HDR_H), HDR_H)
    const GCOLS = Math.max(3, Math.min(6, Math.ceil(Math.sqrt(orphans.length * 1.8))))
    const laidOrphans = orphans.map((n, i) => ({
      ...n,
      position: {
        x: (i % GCOLS) * (NODE_W + 56),
        y: orphanY + Math.floor(i / GCOLS) * (maxH + 72),
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
        rawEdges.push({
          id:           `${t.name}__${col.name}__${refTable}`,
          source:       t.name,
          target:       refTable,
          sourceHandle: `src-${col.name}`,
          targetHandle: refCol ? `tgt-${refCol}` : 'tgt',
          type:         'relation',
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
    const visible = all.filter(t => !connectedOnly || connected.has(t.name))
    const visibleIds = new Set(visible.map(t => t.name))
    const filteredEdges = rawEdges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target))

    const rawNodes = visible.map(t => ({
      id:       t.name,
      type:     'tableNode',
      position: _posCache.get(t.name) ?? { x: 0, y: 0 },
      data: {
        ...t,
        highlighted: true,
        selected:    t.name === selectedTable,
        onSelect: (/** @type {string} */ name) => { selectedTable = selectedTable === name ? null : name },
        onOpen:   (/** @type {string} */ name) => onopentable?.(activeSchema, name),
      },
    }))

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
    tick().then(() => erd?.fit())
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
      const tableList = /** @type {{ name: string }[]} */ (await listTables(activeSchema))
      totalCount = tableList.length
      if (tableList.length > WARN_MANY) connectedOnly = true

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
          }),
        )
        for (const r of results) {
          if (r.status === 'fulfilled') tableMeta.set(r.value.name, r.value)
        }
        loadedCount = Math.min(i + BATCH, tableList.length)
        tableMeta = new Map(tableMeta)
        await tick()
      }
      buildGraph(true)
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
      if (changed) { tableMeta = new Map(tableMeta); buildGraph() }
    } catch { /* non-critical */ }
  }

  // ── Reactivity ────────────────────────────────────────────────────────────
  $effect(() => { void activeSchema; void load() })

  $effect(() => {
    void connectedOnly
    if (tableMeta.size > 0) scheduleRebuild()
  })

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
      const h = HDR_H + (n.data?.columns?.length ?? 0) * ROW_H + PAD_B
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

    const o = []
    o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`)
    o.push(`<rect width="${W}" height="${H}" fill="#0d0d10"/>`)
    o.push(`<defs><pattern id="dp" width="22" height="22" patternUnits="userSpaceOnUse">`)
    o.push(`<circle cx="1.2" cy="1.2" r="0.8" fill="#1d1d24"/></pattern></defs>`)
    o.push(`<rect width="${W}" height="${H}" fill="url(#dp)"/>`)

    // edges first (behind nodes)
    for (const e of edges) {
      if (!visIds.has(e.source) || !visIds.has(e.target)) continue
      const sn = vis.find(n => n.id === e.source)
      const tn = vis.find(n => n.id === e.target)
      if (!sn || !tn) continue
      const cols = sn.data?.columns ?? []
      const ci = cols.findIndex(c => `src-${c.name}` === e.sourceHandle)
      const sx = sn.position.x + dx + NODE_W
      const sy = sn.position.y + dy + HDR_H + (ci >= 0 ? ci * ROW_H + ROW_H / 2 : HDR_H / 2)
      const tx = tn.position.x + dx
      const ty = tn.position.y + dy + HDR_H / 2
      const mx = (sx + tx) / 2
      o.push(`<path d="M${sx} ${sy} C${mx} ${sy} ${mx} ${ty} ${tx} ${ty}" fill="none" stroke="#252535" stroke-width="1.5" stroke-linecap="round"/>`)
      o.push(`<text x="${sx+10}" y="${sy-5}" font-size="9" font-family="${FONT}" fill="#404060" text-anchor="middle">*</text>`)
      o.push(`<text x="${tx-10}" y="${ty-5}" font-size="9" font-family="${FONT}" fill="#404060" text-anchor="middle">1</text>`)
    }

    // nodes
    for (const n of vis) {
      const cols = n.data?.columns ?? []
      const pkCols = n.data?.pkCols ?? new Set()
      const h = HDR_H + cols.length * ROW_H + PAD_B
      const nx = n.position.x + dx
      const ny = n.position.y + dy
      const isSel = n.data?.selected

      // shadow
      o.push(`<rect x="${nx+3}" y="${ny+4}" width="${NODE_W}" height="${h}" rx="8" fill="rgba(0,0,0,0.45)"/>`)
      // card bg
      o.push(`<rect x="${nx}" y="${ny}" width="${NODE_W}" height="${h}" rx="8" fill="#141418" stroke="${isSel ? '#6366f1' : '#252535'}" stroke-width="${isSel ? 1.5 : 1}"/>`)
      // header
      o.push(`<clipPath id="hc${n.id.replace(/\W/g,'_')}"><rect x="${nx}" y="${ny}" width="${NODE_W}" height="${HDR_H + 8}" rx="8"/></clipPath>`)
      o.push(`<rect x="${nx}" y="${ny}" width="${NODE_W}" height="${HDR_H + 8}" fill="#1d1d26" clip-path="url(#hc${n.id.replace(/\W/g,'_')})"/>`)
      o.push(`<line x1="${nx}" y1="${ny+HDR_H}" x2="${nx+NODE_W}" y2="${ny+HDR_H}" stroke="#252535" stroke-width="1"/>`)
      o.push(`<text x="${nx+12}" y="${ny+HDR_H/2+4}" font-size="11" font-weight="600" font-family="${FONT}" fill="#e2e2ea">${xesc(n.data.name)}</text>`)

      for (let i = 0; i < cols.length; i++) {
        const col = cols[i]
        const isPk = pkCols.has(col.name)
        const isFk = !!col.foreignKey
        const cy = ny + HDR_H + i * ROW_H
        if (i > 0) o.push(`<line x1="${nx}" y1="${cy}" x2="${nx+NODE_W}" y2="${cy}" stroke="#1a1a22" stroke-width="0.5"/>`)
        const nc = isPk ? '#fbbf24' : isFk ? '#60a5fa' : '#6b6b80'
        const ts = String(col.dataType ?? '').slice(0, 11)
        const tyY = cy + ROW_H / 2 + 4
        o.push(`<text x="${nx+12}" y="${tyY}" font-size="10" font-family="${FONT}" fill="${nc}">${xesc(col.name)}</text>`)
        if (isPk || isFk) {
          const b  = isPk ? 'pk' : 'fk'
          const bc = isPk ? 'rgba(251,191,36,0.14)' : 'rgba(96,165,250,0.11)'
          const tc = isPk ? '#b45309' : '#2563eb'
          o.push(`<rect x="${nx+NODE_W-42}" y="${cy+5}" width="18" height="13" rx="2" fill="${bc}"/>`)
          o.push(`<text x="${nx+NODE_W-33}" y="${cy+15}" font-size="7.5" font-weight="700" font-family="${FONT}" fill="${tc}" text-anchor="middle">${b}</text>`)
          o.push(`<text x="${nx+NODE_W-50}" y="${tyY}" font-size="9" font-family="${FONT}" fill="#333345" text-anchor="end">${xesc(ts)}</text>`)
        } else {
          o.push(`<text x="${nx+NODE_W-12}" y="${tyY}" font-size="9" font-family="${FONT}" fill="#333345" text-anchor="end">${xesc(ts)}</text>`)
        }
      }
    }
    o.push('</svg>')
    return o.join('')
  }

  function dlFile(content, name, mime) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([content], { type: mime }))
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1500)
    downloadOpen = false
  }

  function exportMarkdown() {
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
    dlFile(lines.join('\n'), `erd-${activeSchema}.md`, 'text/markdown')
  }

  function exportSVG() {
    const svg = generateSvg()
    if (svg) dlFile(svg, `erd-${activeSchema}.svg`, 'image/svg+xml')
  }

  async function exportPNG() {
    exporting = true
    downloadOpen = false
    try {
      const svg = generateSvg()
      if (!svg) return
      const m = svg.match(/width="(\d+)" height="(\d+)"/)
      const W = m ? +m[1] : 1200
      const H = m ? +m[2] : 800
      const scale = Math.min(2, 6000 / Math.max(W, H))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(W * scale)
      canvas.height = Math.round(H * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const img = new Image()
      const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = blobUrl })
      URL.revokeObjectURL(blobUrl)
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0, W, H)
      canvas.toBlob(blob => {
        if (!blob) return
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `erd-${activeSchema}.png`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1500)
      }, 'image/png')
    } finally {
      exporting = false
    }
  }
</script>

<svelte:window onkeydown={(e) => {
  if (!searchEl || !searchEl.offsetParent) return
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === 'f') {
    e.preventDefault(); searchEl.focus(); searchEl.select()
  }
  if (e.key === 'Escape') { downloadOpen = false; schemaOpen = false }
}} />

<!-- click-outside to close dropdowns -->
<svelte:document onclick={(e) => {
  if (!(/** @type {Element} */ (e.target)).closest?.('[data-dropdown]')) {
    downloadOpen = false; schemaOpen = false
  }
}} />

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <!-- ── Toolbar ──────────────────────────────────────────────────────────── -->
  <div class="studio-chrome flex h-10 shrink-0 items-center gap-2 border-b border-border bg-panel px-3" data-studio-chrome>
    <Network class="size-4 shrink-0 text-muted-foreground/50" />
    <span class="shrink-0 whitespace-nowrap font-mono text-ui-xs font-semibold text-foreground/80">ER Diagram</span>

    {#if schemas.length > 1}
      <div class="relative ml-1 shrink-0" data-dropdown>
        <button
          type="button"
          class="flex h-7 items-center gap-1.5 rounded-md border border-border/50 bg-background/60 px-2.5 font-mono text-ui-xs font-medium transition-colors hover:bg-accent"
          onclick={() => (schemaOpen = !schemaOpen)}
        >
          {activeSchema}
          <ChevronDown class="size-3 text-muted-foreground/60" />
        </button>
        {#if schemaOpen}
          <div class="absolute left-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
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

    <div class="relative flex min-w-0 shrink items-center">
      <Search class="pointer-events-none absolute left-2.5 size-3 text-muted-foreground/40" />
      <input
        type="text"
        bind:this={searchEl}
        bind:value={search}
        placeholder="Search tables…"
        class="h-7 w-36 min-w-0 rounded-md border border-border/50 bg-background/60 pl-7 pr-6 font-mono text-ui-xs outline-none placeholder:text-muted-foreground/35 focus:border-ring focus:ring-1 focus:ring-ring"
      />
      {#if search}
        <button type="button" onclick={() => (search = '')} class="absolute right-2 text-muted-foreground/50 hover:text-foreground">
          <X class="size-3" />
        </button>
      {/if}
    </div>

    <div class="ml-auto flex shrink-0 items-center gap-2">
      {#if loading && totalCount > 0}
        <div class="flex items-center gap-2">
          <div class="h-1 w-24 overflow-hidden rounded-full bg-muted/40">
            <div class="h-full rounded-full bg-primary/60 transition-all duration-200" style="width:{Math.round(loadedCount/totalCount*100)}%"></div>
          </div>
          <span class="font-mono text-ui-2xs text-muted-foreground/50">{loadedCount}/{totalCount}</span>
        </div>
      {:else if tableMeta.size > 0 && !loading}
        <span class="whitespace-nowrap font-mono text-ui-2xs text-muted-foreground/45">
          {nodes.length}/{tableMeta.size} tables · {edges.length} fk
        </span>
      {/if}

      {#if tableMeta.size > 0}
        <button
          type="button"
          class="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 font-mono text-ui-xs whitespace-nowrap transition-colors
            {connectedOnly ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15' : 'border-border/50 text-muted-foreground hover:bg-accent hover:text-foreground'}"
          onclick={() => (connectedOnly = !connectedOnly)}
          title="Only show tables with FK relationships"
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

      <!-- Download dropdown -->
      {#if tableMeta.size > 0}
        <div class="relative shrink-0" data-dropdown>
          <button
            type="button"
            disabled={exporting}
            class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/50 bg-background/60 px-2.5 font-mono text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            onclick={() => (downloadOpen = !downloadOpen)}
            title="Download diagram"
          >
            {#if exporting}
              <Loader class="size-3.5 animate-spin" />
            {:else}
              <Download class="size-3.5" />
            {/if}
            Export
            <ChevronDown class="size-3 text-muted-foreground/60" />
          </button>
          {#if downloadOpen}
            <div class="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
              <button
                type="button"
                class="flex w-full items-center gap-2.5 px-3 py-2 font-mono text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onclick={exportPNG}
              >
                <FileImage class="size-3.5 shrink-0 text-sky-400/70" />
                PNG image
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-2.5 px-3 py-2 font-mono text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onclick={exportSVG}
              >
                <FileCode class="size-3.5 shrink-0 text-orange-400/70" />
                SVG vector
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-2.5 px-3 py-2 font-mono text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onclick={exportMarkdown}
              >
                <FileText class="size-3.5 shrink-0 text-green-400/70" />
                Markdown (Mermaid)
              </button>
            </div>
          {/if}
        </div>
      {/if}

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
        onselect={(id) => (selectedTable = id)}
        onopen={(name) => onopentable?.(activeSchema, name)}
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
        <div class="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <div class="flex items-center gap-4 rounded-full border border-border/50 bg-panel/90 px-4 py-1.5 font-mono text-ui-2xs text-muted-foreground/70 shadow-lg backdrop-blur">
            <span class="flex items-center gap-1.5"><span class="inline-block size-2 rounded-sm" style="background:hsl(38 92% 55%)"></span>Primary key</span>
            <span class="flex items-center gap-1.5"><span class="inline-block size-2 rounded-sm" style="background:hsl(217 91% 65%)"></span>Foreign key</span>
            <span class="flex items-center gap-1.5"><span class="inline-block h-px w-4" style="background:hsl(var(--border))"></span>Relationship</span>
          </div>
        </div>
      {/if}

      <!-- ── Detail panel ───────────────────────────────────────────────── -->
      {#if selMeta}
        <div class="absolute right-4 top-4 z-50 w-64 overflow-hidden rounded-xl border border-border/60 bg-card shadow-xl">
          <div class="flex items-center gap-2 border-b border-border/40 bg-muted/20 px-3 py-2.5">
            <Network class="size-3.5 shrink-0 text-primary/60" />
            <span class="min-w-0 flex-1 truncate font-mono text-ui-xs font-bold text-foreground">{selMeta.name}</span>
            <button
              type="button"
              class="flex size-5 items-center justify-center rounded text-muted-foreground/50 hover:bg-accent hover:text-foreground"
              onclick={() => (selectedTable = null)}
            ><X class="size-3" /></button>
          </div>

          <div class="max-h-56 overflow-y-auto">
            {#each selMeta.columns as col (col.name)}
              {@const isPk = selMeta.pkCols.has(col.name)}
              {@const isFk = !!col.foreignKey}
              <div class="flex items-center gap-2 border-b border-border/10 px-3 py-1 last:border-0">
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
