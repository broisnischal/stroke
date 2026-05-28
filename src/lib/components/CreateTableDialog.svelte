<script>
  import { toast } from 'svelte-sonner'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import Plus from '@lucide/svelte/icons/plus'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import GripVertical from '@lucide/svelte/icons/grip-vertical'
  import { cn } from '$lib/utils.js'

  let {
    open = $bindable(false),
    activeSchema = 'public',
    /** 'postgres' | 'sqlite' | 'mysql' | 'd1' */
    dbType = 'postgres',
    saving = false,
    /** @param {string} sql */
    onexecute = /** @type {(sql: string) => Promise<void>} */ (async () => {}),
    /** @param {string} tableName */
    oncreated = /** @type {(name: string) => void} */ (() => {}),
  } = $props()

  /**
   * @typedef {{ id: string, name: string, type: string, pk: boolean, notNull: boolean, defaultVal: string }} ColDef
   */

  const PG_TYPES = ['serial', 'bigserial', 'integer', 'bigint', 'text', 'varchar(255)', 'boolean', 'numeric', 'float8', 'timestamptz', 'date', 'uuid', 'jsonb', 'bytea']
  const SQLITE_TYPES = ['INTEGER', 'TEXT', 'REAL', 'NUMERIC', 'BLOB']
  const MYSQL_TYPES = ['INT', 'BIGINT', 'VARCHAR(255)', 'TEXT', 'TINYINT(1)', 'FLOAT', 'DECIMAL(10,2)', 'DATETIME', 'DATE', 'JSON']

  const typeOptions = $derived(
    dbType === 'sqlite' || dbType === 'd1' ? SQLITE_TYPES :
    dbType === 'mysql' ? MYSQL_TYPES :
    PG_TYPES
  )

  const defaultIdType = $derived(
    dbType === 'sqlite' || dbType === 'd1' ? 'INTEGER' :
    dbType === 'mysql' ? 'INT' :
    'serial'
  )

  const defaultIdExtra = $derived(
    dbType === 'mysql' ? 'AUTO_INCREMENT' : ''
  )

  function makeDefaultCols() {
    /** @type {ColDef[]} */
    const cols = [
      { id: crypto.randomUUID(), name: 'id', type: defaultIdType, pk: true, notNull: true, defaultVal: defaultIdExtra },
    ]
    if (dbType === 'postgres') {
      cols.push({ id: crypto.randomUUID(), name: 'created_at', type: 'timestamptz', pk: false, notNull: true, defaultVal: 'NOW()' })
    }
    return cols
  }

  let tableName = $state('')
  let submitting = $state(false)
  let /** @type {ColDef[]} */ cols = $state(makeDefaultCols())

  $effect(() => {
    if (!open) {
      tableName = ''
      cols = makeDefaultCols()
      submitting = false
    }
  })

  function addCol() {
    const defaultType = typeOptions[typeOptions.length > 4 ? 4 : 0]
    cols = [...cols, { id: crypto.randomUUID(), name: '', type: defaultType, pk: false, notNull: false, defaultVal: '' }]
  }

  function removeCol(/** @type {string} */ id) {
    cols = cols.filter(c => c.id !== id)
  }

  /** @param {string} id @param {Partial<ColDef>} patch */
  function patchCol(id, patch) {
    cols = cols.map(c => c.id === id ? { ...c, ...patch } : c)
  }

  const sql = $derived.by(() => {
    const name = tableName.trim()
    if (!name) return ''
    const schema = activeSchema || 'public'
    const validCols = cols.filter(c => c.name.trim())
    if (!validCols.length) return ''

    const pkCols = validCols.filter(c => c.pk)
    const isSerial = (type) => type === 'serial' || type === 'bigserial'

    const lines = validCols.map(c => {
      const isAuto = isSerial(c.type) || c.defaultVal.trim().toUpperCase() === 'AUTO_INCREMENT'
      let def = `  "${c.name.trim()}" ${c.type}`
      if (c.defaultVal.trim() && c.defaultVal.trim().toUpperCase() !== 'AUTO_INCREMENT') {
        def += ` DEFAULT ${c.defaultVal.trim()}`
      }
      if (isAuto && dbType === 'mysql') def += ' AUTO_INCREMENT'
      if (pkCols.length === 1 && c.pk && dbType !== 'sqlite') def += ' PRIMARY KEY'
      if (c.notNull && !isAuto) def += ' NOT NULL'
      if (dbType === 'sqlite' && c.pk) def += ' PRIMARY KEY'
      return def
    })

    if (pkCols.length > 1 && dbType !== 'sqlite') {
      lines.push(`  PRIMARY KEY (${pkCols.map(c => `"${c.name.trim()}"`).join(', ')})`)
    }

    if (dbType === 'sqlite' || dbType === 'd1') {
      return `CREATE TABLE "${name}" (\n${lines.join(',\n')}\n);`
    }
    if (dbType === 'mysql') {
      return `CREATE TABLE \`${schema}\`.\`${name}\` (\n${lines.join(',\n')}\n);`
    }
    return `CREATE TABLE "${schema}"."${name}" (\n${lines.join(',\n')}\n);`
  })

  const canSubmit = $derived(
    tableName.trim().length > 0 &&
    cols.some(c => c.name.trim().length > 0) &&
    !submitting &&
    !saving
  )

  async function handleCreate() {
    if (!canSubmit || !sql) return
    submitting = true
    try {
      await onexecute(sql)
      toast.success(`Table "${tableName.trim()}" created`)
      oncreated(tableName.trim())
      open = false
    } catch (err) {
      toast.error('Failed to create table', { description: String(err) })
    } finally {
      submitting = false
    }
  }

  const inputClass = 'h-7 w-full min-w-0 rounded border border-border bg-background/60 px-2 font-mono text-ui-sm text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring/30'
  const selectClass = 'h-7 w-full min-w-0 cursor-pointer appearance-none rounded border border-border bg-background/60 px-2 font-mono text-ui-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring/30'
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
    <Dialog.Header class="shrink-0 border-b border-border px-5 pt-5 pb-4">
      <Dialog.Title class="text-base">New table</Dialog.Title>
      <Dialog.Description class="text-ui-sm text-muted-foreground">
        {#if dbType !== 'sqlite' && dbType !== 'd1'}
          Schema: <span class="font-mono">{activeSchema}</span>
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
      <!-- Table name -->
      <div class="flex flex-col gap-1.5">
        <label class="text-ui-xs font-medium text-muted-foreground" for="create-table-name">Table name</label>
        <input
          id="create-table-name"
          class={cn(inputClass, 'h-8 text-sm')}
          placeholder="e.g. users"
          bind:value={tableName}
          onkeydown={(e) => e.key === 'Enter' && handleCreate()}
          autocomplete="off"
          spellcheck="false"
        />
      </div>

      <!-- Columns -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <span class="text-ui-xs font-medium text-muted-foreground">Columns</span>
          <span class="font-mono text-ui-2xs text-muted-foreground/50">{cols.filter(c => c.name.trim()).length}</span>
        </div>

        <!-- Column header -->
        <div class="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_2rem_2rem_minmax(0,1fr)_1.5rem] items-center gap-x-1.5 px-1">
          <span class="text-ui-2xs text-muted-foreground/60">Name</span>
          <span class="text-ui-2xs text-muted-foreground/60">Type</span>
          <span class="text-center text-ui-2xs text-muted-foreground/60">PK</span>
          <span class="text-center text-ui-2xs text-muted-foreground/60">NN</span>
          <span class="text-ui-2xs text-muted-foreground/60">Default</span>
          <span></span>
        </div>

        <!-- Column rows -->
        <div class="flex flex-col gap-1">
          {#each cols as col (col.id)}
            <div class="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_2rem_2rem_minmax(0,1fr)_1.5rem] items-center gap-x-1.5">
              <input
                class={inputClass}
                placeholder="column_name"
                bind:value={col.name}
                autocomplete="off"
                spellcheck="false"
              />
              <select
                class={selectClass}
                bind:value={col.type}
              >
                {#each typeOptions as t (t)}
                  <option value={t}>{t}</option>
                {/each}
              </select>
              <div class="flex justify-center">
                <input
                  type="checkbox"
                  class="size-3.5 cursor-pointer accent-primary"
                  checked={col.pk}
                  onchange={() => patchCol(col.id, { pk: !col.pk })}
                  title="Primary key"
                />
              </div>
              <div class="flex justify-center">
                <input
                  type="checkbox"
                  class="size-3.5 cursor-pointer accent-primary"
                  checked={col.notNull}
                  onchange={() => patchCol(col.id, { notNull: !col.notNull })}
                  title="Not null"
                />
              </div>
              <input
                class={inputClass}
                placeholder="optional"
                bind:value={col.defaultVal}
                autocomplete="off"
                spellcheck="false"
              />
              <button
                type="button"
                class="flex size-6 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
                onclick={() => removeCol(col.id)}
                title="Remove column"
                disabled={cols.length === 1}
              >
                <Trash2 class="size-3" />
              </button>
            </div>
          {/each}
        </div>

        <button
          type="button"
          class="mt-0.5 flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onclick={addCol}
        >
          <Plus class="size-3" />
          Add column
        </button>
      </div>

      <!-- SQL preview -->
      {#if sql}
        <div class="flex flex-col gap-1.5">
          <span class="text-ui-xs font-medium text-muted-foreground/60">SQL preview</span>
          <pre class="overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-all">{sql}</pre>
        </div>
      {/if}
    </div>

    <div class="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
      <button
        type="button"
        class="rounded-md px-3 py-1.5 text-ui-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onclick={() => (open = false)}
      >
        Cancel
      </button>
      <button
        type="button"
        class="rounded-md bg-primary px-4 py-1.5 text-ui-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
        disabled={!canSubmit}
        onclick={handleCreate}
      >
        {submitting ? 'Creating…' : 'Create table'}
      </button>
    </div>
  </Dialog.Content>
</Dialog.Root>
