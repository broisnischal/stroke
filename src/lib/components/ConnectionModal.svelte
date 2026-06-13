<script>
  import { untrack } from 'svelte'
  import X            from '@lucide/svelte/icons/x'
  import Clock        from '@lucide/svelte/icons/clock'
  import Loader2      from '@lucide/svelte/icons/loader-2'
  import Plus         from '@lucide/svelte/icons/plus'
  import Play         from '@lucide/svelte/icons/play'
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2'
  import AlertCircle  from '@lucide/svelte/icons/alert-circle'
  import Trash2       from '@lucide/svelte/icons/trash-2'
  import Database     from '@lucide/svelte/icons/database'
  import HardDrive    from '@lucide/svelte/icons/hard-drive'
  import Zap          from '@lucide/svelte/icons/zap'
  import Globe        from '@lucide/svelte/icons/globe'
  import Cloud        from '@lucide/svelte/icons/cloud'
  import BarChart2    from '@lucide/svelte/icons/bar-chart-2'
  import FolderOpen   from '@lucide/svelte/icons/folder-open'
  import Terminal     from '@lucide/svelte/icons/terminal'
  import CloudflareLogin from './CloudflareLogin.svelte'
  import {
    testPostgresConnection, connectPostgres,
    testSqliteConnection,   connectSqlite,
    testMysqlConnection,    connectMysql,
    testD1Connection,       connectD1,
    testLibSqlConnection,   connectLibSql,
    cloudflareListAccounts, cloudflareListD1Databases,
  } from '$lib/api.js'
  import {
    loadSavedConnections, upsertConnection, removeConnection,
    newConnectionId, getLastConnectionId, setLastConnectionId,
  } from '$lib/stores/connections.js'
  import { Input }      from '$lib/components/ui/input/index.js'
  import { Checkbox }   from '$lib/components/ui/checkbox/index.js'
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js'
  import * as Dialog    from '$lib/components/ui/dialog/index.js'
  import { cn }         from '$lib/utils.js'
  import { parseConnectionUri } from '$lib/connection-uri.js'

  let {
    open = $bindable(false),
    onconnected = (conn, id) => {},
  } = $props()

  const CATEGORIES = [
    {
      label: 'Relational',
      drivers: [
        { id: 'postgres', label: 'PostgreSQL',      desc: 'Open-source relational database' },
        { id: 'mysql',    label: 'MySQL',            desc: 'Popular relational database' },
      ],
    },
    {
      label: 'SQLite',
      drivers: [
        { id: 'sqlite',        label: 'SQLite',           desc: 'Local file-based database' },
        { id: 'sqlite-memory', label: 'In-Memory',        desc: 'Ephemeral, nothing on disk' },
        { id: 'libsql',        label: 'Turso / LibSQL',   desc: 'Serverless SQLite at the edge' },
      ],
    },
    {
      label: 'Cloud',
      drivers: [
        { id: 'd1',       label: 'Cloudflare D1', desc: 'Edge SQLite via REST API' },
        { id: 'bigquery', label: 'BigQuery',       desc: 'Google analytics warehouse', soon: true },
      ],
    },
  ]

  const ALL_DRIVERS = CATEGORIES.flatMap(c => c.drivers)
  function driverById(id) { return ALL_DRIVERS.find(d => d.id === id) ?? ALL_DRIVERS[0] }

  let saved      = $state(loadSavedConnections().sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0)))
  let lastId     = $state(getLastConnectionId())
  let editingId  = $state(/** @type {string|null} */ (null))
  let connecting = $state(/** @type {string|null} */ (null))
  let testing    = $state(false)
  let error      = $state('')
  let testOk     = $state(false)

  let dbType      = $state('postgres')
  let name        = $state('')
  let host        = $state('127.0.0.1')
  let port        = $state('5432')
  let database    = $state('postgres')
  let user        = $state('postgres')
  let password    = $state('')
  let ssl         = $state(false)
  let filePath    = $state('')
  let accountId   = $state('')
  let databaseId  = $state('')
  let apiToken    = $state('')
  let libsqlUrl   = $state('')
  let libsqlToken = $state('')
  let connectionUri = $state('')
  let uriHint       = $state('')

  // ── SSH tunnel state ─────────────────────────────────────────────────────────
  let sshEnabled      = $state(false)
  let sshHost         = $state('')
  let sshPort         = $state('22')
  let sshUsername     = $state('')
  let sshKeyPath      = $state('')

  let d1DiscoverPhase     = $state(/** @type {'idle'|'loading'|'done'|'error'} */ ('idle'))
  let d1DiscoverError     = $state('')
  let d1Accounts          = $state(/** @type {Array<{id:string,name:string}>} */ ([]))
  let d1SelectedAccountId = $state('')
  let d1Databases         = $state(/** @type {Array<{uuid:string,name:string,num_tables?:number}>} */ ([]))
  let d1DbLoadPhase       = $state(/** @type {'idle'|'loading'} */ ('idle'))

  const DEFAULTS = {
    postgres:        { name: 'Local PostgreSQL', host: '127.0.0.1', port: '5432', database: 'postgres', user: 'postgres' },
    mysql:           { name: 'Local MySQL',       host: '127.0.0.1', port: '3306', database: 'mysql',    user: 'root' },
    sqlite:          { name: 'Local SQLite',      filePath: '' },
    'sqlite-memory': { name: 'In-Memory SQLite',  filePath: ':memory:' },
    libsql:          { name: 'My Turso DB',       libsqlUrl: '', libsqlToken: '' },
    d1:              { name: 'Cloudflare D1',     accountId: '', databaseId: '', apiToken: '' },
  }

  const activeDriver = $derived(ALL_DRIVERS.find(d => d.id === dbType) ?? ALL_DRIVERS[0])

  function sshPayload() {
    if (!sshEnabled || !sshHost.trim() || !sshUsername.trim()) return undefined
    return {
      host: sshHost.trim(),
      port: Number(sshPort) || 22,
      username: sshUsername.trim(),
      privateKeyPath: sshKeyPath.trim(),
    }
  }

  function formPayload() {
    const ssh = sshPayload()
    if (dbType === 'sqlite' || dbType === 'sqlite-memory')
      return { type: 'sqlite', name, filePath: dbType === 'sqlite-memory' ? ':memory:' : filePath }
    if (dbType === 'libsql') return { type: 'libsql', name, url: libsqlUrl, authToken: libsqlToken || undefined }
    if (dbType === 'd1')     return { type: 'd1', name, accountId, databaseId, apiToken }
    if (dbType === 'mysql')  return { type: 'mysql', name, host, port, database, user, password, ssl, ...(ssh && { ssh }) }
    return { type: 'postgres', name, host, port, database, user, password, ssl, ...(ssh && { ssh }) }
  }

  function resetForm(conn) {
    editingId = conn?.id ?? null
    if (conn) {
      const t = conn.type === 'sqlite' && conn.filePath === ':memory:' ? 'sqlite-memory' : (conn.type ?? 'postgres')
      dbType = t; name = conn.name ?? ''; host = conn.host ?? '127.0.0.1'
      port = String(conn.port ?? 5432); database = conn.database ?? 'postgres'
      user = conn.user ?? 'postgres'; password = conn.password ?? ''; ssl = Boolean(conn.ssl)
      filePath = conn.filePath ?? ''; accountId = conn.accountId ?? ''
      databaseId = conn.databaseId ?? ''; apiToken = conn.apiToken ?? ''
      libsqlUrl = conn.url ?? ''; libsqlToken = conn.authToken ?? ''
      const s = conn.ssh
      sshEnabled = !!s?.host; sshHost = s?.host ?? ''; sshPort = String(s?.port ?? 22)
      sshUsername = s?.username ?? ''; sshKeyPath = s?.privateKeyPath ?? ''
    } else {
      dbType = 'postgres'; name = ''; host = '127.0.0.1'; port = '5432'
      database = 'postgres'; user = 'postgres'; password = ''; ssl = false
      filePath = ''; accountId = ''; databaseId = ''; apiToken = ''
      libsqlUrl = ''; libsqlToken = ''
      sshEnabled = false; sshHost = ''; sshPort = '22'; sshUsername = ''; sshKeyPath = ''
    }
    error = ''; testOk = false; connectionUri = ''; uriHint = ''
    d1Reset()
  }

  function switchDriver(id) {
    dbType = id
    if (id === 'postgres') port = '5432'
    if (id === 'mysql')    port = '3306'
    if (id === 'sqlite-memory') filePath = ':memory:'
    error = ''; testOk = false; connectionUri = ''; uriHint = ''
    if (id !== 'd1') d1Reset()
  }

  function applyConnectionUri() {
    uriHint = ''
    const parsed = parseConnectionUri(dbType === 'sqlite' || dbType === 'sqlite-memory' ? 'sqlite' : 'postgres', connectionUri)
    if (!parsed) return
    if ('error' in parsed) { uriHint = parsed.error; return }
    if ((dbType === 'sqlite' || dbType === 'sqlite-memory') && 'filePath' in parsed) {
      filePath = parsed.filePath; uriHint = 'Fields updated from URI'; return
    }
    if ('host' in parsed) {
      host = parsed.host; port = parsed.port; database = parsed.database
      user = parsed.user; password = parsed.password; ssl = parsed.ssl
      uriHint = 'Fields updated from URI'
    }
  }

  function connDetail(conn) {
    if (conn.type === 'sqlite') return conn.filePath === ':memory:' ? 'in-memory' : (conn.filePath || '—')
    if (conn.type === 'libsql') return conn.url || '—'
    if (conn.type === 'd1')     return conn.accountId?.slice(0, 8) ? `${conn.accountId.slice(0,8)}…` : '—'
    return `${conn.host ?? ''}/${conn.database ?? ''}`
  }

  function relativeTime(ts) {
    if (!ts) return ''
    const s = (Date.now() - ts) / 1000
    if (s < 60)     return 'just now'
    if (s < 3600)   return `${Math.floor(s / 60)}m ago`
    if (s < 86400)  return `${Math.floor(s / 3600)}h ago`
    return new Date(ts).toLocaleDateString()
  }

  $effect(() => {
    if (!open) return
    untrack(() => {
      saved  = loadSavedConnections().sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
      lastId = getLastConnectionId()
      resetForm(null)
    })
  })

  function handleDelete(id) {
    saved = removeConnection(id).sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
    if (id === lastId) { lastId = null; setLastConnectionId(null) }
    if (editingId === id) resetForm(null)
  }

  async function connectWith(conn) {
    connecting = conn.id; error = ''
    try {
      if (conn.type === 'sqlite') await connectSqlite(conn)
      else if (conn.type === 'd1') await connectD1(conn)
      else if (conn.type === 'libsql') await connectLibSql(conn)
      else if (conn.type === 'mysql') await connectMysql(conn)
      else await connectPostgres(conn)
      const updated = { ...conn, lastConnectedAt: Date.now() }
      saved = upsertConnection(updated).sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
      setLastConnectionId(conn.id)
      open = false
      await onconnected(updated, conn.id)
    } catch (e) { error = String(e) }
    finally { connecting = null }
  }

  async function handleTest() {
    testing = true; error = ''; testOk = false
    try {
      const p = formPayload()
      if (p.type === 'sqlite') await testSqliteConnection(p)
      else if (p.type === 'd1') await testD1Connection(p)
      else if (p.type === 'libsql') await testLibSqlConnection(p)
      else if (p.type === 'mysql') await testMysqlConnection(p)
      else await testPostgresConnection(p)
      testOk = true
    } catch (e) { error = String(e) }
    finally { testing = false }
  }

  async function handleConnect() {
    connecting = editingId ?? '__new__'; error = ''
    try {
      const payload = formPayload()
      if (payload.type === 'sqlite') await connectSqlite(payload)
      else if (payload.type === 'd1') await connectD1(payload)
      else if (payload.type === 'libsql') await connectLibSql(payload)
      else if (payload.type === 'mysql') await connectMysql(payload)
      else await connectPostgres(payload)
      const existing = editingId ? saved.find(s => s.id === editingId) : null
      const id = existing?.id ?? newConnectionId()
      const saved_conn = {
        id, ...payload,
        port: (payload.type === 'postgres' || payload.type === 'mysql')
          ? (Number(payload.port) || (payload.type === 'mysql' ? 3306 : 5432)) : undefined,
        lastConnectedAt: Date.now(),
      }
      saved = upsertConnection(saved_conn).sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
      setLastConnectionId(id)
      open = false
      await onconnected(saved_conn, id)
    } catch (e) { error = String(e) }
    finally { connecting = null }
  }

  const canTest = $derived(dbType !== 'bigquery')
  const isBusy  = $derived(testing || !!connecting)

  async function d1Discover() {
    if (!apiToken.trim()) { d1DiscoverError = 'Enter your API token first.'; return }
    d1DiscoverPhase = 'loading'; d1DiscoverError = ''
    d1Accounts = []; d1Databases = []; d1SelectedAccountId = ''; accountId = ''; databaseId = ''
    try {
      d1Accounts = await cloudflareListAccounts(apiToken)
      d1DiscoverPhase = 'done'
      if (d1Accounts.length === 1) await d1SelectAccount(d1Accounts[0].id)
    } catch (e) { d1DiscoverPhase = 'error'; d1DiscoverError = String(e) }
  }

  async function d1SelectAccount(id) {
    d1SelectedAccountId = id; accountId = id; d1Databases = []; databaseId = ''; d1DbLoadPhase = 'loading'
    try { d1Databases = await cloudflareListD1Databases(apiToken, id) }
    catch (e) { d1DiscoverError = String(e) }
    finally { d1DbLoadPhase = 'idle' }
  }

  function d1Reset() {
    d1DiscoverPhase = 'idle'; d1DiscoverError = ''; d1Accounts = []
    d1Databases = []; d1SelectedAccountId = ''; d1DbLoadPhase = 'idle'
  }

  const lbl = 'mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground/65'
  const inp = 'h-[34px] w-full rounded-md border border-border/50 bg-muted/20 px-3 text-[13px] text-foreground placeholder:text-muted-foreground/40 placeholder:font-normal transition-colors focus-visible:border-ring/60 focus-visible:ring-1 focus-visible:ring-ring/20 focus-visible:outline-none'
  const inpNum = inp + ' [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

  /** Color class for a driver id */
  function driverColor(id) {
    if (id === 'postgres')        return 'text-blue-400'
    if (id === 'mysql')           return 'text-amber-400'
    if (id === 'sqlite')          return 'text-emerald-400'
    if (id === 'sqlite-memory')   return 'text-violet-400'
    if (id === 'libsql')          return 'text-sky-400'
    if (id === 'd1')              return 'text-orange-400'
    return 'text-muted-foreground'
  }
  function driverBg(id) {
    if (id === 'postgres')        return 'bg-blue-500/10'
    if (id === 'mysql')           return 'bg-amber-500/10'
    if (id === 'sqlite')          return 'bg-emerald-500/10'
    if (id === 'sqlite-memory')   return 'bg-violet-500/10'
    if (id === 'libsql')          return 'bg-sky-500/10'
    if (id === 'd1')              return 'bg-orange-500/10'
    return 'bg-muted/40'
  }

  async function pickSqliteFile() {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const path = await open({
        title: 'Select SQLite database',
        filters: [
          { name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3'] },
          { name: 'All files', extensions: ['*'] },
        ],
      })
      if (typeof path === 'string' && path) filePath = path
    } catch { /* browser/non-Tauri env */ }
  }
</script>

<!-- SSH Tunnel section (shared by PG and MySQL forms) -->
{#snippet sshSection(_driver)}
  <div class="border-t border-border/15 pt-3">
    <label class="flex cursor-pointer select-none items-center gap-2">
      <Checkbox id="cn-ssh-enabled" checked={sshEnabled} onCheckedChange={(v) => (sshEnabled = v === true)} />
      <span class="flex items-center gap-1.5 text-[12px] text-muted-foreground/65">
        <Terminal class="size-3 shrink-0" />
        Connect via SSH tunnel
      </span>
    </label>

    {#if sshEnabled}
      <div class="mt-3 flex flex-col gap-2.5 rounded-lg border border-border/20 bg-muted/[0.03] p-3">
        <div class="grid grid-cols-[1fr_68px] gap-2">
          <div>
            <label for="cn-ssh-host" class={lbl}>SSH Host</label>
            <Input id="cn-ssh-host" bind:value={sshHost} placeholder="bastion.example.com" class={inp} />
          </div>
          <div>
            <label for="cn-ssh-port" class={lbl}>Port</label>
            <Input id="cn-ssh-port" bind:value={sshPort} type="text" inputmode="numeric" class={inpNum} />
          </div>
        </div>
        <div>
          <label for="cn-ssh-user" class={lbl}>SSH Username</label>
          <Input id="cn-ssh-user" bind:value={sshUsername} placeholder="ec2-user" autocomplete="username" class={inp} />
        </div>
        <div>
          <label for="cn-ssh-key" class={lbl}>
            Identity file <span class="normal-case font-normal opacity-50">(optional — leave blank to use SSH agent)</span>
          </label>
          <Input
            id="cn-ssh-key" bind:value={sshKeyPath}
            placeholder="~/.ssh/id_rsa"
            class={cn(inp, 'font-mono text-[11px]')}
          />
        </div>
      </div>
    {/if}
  </div>
{/snippet}

<!-- Driver icon -->
{#snippet dicon(id, cls = 'size-4', colored = false)}
  {@const c = colored ? driverColor(id) : 'text-muted-foreground'}
  {#if id === 'postgres'}           <Database  class="{cls} shrink-0 {c}" />
  {:else if id === 'mysql'}         <Database  class="{cls} shrink-0 {c}" />
  {:else if id === 'sqlite'}        <HardDrive class="{cls} shrink-0 {c}" />
  {:else if id === 'sqlite-memory'} <Zap       class="{cls} shrink-0 {c}" />
  {:else if id === 'libsql'}        <Globe     class="{cls} shrink-0 {c}" />
  {:else if id === 'd1'}            <Cloud     class="{cls} shrink-0 {c}" />
  {:else}                           <BarChart2 class="{cls} shrink-0 {c}" />{/if}
{/snippet}

<Dialog.Root bind:open>
  <Dialog.Content
    showCloseButton={false}
    class="flex h-[min(90vh,660px)] w-[min(880px,calc(100vw-2rem))] max-w-none sm:max-w-none flex-col gap-0 overflow-hidden rounded-xl border border-border/25 bg-background p-0 shadow-2xl shadow-black/50"
  >
    <div class="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)] overflow-hidden">

      <!-- ── Sidebar ─────────────────────────────────────────────── -->
      <aside class="flex min-h-0 flex-col border-r border-border/15">

        <!-- New connection button -->
        <div class="shrink-0 px-3 pt-3 pb-2.5">
          <button
            type="button"
            onclick={() => resetForm(null)}
            class={cn(
              'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] transition-colors',
              !editingId
                ? 'font-medium text-foreground'
                : 'text-muted-foreground/50 hover:text-foreground'
            )}
          >
            <Plus class="size-3.5 shrink-0" />
            New connection
          </button>
        </div>

        {#if saved.length > 0}
          <div class="mx-3 border-t border-border/10"></div>
        {/if}

        <div class="min-h-0 flex-1">
          {#if saved.length > 0}
            <ScrollArea class="h-full scroll-smooth">
              <div class="px-2 py-2 flex flex-col gap-0.5">
                {#each saved as conn (conn.id)}
                  {@const isSel = conn.id === editingId}
                  {@const busy2 = connecting === conn.id}
                  {@const cid   = conn.type === 'sqlite' && conn.filePath === ':memory:' ? 'sqlite-memory' : conn.type}
                  <div
                    class={cn(
                      'group flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors',
                      isSel
                        ? 'bg-muted/50 text-foreground'
                        : 'text-muted-foreground/55 hover:bg-muted/30 hover:text-foreground'
                    )}
                    role="button" tabindex="0"
                    onclick={() => resetForm(conn)}
                    onkeydown={(e) => e.key === 'Enter' && resetForm(conn)}
                  >
                    <!-- Icon: fades to Play on hover — clicking it connects directly -->
                    <button
                      type="button"
                      class="relative size-3.5 shrink-0 disabled:opacity-30"
                      title="Connect"
                      disabled={!!connecting}
                      onclick={(e) => { e.stopPropagation(); void connectWith(conn) }}
                    >
                      <span class="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover:opacity-0">
                        {#if busy2}
                          <Loader2 class="size-3.5 animate-spin" />
                        {:else}
                          {@render dicon(cid, 'size-3.5', isSel)}
                        {/if}
                      </span>
                      <span class="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                        <Play class="size-3" />
                      </span>
                    </button>

                    <!-- Name + detail when selected -->
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-[12px] {isSel ? 'font-medium' : ''} leading-tight">
                        {conn.name || 'Unnamed'}
                      </p>
                      {#if isSel}
                        <p class="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground/40">{connDetail(conn)}</p>
                      {/if}
                    </div>

                    <!-- Trash: hidden until hover -->
                    <button type="button"
                      class="shrink-0 rounded p-0.5 text-muted-foreground/25 opacity-0 transition-opacity duration-150 hover:text-destructive group-hover:opacity-100"
                      onclick={(e) => { e.stopPropagation(); handleDelete(conn.id) }}
                    ><Trash2 class="size-3" /></button>
                  </div>
                {/each}
              </div>
            </ScrollArea>
          {:else}
            <div class="flex h-full items-center justify-center pb-8">
              <p class="text-[11px] text-muted-foreground/25">No saved connections</p>
            </div>
          {/if}
        </div>
      </aside>

      <!-- ── Form panel ──────────────────────────────────────────── -->
      <div class="flex min-h-0 min-w-0 flex-col">

        <!-- ── Header: connection name + driver type tabs ─────── -->
        <div class="shrink-0 border-b border-border/15 px-5 pt-4 pb-0">

          <!-- Connection name field -->
          <div class="mb-3 grid grid-cols-[1fr_auto] items-end gap-3">
            <div>
              <label for="cn-name" class={lbl}>Name</label>
              <Input id="cn-name" bind:value={name} class={inp} placeholder="e.g. Production DB" />
            </div>
          </div>

          <!-- Driver type tabs — horizontal scrollable, replaces the dropdown -->
          <div class="flex items-center gap-0 overflow-x-auto" style="scrollbar-width: none; -webkit-overflow-scrolling: touch">
            {#each CATEGORIES as cat, ci}
              {#if ci > 0}
                <span class="mx-2 h-3 w-px shrink-0 bg-border/20"></span>
              {/if}
              {#each cat.drivers as d (d.id)}
                <button
                  type="button"
                  onclick={() => !d.soon && switchDriver(d.id)}
                  disabled={!!d.soon}
                  title={d.desc}
                  class={cn(
                    'relative flex shrink-0 items-center gap-1.5 pb-2.5 pt-1.5 pr-3 pl-1 text-[11px] transition-colors select-none',
                    dbType === d.id
                      ? 'font-semibold text-foreground'
                      : 'text-muted-foreground/55 hover:text-foreground',
                    d.soon && 'cursor-not-allowed opacity-25 pointer-events-none'
                  )}
                >
                  {@render dicon(d.id, 'size-[11px] shrink-0', dbType === d.id)}
                  {d.label}
                  {#if d.soon}<span class="text-[8px] opacity-60">soon</span>{/if}
                  <!-- Active underline -->
                  {#if dbType === d.id}
                    <span class="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full bg-foreground"></span>
                  {/if}
                </button>
              {/each}
            {/each}
          </div>
        </div>

        <!-- ── Scrollable form body ─────────────────────────────── -->
        <ScrollArea class="min-h-0 flex-1 scroll-smooth">
          <div class="flex flex-col gap-3 px-5 py-5">

            <!-- ── PostgreSQL ──────────────────────────────── -->
            {#if dbType === 'postgres'}

              <div>
                <label for="cn-uri" class={lbl}>Connection string</label>
                <div class="flex gap-1.5">
                  <Input id="cn-uri" bind:value={connectionUri}
                    placeholder="postgresql://user:pass@host:5432/db"
                    class={cn(inp, 'font-mono text-[11px]')}
                    onpaste={() => requestAnimationFrame(applyConnectionUri)}
                    onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), applyConnectionUri())}
                  />
                  <button type="button" onclick={applyConnectionUri} disabled={!connectionUri.trim()}
                    class="h-[30px] shrink-0 rounded-md border border-border/25 px-2.5 text-[11px] text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-25">
                    Parse
                  </button>
                </div>
                {#if uriHint}
                  <p class={cn('mt-1 flex items-center gap-1 text-[10px]',
                    uriHint.includes('Could') || uriHint.includes('Expected') ? 'text-destructive' : 'text-emerald-500')}>
                    {#if uriHint.includes('Could') || uriHint.includes('Expected')}
                      <AlertCircle class="size-2.5" />
                    {:else}
                      <CheckCircle2 class="size-2.5" />
                    {/if}
                    {uriHint}
                  </p>
                {/if}
              </div>

              <div class="grid grid-cols-[1fr_80px] gap-2">
                <div>
                  <label for="cn-host" class={lbl}>Host</label>
                  <Input id="cn-host" bind:value={host} class={inp} />
                </div>
                <div>
                  <label for="cn-port" class={lbl}>Port</label>
                  <Input id="cn-port" bind:value={port} type="text" inputmode="numeric" class={inpNum} />
                </div>
              </div>

              <div>
                <label for="cn-db" class={lbl}>Database</label>
                <Input id="cn-db" bind:value={database} class={inp} />
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label for="cn-user" class={lbl}>Username</label>
                  <Input id="cn-user" bind:value={user} autocomplete="username" class={inp} />
                </div>
                <div>
                  <label for="cn-pass" class={lbl}>Password</label>
                  <Input id="cn-pass" bind:value={password} type="password" autocomplete="current-password" class={inp} />
                </div>
              </div>

              <label class="flex cursor-pointer select-none items-center gap-2 pt-0.5">
                <Checkbox id="cn-ssl" checked={ssl} onCheckedChange={(v) => (ssl = v === true)} />
                <span class="text-[12px] text-muted-foreground/65">Use SSL / TLS</span>
              </label>

              {@render sshSection('pg')}

            <!-- ── MySQL ────────────────────────────────── -->
            {:else if dbType === 'mysql'}

              <div class="grid grid-cols-[1fr_80px] gap-2">
                <div>
                  <label for="cn-mysql-host" class={lbl}>Host</label>
                  <Input id="cn-mysql-host" bind:value={host} class={inp} />
                </div>
                <div>
                  <label for="cn-mysql-port" class={lbl}>Port</label>
                  <Input id="cn-mysql-port" bind:value={port} type="text" inputmode="numeric" class={inpNum} />
                </div>
              </div>

              <div>
                <label for="cn-mysql-db" class={lbl}>Database</label>
                <Input id="cn-mysql-db" bind:value={database} class={inp} />
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label for="cn-mysql-user" class={lbl}>Username</label>
                  <Input id="cn-mysql-user" bind:value={user} autocomplete="username" class={inp} />
                </div>
                <div>
                  <label for="cn-mysql-pass" class={lbl}>Password</label>
                  <Input id="cn-mysql-pass" bind:value={password} type="password" autocomplete="current-password" class={inp} />
                </div>
              </div>

              <label class="flex cursor-pointer select-none items-center gap-2 pt-0.5">
                <Checkbox id="cn-mysql-ssl" checked={ssl} onCheckedChange={(v) => (ssl = v === true)} />
                <span class="text-[12px] text-muted-foreground/65">Use SSL / TLS</span>
              </label>

              {@render sshSection('mysql')}

            <!-- ── SQLite ────────────────────────────────── -->
            {:else if dbType === 'sqlite'}

              <div>
                <label for="cn-path" class={lbl}>File</label>
                <div class="flex gap-1.5">
                  <Input id="cn-path" bind:value={filePath}
                    placeholder="/path/to/database.db"
                    class={cn(inp, 'font-mono text-[11px]')} />
                  <button type="button" onclick={pickSqliteFile}
                    class="inline-flex h-[30px] shrink-0 items-center gap-1 rounded-md border border-border/25 px-2.5 text-[11px] text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground">
                    <FolderOpen class="size-3" />
                    Browse
                  </button>
                </div>
              </div>

            <!-- ── In-Memory ─────────────────────────────── -->
            {:else if dbType === 'sqlite-memory'}

              <div class="flex flex-col gap-1.5 rounded-lg border border-border/15 bg-muted/[0.04] px-4 py-3.5">
                <p class="text-[12px] font-medium text-foreground/70">Ephemeral in-memory database</p>
                <p class="text-[11px] leading-relaxed text-muted-foreground/45">
                  Data lives only for this session. Nothing is written to disk — closing the connection discards everything.
                </p>
              </div>

            <!-- ── LibSQL / Turso ─────────────────────────── -->
            {:else if dbType === 'libsql'}

              <div>
                <label for="cn-libsql-url" class={lbl}>URL</label>
                <Input id="cn-libsql-url" bind:value={libsqlUrl}
                  placeholder="libsql://your-db.turso.io"
                  class={cn(inp, 'font-mono text-[11px]')} />
                <p class="mt-1 text-[10px] text-muted-foreground/30">libsql:// · https:// · http://localhost:PORT</p>
              </div>

              <div>
                <label for="cn-libsql-token" class={lbl}>Auth token <span class="normal-case font-normal opacity-50">(optional)</span></label>
                <Input id="cn-libsql-token" bind:value={libsqlToken} type="password"
                  placeholder="eyJhbGciOiJFZERTQSJ9…"
                  class={cn(inp, 'font-mono text-[11px]')} />
              </div>

            <!-- ── Cloudflare D1 ──────────────────────────── -->
            {:else if dbType === 'd1'}

              <CloudflareLogin
                onselect={(info) => {
                  accountId  = info.accountId
                  databaseId = info.databaseId
                  apiToken   = info.token
                  if (!name || name === 'Cloudflare D1') name = info.databaseName
                }}
                ondisconnect={() => { accountId = ''; databaseId = ''; apiToken = '' }}
              />

              <details class="group">
                <summary class="cursor-pointer list-none select-none text-[10px] text-muted-foreground/30 hover:text-muted-foreground">
                  <span class="group-open:hidden">↓ Manual setup</span>
                  <span class="hidden group-open:inline">↑ Manual setup</span>
                </summary>
                <div class="mt-2.5 flex flex-col gap-2.5">
                  <div class="grid grid-cols-2 gap-2">
                    <div>
                      <label for="cn-d1-account" class={lbl}>Account ID</label>
                      <Input id="cn-d1-account" bind:value={accountId} placeholder="abcdef…" class={cn(inp, 'font-mono text-[11px]')} />
                    </div>
                    <div>
                      <label for="cn-d1-dbid" class={lbl}>Database ID</label>
                      <Input id="cn-d1-dbid" bind:value={databaseId} placeholder="xxxxxxxx-…" class={cn(inp, 'font-mono text-[11px]')} />
                    </div>
                  </div>
                  <div>
                    <label for="cn-d1-token" class={lbl}>API token</label>
                    <Input id="cn-d1-token" bind:value={apiToken} type="password" class={inp} />
                  </div>
                </div>
              </details>

            {/if}

          </div>
        </ScrollArea>

        <!-- ── Footer — fixed height, no layout shift ──────────── -->
        <div class="shrink-0 border-t border-border/15 px-5 pb-3 pt-2.5">

          <!-- Feedback slot — always occupies height, shows message when needed -->
          <div class="mb-2 flex min-h-[18px] items-center">
            {#if error}
              <p class="flex items-start gap-1 text-[11px] leading-snug text-destructive">
                <AlertCircle class="mt-px size-2.5 shrink-0" />{error}
              </p>
            {:else if testOk}
              <p class="flex items-center gap-1 text-[11px] text-emerald-500">
                <CheckCircle2 class="size-2.5 shrink-0" />Connected successfully
              </p>
            {/if}
          </div>

          <!-- Button row -->
          <div class="flex items-center justify-between gap-1.5">
            <!-- Resume last -->
            <div class="min-w-0">
              {#if lastId && saved.find(c => c.id === lastId)}
                {@const lastConn = saved.find(c => c.id === lastId)}
                <button type="button"
                  onclick={() => connectWith(lastConn)}
                  disabled={isBusy}
                  class="inline-flex h-[30px] max-w-[180px] items-center gap-1.5 rounded-md border border-border/25 px-3 text-[12px] text-muted-foreground/55 transition-colors hover:bg-muted/30 hover:text-foreground disabled:opacity-25"
                >
                  {#if connecting === lastConn.id}
                    <Loader2 class="size-3 animate-spin" />Resuming…
                  {:else}
                    Resume <span class="min-w-0 truncate text-foreground/70">{lastConn.name}</span>
                  {/if}
                </button>
              {/if}
            </div>
            <!-- Test + Connect -->
            <div class="flex shrink-0 items-center gap-1.5">
              {#if canTest}
                <button type="button" onclick={handleTest} disabled={isBusy}
                  class="inline-flex h-[30px] items-center gap-1 rounded-md border border-border/30 px-3 text-[12px] text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-25">
                  {#if testing}<Loader2 class="size-3 animate-spin" />Testing…{:else}Test{/if}
                </button>
              {/if}
              <button type="button" onclick={handleConnect} disabled={isBusy || dbType === 'bigquery'}
                class="inline-flex h-[30px] items-center gap-1 rounded-md bg-foreground px-4 text-[12px] font-semibold text-background transition-colors hover:bg-foreground/85 disabled:opacity-40">
                {#if connecting === (editingId ?? '__new__')}
                  <Loader2 class="size-3 animate-spin" />Connecting…
                {:else}
                  {editingId ? 'Save & connect' : 'Connect'}
                {/if}
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Close button -->
    <Dialog.Close class="absolute right-3 top-3 inline-flex size-5 items-center justify-center rounded text-muted-foreground/20 transition-colors hover:bg-muted/60 hover:text-muted-foreground focus-visible:outline-none">
      <X class="size-3" />
    </Dialog.Close>
  </Dialog.Content>
</Dialog.Root>
