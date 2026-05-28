<script>
  import Table2         from '@lucide/svelte/icons/table-2'
  import Terminal       from '@lucide/svelte/icons/terminal'
  import Code2          from '@lucide/svelte/icons/code-2'
  import LayoutTemplate from '@lucide/svelte/icons/layout-template'
  import Settings       from '@lucide/svelte/icons/settings'
  import Unplug         from '@lucide/svelte/icons/unplug'
  import Database       from '@lucide/svelte/icons/database'
  import HardDrive      from '@lucide/svelte/icons/hard-drive'
  import Cloud          from '@lucide/svelte/icons/cloud'
  import RefreshCw      from '@lucide/svelte/icons/refresh-cw'
  import Bot            from '@lucide/svelte/icons/bot'
  import Sparkles       from '@lucide/svelte/icons/sparkles'
  import Keyboard       from '@lucide/svelte/icons/keyboard'
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right'
  import ArrowDownToLine from '@lucide/svelte/icons/arrow-down-to-line'
  import Info           from '@lucide/svelte/icons/info'
  import History        from '@lucide/svelte/icons/history'
  import Bookmark       from '@lucide/svelte/icons/bookmark'
  import ShieldCheck    from '@lucide/svelte/icons/shield-check'
  import Package        from '@lucide/svelte/icons/package'
  import ChevronRight   from '@lucide/svelte/icons/chevron-right'
  import ChevronLeft    from '@lucide/svelte/icons/chevron-left'
  import Eye            from '@lucide/svelte/icons/eye'
  import * as Command from '$lib/components/ui/command/index.js'
  import { formatTableRowCount } from '$lib/table-list.js'

  let {
    open = $bindable(false),
    /** @type {'root' | 'docker' | 'connections' | 'tables'} */
    page = $bindable('root'),
    connected = false,
    schemas = [],
    tables = [],
    activeSchema = 'public',
    /** @type {import('$lib/stores/connections.js').SavedConnection[]} */
    savedConnections = [],
    /** Currently connected connection id (to mark it) */
    activeConnectionId = '',
    ontableselect = () => {},
    onschemachange = () => {},
    onopensql = () => {},
    onopentable = () => {},
    onopensettings = () => {},
    onopenconnection = () => {},
    ondisconnect = () => {},
    onrefresh = () => {},
    onopenai = () => {},
    onopenaisidebar = () => {},
    /** Whether the app is currently in AI mode (fullscreen chat) */
    aiMode = false,
    /** Toggle between AI mode and dev mode */
    ontoggleaimode = () => {},
    onopenorm = () => {},
    onopenSchema = () => {},
    onopensecurity = () => {},
    onopenlogs = () => {},
    onopenshortcuts = () => {},
    onopenabout = () => {},
    oncheckupdate = () => {},
    /** @param {'postgres'|'mysql'} dbType */
    ondockerlaunch = (dbType) => {},
    /** @param {import('$lib/stores/connections.js').SavedConnection} conn */
    onswitchdatabase = (conn) => {},
    /** @type {import('$lib/stores/query-history.js').QueryHistoryEntry[]} */
    queryHistory = [],
    /** @type {import('$lib/stores/query-history.js').SavedQuery[]} */
    savedQueries = [],
    /** @param {string} sql */
    onqueryselect = (sql) => {},
    onopenqueryhistory = () => {},
  } = $props()

  /** @param {'docker' | 'connections' | 'tables'} target */
  function navigate(target) {
    page = target
  }

  function goBack() {
    page = 'root'
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    if (page !== 'root' && e.key === 'Backspace') {
      const input = /** @type {HTMLInputElement | null} */ (
        e.currentTarget instanceof Element
          ? e.currentTarget.querySelector('[data-slot="command-input"]')
          : null
      )
      if (!input || input.value === '') {
        e.preventDefault()
        goBack()
      }
    }
  }

  $effect(() => {
    if (!open) page = 'root'
  })

  // Re-focus the search input after the Dialog's focus trap has settled.
  // tick() alone is too early — bits-ui's focus trap runs in a rAF after open,
  // overriding any focus we set in a microtask. Double rAF beats the trap.
  $effect(() => {
    open  // dependency
    page  // dependency
    if (!open) return
    let id1 = requestAnimationFrame(() => {
      let id2 = requestAnimationFrame(() => {
        /** @type {HTMLInputElement | null} */
        const input = document.querySelector('[data-slot="command-input"] input')
        input?.focus()
      })
      return () => cancelAnimationFrame(id2)
    })
    return () => cancelAnimationFrame(id1)
  })

  // Derived table groups — used in both the root page and the dedicated tables page
  const regularTables = $derived(tables.filter((t) => !t.tableKind || t.tableKind === 'table' || t.tableKind === 'foreign_table'))
  const viewTables    = $derived(tables.filter((t) => t.tableKind === 'view'))
  const matViewTables = $derived(tables.filter((t) => t.tableKind === 'materialized_view'))

  /** @param {() => void} action */
  function run(action) {
    open = false
    action()
  }

  /** @param {'postgres'|'sqlite'|'d1'} type */
  function driverIcon(type) {
    if (type === 'sqlite') return HardDrive
    if (type === 'd1')     return Cloud
    return Database
  }

  /** @param {import('$lib/stores/connections.js').SavedConnection} conn */
  function connSubtitle(conn) {
    if (conn.type === 'sqlite') return conn.filePath ?? ''
    if (conn.type === 'd1')     return `${conn.accountId?.slice(0, 8) ?? ''}… / ${conn.databaseId?.slice(0, 8) ?? ''}…`
    return `${conn.user ?? ''}@${conn.host ?? ''}:${conn.port ?? ''}/${conn.database ?? ''}`
  }

  const pageLabel = /** @type {Record<string, string>} */ ({
    docker: 'Docker',
    connections: 'Connections',
    tables: 'Tables',
  })
</script>

<Command.Dialog
  bind:open
  title="Command menu"
  description="Search tables, schemas, and commands"
  class="sm:max-w-lg"
>
  {#snippet children()}
    <!-- breadcrumb shown when in a sub-page -->
    {#if page !== 'root'}
      <div class="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <button
          type="button"
          tabindex="-1"
          class="flex items-center gap-1 text-ui-xs text-muted-foreground transition-colors hover:text-foreground"
          onclick={goBack}
        >
          <ChevronLeft class="size-3.5" />
          Back
        </button>
        <span class="text-ui-xs text-muted-foreground/40">/</span>
        <span class="text-ui-xs font-medium text-foreground">{pageLabel[page]}</span>
      </div>
    {/if}

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div onkeydown={handleKeydown}>
      <Command.Input
        placeholder={
          page === 'root' ? 'Search tables, schemas, commands…'
          : page === 'tables' ? 'Search tables and views…'
          : `Search ${pageLabel[page]}…`
        }
      />

      <Command.List class="max-h-[min(400px,55vh)]">
        <Command.Empty>No results.</Command.Empty>

        <!-- ── ROOT PAGE ─────────────────────────────────────────────── -->
        {#if page === 'root'}

          {#if connected}
            <Command.Group heading="Views">
              <Command.Item value="open table data browser" onSelect={() => run(onopentable)}>
                <Table2 class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Table data</span>
                <Command.Shortcut keys="⌘⇧D" />
              </Command.Item>
              <Command.Item value="open sql editor query console" onSelect={() => run(onopensql)}>
                <Terminal class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">SQL editor</span>
                <Command.Shortcut keys="⌘⇧S" />
              </Command.Item>
              <Command.Item value="open orm runner drizzle prisma query builder" onSelect={() => run(onopenorm)}>
                <Code2 class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">ORM Runner</span>
                <Command.Shortcut keys="⌘⇧O" />
              </Command.Item>
              <Command.Item value="open schema explorer indexes enums views materialized" onSelect={() => run(onopenSchema)}>
                <LayoutTemplate class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Schema Explorer</span>
              </Command.Item>
              <Command.Item value="open security roles users policies rls row level" onSelect={() => run(onopensecurity)}>
                <ShieldCheck class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Security</span>
              </Command.Item>
              <Command.Item value="open activity log events history operations" onSelect={() => run(onopenlogs)}>
                <History class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Activity Log</span>
              </Command.Item>
            </Command.Group>

            {#if schemas.length > 0}
              <Command.Group heading="Schemas">
                {#each schemas as schema (schema)}
                  <Command.Item value="schema {schema}" onSelect={() => run(() => onschemachange(schema))}>
                    <Database class="size-4 shrink-0 opacity-60" />
                    <span data-slot="command-label" class="truncate font-mono">{schema}</span>
                    {#if schema === activeSchema}
                      <span data-slot="command-trailing" class="shrink-0 text-ui-xs text-muted-foreground">current</span>
                    {/if}
                  </Command.Item>
                {/each}
              </Command.Group>
            {/if}

            {#if tables.length > 0}
              <Command.Group heading="Tables">
                {#each regularTables.slice(0, 8) as table (table.name)}
                  <Command.Item value="table {activeSchema} {table.name}" onSelect={() => run(() => ontableselect(table.name))}>
                    <Table2 class="size-4 shrink-0 opacity-60" />
                    <span data-slot="command-label" class="truncate font-mono">{table.name}</span>
                    <span data-slot="command-trailing" class="shrink-0 font-mono text-ui-xs tabular-nums text-muted-foreground">{formatTableRowCount(table.rowCount)}</span>
                  </Command.Item>
                {/each}
                {#each viewTables.slice(0, 4) as table (table.name)}
                  <Command.Item value="view {activeSchema} {table.name}" onSelect={() => run(() => ontableselect(table.name))}>
                    <Eye class="size-4 shrink-0 opacity-60" />
                    <span data-slot="command-label" class="truncate font-mono">{table.name}</span>
                    <span data-slot="command-trailing" class="shrink-0 text-ui-xs text-muted-foreground">view</span>
                  </Command.Item>
                {/each}
                {#if tables.length > 12}
                  <Command.Item value="browse all tables views search" onSelect={() => navigate('tables')}>
                    <Table2 class="size-4 shrink-0 opacity-40" />
                    <span data-slot="command-label" class="truncate text-muted-foreground">All {tables.length} tables & views…</span>
                    <ChevronRight class="size-3.5 shrink-0 text-muted-foreground/40" />
                  </Command.Item>
                {/if}
              </Command.Group>
            {/if}

            <Command.Group heading="AI">
              <Command.Item value="ask ai assistant chat query" onSelect={() => run(onopenai)}>
                <Bot class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Ask AI</span>
                <Command.Shortcut keys="⌘⇧E" />
              </Command.Item>
              <Command.Item value="toggle ai sidebar inline assistant context" onSelect={() => run(onopenaisidebar)}>
                <Sparkles class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">AI sidebar</span>
                <Command.Shortcut keys="⌘I" />
              </Command.Item>
              <Command.Item
                value={aiMode ? "close ai panel hide assistant" : "open ai panel show assistant chat"}
                onSelect={() => run(ontoggleaimode)}
              >
                <ArrowLeftRight class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">{aiMode ? 'Close AI panel' : 'Open AI panel'}</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Queries">
              <Command.Item value="open query history sql statements" onSelect={() => run(onopenqueryhistory)}>
                <History class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Query history</span>
              </Command.Item>
            </Command.Group>

            {#if savedQueries.length > 0}
              <Command.Group heading="Saved queries">
                {#each savedQueries as entry (entry.id)}
                  <Command.Item value="saved query {entry.name} {entry.sql}" onSelect={() => run(() => onqueryselect(entry.sql))}>
                    <Bookmark class="size-4 shrink-0 opacity-60" />
                    <span data-slot="command-label" class="min-w-0 truncate font-mono text-ui-xs">{entry.name}</span>
                  </Command.Item>
                {/each}
              </Command.Group>
            {/if}

            {#if queryHistory.length > 0}
              <Command.Group heading="Recent queries">
                {#each queryHistory.slice(0, 20) as entry (entry.id)}
                  <Command.Item value="recent query {entry.title} {entry.sql}" onSelect={() => run(() => onqueryselect(entry.sql))}>
                    <History class="size-4 shrink-0 opacity-60" />
                    <span data-slot="command-label" class="min-w-0 truncate font-mono text-ui-xs">{entry.title}</span>
                  </Command.Item>
                {/each}
              </Command.Group>
            {/if}

            <Command.Group heading="Actions">
              <Command.Item value="refresh schema tables" onSelect={() => run(onrefresh)}>
                <RefreshCw class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Refresh tables</span>
              </Command.Item>
              <Command.Item value="open settings preferences" onSelect={() => run(onopensettings)}>
                <Settings class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Settings</span>
              </Command.Item>
              <Command.Item value="keyboard shortcuts keybindings hotkeys help" onSelect={() => run(onopenshortcuts)}>
                <Keyboard class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Keyboard shortcuts</span>
                <Command.Shortcut keys="?" />
              </Command.Item>
              <Command.Item value="about license version info app" onSelect={() => run(onopenabout)}>
                <Info class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">About DB Studio</span>
              </Command.Item>
              <Command.Item value="check for updates upgrade version" onSelect={() => run(oncheckupdate)}>
                <ArrowDownToLine class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Check for updates</span>
              </Command.Item>
              <Command.Item value="disconnect database" onSelect={() => run(ondisconnect)}>
                <Unplug class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Disconnect</span>
              </Command.Item>
            </Command.Group>
          {/if}

          <!-- ── Drill-in: Connections ───────────────────────────────── -->
          <Command.Group heading="Database">
            <Command.Item
              value="connections switch database connect postgres mysql sqlite saved {savedConnections.map(c => c.name).join(' ')}"
              onSelect={() => navigate('connections')}
            >
              <Database class="size-4 shrink-0 opacity-60" />
              <span data-slot="command-label" class="truncate">Connections</span>
              {#if savedConnections.length > 0}
                <span class="shrink-0 font-mono text-ui-xs text-muted-foreground">{savedConnections.length}</span>
              {/if}
              <ChevronRight class="size-3.5 shrink-0 text-muted-foreground/40" />
            </Command.Item>
          </Command.Group>

          <!-- ── Drill-in: Docker ───────────────────────────────────── -->
          <Command.Group heading="Launch">
            <Command.Item value="docker containers postgresql mysql launch run" onSelect={() => navigate('docker')}>
              <Package class="size-4 shrink-0 opacity-60" />
              <span data-slot="command-label" class="truncate">Docker</span>
              <ChevronRight class="size-3.5 shrink-0 text-muted-foreground/40" />
            </Command.Item>
          </Command.Group>

        <!-- ── TABLES PAGE ───────────────────────────────────────────── -->
        {:else if page === 'tables'}
          {#if regularTables.length > 0}
            <Command.Group heading="Tables">
              {#each regularTables as table (table.name)}
                <Command.Item value="table {activeSchema} {table.name} {table.name}" onSelect={() => run(() => ontableselect(table.name))}>
                  <Table2 class="size-4 shrink-0 opacity-60" />
                  <span data-slot="command-label" class="truncate font-mono">{table.name}</span>
                  <span
                    data-slot="command-trailing"
                    class="shrink-0 font-mono text-ui-xs tabular-nums text-muted-foreground"
                    title={table.rowCount != null ? Number(table.rowCount).toLocaleString('en-US') : undefined}
                  >{formatTableRowCount(table.rowCount)}</span>
                </Command.Item>
              {/each}
            </Command.Group>
          {/if}
          {#if viewTables.length > 0}
            <Command.Group heading="Views">
              {#each viewTables as table (table.name)}
                <Command.Item value="view {activeSchema} {table.name} {table.name}" onSelect={() => run(() => ontableselect(table.name))}>
                  <Eye class="size-4 shrink-0 opacity-60" />
                  <span data-slot="command-label" class="truncate font-mono">{table.name}</span>
                </Command.Item>
              {/each}
            </Command.Group>
          {/if}
          {#if matViewTables.length > 0}
            <Command.Group heading="Materialized views">
              {#each matViewTables as table (table.name)}
                <Command.Item value="materialized view {activeSchema} {table.name} {table.name}" onSelect={() => run(() => ontableselect(table.name))}>
                  <Eye class="size-4 shrink-0 opacity-60" />
                  <span data-slot="command-label" class="truncate font-mono">{table.name}</span>
                  <span
                    data-slot="command-trailing"
                    class="shrink-0 font-mono text-ui-xs tabular-nums text-muted-foreground"
                  >{formatTableRowCount(table.rowCount)}</span>
                </Command.Item>
              {/each}
            </Command.Group>
          {/if}

        <!-- ── DOCKER PAGE ────────────────────────────────────────────── -->
        {:else if page === 'docker'}
          <Command.Group heading="Docker containers">
            <Command.Item
              value="launch postgresql postgres container pull run 5433"
              onSelect={() => run(() => ondockerlaunch('postgres'))}
            >
              <Package class="size-4 shrink-0 opacity-60" />
              <span data-slot="command-label" class="truncate">PostgreSQL container</span>
              <span data-slot="command-trailing" class="shrink-0 font-mono text-ui-2xs text-muted-foreground">:5433</span>
            </Command.Item>
            <Command.Item
              value="launch mysql container pull run 3307"
              onSelect={() => run(() => ondockerlaunch('mysql'))}
            >
              <Package class="size-4 shrink-0 opacity-60" />
              <span data-slot="command-label" class="truncate">MySQL container</span>
              <span data-slot="command-trailing" class="shrink-0 font-mono text-ui-2xs text-muted-foreground">:3307</span>
            </Command.Item>
          </Command.Group>

        <!-- ── CONNECTIONS PAGE ───────────────────────────────────────── -->
        {:else if page === 'connections'}
          {#if savedConnections.length > 0}
            <Command.Group heading="Saved connections">
              {#each savedConnections as conn (conn.id)}
                {@const Icon = driverIcon(conn.type ?? 'postgres')}
                {@const isActive = conn.id === activeConnectionId}
                <Command.Item
                  value="connection {conn.name} {connSubtitle(conn)} {conn.type}"
                  onSelect={() => run(() => onswitchdatabase(conn))}
                  disabled={isActive}
                >
                  <Icon class="size-4 shrink-0 opacity-60" />
                  <div data-slot="command-label" class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate">{conn.name}</span>
                    <span class="truncate font-mono text-[11px] text-muted-foreground">{connSubtitle(conn)}</span>
                  </div>
                  {#if isActive}
                    <span data-slot="command-trailing" class="shrink-0 text-xs text-muted-foreground">connected</span>
                  {/if}
                </Command.Item>
              {/each}
            </Command.Group>
          {/if}
          <Command.Group heading="Add">
            <Command.Item value="new connection add connect database" onSelect={() => run(onopenconnection)}>
              <Database class="size-4 shrink-0 opacity-60" />
              <span data-slot="command-label" class="truncate">New connection…</span>
            </Command.Item>
          </Command.Group>
        {/if}

      </Command.List>
    </div>
  {/snippet}
</Command.Dialog>
