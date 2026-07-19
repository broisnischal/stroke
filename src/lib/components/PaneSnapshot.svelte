<script>
  import DataTable from './DataTable.svelte'
  import ShikiBlock from './ShikiBlock.svelte'
  import Table2 from '@lucide/svelte/icons/table-2'
  import PanelLeft from '@lucide/svelte/icons/panel-left'
  import TerminalSquare from '@lucide/svelte/icons/terminal-square'
  import { tabDisplayTitle } from '$lib/studio-tabs.js'

  /** @typedef {import('$lib/studio-tabs.js').StudioTab} StudioTab */
  /** @typedef {import('$lib/studio-tabs.js').TableTabState} TableTabState */
  /** @typedef {import('$lib/studio-tabs.js').SqlTabState} SqlTabState */

  let {
    /** @type {StudioTab | null} */
    tab = null,
    /** Reserve a toolbar-height strip so a background table pane lines up with
        the focused pane (which renders the table toolbar) — prevents the grid
        from jumping when focus moves between split panes. */
    toolbarSpacer = false,
  } = $props()

  const tableState = $derived(
    tab?.kind === 'table' && tab.state ? /** @type {TableTabState} */ (tab.state) : null,
  )
  const sqlState = $derived(
    tab?.kind === 'sql' && tab.state ? /** @type {SqlTabState} */ (tab.state) : null,
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
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    {#if toolbarSpacer}
      <!-- Matches the focused pane's TableToolbar (h-9) so the grid doesn't jump
           vertically when focus moves between split panes. -->
      <div class="h-9 shrink-0 border-b border-border bg-panel"></div>
    {/if}
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
  </div>
{:else if sqlState}
  <!-- SQL / Query Editor snapshot: the query text plus its last results, read-only,
       so a defocused pane still shows its work instead of an empty placeholder. -->
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    {#if sqlState.sqlText?.trim()}
      <div class="flex max-h-[38%] min-h-0 shrink-0 flex-col overflow-hidden border-b border-border/50">
        <ShikiBlock code={sqlState.sqlText} lang="sql" />
      </div>
    {/if}
    {#if sqlState.sqlColumns?.length}
      <div class="flex min-h-0 min-w-0 flex-1">
        <DataTable
          columns={sqlState.sqlColumns}
          rows={sqlState.sqlRows}
          primaryKey={[]}
          foreignKeys={[]}
          loading={false}
          readonly={true}
          bind:selected
          bind:focusedRow
          bind:inspectorRow
          bind:editingCell
        />
      </div>
    {:else}
      <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <TerminalSquare class="size-6 text-muted-foreground/25" />
        {#if sqlState.sqlError}
          <p class="max-w-md font-mono text-ui-2xs text-destructive/70">{sqlState.sqlError}</p>
        {:else if sqlState.sqlMessage}
          <p class="font-mono text-ui-xs text-muted-foreground/60">{sqlState.sqlMessage}</p>
        {:else}
          <p class="font-mono text-ui-xs text-muted-foreground/50">
            {sqlState.sqlText?.trim() ? 'No results yet' : 'Empty query'}
          </p>
        {/if}
      </div>
    {/if}
  </div>
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
