<script>
  import Table2         from '@lucide/svelte/icons/table-2'
  import Terminal       from '@lucide/svelte/icons/terminal'
  import Code2          from '@lucide/svelte/icons/code-2'
  import LayoutTemplate from '@lucide/svelte/icons/layout-template'
  import Settings       from '@lucide/svelte/icons/settings'
  import Unplug      from '@lucide/svelte/icons/unplug'
  import Database    from '@lucide/svelte/icons/database'
  import HardDrive   from '@lucide/svelte/icons/hard-drive'
  import Cloud       from '@lucide/svelte/icons/cloud'
  import RefreshCw   from '@lucide/svelte/icons/refresh-cw'
  import CornerDownLeft from '@lucide/svelte/icons/corner-down-left'
  import Bot         from '@lucide/svelte/icons/bot'
  import Sparkles    from '@lucide/svelte/icons/sparkles'
  import Keyboard    from '@lucide/svelte/icons/keyboard'
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right'
  import ArrowDownToLine from '@lucide/svelte/icons/arrow-down-to-line'
  import Info from '@lucide/svelte/icons/info'
  import History from '@lucide/svelte/icons/history'
  import Bookmark from '@lucide/svelte/icons/bookmark'
  import ShieldCheck from '@lucide/svelte/icons/shield-check'
  import Package from '@lucide/svelte/icons/package'
  import * as Command from '$lib/components/ui/command/index.js'
  import { formatTableRowCount } from '$lib/table-list.js'

  let {
    open = $bindable(false),
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

  function run(action) {
    open = false
    action()
  }
</script>

<Command.Dialog
  bind:open
  title="Command menu"
  description="Search tables, schemas, and commands"
  class="sm:max-w-lg"
>
  {#snippet children()}
    <Command.Input placeholder="Search tables, schemas, commands…" />
    <Command.List class="max-h-[min(400px,55vh)]">
      <Command.Empty>No results.</Command.Empty>

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
              <Command.Item
                value="schema {schema}"
                onSelect={() => run(() => onschemachange(schema))}
              >
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
            {#each tables as table (table.name)}
              <Command.Item
                value="table {activeSchema} {table.name}"
                onSelect={() => run(() => ontableselect(table.name))}
              >
                <Table2 class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate font-mono">{table.name}</span>
                <span
                  data-slot="command-trailing"
                  class="shrink-0 font-mono text-ui-xs tabular-nums text-muted-foreground"
                  title={table.rowCount != null ? Number(table.rowCount).toLocaleString('en-US') : undefined}
                >
                  {formatTableRowCount(table.rowCount)}
                </span>
              </Command.Item>
            {/each}
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
            <Command.Shortcut keys="⌘⇧E" />
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Queries">
          <Command.Item
            value="open query history sql statements"
            onSelect={() => run(onopenqueryhistory)}
          >
            <History class="size-4 shrink-0 opacity-60" />
            <span data-slot="command-label" class="truncate">Query history</span>
          </Command.Item>
        </Command.Group>

        {#if savedQueries.length > 0}
          <Command.Group heading="Saved queries">
            {#each savedQueries as entry (entry.id)}
              <Command.Item
                value="saved query {entry.name} {entry.sql}"
                onSelect={() => run(() => onqueryselect(entry.sql))}
              >
                <Bookmark class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="min-w-0 truncate font-mono text-ui-xs">{entry.name}</span>
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}

        {#if queryHistory.length > 0}
          <Command.Group heading="Recent queries">
            {#each queryHistory.slice(0, 20) as entry (entry.id)}
              <Command.Item
                value="recent query {entry.title} {entry.sql}"
                onSelect={() => run(() => onqueryselect(entry.sql))}
              >
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
      {:else if savedConnections.length === 0}
        <Command.Group heading="Connection">
          <Command.Item value="add connection connect postgres" onSelect={() => run(onopenconnection)}>
            <Database class="size-4 shrink-0 opacity-60" />
            <span data-slot="command-label" class="truncate">Add connection</span>
          </Command.Item>
        </Command.Group>
      {/if}

      <!-- ── Docker ──────────────────────────────────────────────────── -->
      <Command.Group heading="Docker">
        <Command.Item value="docker launch postgresql postgres pull run container" onSelect={() => run(() => ondockerlaunch('postgres'))}>
          <Package class="size-4 shrink-0 opacity-60" />
          <span data-slot="command-label" class="truncate">Launch PostgreSQL container</span>
          <span data-slot="command-trailing" class="shrink-0 font-mono text-ui-2xs text-muted-foreground">:5433</span>
        </Command.Item>
        <Command.Item value="docker launch mysql pull run container" onSelect={() => run(() => ondockerlaunch('mysql'))}>
          <Package class="size-4 shrink-0 opacity-60" />
          <span data-slot="command-label" class="truncate">Launch MySQL container</span>
          <span data-slot="command-trailing" class="shrink-0 font-mono text-ui-2xs text-muted-foreground">:3307</span>
        </Command.Item>
      </Command.Group>

      <!-- ── Switch database — always at the bottom ─────────────────── -->
      {#if savedConnections.length > 0}
        <Command.Group heading="Switch database">
          {#each savedConnections as conn (conn.id)}
            {@const Icon = driverIcon(conn.type ?? 'postgres')}
            {@const isActive = conn.id === activeConnectionId}
            <Command.Item
              value="switch database connection {conn.name} {connSubtitle(conn)} {conn.type}"
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

          <Command.Item
            value="new connection add connect database"
            onSelect={() => run(onopenconnection)}
          >
            <Database class="size-4 shrink-0 opacity-60" />
            <span data-slot="command-label" class="truncate">New connection…</span>
          </Command.Item>
        </Command.Group>
      {/if}
    </Command.List>
  {/snippet}
</Command.Dialog>
