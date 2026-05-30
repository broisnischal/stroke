<script>
  import EChartPanel from './EChartPanel.svelte'
  import {
    savedCharts,
    chartGroups,
    deleteChart,
    updateChart,
    addGroup,
    deleteGroup,
    renameGroup,
  } from '$lib/stores/saved-charts.js'
  import { CHART_CATALOG } from '$lib/chart-utils.js'
  import { cn } from '$lib/utils.js'
  import { toast } from 'svelte-sonner'
  import BarChart2 from '@lucide/svelte/icons/bar-chart-2'
  import Play from '@lucide/svelte/icons/play'
  import Pencil from '@lucide/svelte/icons/pencil'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import FolderOpen from '@lucide/svelte/icons/folder-open'
  import FolderPlus from '@lucide/svelte/icons/folder-plus'
  import X from '@lucide/svelte/icons/x'
  import Check from '@lucide/svelte/icons/check'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'

  /**
   * @typedef {import('$lib/stores/connections.js').SavedConnection} SavedConnection
   */

  let {
    /** @type {SavedConnection | null} */
    connection = null,
    /** @type {(sql: string) => void} */
    onrunsql = (_sql) => {},
  } = $props()

  // ── State ─────────────────────────────────────────────────────────────────
  /** @type {string | null} */
  let renamingGroupName = $state(null)
  let renameGroupInput = $state('')

  /** @type {string | null} */
  let renamingChartId = $state(null)
  let renameChartInput = $state('')

  let newGroupOpen = $state(false)
  let newGroupInput = $state('')

  /** @type {string | null} */
  let moveChartId = $state(null)

  /** @type {string | null} */
  let confirmDeleteId = $state(null)

  // Charts per group (derived)
  const chartsByGroup = $derived(
    $chartGroups.map((g) => ({
      group: g,
      charts: $savedCharts.filter((c) => c.group === g),
    })),
  )

  const totalCharts = $derived($savedCharts.length)

  // ── Helpers ───────────────────────────────────────────────────────────────
  /** @param {string} typeId */
  function catalogEntry(typeId) {
    return CHART_CATALOG.find((c) => c.id === typeId)
  }

  /** @param {number} ts */
  function fmtDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function commitNewGroup() {
    const name = newGroupInput.trim()
    if (!name) return
    addGroup(name)
    newGroupInput = ''
    newGroupOpen = false
    toast.success(`Group "${name}" created`)
  }

  /** @param {string} oldName */
  function startRenameGroup(oldName) {
    renamingGroupName = oldName
    renameGroupInput = oldName
  }

  function commitRenameGroup() {
    if (renamingGroupName) {
      renameGroup(renamingGroupName, renameGroupInput.trim())
      toast.success('Group renamed')
    }
    renamingGroupName = null
    renameGroupInput = ''
  }

  /** @param {string} name */
  function handleDeleteGroup(name) {
    deleteGroup(name)
    toast.success(`Group "${name}" deleted`)
  }

  /** @param {string} id */
  function startRenameChart(id) {
    const c = $savedCharts.find((cc) => cc.id === id)
    renamingChartId = id
    renameChartInput = c?.name ?? ''
  }

  function commitRenameChart() {
    if (renamingChartId) {
      const name = renameChartInput.trim()
      if (name) updateChart(renamingChartId, { name })
    }
    renamingChartId = null
    renameChartInput = ''
  }

  /** @param {string} id */
  function handleDeleteChart(id) {
    if (confirmDeleteId === id) {
      deleteChart(id)
      confirmDeleteId = null
      toast.success('Chart deleted')
    } else {
      confirmDeleteId = id
    }
  }

  /** @param {string} id @param {string} toGroup */
  function handleMoveChart(id, toGroup) {
    updateChart(id, { group: toGroup })
    moveChartId = null
    toast.success('Chart moved')
  }

  /** @param {import('$lib/stores/saved-charts.js').SavedChart} chart */
  function handleRunSql(chart) {
    onrunsql(chart.sql)
    toast.success('SQL opened in Query Editor')
  }

  const btnIconSm = 'inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground'
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">

  <!-- ── Header bar ────────────────────────────────────────────────────── -->
  <div class="studio-chrome flex shrink-0 items-center gap-2 border-b border-border/50 bg-panel px-4 py-2" data-studio-chrome>
    <BarChart2 class="size-4 text-muted-foreground/50" />
    <span class="font-medium">Saved Charts</span>
    <span class="ml-1 rounded-full bg-muted px-1.5 py-0.5 font-mono text-ui-2xs text-muted-foreground/60">
      {totalCharts}
    </span>
    <div class="ml-auto flex items-center gap-1">
      {#if !newGroupOpen}
        <button
          type="button"
          class="inline-flex h-6 items-center gap-1.5 rounded-md border border-border/50 px-2 text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onclick={() => { newGroupOpen = true; newGroupInput = '' }}
        >
          <FolderPlus class="size-3.5" />
          New Group
        </button>
      {:else}
        <div class="flex items-center gap-1">
          <input
            type="text"
            placeholder="Group name…"
            bind:value={newGroupInput}
            class="h-6 rounded border border-border/50 bg-background/80 px-2 font-mono text-ui-xs outline-none placeholder:text-muted-foreground/40 focus:border-ring focus:ring-1 focus:ring-ring/30"
            style="width:150px"
            onkeydown={(e) => { if (e.key === 'Enter') commitNewGroup(); if (e.key === 'Escape') { newGroupOpen = false } }}
          />
          <button type="button" class="inline-flex h-6 items-center gap-1 rounded-md bg-primary px-2 text-ui-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors" onclick={commitNewGroup}>
            <Check class="size-3" />
          </button>
          <button type="button" class={cn(btnIconSm)} onclick={() => { newGroupOpen = false }}>
            <X class="size-3" />
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- ── Content ───────────────────────────────────────────────────────── -->
  <div class="min-h-0 flex-1 overflow-y-auto p-4">

    {#if totalCharts === 0}
      <!-- Empty state -->
      <div class="flex h-full min-h-[280px] flex-col items-center justify-center gap-4">
        <div class="flex size-16 items-center justify-center rounded-2xl bg-muted/30">
          <BarChart2 class="size-8 text-muted-foreground/25" />
        </div>
        <div class="text-center">
          <p class="font-medium text-foreground/60">No saved charts yet</p>
          <p class="mt-1 text-ui-sm text-muted-foreground/50">Save charts from the Query Editor to see them here</p>
        </div>
        <div class="flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-ui-sm text-muted-foreground/60">
          <span>Run a query</span>
          <ArrowRight class="size-3.5" />
          <span>Chart tab</span>
          <ArrowRight class="size-3.5" />
          <span>Save chart</span>
        </div>
      </div>

    {:else}

      <div class="flex flex-col gap-6">
        {#each chartsByGroup as grpData (grpData.group)}
          {#if grpData.charts.length > 0}
            <section>
              <!-- Group header -->
              <div class="mb-3 flex items-center gap-2">
                <FolderOpen class="size-3.5 text-muted-foreground/40" />
                {#if renamingGroupName === grpData.group}
                  <div class="flex items-center gap-1">
                    <input
                      type="text"
                      bind:value={renameGroupInput}
                      class="h-5 rounded border border-border/50 bg-background/80 px-1.5 font-mono text-ui-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
                      style="width:130px"
                      onkeydown={(e) => { if (e.key === 'Enter') commitRenameGroup(); if (e.key === 'Escape') { renamingGroupName = null } }}
                    />
                    <button type="button" class={cn(btnIconSm, 'size-5')} onclick={commitRenameGroup}><Check class="size-3" /></button>
                    <button type="button" class={cn(btnIconSm, 'size-5')} onclick={() => { renamingGroupName = null }}><X class="size-3" /></button>
                  </div>
                {:else}
                  <h3 class="text-ui-sm font-semibold text-foreground/70">{grpData.group}</h3>
                  <span class="rounded-full bg-muted/60 px-1.5 py-0 font-mono text-ui-2xs text-muted-foreground/50">{grpData.charts.length}</span>
                  {#if grpData.group !== 'Default'}
                    <button type="button" class={cn(btnIconSm, 'size-5 ml-0.5')} title="Rename group" onclick={() => startRenameGroup(grpData.group)}>
                      <Pencil class="size-2.5" />
                    </button>
                    <button type="button" class={cn(btnIconSm, 'size-5 hover:text-destructive')} title="Delete group" onclick={() => handleDeleteGroup(grpData.group)}>
                      <Trash2 class="size-2.5" />
                    </button>
                  {/if}
                {/if}
              </div>

              <!-- Chart cards grid -->
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {#each grpData.charts as chart (chart.id)}
                  {@const entry = catalogEntry(chart.config.type)}
                  <div class="group relative flex flex-col overflow-hidden rounded-xl border border-border/50 bg-card transition-shadow hover:shadow-md">

                    <!-- Preview area -->
                    <div class="relative h-36 bg-muted/10">
                      {#if chart.previewOption && Object.keys(chart.previewOption).length > 0}
                        <EChartPanel option={chart.previewOption} height="100%" />
                      {:else}
                        <div class="flex h-full items-center justify-center">
                          <BarChart2 class="size-8 text-muted-foreground/15" />
                        </div>
                      {/if}
                    </div>

                    <!-- Card body -->
                    <div class="flex flex-1 flex-col gap-1.5 p-3">

                      <!-- Name row -->
                      {#if renamingChartId === chart.id}
                        <div class="flex items-center gap-1">
                          <input
                            type="text"
                            bind:value={renameChartInput}
                            class="h-5 min-w-0 flex-1 rounded border border-border/50 bg-background/80 px-1.5 font-mono text-ui-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
                            onkeydown={(e) => { if (e.key === 'Enter') commitRenameChart(); if (e.key === 'Escape') { renamingChartId = null } }}
                          />
                          <button type="button" class={cn(btnIconSm, 'size-5')} onclick={commitRenameChart}><Check class="size-3" /></button>
                          <button type="button" class={cn(btnIconSm, 'size-5')} onclick={() => { renamingChartId = null }}><X class="size-3" /></button>
                        </div>
                      {:else}
                        <p class="truncate font-medium text-ui-sm" title={chart.name}>{chart.name}</p>
                      {/if}

                      <!-- Meta row -->
                      <div class="flex items-center gap-1.5 text-ui-2xs text-muted-foreground/50">
                        <span class="rounded-full border border-border/40 bg-muted/40 px-1.5 py-0">{entry?.label ?? chart.config.type}</span>
                        <span>{fmtDate(chart.createdAt)}</span>
                      </div>

                      <!-- Action row -->
                      <div class="mt-auto flex items-center gap-0.5 pt-1">

                        <!-- Run SQL -->
                        <button
                          type="button"
                          class={cn(btnIconSm, 'size-6 text-primary/70 hover:text-primary')}
                          title="Open SQL in Query Editor"
                          onclick={() => handleRunSql(chart)}
                        >
                          <Play class="size-3" />
                        </button>

                        <!-- Rename -->
                        <button
                          type="button"
                          class={cn(btnIconSm, 'size-6')}
                          title="Rename chart"
                          onclick={() => startRenameChart(chart.id)}
                        >
                          <Pencil class="size-3" />
                        </button>

                        <!-- Move to group -->
                        <div class="relative">
                          <button
                            type="button"
                            class={cn(btnIconSm, 'size-6')}
                            title="Move to group"
                            onclick={() => { moveChartId = moveChartId === chart.id ? null : chart.id }}
                          >
                            <FolderOpen class="size-3" />
                          </button>
                          {#if moveChartId === chart.id}
                            <div class="absolute bottom-full left-0 z-20 mb-1 min-w-[130px] rounded-lg border border-border/60 bg-popover p-1 shadow-lg">
                              {#each $chartGroups.filter(g => g !== chart.group) as g (g)}
                                <button
                                  type="button"
                                  class="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-ui-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                                  onclick={() => handleMoveChart(chart.id, g)}
                                >
                                  <FolderOpen class="size-3 shrink-0" />
                                  {g}
                                </button>
                              {/each}
                              {#if $chartGroups.filter(g => g !== chart.group).length === 0}
                                <p class="px-2 py-1 text-ui-2xs text-muted-foreground/40">No other groups</p>
                              {/if}
                            </div>
                          {/if}
                        </div>

                        <!-- Delete -->
                        <button
                          type="button"
                          class={cn(
                            btnIconSm,
                            'size-6 ml-auto',
                            confirmDeleteId === chart.id ? 'text-destructive hover:bg-destructive/10 hover:text-destructive' : 'hover:text-destructive',
                          )}
                          title={confirmDeleteId === chart.id ? 'Click again to confirm delete' : 'Delete chart'}
                          onclick={() => handleDeleteChart(chart.id)}
                        >
                          <Trash2 class="size-3" />
                        </button>

                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </section>
          {/if}
        {/each}

        <!-- Groups with 0 charts (show placeholder) -->
        {#each chartsByGroup as grpData (grpData.group)}
          {#if grpData.charts.length === 0}
            <section>
              <div class="mb-2 flex items-center gap-2">
                <FolderOpen class="size-3.5 text-muted-foreground/30" />
                <h3 class="text-ui-sm font-semibold text-foreground/40">{grpData.group}</h3>
                <span class="rounded-full bg-muted/40 px-1.5 font-mono text-ui-2xs text-muted-foreground/30">0</span>
                {#if grpData.group !== 'Default'}
                  <button type="button" class={cn(btnIconSm, 'size-5 hover:text-destructive')} title="Delete empty group" onclick={() => handleDeleteGroup(grpData.group)}>
                    <Trash2 class="size-2.5" />
                  </button>
                {/if}
              </div>
              <div class="rounded-lg border border-dashed border-border/40 py-4 text-center text-ui-xs text-muted-foreground/30">
                No charts in this group
              </div>
            </section>
          {/if}
        {/each}

      </div>
    {/if}
  </div>
</div>
