<script>
  import Database from '@lucide/svelte/icons/database'
  import HardDrive from '@lucide/svelte/icons/hard-drive'
  import Wifi from '@lucide/svelte/icons/wifi'
  import WifiOff from '@lucide/svelte/icons/wifi-off'
  import Server from '@lucide/svelte/icons/server'
  import Bot from '@lucide/svelte/icons/bot'
  import ArrowUpCircle from '@lucide/svelte/icons/arrow-up-circle'
  import Settings2 from '@lucide/svelte/icons/settings-2'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import Check from '@lucide/svelte/icons/check'
  import Table2 from '@lucide/svelte/icons/table-2'
  import Terminal from '@lucide/svelte/icons/terminal'
  import LayoutTemplate from '@lucide/svelte/icons/layout-template'
  import History from '@lucide/svelte/icons/history'
  import ShieldCheck from '@lucide/svelte/icons/shield-check'
  import Code2 from '@lucide/svelte/icons/code-2'
  import Settings from '@lucide/svelte/icons/settings'
  import Unplug from '@lucide/svelte/icons/unplug'
  import Command from '@lucide/svelte/icons/command'
  import Cloud from '@lucide/svelte/icons/cloud'
  import Undo2 from '@lucide/svelte/icons/undo-2'
  import { cn } from '$lib/utils.js'
  import { aiProfiles, activeProfileId, setActiveProfile } from '$lib/stores/ai-settings.js'
  import { executeSql } from '$lib/api.js'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js'

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
    onopensettings = /** @type {() => void} */ (() => {}),
    onopencommand = /** @type {() => void} */ (() => {}),
    ondisconnect = /** @type {() => void} */ (() => {}),
    activeView = /** @type {'table' | 'sql'} */ ('table'),
    onviewchange = /** @type {(v: 'table' | 'sql') => void} */ ((_v) => {}),
    pendingEditCount = 0,
    onapplyedits = /** @type {() => void} */ (() => {}),
    onresetedits = /** @type {() => void} */ (() => {}),
  } = $props()

  // ── Model picker ──────────────────────────────────────────────────────────────
  const activeProfile = $derived($aiProfiles.find((p) => p.id === $activeProfileId) ?? $aiProfiles[0])
  const modelName = $derived(activeProfile?.name ?? 'No model')

  // ── Database switcher ─────────────────────────────────────────────────────────
  let dbOpen = $state(false)
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

  // ── Connection label ──────────────────────────────────────────────────────────
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
</script>

<!-- Separator helper -->
{#snippet sep()}
  <span class="mx-0.5 h-3.5 w-px shrink-0 bg-border/60"></span>
{/snippet}

<div
  class="flex h-7 shrink-0 items-center border-t border-border/50 bg-background px-1.5 text-xs text-muted-foreground select-none"
  data-studio-region="statusbar"
>
  <!-- ── Left group ─────────────────────────────────────────────────── -->
  <div class="flex min-w-0 flex-1 items-center gap-0.5">
    {#if connection}
      <!-- Connection switcher -->
      <DropdownMenu.Root bind:open={connOpen}>
        <DropdownMenu.Trigger
          class="flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none data-[state=open]:bg-accent data-[state=open]:text-foreground"
          title="Switch connection"
        >
          <Wifi class="size-3 shrink-0 text-green-500" />
          <span class="max-w-[9rem] truncate font-medium">{connType}</span>
          {#if connLabel}
            <span class="max-w-[8rem] truncate text-muted-foreground/60">· {connLabel}</span>
          {/if}
          {#if savedConnections.length > 1}
            <ChevronDown class={cn('size-3 shrink-0 opacity-50 transition-transform', connOpen && 'rotate-180')} />
          {/if}
        </DropdownMenu.Trigger>

        {#if savedConnections.length > 0}
          <DropdownMenu.Content side="top" align="start" class="w-64 p-1">
            {#each savedConnections as conn (conn.id)}
              {@const isCurrent = conn.id === activeConnectionId}
              {@const Icon = connIcon(conn)}
              <DropdownMenu.Item
                class={cn('flex cursor-pointer items-center gap-2 text-xs', isCurrent && 'font-semibold')}
                onclick={() => { if (!isCurrent) onswitchconnection(conn); connOpen = false }}
              >
                <Icon class={cn('size-3.5 shrink-0', isCurrent ? 'text-foreground' : 'text-muted-foreground/40')} />
                <div class="min-w-0 flex-1">
                  <div class="truncate">{conn.name ?? conn.host ?? conn.filePath ?? 'Connection'}</div>
                  {#if conn.database && conn.database !== (conn.name ?? conn.host)}
                    <div class="truncate font-mono text-[10px] text-muted-foreground/50">{conn.database}</div>
                  {/if}
                </div>
                {#if isCurrent}<Check class="ml-auto size-3.5 shrink-0 text-green-500" />{/if}
              </DropdownMenu.Item>
            {/each}

            <DropdownMenu.Separator />

            <DropdownMenu.Item class="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground" onclick={() => { connOpen = false; onconnect() }}>
              <WifiOff class="size-3.5 shrink-0" />
              Manage connections…
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        {/if}
      </DropdownMenu.Root>

      {@render sep()}

      <!-- Database switcher -->
      <DropdownMenu.Root
        bind:open={dbOpen}
        onOpenChange={(o) => { if (o && databases.length === 0) void fetchDatabases(); if (!o) dbSearch = '' }}
      >
        <DropdownMenu.Trigger
          class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none data-[state=open]:bg-accent data-[state=open]:text-foreground"
          title="Switch database"
        >
          {#if connection?.type === 'sqlite'}
            <HardDrive class="size-3 shrink-0" />
          {:else}
            <Database class="size-3 shrink-0" />
          {/if}
          <span class="max-w-[9rem] truncate font-mono font-medium">{currentDb || 'No database'}</span>
          {#if isPostgres}
            <ChevronDown class={cn('size-3 shrink-0 opacity-50 transition-transform', dbOpen && 'rotate-180')} />
          {/if}
        </DropdownMenu.Trigger>

        <DropdownMenu.Content side="top" align="start" class="w-56 p-0 overflow-hidden">
          {#if databases.length > 5}
            <div class="border-b border-border/50 px-2 py-1.5">
              <input
                type="text"
                placeholder="Filter…"
                class="h-7 w-full rounded-md border border-border/60 bg-muted/40 px-2.5 text-xs outline-none placeholder:text-muted-foreground/40 focus:border-ring focus:ring-2 focus:ring-ring/20"
                bind:value={dbSearch}
              />
            </div>
          {/if}

          <div class="max-h-[200px] overflow-y-auto p-1">
            {#if dbLoading}
              <div class="flex items-center justify-center gap-2 py-4 text-muted-foreground/60">
                <RefreshCw class="size-3 animate-spin" />
                <span class="text-xs">Loading…</span>
              </div>
            {:else if dbFiltered.length === 0}
              <div class="py-3 text-center text-xs text-muted-foreground/60">
                {dbSearch ? 'No match' : 'No databases found'}
              </div>
            {:else}
              {#each dbFiltered as db (db)}
                {@const isCurrent = db === currentDb}
                <DropdownMenu.Item
                  class={cn('flex cursor-pointer items-center gap-2 font-mono text-xs', isCurrent && 'font-semibold')}
                  onclick={() => switchDb(db)}
                >
                  <Database class={cn('size-3.5 shrink-0', isCurrent ? 'text-foreground' : 'text-muted-foreground/40')} />
                  <span class="min-w-0 flex-1 truncate">{db}</span>
                  {#if isCurrent}<Check class="ml-auto size-3.5 shrink-0" />{/if}
                </DropdownMenu.Item>
              {/each}
            {/if}
          </div>

          {#if isPostgres}
            <div class="flex items-center justify-between border-t border-border/50 px-2.5 py-1">
              <span class="text-[10px] text-muted-foreground/50">
                {databases.length} database{databases.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                class="inline-flex size-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
                onclick={fetchDatabases}
                title="Refresh"
              >
                <RefreshCw class={cn('size-3', dbLoading && 'animate-spin')} />
              </button>
            </div>
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      {@render sep()}

      <!-- Data / Query Editor view toggle -->
      <div class="flex items-center gap-px">
        <button
          type="button"
          class={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-accent hover:text-foreground',
            activeView === 'table' ? 'text-foreground' : 'text-muted-foreground/60 hover:text-muted-foreground',
          )}
          onclick={() => onviewchange('table')}
          title="Data view (⌘⇧D)"
        >
          <Table2 class="size-3 shrink-0" />
          <span class={cn('font-medium', activeView !== 'table' && 'font-normal')}>Data</span>
        </button>
        <button
          type="button"
          class={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-accent hover:text-foreground',
            activeView === 'sql' ? 'text-foreground' : 'text-muted-foreground/60 hover:text-muted-foreground',
          )}
          onclick={() => onviewchange('sql')}
          title="Query Editor (⌘⇧S)"
        >
          <Terminal class="size-3 shrink-0" />
          <span class={cn('font-medium', activeView !== 'sql' && 'font-normal')}>Query</span>
        </button>
      </div>
    {:else}
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-accent hover:text-foreground"
        onclick={onconnect}
        title="No connection — click to connect"
      >
        <WifiOff class="size-3 shrink-0 text-muted-foreground/50" />
        <span class="font-medium">Not connected</span>
      </button>
    {/if}
  </div>

  <!-- ── Right group ────────────────────────────────────────────────── -->
  <div class="flex shrink-0 items-center gap-0.5">
    <!-- Staged cell edits: Apply / Reset -->
    {#if pendingEditCount > 0}
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          onclick={onapplyedits}
          title="Apply {pendingEditCount} unsaved change{pendingEditCount === 1 ? '' : 's'}"
        >
          <Check class="size-3 shrink-0" />
          <span>Apply {pendingEditCount}</span>
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onclick={onresetedits}
          title="Discard unsaved changes"
        >
          <Undo2 class="size-3 shrink-0" />
          <span>Reset</span>
        </button>
      </div>
      {@render sep()}
    {/if}
    {#if connection}
      <!-- Connection-specific tool icons — visibility depends on db capabilities -->
      {@const dbT = connection.type ?? 'postgres'}
      {#if dbT === 'postgres' || dbT === 'mysql'}
        <button type="button" class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground" onclick={onopenSchema} title="Schema Explorer">
          <LayoutTemplate class="size-3.5" />
        </button>
      {/if}
      <button type="button" class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground" onclick={onopenlogs} title="Activity log">
        <History class="size-3.5" />
      </button>
      {#if dbT === 'postgres'}
        <button type="button" class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground" onclick={onopensecurity} title="Security (RLS & Policies)">
          <ShieldCheck class="size-3.5" />
        </button>
      {/if}
      <button type="button" class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground" onclick={onopenorm} title="ORM Runner">
        <Code2 class="size-3.5" />
      </button>
      {@render sep()}
    {/if}

    <!-- AI mode toggle (always visible) -->
    <button
      type="button"
      class={cn('inline-flex size-6 items-center justify-center rounded-md transition-colors hover:bg-accent', aiMode ? 'text-primary hover:text-primary' : 'text-muted-foreground/70 hover:text-foreground')}
      onclick={onopenaimode}
      title={aiMode ? 'Close AI (⌘⇧E)' : 'Open AI (⌘⇧E)'}
    >
      <Bot class="size-3.5" />
    </button>

    {@render sep()}

    <button type="button" class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground" onclick={onopencommand} title="Command menu (⌘K)">
      <Command class="size-3.5" />
    </button>
    <button type="button" class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground" onclick={onopensettings} title="Settings (⌘,)">
      <Settings class="size-3.5" />
    </button>
    {#if connection}
      <button type="button" class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-destructive" onclick={ondisconnect} title="Disconnect">
        <Unplug class="size-3.5" />
      </button>
    {/if}

    {@render sep()}

    <!-- Update -->
    {#if hasUpdate}
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-accent hover:text-foreground"
        onclick={oncheckupdate}
        title="Update available"
      >
        <ArrowUpCircle class="size-3 shrink-0" />
        <span>Update</span>
      </button>
      {@render sep()}
    {/if}

    <!-- MCP -->
    <button
      type="button"
      class={cn(
        'flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-accent hover:text-foreground',
        mcpRunning ? 'text-muted-foreground' : 'text-muted-foreground/40',
      )}
      onclick={onopenmcp}
      title={mcpRunning ? 'MCP server running — click to manage' : 'MCP server stopped — click to manage'}
    >
      <Server class={cn('size-3 shrink-0', mcpRunning && 'text-green-500')} />
      <span class="font-medium">MCP</span>
    </button>

    {@render sep()}

    <!-- AI model picker -->
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class="flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none data-[state=open]:bg-accent data-[state=open]:text-foreground"
        title="Switch AI model"
      >
        <Bot class="size-3 shrink-0" />
        <span class="max-w-[8rem] truncate font-medium">{modelName}</span>
        <ChevronDown class="size-3 shrink-0 opacity-50 transition-transform data-[state=open]:rotate-180" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Content side="top" align="end" class="w-56 p-1">
        <DropdownMenu.RadioGroup value={$activeProfileId} onValueChange={(v) => setActiveProfile(v)}>
          {#each $aiProfiles as profile (profile.id)}
            <DropdownMenu.RadioItem value={profile.id} class="cursor-pointer py-1.5">
              <div class="flex min-w-0 flex-col gap-0.5">
                <span class="truncate text-xs font-medium leading-tight">{profile.name}</span>
                <span class="truncate font-mono text-[10px] leading-tight text-muted-foreground/60">{profile.model}</span>
              </div>
            </DropdownMenu.RadioItem>
          {/each}
        </DropdownMenu.RadioGroup>

        <DropdownMenu.Separator />

        <DropdownMenu.Item class="cursor-pointer gap-2 text-xs" onclick={onopenmodelsettings}>
          <Settings2 class="size-3.5" />
          Manage models…
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>
</div>
