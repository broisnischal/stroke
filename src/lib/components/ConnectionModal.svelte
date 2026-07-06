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
  import FolderOpen   from '@lucide/svelte/icons/folder-open'
  import Terminal     from '@lucide/svelte/icons/terminal'
  import Lock         from '@lucide/svelte/icons/lock'
  import ChevronDown  from '@lucide/svelte/icons/chevron-down'
  import Check        from '@lucide/svelte/icons/check'
  import CloudflareLogin from './CloudflareLogin.svelte'
  import ProviderConnect from './ProviderConnect.svelte'
  import SearchableMenu from './SearchableMenu.svelte'
  import DbIcon from './DbIcon.svelte'
  import {
    testPostgresConnection, connectPostgres,
    testSqliteConnection,   connectSqlite,
    testMysqlConnection,    connectMysql,
    testD1Connection,       connectD1,
    testLibSqlConnection,   connectLibSql,
    testClickhouseConnection, connectClickhouse,
    testDuckdbConnection,   connectDuckdb,
    testMssqlConnection,    connectMssql,
    cloudflareListAccounts, cloudflareListD1Databases,
  } from '$lib/api.js'
  import {
    loadSavedConnections, upsertConnection, removeConnection,
    newConnectionId, getLastConnectionId, setLastConnectionId,
  } from '$lib/stores/connections.js'
  import { Input }      from '$lib/components/ui/input/index.js'
  import { Checkbox }   from '$lib/components/ui/checkbox/index.js'
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js'
  import { Dialog as DialogPrimitive } from 'bits-ui'
  import { cn }         from '$lib/utils.js'
  import { parseConnectionUri } from '$lib/connection-uri.js'

  let {
    open = $bindable(false),
    onconnected = (conn, id) => {},
    maxConnections = Infinity,
  } = $props()

  const CATEGORIES = [
    {
      label: 'Relational',
      drivers: [
        { id: 'postgres',    label: 'PostgreSQL',  desc: 'Open-source relational database' },
        { id: 'mysql',       label: 'MySQL',        desc: 'Popular relational database' },
        { id: 'mariadb',     label: 'MariaDB',      desc: 'MySQL-compatible relational database' },
        { id: 'cockroachdb', label: 'CockroachDB',  desc: 'Distributed Postgres-compatible SQL' },
        { id: 'mssql',       label: 'SQL Server',   desc: 'Microsoft SQL Server' },
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
      label: 'Analytics',
      drivers: [
        { id: 'clickhouse', label: 'ClickHouse', desc: 'Columnar OLAP over HTTP' },
        { id: 'duckdb',     label: 'DuckDB',     desc: 'In-process analytical database' },
        { id: 'duckdb-memory', label: 'DuckDB In-Memory', desc: 'Ephemeral DuckDB, nothing on disk' },
      ],
    },
    {
      label: 'Cloud',
      drivers: [
        { id: 'd1',       label: 'Cloudflare D1', desc: 'Edge SQLite via REST API' },
        { id: 'bigquery', label: 'BigQuery',       desc: 'Google analytics warehouse', soon: true },
      ],
    },
    {
      label: 'Hosting providers',
      drivers: [
        { id: 'neon',        label: 'Neon',            desc: 'Serverless Postgres — sign in & pick a database' },
        { id: 'supabase',    label: 'Supabase',        desc: 'Postgres platform — sign in & pick a project' },
        { id: 'planetscale', label: 'PlanetScale',     desc: 'Serverless MySQL — sign in & pick a database' },
        { id: 'prisma',      label: 'Prisma Postgres', desc: 'Paste a Prisma Postgres connection string' },
      ],
    },
  ]

  const ALL_DRIVERS = CATEGORIES.flatMap(c => c.drivers)
  function driverById(id) { return ALL_DRIVERS.find(d => d.id === id) ?? ALL_DRIVERS[0] }

  // Flat, explicitly-ordered list for the searchable Type dropdown.
  // PostgreSQL → SQLite → MySQL pinned to the top, then the rest.
  const DRIVER_ORDER = [
    'postgres', 'sqlite', 'mysql', 'mariadb', 'cockroachdb', 'mssql',
    'clickhouse', 'duckdb', 'sqlite-memory', 'duckdb-memory', 'libsql',
    'neon', 'supabase', 'planetscale', 'prisma', 'd1', 'bigquery',
  ]
  const driverItems = DRIVER_ORDER
    .map((id) => ALL_DRIVERS.find((d) => d.id === id))
    .filter(Boolean)
    .map((d) => ({ value: d.id, label: d.label, keywords: [d.label, d.desc], disabled: !!d.soon }))

  let saved      = $state(loadSavedConnections().sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0)))
  let lastId     = $state(getLastConnectionId())
  let editingId  = $state(/** @type {string|null} */ (null))
  let connecting = $state(/** @type {string|null} */ (null))
  let testing    = $state(false)
  let error      = $state('')
  let testOk     = $state(false)

  // Cancellation token. The Tauri command keeps running, but bumping this makes
  // the in-flight handler ignore its result and unblock the UI immediately.
  let opId = 0
  function stopOp() {
    opId += 1
    connecting = null
    testing = false
    error = ''
    testOk = false
  }

  let dbType        = $state('postgres')
  let driverMenuOpen = $state(false)
  let name        = $state('')
  let host        = $state('127.0.0.1')
  let port        = $state('5432')
  let database    = $state('postgres')
  let user        = $state('postgres')
  let password    = $state('')
  let ssl         = $state(false)
  let secure      = $state(false)
  let encrypt     = $state(false)
  let trustCert   = $state(true)
  let filePath    = $state('')
  let accountId   = $state('')
  let databaseId  = $state('')
  let apiToken    = $state('')
  let libsqlUrl   = $state('')
  let libsqlToken = $state('')
  let connectionUri = $state('')
  let uriHint       = $state('')

  // ── Connection options ───────────────────────────────────────────────────────
  let readOnly        = $state(false)

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
    mariadb:         { name: 'Local MariaDB',     host: '127.0.0.1', port: '3306', database: 'mysql',    user: 'root' },
    cockroachdb:     { name: 'Local CockroachDB', host: '127.0.0.1', port: '26257', database: 'defaultdb', user: 'root' },
    sqlite:          { name: 'Local SQLite',      filePath: '' },
    'sqlite-memory': { name: 'In-Memory SQLite',  filePath: ':memory:' },
    libsql:          { name: 'My Turso DB',       libsqlUrl: '', libsqlToken: '' },
    d1:              { name: 'Cloudflare D1',     accountId: '', databaseId: '', apiToken: '' },
    clickhouse:      { name: 'Local ClickHouse',  host: '127.0.0.1', port: '8123', database: 'default', user: 'default' },
    duckdb:          { name: 'Local DuckDB',      filePath: '' },
    'duckdb-memory': { name: 'In-Memory DuckDB',  filePath: ':memory:' },
    mssql:           { name: 'Local SQL Server',  host: '127.0.0.1', port: '1433', database: 'master', user: 'sa' },
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
    if (dbType === 'mysql' || dbType === 'mariadb')
      return { type: dbType, name, host, port, database, user, password, ssl, ...(ssh && { ssh }) }
    if (dbType === 'cockroachdb')
      return { type: 'cockroachdb', name, host, port, database, user, password, ssl, ...(ssh && { ssh }) }
    if (dbType === 'clickhouse')
      return { type: 'clickhouse', name, host, port, database, user, password, secure }
    if (dbType === 'duckdb' || dbType === 'duckdb-memory')
      return { type: 'duckdb', name, filePath: dbType === 'duckdb-memory' ? ':memory:' : filePath }
    if (dbType === 'mssql')
      return { type: 'mssql', name, host, port, database, user, password, encrypt, trustCert }
    return { type: 'postgres', name, host, port, database, user, password, ssl, ...(ssh && { ssh }) }
  }

  function resetForm(conn) {
    editingId = conn?.id ?? null
    if (conn) {
      const t = conn.filePath === ':memory:' && (conn.type === 'sqlite' || conn.type === 'duckdb')
        ? `${conn.type}-memory`
        : (conn.type ?? 'postgres')
      dbType = t; name = conn.name ?? ''; host = conn.host ?? '127.0.0.1'
      port = String(conn.port ?? 5432); database = conn.database ?? 'postgres'
      user = conn.user ?? 'postgres'; password = conn.password ?? ''; ssl = Boolean(conn.ssl)
      secure = Boolean(conn.secure)
      encrypt = Boolean(conn.encrypt); trustCert = conn.trustCert ?? true
      filePath = conn.filePath ?? ''; accountId = conn.accountId ?? ''
      databaseId = conn.databaseId ?? ''; apiToken = conn.apiToken ?? ''
      libsqlUrl = conn.url ?? ''; libsqlToken = conn.authToken ?? ''
      const s = conn.ssh
      sshEnabled = !!s?.host; sshHost = s?.host ?? ''; sshPort = String(s?.port ?? 22)
      sshUsername = s?.username ?? ''; sshKeyPath = s?.privateKeyPath ?? ''
      readOnly = conn.readOnly ?? false
    } else {
      dbType = 'postgres'; name = ''; host = '127.0.0.1'; port = '5432'
      database = 'postgres'; user = 'postgres'; password = ''; ssl = false; secure = false
      encrypt = false; trustCert = true
      filePath = ''; accountId = ''; databaseId = ''; apiToken = ''
      libsqlUrl = ''; libsqlToken = ''
      sshEnabled = false; sshHost = ''; sshPort = '22'; sshUsername = ''; sshKeyPath = ''
      readOnly = false
    }
    error = ''; testOk = false; connectionUri = ''; uriHint = ''
    d1Reset()
  }

  /**
   * A provider adapter resolved a database (with a password if it needed one):
   * build a SavedConnection and connect immediately via connectWith — no detour
   * through the manual form, so picking a project just connects. Runs the same
   * connect/save/close path as any other connection.
   * @param {import('$lib/providers.js').ProviderConnection} conn
   */
  async function connectProviderConnection(conn) {
    error = ''
    // dbType is the provider id while the provider flow is showing — tag the
    // connection with it so the status bar can offer switching to the account's
    // other databases later.
    const providerId = ['neon', 'supabase', 'planetscale', 'prisma'].includes(dbType) ? dbType : undefined
    const type = conn.db_type === 'mysql' ? 'mysql' : 'postgres'
    // Reuse an existing saved entry for this exact database (host + user) instead
    // of piling up duplicates — connectWith upserts it, keeping the saved password.
    const existing = saved.find((s) => s.host === conn.host && s.user === conn.username && s.type === type)
    await connectWith({
      id: existing?.id ?? newConnectionId(),
      type,
      name: conn.name,
      host: conn.host,
      port: conn.port,
      database: conn.database,
      user: conn.username,
      password: conn.password,
      ssl: conn.ssl,
      provider: providerId,
      readOnly: readOnly || undefined,
    })
  }

  function switchDriver(id) {
    dbType = id
    if (id === 'postgres') port = '5432'
    if (id === 'mysql' || id === 'mariadb') port = '3306'
    if (id === 'cockroachdb') port = '26257'
    if (id === 'clickhouse') port = secure ? '8443' : '8123'
    if (id === 'mssql') port = '1433'
    if (id === 'sqlite-memory' || id === 'duckdb-memory') filePath = ':memory:'
    if (id === 'duckdb') filePath = ''
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
    if (conn.type === 'sqlite' || conn.type === 'duckdb') return conn.filePath === ':memory:' ? 'in-memory' : (conn.filePath || '—')
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
    const myOp = ++opId
    connecting = conn.id; error = ''
    try {
      if (conn.type === 'sqlite') await connectSqlite(conn)
      else if (conn.type === 'd1') await connectD1(conn)
      else if (conn.type === 'libsql') await connectLibSql(conn)
      else if (conn.type === 'mysql' || conn.type === 'mariadb') await connectMysql(conn)
      else if (conn.type === 'clickhouse') await connectClickhouse(conn)
      else if (conn.type === 'duckdb') await connectDuckdb(conn)
      else if (conn.type === 'mssql') await connectMssql(conn)
      else await connectPostgres(conn)
      if (myOp !== opId) return // cancelled by the user
      const updated = { ...conn, lastConnectedAt: Date.now() }
      saved = upsertConnection(updated).sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
      setLastConnectionId(conn.id)
      open = false
      await onconnected(updated, conn.id)
    } catch (e) { if (myOp === opId) error = String(e) }
    finally { if (myOp === opId) connecting = null }
  }

  async function handleTest() {
    const myOp = ++opId
    testing = true; error = ''; testOk = false
    try {
      const p = formPayload()
      if (p.type === 'sqlite') await testSqliteConnection(p)
      else if (p.type === 'd1') await testD1Connection(p)
      else if (p.type === 'libsql') await testLibSqlConnection(p)
      else if (p.type === 'mysql' || p.type === 'mariadb') await testMysqlConnection(p)
      else if (p.type === 'clickhouse') await testClickhouseConnection(p)
      else if (p.type === 'duckdb') await testDuckdbConnection(p)
      else if (p.type === 'mssql') await testMssqlConnection(p)
      else await testPostgresConnection(p)
      if (myOp !== opId) return // cancelled by the user
      testOk = true
    } catch (e) { if (myOp === opId) error = String(e) }
    finally { if (myOp === opId) testing = false }
  }

  async function handleConnect() {
    if (!editingId && saved.length >= maxConnections) {
      error = `Free plan allows ${maxConnections} saved connections. Upgrade to Stroke Pro for unlimited.`
      return
    }
    const myOp = ++opId
    connecting = editingId ?? '__new__'; error = ''
    try {
      const payload = formPayload()
      if (payload.type === 'sqlite') await connectSqlite(payload)
      else if (payload.type === 'd1') await connectD1(payload)
      else if (payload.type === 'libsql') await connectLibSql(payload)
      else if (payload.type === 'mysql' || payload.type === 'mariadb') await connectMysql(payload)
      else if (payload.type === 'clickhouse') await connectClickhouse(payload)
      else if (payload.type === 'duckdb') await connectDuckdb(payload)
      else if (payload.type === 'mssql') await connectMssql(payload)
      else await connectPostgres(payload)
      if (myOp !== opId) return // cancelled by the user
      const existing = editingId ? saved.find(s => s.id === editingId) : null
      const id = existing?.id ?? newConnectionId()
      const hasHostPort = ['postgres', 'mysql', 'mariadb', 'cockroachdb', 'clickhouse', 'mssql'].includes(payload.type)
      const defaultPort = { mysql: 3306, mariadb: 3306, cockroachdb: 26257, postgres: 5432, clickhouse: 8123, mssql: 1433 }[payload.type] ?? 5432
      const saved_conn = {
        id, ...payload,
        port: hasHostPort ? (Number(payload.port) || defaultPort) : undefined,
        lastConnectedAt: Date.now(),
        readOnly: readOnly || undefined,
      }
      saved = upsertConnection(saved_conn).sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
      setLastConnectionId(id)
      open = false
      await onconnected(saved_conn, id)
    } catch (e) { if (myOp === opId) error = String(e) }
    finally { if (myOp === opId) connecting = null }
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

  async function pickDuckdbFile() {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const path = await open({
        title: 'Select DuckDB database',
        filters: [
          { name: 'DuckDB', extensions: ['duckdb', 'ddb', 'db'] },
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

<DialogPrimitive.Root bind:open>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      class="fixed inset-0 z-50 bg-black/50 data-open:animate-in data-closed:animate-out data-open:fade-in-0 data-closed:fade-out-0 duration-100"
    />
    <DialogPrimitive.Content
      class="fixed inset-0 z-50 flex bg-background text-foreground outline-none data-open:animate-in data-closed:animate-out data-open:fade-in-0 data-closed:fade-out-0 duration-100"
    >
    <DialogPrimitive.Title class="sr-only">Connections</DialogPrimitive.Title>
    <div class="grid h-full w-full min-h-0 grid-cols-[minmax(240px,280px)_minmax(0,1fr)] overflow-hidden">

      <!-- ── Sidebar ─────────────────────────────────────────────── -->
      <aside class="flex min-h-0 flex-col border-r border-border/15 bg-muted/[0.015]">

        <!-- Title -->
        <div class="flex h-[52px] shrink-0 items-center px-4">
          <h2 class="text-[13px] font-semibold text-foreground">Connections</h2>
          {#if saved.length > 0}
            <span class="ml-2 rounded-full bg-muted/60 px-1.5 py-px text-[10px] font-medium tabular-nums text-muted-foreground/70">{saved.length}</span>
          {/if}
        </div>

        <!-- New connection button -->
        <div class="shrink-0 px-2.5 pb-2">
          <button
            type="button"
            onclick={() => resetForm(null)}
            class={cn(
              'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12px] transition-colors',
              !editingId
                ? 'border-border/40 bg-muted/40 font-medium text-foreground'
                : 'border-transparent text-muted-foreground/60 hover:bg-muted/25 hover:text-foreground'
            )}
          >
            <Plus class="size-3.5 shrink-0" />
            New connection
          </button>
        </div>

        <div class="min-h-0 flex-1">
          {#if saved.length > 0}
            <ScrollArea class="h-full scroll-smooth">
              <div class="px-2 py-2 flex flex-col gap-0.5">
                {#each saved as conn (conn.id)}
                  {@const isSel = conn.id === editingId}
                  {@const busy2 = connecting === conn.id}
                  {@const cid   = conn.filePath === ':memory:' && (conn.type === 'sqlite' || conn.type === 'duckdb') ? `${conn.type}-memory` : conn.type}
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
                      class="relative size-4 shrink-0 disabled:opacity-30"
                      title="Connect"
                      disabled={!!connecting}
                      onclick={(e) => { e.stopPropagation(); void connectWith(conn) }}
                    >
                      <span class="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover:opacity-0">
                        {#if busy2}
                          <Loader2 class="size-4 animate-spin" />
                        {:else}
                          <DbIcon id={cid} class={cn('size-4', isSel ? 'text-foreground' : 'text-muted-foreground/60')} />
                        {/if}
                      </span>
                      <span class="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                        <Play class="size-3.5" />
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

        <!-- ── Header: connection name + driver type ──────────── -->
        <div class="shrink-0 border-b border-border/15 px-8 pt-5 pb-5">
          <div class="mx-auto grid w-full max-w-[640px] grid-cols-[1fr_13rem] items-end gap-3">
            <!-- Connection name -->
            <div>
              <label for="cn-name" class={lbl}>Name</label>
              <Input id="cn-name" bind:value={name} class={inp} placeholder="e.g. Production DB" />
            </div>

            <!-- Driver type — searchable dropdown -->
            <div>
              <span class={lbl}>Type</span>
              <SearchableMenu
                bind:open={driverMenuOpen}
                items={driverItems}
                placeholder="Search databases…"
                contentClass="w-64"
                align="end"
                onselect={(it) => switchDriver(it.value)}
              >
                {#snippet trigger(props)}
                  <button
                    {...props}
                    type="button"
                    class={cn(inp, 'flex items-center justify-between gap-2 text-left', driverMenuOpen && 'border-ring/60 ring-1 ring-ring/20')}
                  >
                    <span class="flex min-w-0 items-center gap-2">
                      <DbIcon id={activeDriver.id} class="size-4 text-muted-foreground" />
                      <span class="min-w-0 truncate">{activeDriver.label}</span>
                    </span>
                    <ChevronDown class="size-3.5 shrink-0 text-muted-foreground/50" />
                  </button>
                {/snippet}
                {#snippet item(it)}
                  <DbIcon id={it.value} class={cn('size-4', it.value === dbType ? 'text-foreground' : 'text-muted-foreground/70')} />
                  <span class="min-w-0 flex-1 truncate">{it.label}</span>
                  {#if it.disabled}
                    <span class="shrink-0 text-ui-3xs text-muted-foreground/45">soon</span>
                  {:else if it.value === dbType}
                    <Check class="size-3.5 shrink-0 text-primary" />
                  {/if}
                {/snippet}
              </SearchableMenu>
            </div>
          </div>
        </div>

        <!-- ── Scrollable form body ─────────────────────────────── -->
        <ScrollArea class="min-h-0 flex-1 scroll-smooth">
          <div class="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-8 py-7">

            <!-- ── Hosting provider sign-in (Neon / Supabase / PlanetScale / Prisma) ── -->
            {#if dbType === 'neon' || dbType === 'supabase' || dbType === 'planetscale' || dbType === 'prisma'}
              <ProviderConnect
                provider={dbType}
                resolvePassword={(host, user) => saved.find((s) => s.host === host && s.user === user && s.password)?.password}
                onselect={(conn) => connectProviderConnection(conn)}
              />

            <!-- ── PostgreSQL / CockroachDB ────────────────── -->
            {:else if dbType === 'postgres' || dbType === 'cockroachdb'}

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

            <!-- ── MySQL / MariaDB ──────────────────────── -->
            {:else if dbType === 'mysql' || dbType === 'mariadb'}

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

            <!-- ── ClickHouse ─────────────────────────────── -->
            {:else if dbType === 'clickhouse'}

              <div class="grid grid-cols-[1fr_80px] gap-2">
                <div>
                  <label for="cn-ch-host" class={lbl}>Host</label>
                  <Input id="cn-ch-host" bind:value={host} class={inp} />
                </div>
                <div>
                  <label for="cn-ch-port" class={lbl}>Port</label>
                  <Input id="cn-ch-port" bind:value={port} type="text" inputmode="numeric" class={inpNum} />
                </div>
              </div>

              <div>
                <label for="cn-ch-db" class={lbl}>Database</label>
                <Input id="cn-ch-db" bind:value={database} class={inp} />
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label for="cn-ch-user" class={lbl}>Username</label>
                  <Input id="cn-ch-user" bind:value={user} autocomplete="username" class={inp} />
                </div>
                <div>
                  <label for="cn-ch-pass" class={lbl}>Password</label>
                  <Input id="cn-ch-pass" bind:value={password} type="password" autocomplete="current-password" class={inp} />
                </div>
              </div>

              <label class="flex cursor-pointer select-none items-center gap-2 pt-0.5">
                <Checkbox id="cn-ch-secure" checked={secure} onCheckedChange={(v) => { secure = v === true; if (secure && port === '8123') port = '8443'; else if (!secure && port === '8443') port = '8123' }} />
                <span class="text-[12px] text-muted-foreground/65">Use HTTPS (TLS)</span>
              </label>

            <!-- ── DuckDB (file) ──────────────────────────── -->
            {:else if dbType === 'duckdb'}

              <div>
                <label for="cn-duck-path" class={lbl}>File</label>
                <div class="flex gap-1.5">
                  <Input id="cn-duck-path" bind:value={filePath}
                    placeholder="/path/to/database.duckdb"
                    class={cn(inp, 'font-mono text-[11px]')} />
                  <button type="button" onclick={pickDuckdbFile}
                    class="inline-flex h-[30px] shrink-0 items-center gap-1 rounded-md border border-border/25 px-2.5 text-[11px] text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground">
                    <FolderOpen class="size-3" />
                    Browse
                  </button>
                </div>
                <p class="mt-1 text-[10px] text-muted-foreground/30">A new file is created if it doesn't exist.</p>
              </div>

            <!-- ── DuckDB (in-memory) ─────────────────────── -->
            {:else if dbType === 'duckdb-memory'}

              <div class="flex flex-col gap-1.5 rounded-lg border border-border/15 bg-muted/[0.04] px-4 py-3.5">
                <p class="text-[12px] font-medium text-foreground/70">Ephemeral in-memory DuckDB</p>
                <p class="text-[11px] leading-relaxed text-muted-foreground/45">
                  A columnar analytical database that lives only for this session. Nothing is written to disk — closing the connection discards everything.
                </p>
              </div>

            <!-- ── MS SQL Server ──────────────────────────── -->
            {:else if dbType === 'mssql'}

              <div class="grid grid-cols-[1fr_80px] gap-2">
                <div>
                  <label for="cn-mssql-host" class={lbl}>Host</label>
                  <Input id="cn-mssql-host" bind:value={host} class={inp} />
                </div>
                <div>
                  <label for="cn-mssql-port" class={lbl}>Port</label>
                  <Input id="cn-mssql-port" bind:value={port} type="text" inputmode="numeric" class={inpNum} />
                </div>
              </div>

              <div>
                <label for="cn-mssql-db" class={lbl}>Database</label>
                <Input id="cn-mssql-db" bind:value={database} class={inp} />
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label for="cn-mssql-user" class={lbl}>Username</label>
                  <Input id="cn-mssql-user" bind:value={user} autocomplete="username" class={inp} />
                </div>
                <div>
                  <label for="cn-mssql-pass" class={lbl}>Password</label>
                  <Input id="cn-mssql-pass" bind:value={password} type="password" autocomplete="current-password" class={inp} />
                </div>
              </div>

              <div class="flex flex-col gap-3 pt-0.5">
                <label class="flex cursor-pointer select-none items-start gap-2">
                  <Checkbox id="cn-mssql-encrypt" checked={encrypt} onCheckedChange={(v) => (encrypt = v === true)} class="mt-px" />
                  <span class="flex flex-col">
                    <span class="text-[12px] text-muted-foreground/75">Encrypt connection (TLS)</span>
                    <span class="text-[11px] leading-snug text-muted-foreground/40">Encrypts traffic between Stroke and the server.</span>
                  </span>
                </label>
                <label class={cn('flex select-none items-start gap-2', encrypt ? 'cursor-pointer' : 'cursor-not-allowed opacity-45')}>
                  <Checkbox id="cn-mssql-trust" checked={trustCert} disabled={!encrypt} onCheckedChange={(v) => (trustCert = v === true)} class="mt-px" />
                  <span class="flex flex-col">
                    <span class="text-[12px] text-muted-foreground/75">Trust server certificate</span>
                    <span class="text-[11px] leading-snug text-muted-foreground/40">Accept self-signed or otherwise untrusted certificates. Needed for many local / dev servers.</span>
                  </span>
                </label>
              </div>

            {/if}

            <!-- Read-only mode — generic option for every driver -->
            <label class="mt-1 flex cursor-pointer select-none items-center gap-2 border-t border-border/15 pt-3.5">
              <Checkbox id="cn-readonly" checked={readOnly} onCheckedChange={(v) => (readOnly = v === true)} />
              <span class="flex items-center gap-1.5 text-[12px] text-muted-foreground/75">
                <Lock class="size-3 shrink-0" />
                Open in read-only mode
              </span>
            </label>

          </div>
        </ScrollArea>

        <!-- ── Footer — feedback + actions only, so it stays compact and
             the action buttons are always visible regardless of window height ── -->
        <div class="shrink-0 border-t border-border/15 px-8 py-4">
          <div class="mx-auto w-full max-w-[640px]">

          <!-- Feedback slot — always occupies height, shows message when needed -->
          <div class="mb-2.5 flex min-h-[18px] items-center">
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
                  class="inline-flex h-8 max-w-[200px] items-center gap-1.5 rounded-lg border border-border/25 px-3 text-[12px] text-muted-foreground/55 transition-colors hover:bg-muted/30 hover:text-foreground disabled:opacity-25"
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
            <div class="flex shrink-0 items-center gap-2">
              {#if isBusy}
                <button type="button" onclick={stopOp}
                  class="inline-flex h-8 items-center gap-1 rounded-lg border border-destructive/30 px-3 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/10">
                  <X class="size-3" />Stop
                </button>
              {/if}
              {#if canTest}
                <button type="button" onclick={handleTest} disabled={isBusy}
                  class="inline-flex h-8 items-center gap-1 rounded-lg border border-border/30 px-3.5 text-[12px] text-muted-foreground/70 transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-25">
                  {#if testing}<Loader2 class="size-3 animate-spin" />Testing…{:else}Test{/if}
                </button>
              {/if}
              <button type="button" onclick={handleConnect} disabled={isBusy || dbType === 'bigquery'}
                class="inline-flex h-8 items-center gap-1 rounded-lg bg-foreground px-5 text-[12px] font-semibold text-background transition-colors hover:bg-foreground/85 disabled:opacity-40">
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

    </div>

    <!-- Close button -->
    <DialogPrimitive.Close
      class="absolute right-4 top-4 inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground/40 transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <X class="size-4" />
      <span class="sr-only">Close</span>
    </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
