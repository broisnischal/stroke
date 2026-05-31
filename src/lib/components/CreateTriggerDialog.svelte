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
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) reset() }}>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="max-w-[520px] gap-0 overflow-hidden p-0 sm:rounded-xl">

      <div class="flex items-center gap-3 border-b border-border/60 px-5 py-4">
        <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <GitBranch class="size-4 text-primary" />
        </div>
        <div class="min-w-0 flex-1">
          <Dialog.Title class="text-ui-sm font-semibold">Create Trigger</Dialog.Title>
          <p class="text-ui-xs text-muted-foreground">PostgreSQL trigger on <span class="font-mono">{schema}</span></p>
        </div>
        <Dialog.Close class="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" />
      </div>

      <div class="app-scroll max-h-[72vh] overflow-y-auto">
        <div class="flex flex-col gap-4 px-5 py-5">

          <!-- Name + Table -->
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1.5">
              <label for="trig-name" class="text-ui-xs font-medium text-muted-foreground">Trigger name</label>
              <input id="trig-name" type="text" bind:value={name} placeholder="on_user_insert"
                class="h-8 w-full rounded-md border border-border/60 bg-muted/20 px-3 font-mono text-ui-sm outline-none placeholder:text-muted-foreground/35 focus:border-ring focus:bg-background focus:ring-1 focus:ring-ring/30" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="trig-table" class="text-ui-xs font-medium text-muted-foreground">Table</label>
              <div class="relative">
                <select id="trig-table" bind:value={targetTable}
                  class="h-8 w-full appearance-none rounded-md border border-border/60 bg-muted/20 px-3 pr-7 font-mono text-ui-sm outline-none focus:border-ring focus:bg-background focus:ring-1 focus:ring-ring/30">
                  <option value="" disabled>Select table…</option>
                  {#each tables as t (t.name)}<option value={t.name}>{t.name}</option>{/each}
                </select>
                <span class="pointer-events-none absolute inset-y-0 right-2 flex items-center text-muted-foreground/40">
                  <svg class="size-3.5" viewBox="0 0 10 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4.5l3-3 3 3M2 7.5l3 3 3-3"/></svg>
                </span>
              </div>
            </div>
          </div>

          <!-- Timing + Level -->
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1.5">
              <p class="text-ui-xs font-medium text-muted-foreground">Timing</p>
              <div class="flex h-8 items-center overflow-hidden rounded-md border border-border/50 bg-muted/30 p-0.5">
                {#each ['BEFORE', 'AFTER', 'INSTEAD OF'] as t (t)}
                  <button type="button"
                    class="flex-1 truncate rounded-[5px] px-1 text-[10px] font-medium transition-all {timing === t ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50' : 'text-muted-foreground/65 hover:text-foreground'}"
                    onclick={() => (timing = t)}>{t}</button>
                {/each}
              </div>
            </div>
            <div class="flex flex-col gap-1.5">
              <p class="text-ui-xs font-medium text-muted-foreground">Fires per</p>
              <div class="flex h-8 items-center rounded-md border border-border/50 bg-muted/30 p-0.5">
                <button type="button" disabled={timing === 'INSTEAD OF'}
                  class="flex-1 rounded-[5px] text-ui-xs font-medium transition-all disabled:opacity-40 {rowLevel ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50' : 'text-muted-foreground/65 hover:text-foreground'}"
                  onclick={() => (rowLevel = true)}>Row</button>
                <button type="button" disabled={timing === 'INSTEAD OF'}
                  class="flex-1 rounded-[5px] text-ui-xs font-medium transition-all disabled:opacity-40 {!rowLevel ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50' : 'text-muted-foreground/65 hover:text-foreground'}"
                  onclick={() => (rowLevel = false)}>Statement</button>
              </div>
            </div>
          </div>

          <!-- Events -->
          <div class="flex flex-col gap-1.5">
            <p class="text-ui-xs font-medium text-muted-foreground">Events</p>
            <div class="flex gap-1.5">
              {#each EVENTS as ev (ev)}
                {@const active = events.has(ev)}
                <button type="button"
                  class="flex h-7 flex-1 items-center justify-center rounded-md border text-[11px] font-mono font-medium transition-all {active ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border/40 bg-muted/20 text-muted-foreground/60 hover:border-border/70 hover:text-foreground'}"
                  onclick={() => toggleEvent(ev)}>{ev}</button>
              {/each}
            </div>
          </div>

          <!-- Function + Args -->
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1.5">
              <label for="trig-fn" class="text-ui-xs font-medium text-muted-foreground">Trigger function</label>
              <input id="trig-fn" type="text" bind:value={functionName} placeholder="my_trigger_func"
                class="h-8 w-full rounded-md border border-border/60 bg-muted/20 px-3 font-mono text-ui-sm outline-none placeholder:text-muted-foreground/35 focus:border-ring focus:bg-background focus:ring-1 focus:ring-ring/30" />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="trig-args" class="text-ui-xs font-medium text-muted-foreground">Arguments <span class="text-muted-foreground/40">(optional)</span></label>
              <input id="trig-args" type="text" bind:value={functionArgs} placeholder="'arg1', 'arg2'"
                class="h-8 w-full rounded-md border border-border/60 bg-muted/20 px-3 font-mono text-ui-sm outline-none placeholder:text-muted-foreground/35 focus:border-ring focus:bg-background focus:ring-1 focus:ring-ring/30" />
            </div>
          </div>

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
          Create Trigger
        </button>
      </div>

    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<DdlConfirmDialog bind:open={confirmOpen} title="Create trigger"
  description="This will create the trigger in your database."
  {sql} confirmLabel="Create" loading={saving} onconfirm={handleCreate} />
