<script>
  import Icon         from './Icon.svelte'
  import { tick, onMount } from 'svelte'
  import { cn }       from '$lib/utils.js'
  import { aiProfiles, activeProfileId, setActiveProfile } from '$lib/stores/ai-settings.js'
  import { toggleLightDark, isCurrentThemeDark, appVimMode, appLiveMode } from '$lib/stores/settings.js'
  import { vimSubMode, VIM_MODE_LABEL } from '$lib/vim/vim.js'
  import { executeSql, cloudflareListD1Databases } from '$lib/api.js'
  import { providerListDatabases } from '$lib/providers.js'
  import { engineFamily } from '$lib/stores/connections.js'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js'
  import AppearanceMenu from './AppearanceMenu.svelte'
  import CreateDatabaseDialog from './CreateDatabaseDialog.svelte'
  import SearchableMenu from './SearchableMenu.svelte'
  import BrandIcon from './BrandIcon.svelte'
  import { hasBrand } from '$lib/brand-icons.js'

  // App version — shown in the status bar; resolved from the Tauri app metadata.
  let appVersion = $state('')
  onMount(async () => {
    try { const { getVersion } = await import('@tauri-apps/api/app'); appVersion = await getVersion() }
    catch { appVersion = '' }
  })

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
    onswitchproviderdb = /** @type {(db: { provider: string, dbRef: string, name: string }) => void} */ ((_db) => {}),
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
    onopenpages = /** @type {() => void} */ (() => {}),
    ondisconnect = /** @type {() => void} */ (() => {}),
    pendingEditCount = 0,
    /** True while staged changes are being written — shows a spinner on Apply. */
    applying = false,
    onapplyedits = /** @type {() => void} */ (() => {}),
    onresetedits = /** @type {() => void} */ (() => {}),
    showTableNav = false,
    onscrolltabletop = /** @type {() => void} */ (() => {}),
    onscrolltablebottom = /** @type {() => void} */ (() => {}),
    /** Show the go-to-left / go-to-right controls only when the grid overflows. */
    canScrollTableHorizontally = false,
    onscrolltableleft = /** @type {() => void} */ (() => {}),
    onscrolltableright = /** @type {() => void} */ (() => {}),
    /** Duration of the last data fetch (table load / refresh / query), in ms. */
    queryMs = 0,
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
  /** @type {HTMLInputElement | null} */
  let dbInputEl = $state(null)
  /** @type {HTMLDivElement | null} */
  let dbListEl = $state(null)
  /** Keyboard-highlighted row in the db list — driven from the filter input. */
  let dbHl = $state(0)

  // Reset the highlight whenever the visible list changes or the menu reopens.
  $effect(() => {
    dbSearch; dbOpen
    dbHl = 0
  })

  // Autofocus the filter input when the switcher opens (issue #3: "search box
  // is not active by default"). Primary path is onOpenAutoFocus on the menu
  // content, which pre-empts bits-ui's own focus management (it would focus
  // the content container after our focus() and undo it). This effect is the
  // fallback for open paths that skip that callback; the flag makes it fire
  // once per open instead of stealing focus back while navigating.
  let _dbFocusedThisOpen = false
  $effect(() => {
    if (!dbOpen) { _dbFocusedThisOpen = false; return }
    if (_dbFocusedThisOpen) return
    const el = dbInputEl
    if (!el) return
    _dbFocusedThisOpen = true
    tick().then(() => el?.focus())
  })

  /** Take over the menu's open-autofocus so the filter input starts focused.
   * @param {Event} e */
  function focusDbInputOnOpen(e) {
    e.preventDefault()
    _dbFocusedThisOpen = true
    tick().then(() => dbInputEl?.focus())
  }

  function scrollDbHlIntoView() {
    tick().then(() => {
      dbListEl?.querySelector('[data-hl]')?.scrollIntoView({ block: 'nearest' })
    })
  }

  /**
   * Keyboard driving for the db list while focus stays in the filter input:
   * arrows / Tab cycle the highlight, Enter switches, Escape closes. Handled
   * (and stopped) here so the menu's own typeahead/focus logic can't fight it.
   * @param {KeyboardEvent} e
   */
  function onDbInputKeydown(e) {
    if (e.key === 'Escape') { dbSearch = ''; dbOpen = false; return }
    const n = Math.min(dbFiltered.length, 200)
    if (n === 0) return
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault(); e.stopPropagation()
      dbHl = (dbHl + 1) % n
      scrollDbHlIntoView()
    } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault(); e.stopPropagation()
      dbHl = (dbHl - 1 + n) % n
      scrollDbHlIntoView()
    } else if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation()
      const db = dbFiltered[dbHl]
      if (db) switchDb(db)
    }
  }

  /** @param {EventTarget | null} t */
  function isEditableTarget(t) {
    const el = /** @type {HTMLElement | null} */ (t)
    if (!el || !(el instanceof HTMLElement)) return false
    return (
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.isContentEditable ||
      !!el.closest('.monaco-editor')
    )
  }

  /**
   * Global shortcuts: ⌘D toggles the database switcher, ⌘⇧C the connection
   * switcher. Skipped while typing (inputs, textareas, Monaco) so ⌘D keeps
   * its editor meaning there.
   * @param {KeyboardEvent} e
   */
  function onWindowKeydown(e) {
    const mod = e.metaKey || e.ctrlKey
    if (!mod || e.altKey || !connection) return
    const k = e.key.toLowerCase()
    if (k === 'd' && !e.shiftKey) {
      if (!canSwitchDb || isEditableTarget(e.target)) return
      e.preventDefault()
      connOpen = false
      if (dbOpen) {
        dbOpen = false
      } else {
        dbOpen = true
        if (dbList.length === 0) void fetchDatabases()
      }
    } else if (k === 'c' && e.shiftKey) {
      if (savedConnections.length === 0 || isEditableTarget(e.target)) return
      e.preventDefault()
      dbOpen = false
      connOpen = !connOpen
    }
  }

  const currentDb = $derived(
    connection?.type === 'libsql'
      ? (connection?.url ?? '').replace(/^(libsql|https?):\/\//, '').split('/')[0]
      : (connection?.database ?? connection?.filePath ?? '')
  )
  const isRedis = $derived(engineFamily(connection?.type) === 'redis')
  const isPostgres = $derived(!isRedis && (engineFamily(connection?.type) === 'postgres' || engineFamily(connection?.type) === 'mysql'))
  const isD1 = $derived(connection?.type === 'd1')
  /** Connection that originated from a provider sign-in (Neon/Supabase/…). Redis
   * connections may carry a stale `provider`/`db` field from an earlier edit, so
   * they're explicitly excluded here to avoid the Postgres-style switcher. */
  const isProvider = $derived(!isRedis && !!connection?.provider)
  /** Whether this connection supports switching databases in-place. Redis uses
   * numbered logical DBs (no in-place switch yet), so it shows a static label. */
  const canSwitchDb = $derived(!isRedis && (isPostgres || isD1 || isProvider))
  /** The numeric logical DB Redis actually connects to — matches api.js
   * normalizeRedis (`Number(config.db) || 0`), so a stale non-numeric `db`
   * ("postgres") correctly reads as 0 rather than being shown verbatim. */
  const redisDb = $derived(Number(connection?.db) || 0)
  /** Label shown in the trigger for the active db. Provider connections all use
   * the db name "postgres", so show the project name instead (from the connection
   * name, e.g. "Prisma · stroke-testing" → "stroke-testing"). */
  const currentDbLabel = $derived(
    isRedis ? `db ${redisDb}`
    : isProvider ? ((connection?.name?.split(' · ').pop()) || connection?.name || currentDb)
    : isD1 ? (connection?.database || connection?.name || '')
    : currentDb,
  )
  /** Key of the active db, used to mark the current row. */
  const currentDbKey = $derived(isD1 ? (connection?.databaseId ?? '') : currentDb)

  const dbFiltered = $derived(
    dbSearch.trim()
      ? dbList.filter((d) => d.label.toLowerCase().includes(dbSearch.toLowerCase()))
      : dbList,
  )

  async function fetchDatabases() {
    // Provider connections list the account's other databases/projects via the
    // provider API (checked first — a Supabase/Neon connection is also postgres).
    if (isProvider && connection?.provider) {
      dbLoading = true
      try {
        const dbs = await providerListDatabases(connection.provider)
        dbList = (dbs ?? []).map((/** @type {{ db_ref: string, name: string }} */ d) => ({ key: d.db_ref, label: d.name }))
      } catch {
        dbList = []
      } finally {
        dbLoading = false
      }
      return
    }
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
    if (isProvider && connection?.provider) {
      onswitchproviderdb({ provider: connection.provider, dbRef: db.key, name: db.label })
    } else if (db.key !== currentDbKey) {
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
      : connection?.type === 'redis' ? 'Redis'
      : 'PostgreSQL',
  )
  const connLabel = $derived(connection?.name ?? connection?.host ?? '')
  let connOpen = $state(false)

  /** Searchable list for the connection switcher — keyword-matched on name/host/db/type. */
  const connItems = $derived(
    savedConnections.map((c) => ({
      value: c.id,
      label: c.name ?? c.host ?? c.filePath ?? 'Connection',
      keywords: [c.host, c.database, c.name, c.type].filter(Boolean),
    })),
  )

  /**
   * Subtitle for a connection row — the database (or host) shown under the name,
   * but only when it isn't already part of the title, so host/db-style names
   * like "1.2.3.4/mydb" don't repeat "mydb" on the line below.
   * @param {import('$lib/stores/connections.js').SavedConnection} c
   */
  function connSubtitle(c) {
    const title = c.name ?? c.host ?? c.filePath ?? 'Connection'
    const raw = c.database || c.host || ''
    return raw && raw !== title && !title.includes(raw) ? raw : ''
  }

  /** @param {import('$lib/stores/connections.js').SavedConnection} c */
  function connIcon(c) {
    if (c.type === 'sqlite') return 'hard-drive'
    if (c.type === 'd1') return 'cloud'
    if (c.type === 'libsql') return 'wifi'
    return 'database'
  }

  /** Shared icon-only button classes */
  const iconBtn = 'inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground'
  /** Shared label+icon button */
  const labelBtn = 'flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-muted/50 hover:text-foreground data-[state=open]:bg-muted/50 data-[state=open]:text-foreground'

  let aiModelMenuOpen = $state(false)

  /** "132ms" under a second, "1.24s" above — always tabular so it never jitters. */
  const queryMsLabel = $derived(
    queryMs >= 1000 ? `${(queryMs / 1000).toFixed(2)}s` : `${Math.round(queryMs)}ms`,
  )
</script>

<svelte:window onkeydown={onWindowKeydown} />

<!-- Vertical separator -->
{#snippet sep()}
  <span class="mx-1 h-3.5 w-px shrink-0 bg-border/30"></span>
{/snippet}

<div
  class="@container/sb flex h-8 shrink-0 items-center border-t border-border/30 bg-background px-2 text-ui-2xs text-muted-foreground select-none"
  data-studio-region="statusbar"
>
  <!-- ── Left group ──────────────────────────────────────────────────── -->
  <div class="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
    {#if connection}

      <!-- Connection switcher -->
      {#snippet connTriggerInner(/** @type {boolean} */ showChevron)}
        {#if connectionLost}
          <Icon name="wifi-off" class="size-3 shrink-0 text-red-500" />
        {:else}
          <Icon name="wifi" class="size-3 shrink-0 text-emerald-500" />
        {/if}
        <span class={cn('max-w-[7rem] truncate font-medium', connectionLost && 'text-red-500/70')}>{connType}</span>
        {#if connLabel}
          <span class="hidden max-w-[6rem] truncate text-muted-foreground/45 @min-[900px]/sb:inline">· {connLabel}</span>
        {/if}
        {#if connection?.environment}
          <span class="size-1.5 shrink-0 rounded-full bg-muted-foreground/35" title={connection.environment}></span>
        {/if}
        {#if showChevron}
          <Icon name="chevron-down" class={cn('size-3 shrink-0 opacity-40 transition-transform', connOpen && 'rotate-180')} />
        {/if}
      {/snippet}

      {#if savedConnections.length > 1}
        <SearchableMenu
          bind:open={connOpen}
          side="top"
          align="start"
          contentClass="w-72"
          placeholder="Search connections…"
          items={connItems}
          onselect={(it) => { const c = savedConnections.find((x) => x.id === it.value); if (c && c.id !== activeConnectionId) onswitchconnection(c) }}
        >
          {#snippet trigger(props)}
            <button {...props} type="button" class={cn(labelBtn, 'text-muted-foreground/80')} title="Switch connection (⇧⌘C)">
              {@render connTriggerInner(true)}
            </button>
          {/snippet}
          {#snippet item(it)}
            {@const conn = savedConnections.find((c) => c.id === it.value)}
            {@const isCurrent = conn?.id === activeConnectionId}
            {@const title = conn?.name ?? conn?.host ?? conn?.filePath ?? 'Connection'}
            {@const subtitle = conn ? connSubtitle(conn) : ''}
            <span class={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-md',
              isCurrent ? 'bg-emerald-500/12 text-emerald-500' : 'bg-muted/50 text-muted-foreground/55',
            )}>
              {#if conn?.provider && hasBrand(conn.provider)}
                <BrandIcon name={conn.provider} class="size-3.5" />
              {:else if conn}
                <Icon name={connIcon(conn)} class="size-3.5" />
              {/if}
            </span>
            <span
              class={cn('min-w-0 flex-1 truncate', isCurrent ? 'font-semibold text-foreground' : 'font-medium text-foreground/90')}
              title={subtitle ? `${title} · ${subtitle}` : title}
            >{title}</span>
            {#if conn?.environment}
              <span class="size-1.5 shrink-0 rounded-full bg-muted-foreground/30" title={conn.environment}></span>
            {/if}
            {#if isCurrent}<Icon name="check" class="size-3.5 shrink-0 text-emerald-500" />{/if}
          {/snippet}
          {#snippet footer()}
            <div class="border-t border-border/50 p-1">
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onclick={() => { connOpen = false; onconnect() }}
              >
                <Icon name="wifi-off" class="size-3.5 shrink-0 text-muted-foreground/50" />
                Manage connections…
              </button>
            </div>
          {/snippet}
        </SearchableMenu>
      {:else}
        <button
          type="button"
          class={cn(labelBtn, 'text-muted-foreground/80')}
          title="Manage connections (⇧⌘C)"
          onclick={onconnect}
        >
          {@render connTriggerInner(false)}
        </button>
      {/if}

      {@render sep()}

      <!-- Database switcher + create button -->
      <div class="flex items-center">
        <DropdownMenu.Root
          bind:open={dbOpen}
          onOpenChange={(o) => { if (o && dbList.length === 0) void fetchDatabases(); if (!o) dbSearch = '' }}
        >
          <DropdownMenu.Trigger
            class={cn(labelBtn, 'text-muted-foreground/80', !canSwitchDb && 'cursor-default hover:bg-transparent hover:text-muted-foreground/80')}
            disabled={!canSwitchDb}
            title={canSwitchDb ? 'Switch database (⌘D)' : currentDbLabel}
          >
            {#if connection?.type === 'sqlite'}
              <Icon name="hard-drive" class="size-3 shrink-0" />
            {:else if isD1}
              <Icon name="cloud" class="size-3 shrink-0" />
            {:else}
              <Icon name="database" class="size-3 shrink-0" />
            {/if}
            <span class="max-w-[8rem] truncate font-mono">{currentDbLabel || 'No database'}</span>
            {#if canSwitchDb}
              <Icon name="chevron-down" class={cn('size-3 shrink-0 opacity-40 transition-transform', dbOpen && 'rotate-180')} />
            {/if}
          </DropdownMenu.Trigger>

          <DropdownMenu.Content
            side="top"
            align="start"
            class="w-56 overflow-hidden p-0"
            onOpenAutoFocus={focusDbInputOnOpen}
          >
            <!-- Always mounted (not gated on list size) so the search box is
                 active the moment the switcher opens and arrows/Tab/Enter work
                 for any number of databases. -->
            <div class="border-b border-border/50 px-2 py-1.5">
              <input
                bind:this={dbInputEl}
                type="text"
                aria-label="Filter databases"
                placeholder={isD1 ? 'Filter D1 databases…' : 'Filter databases…'}
                class="h-7 w-full rounded-lg bg-muted/40 px-2.5 text-ui-2xs outline-none placeholder:text-muted-foreground/35 focus:ring-0"
                bind:value={dbSearch}
                onkeydown={onDbInputKeydown}
              />
            </div>

            <div bind:this={dbListEl} class="db-list-scroll max-h-[200px] overflow-y-auto p-1 [contain:layout_paint]">
              {#if dbLoading}
                <div class="flex items-center justify-center gap-2 py-4 text-muted-foreground/50">
                  <Icon name="refresh-cw" class="size-3 animate-spin" />
                  <span class="text-ui-2xs">Loading…</span>
                </div>
              {:else if dbFiltered.length === 0}
                <div class="py-3 text-center text-ui-2xs text-muted-foreground/45">
                  {dbSearch ? 'No match' : 'No databases found'}
                </div>
              {:else}
                <!-- Plain buttons (not DropdownMenu.Item): highlight is driven from
                     the filter input's keyboard handler, and menu-item roving focus
                     would fight it. Hover moves the highlight so both stay in sync. -->
                {#each dbFiltered.slice(0, 200) as db, i (db.key)}
                  {@const isCurrent = db.key === currentDbKey}
                  <button
                    type="button"
                    data-hl={dbHl === i ? '' : undefined}
                    class={cn(
                      'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left font-mono text-xs text-foreground/90 transition-colors',
                      dbHl === i && 'bg-accent text-foreground',
                      isCurrent && 'font-semibold',
                    )}
                    onclick={() => switchDb(db)}
                    onpointerenter={() => (dbHl = i)}
                  >
                    {#if isD1}
                      <Icon name="cloud" class={cn('size-3.5 shrink-0', isCurrent ? 'text-amber-500' : 'text-muted-foreground/35')} />
                    {:else}
                      <Icon name="database" class={cn('size-3.5 shrink-0', isCurrent ? 'text-foreground' : 'text-muted-foreground/35')} />
                    {/if}
                    <span class="min-w-0 flex-1 truncate">{db.label}</span>
                    {#if isCurrent}<Icon name="check" class="ml-auto size-3 shrink-0 text-emerald-500" />{/if}
                  </button>
                {/each}
              {/if}
            </div>

            {#if canSwitchDb}
              <div class="flex items-center justify-between border-t border-border/50 px-2.5 py-1.5">
                <span class="text-ui-3xs text-muted-foreground/40">
                  {dbList.length} database{dbList.length === 1 ? '' : 's'}
                </span>
                <div class="flex items-center gap-0.5">
                  <button
                    type="button"
                    class="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-muted/50 hover:text-foreground"
                    onclick={fetchDatabases}
                    title="Refresh"
                  >
                    <Icon name="refresh-cw" class={cn('size-3', dbLoading && 'animate-spin')} />
                  </button>
                  {#if isPostgres}
                    <button
                      type="button"
                      class="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-muted/50 hover:text-foreground"
                      onclick={() => { dbOpen = false; createDbOpen = true }}
                      title="Create database"
                    >
                      <Icon name="plus" class="size-3" />
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
            <Icon name="plus" class="size-3" />
          </button>
        {/if}
      </div>

      <!-- Table scroll nav -->
      {#if showTableNav}
        {@render sep()}
        <div class="flex items-center gap-px">
          <button type="button" class={iconBtn} onclick={onscrolltabletop} title="Go to top (⌘↑)" aria-label="Scroll to top">
            <Icon name="chevrons-up" class="size-3.5" />
          </button>
          <button type="button" class={iconBtn} onclick={onscrolltablebottom} title="Go to bottom (⌘↓)" aria-label="Scroll to bottom">
            <Icon name="chevrons-down" class="size-3.5" />
          </button>
          {#if canScrollTableHorizontally}
            <button type="button" class={iconBtn} onclick={onscrolltableleft} title="Go to first column (⌘⌥←)" aria-label="Scroll to leftmost column">
              <Icon name="chevrons-left" class="size-3.5" />
            </button>
            <button type="button" class={iconBtn} onclick={onscrolltableright} title="Go to last column (⌘⌥→)" aria-label="Scroll to rightmost column">
              <Icon name="chevrons-right" class="size-3.5" />
            </button>
          {/if}
        </div>
      {/if}

      <!-- Live mode toggle (experimental — only shown when enabled in Settings) -->
      {#if showTableNav && liveSupported && $appLiveMode}
        {@render sep()}
        <button
          type="button"
          class={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 transition-[background-color,color] duration-150',
            live
              ? 'font-medium text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/16 dark:text-emerald-400'
              : 'text-muted-foreground/50 hover:bg-muted/50 hover:text-foreground',
          )}
          onclick={ontogglelive}
          aria-pressed={live}
          title={live ? 'Live: on — auto-refreshes when this table changes' : 'Live: off — click to auto-refresh on changes'}
        >
          {#if live}
            <span class="size-1.5 shrink-0 rounded-full bg-emerald-500 motion-safe:animate-pulse"></span>
            <span>Live</span>
          {:else}
            <Icon name="radio" class="size-3 shrink-0" />
            <span>Live</span>
          {/if}
        </button>
      {/if}

      <!-- Last fetch timing — updates on every table load / refresh / query -->
      {#if queryMs > 0}
        {@render sep()}
        <span
          class="shrink-0 px-1 font-mono text-ui-2xs tabular-nums text-muted-foreground/55"
          title="Last data fetch took {queryMs.toLocaleString('en-US')}ms"
        >{queryMsLabel}</span>
      {/if}

    {:else}
      <!-- Not connected -->
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground"
        onclick={onconnect}
        title="No connection — click to connect"
      >
        <Icon name="wifi-off" class="size-3 shrink-0" />
        <span class="font-medium">Not connected</span>
      </button>
    {/if}
  </div>

  <!-- ── Right group ─────────────────────────────────────────────────── -->
  <div class="flex shrink-0 items-center gap-0.5">

    <!-- Vim mode indicator (experimental) -->
    {#if $appVimMode}
      <span
        class={cn(
          'inline-flex h-5 items-center rounded-md px-1.5 font-mono text-ui-3xs font-semibold uppercase tracking-wider',
          $vimSubMode === 'insert' && 'bg-emerald-500/15 text-emerald-500',
          $vimSubMode === 'visual' && 'bg-amber-500/15 text-amber-500',
          $vimSubMode === 'command' && 'bg-primary/15 text-primary',
          $vimSubMode === 'normal' && 'bg-muted/40 text-muted-foreground/70',
        )}
        title="Vim mode · {VIM_MODE_LABEL[$vimSubMode]} (experimental)"
      >{VIM_MODE_LABEL[$vimSubMode]}</span>
    {/if}

    <!-- App version -->
    {#if appVersion}
      <span class="inline-flex h-5 items-center rounded-md px-1.5 font-mono text-ui-3xs tabular-nums text-muted-foreground/45" title="Stroke v{appVersion}">v{appVersion}</span>
    {/if}

    <!-- Pending edits -->
    {#if pendingEditCount > 0}
      <button
        type="button"
        class="inline-flex h-5 items-center gap-1 rounded-md bg-primary px-2 text-ui-2xs font-medium text-primary-foreground transition-opacity hover:opacity-85 disabled:opacity-60"
        onclick={onapplyedits}
        disabled={applying}
        title="Apply {pendingEditCount} unsaved change{pendingEditCount === 1 ? '' : 's'}"
      >
        {#if applying}
          <span class="size-2.5 shrink-0 animate-spin rounded-full border border-current/40 border-t-current"></span>
          Applying…
        {:else}
          <Icon name="check" class="size-2.5 shrink-0" />
          Apply {pendingEditCount}
        {/if}
      </button>
      <button
        type="button"
        class="inline-flex h-5 items-center gap-1 rounded-md px-2 text-ui-2xs text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-40"
        onclick={onresetedits}
        disabled={applying}
        title="Discard unsaved changes"
      >
        <Icon name="undo-2" class="size-2.5 shrink-0" />
        <span class="@max-[780px]/sb:hidden">Reset</span>
      </button>
      {@render sep()}
    {/if}

    <!-- Go to page — opens the ⌘P page navigator -->
    {#if connection}
      <button
        type="button"
        class={iconBtn}
        onclick={onopenpages}
        title="Go to page (⌘P)"
        aria-label="Go to page"
      >
        <Icon name="plus" class="size-3.5" />
      </button>
      {@render sep()}
    {/if}

    <!-- AI toggle -->
    <button
      type="button"
      class={cn(iconBtn, aiMode ? 'text-primary! hover:text-primary!' : '')}
      onclick={onopenaimode}
      title={aiMode ? 'Close AI (⌘⇧E)' : 'Open AI (⌘⇧E)'}
    >
      <Icon name="bot" class="size-3.5" />
    </button>

    <!-- Command palette -->
    <button type="button" class={iconBtn} onclick={onopencommand} title="Command menu (⌘K)">
      <Icon name="command" class="size-3.5" />
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
        <Icon name="lock" class="size-3.5" />
      {:else}
        <Icon name="lock-open" class="size-3.5" />
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
        <Icon name="sun" class="size-3.5" />
      {:else}
        <Icon name="moon" class="size-3.5" />
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
      <Icon name="settings" class="size-3.5" />
    </button>

    <!-- Disconnect -->
    {#if connection}
      <button
        type="button"
        class="{iconBtn} hover:text-destructive!"
        onclick={ondisconnect}
        title="Disconnect"
      >
        <Icon name="unplug" class="size-3.5" />
      </button>
    {/if}

    {@render sep()}

    <!-- Update badge -->
    {#if hasUpdate}
      <button
        type="button"
        class="flex items-center gap-1 rounded-md px-2 py-1 text-ui-2xs font-medium text-amber-500 transition-colors hover:bg-muted/50 hover:text-amber-400"
        onclick={oncheckupdate}
        title="Update available"
      >
        <Icon name="arrow-up-circle" class="size-3 shrink-0" />
        <span class="@max-[840px]/sb:hidden">Update</span>
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
      <span class="font-medium @max-[900px]/sb:hidden">MCP</span>
    </button>

    {@render sep()}

    <!-- AI model picker -->
    <SearchableMenu
      bind:open={aiModelMenuOpen}
      side="top"
      align="end"
      contentClass="w-64"
      placeholder="Search models…"
      items={$aiProfiles.map((p) => ({ value: p.id, label: p.name, keywords: [p.model] }))}
      onselect={(it) => setActiveProfile(it.value)}
    >
      {#snippet trigger(props)}
        <button {...props} type="button" class={cn(labelBtn, 'text-muted-foreground/70')} title="Switch AI model">
          {#if activeProfile && hasBrand(activeProfile.provider)}
            <BrandIcon name={activeProfile.provider} class="size-3 shrink-0 opacity-70" />
          {:else}
            <Icon name="bot" class="size-3 shrink-0 opacity-60" />
          {/if}
          <span class="max-w-[9rem] truncate font-medium @max-[780px]/sb:hidden">{modelName}</span>
          <Icon name="chevron-down" class="size-3 shrink-0 opacity-35 @max-[780px]/sb:hidden" />
        </button>
      {/snippet}
      {#snippet item(it)}
        {@const profile = $aiProfiles.find((p) => p.id === it.value)}
        {#if profile && hasBrand(profile.provider)}
          <BrandIcon name={profile.provider} class="size-4 shrink-0 text-muted-foreground/70" />
        {:else}
          <Icon name="bot" class="size-4 shrink-0 text-muted-foreground/40" />
        {/if}
        <span class="min-w-0 flex-1 truncate text-ui-sm font-medium" title={profile?.model ?? it.label}>{profile?.name ?? it.label}</span>
        {#if $activeProfileId === it.value}<Icon name="check" class="size-3.5 shrink-0 text-primary" />{/if}
      {/snippet}
      {#snippet footer()}
        <div class="border-t border-border/50 p-1">
          <button
            type="button"
            class="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onclick={() => { aiModelMenuOpen = false; onopenmodelsettings() }}
          >
            <Icon name="settings-2" class="size-3.5 shrink-0 text-muted-foreground/50" />
            Manage models…
          </button>
        </div>
      {/snippet}
    </SearchableMenu>

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
