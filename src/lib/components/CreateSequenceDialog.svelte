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

  const lbl = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/50'
  const inp = 'h-8 w-full rounded-lg border border-border/25 bg-muted/[0.4] px-3 font-mono text-[12px] outline-none placeholder:text-muted-foreground/30 focus:border-border/50 focus:ring-0 [appearance:none] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) reset() }}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content showCloseButton={false} class="w-[min(480px,calc(100vw-2rem))] sm:max-w-none gap-0 overflow-hidden p-0">

      <!-- Header -->
      <div class="flex items-start gap-3.5 border-b border-border/25 px-5 pt-5 pb-4">
        <div class="mt-px flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted/50">
          <Hash class="size-3.5 text-muted-foreground/70" />
        </div>
        <div class="min-w-0 flex-1">
          <Dialog.Title class="text-[13px] font-semibold text-foreground">Create Sequence</Dialog.Title>
          <p class="mt-0.5 text-[11px] text-muted-foreground/60">Auto-incrementing counter in <span class="font-mono">{schema}</span></p>
        </div>
        <Dialog.Close class="inline-flex size-6 items-center justify-center rounded-lg text-muted-foreground/30 transition-colors hover:bg-muted/50 hover:text-muted-foreground focus-visible:outline-none" />
      </div>

      <div class="app-scroll max-h-[72vh] overflow-y-auto">
        <div class="flex flex-col gap-4 px-5 py-4">

          <!-- Name + Data type -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="seq-name" class={lbl}>Sequence name</label>
              <input id="seq-name" type="text" bind:value={name} placeholder="user_id_seq" class={inp} />
            </div>
            <div>
              <p class={lbl}>Data type</p>
              <div class="flex gap-0.5 rounded-lg border border-border/25 bg-muted/[0.3] p-0.5">
                {#each DATA_TYPES as t (t)}
                  <button type="button"
                    class="flex flex-1 items-center justify-center rounded-md px-1.5 py-1.5 font-mono text-[10px] font-medium transition-all {dataType === t
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border/30'
                      : 'text-muted-foreground/50 hover:text-foreground'}"
                    onclick={() => (dataType = t)}>{t}</button>
                {/each}
              </div>
            </div>
          </div>

          <!-- Start + Increment -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="seq-start" class={lbl}>Start value</label>
              <input id="seq-start" type="text" inputmode="numeric" bind:value={startValue} class={inp} />
            </div>
            <div>
              <label for="seq-increment" class={lbl}>Increment by</label>
              <input id="seq-increment" type="text" inputmode="numeric" bind:value={increment} class={inp} />
            </div>
          </div>

          <!-- Min + Max -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="seq-min" class={lbl}>Min value</label>
              <input id="seq-min" type="text" inputmode="numeric" bind:value={minValue} class={inp} />
            </div>
            <div>
              <label for="seq-max" class={lbl}>Max value</label>
              <input id="seq-max" type="text" inputmode="numeric" bind:value={maxValue} class={inp} />
            </div>
          </div>

          <!-- Cycle toggle -->
          <button type="button" role="checkbox" aria-checked={cycle}
            class="flex cursor-pointer items-center gap-3 rounded-xl border border-border/20 bg-muted/[0.15] px-4 py-3 text-left transition-colors hover:bg-muted/25"
            onclick={() => (cycle = !cycle)}>
            <span class="flex size-4 shrink-0 items-center justify-center rounded border transition-all {cycle ? 'border-foreground bg-foreground' : 'border-border/40 bg-transparent'}">
              {#if cycle}
                <svg class="size-2.5 text-background" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 6l3 3 5-5"/></svg>
              {/if}
            </span>
            <div>
              <p class="text-[12px] font-medium text-foreground">Cycle</p>
              <p class="mt-0.5 text-[11px] text-muted-foreground/55">Restart from minimum when max is reached</p>
            </div>
          </button>

          <!-- SQL preview -->
          <div>
            <p class="{lbl} mb-2">SQL preview</p>
            <pre class="overflow-x-auto rounded-xl border border-border/20 bg-muted/[0.15] px-4 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground/70 whitespace-pre">{sql}</pre>
          </div>

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
          Create Sequence
        </button>
      </div>

    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<DdlConfirmDialog bind:open={confirmOpen} title="Create sequence"
  description="This will create the sequence in your database."
  {sql} confirmLabel="Create" loading={saving} onconfirm={handleCreate} />
