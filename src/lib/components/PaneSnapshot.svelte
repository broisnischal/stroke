<script>
  import DataTable from './DataTable.svelte'
  import Table2 from '@lucide/svelte/icons/table-2'
  import PanelLeft from '@lucide/svelte/icons/panel-left'
  import { tabDisplayTitle } from '$lib/studio-tabs.js'

  /** @typedef {import('$lib/studio-tabs.js').StudioTab} StudioTab */
  /** @typedef {import('$lib/studio-tabs.js').TableTabState} TableTabState */

  let {
    /** @type {StudioTab | null} */
    tab = null,
  } = $props()

  const tableState = $derived(
    tab?.kind === 'table' && tab.state ? /** @type {TableTabState} */ (tab.state) : null,
  )

  // Local, throwaway bindable state so DataTable's editing/selection machinery
  // has somewhere to write. Background panes are read-only, so nothing here is
  // persisted back to the tab.
  let selected = $state(new Set())
  let focusedRow = $state(/** @type {number | null} */ (null))
  let inspectorRow = $state(/** @type {number | null} */ (null))
  let editingCell = $state(/** @type {any} */ (null))
</script>

{#if tableState}
  {#if !tableState.table}
    <div class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <Table2 class="size-6 text-muted-foreground/30" />
      <p class="font-mono text-ui-xs text-muted-foreground/60">No table</p>
    </div>
  {:else if tableState.columns.length === 0}
    <div class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <Table2 class="size-6 text-muted-foreground/30" />
      <p class="font-mono text-ui-xs text-muted-foreground/60">Focus this pane to load {tableState.table}</p>
    </div>
  {:else}
    <div class="flex min-h-0 min-w-0 flex-1">
      <DataTable
        columns={tableState.columns}
        rows={tableState.rows}
        primaryKey={tableState.primaryKey}
        foreignKeys={tableState.foreignKeys}
        schema={tableState.schema}
        tableName={tableState.table}
        hiddenColumns={tableState.hiddenColumns}
        rowSort={tableState.rowSort}
        searchQuery={tableState.rowSearch}
        columnWidthsKey={`${tableState.schema}.${tableState.table}`}
        loading={false}
        readonly={true}
        bind:selected
        bind:focusedRow
        bind:inspectorRow
        bind:editingCell
      />
    </div>
  {/if}
{:else}
  <div class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
    <PanelLeft class="size-7 text-muted-foreground/25" />
    <div class="space-y-1">
      <p class="text-ui-sm font-medium text-foreground/70">{tab ? tabDisplayTitle(tab) : 'Empty pane'}</p>
      <p class="max-w-xs text-ui-xs text-muted-foreground/60">
        Click this pane to focus it and interact with this view.
      </p>
    </div>
  </div>
{/if}
