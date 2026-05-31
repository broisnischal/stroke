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

  const lbl = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/50'
  const inp = 'h-8 w-full rounded-lg border border-border/25 bg-muted/[0.4] px-3 font-mono text-[12px] text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-border/50 focus:ring-0'
  const sel = 'h-8 w-full appearance-none rounded-lg border border-border/25 bg-muted/[0.4] px-3 pr-7 font-mono text-[12px] text-foreground outline-none focus:border-border/50'
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
    <Dialog.Content showCloseButton={false} class="w-[min(440px,calc(100vw-2rem))] sm:max-w-none gap-0 overflow-hidden p-0">

      <!-- Header -->
      <div class="flex items-start gap-3.5 border-b border-border/25 px-5 pt-5 pb-4">
        <div class="mt-px flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted/50">
          <Link class="size-3.5 text-muted-foreground/70" />
        </div>
        <div class="min-w-0 flex-1">
          <Dialog.Title class="text-[13px] font-semibold text-foreground">
            {constraintName ? 'Edit foreign key' : 'Add foreign key'}
          </Dialog.Title>
          <p class="mt-0.5 font-mono text-[11px] text-muted-foreground/60">
            {table}.<span class="text-foreground/70">{column}</span>
          </p>
        </div>
        <Dialog.Close class="inline-flex size-6 items-center justify-center rounded-lg text-muted-foreground/30 transition-colors hover:bg-muted/50 hover:text-muted-foreground focus-visible:outline-none" />
      </div>

      <!-- Body -->
      <div class="flex flex-col gap-4 px-5 py-4">

        <!-- FK path -->
        <div class="flex items-center gap-2 rounded-xl border border-border/20 bg-muted/[0.2] px-3.5 py-2.5">
          <span class="font-mono text-[12px]">
            <span class="text-muted-foreground/40">{schema}.</span><span class="text-foreground/70">{table}</span>.<span class="font-semibold text-foreground">{column}</span>
          </span>
          <ArrowRight class="size-3 shrink-0 text-muted-foreground/30" />
          {#if refTable && refColumn}
            <span class="font-mono text-[12px]">
              <span class="text-muted-foreground/40">{schema}.</span><span class="text-foreground/70">{refTable}</span>.<span class="font-semibold text-blue-400">{refColumn}</span>
            </span>
          {:else}
            <span class="font-mono text-[11px] text-muted-foreground/30">select table and column</span>
          {/if}
        </div>

        <!-- Referenced table + column -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="fk-ref-table" class={lbl}>Referenced table</label>
            <div class="relative">
              <select id="fk-ref-table" bind:value={refTable} class={sel}>
                <option value="">Select table…</option>
                {#each tables as t (t.name)}<option value={t.name}>{t.name}</option>{/each}
              </select>
              <span class="pointer-events-none absolute inset-y-0 right-2 flex items-center text-muted-foreground/35">
                <svg class="size-3" viewBox="0 0 10 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4.5l3-3 3 3M2 7.5l3 3 3-3"/></svg>
              </span>
            </div>
          </div>
          <div>
            <label for="fk-ref-col" class={lbl}>Referenced column</label>
            <input id="fk-ref-col" type="text" bind:value={refColumn} placeholder="id" class={inp} />
          </div>
        </div>

        <!-- ON UPDATE + ON DELETE -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <p class={lbl}>On update</p>
            <div class="flex flex-wrap gap-1">
              {#each FK_ACTIONS as a (a)}
                <button type="button"
                  class="rounded-md px-2 py-0.5 font-mono text-[10px] font-medium transition-colors {onUpdate === a
                    ? 'bg-muted/70 text-foreground ring-1 ring-border/50'
                    : 'text-muted-foreground/45 hover:bg-muted/40 hover:text-foreground'}"
                  onclick={() => (onUpdate = a)}
                >{a}</button>
              {/each}
            </div>
          </div>
          <div>
            <p class={lbl}>On delete</p>
            <div class="flex flex-wrap gap-1">
              {#each FK_ACTIONS as a (a)}
                <button type="button"
                  class="rounded-md px-2 py-0.5 font-mono text-[10px] font-medium transition-colors {onDelete === a
                    ? 'bg-destructive/10 text-destructive ring-1 ring-destructive/20'
                    : 'text-muted-foreground/45 hover:bg-muted/40 hover:text-foreground'}"
                  onclick={() => (onDelete = a)}
                >{a}</button>
              {/each}
            </div>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-2 border-t border-border/25 px-5 py-3">
        {#if constraintName}
          <button type="button" disabled={deleting || saving}
            class="mr-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-[13px] text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
            onclick={() => (dropConfirmOpen = true)}>
            {#if deleting}<Loader class="size-3 animate-spin" />{/if}
            Remove FK
          </button>
        {/if}
        <button type="button"
          class="inline-flex h-8 items-center rounded-lg px-3.5 text-[13px] text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
          onclick={() => (open = false)}>Cancel</button>
        <button type="button" disabled={!isValid || saving || deleting}
          class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-40"
          onclick={handleSave}>
          {#if saving}<Loader class="size-3 animate-spin" />{/if}
          {constraintName ? 'Update FK' : 'Add FK'}
        </button>
      </div>

    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
