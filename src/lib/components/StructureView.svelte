<script>
  import { tick } from 'svelte'
  import { toast } from 'svelte-sonner'
  import { executeSql } from '$lib/api.js'
  import Loader from '@lucide/svelte/icons/loader'
  import KeyRound from '@lucide/svelte/icons/key-round'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import Plus from '@lucide/svelte/icons/plus'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import ForeignKeyDialog from './ForeignKeyDialog.svelte'
  import DdlConfirmDialog from './DdlConfirmDialog.svelte'
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
    function onMove(ev) { colWidths = colWidths.map((w, i) => i === idx ? Math.max(40, startW + ev.clientX - startX) : w) }
    /** @param {PointerEvent} ev */
    function onUp(ev) { el.releasePointerCapture(ev.pointerId); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp) }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }

  // ── Confirm dialog state ──────────────────────────────────────────────────
  let confirmOpen = $state(false)
  let confirmLoading = $state(false)
  /** Per-field saving indicators (currently unused since DDL goes through confirmDialog, kept for template compat) */
  let saving = $state(/** @type {Record<string, boolean>} */ ({}))
  let confirmProps = $state({
    title: '',
    description: '',
    sql: /** @type {string|string[]} */ (''),
    confirmLabel: 'Apply',
    variant: /** @type {'default'|'destructive'} */ ('default'),
  })
  let confirmAction = $state(/** @type {(() => Promise<void>) | null} */ (null))

  /**
   * Show the DDL confirm dialog, then run the action on confirm.
   * @param {{ title: string, description: string, sql: string|string[], confirmLabel?: string, variant?: 'default'|'destructive' }} opts
   * @param {() => Promise<void>} action
   */
  function askConfirm(opts, action) {
    confirmProps = {
      title: opts.title,
      description: opts.description,
      sql: opts.sql,
      confirmLabel: opts.confirmLabel ?? 'Apply',
      variant: opts.variant ?? 'default',
    }
    confirmAction = action
    confirmOpen = true
  }

  async function handleConfirm() {
    if (!confirmAction) return
    confirmLoading = true
    try { await confirmAction() }
    finally { confirmLoading = false; confirmOpen = false; confirmAction = null }
  }

  // ── Column DDL ────────────────────────────────────────────────────────────
  const tbl = () => `"${schema}"."${table}"`

  async function runDdlDirect(/** @type {string|string[]} */ sql) {
    const stmts = Array.isArray(sql) ? sql : [sql]
    for (const s of stmts) await executeSql(s)
    toast.success('Updated')
    onrefresh()
  }

  function alterType(/** @type {string} */ col, /** @type {string} */ t) {
    const type = t.trim(); if (!type) return
    const sql = `ALTER TABLE ${tbl()} ALTER COLUMN "${col}" TYPE ${type} USING "${col}"::${type}`
    askConfirm({
      title: 'Change column type',
      description: `Changing "${col}" type may cast or lose existing data. Will fail if the cast is incompatible.`,
      sql,
      confirmLabel: 'Change type',
      variant: 'destructive',
    }, () => runDdlDirect(sql))
  }

  function alterNullable(/** @type {string} */ col, /** @type {boolean} */ nullable) {
    const sql = `ALTER TABLE ${tbl()} ALTER COLUMN "${col}" ${nullable ? 'DROP NOT NULL' : 'SET NOT NULL'}`
    askConfirm({
      title: nullable ? 'Allow NULL values' : 'Add NOT NULL constraint',
      description: nullable
        ? `Remove the NOT NULL constraint from "${col}".`
        : `Add NOT NULL to "${col}". Will fail if any existing rows contain NULL.`,
      sql,
      confirmLabel: nullable ? 'Allow NULL' : 'Set NOT NULL',
      variant: nullable ? 'default' : 'destructive',
    }, () => runDdlDirect(sql))
  }

  function alterDefault(/** @type {string} */ col, /** @type {string|null} */ def) {
    const sql = !def || def.trim() === ''
      ? `ALTER TABLE ${tbl()} ALTER COLUMN "${col}" DROP DEFAULT`
      : `ALTER TABLE ${tbl()} ALTER COLUMN "${col}" SET DEFAULT ${def.trim()}`
    const dropping = !def || def.trim() === ''
    askConfirm({
      title: dropping ? 'Drop column default' : 'Set column default',
      description: `Update the default value for column "${col}".`,
      sql,
      confirmLabel: dropping ? 'Drop default' : 'Set default',
      variant: 'default',
    }, () => runDdlDirect(sql))
  }

  function alterComment(/** @type {string} */ col, /** @type {string} */ comment) {
    // Comments are non-destructive — execute directly without dialog.
    const esc = comment.replace(/'/g, "''")
    const sql = comment.trim() === ''
      ? `COMMENT ON COLUMN ${tbl()}."${col}" IS NULL`
      : `COMMENT ON COLUMN ${tbl()}."${col}" IS '${esc}'`
    executeSql(sql).then(() => { toast.success('Comment updated'); onrefresh() })
      .catch(e => toast.error('Failed', { description: String(e) }))
  }

  // ── Column rename ─────────────────────────────────────────────────────────
  let renamingCol = $state(/** @type {string|null} */ (null))
  let renameDraft = $state('')

  async function startRename(/** @type {ColumnStructureRow} */ col) {
    renamingCol = col.name; renameDraft = col.name
    await tick()
    const el = document.querySelector('[data-rename-input]')
    if (el instanceof HTMLInputElement) { el.focus(); el.select() }
  }
  function commitRename() {
    const n = renameDraft.trim()
    if (!n || n === renamingCol) { renamingCol = null; return }
    const sql = `ALTER TABLE ${tbl()} RENAME COLUMN "${renamingCol}" TO "${n}"`
    const oldName = renamingCol
    renamingCol = null
    askConfirm({
      title: 'Rename column',
      description: `Rename "${oldName}" to "${n}". References in views, functions, or application code will need updating.`,
      sql,
      confirmLabel: 'Rename',
      variant: 'default',
    }, () => runDdlDirect(sql))
  }
  function cancelRename() { renamingCol = null; renameDraft = '' }

  // ── Type dropdown ─────────────────────────────────────────────────────────
  const PG_TYPES = [
    // Integer — internal names (what pg stores) + SQL aliases
    'int2','int4','int8','smallint','integer','bigint',
    // Serial auto-increment
    'serial','smallserial','bigserial',
    // Float / numeric
    'float4','float8','real','numeric','decimal','money',
    // Text
    'text','varchar','char','bpchar','citext','name',
    // Boolean
    'bool','boolean',
    // Date / time
    'date','time','timetz','timestamp','timestamptz','interval',
    // UUID
    'uuid',
    // JSON
    'json','jsonb',
    // Binary
    'bytea',
    // Network
    'inet','cidr','macaddr','macaddr8',
    // Geometric
    'point','line','lseg','box','path','polygon','circle',
    // Full-text search
    'tsvector','tsquery',
    // Ranges (pg 9.2+)
    'int4range','int8range','numrange','tsrange','tstzrange','daterange',
    // Bit strings
    'bit','varbit',
    // Other builtins
    'xml','oid','pg_lsn','txid_snapshot',
    // Extensions — common on Supabase
    'vector',    // pgvector (AI embeddings)
    'hstore',    // key-value
    'ltree',     // hierarchical labels
    'cube',      // multi-dim cubes
    'earth',     // earthdistance
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
      description: `Drop and recreate "${idx.name}" with updated settings. Briefly unavailable during recreation.`,
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
    // Index comments are non-destructive — execute directly.
    const sql = c.trim() === '' ? `COMMENT ON INDEX "${name}" IS NULL` : `COMMENT ON INDEX "${name}" IS '${c.replace(/'/g, "''")}'`
    executeSql(sql).then(() => { toast.success('Comment updated'); onrefresh() })
      .catch(e => toast.error('Failed', { description: String(e) }))
  }

  // ── Filtered data ─────────────────────────────────────────────────────────
  const visibleColumns = $derived(
    columnSearch.trim() ? columns.filter(c => c.name.toLowerCase().includes(columnSearch.toLowerCase())) : columns
  )
  const tableIndexes = $derived(indexes.filter(i => i.tableName === table && !i.isPrimary))

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

  // shared classes
  const TH = 'relative select-none overflow-hidden border-b border-r border-border bg-panel px-3 py-2 text-left font-medium text-muted-foreground text-ui-2xs uppercase tracking-wide whitespace-nowrap'
  const TD = 'border-b border-r border-border/40 p-0 align-middle overflow-hidden'
  // For cells that show floating dropdowns — must NOT clip the dropdown
  const TD_DROP = 'border-b border-r border-border/40 p-0 align-middle overflow-visible'
  // DataTable-identical input class
  const INP = 'box-border block h-full w-full min-w-0 overflow-x-auto border-0 bg-transparent px-3 py-0 font-mono text-ui-sm text-foreground outline-none selection:bg-primary/20'
  // Floating dropdown container — matches DropdownMenu.Content look
  const DROP_PANEL = 'absolute left-0 top-full z-50 mt-0.5 max-h-64 w-48 overflow-y-auto rounded-md border border-border/60 bg-popover p-1 text-popover-foreground shadow-md'
  // Dropdown item — matches DropdownMenu item look
  const DROP_ITEM = 'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 font-mono text-ui-xs text-foreground outline-none hover:bg-accent hover:text-accent-foreground'
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


  <!-- Single scroll container. The inner inline-block wrapper grows to the widest table so
       both column table and index section share the same horizontal scroll space. -->
  <div class="min-h-0 flex-1" style="overflow: auto">
  <div style="display: inline-block; min-width: 100%; vertical-align: top">

    <!-- ── Column table ── -->
    <table class="border-collapse" style="table-layout: fixed; width: max-content; min-width: 100%">
      <colgroup>
        {#each colWidths as w}<col style="width:{w}px;min-width:{w}px;max-width:{w}px" />{/each}
      </colgroup>
      <thead class="sticky top-0 z-20">
        <tr>
          {#each ['#','column_name','data_type','is_nullable','column_default','foreign_key','comment'] as label, i}
            <th class={TH} style="height:36px">
              <span class="block truncate pr-3">{label}</span>
              <!-- Resize handle: always-visible faint line -->
              <div class="group/rz absolute right-0 top-0 z-10 flex h-full w-2 cursor-col-resize touch-none select-none items-stretch justify-end" onpointerdown={(e) => startColResize(i, e)} role="separator" aria-label="Resize">
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
          <tr class="group/row" style="height:32px">

            <!-- # -->
            <td class={TD}>
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
                  <span class="truncate">{col.name}</span>
                </div>
              {/if}
            </td>

            <!-- data_type — DropdownMenu with searchable input trigger -->
            <td class="{TD} {typeDropOpen[col.name] ? 'ring-2 ring-inset ring-primary' : ''}">
              <DropdownMenu.Root
                open={typeDropOpen[col.name] ?? false}
                onOpenChange={(v) => typeDropOpen = { ...typeDropOpen, [col.name]: v }}
              >
                <DropdownMenu.Trigger class="flex h-full w-full items-center" tabindex={-1} aria-hidden>
                  <!-- visually hidden trigger; open is driven by the input below -->
                  <span class="sr-only">Type</span>
                </DropdownMenu.Trigger>
                <div class="relative h-full">
                  <input
                    type="text"
                    value={typeDraft[col.name] ?? col.dataType}
                    disabled={!!saving[`type:${col.name}`]}
                    class="{INP} pr-6"
                    onfocus={(e) => {
                      typeDraft = { ...typeDraft, [col.name]: /** @type {HTMLInputElement} */ (e.target).value }
                      typeDropOpen = { ...typeDropOpen, [col.name]: true }
                    }}
                    oninput={(e) => {
                      typeDraft = { ...typeDraft, [col.name]: /** @type {HTMLInputElement} */ (e.target).value }
                      typeDropOpen = { ...typeDropOpen, [col.name]: true }
                    }}
                    onblur={(e) => {
                      setTimeout(() => {
                        typeDropOpen = { ...typeDropOpen, [col.name]: false }
                        const v = typeDraft[col.name]?.trim()
                        if (v && v !== col.dataType) void alterType(col.name, v)
                      }, 160)
                    }}
                    onkeydown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const v = typeDraft[col.name]?.trim()
                        typeDropOpen = { ...typeDropOpen, [col.name]: false }
                        if (v && v !== col.dataType) void alterType(col.name, v)
                        /** @type {HTMLElement} */ (e.currentTarget).blur()
                      }
                      if (e.key === 'Escape') {
                        typeDraft = { ...typeDraft, [col.name]: col.dataType }
                        typeDropOpen = { ...typeDropOpen, [col.name]: false }
                        /** @type {HTMLElement} */ (e.currentTarget).blur()
                      }
                    }}
                  />
                  {#if saving[`type:${col.name}`]}
                    <Loader class="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 animate-spin text-muted-foreground" />
                  {:else}
                    <svg class="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/30" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg>
                  {/if}
                </div>
                <DropdownMenu.Content
                  align="start"
                  sideOffset={1}
                  class="max-h-64 w-48 overflow-y-auto p-1 [&_[data-slot=dropdown-menu-item]]:font-mono [&_[data-slot=dropdown-menu-item]]:text-ui-xs"
                >
                  {#each filteredTypesFor(col.name) as t (t)}
                    <DropdownMenu.Item
                      class="{t === col.dataType ? 'bg-accent/60' : ''}"
                      onSelect={() => { typeDraft = { ...typeDraft, [col.name]: t }; void alterType(col.name, t) }}
                    >{t}</DropdownMenu.Item>
                  {:else}
                    <p class="px-2 py-1.5 font-mono text-ui-xs text-muted-foreground">No match</p>
                  {/each}
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item class="text-muted-foreground" onSelect={() => typeDropOpen = { ...typeDropOpen, [col.name]: false }}>
                    Manual input…
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </td>

            <!-- is_nullable -->
            <td class={TD}>
              <div class="relative flex h-full items-center px-3">
                <select
                  value={col.isNullable ? 'YES' : 'NO'}
                  disabled={isPk || !!saving[`nullable:${col.name}`]}
                  class="w-full appearance-none border-0 bg-transparent py-0 font-mono text-ui-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 {col.isNullable ? 'text-foreground' : 'text-muted-foreground'}"
                  onchange={(e) => alterNullable(col.name, /** @type {HTMLSelectElement} */ (e.target).value === 'YES')}
                >
                  <option value="YES">YES</option>
                  <option value="NO">NO</option>
                </select>
                <span class="pointer-events-none absolute right-1.5 text-muted-foreground/40">
                  {#if saving[`nullable:${col.name}`]}<Loader class="size-3 animate-spin" />{:else}
                    <svg class="size-3.5" viewBox="0 0 10 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4.5l3-3 3 3M2 7.5l3 3 3-3"/></svg>
                  {/if}
                </span>
              </div>
            </td>

            <!-- column_default — uses TD_DROP so the preset dropdown escapes the cell -->
            <td class="{TD_DROP} {defDropOpen[col.name] ? 'ring-2 ring-inset ring-primary' : ''}">
              <div class="relative h-full">
                <input
                  type="text"
                  value={defaultDraft[col.name] ?? col.columnDefault ?? ''}
                  placeholder="NULL"
                  disabled={!!saving[`default:${col.name}`]}
                  class="{INP} pr-6 placeholder:text-muted-foreground/30 {col.columnDefault ? '' : 'text-muted-foreground/35'}"
                  onfocus={(e) => {
                    defaultDraft = { ...defaultDraft, [col.name]: /** @type {HTMLInputElement} */ (e.target).value }
                    defDropOpen = { ...defDropOpen, [col.name]: true }
                  }}
                  oninput={(e) => { defaultDraft = { ...defaultDraft, [col.name]: /** @type {HTMLInputElement} */ (e.target).value } }}
                  onblur={(e) => {
                    setTimeout(() => {
                      defDropOpen = { ...defDropOpen, [col.name]: false }
                      const v = /** @type {HTMLInputElement} */ (e.target).value
                      if (v !== (col.columnDefault ?? '')) void alterDefault(col.name, v || null)
                    }, 160)
                  }}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const v = defaultDraft[col.name] ?? ''
                      defDropOpen = { ...defDropOpen, [col.name]: false }
                      if (v !== (col.columnDefault ?? '')) void alterDefault(col.name, v || null)
                      /** @type {HTMLElement} */ (e.currentTarget).blur()
                    }
                    if (e.key === 'Escape') {
                      defaultDraft = { ...defaultDraft, [col.name]: col.columnDefault ?? '' }
                      defDropOpen = { ...defDropOpen, [col.name]: false }
                      /** @type {HTMLElement} */ (e.currentTarget).blur()
                    }
                  }}
                />
                {#if saving[`default:${col.name}`]}
                  <Loader class="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 animate-spin text-muted-foreground" />
                {:else}
                  <svg class="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/30" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg>
                {/if}
                {#if defDropOpen[col.name]}
                  <div class="{DROP_PANEL} w-52">
                    <button type="button" class={DROP_ITEM} onmousedown={(e) => { e.preventDefault(); defDropOpen = {...defDropOpen,[col.name]:false}; void alterDefault(col.name, null) }}>EMPTY — drop default</button>
                    <button type="button" class={DROP_ITEM} onmousedown={(e) => { e.preventDefault(); defDropOpen = {...defDropOpen,[col.name]:false}; void alterDefault(col.name, 'NULL') }}>NULL</button>
                    {#if isTimestamp(col.dataType)}
                      <div class="my-0.5 border-t border-border/40"></div>
                      <button type="button" class={DROP_ITEM} onmousedown={(e) => { e.preventDefault(); defDropOpen = {...defDropOpen,[col.name]:false}; void alterDefault(col.name, 'NOW()') }}>NOW()</button>
                      <button type="button" class={DROP_ITEM} onmousedown={(e) => { e.preventDefault(); defDropOpen = {...defDropOpen,[col.name]:false}; void alterDefault(col.name, 'CURRENT_TIMESTAMP') }}>CURRENT_TIMESTAMP</button>
                    {/if}
                    {#if /^bool/i.test(col.dataType)}
                      <div class="my-0.5 border-t border-border/40"></div>
                      <button type="button" class={DROP_ITEM} onmousedown={(e) => { e.preventDefault(); defDropOpen = {...defDropOpen,[col.name]:false}; void alterDefault(col.name, 'TRUE') }}>TRUE</button>
                      <button type="button" class={DROP_ITEM} onmousedown={(e) => { e.preventDefault(); defDropOpen = {...defDropOpen,[col.name]:false}; void alterDefault(col.name, 'FALSE') }}>FALSE</button>
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
              <input type="text" value={col.comment ?? ''} placeholder="—" disabled={!!saving[`comment:${col.name}`]}
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
              <td class="{TD} text-right pr-2">
                <div class="ml-auto h-2.5 w-4 animate-pulse rounded bg-muted/60" style="animation-delay:{i*60}ms"></div>
              </td>
              <td class={TD}>
                <div class="mx-3 h-2.5 animate-pulse rounded bg-muted/60" style="width:{60 + ((i * 47) % 80)}px;animation-delay:{i*60}ms"></div>
              </td>
              <td class={TD}>
                <div class="mx-3 h-2.5 animate-pulse rounded bg-muted/50" style="width:{40 + ((i * 31) % 60)}px;animation-delay:{i*60+30}ms"></div>
              </td>
              <td class={TD}>
                <div class="mx-3 h-2.5 w-8 animate-pulse rounded bg-muted/50" style="animation-delay:{i*60+20}ms"></div>
              </td>
              <td class={TD}>
                <div class="mx-3 h-2.5 animate-pulse rounded bg-muted/40" style="width:{i % 3 === 0 ? '80px' : '0px'};animation-delay:{i*60+40}ms"></div>
              </td>
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
            <!-- # (blank) -->
            <td class={TD}></td>

            <!-- column_name -->
            <td class="{TD} ring-0">
              <input type="text" bind:value={newColumn.name} placeholder="column_name" autofocus
                class="{INP} placeholder:text-muted-foreground/30" />
            </td>

            <!-- data_type dropdown -->
            <td class="{TD_DROP}">
              <div class="relative h-full">
                <input type="text"
                  value={newColTypeDraft.new ?? newColumn.dataType}
                  placeholder="text"
                  class="{INP} pr-6 placeholder:text-muted-foreground/30"
                  onfocus={(e) => { newColTypeDraft = { new: /** @type {HTMLInputElement} */ (e.target).value }; newColTypeDropOpen = { new: true } }}
                  oninput={(e) => { newColTypeDraft = { new: /** @type {HTMLInputElement} */ (e.target).value }; newColTypeDropOpen = { new: true } }}
                  onblur={() => setTimeout(() => {
                    newColTypeDropOpen = { new: false }
                    if (newColumn) newColumn.dataType = newColTypeDraft.new?.trim() || 'text'
                  }, 150)}
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

            <!-- is_nullable -->
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

            <!-- column_default -->
            <td class={TD}>
              <input type="text" bind:value={newColumn.columnDefault} placeholder="NULL"
                class="{INP} placeholder:text-muted-foreground/30" />
            </td>

            <!-- foreign_key (skip for new columns) -->
            <td class={TD}></td>

            <!-- comment -->
            <td class={TD}>
              <input type="text" bind:value={newColumn.comment} placeholder="—"
                class="{INP} italic placeholder:not-italic placeholder:text-muted-foreground/30" />
            </td>
          </tr>
        {/if}
      </tbody>
    </table>

    <!-- ── Column action bar ── -->
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
        <button type="button"
          class="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-ui-xs text-muted-foreground hover:bg-accent/20 hover:text-foreground"
          onclick={startNewColumn}>
          <Plus class="size-3" />Add column
        </button>
      {/if}
    </div>

    <!-- ── Index section ── -->
    <div class="border-t border-border font-mono">
      <div class="flex items-center gap-2 px-3 py-2">
        <span class="text-ui-2xs font-medium uppercase tracking-wide text-muted-foreground">Indexes</span>
        <button type="button" class="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-ui-xs text-muted-foreground hover:bg-accent/20 hover:text-foreground" onclick={startNewIndex}>
          <Plus class="size-3" />Add index
        </button>
      </div>

      <table class="border-collapse" style="table-layout: fixed; width: max-content; min-width: 100%">
        <colgroup>
          <col style="min-width:180px;width:200px" />
          <col style="min-width:110px;width:130px" />
          <col style="min-width:70px;width:80px" />
          <col style="min-width:150px;width:180px" />
          <col style="min-width:130px;width:160px" />
          <col style="min-width:150px;width:180px" />
          <col style="min-width:36px;width:36px;max-width:36px" />
        </colgroup>
        <thead>
          <tr>
            {#each ['index_name','index_algorithm','is_unique','column_name','condition','comment',''] as h}
              <th class="border-b border-r border-border bg-panel px-3 py-2 text-left font-medium text-muted-foreground text-ui-2xs uppercase tracking-wide whitespace-nowrap">{h}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each tableIndexes as idx (idx.name)}
            <tr class="group/idx" style="height:32px">

              <!-- index_name (read-only) -->
              <td class="border-b border-r border-border/40 px-3 font-mono text-ui-sm text-foreground overflow-hidden">{idx.name}</td>

              <!-- algorithm — dropdown (triggers DROP+CREATE confirm) -->
              <td class="border-b border-r border-border/40 p-0 align-middle overflow-hidden">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger class="group/alg flex h-full w-full cursor-pointer items-center gap-1 px-3 font-mono text-ui-sm uppercase text-foreground hover:bg-accent/20">
                    <span class="flex-1">{idx.indexType}</span>
                    <svg class="size-3 shrink-0 text-muted-foreground/30 opacity-0 group-hover/alg:opacity-100" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content class="w-44 [&_[data-slot=dropdown-menu-item]]:font-mono [&_[data-slot=dropdown-menu-item]]:text-ui-sm [&_[data-slot=dropdown-menu-item]]:px-3 [&_[data-slot=dropdown-menu-item]]:py-1.5" align="start" sideOffset={1}>
                    {#each INDEX_ALGORITHMS as alg (alg)}
                      <DropdownMenu.Item class="{alg.toLowerCase() === idx.indexType.toLowerCase() ? 'bg-accent/60' : ''}"
                        onSelect={() => { if (alg.toLowerCase() !== idx.indexType.toLowerCase()) requestIndexRecreate(idx, alg, idx.isUnique, idx.columns) }}
                      >{alg}</DropdownMenu.Item>
                    {/each}
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item class="text-muted-foreground" onSelect={() => { /* allow custom */ }}>Manual input…</DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </td>

              <!-- is_unique — select (triggers DROP+CREATE confirm) -->
              <td class="border-b border-r border-border/40 p-0 align-middle overflow-hidden">
                <div class="relative flex h-full items-center px-3">
                  <select
                    value={idx.isUnique ? 'TRUE' : 'FALSE'}
                    class="w-full appearance-none border-0 bg-transparent py-0 font-mono text-ui-sm focus:outline-none {idx.isUnique ? 'text-green-400' : 'text-muted-foreground'}"
                    onchange={(e) => {
                      const v = /** @type {HTMLSelectElement} */ (e.target).value === 'TRUE'
                      if (v !== idx.isUnique) requestIndexRecreate(idx, idx.indexType, v, idx.columns)
                    }}
                  >
                    <option value="FALSE">FALSE</option>
                    <option value="TRUE">TRUE</option>
                  </select>
                  <span class="pointer-events-none absolute right-1.5 text-muted-foreground/40">
                    <svg class="size-3.5" viewBox="0 0 10 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4.5l3-3 3 3M2 7.5l3 3 3-3"/></svg>
                  </span>
                </div>
              </td>

              <!-- columns — editable (triggers DROP+CREATE confirm on change) -->
              <td class="border-b border-r border-border/40 p-0 align-middle overflow-hidden">
                <input type="text"
                  value={idx.columns}
                  class="{INP} text-muted-foreground"
                  onblur={(e) => { const v = /** @type {HTMLInputElement} */ (e.target).value.trim(); if (v && v !== idx.columns) requestIndexRecreate(idx, idx.indexType, idx.isUnique, v) }}
                  onkeydown={(e) => { if (e.key === 'Enter') { const v = /** @type {HTMLInputElement} */ (e.currentTarget).value.trim(); if (v && v !== idx.columns) requestIndexRecreate(idx, idx.indexType, idx.isUnique, v); /** @type {HTMLElement} */ (e.currentTarget).blur() } if (e.key === 'Escape') /** @type {HTMLElement} */ (e.currentTarget).blur() }}
                />
              </td>

              <!-- condition (read-only display) -->
              <td class="border-b border-r border-border/40 px-3 font-mono text-ui-sm text-muted-foreground/50 overflow-hidden">
                <span class="truncate block">{idx.condition ?? 'EMPTY'}</span>
              </td>

              <!-- comment — editable -->
              <td class="border-b border-r border-border/40 p-0 align-middle overflow-hidden">
                <input type="text" value={idx.comment ?? ''} placeholder="NULL"
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
                      <DropdownMenu.Item class="{newIndex.algorithm === alg ? 'bg-accent' : ''}" onSelect={() => { if (newIndex) newIndex.algorithm = alg }}>{alg}</DropdownMenu.Item>
                    {/each}
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item class="text-muted-foreground" onSelect={() => { if (newIndex) newIndex.algorithm = '' }}>Manual input…</DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </td>
              <td class="border-b border-r border-green-700/20 p-0">
                <div class="relative flex h-full items-center px-3">
                  <select bind:value={newIndex.isUnique} class="w-full appearance-none border-0 bg-transparent py-0 font-mono text-ui-sm focus:outline-none {newIndex.isUnique ? 'text-green-400' : 'text-muted-foreground'}">
                    <option value={false}>FALSE</option>
                    <option value={true}>TRUE</option>
                  </select>
                  <span class="pointer-events-none absolute right-1.5 text-muted-foreground/40"><svg class="size-3.5" viewBox="0 0 10 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4.5l3-3 3 3M2 7.5l3 3 3-3"/></svg></span>
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
    </div>
  </div><!-- end inline-block wrapper -->
  </div><!-- end scroll container -->
</div>
