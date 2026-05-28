<script>
  import Database from '@lucide/svelte/icons/database'
  import HardDrive from '@lucide/svelte/icons/hard-drive'
  import Check from '@lucide/svelte/icons/check'
  import ChevronUp from '@lucide/svelte/icons/chevron-up'
  import Download from '@lucide/svelte/icons/download'
  import Bot from '@lucide/svelte/icons/bot'
  import Settings2 from '@lucide/svelte/icons/settings-2'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import { cn } from '$lib/utils.js'
  import { aiProfiles, activeProfileId, setActiveProfile } from '$lib/stores/ai-settings.js'
  import { executeSql } from '$lib/api.js'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js'

  let {
    /** @type {import('$lib/stores/connections.js').SavedConnection | null} */
    connection = null,
    mcpRunning = false,
    hasUpdate = false,
    onopenmcp = /** @type {() => void} */ (() => {}),
    onconnect = /** @type {() => void} */ (() => {}),
    onswitchtodb = /** @type {(db: string) => void} */ ((_db) => {}),
    oncheckupdate = /** @type {() => void} */ (() => {}),
    onopenmodelsettings = /** @type {() => void} */ (() => {}),
  } = $props()

  // ── Model picker ─────────────────────────────────────────────────────────────
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
    // Clear cached list when connection changes
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
  const connLabel = $derived(
    connection ? `${connType} · ${connection.name ?? connection.host ?? ''}` : 'Not connected',
  )
</script>

<div
  class="flex h-[26px] shrink-0 items-center border-t border-border/40 bg-background px-1 text-xs text-muted-foreground/70 select-none"
  data-studio-region="statusbar"
>
  <!-- ── Left ──────────────────────────────────────────────────────────── -->
  <div class="flex min-w-0 flex-1 items-center">
    {#if connection}
      <!-- Connection pill -->
      <button
        type="button"
        class="flex h-full shrink-0 items-center gap-1.5 rounded px-2 transition-colors hover:bg-accent/30 hover:text-foreground"
        title="Connected to {connLabel}"
      >
        <span class="size-1.5 shrink-0 rounded-full bg-green-500 shadow-[0_0_4px_theme(colors.green.500)]"></span>
        <span class="max-w-[10rem] truncate font-mono text-[11px]">{connLabel}</span>
      </button>

      <span class="mx-0.5 text-border/60 text-[10px]">│</span>

      <!-- Database switcher via shadcn DropdownMenu -->
      <DropdownMenu.Root bind:open={dbOpen} onOpenChange={(o) => { if (o && databases.length === 0) void fetchDatabases(); if (!o) dbSearch = '' }}>
        <DropdownMenu.Trigger
          class="flex h-full items-center gap-1.5 rounded px-2 transition-colors hover:bg-accent/30 hover:text-foreground outline-none data-[state=open]:bg-accent/30 data-[state=open]:text-foreground"
          title="Switch database"
        >
          {#if connection?.type === 'sqlite'}
            <HardDrive class="size-3 shrink-0" />
          {:else}
            <Database class="size-3 shrink-0" />
          {/if}
          <span class="max-w-[9rem] truncate font-mono text-[11px]">{currentDb || 'No database'}</span>
          <ChevronUp
            class={cn('size-3 shrink-0 opacity-50 transition-transform', !dbOpen && 'rotate-180')}
          />
        </DropdownMenu.Trigger>

        <DropdownMenu.Content side="top" align="start" class="w-56 p-0 overflow-hidden">
          {#if databases.length > 5}
            <div class="border-b border-border/40 px-2 py-1.5">
              <input
                type="text"
                placeholder="Filter databases…"
                class="h-7 w-full rounded-md border border-border/60 bg-background/60 px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-ring focus:ring-1 focus:ring-ring/30"
                bind:value={dbSearch}
              />
            </div>
          {/if}

          <div class="max-h-[200px] overflow-y-auto p-1">
            {#if dbLoading}
              <div class="flex items-center justify-center gap-2 py-4 text-muted-foreground/50">
                <RefreshCw class="size-3 animate-spin" />
                <span class="text-xs">Loading…</span>
              </div>
            {:else if dbFiltered.length === 0}
              <div class="px-2 py-3 text-center text-xs text-muted-foreground/50">
                {dbSearch ? 'No match' : 'No databases found'}
              </div>
            {:else}
              {#each dbFiltered as db (db)}
                {@const isCurrent = db === currentDb}
                <DropdownMenu.Item
                  class={cn('flex items-center gap-2 font-mono text-xs cursor-pointer', isCurrent && 'text-foreground font-medium')}
                  onclick={() => switchDb(db)}
                >
                  <Database class={cn('size-3.5 shrink-0', isCurrent ? 'text-primary' : 'text-muted-foreground/40')} />
                  <span class="min-w-0 flex-1 truncate">{db}</span>
                  {#if isCurrent}<Check class="ml-auto size-3.5 shrink-0 text-primary" />{/if}
                </DropdownMenu.Item>
              {/each}
            {/if}
          </div>

          {#if isPostgres}
            <div class="flex items-center justify-between border-t border-border/40 px-2.5 py-1">
              <span class="text-[10px] text-muted-foreground/40">
                {databases.length} database{databases.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                class="inline-flex size-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-foreground"
                onclick={fetchDatabases}
                title="Refresh"
              >
                <RefreshCw class={cn('size-3', dbLoading && 'animate-spin')} />
              </button>
            </div>
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {:else}
      <button
        type="button"
        class="flex h-full items-center gap-1.5 rounded px-2 text-xs transition-colors hover:bg-accent/30 hover:text-foreground"
        onclick={onconnect}
        title="No active connection — click to connect"
      >
        <span class="size-1.5 shrink-0 rounded-full bg-muted-foreground/30"></span>
        <span class="font-mono text-[11px]">Not connected</span>
      </button>
    {/if}
  </div>

  <!-- ── Right ─────────────────────────────────────────────────────────── -->
  <div class="flex shrink-0 items-center">
    <!-- Update available -->
    {#if hasUpdate}
      <button
        type="button"
        class="flex h-full items-center gap-1.5 rounded px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        onclick={oncheckupdate}
        title="Update available"
      >
        <Download class="size-3 shrink-0" />
        <span>Update available</span>
      </button>
      <span class="mx-0.5 text-border/60 text-[10px]">│</span>
    {/if}

    <!-- MCP status -->
    <button
      type="button"
      class={cn(
        'flex h-full items-center gap-1.5 rounded px-2 text-[11px] transition-colors hover:bg-accent/30 hover:text-foreground',
        !mcpRunning && 'opacity-50',
      )}
      onclick={onopenmcp}
      title={mcpRunning ? 'MCP server running' : 'MCP server stopped'}
    >
      <span
        class={cn(
          'size-1.5 shrink-0 rounded-full',
          mcpRunning ? 'bg-green-500 shadow-[0_0_4px_theme(colors.green.500)]' : 'bg-muted-foreground/40',
        )}
      ></span>
      <span class="font-mono">MCP</span>
    </button>

    <span class="mx-0.5 text-border/60 text-[10px]">│</span>

    <!-- AI model picker via shadcn DropdownMenu -->
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class="flex h-full items-center gap-1.5 rounded px-2 transition-colors hover:bg-accent/30 hover:text-foreground outline-none data-[state=open]:bg-accent/30 data-[state=open]:text-foreground"
        title="Switch AI model"
      >
        <Bot class="size-3 shrink-0" />
        <span class="max-w-[7rem] truncate font-mono text-[11px]">{modelName}</span>
        <ChevronUp class="size-3 shrink-0 opacity-50 transition-transform data-[state=open]:rotate-0 rotate-180" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Content side="top" align="end" class="w-56 p-1">
        <DropdownMenu.RadioGroup value={$activeProfileId} onValueChange={(v) => setActiveProfile(v)}>
          {#each $aiProfiles as profile (profile.id)}
            <DropdownMenu.RadioItem value={profile.id} class="flex items-center gap-2.5 py-1.5 cursor-pointer">
              <div class="flex min-w-0 flex-col">
                <span class="truncate text-xs font-medium text-foreground leading-tight">{profile.name}</span>
                <span class="truncate font-mono text-[10px] text-muted-foreground/60 leading-tight">{profile.model}</span>
              </div>
            </DropdownMenu.RadioItem>
          {/each}
        </DropdownMenu.RadioGroup>

        <DropdownMenu.Separator />

        <DropdownMenu.Item class="gap-2 text-xs cursor-pointer" onclick={onopenmodelsettings}>
          <Settings2 class="size-3.5" />
          Manage models…
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>
</div>
