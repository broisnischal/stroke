<script>
  import { toast } from 'svelte-sonner'
  import { executeSql } from '$lib/api.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import DdlConfirmDialog from './DdlConfirmDialog.svelte'
  import Hash from '@lucide/svelte/icons/hash'
  import Loader from '@lucide/svelte/icons/loader'

  let {
    open = $bindable(false),
    schema = '',
    onrefresh = () => {},
  } = $props()

  const DATA_TYPES = ['bigint', 'integer', 'smallint']
  const DEFAULTS = {
    bigint:   { min: '1', max: '9223372036854775807' },
    integer:  { min: '1', max: '2147483647' },
    smallint: { min: '1', max: '32767' },
  }

  let name = $state('')
  let dataType = $state('bigint')
  let startValue = $state('1')
  let minValue = $state('1')
  let maxValue = $state('9223372036854775807')
  let increment = $state('1')
  let cycle = $state(false)
  let confirmOpen = $state(false)
  let saving = $state(false)

  $effect(() => {
    const d = DEFAULTS[/** @type {keyof typeof DEFAULTS} */ (dataType)]
    if (d) { minValue = d.min; maxValue = d.max }
  })

  const sql = $derived.by(() => {
    const n   = name.trim() || 'sequence_name'
    const inc = increment.trim() || '1'
    const start = startValue.trim() || '1'
    return `CREATE SEQUENCE "${schema}"."${n}"
  AS ${dataType}
  INCREMENT BY ${inc}
  MINVALUE ${minValue.trim()}
  MAXVALUE ${maxValue.trim()}
  START WITH ${start}
  ${cycle ? 'CYCLE' : 'NO CYCLE'};`
  })

  const isValid = $derived(name.trim().length > 0)

  function reset() {
    name = ''; dataType = 'bigint'
    startValue = '1'; minValue = '1'
    maxValue = '9223372036854775807'; increment = '1'; cycle = false
  }

  async function handleCreate() {
    saving = true
    try {
      await executeSql(sql)
      toast.success(`Sequence "${name.trim()}" created`)
      onrefresh(); reset(); open = false
    } catch (e) { toast.error(String(e))
    } finally { saving = false; confirmOpen = false }
  }

  const INP = 'h-8 w-full rounded-md border border-border/60 bg-muted/20 px-3 font-mono text-ui-sm outline-none placeholder:text-muted-foreground/35 focus:border-ring focus:bg-background focus:ring-1 focus:ring-ring/30 [appearance:none] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) reset() }}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="max-w-[480px] gap-0 overflow-hidden p-0 sm:rounded-xl">

      <div class="flex items-center gap-3 border-b border-border/60 px-5 py-4">
        <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Hash class="size-4 text-primary" />
        </div>
        <div class="min-w-0 flex-1">
          <Dialog.Title class="text-ui-sm font-semibold">Create Sequence</Dialog.Title>
          <p class="text-ui-xs text-muted-foreground">Auto-incrementing counter in <span class="font-mono">{schema}</span></p>
        </div>
        <Dialog.Close class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" />
      </div>

      <div class="app-scroll max-h-[72vh] overflow-y-auto">
        <div class="flex flex-col gap-4 px-5 py-5">

          <!-- Name + Data type -->
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1.5">
              <label for="seq-name" class="text-ui-xs font-medium text-muted-foreground">Sequence name</label>
              <input id="seq-name" type="text" bind:value={name} placeholder="user_id_seq" class={INP} />
            </div>
            <div class="flex flex-col gap-1.5">
              <p class="text-ui-xs font-medium text-muted-foreground">Data type</p>
              <div class="flex h-8 items-center rounded-md border border-border/50 bg-muted/30 p-0.5">
                {#each DATA_TYPES as t (t)}
                  <button type="button"
                    class="flex-1 rounded-[5px] font-mono text-[10px] font-medium transition-all {dataType === t ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50' : 'text-muted-foreground/65 hover:text-foreground'}"
                    onclick={() => (dataType = t)}>{t}</button>
                {/each}
              </div>
            </div>
          </div>

          <!-- Start + Increment -->
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1.5">
              <label for="seq-start" class="text-ui-xs font-medium text-muted-foreground">Start value</label>
              <input id="seq-start" type="text" inputmode="numeric" bind:value={startValue} class={INP} />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="seq-increment" class="text-ui-xs font-medium text-muted-foreground">Increment by</label>
              <input id="seq-increment" type="text" inputmode="numeric" bind:value={increment} class={INP} />
            </div>
          </div>

          <!-- Min + Max -->
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1.5">
              <label for="seq-min" class="text-ui-xs font-medium text-muted-foreground">Min value</label>
              <input id="seq-min" type="text" inputmode="numeric" bind:value={minValue} class={INP} />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="seq-max" class="text-ui-xs font-medium text-muted-foreground">Max value</label>
              <input id="seq-max" type="text" inputmode="numeric" bind:value={maxValue} class={INP} />
            </div>
          </div>

          <!-- Cycle -->
          <button type="button" role="checkbox" aria-checked={cycle}
            class="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/15 px-4 py-3 text-left transition-colors hover:bg-muted/25"
            onclick={() => (cycle = !cycle)}>
            <span class="flex size-4 shrink-0 items-center justify-center rounded border transition-colors {cycle ? 'border-primary bg-primary' : 'border-border/60 bg-background'}">
              {#if cycle}
                <svg class="size-2.5 text-primary-foreground" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 6l3 3 5-5"/></svg>
              {/if}
            </span>
            <div>
              <p class="text-ui-xs font-medium">Cycle</p>
              <p class="text-ui-xs text-muted-foreground/55">Restart from minimum when max is reached</p>
            </div>
          </button>

          <!-- SQL preview -->
          <div class="flex flex-col gap-1.5">
            <p class="text-ui-xs font-medium text-muted-foreground">SQL preview</p>
            <pre class="overflow-x-auto rounded-lg border border-border/40 bg-muted/15 px-4 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground/80 whitespace-pre">{sql}</pre>
          </div>

        </div>
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-border/50 px-5 py-3">
        <button type="button"
          class="inline-flex h-8 items-center rounded-lg border border-border/60 px-4 text-ui-xs text-muted-foreground transition-colors hover:bg-accent"
          onclick={() => { reset(); open = false }}>Cancel</button>
        <button type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-4 text-ui-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          disabled={!isValid || saving} onclick={() => (confirmOpen = true)}>
          {#if saving}<Loader class="size-3 animate-spin" />{/if}
          Create Sequence
        </button>
      </div>

    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<DdlConfirmDialog bind:open={confirmOpen} title="Create sequence"
  description="This will create the sequence in your database."
  {sql} confirmLabel="Create" loading={saving} onconfirm={handleCreate} />
