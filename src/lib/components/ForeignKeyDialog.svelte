<script>
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { toast } from 'svelte-sonner'
  import { executeSql } from '$lib/api.js'
  import Loader from '@lucide/svelte/icons/loader'
  import Link from '@lucide/svelte/icons/link'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import DdlConfirmDialog from './DdlConfirmDialog.svelte'

  /** @typedef {'NO ACTION'|'CASCADE'|'SET NULL'|'SET DEFAULT'|'RESTRICT'} FkAction */

  const FK_ACTIONS = /** @type {FkAction[]} */ (['NO ACTION', 'CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT'])

  let {
    open = $bindable(false),
    schema = '',
    table = '',
    column = '',
    constraintName = /** @type {string|null} */ (null),
    existingFk = /** @type {string|null} */ (null),
    tables = /** @type {{ name: string }[]} */ ([]),
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

  const isValid = $derived(refTable.trim().length > 0 && refColumn.trim().length > 0)

  async function handleSave() {
    if (!isValid) { toast.error('Referenced table and column are required'); return }
    saving = true
    try {
      if (constraintName) {
        await executeSql(`ALTER TABLE "${schema}"."${table}" DROP CONSTRAINT "${constraintName}"`)
      }
      const name = constraintName ?? `fk_${table}_${column}`
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

  const SEL = 'h-8 w-full appearance-none rounded-md border border-border/60 bg-muted/20 px-3 pr-7 font-mono text-ui-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/30'
  const INP = 'h-8 w-full rounded-md border border-border/60 bg-muted/20 px-3 font-mono text-ui-xs text-foreground placeholder:text-muted-foreground/35 outline-none focus:border-ring focus:ring-1 focus:ring-ring/30'
</script>

<DdlConfirmDialog
  bind:open={dropConfirmOpen}
  title="Remove foreign key"
  description="Removes the foreign key constraint. Referential integrity will no longer be enforced."
  sql={constraintName ? `ALTER TABLE "${schema}"."${table}" DROP CONSTRAINT "${constraintName}"` : ''}
  confirmLabel="Remove FK"
  variant="destructive"
  loading={deleting}
  onconfirm={executeDrop}
/>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="max-w-[420px] gap-0 overflow-hidden p-0 sm:rounded-xl">

      <!-- Header -->
      <div class="flex items-center gap-3 border-b border-border/60 px-5 py-4">
        <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Link class="size-4 text-primary" />
        </div>
        <div class="min-w-0 flex-1">
          <Dialog.Title class="text-ui-sm font-semibold">
            {constraintName ? 'Edit foreign key' : 'Add foreign key'}
          </Dialog.Title>
          <p class="font-mono text-ui-xs text-muted-foreground">
            <span class="text-foreground/70">{table}</span>.<span class="text-primary/80">{column}</span>
          </p>
        </div>
        <Dialog.Close class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" />
      </div>

      <!-- Body -->
      <div class="flex flex-col gap-4 px-5 py-5">

        <!-- FK path visualisation -->
        <div class="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/15 px-4 py-3">
          <span class="font-mono text-ui-xs">
            <span class="text-muted-foreground/60">{schema}.</span><span class="text-foreground/80">{table}</span>.<span class="font-semibold text-primary">{column}</span>
          </span>
          <ArrowRight class="size-3.5 shrink-0 text-muted-foreground/40" />
          {#if refTable && refColumn}
            <span class="font-mono text-ui-xs">
              <span class="text-muted-foreground/60">{schema}.</span><span class="text-foreground/80">{refTable}</span>.<span class="font-semibold text-blue-400">{refColumn}</span>
            </span>
          {:else}
            <span class="font-mono text-ui-xs text-muted-foreground/35">select table and column →</span>
          {/if}
        </div>

        <!-- Referenced table + column -->
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="fk-ref-table" class="text-ui-xs font-medium text-muted-foreground">Referenced table</label>
            <div class="relative">
              <select id="fk-ref-table" bind:value={refTable} class={SEL}>
                <option value="">Select table…</option>
                {#each tables as t (t.name)}
                  <option value={t.name}>{t.name}</option>
                {/each}
              </select>
              <span class="pointer-events-none absolute inset-y-0 right-2 flex items-center text-muted-foreground/40">
                <svg class="size-3.5" viewBox="0 0 10 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4.5l3-3 3 3M2 7.5l3 3 3-3"/></svg>
              </span>
            </div>
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="fk-ref-col" class="text-ui-xs font-medium text-muted-foreground">Referenced column</label>
            <input id="fk-ref-col" type="text" bind:value={refColumn} placeholder="id" class={INP} />
          </div>
        </div>

        <!-- ON UPDATE + ON DELETE -->
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <p class="text-ui-xs font-medium text-muted-foreground">On update</p>
            <div class="flex flex-wrap gap-1">
              {#each FK_ACTIONS as a (a)}
                <button
                  type="button"
                  class="rounded px-2 py-0.5 font-mono text-[10px] font-medium transition-colors {onUpdate === a ? 'bg-primary/15 text-primary ring-1 ring-primary/30' : 'bg-muted/30 text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground'}"
                  onclick={() => (onUpdate = a)}
                >{a}</button>
              {/each}
            </div>
          </div>
          <div class="flex flex-col gap-1.5">
            <p class="text-ui-xs font-medium text-muted-foreground">On delete</p>
            <div class="flex flex-wrap gap-1">
              {#each FK_ACTIONS as a (a)}
                <button
                  type="button"
                  class="rounded px-2 py-0.5 font-mono text-[10px] font-medium transition-colors {onDelete === a ? 'bg-destructive/15 text-destructive ring-1 ring-destructive/30' : 'bg-muted/30 text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground'}"
                  onclick={() => (onDelete = a)}
                >{a}</button>
              {/each}
            </div>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-2 border-t border-border/50 px-5 py-3">
        {#if constraintName}
          <button
            type="button"
            disabled={deleting || saving}
            class="mr-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-destructive/30 px-3 text-ui-xs text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
            onclick={() => (dropConfirmOpen = true)}
          >
            {#if deleting}<Loader class="size-3 animate-spin" />{/if}
            Remove FK
          </button>
        {/if}
        <button
          type="button"
          class="inline-flex h-8 items-center rounded-lg border border-border/60 px-4 text-ui-xs text-muted-foreground transition-colors hover:bg-accent"
          onclick={() => (open = false)}
        >Cancel</button>
        <button
          type="button"
          disabled={!isValid || saving || deleting}
          class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-4 text-ui-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          onclick={handleSave}
        >
          {#if saving}<Loader class="size-3 animate-spin" />{/if}
          {constraintName ? 'Update' : 'Add FK'}
        </button>
      </div>

    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
