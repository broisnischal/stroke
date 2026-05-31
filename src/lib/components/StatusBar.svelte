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
  import Sun          from '@lucide/svelte/icons/sun'
  import Moon         from '@lucide/svelte/icons/moon'
  import { cn }       from '$lib/utils.js'
  import { aiProfiles, activeProfileId, setActiveProfile } from '$lib/stores/ai-settings.js'
  import { toggleLightDark, isCurrentThemeDark } from '$lib/stores/settings.js'
  import { executeSql } from '$lib/api.js'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js'
  import CreateDatabaseDialog from './CreateDatabaseDialog.svelte'

  let {
    /** @type {import('$lib/stores/connections.js').SavedConnection | null} */
    connection = null,
    /** @type {import('$lib/stores/connections.js').SavedConnection[]} */
    savedConnections = [],
    activeConnectionId = '',
    mcpRunning = false,
    hasUpdate = false,
    onopenmcp = /** @type {() => void} */ (() => {}),
    onconnect = /** @type {() => void} */ (() => {}),
    onswitchtodb = /** @type {(db: string) => void} */ ((_db) => {}),
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
    oncreatedatabase = /** @type {(opts: import('./CreateDatabaseDialog.svelte').CreateDbOptions) => Promise<void>} */ (async () => {}),
  } = $props()

  const activeProfile = $derived($aiProfiles.find((p) => p.id === $activeProfileId) ?? $aiProfiles[0])
  const modelName = $derived(activeProfile?.name ?? 'No model')

  let dbOpen = $state(false)
  let createDbOpen = $state(false)
  /** @type {string[]} */
  let databases = $state([])
  let dbLoading = $state(false)
  let dbSearch = $state('')

  const currentDb = $derived(connection?.database ?? connection?.filePath ?? '')
  const isPostgres = $derived(connection?.type === 'postgres' || connection?.type === 'mysql')
  const dbFiltered = $derived(
    dbSearch.trim()
      ? databases.filter((d) => d.toLowerCase().includes(dbSearch.toLowerCase()))
      : databases,
  )

  async function fetchDatabases() {
    if (!isPostgres) return
    dbLoading = true
    try {
      const result = await executeSql(
        `SELECT datname FROM pg_catalog.pg_database WHERE datistemplate = false ORDER BY datname`,
      )
      databases = (result?.rows ?? []).map((r) => String(r[0]))
    } catch {
      databases = []
    } finally {
      dbLoading = false
    }
  }

  function switchDb(/** @type {string} */ db) {
    if (db !== currentDb) onswitchtodb(db)
    dbOpen = false
    dbSearch = ''
  }

  $effect(() => {
    connection
    databases = []
  })

  const connType = $derived(
    connection?.type === 'sqlite' ? 'SQLite'
      : connection?.type === 'mysql' ? 'MySQL'
      : connection?.type === 'd1' ? 'D1'
      : 'PostgreSQL',
  )
  const connLabel = $derived(connection?.name ?? connection?.host ?? '')
  let connOpen = $state(false)

  /** @param {import('$lib/stores/connections.js').SavedConnection} c */
  function connIcon(c) {
    if (c.type === 'sqlite') return HardDrive
    if (c.type === 'd1') return Cloud
    return Database
  }

  /** Shared icon-only button classes */
  const iconBtn = 'inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground'
  /** Shared label+icon button */
  const labelBtn = 'flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-muted/50 hover:text-foreground data-[state=open]:bg-muted/50 data-[state=open]:text-foreground'
</script>

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
          <Wifi class="size-3 shrink-0 text-emerald-500" />
          <span class="max-w-[7rem] truncate font-medium">{connType}</span>
          {#if connLabel}
            <span class="hidden max-w-[6rem] truncate text-muted-foreground/45 sm:inline">· {connLabel}</span>
          {/if}
          {#if savedConnections.length > 1}
            <ChevronDown class={cn('size-3 shrink-0 opacity-40 transition-transform', connOpen && 'rotate-180')} />
          {/if}
        </DropdownMenu.Trigger>

        {#if savedConnections.length > 0}
          <DropdownMenu.Content side="top" align="start" class="w-60">
            {#each savedConnections as conn (conn.id)}
              {@const isCurrent = conn.id === activeConnectionId}
              {@const Icon = connIcon(conn)}
              <DropdownMenu.Item
                class={cn('cursor-pointer', isCurrent && 'font-semibold')}
                onclick={() => { if (!isCurrent) onswitchconnection(conn); connOpen = false }}
              >
                <Icon class={cn('size-3.5 shrink-0', isCurrent ? 'text-foreground' : 'text-muted-foreground/35')} />
                <div class="min-w-0 flex-1">
                  <div class="truncate">{conn.name ?? conn.host ?? conn.filePath ?? 'Connection'}</div>
                  {#if conn.database && conn.database !== (conn.name ?? conn.host)}
                    <div class="truncate font-mono text-[10px] text-muted-foreground/45">{conn.database}</div>
                  {/if}
                </div>
                {#if isCurrent}<Check class="ml-auto size-3 shrink-0 text-emerald-500" />{/if}
              </DropdownMenu.Item>
            {/each}

            <DropdownMenu.Separator />

            <DropdownMenu.Item class="cursor-pointer" onclick={() => { connOpen = false; onconnect() }}>
              <WifiOff class="size-3.5 shrink-0 text-muted-foreground/40" />
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
          onOpenChange={(o) => { if (o && databases.length === 0) void fetchDatabases(); if (!o) dbSearch = '' }}
        >
          <DropdownMenu.Trigger
            class={cn(labelBtn, 'text-muted-foreground/80')}
            title="Switch database"
          >
            {#if connection?.type === 'sqlite'}
              <HardDrive class="size-3 shrink-0" />
            {:else}
              <Database class="size-3 shrink-0" />
            {/if}
            <span class="max-w-[8rem] truncate font-mono">{currentDb || 'No database'}</span>
            {#if isPostgres}
              <ChevronDown class={cn('size-3 shrink-0 opacity-40 transition-transform', dbOpen && 'rotate-180')} />
            {/if}
          </DropdownMenu.Trigger>

          <DropdownMenu.Content side="top" align="start" class="w-56 overflow-hidden p-0">
            {#if databases.length > 5}
              <div class="border-b border-border/25 px-2 py-1.5">
                <input
                  type="text"
                  placeholder="Filter databases…"
                  class="h-7 w-full rounded-lg bg-muted/40 px-2.5 text-[11px] outline-none placeholder:text-muted-foreground/35 focus:ring-0"
                  bind:value={dbSearch}
                />
              </div>
            {/if}

            <div class="max-h-[200px] overflow-y-auto p-1">
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
                {#each dbFiltered as db (db)}
                  {@const isCurrent = db === currentDb}
                  <DropdownMenu.Item
                    class={cn('cursor-pointer font-mono', isCurrent && 'font-semibold')}
                    onclick={() => switchDb(db)}
                  >
                    <Database class={cn('size-3.5 shrink-0', isCurrent ? 'text-foreground' : 'text-muted-foreground/35')} />
                    <span class="min-w-0 flex-1 truncate">{db}</span>
                    {#if isCurrent}<Check class="ml-auto size-3 shrink-0 text-emerald-500" />{/if}
                  </DropdownMenu.Item>
                {/each}
              {/if}
            </div>

            {#if isPostgres}
              <div class="flex items-center justify-between border-t border-border/25 px-2.5 py-1.5">
                <span class="text-[10px] text-muted-foreground/40">
                  {databases.length} database{databases.length === 1 ? '' : 's'}
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
                  <button
                    type="button"
                    class="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-muted/50 hover:text-foreground"
                    onclick={() => { dbOpen = false; createDbOpen = true }}
                    title="Create database"
                  >
                    <Plus class="size-3" />
                  </button>
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
      {@const dbT = connection.type ?? 'postgres'}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger class={iconBtn} title="Tools">
          <MoreHorizontal class="size-3.5" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content side="top" align="end" class="w-48">
          <DropdownMenu.Label>Tools</DropdownMenu.Label>
          {#if dbT === 'postgres' || dbT === 'mysql'}
            <DropdownMenu.Item class="cursor-pointer" onclick={onopenSchema}>
              <LayoutTemplate class="size-3.5 shrink-0 text-muted-foreground/50" /> Schema Explorer
            </DropdownMenu.Item>
          {/if}
          <DropdownMenu.Item class="cursor-pointer" onclick={onopenlogs}>
            <History class="size-3.5 shrink-0 text-muted-foreground/50" /> Activity Log
          </DropdownMenu.Item>
          {#if dbT === 'postgres'}
            <DropdownMenu.Item class="cursor-pointer" onclick={onopensecurity}>
              <ShieldCheck class="size-3.5 shrink-0 text-muted-foreground/50" /> Security
            </DropdownMenu.Item>
          {/if}
          <DropdownMenu.Item class="cursor-pointer" onclick={onopenorm}>
            <Code2 class="size-3.5 shrink-0 text-muted-foreground/50" /> ORM Runner
          </DropdownMenu.Item>
          <DropdownMenu.Item class="cursor-pointer" onclick={onopenbackup}>
            <Archive class="size-3.5 shrink-0 text-muted-foreground/50" /> Backup & Restore
          </DropdownMenu.Item>
          <DropdownMenu.Item class="cursor-pointer" onclick={onopenchartspage}>
            <BarChart2 class="size-3.5 shrink-0 text-muted-foreground/50" /> Charts
          </DropdownMenu.Item>
          <DropdownMenu.Item class="cursor-pointer" onclick={onopendashboard}>
            <LayoutDashboard class="size-3.5 shrink-0 text-muted-foreground/50" /> Dashboard
          </DropdownMenu.Item>
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
    databases = []
  }}
/>
