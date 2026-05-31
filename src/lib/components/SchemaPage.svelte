<script>
  import { toast } from 'svelte-sonner'
  import { executeSql } from '$lib/api.js'
  import Zap from '@lucide/svelte/icons/zap'
  import Tags from '@lucide/svelte/icons/tags'
  import Eye from '@lucide/svelte/icons/eye'
  import Layers from '@lucide/svelte/icons/layers'
  import GitBranch from '@lucide/svelte/icons/git-branch'
  import Hash from '@lucide/svelte/icons/hash'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import Search from '@lucide/svelte/icons/search'
  import Plus from '@lucide/svelte/icons/plus'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import { Button } from '$lib/components/ui/button/index.js'
  import { cn } from '$lib/utils.js'
  import DdlConfirmDialog from './DdlConfirmDialog.svelte'
  import CreateTriggerDialog from './CreateTriggerDialog.svelte'
  import CreateSequenceDialog from './CreateSequenceDialog.svelte'

  let {
    schema = '',
    /** @type {{ name: string, tableName: string, columns?: string, isUnique?: boolean, isPrimary?: boolean, indexType?: string }[]} */
    indexes = [],
    /** @type {{ name: string, values: string[] }[]} */
    enums = [],
    /** @type {{ name: string, tableName: string, timing: string, events: string, functionName: string, enabled: boolean }[]} */
    triggers = [],
    /** @type {{ name: string, dataType: string, startValue: number, minValue: number, maxValue: number, increment: number, cycle: boolean, ownedBy: string|null }[]} */
    sequences = [],
    /** @type {{ name: string, kind?: string }[]} */
    tables = [],
    loading = false,
    active = false,
    onrefresh = () => {},
  } = $props()

  /** @type {'indexes' | 'triggers' | 'sequences' | 'enums' | 'views' | 'matviews'} */
  let activeType = $state('indexes')
  let filter = $state('')

  const views    = $derived(tables.filter((t) => t.kind === 'view'))
  const matViews = $derived(tables.filter((t) => t.kind === 'materialized_view'))
  const allTables = $derived(tables.filter((t) => !t.kind || t.kind === 'table'))

  const lf = $derived(filter.toLowerCase())

  const filteredIndexes   = $derived(indexes.filter((i) => !lf || i.name.toLowerCase().includes(lf) || i.tableName.toLowerCase().includes(lf)))
  const filteredEnums     = $derived(enums.filter((e) => !lf || e.name.toLowerCase().includes(lf)))
  const filteredViews     = $derived(views.filter((v) => !lf || v.name.toLowerCase().includes(lf)))
  const filteredMatViews  = $derived(matViews.filter((v) => !lf || v.name.toLowerCase().includes(lf)))
  const filteredTriggers  = $derived(triggers.filter((t) => !lf || t.name.toLowerCase().includes(lf) || t.tableName.toLowerCase().includes(lf) || t.functionName.toLowerCase().includes(lf)))
  const filteredSequences = $derived(sequences.filter((s) => !lf || s.name.toLowerCase().includes(lf) || (s.ownedBy ?? '').toLowerCase().includes(lf)))

  const tabs = [
    { id: 'indexes',   label: 'Indexes',    icon: Zap,       count: () => indexes.length },
    { id: 'triggers',  label: 'Triggers',   icon: GitBranch, count: () => triggers.length },
    { id: 'sequences', label: 'Sequences',  icon: Hash,      count: () => sequences.length },
    { id: 'enums',     label: 'Enums',      icon: Tags,      count: () => enums.length },
    { id: 'views',     label: 'Views',      icon: Eye,       count: () => views.length },
    { id: 'matviews',  label: 'Mat. Views', icon: Layers,    count: () => matViews.length },
  ]

  // ── DDL confirm ────────────────────────────────────────────────────────────
  let confirmOpen = $state(false)
  let confirmLoading = $state(false)
  let confirmSql = $state('')
  let confirmTitle = $state('')
  let confirmDesc = $state('')
  let confirmAction = $state(/** @type {(() => Promise<void>) | null} */ (null))

  function askDrop(title, desc, sql, action) {
    confirmTitle = title
    confirmDesc = desc
    confirmSql = sql
    confirmAction = action
    confirmOpen = true
  }

  async function handleConfirm() {
    if (!confirmAction) return
    confirmLoading = true
    try {
      await confirmAction()
      confirmOpen = false
    } finally {
      confirmLoading = false
      confirmAction = null
    }
  }

  // ── Create dialogs ─────────────────────────────────────────────────────────
  let createTriggerOpen = $state(false)
  let createSequenceOpen = $state(false)

  // ── Drop helpers ───────────────────────────────────────────────────────────
  function dropTrigger(trig) {
    const sql = `DROP TRIGGER "${trig.name}" ON "${schema}"."${trig.tableName}";`
    askDrop(
      `Drop trigger "${trig.name}"`,
      `This will permanently remove the trigger from "${trig.tableName}".`,
      sql,
      async () => {
        await executeSql(sql)
        toast.success(`Trigger "${trig.name}" dropped`)
        onrefresh()
      }
    )
  }

  function dropSequence(seq) {
    const sql = `DROP SEQUENCE "${schema}"."${seq.name}";`
    askDrop(
      `Drop sequence "${seq.name}"`,
      seq.ownedBy
        ? `Owned by ${seq.ownedBy}. Dropping may affect dependent columns.`
        : `This will permanently remove the sequence.`,
      sql,
      async () => {
        await executeSql(sql)
        toast.success(`Sequence "${seq.name}" dropped`)
        onrefresh()
      }
    )
  }

  /** Format large numbers for sequence bounds */
  function fmtNum(n) {
    if (n >= 9e15)  return '∞'
    if (n <= -9e15) return '-∞'
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
    return n.toLocaleString()
  }
</script>

<svelte:window onkeydown={(e) => {
  if (!active) return
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === 'r') {
    e.preventDefault(); onrefresh()
  }
}} />

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">

  <!-- Toolbar -->
  <div class="studio-chrome flex h-9 shrink-0 items-center gap-2 border-b border-border bg-panel px-3" data-studio-chrome>
    <span class="font-mono text-ui-sm font-medium">Schema Explorer</span>
    <div class="ml-auto flex items-center gap-1">
      {#if activeType === 'triggers'}
        <Button variant="ghost" size="sm" class="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground" onclick={() => (createTriggerOpen = true)}>
          <Plus class="size-3.5" /><span class="text-ui-xs">New Trigger</span>
        </Button>
      {:else if activeType === 'sequences'}
        <Button variant="ghost" size="sm" class="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground" onclick={() => (createSequenceOpen = true)}>
          <Plus class="size-3.5" /><span class="text-ui-xs">New Sequence</span>
        </Button>
      {/if}
      <Button variant="ghost" size="sm" class="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground" disabled={loading} title="Refresh" onclick={onrefresh}>
        <RefreshCw class={cn('size-3.5', loading && 'animate-spin')} />
        <span class="text-ui-xs">Refresh</span>
      </Button>
    </div>
  </div>

  <!-- Tab bar + filter -->
  <div class="flex shrink-0 items-center gap-3 border-b border-border bg-panel/60 px-3 py-2">
    <div class="app-scroll inline-flex h-7 shrink-0 items-center overflow-x-auto rounded-md border border-border/60 bg-muted/40 p-0.5 ring-1 ring-inset ring-border/40">
      {#each tabs as tab (tab.id)}
        {@const Icon = tab.icon}
        {@const cnt = tab.count()}
        <button
          type="button"
          class={cn(
            'inline-flex h-6 shrink-0 items-center gap-1 rounded-[5px] px-2.5 text-ui-2xs font-medium transition-all',
            activeType === tab.id
              ? 'bg-card text-foreground shadow-sm ring-1 ring-border/50'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onclick={() => { activeType = /** @type {any} */ (tab.id); filter = '' }}
        >
          <Icon class="size-3 shrink-0" />
          {tab.label}
          {#if cnt > 0}
            <span class="rounded-full bg-muted/80 px-1 font-mono text-[9px] tabular-nums {activeType === tab.id ? 'text-foreground/60' : 'text-muted-foreground/60'}">{cnt}</span>
          {/if}
        </button>
      {/each}
    </div>

    <div class="relative min-w-0 flex-1">
      <Search class="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
      <input
        type="search"
        placeholder="Filter…"
        bind:value={filter}
        class="h-7 w-full rounded-md border border-border bg-background/40 pl-7 pr-2.5 text-ui-xs text-foreground outline-none transition-colors hover:bg-background/60 focus:border-ring focus:ring-1 focus:ring-ring/30"
      />
    </div>
  </div>

  <!-- Content -->
  <div class="app-scroll min-h-0 flex-1 overflow-y-auto [will-change:transform]">

    <!-- ── Indexes ───────────────────────────────────────────────────────── -->
    {#if activeType === 'indexes'}
      {#if indexes.length === 0}
        {@render emptyState(Zap, 'No indexes', 'Indexes in this schema will appear here')}
      {:else if filteredIndexes.length === 0}
        {@render noMatch('indexes', filter)}
      {:else}
        <table class="border-collapse" style="table-layout:fixed;width:max-content;min-width:100%">
          <colgroup>
            <col style="min-width:200px;width:220px" />
            <col style="min-width:180px;width:200px" />
            <col style="min-width:90px;width:100px" />
            <col style="min-width:60px;width:70px" />
            <col style="min-width:160px;width:200px" />
            <col style="min-width:140px;width:180px" />
          </colgroup>
          <thead>
            <tr>
              {#each ['index_name','table','algorithm','unique','columns','condition'] as h}
                <th class="border-b border-r border-border bg-panel/80 px-3 py-2 text-left font-medium text-muted-foreground text-ui-2xs uppercase tracking-wide whitespace-nowrap">{h}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each filteredIndexes as idx (idx.name)}
              <tr class="group/row h-9">
                <td class="border-b border-r border-border/40 px-3 font-mono text-ui-sm font-medium text-foreground">
                  <div class="flex items-center gap-1.5">
                    {idx.name}
                    {#if idx.isPrimary}<span class="rounded bg-primary/10 px-1 text-ui-3xs text-primary">PK</span>
                    {:else if idx.isUnique}<span class="rounded bg-muted px-1 text-ui-3xs text-muted-foreground">UNIQUE</span>{/if}
                  </div>
                </td>
                <td class="border-b border-r border-border/40 px-3 font-mono text-ui-sm text-muted-foreground">{idx.tableName}</td>
                <td class="border-b border-r border-border/40 px-3 font-mono text-ui-sm uppercase text-muted-foreground">{idx.indexType || 'btree'}</td>
                <td class="border-b border-r border-border/40 px-3 font-mono text-ui-xs {idx.isUnique ? 'text-green-400' : 'text-muted-foreground/50'}">{idx.isUnique ? 'TRUE' : 'FALSE'}</td>
                <td class="border-b border-r border-border/40 px-3 font-mono text-ui-xs text-muted-foreground/70 overflow-hidden"><span class="block truncate">{idx.columns || '—'}</span></td>
                <td class="border-b border-border/40 px-3 font-mono text-ui-xs text-muted-foreground/50 overflow-hidden"><span class="block truncate">{idx.condition ?? '—'}</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

    <!-- ── Triggers ──────────────────────────────────────────────────────── -->
    {:else if activeType === 'triggers'}
      {#if triggers.length === 0}
        {@render emptyState(GitBranch, 'No triggers', 'Triggers defined in this schema will appear here')}
      {:else if filteredTriggers.length === 0}
        {@render noMatch('triggers', filter)}
      {:else}
        <table class="border-collapse" style="table-layout:fixed;width:max-content;min-width:100%">
          <colgroup>
            <col style="min-width:180px;width:210px" />
            <col style="min-width:160px;width:190px" />
            <col style="min-width:90px;width:100px" />
            <col style="min-width:180px;width:220px" />
            <col style="min-width:180px;width:210px" />
            <col style="min-width:72px;width:72px" />
            <col style="min-width:36px;width:36px;max-width:36px" />
          </colgroup>
          <thead>
            <tr>
              {#each ['trigger_name','table','timing','events','function','status',''] as h}
                <th class="border-b border-r border-border bg-panel/80 px-3 py-2 text-left font-medium text-muted-foreground text-ui-2xs uppercase tracking-wide whitespace-nowrap">{h}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each filteredTriggers as trig (`${trig.name}:${trig.tableName}`)}
              <tr class="group/row h-9">
                <td class="border-b border-r border-border/40 px-3 font-mono text-ui-sm font-medium text-foreground overflow-hidden">
                  <span class="block truncate">{trig.name}</span>
                </td>
                <td class="border-b border-r border-border/40 px-3 font-mono text-ui-sm text-muted-foreground overflow-hidden">
                  <span class="block truncate">{trig.tableName}</span>
                </td>
                <td class="border-b border-r border-border/40 px-3">
                  <span class="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-ui-3xs text-muted-foreground">{trig.timing}</span>
                </td>
                <td class="border-b border-r border-border/40 px-3 overflow-hidden">
                  <div class="flex flex-wrap gap-1 overflow-hidden">
                    {#each trig.events.split(', ').filter(Boolean) as ev (ev)}
                      <span class="shrink-0 rounded bg-primary/8 px-1.5 py-0.5 font-mono text-ui-3xs text-primary/80">{ev}</span>
                    {/each}
                  </div>
                </td>
                <td class="border-b border-r border-border/40 px-3 font-mono text-ui-xs text-muted-foreground/70 overflow-hidden">
                  <span class="block truncate">{trig.functionName}()</span>
                </td>
                <td class="border-b border-r border-border/40 px-3">
                  {#if trig.enabled}
                    <span class="flex items-center gap-1 font-mono text-ui-3xs text-green-400">
                      <span class="size-1.5 rounded-full bg-green-400"></span>enabled
                    </span>
                  {:else}
                    <span class="flex items-center gap-1 font-mono text-ui-3xs text-muted-foreground/50">
                      <span class="size-1.5 rounded-full bg-muted-foreground/30"></span>disabled
                    </span>
                  {/if}
                </td>
                <td class="border-b border-border/40 p-0 align-middle">
                  <button
                    type="button"
                    class="flex h-full w-full items-center justify-center text-muted-foreground/20 transition-colors hover:text-destructive group-hover/row:text-muted-foreground/40"
                    title="Drop trigger"
                    onclick={() => dropTrigger(trig)}
                  ><Trash2 class="size-3.5" /></button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

    <!-- ── Sequences ─────────────────────────────────────────────────────── -->
    {:else if activeType === 'sequences'}
      {#if sequences.length === 0}
        {@render emptyState(Hash, 'No sequences', 'Sequences defined in this schema will appear here')}
      {:else if filteredSequences.length === 0}
        {@render noMatch('sequences', filter)}
      {:else}
        <table class="border-collapse" style="table-layout:fixed;width:max-content;min-width:100%">
          <colgroup>
            <col style="min-width:180px;width:210px" />
            <col style="min-width:80px;width:90px" />
            <col style="min-width:80px;width:90px" />
            <col style="min-width:80px;width:100px" />
            <col style="min-width:130px;width:160px" />
            <col style="min-width:80px;width:90px" />
            <col style="min-width:60px;width:60px" />
            <col style="min-width:180px;width:200px" />
            <col style="min-width:36px;width:36px;max-width:36px" />
          </colgroup>
          <thead>
            <tr>
              {#each ['sequence_name','data_type','start','increment','range','cycle','owned_by',''] as h}
                <th class="border-b border-r border-border bg-panel/80 px-3 py-2 text-left font-medium text-muted-foreground text-ui-2xs uppercase tracking-wide whitespace-nowrap last:border-r-0">{h}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each filteredSequences as seq (seq.name)}
              <tr class="group/row h-9">
                <td class="border-b border-r border-border/40 px-3 font-mono text-ui-sm font-medium text-foreground overflow-hidden">
                  <span class="block truncate">{seq.name}</span>
                </td>
                <td class="border-b border-r border-border/40 px-3 font-mono text-ui-xs text-muted-foreground">{seq.dataType}</td>
                <td class="border-b border-r border-border/40 px-3 font-mono text-ui-xs tabular-nums text-foreground/70">{fmtNum(seq.startValue)}</td>
                <td class="border-b border-r border-border/40 px-3 font-mono text-ui-xs tabular-nums text-foreground/70">{fmtNum(seq.increment)}</td>
                <td class="border-b border-r border-border/40 px-3 font-mono text-ui-xs tabular-nums text-muted-foreground/70">
                  {fmtNum(seq.minValue)} … {fmtNum(seq.maxValue)}
                </td>
                <td class="border-b border-r border-border/40 px-3">
                  {#if seq.cycle}
                    <span class="rounded bg-primary/8 px-1.5 py-0.5 font-mono text-ui-3xs text-primary/80">YES</span>
                  {:else}
                    <span class="font-mono text-ui-3xs text-muted-foreground/40">NO</span>
                  {/if}
                </td>
                <td class="border-b border-r border-border/40 px-3 font-mono text-ui-xs text-muted-foreground/60 overflow-hidden">
                  <span class="block truncate">{seq.ownedBy ?? '—'}</span>
                </td>
                <td class="border-b border-border/40 p-0 align-middle">
                  <button
                    type="button"
                    class="flex h-full w-full items-center justify-center text-muted-foreground/20 transition-colors hover:text-destructive group-hover/row:text-muted-foreground/40"
                    title="Drop sequence"
                    onclick={() => dropSequence(seq)}
                  ><Trash2 class="size-3.5" /></button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

    <!-- ── Enums ──────────────────────────────────────────────────────────── -->
    {:else if activeType === 'enums'}
      {#if enums.length === 0}
        {@render emptyState(Tags, 'No enum types', 'Enum types defined in this schema will appear here')}
      {:else if filteredEnums.length === 0}
        {@render noMatch('enums', filter)}
      {:else}
        <div class="grid gap-3 p-4" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))">
          {#each filteredEnums as e (e.name)}
            <div class="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
              <div class="flex items-center gap-2">
                <Tags class="size-4 shrink-0 text-muted-foreground/60" />
                <span class="min-w-0 truncate font-mono text-ui-sm font-medium">{e.name}</span>
                <span class="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-ui-2xs text-muted-foreground">{e.values.length}</span>
              </div>
              {#if e.values.length > 0}
                <div class="flex flex-wrap gap-1.5 border-t border-border pt-2">
                  {#each e.values as val (val)}
                    <span class="rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono text-ui-xs">{val}</span>
                  {/each}
                </div>
              {:else}
                <p class="border-t border-border pt-2 text-ui-xs text-muted-foreground/50">No values</p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

    <!-- ── Views ─────────────────────────────────────────────────────────── -->
    {:else if activeType === 'views'}
      {#if views.length === 0}
        {@render emptyState(Eye, 'No views', 'Views in this schema will appear here')}
      {:else if filteredViews.length === 0}
        {@render noMatch('views', filter)}
      {:else}
        <table class="border-collapse" style="table-layout:fixed;width:max-content;min-width:100%">
          <thead>
            <tr>
              <th class="border-b border-r border-border bg-panel/80 px-3 py-2 text-left font-medium text-muted-foreground text-ui-2xs uppercase tracking-wide">view_name</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredViews as v (v.name)}
              <tr class="h-9">
                <td class="border-b border-border/40 px-3 font-mono text-ui-sm text-foreground">{v.name}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

    <!-- ── Materialized Views ─────────────────────────────────────────────── -->
    {:else if activeType === 'matviews'}
      {#if matViews.length === 0}
        {@render emptyState(Layers, 'No materialized views', 'Materialized views in this schema will appear here')}
      {:else if filteredMatViews.length === 0}
        {@render noMatch('materialized views', filter)}
      {:else}
        <table class="border-collapse" style="table-layout:fixed;width:max-content;min-width:100%">
          <thead>
            <tr>
              <th class="border-b border-r border-border bg-panel/80 px-3 py-2 text-left font-medium text-muted-foreground text-ui-2xs uppercase tracking-wide">view_name</th>
              <th class="border-b border-border bg-panel/80 px-3 py-2 text-left font-medium text-muted-foreground text-ui-2xs uppercase tracking-wide">rows</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredMatViews as mv (mv.name)}
              <tr class="h-9">
                <td class="border-b border-r border-border/40 px-3 font-mono text-ui-sm text-foreground">{mv.name}</td>
                <td class="border-b border-border/40 px-3 font-mono text-ui-xs tabular-nums text-muted-foreground/60">{mv.rowCount != null ? mv.rowCount.toLocaleString() : '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {/if}

  </div>
</div>

<!-- Snippets -->
{#snippet emptyState(Icon, label, sub)}
  <div class="flex h-full flex-col items-center justify-center gap-3 p-12 text-center">
    <Icon class="size-10 text-muted-foreground/20" />
    <div>
      <p class="font-mono text-ui text-muted-foreground">{label}</p>
      <p class="mt-1 text-ui-xs text-muted-foreground/60">{sub}</p>
    </div>
  </div>
{/snippet}

{#snippet noMatch(type, q)}
  <p class="py-10 text-center text-ui-xs text-muted-foreground/60">No {type} match "{q}"</p>
{/snippet}

<!-- Dialogs -->
<DdlConfirmDialog
  bind:open={confirmOpen}
  title={confirmTitle}
  description={confirmDesc}
  sql={confirmSql}
  variant="destructive"
  confirmLabel="Drop"
  loading={confirmLoading}
  onconfirm={handleConfirm}
/>

<CreateTriggerDialog
  bind:open={createTriggerOpen}
  {schema}
  tables={allTables}
  onrefresh={onrefresh}
/>

<CreateSequenceDialog
  bind:open={createSequenceOpen}
  {schema}
  onrefresh={onrefresh}
/>
