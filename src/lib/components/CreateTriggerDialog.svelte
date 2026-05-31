<script>
  import { untrack } from 'svelte'
  import { toast } from 'svelte-sonner'
  import { executeSql } from '$lib/api.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import DdlConfirmDialog from './DdlConfirmDialog.svelte'
  import GitBranch from '@lucide/svelte/icons/git-branch'
  import Loader from '@lucide/svelte/icons/loader'

  let {
    open = $bindable(false),
    schema = '',
    defaultTable = '',
    /** @type {{ name: string }[]} */
    tables = [],
    onrefresh = () => {},
  } = $props()

  const EVENTS = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']

  let name = $state('')
  let targetTable = $state(untrack(() => defaultTable))
  let timing = $state('AFTER')
  let events = $state(/** @type {Set<string>} */ (new Set(['INSERT'])))
  let rowLevel = $state(true)
  let functionName = $state('')
  let functionArgs = $state('')
  let confirmOpen = $state(false)
  let saving = $state(false)

  $effect(() => { targetTable = defaultTable })
  $effect(() => { if (timing === 'INSTEAD OF') rowLevel = true })

  function toggleEvent(ev) {
    const next = new Set(events)
    if (next.has(ev)) { if (next.size > 1) next.delete(ev) }
    else next.add(ev)
    events = next
  }

  const eventsStr = $derived([...events].join(' OR '))

  const sql = $derived.by(() => {
    const trig = name.trim() || 'trigger_name'
    const tbl  = targetTable || 'table_name'
    const fn   = functionName.trim() || 'trigger_function'
    const args = functionArgs.trim()
    const lvl  = rowLevel ? 'FOR EACH ROW' : 'FOR EACH STATEMENT'
    return `CREATE TRIGGER "${trig}"
  ${timing} ${eventsStr}
  ON "${schema}"."${tbl}"
  ${lvl}
  EXECUTE FUNCTION "${schema}"."${fn}"(${args});`
  })

  const isValid = $derived(
    name.trim().length > 0 && targetTable.length > 0 &&
    functionName.trim().length > 0 && events.size > 0
  )

  function reset() {
    name = ''; targetTable = defaultTable; timing = 'AFTER'
    events = new Set(['INSERT']); rowLevel = true
    functionName = ''; functionArgs = ''
  }

  async function handleCreate() {
    saving = true
    try {
      await executeSql(sql)
      toast.success(`Trigger "${name.trim()}" created`)
      onrefresh(); reset(); open = false
    } catch (e) { toast.error(String(e))
    } finally { saving = false; confirmOpen = false }
  }

  const lbl = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/50'
  const inp = 'h-8 w-full rounded-lg border border-border/25 bg-muted/[0.4] px-3 font-mono text-[12px] outline-none placeholder:text-muted-foreground/30 focus:border-border/50 focus:ring-0'
  const sel = 'h-8 w-full appearance-none rounded-lg border border-border/25 bg-muted/[0.4] px-3 pr-7 font-mono text-[12px] text-foreground outline-none focus:border-border/50'
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) reset() }}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content showCloseButton={false} class="w-[min(520px,calc(100vw-2rem))] sm:max-w-none gap-0 overflow-hidden p-0">

      <!-- Header -->
      <div class="flex items-start gap-3.5 border-b border-border/25 px-5 pt-5 pb-4">
        <div class="mt-px flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted/50">
          <GitBranch class="size-3.5 text-muted-foreground/70" />
        </div>
        <div class="min-w-0 flex-1">
          <Dialog.Title class="text-[13px] font-semibold text-foreground">Create Trigger</Dialog.Title>
          <p class="mt-0.5 text-[11px] text-muted-foreground/60">PostgreSQL trigger on <span class="font-mono">{schema}</span></p>
        </div>
        <Dialog.Close class="inline-flex size-6 items-center justify-center rounded-lg text-muted-foreground/30 transition-colors hover:bg-muted/50 hover:text-muted-foreground focus-visible:outline-none" />
      </div>

      <div class="app-scroll max-h-[72vh] overflow-y-auto">
        <div class="flex flex-col gap-4 px-5 py-4">

          <!-- Name + Table -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="trig-name" class={lbl}>Trigger name</label>
              <input id="trig-name" type="text" bind:value={name} placeholder="on_user_insert" class={inp} />
            </div>
            <div>
              <label for="trig-table" class={lbl}>Table</label>
              <div class="relative">
                <select id="trig-table" bind:value={targetTable} class={sel}>
                  <option value="" disabled>Select table…</option>
                  {#each tables as t (t.name)}<option value={t.name}>{t.name}</option>{/each}
                </select>
                <span class="pointer-events-none absolute inset-y-0 right-2 flex items-center text-muted-foreground/35">
                  <svg class="size-3" viewBox="0 0 10 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4.5l3-3 3 3M2 7.5l3 3 3-3"/></svg>
                </span>
              </div>
            </div>
          </div>

          <!-- Timing + Level -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <p class={lbl}>Timing</p>
              <div class="flex gap-0.5 rounded-lg border border-border/25 bg-muted/[0.3] p-0.5">
                {#each ['BEFORE', 'AFTER', 'INSTEAD OF'] as t (t)}
                  <button type="button"
                    class="flex flex-1 items-center justify-center truncate rounded-md px-2 py-1.5 text-[11px] font-medium transition-all {timing === t
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border/30'
                      : 'text-muted-foreground/50 hover:text-foreground'}"
                    onclick={() => (timing = t)}>{t}</button>
                {/each}
              </div>
            </div>
            <div>
              <p class={lbl}>Fires per</p>
              <div class="flex gap-0.5 rounded-lg border border-border/25 bg-muted/[0.3] p-0.5">
                <button type="button" disabled={timing === 'INSTEAD OF'}
                  class="flex flex-1 items-center justify-center rounded-md px-2 py-1.5 text-[11px] font-medium transition-all disabled:opacity-40 {rowLevel
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border/30'
                    : 'text-muted-foreground/50 hover:text-foreground'}"
                  onclick={() => (rowLevel = true)}>Row</button>
                <button type="button" disabled={timing === 'INSTEAD OF'}
                  class="flex flex-1 items-center justify-center rounded-md px-2 py-1.5 text-[11px] font-medium transition-all disabled:opacity-40 {!rowLevel
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border/30'
                    : 'text-muted-foreground/50 hover:text-foreground'}"
                  onclick={() => (rowLevel = false)}>Statement</button>
              </div>
            </div>
          </div>

          <!-- Events -->
          <div>
            <p class={lbl}>Events</p>
            <div class="flex gap-1.5">
              {#each EVENTS as ev (ev)}
                {@const active = events.has(ev)}
                <button type="button"
                  class="flex h-7 flex-1 items-center justify-center rounded-lg border font-mono text-[10px] font-semibold transition-all {active
                    ? 'border-foreground/20 bg-muted/70 text-foreground'
                    : 'border-border/20 bg-muted/[0.15] text-muted-foreground/45 hover:border-border/35 hover:text-foreground'}"
                  onclick={() => toggleEvent(ev)}>{ev}</button>
              {/each}
            </div>
          </div>

          <!-- Function + Args -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="trig-fn" class={lbl}>Trigger function</label>
              <input id="trig-fn" type="text" bind:value={functionName} placeholder="my_trigger_func" class={inp} />
            </div>
            <div>
              <label for="trig-args" class={lbl}>
                Arguments <span class="font-normal normal-case opacity-60">(optional)</span>
              </label>
              <input id="trig-args" type="text" bind:value={functionArgs} placeholder="'arg1', 'arg2'" class={inp} />
            </div>
          </div>

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
          Create Trigger
        </button>
      </div>

    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<DdlConfirmDialog bind:open={confirmOpen} title="Create trigger"
  description="This will create the trigger in your database."
  {sql} confirmLabel="Create" loading={saving} onconfirm={handleCreate} />
