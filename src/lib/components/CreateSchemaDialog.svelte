<script>
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import DdlConfirmDialog from './DdlConfirmDialog.svelte'
  import Box from '@lucide/svelte/icons/box'
  import Loader from '@lucide/svelte/icons/loader'

  let {
    open = $bindable(false),
    /** Existing schema names — used to flag duplicates. @type {string[]} */
    existingSchemas = [],
    /** Run the DDL against the database. @type {(sql: string) => Promise<unknown>} */
    onexecute = async () => {},
    /** Called after a successful create with the new schema name. @type {(name: string) => void | Promise<void>} */
    oncreated = async () => {},
  } = $props()

  let name = $state('')
  let confirmOpen = $state(false)
  let saving = $state(false)

  const trimmed = $derived(name.trim())
  const duplicate = $derived(existingSchemas.includes(trimmed))
  const hasQuote = $derived(trimmed.includes('"'))
  const isValid = $derived(trimmed.length > 0 && !duplicate && !hasQuote)

  const sql = $derived(`CREATE SCHEMA "${trimmed || 'schema_name'}";`)

  function reset() {
    name = ''
  }

  async function handleCreate() {
    saving = true
    try {
      await onexecute(sql)
      const created = trimmed
      reset()
      open = false
      await oncreated(created)
    } catch (e) {
      // onexecute surfaces its own toast on failure
    } finally {
      saving = false
      confirmOpen = false
    }
  }

  const lbl = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/50'
  const inp = 'h-8 w-full rounded-lg border border-border/25 bg-muted/[0.4] px-3 font-mono text-[12px] outline-none placeholder:text-muted-foreground/30 focus:border-border/50 focus:ring-0'
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) reset() }}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content showCloseButton={false} class="w-[min(440px,calc(100vw-2rem))] sm:max-w-none gap-0 overflow-hidden p-0">

      <!-- Header -->
      <div class="flex items-start gap-3.5 border-b border-border/25 px-5 pt-5 pb-4">
        <div class="mt-px flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted/50">
          <Box class="size-3.5 text-muted-foreground/70" />
        </div>
        <div class="min-w-0 flex-1">
          <Dialog.Title class="text-[13px] font-semibold text-foreground">Create Schema</Dialog.Title>
          <p class="mt-0.5 text-[11px] text-muted-foreground/60">A namespace for tables, views and functions</p>
        </div>
        <Dialog.Close class="inline-flex size-6 items-center justify-center rounded-lg text-muted-foreground/30 transition-colors hover:bg-muted/50 hover:text-muted-foreground focus-visible:outline-none" />
      </div>

      <div class="flex flex-col gap-4 px-5 py-4">
        <div>
          <label for="schema-name" class={lbl}>Schema name</label>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            id="schema-name"
            type="text"
            autofocus
            bind:value={name}
            placeholder="analytics"
            class={inp}
            onkeydown={(e) => { if (e.key === 'Enter' && isValid) confirmOpen = true }}
          />
          {#if duplicate}
            <p class="mt-1.5 text-[11px] text-destructive">A schema named <span class="font-mono">{trimmed}</span> already exists</p>
          {:else if hasQuote}
            <p class="mt-1.5 text-[11px] text-destructive">Name can't contain double quotes</p>
          {/if}
        </div>

        <div>
          <p class="{lbl} mb-2">SQL preview</p>
          <pre class="overflow-x-auto rounded-xl border border-border/20 bg-muted/[0.15] px-4 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground/70 whitespace-pre">{sql}</pre>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-2 border-t border-border/25 px-5 py-3">
        <button type="button"
          class="inline-flex h-8 items-center rounded-lg px-3.5 text-[13px] text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
          onclick={() => { reset(); open = false }}>Cancel</button>
        <button type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-40"
          disabled={!isValid || saving}
          onclick={() => (confirmOpen = true)}>
          {#if saving}<Loader class="size-3 animate-spin" />{/if}
          Create Schema
        </button>
      </div>

    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<DdlConfirmDialog bind:open={confirmOpen} title="Create schema"
  description="This will create a new schema in your database."
  {sql} confirmLabel="Create" loading={saving} onconfirm={handleCreate} />
