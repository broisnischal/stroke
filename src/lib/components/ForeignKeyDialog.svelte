<script>
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { toast } from 'svelte-sonner'
  import { executeSql } from '$lib/api.js'
  import Loader from '@lucide/svelte/icons/loader'
  import X from '@lucide/svelte/icons/x'
  import DdlConfirmDialog from './DdlConfirmDialog.svelte'

  /** @typedef {'NO ACTION'|'CASCADE'|'SET NULL'|'SET DEFAULT'|'RESTRICT'} FkAction */

  const FK_ACTIONS = /** @type {FkAction[]} */ (['NO ACTION', 'CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT'])

  let {
    open = $bindable(false),
    schema = '',
    table = '',
    /** Pre-selected column (the column the FK is on) */
    column = '',
    /** Existing constraint name — when set, shows Delete button */
    constraintName = /** @type {string|null} */ (null),
    /** Existing FK target like "public.offer.id" */
    existingFk = /** @type {string|null} */ (null),
    /** All tables in the schema for the referenced-table dropdown */
    tables = /** @type {{ name: string }[]} */ ([]),
    onclose = () => {},
    onrefresh = () => {},
  } = $props()

  /** @type {FkAction} */
  let onUpdate = $state('NO ACTION')
  /** @type {FkAction} */
  let onDelete = $state('NO ACTION')
  let refTable = $state('')
  let refColumn = $state('')
  let saving = $state(false)
  let deleting = $state(false)

  // Parse existing FK on open
  $effect(() => {
    if (!open) return
    if (existingFk) {
      const parts = existingFk.split('.')
      refTable = parts[1] ?? ''
      refColumn = parts[2] ?? ''
    } else {
      refTable = ''
      refColumn = ''
    }
    onUpdate = 'NO ACTION'
    onDelete = 'NO ACTION'
  })

  function constraintNameFor() {
    return `fk_${table}_${column}`
  }

  async function handleSave() {
    if (!refTable || !refColumn) {
      toast.error('Referenced table and column are required')
      return
    }
    saving = true
    try {
      // Drop existing FK first if editing
      if (constraintName) {
        await executeSql(`ALTER TABLE "${schema}"."${table}" DROP CONSTRAINT "${constraintName}"`)
      }
      const name = constraintName ?? constraintNameFor()
      await executeSql(
        `ALTER TABLE "${schema}"."${table}" ADD CONSTRAINT "${name}" ` +
        `FOREIGN KEY ("${column}") REFERENCES "${schema}"."${refTable}" ("${refColumn}") ` +
        `ON UPDATE ${onUpdate} ON DELETE ${onDelete}`
      )
      toast.success('Foreign key saved')
      open = false
      onrefresh()
    } catch (e) {
      toast.error('Failed to save foreign key', { description: String(e) })
    } finally {
      saving = false
    }
  }

  let dropConfirmOpen = $state(false)

  function handleDelete() {
    if (!constraintName) return
    dropConfirmOpen = true
  }

  async function executeDrop() {
    if (!constraintName) return
    deleting = true
    try {
      await executeSql(`ALTER TABLE "${schema}"."${table}" DROP CONSTRAINT "${constraintName}"`)
      toast.success('Foreign key removed')
      open = false
      onrefresh()
    } catch (e) {
      toast.error('Failed to remove foreign key', { description: String(e) })
    } finally {
      deleting = false
    }
  }

  const selectCls = 'w-full rounded-md border border-border bg-muted/20 px-3 py-2 font-mono text-ui-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none'
  const inputCls = 'w-full rounded-md border border-border bg-muted/20 px-3 py-2 font-mono text-ui-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring'
  const labelCls = 'text-ui-xs text-muted-foreground w-36 shrink-0'
</script>

<DdlConfirmDialog
  bind:open={dropConfirmOpen}
  title="Drop foreign key"
  description="Remove the foreign key constraint from this column. Referential integrity will no longer be enforced."
  sql={constraintName ? `ALTER TABLE "${schema}"."${table}" DROP CONSTRAINT "${constraintName}"` : ''}
  confirmLabel="Drop FK"
  variant="destructive"
  loading={deleting}
  onconfirm={executeDrop}
/>

<Dialog.Root bind:open>
  <Dialog.Content class="w-[440px] max-w-full gap-0 p-0">
    <Dialog.Header class="border-b border-border px-5 py-4">
      <Dialog.Title class="text-ui-sm font-medium">
        {constraintName ? 'Edit Foreign Key' : 'Add Foreign Key'}
      </Dialog.Title>
    </Dialog.Header>

    <div class="flex flex-col gap-4 px-5 py-5">
      <!-- Table (read-only) -->
      <div class="flex items-center gap-3">
        <span class={labelCls}>Table</span>
        <div class="flex-1 rounded-md border border-border/50 bg-muted/10 px-3 py-2 font-mono text-ui-xs text-muted-foreground">{table}</div>
      </div>

      <!-- Column (read-only chip) -->
      <div class="flex items-center gap-3">
        <span class={labelCls}>Column</span>
        <div class="flex flex-1 flex-wrap gap-1.5">
          <span class="inline-flex items-center gap-1 rounded bg-primary/20 px-2 py-0.5 font-mono text-ui-xs text-primary">{column}</span>
        </div>
      </div>

      <!-- Referenced Table -->
      <div class="flex items-center gap-3">
        <span class={labelCls}>Referenced Table</span>
        <div class="relative flex-1">
          <select bind:value={refTable} class={selectCls}>
            <option value="">Select a table…</option>
            {#each tables as t (t.name)}
              <option value={t.name}>{t.name}</option>
            {/each}
          </select>
          <span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50">
            <svg class="size-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg>
          </span>
        </div>
      </div>

      <!-- Referenced Column -->
      <div class="flex items-center gap-3">
        <span class={labelCls}>Referenced Column</span>
        <input
          type="text"
          bind:value={refColumn}
          placeholder="Column name…"
          class="{inputCls} flex-1"
        />
      </div>

      <!-- On Update -->
      <div class="flex items-center gap-3">
        <span class={labelCls}>On Update</span>
        <div class="relative flex-1">
          <select bind:value={onUpdate} class={selectCls}>
            {#each FK_ACTIONS as a (a)}
              <option value={a}>{a}</option>
            {/each}
          </select>
          <span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50">
            <svg class="size-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg>
          </span>
        </div>
      </div>

      <!-- On Delete -->
      <div class="flex items-center gap-3">
        <span class={labelCls}>On Delete</span>
        <div class="relative flex-1">
          <select bind:value={onDelete} class={selectCls}>
            {#each FK_ACTIONS as a (a)}
              <option value={a}>{a}</option>
            {/each}
          </select>
          <span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50">
            <svg class="size-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg>
          </span>
        </div>
      </div>
    </div>

    <div class="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
      {#if constraintName}
        <button
          type="button"
          disabled={deleting || saving}
          class="mr-auto rounded-md border border-destructive/40 px-4 py-1.5 font-mono text-ui-xs text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          onclick={handleDelete}
        >
          {#if deleting}<Loader class="mr-1.5 inline size-3 animate-spin" />{/if}
          Delete
        </button>
      {/if}
      <button
        type="button"
        class="rounded-md border border-border px-4 py-1.5 font-mono text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onclick={() => (open = false)}
      >Cancel</button>
      <button
        type="button"
        disabled={saving || deleting}
        class="rounded-md bg-primary px-4 py-1.5 font-mono text-ui-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        onclick={handleSave}
      >
        {#if saving}<Loader class="mr-1.5 inline size-3 animate-spin" />{/if}
        OK
      </button>
    </div>
  </Dialog.Content>
</Dialog.Root>
