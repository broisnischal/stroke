<script>
  import Database     from '@lucide/svelte/icons/database'
  import HardDrive    from '@lucide/svelte/icons/hard-drive'
  import Wifi         from '@lucide/svelte/icons/wifi'
  import WifiOff      from '@lucide/svelte/icons/wifi-off'
  import Server       from '@lucide/svelte/icons/server'
  import Bot          from '@lucide/svelte/icons/bot'
  import ArrowUpCircle from '@lucide/svelte/icons/arrow-up-circle'
  import Settings2    from '@lucide/svelte/icons/settings-2'
  import ChevronDown  from '@lucide/svelte/icons/chevron-down'
  import RefreshCw    from '@lucide/svelte/icons/refresh-cw'
  import Radio        from '@lucide/svelte/icons/radio'
  import Check        from '@lucide/svelte/icons/check'
  import Table2       from '@lucide/svelte/icons/table-2'
  import Terminal     from '@lucide/svelte/icons/terminal'
  import LayoutTemplate from '@lucide/svelte/icons/layout-template'
  import History      from '@lucide/svelte/icons/history'
  import Archive      from '@lucide/svelte/icons/archive'
  import BarChart2    from '@lucide/svelte/icons/bar-chart-2'
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard'
  import ShieldCheck  from '@lucide/svelte/icons/shield-check'
  import Code2        from '@lucide/svelte/icons/code-2'
  import Settings     from '@lucide/svelte/icons/settings'
  import Unplug       from '@lucide/svelte/icons/unplug'
  import Command      from '@lucide/svelte/icons/command'
  import Cloud        from '@lucide/svelte/icons/cloud'
  import Undo2        from '@lucide/svelte/icons/undo-2'
  import ChevronsUp   from '@lucide/svelte/icons/chevrons-up'
  import ChevronsDown from '@lucide/svelte/icons/chevrons-down'
  import Plus         from '@lucide/svelte/icons/plus'
  import MoreHorizontal from '@lucide/svelte/icons/more-horizontal'
  import GitBranch     from '@lucide/svelte/icons/git-branch'
  import Sun          from '@lucide/svelte/icons/sun'
  import Moon         from '@lucide/svelte/icons/moon'
  import Lock         from '@lucide/svelte/icons/lock'
  import LockOpen     from '@lucide/svelte/icons/lock-open'
  import { cn }       from '$lib/utils.js'
  import { aiProfiles, activeProfileId, setActiveProfile } from '$lib/stores/ai-settings.js'
  import { toggleLightDark, isCurrentThemeDark } from '$lib/stores/settings.js'
  import { executeSql, cloudflareListD1Databases } from '$lib/api.js'
  import { engineFamily } from '$lib/stores/connections.js'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js'
  import AppearanceMenu from './AppearanceMenu.svelte'
  import CreateDatabaseDialog from './CreateDatabaseDialog.svelte'

  let {
    /** @type {import('$lib/stores/connections.js').SavedConnection | null} */
    connection = null,
    connectionLost = false,
    /** @type {import('$lib/stores/connections.js').SavedConnection[]} */
    savedConnections = [],
    activeConnectionId = '',
    mcpRunning = false,
    hasUpdate = false,
    onopenmcp = /** @type {() => void} */ (() => {}),
    onconnect = /** @type {() => void} */ (() => {}),
    onswitchtodb = /** @type {(db: string) => void} */ ((_db) => {}),
    onswitchd1database = /** @type {(db: { databaseId: string, name: string }) => void} */ ((_db) => {}),
    onswitchconnection = /** @type {(conn: import('$lib/stores/connections.js').SavedConnection) => void} */ ((_c) => {}),
    oncheckupdate = /** @type {() => void} */ (() => {}),
    onopenmodelsettings = /** @type {() => void} */ (() => {}),
    aiMode = false,
    onopenaimode = /** @type {() => void} */ (() => {}),
    onopenSchema = /** @type {() => void} */ (() => {}),
    onopenlogs = /** @type {() => void} */ (() => {}),
    onopensecurity = /** @type {() => void} */ (() => {}),
    onopenorm = /** @type {() => void} */ (() => {}),
    onopenbackup = /** @type {() => void} */ (() => {}),
    onopenchartspage = /** @type {() => void} */ (() => {}),
    onopendashboard = /** @type {() => void} */ (() => {}),
    onopendiagrams = /** @type {() => void} */ (() => {}),
    onopensettings = /** @type {() => void} */ (() => {}),
    onopencommand = /** @type {() => void} */ (() => {}),
    ondisconnect = /** @type {() => void} */ (() => {}),
    activeView = /** @type {'table' | 'sql'} */ ('table'),
    onviewchange = /** @type {(v: 'table' | 'sql') => void} */ ((_v) => {}),
    pendingEditCount = 0,
    onapplyedits = /** @type {() => void} */ (() => {}),
    onresetedits = /** @type {() => void} */ (() => {}),
    showTableNav = false,
    onscrolltabletop = /** @type {() => void} */ (() => {}),
    onscrolltablebottom = /** @type {() => void} */ (() => {}),
    /** Live mode (auto-refresh active table) — Postgres/SQLite only. */
    live = false,
    liveSupported = false,
    ontogglelive = /** @type {() => void} */ (() => {}),
    oncreatedatabase = /** @type {(opts: import('./CreateDatabaseDialog.svelte').CreateDbOptions) => Promise<void>} */ (async () => {}),
    /** Global read-only toggle — prevents all writes across the whole session */
    readonly = $bindable(false),
    sidebarVisible       = true,
    tabBarVisible        = true,
    tableToolbarVisible  = true,
    statusBarVisible     = true,
    ontoggleSidebar       = /** @type {() => void} */ (() => {}),
    ontoggletabbar        = /** @type {() => void} */ (() => {}),
    ontoggletabletoolbar  = /** @type {() => void} */ (() => {}),
    ontogglestatusbar     = /** @type {() => void} */ (() => {}),
    hasPro = true,
  } = $props()

  const activeProfile = $derived($aiProfiles.find((p) => p.id === $activeProfileId) ?? $aiProfiles[0])
  const modelName = $derived(activeProfile?.name ?? 'No model')

  let dbOpen = $state(false)
  let createDbOpen = $state(false)
  /** Unified database list — `key` is what identifies a db (name for SQL, uuid for D1), `label` is what we show. */
  let dbList = $state(/** @type {{ key: string, label: string }[]} */ ([]))
  let dbLoading = $state(false)
  let dbSearch = $state('')

  const currentDb = $derived(
    connection?.type === 'libsql'
      ? (connection?.url ?? '').replace(/^(libsql|https?):\/\//, '').split('/')[0]
      : (connection?.database ?? connection?.filePath ?? '')
  )
  const isPostgres = $derived(engineFamily(connection?.type) === 'postgres' || engineFamily(connection?.type) === 'mysql')
  const isD1 = $derived(connection?.type === 'd1')
  /** Whether this connection supports switching databases in-place. */
  const canSwitchDb = $derived(isPostgres || isD1)
  /** Label shown in the trigger for the active db (D1 has no `database` field, so fall back to the connection name). */
  const currentDbLabel = $derived(isD1 ? (connection?.database || connection?.name || '') : currentDb)
  /** Key of the active db, used to mark the current row. */
  const currentDbKey = $derived(isD1 ? (connection?.databaseId ?? '') : currentDb)

  const dbFiltered = $derived(
    dbSearch.trim()
      ? dbList.filter((d) => d.label.toLowerCase().includes(dbSearch.toLowerCase()))
      : dbList,
  )

  async function fetchDatabases() {
    if (isPostgres) {
      dbLoading = true
      try {
        const result = await executeSql(
          `SELECT datname FROM pg_catalog.pg_database WHERE datistemplate = false ORDER BY datname`,
        )
        dbList = (result?.rows ?? []).map((r) => ({ key: String(r[0]), label: String(r[0]) }))
      } catch {
        dbList = []
      } finally {
        dbLoading = false
      }
    } else if (isD1 && connection?.accountId) {
      dbLoading = true
      try {
        // OAuth D1 connections keep the token in the Cloudflare token store
        // rather than on the connection, so fall back to it when absent.
        let token = connection.apiToken
        if (!token) {
          const { cfGetValidToken } = await import('$lib/cloudflare.js')
          token = await cfGetValidToken()
        }
        const dbs = await cloudflareListD1Databases(token, connection.accountId)
        dbList = (dbs ?? [])
          .map((/** @type {{ uuid: string, name: string }} */ d) => ({ key: d.uuid, label: d.name }))
          .sort((a, b) => a.label.localeCompare(b.label))
      } catch {
        dbList = []
      } finally {
        dbLoading = false
      }
    }
  }

  function switchDb(/** @type {{ key: string, label: string }} */ db) {
    if (db.key !== currentDbKey) {
      if (isD1) onswitchd1database({ databaseId: db.key, name: db.label })
      else onswitchtodb(db.label)
    }
    dbOpen = false
    dbSearch = ''
  }

  $effect(() => {
    connection
    dbList = []
  })

  const connType = $derived(
    connection?.type === 'sqlite' ? 'SQLite'
      : connection?.type === 'libsql' ? 'Turso'
      : connection?.type === 'mysql' ? 'MySQL'
      : connection?.type === 'mariadb' ? 'MariaDB'
      : connection?.type === 'cockroachdb' ? 'CockroachDB'
      : connection?.type === 'clickhouse' ? 'ClickHouse'
      : connection?.type === 'duckdb' ? 'DuckDB'
      : connection?.type === 'mssql' ? 'SQL Server'
      : connection?.type === 'd1' ? 'D1'
      : 'PostgreSQL',
  )
  const connLabel = $derived(connection?.name ?? connection?.host ?? '')
  let connOpen = $state(false)

  /** @param {import('$lib/stores/connections.js').SavedConnection} c */
  function connIcon(c) {
    if (c.type === 'sqlite') return HardDrive
    if (c.type === 'd1') return Cloud
    if (c.type === 'libsql') return Wifi
    return Database
  }

  /** Shared icon-only button classes */
  const iconBtn = 'inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground'
  /** Shared label+icon button */
  const labelBtn = 'flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-muted/50 hover:text-foreground data-[state=open]:bg-muted/50 data-[state=open]:text-foreground'

  // Tools menu — built from one list so every row renders identically.
  const toolItems = $derived.by(() => {
    const t = connection?.type ?? 'postgres'
    /** @type {{ label: string, icon: any, onclick: () => void }[]} */
    const items = []
    if (t === 'postgres' || t === 'mysql') items.push({ label: 'Schema Explorer', icon: LayoutTemplate, onclick: onopenSchema })
    items.push({ label: 'Activity Log', icon: History, onclick: onopenlogs })
    if (t === 'postgres') items.push({ label: 'Security', icon: ShieldCheck, onclick: onopensecurity })
    items.push({ label: 'ORM Runner', icon: Code2, onclick: onopenorm })
    items.push({ label: 'Backup & Restore', icon: Archive, onclick: onopenbackup })
    items.push({ label: 'Charts', icon: BarChart2, onclick: onopenchartspage })
    items.push({ label: 'Dashboard', icon: LayoutDashboard, onclick: onopendashboard })
    items.push({ label: 'Diagrams', icon: GitBranch, onclick: onopendiagrams })
    return items
  })
</script>

<!-- PRO chip -->
{#snippet proBadge()}
  <span class="ml-auto shrink-0 rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-500/90 dark:text-amber-400/80">PRO</span>
{/snippet}

<!-- Vertical separator -->
{#snippet sep()}
  <span class="mx-1 h-3.5 w-px shrink-0 bg-border/30"></span>
{/snippet}

<div
  class="flex h-8 shrink-0 items-center border-t border-border/30 bg-background px-2 text-[11px] text-muted-foreground select-none"
  data-studio-region="statusbar"
>
  <!-- ── Left group ──────────────────────────────────────────────────── -->
  <div class="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
    {#if connection}

      <!-- Connection switcher -->
      <DropdownMenu.Root bind:open={connOpen}>
        <DropdownMenu.Trigger
          class={cn(labelBtn, 'text-muted-foreground/80')}
          title="Switch connection"
        >
          {#if connectionLost}
            <WifiOff class="size-3 shrink-0 text-red-500" />
          {:else}
            <Wifi class="size-3 shrink-0 text-emerald-500" />
          {/if}
          <span class={cn('max-w-[7rem] truncate font-medium', connectionLost && 'text-red-500/70')}>{connType}</span>
          {#if connLabel}
            <span class="hidden max-w-[6rem] truncate text-muted-foreground/45 sm:inline">· {connLabel}</span>
          {/if}
          {#if connection?.environment}
            <span class="size-1.5 shrink-0 rounded-full bg-muted-foreground/35" title={connection.environment}></span>
          {/if}
          {#if savedConnections.length > 1}
            <ChevronDown class={cn('size-3 shrink-0 opacity-40 transition-transform', connOpen && 'rotate-180')} />
          {/if}
        </DropdownMenu.Trigger>

        {#if savedConnections.length > 0}
          <DropdownMenu.Content side="top" align="start" class="w-64">
            <DropdownMenu.Label>Connections</DropdownMenu.Label>
            {#each savedConnections as conn (conn.id)}
              {@const isCurrent = conn.id === activeConnectionId}
              {@const Icon = connIcon(conn)}
              {@const subtitle = conn.database && conn.database !== (conn.name ?? conn.host) ? conn.database : (conn.host ?? '')}
              <DropdownMenu.Item
                class="cursor-pointer items-start gap-2.5 py-1.5"
                onclick={() => { if (!isCurrent) onswitchconnection(conn); connOpen = false }}
              >
                <span class={cn(
                  'mt-px flex size-5 shrink-0 items-center justify-center rounded-md',
                  isCurrent ? 'bg-emerald-500/12 text-emerald-500' : 'bg-muted/50 text-muted-foreground/55',
                )}>
                  <Icon class="size-3.5" />
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <span class={cn('min-w-0 truncate text-[12px] leading-tight', isCurrent ? 'font-semibold text-foreground' : 'font-medium text-foreground/90')}>
                      {conn.name ?? conn.host ?? conn.filePath ?? 'Connection'}
                    </span>
                    {#if conn.environment}
                      <span class="size-1.5 shrink-0 rounded-full bg-muted-foreground/30" title={conn.environment}></span>
                    {/if}
                  </div>
                  {#if subtitle}
                    <div class="mt-0.5 truncate font-mono text-[10px] leading-tight text-muted-foreground/45">{subtitle}</div>
                  {/if}
                </div>
                {#if isCurrent}<Check class="ml-auto mt-0.5 size-3.5 shrink-0 text-emerald-500" />{/if}
              </DropdownMenu.Item>
            {/each}

            <DropdownMenu.Separator />

            <DropdownMenu.Item class="cursor-pointer gap-2.5" onclick={() => { connOpen = false; onconnect() }}>
              <span class="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted/50 text-muted-foreground/55">
                <WifiOff class="size-3.5" />
              </span>
              Manage connections…
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        {/if}
      </DropdownMenu.Root>

      {@render sep()}

      <!-- Database switcher + create button -->
      <div class="flex items-center">
        <DropdownMenu.Root
          bind:open={dbOpen}
          onOpenChange={(o) => { if (o && dbList.length === 0) void fetchDatabases(); if (!o) dbSearch = '' }}
        >
          <DropdownMenu.Trigger
            class={cn(labelBtn, 'text-muted-foreground/80')}
            title="Switch database"
          >
            {#if connection?.type === 'sqlite'}
              <HardDrive class="size-3 shrink-0" />
            {:else if isD1}
              <Cloud class="size-3 shrink-0" />
            {:else}
              <Database class="size-3 shrink-0" />
            {/if}
            <span class="max-w-[8rem] truncate font-mono">{currentDbLabel || 'No database'}</span>
            {#if canSwitchDb}
              <ChevronDown class={cn('size-3 shrink-0 opacity-40 transition-transform', dbOpen && 'rotate-180')} />
            {/if}
          </DropdownMenu.Trigger>

          <DropdownMenu.Content side="top" align="start" class="w-56 overflow-hidden p-0">
            {#if dbList.length > 5}
              <div class="border-b border-border/25 px-2 py-1.5">
                <input
                  type="text"
                  placeholder={isD1 ? 'Filter D1 databases…' : 'Filter databases…'}
                  class="h-7 w-full rounded-lg bg-muted/40 px-2.5 text-[11px] outline-none placeholder:text-muted-foreground/35 focus:ring-0"
                  bind:value={dbSearch}
                  onkeydown={(e) => { if (e.key === 'Escape') { dbSearch = ''; dbOpen = false } }}
                />
              </div>
            {/if}

            <div class="db-list-scroll max-h-[200px] overflow-y-auto p-1 [contain:layout_paint]">
              {#if dbLoading}
                <div class="flex items-center justify-center gap-2 py-4 text-muted-foreground/50">
                  <RefreshCw class="size-3 animate-spin" />
                  <span class="text-[11px]">Loading…</span>
                </div>
              {:else if dbFiltered.length === 0}
                <div class="py-3 text-center text-[11px] text-muted-foreground/45">
                  {dbSearch ? 'No match' : 'No databases found'}
                </div>
              {:else}
                {#each dbFiltered.slice(0, 200) as db (db.key)}
                  {@const isCurrent = db.key === currentDbKey}
                  <DropdownMenu.Item
                    class={cn('cursor-pointer font-mono', isCurrent && 'font-semibold')}
                    onclick={() => switchDb(db)}
                  >
                    {#if isD1}
                      <Cloud class={cn('size-3.5 shrink-0', isCurrent ? 'text-amber-500' : 'text-muted-foreground/35')} />
                    {:else}
                      <Database class={cn('size-3.5 shrink-0', isCurrent ? 'text-foreground' : 'text-muted-foreground/35')} />
                    {/if}
                    <span class="min-w-0 flex-1 truncate">{db.label}</span>
                    {#if isCurrent}<Check class="ml-auto size-3 shrink-0 text-emerald-500" />{/if}
                  </DropdownMenu.Item>
                {/each}
              {/if}
            </div>

            {#if canSwitchDb}
              <div class="flex items-center justify-between border-t border-border/25 px-2.5 py-1.5">
                <span class="text-[10px] text-muted-foreground/40">
                  {dbList.length} database{dbList.length === 1 ? '' : 's'}
                </span>
                <div class="flex items-center gap-0.5">
                  <button
                    type="button"
                    class="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-muted/50 hover:text-foreground"
                    onclick={fetchDatabases}
                    title="Refresh"
                  >
                    <RefreshCw class={cn('size-3', dbLoading && 'animate-spin')} />
                  </button>
                  {#if isPostgres}
                    <button
                      type="button"
                      class="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-muted/50 hover:text-foreground"
                      onclick={() => { dbOpen = false; createDbOpen = true }}
                      title="Create database"
                    >
                      <Plus class="size-3" />
                    </button>
                  {/if}
                </div>
              </div>
            {/if}
          </DropdownMenu.Content>
        </DropdownMenu.Root>

        {#if isPostgres}
          <button
            type="button"
            class={iconBtn}
            onclick={() => (createDbOpen = true)}
            title="Create new database"
            aria-label="Create new database"
          >
            <Plus class="size-3" />
          </button>
        {/if}
      </div>

      {@render sep()}

      <!-- Data / Query pill toggle -->
      <div class="flex items-center gap-px rounded-md bg-muted/20 p-0.5">
        <button
          type="button"
          class={cn(
            'flex items-center gap-1 rounded px-2 py-[3px] transition-all',
            activeView === 'table'
              ? 'bg-muted/70 text-foreground shadow-sm'
              : 'text-muted-foreground/50 hover:text-foreground',
          )}
          onclick={() => onviewchange('table')}
          title="Data view (⌘⇧D)"
        >
          <Table2 class="size-3 shrink-0" />
          <span class={activeView === 'table' ? 'font-medium' : ''}>Data</span>
        </button>
        <button
          type="button"
          class={cn(
            'flex items-center gap-1 rounded px-2 py-[3px] transition-all',
            activeView === 'sql'
              ? 'bg-muted/70 text-foreground shadow-sm'
              : 'text-muted-foreground/50 hover:text-foreground',
          )}
          onclick={() => onviewchange('sql')}
          title="Query Editor (⌘⇧S)"
        >
          <Terminal class="size-3 shrink-0" />
          <span class={activeView === 'sql' ? 'font-medium' : ''}>Query</span>
        </button>
      </div>

      <!-- Table scroll nav -->
      {#if showTableNav}
        {@render sep()}
        <div class="flex items-center gap-px">
          <button type="button" class={iconBtn} onclick={onscrolltabletop} title="Go to top" aria-label="Scroll to top">
            <ChevronsUp class="size-3.5" />
          </button>
          <button type="button" class={iconBtn} onclick={onscrolltablebottom} title="Go to bottom" aria-label="Scroll to bottom">
            <ChevronsDown class="size-3.5" />
          </button>
        </div>
      {/if}

      <!-- Live mode toggle — renders as an unmistakable badge when active -->
      {#if showTableNav && liveSupported}
        {@render sep()}
        <button
          type="button"
          class={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors',
            live
              ? 'bg-emerald-500/10 font-medium text-emerald-500 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/15'
              : 'text-muted-foreground/50 hover:bg-muted/50 hover:text-foreground',
          )}
          onclick={ontogglelive}
          aria-pressed={live}
          title={live ? 'Live: on — auto-refreshes when this table changes' : 'Live: off — click to auto-refresh on changes'}
        >
          {#if live}
            <span class="relative flex size-3 items-center justify-center">
              <span class="absolute inline-flex size-2.5 animate-ping rounded-full bg-emerald-500/50"></span>
              <span class="relative inline-flex size-1.5 rounded-full bg-emerald-500"></span>
            </span>
            <span class="text-ui-2xs font-semibold uppercase tracking-wide">Live</span>
          {:else}
            <Radio class="size-3 shrink-0" />
            <span>Live</span>
          {/if}
        </button>
      {/if}

    {:else}
      <!-- Not connected -->
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground"
        onclick={onconnect}
        title="No connection — click to connect"
      >
        <WifiOff class="size-3 shrink-0" />
        <span class="font-medium">Not connected</span>
      </button>
    {/if}
  </div>

  <!-- ── Right group ─────────────────────────────────────────────────── -->
  <div class="flex shrink-0 items-center gap-0.5">

    <!-- Pending edits -->
    {#if pendingEditCount > 0}
      <button
        type="button"
        class="inline-flex h-5 items-center gap-1 rounded-md bg-foreground px-2 text-[11px] font-medium text-background transition-opacity hover:opacity-80"
        onclick={onapplyedits}
        title="Apply {pendingEditCount} unsaved change{pendingEditCount === 1 ? '' : 's'}"
      >
        <Check class="size-2.5 shrink-0" />
        Apply {pendingEditCount}
      </button>
      <button
        type="button"
        class="inline-flex h-5 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground"
        onclick={onresetedits}
        title="Discard unsaved changes"
      >
        <Undo2 class="size-2.5 shrink-0" />
        Reset
      </button>
      {@render sep()}
    {/if}

    <!-- Tools overflow (all navigation tools in one dropdown) -->
    {#if connection}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger class={iconBtn} title="Tools">
          <MoreHorizontal class="size-3.5" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content side="top" align="end" class="w-52">
          <DropdownMenu.Label>Tools</DropdownMenu.Label>
          {#each toolItems as item (item.label)}
            {@const Icon = item.icon}
            <DropdownMenu.Item class="cursor-pointer" onclick={item.onclick}>
              <Icon class="size-3.5 shrink-0 text-muted-foreground/45" />
              <span class="truncate">{item.label}</span>
              {#if !hasPro}{@render proBadge()}{/if}
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      {@render sep()}
    {/if}

    <!-- AI toggle -->
    <button
      type="button"
      class={cn(iconBtn, aiMode ? 'text-primary! hover:text-primary!' : '')}
      onclick={onopenaimode}
      title={aiMode ? 'Close AI (⌘⇧E)' : 'Open AI (⌘⇧E)'}
    >
      <Bot class="size-3.5" />
    </button>

    <!-- Command palette -->
    <button type="button" class={iconBtn} onclick={onopencommand} title="Command menu (⌘K)">
      <Command class="size-3.5" />
    </button>

    <!-- Read-only toggle -->
    <button
      type="button"
      class={cn(iconBtn, readonly && 'text-amber-500! hover:text-amber-400!')}
      title={readonly ? 'Read-only mode — click to enable editing' : 'Read-write mode — click to lock'}
      aria-pressed={readonly}
      onclick={() => (readonly = !readonly)}
    >
      {#if readonly}
        <Lock class="size-3.5" />
      {:else}
        <LockOpen class="size-3.5" />
      {/if}
    </button>

    <!-- Theme toggle -->
    <button
      type="button"
      class={iconBtn}
      title={$isCurrentThemeDark ? 'Switch to light (⌘M)' : 'Switch to dark (⌘M)'}
      onclick={() => toggleLightDark()}
    >
      {#if $isCurrentThemeDark}
        <Sun class="size-3.5" />
      {:else}
        <Moon class="size-3.5" />
      {/if}
    </button>

    <!-- Appearance -->
    <AppearanceMenu
      {sidebarVisible}
      {tabBarVisible}
      {tableToolbarVisible}
      {statusBarVisible}
      {ontoggleSidebar}
      {ontoggletabbar}
      {ontoggletabletoolbar}
      {ontogglestatusbar}
    />

    <!-- Settings -->
    <button type="button" class={iconBtn} onclick={onopensettings} title="Settings (⌘,)">
      <Settings class="size-3.5" />
    </button>

    <!-- Disconnect -->
    {#if connection}
      <button
        type="button"
        class="{iconBtn} hover:text-destructive!"
        onclick={ondisconnect}
        title="Disconnect"
      >
        <Unplug class="size-3.5" />
      </button>
    {/if}

    {@render sep()}

    <!-- Update badge -->
    {#if hasUpdate}
      <button
        type="button"
        class="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-amber-500 transition-colors hover:bg-muted/50 hover:text-amber-400"
        onclick={oncheckupdate}
        title="Update available"
      >
        <ArrowUpCircle class="size-3 shrink-0" />
        Update
      </button>
      {@render sep()}
    {/if}

    <!-- MCP status -->
    <button
      type="button"
      class={cn(
        labelBtn,
        mcpRunning ? 'text-muted-foreground/70' : 'text-muted-foreground/30',
      )}
      onclick={onopenmcp}
      title={mcpRunning ? 'MCP running — click to manage' : 'MCP stopped — click to manage'}
    >
      <span class={cn('size-1.5 shrink-0 rounded-full transition-colors', mcpRunning ? 'bg-emerald-500' : 'bg-muted-foreground/25')}></span>
      <span class="font-medium">MCP</span>
    </button>

    {@render sep()}

    <!-- AI model picker -->
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class={cn(labelBtn, 'text-muted-foreground/70')}
        title="Switch AI model"
      >
        <Bot class="size-3 shrink-0 opacity-60" />
        <span class="max-w-[9rem] truncate font-medium">{modelName}</span>
        <ChevronDown class="size-3 shrink-0 opacity-35 transition-transform data-[state=open]:rotate-180" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Content side="top" align="end" class="w-56">
        <DropdownMenu.RadioGroup value={$activeProfileId} onValueChange={(v) => setActiveProfile(v)}>
          {#each $aiProfiles as profile (profile.id)}
            <DropdownMenu.RadioItem value={profile.id} class="cursor-pointer py-1.5">
              <div class="flex min-w-0 flex-col gap-0.5">
                <span class="truncate text-[13px] font-medium leading-tight">{profile.name}</span>
                <span class="truncate font-mono text-[10px] leading-tight text-muted-foreground/50">{profile.model}</span>
              </div>
            </DropdownMenu.RadioItem>
          {/each}
        </DropdownMenu.RadioGroup>

        <DropdownMenu.Separator />

        <DropdownMenu.Item class="cursor-pointer" onclick={onopenmodelsettings}>
          <Settings2 class="size-3.5 shrink-0 text-muted-foreground/50" />
          Manage models…
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>

  </div>
</div>

<CreateDatabaseDialog
  bind:open={createDbOpen}
  connType={connection?.type ?? 'postgres'}
  oncreate={async (opts) => {
    await oncreatedatabase(opts)
    dbList = []
  }}
/>
