<script>
  import { tick } from 'svelte'
  import { toast } from 'svelte-sonner'
  import { executeSql } from '$lib/api.js'
  import Loader from '@lucide/svelte/icons/loader'
  import KeyRound from '@lucide/svelte/icons/key-round'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import Plus from '@lucide/svelte/icons/plus'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import Check from '@lucide/svelte/icons/check'
  import Undo2 from '@lucide/svelte/icons/undo-2'
  import ForeignKeyDialog from './ForeignKeyDialog.svelte'
  import DdlConfirmDialog from './DdlConfirmDialog.svelte'
  import CreateTriggerDialog from './CreateTriggerDialog.svelte'
  import GitBranch from '@lucide/svelte/icons/git-branch'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js'

  /**
   * @typedef {{ ordinalPosition: number, name: string, dataType: string, isNullable: boolean, columnDefault: string | null, foreignKey: string | null, fkConstraintName: string | null, comment: string | null }} ColumnStructureRow
   * @typedef {{ name: string, tableName: string, columns: string, indexType: string, isUnique: boolean, isPrimary: boolean, condition: string | null, comment: string | null }} IdxInfo
   */

  let {
    schema = '',
    table = '',
    primaryKey = /** @type {string[]} */ ([]),
    /** @type {ColumnStructureRow[]} */
    columns = [],
    /** @type {IdxInfo[]} */
    indexes = [],
    /** @type {{ name: string, tableName: string, timing: string, events: string, functionName: string, enabled: boolean }[]} */
    triggers = [],
    tables = /** @type {{ name: string }[]} */ ([]),
    enums = /** @type {{ name: string }[]} */ ([]),
    columnSearch = '',
    loading = false,
    onrefresh = () => {},
  } = $props()

  const pkSet = $derived(new Set(primaryKey))

  // ── Column resizing ───────────────────────────────────────────────────────
  const DEFAULT_COL_WIDTHS = [36, 220, 180, 90, 260, 200, 200]
  let colWidths = $state([...DEFAULT_COL_WIDTHS])

  /** @param {number} idx @param {PointerEvent} e */
  function startColResize(idx, e) {
    if (e.button !== 0) return
    e.preventDefault()
    const el = /** @type {HTMLElement} */ (e.currentTarget)
    el.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startW = colWidths[idx]
    /** @param {PointerEvent} ev */
    function onMove(ev) {
      // Right-only: only allow increasing the column width
      const delta = Math.max(0, ev.clientX - startX)
      colWidths = colWidths.map((w, i) => i === idx ? Math.max(40, startW + delta) : w)
    }
    /** @param {PointerEvent} ev */
    function onUp(ev) { el.releasePointerCapture(ev.pointerId); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp) }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }

  // ── Pending DDL state (staged changes, applied on explicit Apply) ─────────
  /** @type {Map<string, {sql: string|string[], title: string, description: string, variant?: 'default'|'destructive'}>} */
  let pendingDdl = $state(new Map())
  /** @type {Record<string, any>} */
  let stagedValues = $state({})
  const hasPending = $derived(pendingDdl.size > 0)
  const pendingCount = $derived(pendingDdl.size)

  // Clear staged state when the user navigates to a different table
  $effect(() => {
    schema; table
    pendingDdl = new Map()
    stagedValues = {}
    typeDraft = {}
    defaultDraft = {}
    renamingCol = null
  })

  /** Returns true if the column has any staged (pending) change */
  function isStagedCol(/** @type {string} */ name) {
    return Object.keys(stagedValues).some(k => k.endsWith(':' + name))
  }

  // ── Confirm dialog (used for Apply all and for index/destructive ops) ─────
  let confirmOpen = $state(false)
  let confirmLoading = $state(false)
  let confirmProps = $state({
    title: '',
    description: '',
    sql: /** @type {string|string[]} */ (''),
    confirmLabel: 'Apply',
    variant: /** @type {'default'|'destructive'} */ ('default'),
  })
  let confirmAction = $state(/** @type {(() => Promise<void>) | null} */ (null))

  /**
   * @param {{ title: string, description: string, sql: string|string[], confirmLabel?: string, variant?: 'default'|'destructive' }} opts
   * @param {() => Promise<void>} action
   */
  function askConfirm(opts, action) {
    confirmProps = { title: opts.title, description: opts.description, sql: opts.sql, confirmLabel: opts.confirmLabel ?? 'Apply', variant: opts.variant ?? 'default' }
    confirmAction = action
    confirmOpen = true
  }

  async function handleConfirm() {
    if (!confirmAction) return
    confirmLoading = true
    try { await confirmAction() }
    finally { confirmLoading = false; confirmOpen = false; confirmAction = null }
  }

  // ── Trigger create dialog ─────────────────────────────────────────────────
  let createTriggerOpen = $state(false)

  // ── DDL helpers ───────────────────────────────────────────────────────────
  const tbl = () => `"${schema}"."${table}"`

  async function runDdlDirect(/** @type {string|string[]} */ sql) {
    const stmts = Array.isArray(sql) ? sql : [sql]
    for (const s of stmts) await executeSql(s)
    toast.success('Updated')
    onrefresh()
  }

  // ── Staged column field mutations ─────────────────────────────────────────
  // Instead of immediately showing a confirm dialog, these stage the change.
  // The user clicks "Apply N" in the action bar to run them all at once.

  function stageType(/** @type {string} */ colName, /** @type {string} */ t) {
    const type = t.trim(); if (!type) return
    const origType = columns.find(c => c.name === colName)?.dataType ?? ''
    const sql = `ALTER TABLE ${tbl()} ALTER COLUMN "${colName}" TYPE ${type} USING "${colName}"::${type}`
    const next = new Map(pendingDdl)
    if (type === origType) {
      next.delete('type:' + colName)
      const { [`type:${colName}`]: _v, ...rest } = stagedValues
      stagedValues = rest
    } else {
      next.set('type:' + colName, { sql, title: 'Change type', description: `"${colName}" → ${type}`, variant: 'destructive' })
      stagedValues = { ...stagedValues, [`type:${colName}`]: type }
    }
    pendingDdl = next
  }

  function stageNullable(/** @type {string} */ colName, /** @type {boolean} */ nullable) {
    const origNullable = columns.find(c => c.name === colName)?.isNullable ?? true
    const sql = `ALTER TABLE ${tbl()} ALTER COLUMN "${colName}" ${nullable ? 'DROP NOT NULL' : 'SET NOT NULL'}`
    const next = new Map(pendingDdl)
    if (nullable === origNullable) {
      next.delete('nullable:' + colName)
      const { [`nullable:${colName}`]: _v, ...rest } = stagedValues
      stagedValues = rest
    } else {
      next.set('nullable:' + colName, { sql, title: nullable ? 'Allow NULL' : 'Add NOT NULL', description: `"${colName}" nullable → ${nullable}`, variant: nullable ? 'default' : 'destructive' })
      stagedValues = { ...stagedValues, [`nullable:${colName}`]: nullable }
    }
    pendingDdl = next
  }

  function stageDefault(/** @type {string} */ colName, /** @type {string|null} */ defValue) {
    const orig = columns.find(c => c.name === colName)?.columnDefault ?? null
    const normDef = defValue && String(defValue).trim() ? String(defValue).trim() : null
    const sql = normDef
      ? `ALTER TABLE ${tbl()} ALTER COLUMN "${colName}" SET DEFAULT ${normDef}`
      : `ALTER TABLE ${tbl()} ALTER COLUMN "${colName}" DROP DEFAULT`
    const next = new Map(pendingDdl)
    if (normDef === orig) {
      next.delete('default:' + colName)
      const { [`default:${colName}`]: _v, ...rest } = stagedValues
      stagedValues = rest
    } else {
      next.set('default:' + colName, { sql, title: normDef ? 'Set default' : 'Drop default', description: `Update default for "${colName}"`, variant: 'default' })
      stagedValues = { ...stagedValues, [`default:${colName}`]: normDef ?? '' }
    }
    pendingDdl = next
  }

  function alterComment(/** @type {string} */ col, /** @type {string} */ comment) {
    const esc = comment.replace(/'/g, "''")
    const sql = comment.trim() === ''
      ? `COMMENT ON COLUMN ${tbl()}."${col}" IS NULL`
      : `COMMENT ON COLUMN ${tbl()}."${col}" IS '${esc}'`
    executeSql(sql).then(() => { toast.success('Comment updated'); onrefresh() })
      .catch(e => toast.error('Failed', { description: String(e) }))
  }

  // ── Apply / Reset ─────────────────────────────────────────────────────────
  function applyPendingDdl() {
    if (!hasPending) return
    const entries = [...pendingDdl.values()]
    const allSql = entries.flatMap(p => Array.isArray(p.sql) ? p.sql : [p.sql])
    const hasDestructive = entries.some(p => p.variant === 'destructive')
    askConfirm({
      title: `Apply ${pendingCount} pending ${pendingCount === 1 ? 'change' : 'changes'}`,
      description: hasDestructive
        ? 'Some changes are destructive and may affect existing data. Review the SQL below.'
        : 'Apply all staged column changes to this table.',
      sql: allSql,
      confirmLabel: 'Apply all',
      variant: hasDestructive ? 'destructive' : 'default',
    }, async () => {
      await runDdlDirect(allSql)
      pendingDdl = new Map()
      stagedValues = {}
      typeDraft = {}
      defaultDraft = {}
    })
  }

  function resetPendingDdl() {
    pendingDdl = new Map()
    stagedValues = {}
    typeDraft = {}
    defaultDraft = {}
  }

  // ── Column rename ─────────────────────────────────────────────────────────
  let renamingCol = $state(/** @type {string|null} */ (null))
  let renameDraft = $state('')

  async function startRename(/** @type {ColumnStructureRow} */ col) {
    renamingCol = col.name; renameDraft = stagedValues['name:' + col.name] ?? col.name
    await tick()
    const el = document.querySelector('[data-rename-input]')
    if (el instanceof HTMLInputElement) { el.focus(); el.select() }
  }
  function commitRename() {
    const n = renameDraft.trim()
    const origName = renamingCol
    renamingCol = null
    if (!n || !origName || n === origName) return
    const sql = `ALTER TABLE ${tbl()} RENAME COLUMN "${origName}" TO "${n}"`
    const next = new Map(pendingDdl)
    next.set('name:' + origName, { sql, title: 'Rename column', description: `"${origName}" → "${n}"`, variant: 'default' })
    stagedValues = { ...stagedValues, [`name:${origName}`]: n }
    pendingDdl = next
  }
  function cancelRename() { renamingCol = null; renameDraft = '' }

  // ── Type dropdown ─────────────────────────────────────────────────────────
  const PG_TYPES = [
    'int2','int4','int8','smallint','integer','bigint',
    'serial','smallserial','bigserial',
    'float4','float8','real','numeric','decimal','money',
    'text','varchar','char','bpchar','citext','name',
    'bool','boolean',
    'date','time','timetz','timestamp','timestamptz','interval',
    'uuid',
    'json','jsonb',
    'bytea',
    'inet','cidr','macaddr','macaddr8',
    'point','line','lseg','box','path','polygon','circle',
    'tsvector','tsquery',
    'int4range','int8range','numrange','tsrange','tstzrange','daterange',
    'bit','varbit',
    'xml','oid','pg_lsn','txid_snapshot',
    'vector','hstore','ltree','cube','earth',
  ]
  const allTypes = $derived([...PG_TYPES, ...enums.map(e => e.name).filter(n => !PG_TYPES.includes(n))].sort())

  /** @type {Record<string, boolean>} */
  let typeDropOpen = $state({})
  /** @type {Record<string, string>} */
  let typeDraft = $state({})

  function filteredTypesFor(/** @type {string} */ col) {
    const q = (typeDraft[col] ?? '').toLowerCase()
    if (!q) return allTypes
    return allTypes.filter(t => t.includes(q))
  }

  // ── Default helpers ───────────────────────────────────────────────────────
  const isTimestamp = (/** @type {string} */ dt) => /^(timestamp|timestamptz|date|time|timetz)/i.test(dt)
  /** @type {Record<string, boolean>} */
  let defDropOpen = $state({})
  /** @type {Record<string, string>} */
  let defaultDraft = $state({})

  // ── FK dialog ─────────────────────────────────────────────────────────────
  let fkOpen = $state(false), fkCol = $state(''), fkConstraint = $state(/** @type {string|null} */ (null)), fkExisting = $state(/** @type {string|null} */ (null))
  function openFkDialog(/** @type {ColumnStructureRow} */ col) {
    fkCol = col.name; fkConstraint = col.fkConstraintName ?? null; fkExisting = col.foreignKey ?? null; fkOpen = true
  }

  // ── Index ──────────────────────────────────────────────────────────────────
  const INDEX_ALGORITHMS = ['BTREE', 'HASH', 'GIST', 'SPGIST', 'GIN', 'BRIN']

  /** @type {{ name: string, algorithm: string, isUnique: boolean, columns: string, condition: string, comment: string } | null} */
  let newIndex = $state(null)

  function startNewIndex() { newIndex = { name: '', algorithm: 'BTREE', isUnique: false, columns: '', condition: '', comment: '' } }

  function requestIndexRecreate(/** @type {IdxInfo} */ idx, /** @type {string} */ newAlg, /** @type {boolean} */ newUnique, /** @type {string} */ newCols) {
    const dropSql = `DROP INDEX "${schema}"."${idx.name}"`
    const uniq = newUnique ? 'UNIQUE ' : ''
    const cond = idx.condition ? ` WHERE ${idx.condition}` : ''
    const createSql = `CREATE ${uniq}INDEX "${idx.name}" ON ${tbl()} USING ${newAlg} (${newCols.trim()})${cond}`
    askConfirm({
      title: 'Recreate index',
      description: `Drop and recreate "${idx.name}" with updated settings.`,
      sql: [dropSql, createSql],
      confirmLabel: 'Recreate',
      variant: 'destructive',
    }, () => runDdlDirect([dropSql, createSql]))
  }

  function requestDropIndex(/** @type {string} */ name) {
    const sql = `DROP INDEX "${schema}"."${name}"`
    askConfirm({
      title: 'Drop index',
      description: `Permanently drop index "${name}". Queries relying on it will become slower.`,
      sql,
      confirmLabel: 'Drop index',
      variant: 'destructive',
    }, () => runDdlDirect(sql))
  }

  function saveNewIndex() {
    if (!newIndex?.columns.trim()) { toast.error('Column(s) required'); return }
    const uniq = newIndex.isUnique ? 'UNIQUE ' : ''
    const name = newIndex.name.trim() || `${table}_${newIndex.columns.replace(/[^a-z0-9]/gi, '_')}_idx`
    const cond = newIndex.condition.trim() ? ` WHERE ${newIndex.condition.trim()}` : ''
    const alg = newIndex.algorithm.trim() || 'BTREE'
    const createSql = `CREATE ${uniq}INDEX "${name}" ON ${tbl()} USING ${alg} (${newIndex.columns.trim()})${cond}`
    const comment = newIndex.comment.trim()
    const sqls = comment
      ? [createSql, `COMMENT ON INDEX "${name}" IS '${comment.replace(/'/g, "''")}'`]
      : [createSql]
    askConfirm({
      title: 'Create index',
      description: `Create a new ${uniq ? 'unique ' : ''}${alg} index on "${table}".`,
      sql: sqls,
      confirmLabel: 'Create index',
      variant: 'default',
    }, async () => { await runDdlDirect(sqls); newIndex = null })
  }

  function updateIndexComment(/** @type {string} */ name, /** @type {string} */ c) {
    const sql = c.trim() === '' ? `COMMENT ON INDEX "${name}" IS NULL` : `COMMENT ON INDEX "${name}" IS '${c.replace(/'/g, "''")}'`
    executeSql(sql).then(() => { toast.success('Comment updated'); onrefresh() })
      .catch(e => toast.error('Failed', { description: String(e) }))
  }

  // ── Filtered data ─────────────────────────────────────────────────────────
  const visibleColumns = $derived(
    columnSearch.trim() ? columns.filter(c => c.name.toLowerCase().includes(columnSearch.toLowerCase())) : columns
  )
  const tableIndexes = $derived(indexes.filter(i => i.tableName === table && !i.isPrimary))
  // Index search uses the same columnSearch field — matches index name or column list
  const visibleIndexes = $derived(
    columnSearch.trim()
      ? tableIndexes.filter(i =>
          i.name.toLowerCase().includes(columnSearch.toLowerCase()) ||
          i.columns.toLowerCase().includes(columnSearch.toLowerCase()))
      : tableIndexes
  )
  const tableTriggers = $derived(triggers.filter(t => t.tableName === table))
  const visibleTriggers = $derived(
    columnSearch.trim()
      ? tableTriggers.filter(t =>
          t.name.toLowerCase().includes(columnSearch.toLowerCase()) ||
          t.functionName.toLowerCase().includes(columnSearch.toLowerCase()))
      : tableTriggers
  )

  // ── Add column ────────────────────────────────────────────────────────────
  /** @type {{ name: string, dataType: string, isNullable: boolean, columnDefault: string, comment: string } | null} */
  let newColumn = $state(null)
  /** @type {Record<string, boolean>} */
  let newColTypeDropOpen = $state({})
  /** @type {Record<string, string>} */
  let newColTypeDraft = $state({})

  function startNewColumn() {
    newColumn = { name: '', dataType: 'text', isNullable: true, columnDefault: '', comment: '' }
    newColTypeDraft = { new: 'text' }
  }

  function saveNewColumn() {
    if (!newColumn?.name.trim()) { toast.error('Column name is required'); return }
    if (!newColumn.dataType.trim()) { toast.error('Data type is required'); return }
    const colName = newColumn.name.trim().replace(/"/g, '""')
    const dataType = newColumn.dataType.trim()
    const notNull = !newColumn.isNullable ? ' NOT NULL' : ''
    const def = newColumn.columnDefault.trim() ? ` DEFAULT ${newColumn.columnDefault.trim()}` : ''
    const addSql = `ALTER TABLE ${tbl()} ADD COLUMN "${colName}" ${dataType}${def}${notNull}`
    const sqls = newColumn.comment.trim()
      ? [addSql, `COMMENT ON COLUMN ${tbl()}."${colName}" IS '${newColumn.comment.replace(/'/g, "''")}'`]
      : [addSql]
    const snap = { ...newColumn }
    askConfirm({
      title: 'Add column',
      description: `Add column "${snap.name}" (${dataType}) to "${table}".`,
      sql: sqls,
      confirmLabel: 'Add column',
      variant: 'default',
    }, async () => { await runDdlDirect(sqls); newColumn = null })
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function onFieldKey(/** @type {KeyboardEvent} */ e, /** @type {() => void} */ save) {
    if (e.key === 'Enter') { e.preventDefault(); save(); /** @type {HTMLElement} */ (e.currentTarget).blur() }
    if (e.key === 'Escape') /** @type {HTMLElement} */ (e.currentTarget).blur()
  }

  // Svelte action: focus the element on mount without the a11y_autofocus warning
  /** @param {HTMLElement} el */
  function focusOnMount(el) { el.focus() }

  // shared classes
  const TH = 'relative select-none overflow-hidden border-b border-r border-border bg-panel px-3 py-2 text-left font-medium text-muted-foreground text-ui-2xs uppercase tracking-wide whitespace-nowrap'
  const TD = 'border-b border-r border-border/40 p-0 align-middle overflow-hidden'
  const TD_DROP = 'border-b border-r border-border/40 p-0 align-middle overflow-visible'
  const INP = 'box-border block h-full w-full min-w-0 overflow-x-auto border-0 bg-transparent px-3 py-0 font-mono text-ui-sm text-foreground outline-none selection:bg-primary/20'
  const DROP_PANEL = 'absolute left-0 top-full z-50 mt-0.5 max-h-64 w-48 overflow-y-auto rounded-md border border-border/60 bg-popover p-1 text-popover-foreground shadow-md'
  const DROP_ITEM = 'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 font-mono text-ui-xs text-foreground outline-none hover:bg-accent hover:text-accent-foreground'
  const SECTION_HDR = 'flex items-center gap-2 border-t border-border bg-panel/60 px-3 py-1.5'
  const SECTION_LABEL = 'text-ui-2xs font-semibold uppercase tracking-widest text-muted-foreground/70'
</script>

<ForeignKeyDialog bind:open={fkOpen} {schema} {table} column={fkCol} constraintName={fkConstraint} existingFk={fkExisting} {tables} onrefresh={() => { fkOpen = false; onrefresh() }} />

<DdlConfirmDialog
  bind:open={confirmOpen}
  title={confirmProps.title}
  description={confirmProps.description}
  sql={confirmProps.sql}
  confirmLabel={confirmProps.confirmLabel}
  variant={confirmProps.variant}
  loading={confirmLoading}
  onconfirm={handleConfirm}
/>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <!-- Title strip -->
  <div class="studio-chrome flex shrink-0 items-center gap-3 border-b border-border px-4 py-2 font-mono text-ui-xs" data-studio-chrome>
    <span class="font-medium text-foreground">{table}</span>
    {#if primaryKey.length > 0}
      <span class="flex items-center gap-1 text-amber-500/80"><KeyRound class="size-3" />{primaryKey.join(', ')}</span>
    {/if}
    {#if loading}<Loader class="ml-auto size-3.5 animate-spin text-muted-foreground" />{/if}
  </div>

  <!-- Single scroll container — content takes natural height, no forced stretch -->
  <div class="min-h-0 flex-1" style="overflow: auto">
    <div style="display: inline-block; min-width: 100%; vertical-align: top">
      <table class="border-collapse" style="table-layout: fixed; width: max-content; min-width: 100%">
        <colgroup>
          {#each colWidths as w}<col style="width:{w}px;min-width:{w}px;max-width:{w}px" />{/each}
        </colgroup>
        <thead class="sticky top-0 z-20">
          <tr>
            {#each ['#','column_name','data_type','is_nullable','column_default','foreign_key','comment'] as label, i}
              <th class={TH} style="height:36px">
                <span class="block truncate pr-3">{label}</span>
                <!-- Resize handle: right-edge only, drag right to expand -->
                <div class="group/rz absolute right-0 top-0 z-10 flex h-full w-2 cursor-e-resize touch-none select-none items-stretch justify-end" onpointerdown={(e) => startColResize(i, e)} role="separator" aria-label="Resize">
                  <div class="w-px bg-border/50 transition-colors group-hover/rz:bg-primary/70 group-active/rz:bg-primary"></div>
                </div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each visibleColumns as col (col.name)}
            {@const isPk = pkSet.has(col.name)}
            {@const isRenaming = renamingCol === col.name}
            {@const staged = isStagedCol(col.name)}
            {@const displayName = stagedValues['name:' + col.name] ?? col.name}
            {@const displayType = stagedValues['type:' + col.name] ?? col.dataType}
            {@const displayNullable = stagedValues['nullable:' + col.name] !== undefined ? stagedValues['nullable:' + col.name] : col.isNullable}
            {@const displayDefault = stagedValues['default:' + col.name] !== undefined ? stagedValues['default:' + col.name] : (col.columnDefault ?? '')}
            <tr class="group/row {staged ? 'bg-amber-500/[0.04]' : ''}" style="height:32px">

              <!-- # -->
              <td class="{TD} {staged ? 'border-l-2 border-l-amber-500/50' : ''}">
                <div class="{INP} flex items-center justify-end text-muted-foreground/40">{col.ordinalPosition}</div>
              </td>

              <!-- column_name — dblclick to rename -->
              <td class="{TD} cursor-default {isRenaming ? 'ring-2 ring-inset ring-primary' : ''}" ondblclick={() => !isPk && startRename(col)} title={isPk ? 'Primary key — cannot be renamed' : 'Double-click to rename'}>
                {#if isRenaming}
                  <input data-rename-input type="text" bind:value={renameDraft} class={INP}
                    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); /** @type {HTMLElement} */ (e.currentTarget).blur() } if (e.key === 'Escape') { cancelRename(); /** @type {HTMLElement} */ (e.currentTarget).blur() } }}
                    onblur={commitRename}
                  />
                {:else}
                  <div class="{INP} flex items-center gap-1.5 {isPk ? 'text-amber-400' : 'text-foreground'}">
                    {#if isPk}<KeyRound class="size-3 shrink-0 text-amber-400/60" />{/if}
                    <span class="truncate {stagedValues['name:' + col.name] ? 'text-amber-300/90' : ''}">{displayName}</span>
                  </div>
                {/if}
              </td>

              <!-- data_type: plain drop panel — avoids DropdownMenu.Root/Trigger hybrid
                   that causes TypeError in Svelte 5 when the object literal is followed
                   by a cast `(expr)` on the next line (ASI footgun). -->
              <td class="{TD_DROP} {typeDropOpen[col.name] ? 'ring-2 ring-inset ring-primary' : stagedValues['type:' + col.name] ? 'ring-1 ring-inset ring-amber-500/50' : ''}">
                <div class="relative h-full">
                  <input
                    type="text"
                    value={typeDraft[col.name] ?? displayType}
                    class="{INP} pr-6 {stagedValues['type:' + col.name] ? 'text-amber-300/90' : ''}"
                    onfocus={() => {
                      typeDropOpen = { ...typeDropOpen, [col.name]: true }
                    }}
                    oninput={(e) => {
                      typeDraft = { ...typeDraft, [col.name]: e.currentTarget.value }
                      typeDropOpen = { ...typeDropOpen, [col.name]: true }
                    }}
                    onblur={() => {
                      setTimeout(() => {
                        typeDropOpen = { ...typeDropOpen, [col.name]: false }
                        const v = typeDraft[col.name]?.trim()
                        if (v && v !== displayType) stageType(col.name, v)
                        typeDraft = Object.fromEntries(Object.entries(typeDraft).filter(([k]) => k !== col.name))
                      }, 160)
                    }}
                    onkeydown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const v = typeDraft[col.name]?.trim()
                        typeDropOpen = { ...typeDropOpen, [col.name]: false }
                        if (v && v !== displayType) stageType(col.name, v)
                        typeDraft = Object.fromEntries(Object.entries(typeDraft).filter(([k]) => k !== col.name))
                        e.currentTarget.blur()
                      } else if (e.key === 'Escape') {
                        typeDraft = Object.fromEntries(Object.entries(typeDraft).filter(([k]) => k !== col.name))
                        typeDropOpen = { ...typeDropOpen, [col.name]: false }
                        e.currentTarget.blur()
                      }
                    }}
                  />
                  <svg class="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/30" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg>
                  {#if typeDropOpen[col.name]}
                    <div class="{DROP_PANEL} w-52">
                      {#each filteredTypesFor(col.name) as t (t)}
                        <button type="button"
                          class="{DROP_ITEM} {t === displayType ? 'bg-accent/60' : ''}"
                          onmousedown={(e) => {
                            e.preventDefault()
                            typeDraft = { ...typeDraft, [col.name]: t }
                            typeDropOpen = { ...typeDropOpen, [col.name]: false }
                            stageType(col.name, t)
                          }}
                        >{t}</button>
                      {:else}
                        <p class="px-2 py-1.5 font-mono text-ui-xs text-muted-foreground/60">No match</p>
                      {/each}
                    </div>
                  {/if}
                </div>
              </td>

              <!-- is_nullable -->
              <td class="{TD} {stagedValues['nullable:' + col.name] !== undefined ? 'ring-1 ring-inset ring-amber-500/50' : ''}">
                <div class="relative flex h-full items-center px-3">
                  <select
                    value={displayNullable ? 'YES' : 'NO'}
                    disabled={isPk}
                    class="w-full appearance-none border-0 bg-transparent py-0 font-mono text-ui-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 {displayNullable ? 'text-foreground' : 'text-muted-foreground'} {stagedValues['nullable:' + col.name] !== undefined ? 'text-amber-300/90' : ''}"
                    onchange={(e) => stageNullable(col.name, /** @type {HTMLSelectElement} */ (e.target).value === 'YES')}
                  >
                    <option value="YES">YES</option>
                    <option value="NO">NO</option>
                  </select>
                  <span class="pointer-events-none absolute right-1.5 text-muted-foreground/40">
                    <svg class="size-3.5" viewBox="0 0 10 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4.5l3-3 3 3M2 7.5l3 3 3-3"/></svg>
                  </span>
                </div>
              </td>

              <!-- column_default -->
              <td class="{TD_DROP} {defDropOpen[col.name] ? 'ring-2 ring-inset ring-primary' : stagedValues['default:' + col.name] !== undefined ? 'ring-1 ring-inset ring-amber-500/50' : ''}">
                <div class="relative h-full">
                  <input
                    type="text"
                    value={defaultDraft[col.name] ?? displayDefault}
                    placeholder="NULL"
                    class="{INP} pr-6 placeholder:text-muted-foreground/30 {stagedValues['default:' + col.name] !== undefined ? 'text-amber-300/90' : displayDefault ? '' : 'text-muted-foreground/35'}"
                    onfocus={(e) => {
                      defaultDraft = { ...defaultDraft, [col.name]: /** @type {HTMLInputElement} */ (e.target).value }
                      defDropOpen = { ...defDropOpen, [col.name]: true }
                    }}
                    oninput={(e) => { defaultDraft = { ...defaultDraft, [col.name]: /** @type {HTMLInputElement} */ (e.target).value } }}
                    onblur={(e) => {
                      setTimeout(() => {
                        defDropOpen = { ...defDropOpen, [col.name]: false }
                        const v = /** @type {HTMLInputElement} */ (e.target).value
                        if (v !== displayDefault) stageDefault(col.name, v || null)
                      }, 160)
                    }}
                    onkeydown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const v = defaultDraft[col.name] ?? ''
                        defDropOpen = { ...defDropOpen, [col.name]: false }
                        if (v !== displayDefault) stageDefault(col.name, v || null)
                        /** @type {HTMLElement} */ (e.currentTarget).blur()
                      }
                      if (e.key === 'Escape') {
                        defaultDraft = { ...defaultDraft, [col.name]: displayDefault }
                        defDropOpen = { ...defDropOpen, [col.name]: false }
                        /** @type {HTMLElement} */ (e.currentTarget).blur()
                      }
                    }}
                  />
                  <svg class="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/30" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg>
                  {#if defDropOpen[col.name]}
                    <div class="{DROP_PANEL} w-52">
                      <button type="button" class={DROP_ITEM} onmousedown={(e) => { e.preventDefault(); defDropOpen = {...defDropOpen,[col.name]:false}; stageDefault(col.name, null) }}>EMPTY — drop default</button>
                      <button type="button" class={DROP_ITEM} onmousedown={(e) => { e.preventDefault(); defDropOpen = {...defDropOpen,[col.name]:false}; stageDefault(col.name, 'NULL') }}>NULL</button>
                      {#if isTimestamp(col.dataType)}
                        <div class="my-0.5 border-t border-border/40"></div>
                        <button type="button" class={DROP_ITEM} onmousedown={(e) => { e.preventDefault(); defDropOpen = {...defDropOpen,[col.name]:false}; stageDefault(col.name, 'NOW()') }}>NOW()</button>
                        <button type="button" class={DROP_ITEM} onmousedown={(e) => { e.preventDefault(); defDropOpen = {...defDropOpen,[col.name]:false}; stageDefault(col.name, 'CURRENT_TIMESTAMP') }}>CURRENT_TIMESTAMP</button>
                      {/if}
                      {#if /^bool/i.test(col.dataType)}
                        <div class="my-0.5 border-t border-border/40"></div>
                        <button type="button" class={DROP_ITEM} onmousedown={(e) => { e.preventDefault(); defDropOpen = {...defDropOpen,[col.name]:false}; stageDefault(col.name, 'TRUE') }}>TRUE</button>
                        <button type="button" class={DROP_ITEM} onmousedown={(e) => { e.preventDefault(); defDropOpen = {...defDropOpen,[col.name]:false}; stageDefault(col.name, 'FALSE') }}>FALSE</button>
                      {/if}
                      <div class="my-0.5 border-t border-border/40"></div>
                      <button type="button" class="{DROP_ITEM} text-muted-foreground" onmousedown={(e) => { e.preventDefault(); defDropOpen = {...defDropOpen,[col.name]:false} }}>Close</button>
                    </div>
                  {/if}
                </div>
              </td>

              <!-- foreign_key -->
              <td class={TD}>
                {#if col.foreignKey}
                  <button type="button" class="flex h-full w-full items-center gap-1.5 px-3 font-mono text-ui-sm text-blue-400/80 hover:bg-accent/20" onclick={() => openFkDialog(col)}>
                    <ArrowRight class="size-3 shrink-0" /><span class="truncate">{col.foreignKey}</span>
                  </button>
                {:else if !isPk}
                  <div class="flex h-full items-center px-3 opacity-0 transition-opacity group-hover/row:opacity-100">
                    <button type="button" class="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-ui-xs text-muted-foreground/50 hover:bg-accent/20 hover:text-muted-foreground" onclick={() => openFkDialog(col)}>
                      <Plus class="size-3" />Add FK
                    </button>
                  </div>
                {/if}
              </td>

              <!-- comment -->
              <td class={TD}>
                <input type="text" value={col.comment ?? ''} placeholder="—"
                  class="{INP} italic text-muted-foreground placeholder:not-italic placeholder:text-muted-foreground/20 focus:not-italic focus:text-foreground"
                  onblur={(e) => { const v = /** @type {HTMLInputElement} */ (e.target).value; if (v !== (col.comment ?? '')) void alterComment(col.name, v) }}
                  onkeydown={(e) => onFieldKey(e, () => { const v = /** @type {HTMLInputElement} */ (e.currentTarget).value; if (v !== (col.comment ?? '')) void alterComment(col.name, v) })}
                />
              </td>
            </tr>
          {/each}

          {#if loading && columns.length === 0}
            {#each {length: 7} as _, i}
              <tr style="height:32px" class="border-b border-border/30">
                <td class="{TD} text-right pr-2"><div class="ml-auto h-2.5 w-4 animate-pulse rounded bg-muted/60" style="animation-delay:{i*60}ms"></div></td>
                <td class={TD}><div class="mx-3 h-2.5 animate-pulse rounded bg-muted/60" style="width:{60 + ((i * 47) % 80)}px;animation-delay:{i*60}ms"></div></td>
                <td class={TD}><div class="mx-3 h-2.5 animate-pulse rounded bg-muted/50" style="width:{40 + ((i * 31) % 60)}px;animation-delay:{i*60+30}ms"></div></td>
                <td class={TD}><div class="mx-3 h-2.5 w-8 animate-pulse rounded bg-muted/50" style="animation-delay:{i*60+20}ms"></div></td>
                <td class={TD}><div class="mx-3 h-2.5 animate-pulse rounded bg-muted/40" style="width:{i % 3 === 0 ? '80px' : '0px'};animation-delay:{i*60+40}ms"></div></td>
                <td class={TD}></td>
                <td class={TD}></td>
              </tr>
            {/each}
          {:else if visibleColumns.length === 0 && columnSearch}
            <tr><td colspan="7" class="px-4 py-6 font-mono text-ui-xs text-muted-foreground/50">No columns match "{columnSearch}"</td></tr>
          {:else if columns.length === 0 && !loading}
            <tr><td colspan="7" class="px-4 py-6 font-mono text-ui-xs text-muted-foreground/40">No structure data — click Refresh in the toolbar</td></tr>
          {/if}

          <!-- Add column row -->
          {#if newColumn}
            <tr style="height:34px" class="bg-green-900/15 ring-1 ring-inset ring-green-700/30">
              <td class={TD}></td>
              <td class="{TD} ring-0">
                <input type="text" bind:value={newColumn.name} placeholder="column_name" use:focusOnMount class="{INP} placeholder:text-muted-foreground/30" />
              </td>
              <td class="{TD_DROP}">
                <div class="relative h-full">
                  <input type="text"
                    value={newColTypeDraft.new ?? newColumn.dataType}
                    placeholder="text"
                    class="{INP} pr-6 placeholder:text-muted-foreground/30"
                    onfocus={(e) => { newColTypeDraft = { new: /** @type {HTMLInputElement} */ (e.target).value }; newColTypeDropOpen = { new: true } }}
                    oninput={(e) => { newColTypeDraft = { new: /** @type {HTMLInputElement} */ (e.target).value }; newColTypeDropOpen = { new: true } }}
                    onblur={() => setTimeout(() => { newColTypeDropOpen = { new: false }; if (newColumn) newColumn.dataType = newColTypeDraft.new?.trim() || 'text' }, 150)}
                    onkeydown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); if (newColumn) newColumn.dataType = newColTypeDraft.new?.trim() || 'text'; newColTypeDropOpen = { new: false }; /** @type {HTMLElement} */ (e.currentTarget).blur() }
                      if (e.key === 'Escape') { newColTypeDropOpen = { new: false }; /** @type {HTMLElement} */ (e.currentTarget).blur() }
                    }}
                  />
                  <svg class="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/30" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg>
                  {#if newColTypeDropOpen.new}
                    <div class={DROP_PANEL}>
                      {#each (newColTypeDraft.new?.trim() ? allTypes.filter(t => t.includes(newColTypeDraft.new.toLowerCase())) : allTypes) as t (t)}
                        <button type="button"
                          class="{DROP_ITEM} {t === newColumn?.dataType ? 'bg-accent/60' : ''}"
                          onmousedown={(e) => { e.preventDefault(); if (newColumn) newColumn.dataType = t; newColTypeDraft = { new: t }; newColTypeDropOpen = { new: false } }}
                        >{t}</button>
                      {/each}
                    </div>
                  {/if}
                </div>
              </td>
              <td class={TD}>
                <div class="relative flex h-full items-center px-3">
                  <select bind:value={newColumn.isNullable}
                    class="w-full appearance-none border-0 bg-transparent py-0 font-mono text-ui-sm focus:outline-none {newColumn.isNullable ? 'text-foreground' : 'text-muted-foreground'}">
                    <option value={true}>YES</option>
                    <option value={false}>NO</option>
                  </select>
                  <span class="pointer-events-none absolute right-1.5 text-muted-foreground/40">
                    <svg class="size-3.5" viewBox="0 0 10 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4.5l3-3 3 3M2 7.5l3 3 3-3"/></svg>
                  </span>
                </div>
              </td>
              <td class={TD}>
                <input type="text" bind:value={newColumn.columnDefault} placeholder="NULL" class="{INP} placeholder:text-muted-foreground/30" />
              </td>
              <td class={TD}></td>
              <td class={TD}>
                <input type="text" bind:value={newColumn.comment} placeholder="—" class="{INP} italic placeholder:not-italic placeholder:text-muted-foreground/30" />
              </td>
            </tr>
          {/if}
        </tbody>
      </table>

    <!-- ── Action bar: Apply/Reset pending changes + Add column ── -->
    <div class="flex items-center gap-2 border-t border-border/40 px-3 py-1.5 font-mono">
    {#if newColumn}
      <span class="text-ui-2xs text-green-400/80">New column — fill in details then save</span>
      <button type="button" disabled={confirmLoading}
        class="ml-auto flex items-center gap-1 rounded bg-green-900/20 px-2.5 py-1 text-ui-xs text-green-400 hover:bg-green-900/30 disabled:opacity-50"
        onclick={saveNewColumn}>
        {#if confirmLoading}<Loader class="mr-1 size-3 animate-spin" />{/if}
        Save column
      </button>
      <button type="button"
        class="flex items-center gap-1 rounded px-2.5 py-1 text-ui-xs text-muted-foreground hover:bg-accent/20"
        onclick={() => (newColumn = null)}>Cancel</button>
    {:else}
      {#if hasPending}
        <span class="text-ui-2xs text-amber-400/80">{pendingCount} pending {pendingCount === 1 ? 'change' : 'changes'}</span>
        <button type="button" disabled={confirmLoading}
          class="flex items-center gap-1.5 rounded bg-primary/15 px-2.5 py-1 text-ui-xs font-medium text-primary hover:bg-primary/25 disabled:opacity-50"
          onclick={applyPendingDdl}>
          {#if confirmLoading}<Loader class="size-3 animate-spin" />{:else}<Check class="size-3" />{/if}
          Apply {pendingCount}
        </button>
        <button type="button"
          class="flex items-center gap-1.5 rounded px-2.5 py-1 text-ui-xs text-muted-foreground hover:bg-accent/20 hover:text-foreground"
          onclick={resetPendingDdl}>
          <Undo2 class="size-3" />Reset
        </button>
      {/if}
      <button type="button"
        class="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-ui-xs text-muted-foreground hover:bg-accent/20 hover:text-foreground"
        onclick={startNewColumn}>
        <Plus class="size-3" />Add column
      </button>
    {/if}
    </div>

    <!-- ── Index section ── -->
    <div class="font-mono">
      <div class={SECTION_HDR}>
        <span class={SECTION_LABEL}>
          Indexes
          {#if columnSearch && visibleIndexes.length !== tableIndexes.length}
            <span class="ml-1 font-normal text-muted-foreground/40">({visibleIndexes.length}/{tableIndexes.length})</span>
          {/if}
        </span>
        <button type="button" class="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-ui-xs text-muted-foreground hover:bg-accent/30 hover:text-foreground" onclick={startNewIndex}>
          <Plus class="size-3" />Add index
        </button>
      </div>

      <table class="border-collapse" style="table-layout: fixed; width: max-content; min-width: 100%">
        <colgroup>
          <col style="min-width:180px;width:220px" />
          <col style="min-width:110px;width:130px" />
          <col style="min-width:72px;width:80px" />
          <col style="min-width:150px;width:200px" />
          <col style="min-width:130px;width:160px" />
          <col style="min-width:150px;width:180px" />
          <col style="min-width:36px;width:36px;max-width:36px" />
        </colgroup>
        <thead>
          <tr>
            {#each ['index_name','algorithm','is_unique','column_name','condition','comment',''] as h}
              <th class={TH}>{h}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each visibleIndexes as idx (idx.name)}
            <tr class="group/idx" style="height:32px">

              <!-- index_name -->
              <td class="border-b border-r border-border/40 px-3 font-mono text-ui-sm text-foreground overflow-hidden">{idx.name}</td>

              <!-- algorithm -->
              <td class="border-b border-r border-border/40 p-0 align-middle overflow-hidden">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger class="group/alg flex h-full w-full cursor-pointer items-center gap-1 px-3 font-mono text-ui-sm uppercase text-foreground hover:bg-accent/20">
                    <span class="flex-1">{idx.indexType}</span>
                    <svg class="size-3 shrink-0 text-muted-foreground/30 opacity-0 group-hover/alg:opacity-100" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content class="w-44 [&_[data-slot=dropdown-menu-item]]:font-mono [&_[data-slot=dropdown-menu-item]]:text-ui-sm [&_[data-slot=dropdown-menu-item]]:px-3 [&_[data-slot=dropdown-menu-item]]:py-1.5" align="start" sideOffset={1}>
                    {#each INDEX_ALGORITHMS as alg (alg)}
                      <DropdownMenu.Item class={alg.toLowerCase() === idx.indexType.toLowerCase() ? 'bg-accent/60' : ''}
                        onSelect={() => { if (alg.toLowerCase() !== idx.indexType.toLowerCase()) requestIndexRecreate(idx, alg, idx.isUnique, idx.columns) }}
                      >{alg}</DropdownMenu.Item>
                    {/each}
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item class="text-muted-foreground" onSelect={() => {}}>Manual input…</DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </td>

              <!-- is_unique -->
              <td class="border-b border-r border-border/40 p-0 align-middle overflow-hidden">
                <div class="flex h-full items-center px-3">
                  <button
                    type="button"
                    class="rounded px-1.5 py-0.5 font-mono text-ui-xs font-medium transition-colors {idx.isUnique ? 'bg-green-500/12 text-green-400 hover:bg-green-500/20' : 'bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground'}"
                    onclick={() => requestIndexRecreate(idx, idx.indexType, !idx.isUnique, idx.columns)}
                    title="Click to toggle uniqueness"
                  >
                    {idx.isUnique ? 'TRUE' : 'FALSE'}
                  </button>
                </div>
              </td>

              <!-- columns -->
              <td class="border-b border-r border-border/40 p-0 align-middle overflow-hidden">
                <input type="text"
                  value={idx.columns}
                  class="{INP} text-muted-foreground"
                  onblur={(e) => { const v = /** @type {HTMLInputElement} */ (e.target).value.trim(); if (v && v !== idx.columns) requestIndexRecreate(idx, idx.indexType, idx.isUnique, v) }}
                  onkeydown={(e) => { if (e.key === 'Enter') { const v = /** @type {HTMLInputElement} */ (e.currentTarget).value.trim(); if (v && v !== idx.columns) requestIndexRecreate(idx, idx.indexType, idx.isUnique, v); /** @type {HTMLElement} */ (e.currentTarget).blur() } if (e.key === 'Escape') /** @type {HTMLElement} */ (e.currentTarget).blur() }}
                />
              </td>

              <!-- condition -->
              <td class="border-b border-r border-border/40 px-3 font-mono text-ui-sm text-muted-foreground/50 overflow-hidden">
                <span class="truncate block">{idx.condition ?? '—'}</span>
              </td>

              <!-- comment -->
              <td class="border-b border-r border-border/40 p-0 align-middle overflow-hidden">
                <input type="text" value={idx.comment ?? ''} placeholder="—"
                  class="{INP} italic text-muted-foreground placeholder:not-italic placeholder:text-muted-foreground/20 focus:not-italic focus:text-foreground"
                  onblur={(e) => { const v = /** @type {HTMLInputElement} */ (e.target).value; if (v !== (idx.comment ?? '')) void updateIndexComment(idx.name, v) }}
                  onkeydown={(e) => { if (e.key === 'Enter') /** @type {HTMLElement} */ (e.currentTarget).blur(); if (e.key === 'Escape') /** @type {HTMLElement} */ (e.currentTarget).blur() }}
                />
              </td>

              <!-- delete -->
              <td class="border-b border-border/40 p-0 align-middle">
                <button type="button" disabled={confirmLoading}
                  class="flex h-full w-full items-center justify-center text-muted-foreground/20 transition-colors hover:text-destructive disabled:opacity-40 group-hover/idx:text-muted-foreground/50"
                  title="Drop index" onclick={() => requestDropIndex(idx.name)}
                >
                  <Trash2 class="size-3.5" />
                </button>
              </td>
            </tr>
          {/each}

          {#if visibleIndexes.length === 0 && columnSearch && tableIndexes.length > 0}
            <tr><td colspan="7" class="px-3 py-4 font-mono text-ui-xs text-muted-foreground/50">No indexes match "{columnSearch}"</td></tr>
          {:else if tableIndexes.length === 0 && !newIndex}
            <tr><td colspan="7" class="px-3 py-4 font-mono text-ui-xs text-muted-foreground/40">No secondary indexes</td></tr>
          {/if}

          <!-- New index row -->
          {#if newIndex}
            <tr style="height:34px" class="bg-green-900/15 ring-1 ring-inset ring-green-700/30">
              <td class="border-b border-r border-green-700/20 p-0">
                <input type="text" bind:value={newIndex.name} placeholder="auto-generated" class="{INP} placeholder:text-muted-foreground/30" />
              </td>
              <td class="border-b border-r border-green-700/20 p-0">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger class="group/na flex h-full w-full cursor-pointer items-center gap-1 px-3 font-mono text-ui-sm uppercase text-foreground hover:bg-accent/20">
                    <span class="flex-1">{newIndex.algorithm || 'BTREE'}</span>
                    <svg class="size-3 text-muted-foreground/30 opacity-0 group-hover/na:opacity-100" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content class="w-44 [&_[data-slot=dropdown-menu-item]]:font-mono [&_[data-slot=dropdown-menu-item]]:text-ui-sm [&_[data-slot=dropdown-menu-item]]:px-3 [&_[data-slot=dropdown-menu-item]]:py-1.5" align="start" sideOffset={1}>
                    {#each INDEX_ALGORITHMS as alg (alg)}
                      <DropdownMenu.Item class={newIndex.algorithm === alg ? 'bg-accent' : ''} onSelect={() => { if (newIndex) newIndex.algorithm = alg }}>{alg}</DropdownMenu.Item>
                    {/each}
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item class="text-muted-foreground" onSelect={() => { if (newIndex) newIndex.algorithm = '' }}>Manual input…</DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </td>
              <td class="border-b border-r border-green-700/20 p-0">
                <div class="flex h-full items-center px-3">
                  <button
                    type="button"
                    class="rounded px-1.5 py-0.5 font-mono text-ui-xs font-medium transition-colors {newIndex.isUnique ? 'bg-green-500/12 text-green-400 hover:bg-green-500/20' : 'bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground'}"
                    onclick={() => { if (newIndex) newIndex.isUnique = !newIndex.isUnique }}
                  >
                    {newIndex.isUnique ? 'TRUE' : 'FALSE'}
                  </button>
                </div>
              </td>
              <td class="border-b border-r border-green-700/20 p-0">
                <input type="text" bind:value={newIndex.columns} placeholder="col1, col2" class="{INP} placeholder:text-muted-foreground/30" />
              </td>
              <td class="border-b border-r border-green-700/20 p-0">
                <input type="text" bind:value={newIndex.condition} placeholder="WHERE …" class="{INP} placeholder:text-muted-foreground/30" />
              </td>
              <td class="border-b border-r border-green-700/20 p-0">
                <input type="text" bind:value={newIndex.comment} placeholder="—" class="{INP} italic placeholder:not-italic placeholder:text-muted-foreground/30" />
              </td>
              <td class="border-b border-green-700/20 p-0">
                <div class="flex h-full flex-col items-center justify-center gap-px">
                  <button type="button" disabled={confirmLoading} title="Save" class="flex items-center justify-center text-green-500 hover:text-green-400 disabled:opacity-40" onclick={saveNewIndex}>
                    <svg class="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 8l4 4 6-6"/></svg>
                  </button>
                  <button type="button" title="Cancel" class="flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground" onclick={() => newIndex = null}>
                    <svg class="size-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4l8 8M12 4l-8 8"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div><!-- end index section -->

    <!-- ── Triggers section ── -->
    <div class="font-mono">
      <div class={SECTION_HDR}>
        <GitBranch class="size-3 shrink-0 text-muted-foreground/50" />
        <span class={SECTION_LABEL}>
          Triggers
          {#if columnSearch && visibleTriggers.length !== tableTriggers.length}
            <span class="ml-1 font-normal text-muted-foreground/40">({visibleTriggers.length}/{tableTriggers.length})</span>
          {/if}
        </span>
        <button type="button" class="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-ui-xs text-muted-foreground hover:bg-accent/30 hover:text-foreground" onclick={() => (createTriggerOpen = true)}>
          <Plus class="size-3" />Add trigger
        </button>
      </div>

      <table class="border-collapse" style="table-layout: fixed; width: max-content; min-width: 100%">
        <colgroup>
          <col style="min-width:180px;width:220px" />
          <col style="min-width:90px;width:100px" />
          <col style="min-width:180px;width:220px" />
          <col style="min-width:180px;width:220px" />
          <col style="min-width:64px;width:72px" />
          <col style="min-width:36px;width:36px;max-width:36px" />
        </colgroup>
        <thead>
          <tr>
            {#each ['trigger_name','timing','events','function','status',''] as h}
              <th class="{TH} last:border-r-0">{h}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each visibleTriggers as trig (trig.name)}
            <tr class="group/trig" style="height:32px">
              <td class="border-b border-r border-border/40 px-3 font-mono text-ui-sm text-foreground overflow-hidden">
                <span class="block truncate">{trig.name}</span>
              </td>
              <td class="border-b border-r border-border/40 px-3">
                <span class="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-ui-3xs text-muted-foreground">{trig.timing}</span>
              </td>
              <td class="border-b border-r border-border/40 px-3 overflow-hidden">
                <div class="flex gap-1 overflow-hidden">
                  {#each trig.events.split(', ').filter(Boolean) as ev (ev)}
                    <span class="shrink-0 rounded bg-primary/8 px-1.5 py-0.5 font-mono text-ui-3xs text-primary/80">{ev}</span>
                  {/each}
                </div>
              </td>
              <td class="border-b border-r border-border/40 px-3 font-mono text-ui-xs text-muted-foreground/70 overflow-hidden">
                <span class="block truncate">{trig.functionName}()</span>
              </td>
              <td class="border-b border-r border-border/40 px-3">
                {#if trig.enabled}
                  <span class="flex items-center gap-1 font-mono text-ui-3xs text-green-400">
                    <span class="size-1.5 rounded-full bg-green-400"></span>on
                  </span>
                {:else}
                  <span class="flex items-center gap-1 font-mono text-ui-3xs text-muted-foreground/40">
                    <span class="size-1.5 rounded-full bg-muted-foreground/30"></span>off
                  </span>
                {/if}
              </td>
              <td class="border-b border-border/40 p-0 align-middle">
                <button type="button" disabled={confirmLoading}
                  class="flex h-full w-full items-center justify-center text-muted-foreground/20 transition-colors hover:text-destructive disabled:opacity-40 group-hover/trig:text-muted-foreground/50"
                  title="Drop trigger"
                  onclick={() => askConfirm(
                    { title: `Drop trigger "${trig.name}"`, description: `Permanently removes this trigger from "${table}".`, sql: `DROP TRIGGER "${trig.name}" ON ${tbl()};`, confirmLabel: 'Drop', variant: 'destructive' },
                    async () => { await executeSql(`DROP TRIGGER "${trig.name}" ON ${tbl()}`); toast.success(`Trigger "${trig.name}" dropped`); onrefresh() }
                  )}
                >
                  <Trash2 class="size-3.5" />
                </button>
              </td>
            </tr>
          {/each}

          {#if visibleTriggers.length === 0 && columnSearch && tableTriggers.length > 0}
            <tr><td colspan="6" class="px-3 py-4 font-mono text-ui-xs text-muted-foreground/50">No triggers match "{columnSearch}"</td></tr>
          {:else if tableTriggers.length === 0}
            <tr><td colspan="6" class="px-3 py-4 font-mono text-ui-xs text-muted-foreground/40">No triggers on this table</td></tr>
          {/if}
        </tbody>
      </table>
    </div><!-- end triggers section -->

  </div><!-- end inline-block wrapper -->
  </div><!-- end scroll container -->
</div><!-- end outer flex -->

<CreateTriggerDialog
  bind:open={createTriggerOpen}
  {schema}
  defaultTable={table}
  {tables}
  onrefresh={onrefresh}
/>
