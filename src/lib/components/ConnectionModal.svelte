<script>
  import { untrack, onDestroy } from 'svelte'
  import Icon from './Icon.svelte'
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
    testRedis,              connectRedis,
    cloudflareListAccounts, cloudflareListD1Databases,
  } from '$lib/api.js'
  import {
    loadSavedConnections, upsertConnection, removeConnection,
    newConnectionId, getLastConnectionId, setLastConnectionId,
  } from '$lib/stores/connections.js'
  import { Input }      from '$lib/components/ui/input/index.js'
  import { Checkbox }   from '$lib/components/ui/checkbox/index.js'
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Dialog as DialogPrimitive } from 'bits-ui'
  import { cn }         from '$lib/utils.js'
  import { parseConnectionUri } from '$lib/connection-uri.js'
  import { PROVIDERS } from '$lib/providers.js'

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
        { id: 'redis',    label: 'Redis',          desc: 'In-memory key-value store' },
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
    'neon', 'supabase', 'planetscale', 'prisma', 'd1', 'redis',
  ]
  const driverItems = DRIVER_ORDER
    .map((id) => ALL_DRIVERS.find((d) => d.id === id))
    .filter(Boolean)
    .map((d) => ({ value: d.id, label: d.label, keywords: [d.label, d.desc], disabled: !!d.soon }))

  // Provider (sign-in) ids are surfaced as cards on their own tab, so keep them
  // out of the manual Type dropdown.
  const PROVIDER_IDS = ['neon', 'supabase', 'planetscale', 'prisma']
  // Cloudflare D1 signs in like a hosting provider (OAuth), so it belongs on the
  // Provider tab too — but it drives the CloudflareLogin flow, not ProviderConnect.
  const PROVIDER_CARDS = [
    ...PROVIDERS,
    { id: 'd1', name: 'Cloudflare D1', engine: 'sqlite', blurb: 'Edge SQLite — sign in with Cloudflare' },
  ]
  // Every sign-in provider (incl. D1) is reached from the Provider tab, so keep
  // them all out of the manual Type dropdown.
  const manualDriverItems = driverItems.filter((d) => ![...PROVIDER_IDS, 'd1'].includes(d.value))

  // Providers temporarily turned off (shown as a disabled tab, not connectable).
  const DISABLED_TABS = new Set(['planetscale'])
  // Top-level connection tabs: Manual (self-hosted / string) + every sign-in
  // provider. Selecting a tab is the ONLY way to choose what you're connecting to.
  const CONNECT_TABS = [
    { id: 'manual', label: 'Manual' },
    ...PROVIDER_CARDS.map((p) => ({ id: p.id, label: p.name, disabled: DISABLED_TABS.has(p.id) })),
  ]

  // Subtle per-engine icon tint (color-500/600), theme-aware via Tailwind tokens.
  const ENGINE_TINT = {
    postgres:        'text-sky-500/80',
    cockroachdb:     'text-teal-500/80',
    mysql:           'text-amber-500/80',
    mariadb:         'text-orange-500/80',
    sqlite:          'text-blue-500/80',
    'sqlite-memory': 'text-blue-500/80',
    mssql:           'text-red-500/80',
    clickhouse:      'text-yellow-500/80',
    duckdb:          'text-yellow-500/80',
    'duckdb-memory': 'text-yellow-500/80',
    d1:              'text-orange-500/80',
    libsql:          'text-emerald-500/80',
    neon:            'text-emerald-500/80',
    supabase:        'text-emerald-500/80',
    planetscale:     'text-foreground/70',
    prisma:          'text-indigo-500/80',
    redis:           'text-red-500/80',
  }
  function engineTint(id) { return ENGINE_TINT[id] ?? 'text-muted-foreground/60' }

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
  // Top-level entry mode: connect manually vs sign in with a hosting provider.
  let entryMode     = $state(/** @type {'manual'|'provider'} */ ('manual'))
  // Advanced (SSL / SSH / read-only) disclosure — collapsed by default.
  let advancedOpen  = $state(false)
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
  // Manual-form input mode for URI-capable engines: paste a connection string
  // vs. fill individual fields. UI-only — not tracked as a dirty change.
  let fieldMode     = $state(/** @type {'string'|'fields'} */ ('fields'))

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
    redis:           { name: 'Local Redis',       host: '127.0.0.1', port: '6379', database: '0' },
  }

  const activeDriver = $derived(ALL_DRIVERS.find(d => d.id === dbType) ?? ALL_DRIVERS[0])
  const isProvider   = $derived(PROVIDER_IDS.includes(dbType))
  // D1 shares the Provider tab (via CloudflareLogin) but is not a ProviderConnect id.
  const isProviderTab = $derived(isProvider || dbType === 'd1')

  // Engines that expose the "Connection string | Manual fields" toggle.
  const URI_TOGGLE_ENGINES = ['postgres', 'cockroachdb', 'mysql', 'mariadb']
  const hasFieldToggle = $derived(URI_TOGGLE_ENGINES.includes(dbType))

  // Briefly ring-highlight the fields a parsed connection string just filled in.
  let flashedFields = $state(/** @type {Set<string>} */ (new Set()))
  let flashTimer
  const flashCls = 'ring-2 ring-success/50'
  function flashFields(keys) {
    flashedFields = new Set(keys)
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => { flashedFields = new Set() }, 1000)
  }
  onDestroy(() => clearTimeout(flashTimer))

  /** Switch the manual/provider tab. Leaving provider mode drops back to Postgres. */
  function setEntryMode(mode) {
    if (entryMode === mode) return
    entryMode = mode
    if (mode === 'manual' && isProviderTab) switchDriver('postgres')
  }

  /** Select a top connection tab — Manual, or a specific sign-in provider. */
  function selectTab(id) {
    if (DISABLED_TABS.has(id)) return
    if (id === 'manual') { setEntryMode('manual'); return }
    entryMode = 'provider'
    switchDriver(id)
  }
  /** Whether a given top tab is the active one. */
  function isTabActive(id) {
    return id === 'manual' ? entryMode === 'manual' : (entryMode === 'provider' && dbType === id)
  }

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
    if (dbType === 'redis')
      return { type: 'redis', name, host, port, password, db: Number(database) || 0, tls: secure }
    return { type: 'postgres', name, host, port, database, user, password, ssl, ...(ssh && { ssh }) }
  }

  /** Normalize a thrown value into a concise, user-facing message (no "Error:"
   * prefix, no raw object noise). */
  function friendlyError(/** @type {unknown} */ e) {
    let msg = typeof e === 'string' ? e : e instanceof Error ? e.message : String(e)
    msg = msg.replace(/^Error:\s*/i, '').trim()
    return msg || 'Something went wrong. Please try again.'
  }

  function resetForm(conn) {
    editingId = conn?.id ?? null
    if (conn) {
      const t = conn.filePath === ':memory:' && (conn.type === 'sqlite' || conn.type === 'duckdb')
        ? `${conn.type}-memory`
        : (conn.type ?? 'postgres')
      dbType = t; name = conn.name ?? ''; host = conn.host ?? '127.0.0.1'
      port = String(conn.port ?? 5432)
      // Redis persists its logical DB index / TLS under `db` / `tls`; the form
      // reuses the shared `database` / `secure` fields, so map them back on edit.
      database = conn.database ?? (conn.db != null ? String(conn.db) : 'postgres')
      user = conn.user ?? 'postgres'; password = conn.password ?? ''; ssl = Boolean(conn.ssl)
      secure = Boolean(conn.secure ?? conn.tls)
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
    entryMode = (PROVIDER_IDS.includes(dbType) || dbType === 'd1') ? 'provider' : 'manual'
    fieldMode = 'fields'
    advancedOpen = false
    flashedFields = new Set()
    error = ''; testOk = false; connectionUri = ''; uriHint = ''
    d1Reset()
    baseline = snapshot()
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

  /**
   * Cloudflare D1 picked from the Provider tab: fill the D1 fields and connect
   * immediately, mirroring the one-click flow of the other hosting providers.
   * @param {{accountId: string, databaseId: string, databaseName: string, token: string}} info
   */
  async function connectD1Selection(info) {
    error = ''
    accountId = info.accountId
    databaseId = info.databaseId
    apiToken = info.token
    if (!name || name === 'Cloudflare D1') name = info.databaseName
    // Reuse an existing saved entry for this exact D1 database instead of piling
    // up duplicates — connectWith upserts it.
    const existing = saved.find((s) => s.type === 'd1' && s.databaseId === info.databaseId)
    await connectWith({
      id: existing?.id ?? newConnectionId(),
      type: 'd1',
      name: info.databaseName,
      accountId: info.accountId,
      databaseId: info.databaseId,
      apiToken: info.token,
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
    if (id === 'redis') port = '6379'
    if (id === 'sqlite-memory' || id === 'duckdb-memory') filePath = ':memory:'
    if (id === 'duckdb') filePath = ''
    error = ''; testOk = false; connectionUri = ''; uriHint = ''
    if (id !== 'd1') d1Reset()
  }

  function applyConnectionUri() {
    uriHint = ''
    const uriType =
      dbType === 'sqlite' || dbType === 'sqlite-memory' ? 'sqlite'
      : dbType === 'mysql' || dbType === 'mariadb' ? 'mysql'
      : dbType === 'mssql' ? 'mssql'
      : dbType === 'clickhouse' ? 'clickhouse'
      : 'postgres'
    const parsed = parseConnectionUri(uriType, connectionUri)
    if (!parsed) return false
    if ('error' in parsed) { uriHint = parsed.error; return false }
    if ((dbType === 'sqlite' || dbType === 'sqlite-memory') && 'filePath' in parsed) {
      filePath = parsed.filePath; flashFields(['filePath']); uriHint = 'Fields updated from URI'; return true
    }
    if ('host' in parsed) {
      host = parsed.host; port = parsed.port; database = parsed.database
      user = parsed.user; password = parsed.password
      const changed = ['host', 'port', 'database', 'user', 'password']
      // Each engine carries its own TLS shape; apply whichever the parser returned.
      if ('encrypt' in parsed) { encrypt = parsed.encrypt; trustCert = parsed.trustCert; changed.push('encrypt', 'trustCert') }
      else if ('secure' in parsed) { secure = parsed.secure; changed.push('secure') }
      else { ssl = parsed.ssl; changed.push('ssl') }
      flashFields(changed)
      uriHint = 'Fields updated from URI'
      return true
    }
    return false
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
      else if (conn.type === 'redis') await connectRedis(conn)
      else await connectPostgres(conn)
      if (myOp !== opId) return // cancelled by the user
      const updated = { ...conn, lastConnectedAt: Date.now() }
      saved = upsertConnection(updated).sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
      setLastConnectionId(conn.id)
      open = false
      await onconnected(updated, conn.id)
    } catch (e) { if (myOp === opId) error = friendlyError(e) }
    finally { if (myOp === opId) connecting = null }
  }

  async function handleTest() {
    const myOp = ++opId
    testing = true; error = ''; testOk = false
    try {
      // In connection-string mode the payload is built from the individual
      // fields, so parse the URI into them first (finally clears `testing`).
      if (fieldMode === 'string' && URI_TOGGLE_ENGINES.includes(dbType) && !applyConnectionUri()) {
        error = uriHint || 'Enter a valid connection string'
        return
      }
      const p = formPayload()
      if (p.type === 'sqlite') await testSqliteConnection(p)
      else if (p.type === 'd1') await testD1Connection(p)
      else if (p.type === 'libsql') await testLibSqlConnection(p)
      else if (p.type === 'mysql' || p.type === 'mariadb') await testMysqlConnection(p)
      else if (p.type === 'clickhouse') await testClickhouseConnection(p)
      else if (p.type === 'duckdb') await testDuckdbConnection(p)
      else if (p.type === 'mssql') await testMssqlConnection(p)
      else if (p.type === 'redis') await testRedis(p)
      else await testPostgresConnection(p)
      if (myOp !== opId) return // cancelled by the user
      testOk = true
    } catch (e) { if (myOp === opId) error = friendlyError(e) }
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
      // In connection-string mode the payload is built from the individual
      // fields, so parse the URI into them first (finally clears `connecting`).
      if (fieldMode === 'string' && URI_TOGGLE_ENGINES.includes(dbType) && !applyConnectionUri()) {
        error = uriHint || 'Enter a valid connection string'
        return
      }
      const payload = formPayload()
      if (payload.type === 'sqlite') await connectSqlite(payload)
      else if (payload.type === 'd1') await connectD1(payload)
      else if (payload.type === 'libsql') await connectLibSql(payload)
      else if (payload.type === 'mysql' || payload.type === 'mariadb') await connectMysql(payload)
      else if (payload.type === 'clickhouse') await connectClickhouse(payload)
      else if (payload.type === 'duckdb') await connectDuckdb(payload)
      else if (payload.type === 'mssql') await connectMssql(payload)
      else if (payload.type === 'redis') await connectRedis(payload)
      else await connectPostgres(payload)
      if (myOp !== opId) return // cancelled by the user
      const existing = editingId ? saved.find(s => s.id === editingId) : null
      const id = existing?.id ?? newConnectionId()
      const hasHostPort = ['postgres', 'mysql', 'mariadb', 'cockroachdb', 'clickhouse', 'mssql', 'redis'].includes(payload.type)
      const defaultPort = { mysql: 3306, mariadb: 3306, cockroachdb: 26257, postgres: 5432, clickhouse: 8123, mssql: 1433, redis: 6379 }[payload.type] ?? 5432
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
    } catch (e) { if (myOp === opId) error = friendlyError(e) }
    finally { if (myOp === opId) connecting = null }
  }

  const canTest = $derived(true)
  const isBusy  = $derived(testing || !!connecting)

  // ── Dirty tracking + close guard ─────────────────────────────────────────────
  // A snapshot of every editable field; `baseline` is re-stamped each time a form
  // loads (resetForm), so isDirty flips true the moment the user changes anything.
  let baseline = $state('')
  let confirmDiscardOpen = $state(false)
  function snapshot() {
    return JSON.stringify([
      dbType, name, host, port, database, user, password, ssl, secure, encrypt, trustCert,
      filePath, accountId, databaseId, apiToken, libsqlUrl, libsqlToken, readOnly,
      sshEnabled, sshHost, sshPort, sshUsername, sshKeyPath,
    ])
  }
  const isDirty = $derived(snapshot() !== baseline)

  /** Full-width status-bar target for the current form. */
  const statusTarget = $derived.by(() => {
    if (['sqlite', 'sqlite-memory', 'duckdb', 'duckdb-memory'].includes(dbType)) return filePath || ':memory:'
    if (dbType === 'libsql') return libsqlUrl || '—'
    if (dbType === 'd1') return databaseId ? `${databaseId.slice(0, 8)}…` : '—'
    return `${host || '—'}:${port || '—'}/${database || ''}`
  })

  /** Attempt to close the dialog — guard against discarding unsaved edits. */
  function requestClose() {
    if (isBusy) return
    if (isDirty) { confirmDiscardOpen = true; return }
    open = false
  }
  function discardAndClose() {
    confirmDiscardOpen = false
    baseline = snapshot() // stop isDirty re-firing during the close animation
    open = false
  }

  /**
   * True when a pointer interaction landed on window chrome that must never
   * dismiss the dialog — the titlebar / tab-bar drag region, the status bar, or
   * any studio region. Checks the event target AND the element under the pointer:
   * while a native window drag is starting, WebKit can report the document (not
   * the drag element) as the target, so the pointer coordinates are the reliable
   * signal. Without this, dragging the window to move it closed the modal.
   * @param {PointerEvent} e
   */
  function isChromeInteraction(e) {
    const sel = '[data-tauri-drag-region],[data-studio-chrome],[data-studio-region]'
    const t = /** @type {Element | null} */ (e.target)
    if (t?.closest?.(sel)) return true
    const at = document.elementFromPoint?.(e.clientX, e.clientY)
    return !!at?.closest?.(sel)
  }

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

  const lbl = 'mb-1 block text-ui-3xs font-medium uppercase tracking-wider text-muted-foreground/50'
  // Segmented pill switch (entry-mode + field-mode) — shared base for consistency.
  const segBtn = 'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-ui-xs font-medium transition-[color,background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.97]'
  const segOn  = 'bg-muted/70 text-foreground shadow-sm'
  const segOff = 'text-muted-foreground/60 hover:text-foreground'
  const inp = 'h-8 w-full rounded-md border-2 border-foreground/15 bg-muted/20 px-2.5 text-ui-xs text-foreground placeholder:text-muted-foreground/35 placeholder:font-normal outline-none transition-[color,border-color,box-shadow] hover:border-foreground/40'
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
<!-- Advanced options — SSL / SSH tunnel / encryption / read-only. Laid out to
     fill the available width (toggle row + horizontal SSH grid); wraps to a
     column on the narrow provider/D1 collapsible. -->
{#snippet advancedFields()}
  {@const isPgMy = dbType === 'postgres' || dbType === 'cockroachdb' || dbType === 'mysql' || dbType === 'mariadb'}
  <div class="flex flex-col gap-4">
    <!-- Toggle row -->
    <div class="flex flex-wrap items-center gap-x-8 gap-y-3">
      {#if isPgMy}
        <label class="flex cursor-pointer select-none items-center gap-2">
          <Checkbox id="cn-ssl" checked={ssl} onCheckedChange={(v) => (ssl = v === true)} />
          <span class="text-ui-xs text-muted-foreground/70">Use SSL / TLS</span>
        </label>
        <label class="flex cursor-pointer select-none items-center gap-2">
          <Checkbox id="cn-ssh-enabled" checked={sshEnabled} onCheckedChange={(v) => (sshEnabled = v === true)} />
          <span class="flex items-center gap-1.5 text-ui-xs text-muted-foreground/70">
            <Icon name="terminal" class="size-3 shrink-0" />
            Connect via SSH tunnel
          </span>
        </label>
      {:else if dbType === 'clickhouse'}
        <label class="flex cursor-pointer select-none items-center gap-2">
          <Checkbox id="cn-ch-secure" checked={secure} onCheckedChange={(v) => { secure = v === true; if (secure && port === '8123') port = '8443'; else if (!secure && port === '8443') port = '8123' }} />
          <span class="text-ui-xs text-muted-foreground/70">Use HTTPS (TLS)</span>
        </label>
      {/if}
      <label class="flex cursor-pointer select-none items-center gap-2">
        <Checkbox id="cn-readonly" checked={readOnly} onCheckedChange={(v) => (readOnly = v === true)} />
        <span class="flex items-center gap-1.5 text-ui-xs text-muted-foreground/70">
          <Icon name="lock" class="size-3 shrink-0" />
          Open in read-only mode
        </span>
      </label>
    </div>

    <!-- SSH tunnel fields — horizontal, fills the width -->
    {#if isPgMy && sshEnabled}
      <div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] items-start gap-x-4 gap-y-3 border-t border-border/15 pt-4">
        <div class="grid grid-cols-[1fr_72px] gap-2">
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
          <label for="cn-ssh-key" class={lbl}>Identity file</label>
          <Input id="cn-ssh-key" bind:value={sshKeyPath} placeholder="~/.ssh/id_rsa" class={cn(inp, 'font-mono text-ui-2xs')} />
          <p class="mt-1 text-ui-3xs leading-snug text-muted-foreground/40">Optional — leave blank to use your SSH agent.</p>
        </div>
      </div>
    {/if}

    <!-- SQL Server encryption -->
    {#if dbType === 'mssql'}
      <div class="flex flex-col gap-3 border-t border-border/15 pt-4">
        <label class="flex cursor-pointer select-none items-start gap-2">
          <Checkbox id="cn-mssql-encrypt" checked={encrypt} onCheckedChange={(v) => (encrypt = v === true)} class="mt-px" />
          <span class="flex flex-col">
            <span class="text-ui-xs text-muted-foreground/75">Encrypt connection (TLS)</span>
            <span class="text-ui-2xs leading-snug text-muted-foreground/40">Encrypts traffic between Stroke and the server.</span>
          </span>
        </label>
        <label class={cn('flex select-none items-start gap-2', encrypt ? 'cursor-pointer' : 'cursor-not-allowed opacity-45')}>
          <Checkbox id="cn-mssql-trust" checked={trustCert} disabled={!encrypt} onCheckedChange={(v) => (trustCert = v === true)} class="mt-px" />
          <span class="flex flex-col">
            <span class="text-ui-xs text-muted-foreground/75">Trust server certificate</span>
            <span class="text-ui-2xs leading-snug text-muted-foreground/40">Accept self-signed or otherwise untrusted certificates. Needed for many local / dev servers.</span>
          </span>
        </label>
      </div>
    {/if}
  </div>
{/snippet}

<!-- Collapsible Advanced (used inline by the provider / D1 single-column flows). -->
{#snippet advancedSection()}
  <div class="border-t border-border/40 pt-4">
    <button
      type="button"
      onclick={() => (advancedOpen = !advancedOpen)}
      aria-expanded={advancedOpen}
      class="flex w-full items-center gap-1.5 text-ui-3xs font-medium uppercase tracking-wider text-muted-foreground/50 transition-colors hover:text-foreground"
    >
      <Icon name="chevron-right" class={cn('size-3.5 shrink-0 transition-transform', advancedOpen && 'rotate-90')} />
      Advanced
    </button>
    {#if advancedOpen}
      <div class="mt-4">{@render advancedFields()}</div>
    {/if}
  </div>
{/snippet}

<DialogPrimitive.Root bind:open>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      style="top: var(--app-titlebar-h, 38px); bottom: var(--app-statusbar-h, 0px);"
      class="fixed inset-x-0 z-50 bg-black/50 data-open:animate-in data-closed:animate-out data-open:fade-in-0 data-closed:fade-out-0 ease-out duration-150"
    />
    <DialogPrimitive.Content
      data-connection-modal
      style="top: var(--app-titlebar-h, 38px); bottom: var(--app-statusbar-h, 0px);"
      class="fixed inset-x-0 z-50 flex bg-background text-foreground outline-none data-open:animate-in data-closed:animate-out data-open:fade-in-0 data-closed:fade-out-0 data-open:zoom-in-[0.98] data-closed:zoom-out-[0.98] ease-out duration-200"
      onEscapeKeydown={(e) => { if (isDirty && !isBusy) { e.preventDefault(); confirmDiscardOpen = true } }}
      onInteractOutside={(e) => {
        // The modal is inset to leave the titlebar (drag region) and status bar
        // usable. Interactions on that chrome must NOT dismiss the dialog or prompt
        // discard — otherwise dragging the window to move it closes the modal.
        if (isChromeInteraction(e)) { e.preventDefault(); return }
        if (isDirty && !isBusy) { e.preventDefault(); confirmDiscardOpen = true }
      }}
    >
    <DialogPrimitive.Title class="sr-only">Connections</DialogPrimitive.Title>
    <div class="grid h-full w-full min-h-0 grid-cols-[minmax(300px,340px)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden">

      <!-- ── Sidebar ─────────────────────────────────────────────── -->
      <aside class="flex min-h-0 flex-col border-r border-border/15 bg-muted/[0.015]">

        <!-- Title -->
        <div class="flex h-[52px] shrink-0 items-center px-4">
          <h2 class="text-ui-sm font-semibold text-foreground">Connections</h2>
          {#if saved.length > 0}
            <span class="ml-2 rounded-full bg-muted/60 px-1.5 py-px text-ui-3xs font-medium tabular-nums text-muted-foreground/70">{saved.length}</span>
          {/if}
        </div>


        <!-- New connection button -->
        <div class="shrink-0 px-2 pb-2 pt-2">
          <button
            type="button"
            onclick={() => resetForm(null)}
            class={cn(
              'flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left text-ui-xs transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.98]',
              !editingId
                ? 'border-border/40 bg-muted/40 font-medium text-foreground'
                : 'border-transparent text-muted-foreground/60 hover:bg-muted/25 hover:text-foreground'
            )}
          >
            <Icon name="plus" class="size-3.5 shrink-0" />
            New connection
          </button>
        </div>

        <div class="min-h-0 flex-1">
          {#if saved.length > 0}
            <ScrollArea type="auto" class="h-full scroll-smooth">
              <div class="px-2 py-1 flex flex-col gap-0.5">
                {#each saved as conn, i (conn.id)}
                  {@const isSel = conn.id === editingId}
                  {@const busy2 = connecting === conn.id}
                  {@const cid   = conn.filePath === ':memory:' && (conn.type === 'sqlite' || conn.type === 'duckdb') ? `${conn.type}-memory` : conn.type}
                  <div
                    class={cn(
                      'cn-stagger-in group relative flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 transition-[color,background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98]',
                      isSel
                        ? 'bg-muted/50 text-foreground'
                        : 'text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground'
                    )}
                    style="animation-delay: {Math.min(i, 12) * 40}ms"
                    role="button" tabindex="0"
                    onclick={() => resetForm(conn)}
                    onkeydown={(e) => e.key === 'Enter' && resetForm(conn)}
                  >
                    {#if isSel}
                      <span class="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-foreground/70"></span>
                    {/if}
                    <!-- Fixed-size icon slot keeps every row's text left-edge aligned. Fades to Play on hover. -->
                    <button
                      type="button"
                      class="relative flex size-7 shrink-0 items-center justify-center rounded-md disabled:opacity-30"
                      title="Connect"
                      disabled={!!connecting}
                      onclick={(e) => { e.stopPropagation(); void connectWith(conn) }}
                    >
                      <span class="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover:opacity-0">
                        {#if busy2}
                          <Icon name="loader-2" class="size-4 animate-spin" />
                        {:else}
                          <DbIcon id={cid} class={cn('size-4', engineTint(cid))} />
                        {/if}
                      </span>
                      <span class="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                        <Icon name="play" class="size-3.5" />
                      </span>
                    </button>

                    <!-- Name + engine · detail subtitle -->
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-ui-xs font-medium leading-tight text-foreground/90">
                        {conn.name || 'Unnamed'}
                      </p>
                      <p class="mt-0.5 truncate text-ui-2xs leading-tight text-muted-foreground/55">
                        {driverById(cid).label} · {connDetail(conn)}
                      </p>
                    </div>

                    <!-- Trash: hidden until hover -->
                    <button type="button"
                      class="shrink-0 rounded p-0.5 text-muted-foreground/25 opacity-0 transition-opacity duration-150 hover:text-destructive group-hover:opacity-100"
                      onclick={(e) => { e.stopPropagation(); handleDelete(conn.id) }}
                    ><Icon name="trash-2" class="size-3" /></button>
                  </div>
                {/each}
              </div>
            </ScrollArea>
          {:else}
            <div class="flex h-full items-center justify-center pb-8">
              <p class="text-ui-2xs text-muted-foreground/25">No saved connections</p>
            </div>
          {/if}
        </div>
      </aside>

      <!-- ── Form panel ──────────────────────────────────────────── -->
      <div class="flex min-h-0 min-w-0 flex-col">

        <!-- ── Header + provider tabs — the single "what am I connecting to" control ── -->
        <div class="shrink-0 px-8 pt-6">
          <h2 class="text-ui-lg font-semibold tracking-tight text-foreground">Connect a database</h2>
          <p class="mt-1 text-ui-xs text-muted-foreground">Pick a provider to sign in, or set one up manually.</p>
          <div class="mt-4 flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {#each CONNECT_TABS as t (t.id)}
              {@const active = isTabActive(t.id)}
              <button
                type="button"
                onclick={() => selectTab(t.id)}
                disabled={t.disabled}
                title={t.disabled ? `${t.label} — coming soon` : undefined}
                class={cn(
                  'group relative flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-ui-xs font-medium transition-colors duration-150',
                  t.disabled
                    ? 'cursor-not-allowed text-muted-foreground/30'
                    : active ? 'bg-muted/70 text-foreground' : 'text-muted-foreground/55 hover:bg-muted/35 hover:text-foreground',
                )}
                aria-current={active ? 'page' : undefined}
              >
                {#if t.id === 'manual'}
                  <Icon name="database" class="size-4 shrink-0" />
                {:else}
                  <DbIcon id={t.id} class={cn('size-4 shrink-0', t.disabled ? 'opacity-40 grayscale' : active ? engineTint(t.id) : 'text-muted-foreground/60 group-hover:text-muted-foreground')} />
                {/if}
                <span class="whitespace-nowrap">{t.label}</span>
                {#if t.disabled}
                  <span class="rounded bg-muted/50 px-1 py-px text-ui-3xs font-medium text-muted-foreground/50">soon</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>

        <!-- ── Form body — details for the current selection ── -->
        <ScrollArea type="auto" class="min-h-0 flex-1 scroll-smooth">
          <div class="px-8 py-6">
            <div class="max-w-[560px]">

              {#if entryMode === 'manual'}

                <!-- Manual form — core connection fields, then a full-width Advanced
                     section at the bottom. -->
                <div class="flex min-w-0 flex-col gap-5">

                <!-- Engine + name -->
                <div class="flex flex-col gap-3.5">
                  <div>
                    <span class={lbl}>Database engine</span>
                    <SearchableMenu
                      bind:open={driverMenuOpen}
                      items={manualDriverItems}
                      placeholder="Search engines…"
                      contentClass="w-[var(--bits-popover-anchor-width)] min-w-[15rem]"
                      align="start"
                      onselect={(it) => switchDriver(it.value)}
                    >
                      {#snippet trigger(props)}
                        <button
                          {...props}
                          type="button"
                          class={cn(inp, 'flex items-center justify-between gap-2 text-left', driverMenuOpen && 'border-foreground/55')}
                        >
                          <span class="flex min-w-0 items-center gap-2">
                            <DbIcon id={activeDriver.id} class={cn('size-4', engineTint(activeDriver.id))} />
                            <span class="min-w-0 truncate">{activeDriver.label}</span>
                          </span>
                          <Icon name="chevron-down" class="size-3.5 shrink-0 text-muted-foreground/50" />
                        </button>
                      {/snippet}
                      {#snippet item(it)}
                        <DbIcon id={it.value} class={cn('size-4', it.value === dbType ? 'text-foreground' : 'text-muted-foreground/70')} />
                        <span class="min-w-0 flex-1 truncate">{it.label}</span>
                        {#if it.disabled}
                          <span class="shrink-0 text-ui-3xs text-muted-foreground/45">soon</span>
                        {:else if it.value === dbType}
                          <Icon name="check" class="size-3.5 shrink-0 text-primary" />
                        {/if}
                      {/snippet}
                    </SearchableMenu>
                  </div>
                  <div>
                    <label for="cn-name" class={lbl}>Name</label>
                    <Input id="cn-name" bind:value={name} class={inp} placeholder="e.g. Production DB" />
                  </div>
                </div>

                <!-- Driver-specific fields -->
                {#key dbType}
                <div class="flex flex-col gap-3.5">

            <!-- Input mode — connection string vs. individual fields -->
            {#if hasFieldToggle}
              <div class="flex gap-1 rounded-lg border border-border/40 bg-muted/[0.03] p-1">
                <button type="button" onclick={() => (fieldMode = 'string')}
                  class={cn(segBtn, fieldMode === 'string' ? segOn : segOff)}>
                  Connection string
                </button>
                <button type="button" onclick={() => (fieldMode = 'fields')}
                  class={cn(segBtn, fieldMode === 'fields' ? segOn : segOff)}>
                  Manual fields
                </button>
              </div>
            {/if}

            <!-- ── PostgreSQL / CockroachDB ────────────────── -->
            {#if dbType === 'postgres' || dbType === 'cockroachdb'}

              {#if fieldMode === 'string'}
                <div>
                  <label for="cn-uri" class={lbl}>Connection string</label>
                  <Input id="cn-uri" bind:value={connectionUri}
                    placeholder="postgresql://user:pass@host:5432/db"
                    class={cn(inp, 'font-mono text-ui-2xs')}
                    onpaste={() => requestAnimationFrame(applyConnectionUri)}
                    onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), applyConnectionUri())}
                  />
                  {#if uriHint}
                    <p class={cn('mt-1 flex items-center gap-1 text-ui-3xs',
                      uriHint.includes('Could') || uriHint.includes('Expected') ? 'text-destructive' : 'text-success')}>
                      {#if uriHint.includes('Could') || uriHint.includes('Expected')}
                        <Icon name="alert-circle" class="size-2.5" />
                      {:else}
                        <Icon name="check-circle-2" class="size-2.5" />
                      {/if}
                      {uriHint}
                    </p>
                  {/if}
                </div>
              {:else}
                <div class="grid grid-cols-[1fr_110px] gap-2">
                  <div>
                    <label for="cn-host" class={lbl}>Host</label>
                    <Input id="cn-host" bind:value={host} class={cn(inp, flashedFields.has('host') && flashCls)} />
                  </div>
                  <div>
                    <label for="cn-port" class={lbl}>Port</label>
                    <Input id="cn-port" bind:value={port} type="text" inputmode="numeric" class={cn(inpNum, flashedFields.has('port') && flashCls)} />
                  </div>
                </div>

                <div>
                  <label for="cn-db" class={lbl}>Database</label>
                  <Input id="cn-db" bind:value={database} class={cn(inp, flashedFields.has('database') && flashCls)} />
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label for="cn-user" class={lbl}>Username</label>
                    <Input id="cn-user" bind:value={user} autocomplete="username" class={cn(inp, flashedFields.has('user') && flashCls)} />
                  </div>
                  <div>
                    <label for="cn-pass" class={lbl}>Password</label>
                    <Input id="cn-pass" bind:value={password} type="password" autocomplete="current-password" class={cn(inp, flashedFields.has('password') && flashCls)} />
                  </div>
                </div>
              {/if}

            <!-- ── MySQL / MariaDB ──────────────────────── -->
            {:else if dbType === 'mysql' || dbType === 'mariadb'}

              {#if fieldMode === 'string'}
                <div>
                  <label for="cn-mysql-uri" class={lbl}>Connection string</label>
                  <Input id="cn-mysql-uri" bind:value={connectionUri}
                    placeholder="mysql://user:pass@host:3306/db"
                    class={cn(inp, 'font-mono text-ui-2xs')}
                    onpaste={() => requestAnimationFrame(applyConnectionUri)}
                    onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), applyConnectionUri())}
                  />
                  {#if uriHint}
                    <p class={cn('mt-1 flex items-center gap-1 text-ui-3xs',
                      uriHint.includes('Could') || uriHint.includes('Expected') ? 'text-destructive' : 'text-success')}>
                      {#if uriHint.includes('Could') || uriHint.includes('Expected')}
                        <Icon name="alert-circle" class="size-2.5" />
                      {:else}
                        <Icon name="check-circle-2" class="size-2.5" />
                      {/if}
                      {uriHint}
                    </p>
                  {/if}
                </div>
              {:else}
                <div class="grid grid-cols-[1fr_110px] gap-2">
                  <div>
                    <label for="cn-mysql-host" class={lbl}>Host</label>
                    <Input id="cn-mysql-host" bind:value={host} class={cn(inp, flashedFields.has('host') && flashCls)} />
                  </div>
                  <div>
                    <label for="cn-mysql-port" class={lbl}>Port</label>
                    <Input id="cn-mysql-port" bind:value={port} type="text" inputmode="numeric" class={cn(inpNum, flashedFields.has('port') && flashCls)} />
                  </div>
                </div>

                <div>
                  <label for="cn-mysql-db" class={lbl}>Database</label>
                  <Input id="cn-mysql-db" bind:value={database} class={cn(inp, flashedFields.has('database') && flashCls)} />
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label for="cn-mysql-user" class={lbl}>Username</label>
                    <Input id="cn-mysql-user" bind:value={user} autocomplete="username" class={cn(inp, flashedFields.has('user') && flashCls)} />
                  </div>
                  <div>
                    <label for="cn-mysql-pass" class={lbl}>Password</label>
                    <Input id="cn-mysql-pass" bind:value={password} type="password" autocomplete="current-password" class={cn(inp, flashedFields.has('password') && flashCls)} />
                  </div>
                </div>
              {/if}

            <!-- ── SQLite ────────────────────────────────── -->
            {:else if dbType === 'sqlite'}

              <!-- Local file vs remote SQLite (Turso / libSQL). Remote reuses the
                   dedicated libsql driver + backend by switching dbType. -->
              <div class="flex gap-0.5 rounded-md border border-border/25 bg-muted/30 p-0.5 text-ui-2xs">
                <button type="button" class="flex-1 rounded bg-background px-2 py-1 font-medium text-foreground shadow-sm">Local file</button>
                <button type="button" onclick={() => (dbType = 'libsql')}
                  class="flex-1 rounded px-2 py-1 text-muted-foreground/60 transition-colors hover:text-foreground">Remote (Turso / libSQL)</button>
              </div>

              <div>
                <label for="cn-path" class={lbl}>File</label>
                <div class="flex gap-1.5">
                  <Input id="cn-path" bind:value={filePath}
                    placeholder="/path/to/database.db"
                    class={cn(inp, 'font-mono text-ui-2xs')} />
                  <button type="button" onclick={pickSqliteFile}
                    class="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border/25 px-2.5 text-ui-2xs text-muted-foreground/60 transition-[color,background-color,border-color,transform] duration-150 ease-out hover:bg-muted/40 hover:text-foreground active:scale-[0.97]">
                    <Icon name="folder-open" class="size-3" />
                    Browse
                  </button>
                </div>
              </div>

            <!-- ── In-Memory ─────────────────────────────── -->
            {:else if dbType === 'sqlite-memory'}

              <div class="flex flex-col gap-1.5 rounded-lg border border-border/15 bg-muted/[0.04] px-4 py-3.5">
                <p class="text-ui-xs font-medium text-foreground/70">Ephemeral in-memory database</p>
                <p class="text-ui-2xs leading-relaxed text-muted-foreground/45">
                  Data lives only for this session. Nothing is written to disk — closing the connection discards everything.
                </p>
              </div>

            <!-- ── LibSQL / Turso ─────────────────────────── -->
            {:else if dbType === 'libsql'}

              <div class="flex gap-0.5 rounded-md border border-border/25 bg-muted/30 p-0.5 text-ui-2xs">
                <button type="button" onclick={() => (dbType = 'sqlite')}
                  class="flex-1 rounded px-2 py-1 text-muted-foreground/60 transition-colors hover:text-foreground">Local file</button>
                <button type="button" class="flex-1 rounded bg-background px-2 py-1 font-medium text-foreground shadow-sm">Remote (Turso / libSQL)</button>
              </div>

              <div>
                <label for="cn-libsql-url" class={lbl}>URL</label>
                <Input id="cn-libsql-url" bind:value={libsqlUrl}
                  placeholder="libsql://your-db.turso.io"
                  class={cn(inp, 'font-mono text-ui-2xs')} />
                <p class="mt-1 text-ui-3xs text-muted-foreground/30">libsql:// · https:// · http://localhost:PORT</p>
              </div>

              <div>
                <label for="cn-libsql-token" class={lbl}>Auth token <span class="normal-case font-normal opacity-50">(optional)</span></label>
                <Input id="cn-libsql-token" bind:value={libsqlToken} type="password"
                  placeholder="eyJhbGciOiJFZERTQSJ9…"
                  class={cn(inp, 'font-mono text-ui-2xs')} />
              </div>

            <!-- ── ClickHouse ─────────────────────────────── -->
            {:else if dbType === 'clickhouse'}

              <div>
                <label for="cn-ch-uri" class={lbl}>Connection string</label>
                <div class="flex gap-1.5">
                  <Input id="cn-ch-uri" bind:value={connectionUri}
                    placeholder="clickhouse://user:pass@host:8123/db"
                    class={cn(inp, 'font-mono text-ui-2xs')}
                    onpaste={() => requestAnimationFrame(applyConnectionUri)}
                    onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), applyConnectionUri())}
                  />
                  <button type="button" onclick={applyConnectionUri} disabled={!connectionUri.trim()}
                    class="h-8 shrink-0 rounded-md border border-border/25 px-2.5 text-ui-2xs text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-25">
                    Parse
                  </button>
                </div>
                {#if uriHint}
                  <p class={cn('mt-1 flex items-center gap-1 text-ui-3xs',
                    uriHint.includes('Could') || uriHint.includes('Expected') ? 'text-destructive' : 'text-success')}>
                    {#if uriHint.includes('Could') || uriHint.includes('Expected')}
                      <Icon name="alert-circle" class="size-2.5" />
                    {:else}
                      <Icon name="check-circle-2" class="size-2.5" />
                    {/if}
                    {uriHint}
                  </p>
                {/if}
              </div>

              <div class="grid grid-cols-[1fr_110px] gap-2">
                <div>
                  <label for="cn-ch-host" class={lbl}>Host</label>
                  <Input id="cn-ch-host" bind:value={host} class={cn(inp, flashedFields.has('host') && flashCls)} />
                </div>
                <div>
                  <label for="cn-ch-port" class={lbl}>Port</label>
                  <Input id="cn-ch-port" bind:value={port} type="text" inputmode="numeric" class={cn(inpNum, flashedFields.has('port') && flashCls)} />
                </div>
              </div>

              <div>
                <label for="cn-ch-db" class={lbl}>Database</label>
                <Input id="cn-ch-db" bind:value={database} class={cn(inp, flashedFields.has('database') && flashCls)} />
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label for="cn-ch-user" class={lbl}>Username</label>
                  <Input id="cn-ch-user" bind:value={user} autocomplete="username" class={cn(inp, flashedFields.has('user') && flashCls)} />
                </div>
                <div>
                  <label for="cn-ch-pass" class={lbl}>Password</label>
                  <Input id="cn-ch-pass" bind:value={password} type="password" autocomplete="current-password" class={cn(inp, flashedFields.has('password') && flashCls)} />
                </div>
              </div>

            <!-- ── DuckDB (file) ──────────────────────────── -->
            {:else if dbType === 'duckdb'}

              <div>
                <label for="cn-duck-path" class={lbl}>File</label>
                <div class="flex gap-1.5">
                  <Input id="cn-duck-path" bind:value={filePath}
                    placeholder="/path/to/database.duckdb"
                    class={cn(inp, 'font-mono text-ui-2xs')} />
                  <button type="button" onclick={pickDuckdbFile}
                    class="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border/25 px-2.5 text-ui-2xs text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground">
                    <Icon name="folder-open" class="size-3" />
                    Browse
                  </button>
                </div>
                <p class="mt-1 text-ui-3xs text-muted-foreground/30">A new file is created if it doesn't exist.</p>
              </div>

            <!-- ── DuckDB (in-memory) ─────────────────────── -->
            {:else if dbType === 'duckdb-memory'}

              <div class="flex flex-col gap-1.5 rounded-lg border border-border/15 bg-muted/[0.04] px-4 py-3.5">
                <p class="text-ui-xs font-medium text-foreground/70">Ephemeral in-memory DuckDB</p>
                <p class="text-ui-2xs leading-relaxed text-muted-foreground/45">
                  A columnar analytical database that lives only for this session. Nothing is written to disk — closing the connection discards everything.
                </p>
              </div>

            <!-- ── MS SQL Server ──────────────────────────── -->
            {:else if dbType === 'mssql'}

              <div>
                <label for="cn-mssql-uri" class={lbl}>Connection string</label>
                <div class="flex gap-1.5">
                  <Input id="cn-mssql-uri" bind:value={connectionUri}
                    placeholder="sqlserver://sa:pass@host:1433/db"
                    class={cn(inp, 'font-mono text-ui-2xs')}
                    onpaste={() => requestAnimationFrame(applyConnectionUri)}
                    onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), applyConnectionUri())}
                  />
                  <button type="button" onclick={applyConnectionUri} disabled={!connectionUri.trim()}
                    class="h-8 shrink-0 rounded-md border border-border/25 px-2.5 text-ui-2xs text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-25">
                    Parse
                  </button>
                </div>
                {#if uriHint}
                  <p class={cn('mt-1 flex items-center gap-1 text-ui-3xs',
                    uriHint.includes('Could') || uriHint.includes('Expected') ? 'text-destructive' : 'text-success')}>
                    {#if uriHint.includes('Could') || uriHint.includes('Expected')}
                      <Icon name="alert-circle" class="size-2.5" />
                    {:else}
                      <Icon name="check-circle-2" class="size-2.5" />
                    {/if}
                    {uriHint}
                  </p>
                {/if}
              </div>

              <div class="grid grid-cols-[1fr_110px] gap-2">
                <div>
                  <label for="cn-mssql-host" class={lbl}>Host</label>
                  <Input id="cn-mssql-host" bind:value={host} class={cn(inp, flashedFields.has('host') && flashCls)} />
                </div>
                <div>
                  <label for="cn-mssql-port" class={lbl}>Port</label>
                  <Input id="cn-mssql-port" bind:value={port} type="text" inputmode="numeric" class={cn(inpNum, flashedFields.has('port') && flashCls)} />
                </div>
              </div>

              <div>
                <label for="cn-mssql-db" class={lbl}>Database</label>
                <Input id="cn-mssql-db" bind:value={database} class={cn(inp, flashedFields.has('database') && flashCls)} />
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label for="cn-mssql-user" class={lbl}>Username</label>
                  <Input id="cn-mssql-user" bind:value={user} autocomplete="username" class={cn(inp, flashedFields.has('user') && flashCls)} />
                </div>
                <div>
                  <label for="cn-mssql-pass" class={lbl}>Password</label>
                  <Input id="cn-mssql-pass" bind:value={password} type="password" autocomplete="current-password" class={cn(inp, flashedFields.has('password') && flashCls)} />
                </div>
              </div>

            <!-- ── Redis ──────────────────────────────────── -->
            {:else if dbType === 'redis'}

              <div class="grid grid-cols-[1fr_110px] gap-2">
                <div>
                  <label for="cn-redis-host" class={lbl}>Host</label>
                  <Input id="cn-redis-host" bind:value={host} class={cn(inp, flashedFields.has('host') && flashCls)} />
                </div>
                <div>
                  <label for="cn-redis-port" class={lbl}>Port</label>
                  <Input id="cn-redis-port" bind:value={port} type="text" inputmode="numeric" class={cn(inpNum, flashedFields.has('port') && flashCls)} />
                </div>
              </div>

              <div>
                <label for="cn-redis-pass" class={lbl}>Password <span class="normal-case font-normal opacity-50">(optional)</span></label>
                <Input id="cn-redis-pass" bind:value={password} type="password" autocomplete="current-password" class={cn(inp, flashedFields.has('password') && flashCls)} />
              </div>

              <div>
                <label for="cn-redis-db" class={lbl}>Database index</label>
                <Input id="cn-redis-db" bind:value={database} type="text" inputmode="numeric" min="0" max="15" class={inpNum} />
                <p class="mt-1 text-ui-3xs text-muted-foreground/30">Logical database number (0–15).</p>
              </div>

              <label class="flex cursor-pointer select-none items-center gap-2">
                <Checkbox id="cn-redis-tls" checked={secure} onCheckedChange={(v) => (secure = v === true)} />
                <span class="text-ui-xs text-muted-foreground/70">Use TLS</span>
              </label>

            {/if}

                </div>
                {/key}

                <!-- Advanced — full-width section at the bottom -->
                <div class="border-t border-border/40 pt-5">
                  <p class="mb-4 flex items-center gap-1.5 text-ui-3xs font-medium uppercase tracking-wider text-muted-foreground/45">
                    <Icon name="sliders-horizontal" class="size-3 shrink-0" />
                    Advanced
                  </p>
                  {@render advancedFields()}
                </div>

                </div><!-- /manual column -->

              {:else}

                {#if isProvider}
                  <div class="mt-6 flex flex-col gap-4">
                    <!-- Keyed on the provider so switching fully remounts the flow:
                         re-checks sign-in status and clears the previous provider's
                         database list (otherwise a stale pick hits the wrong account). -->
                    {#key dbType}
                      <ProviderConnect
                        provider={dbType}
                        resolvePassword={(host, user) => saved.find((s) => s.host === host && s.user === user && s.password)?.password}
                        onselect={(conn) => connectProviderConnection(conn)}
                      />
                    {/key}
                    {@render advancedSection()}
                  </div>
                {:else if dbType === 'd1'}
                  <div class="mt-6 flex flex-col gap-4">
                    {#key dbType}
                      <CloudflareLogin
                        onselect={connectD1Selection}
                        ondisconnect={() => { accountId = ''; databaseId = ''; apiToken = '' }}
                      />
                    {/key}

                    <details class="group">
                      <summary class="flex cursor-pointer list-none select-none items-center gap-1 text-ui-2xs text-muted-foreground/45 transition-colors hover:text-muted-foreground">
                        <Icon name="chevron-right" class="size-3 transition-transform duration-150 group-open:rotate-90" />
                        Enter account &amp; token manually
                      </summary>
                      <div class="mt-3 flex flex-col gap-2.5">
                        <div class="grid grid-cols-2 gap-2">
                          <div>
                            <label for="cn-d1-account" class={lbl}>Account ID</label>
                            <Input id="cn-d1-account" bind:value={accountId} placeholder="abcdef…" class={cn(inp, 'font-mono text-ui-2xs')} />
                          </div>
                          <div>
                            <label for="cn-d1-dbid" class={lbl}>Database ID</label>
                            <Input id="cn-d1-dbid" bind:value={databaseId} placeholder="xxxxxxxx-…" class={cn(inp, 'font-mono text-ui-2xs')} />
                          </div>
                        </div>
                        <div>
                          <label for="cn-d1-token" class={lbl}>API token</label>
                          <Input id="cn-d1-token" bind:value={apiToken} type="password" class={inp} />
                        </div>
                      </div>
                    </details>
                    {@render advancedSection()}
                  </div>
                {/if}

              {/if}

            </div>
          </div>
        </ScrollArea>

        <!-- ── Footer — inline error alert, status chip, then actions ── -->
        <div class="shrink-0 border-t border-border/15 px-8 py-4">
          <div class="mx-auto max-w-none">

            <!-- Connection error — console style: neutral message text with a thin
                 destructive rail, never a red-washed card. -->
            {#if error}
              <div class="mb-3.5 max-w-[560px] border-l-2 border-destructive/50 py-0.5 pl-3" data-studio-selectable="text">
                <p class="flex items-center gap-1.5 text-ui-xs font-medium text-destructive select-none">
                  <span class="size-1.5 shrink-0 rounded-full bg-destructive"></span>
                  Couldn't connect
                </p>
                <p class="mt-1 select-text break-words font-mono text-ui-xs leading-relaxed text-foreground/75">{error}</p>
              </div>
            {/if}

            <div class="flex items-center gap-3">
              <!-- Status chip + subtle target preview -->
              <div class="flex min-w-0 flex-1 items-center gap-2 text-ui-2xs">
                {#if connecting}
                  <span class="flex shrink-0 items-center gap-1.5 font-medium text-muted-foreground/70"><Icon name="loader-2" class="size-3 animate-spin" />Connecting…</span>
                {:else if testing}
                  <span class="flex shrink-0 items-center gap-1.5 font-medium text-muted-foreground/70"><Icon name="loader-2" class="size-3 animate-spin" />Testing…</span>
                {:else if error}
                  <span class="flex shrink-0 items-center gap-1.5 font-medium text-destructive"><span class="size-1.5 rounded-full bg-destructive"></span>Failed</span>
                {:else if testOk}
                  <span class="flex shrink-0 items-center gap-1.5 font-medium text-success"><span class="size-1.5 rounded-full bg-success"></span>Connection OK</span>
                {:else if isDirty}
                  <span class="flex shrink-0 items-center gap-1.5 font-medium text-warning"><span class="size-1.5 rounded-full bg-warning"></span>Unsaved</span>
                {:else}
                  <span class="flex shrink-0 items-center gap-1.5 text-muted-foreground/50"><span class="size-1.5 rounded-full bg-muted-foreground/30"></span>Ready</span>
                {/if}
                <span class="min-w-0 truncate font-mono text-ui-3xs text-muted-foreground/40" title={statusTarget}>{statusTarget}</span>
              </div>

              <!-- Actions — shared Button variants (Resume ghost · Stop soft-destructive
                   · Test outline · Connect solid primary), one system app-wide. -->
              <div class="ml-auto flex shrink-0 items-center gap-2">
                {#if lastId && saved.find(c => c.id === lastId)}
                  {@const lastConn = saved.find(c => c.id === lastId)}
                  <Button variant="ghost" class="max-w-[200px] text-muted-foreground" disabled={isBusy} onclick={() => connectWith(lastConn)}>
                    {#if connecting === lastConn.id}
                      <Icon name="loader-2" class="size-3.5 animate-spin" />Resuming…
                    {:else}
                      Resume <span class="min-w-0 truncate text-foreground/80">{lastConn.name}</span>
                    {/if}
                  </Button>
                {/if}
                {#if isBusy}
                  <Button variant="destructive" onclick={stopOp}>
                    <Icon name="x" class="size-3.5" />Stop
                  </Button>
                {/if}
                {#if canTest}
                  <Button variant="outline" disabled={isBusy} onclick={handleTest}>
                    {#if testing}<Icon name="loader-2" class="size-3.5 animate-spin" />Testing…{:else}Test{/if}
                  </Button>
                {/if}
                <Button
                  class={cn('px-5', connecting === (editingId ?? '__new__') && 'disabled:opacity-90')}
                  disabled={isBusy}
                  onclick={handleConnect}
                >
                  {#if connecting === (editingId ?? '__new__')}
                    <Icon name="loader-2" class="size-3.5 animate-spin" />Connecting…
                  {:else}
                    {editingId ? 'Save & connect' : 'Connect'}
                  {/if}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Close button — routes through the unsaved-changes guard -->
    <button
      type="button"
      onclick={requestClose}
      class="absolute right-4 top-4 inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground/40 transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted/60 hover:text-foreground active:scale-[0.92] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <Icon name="x" class="size-4" />
      <span class="sr-only">Close</span>
    </button>

    <!-- Discard-changes confirmation (styled, blocks close until answered) -->
    {#if confirmDiscardOpen}
      <div class="absolute inset-0 z-[60] flex items-center justify-center bg-black/50 p-6">
        <div class="w-full max-w-sm rounded-xl border border-border/40 bg-background p-5 shadow-2xl">
          <div class="flex items-start gap-3">
            <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <Icon name="alert-circle" class="size-4" />
            </div>
            <div class="min-w-0">
              <h3 class="text-ui-sm font-semibold text-foreground">Discard unsaved changes?</h3>
              <p class="mt-1 text-ui-xs leading-relaxed text-muted-foreground/70">
                You have unsaved edits in this connection. Closing now will lose them.
              </p>
            </div>
          </div>
          <div class="mt-4 flex justify-end gap-2">
            <button type="button" onclick={() => (confirmDiscardOpen = false)}
              class="inline-flex h-8 items-center rounded-lg border border-border/40 px-3.5 text-ui-xs text-muted-foreground/80 transition-[color,background-color,border-color,transform] duration-150 ease-out hover:bg-muted/40 hover:text-foreground active:scale-[0.97]">
              Keep editing
            </button>
            <button type="button" onclick={discardAndClose}
              class="inline-flex h-8 items-center rounded-lg bg-destructive px-3.5 text-ui-xs font-semibold text-white transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.97]">
              Discard
            </button>
          </div>
        </div>
      </div>
    {/if}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>

<style>
  /* The modal is portalled to <body>, outside #app, so it never inherits the
     app-wide `user-select: none`. Re-establish it here so chrome (labels, titles,
     rows, buttons, status) can't be drag-selected — while real field VALUES stay
     selectable. Scoped to this modal only via the data attribute. */
  :global([data-connection-modal]),
  :global([data-connection-modal] *) {
    user-select: none;
    -webkit-user-select: none;
  }
  :global([data-connection-modal] input),
  :global([data-connection-modal] textarea) {
    user-select: text;
    -webkit-user-select: text;
  }
  /* Pointer cursor on every interactive control in the modal (toggles, Type
     picker, rows, disclosure, footer buttons); disabled ones fall back. */
  :global([data-connection-modal] button:not(:disabled)),
  :global([data-connection-modal] [role='button']),
  :global([data-connection-modal] summary) {
    cursor: pointer;
  }

  /* Decorative entrance for saved / provider rows — fades + rises in.
     Never blocks clicks (runs on the interactive element itself). */
  @keyframes -global-cn-rise-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  :global(.cn-stagger-in) {
    opacity: 0;
    animation: cn-rise-in 250ms cubic-bezier(0.23, 1, 0.32, 1) both;
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.cn-stagger-in) {
      animation: none;
      opacity: 1;
    }
  }
</style>
