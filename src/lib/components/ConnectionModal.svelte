<script>
  import { untrack, onDestroy } from 'svelte'
  import Icon from './Icon.svelte'
  import CloudflareLogin from './CloudflareLogin.svelte'
  import ProviderConnect from './ProviderConnect.svelte'
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
    scanLocalStudios, scanDockerDatabases, scanMachineDatabases,
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
  import ResizeHandle from './ResizeHandle.svelte'
  import { cn }         from '$lib/utils.js'
  import { toast }      from '$lib/components/ui/sonner/toast.svelte.js'
  import { parseConnectionUri } from '$lib/connection-uri.js'
  import { PROVIDERS, providerBuildConnection } from '$lib/providers.js'

  let {
    open = $bindable(false),
    onconnected = (conn, id) => {},
    maxConnections = Infinity,
    /** Name of the live session, '' when nothing is connected. Drives Disconnect. */
    activeConnectionName = '',
    ondisconnect = () => {},
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
        { id: 'neon',        label: 'Neon',            desc: 'Serverless Postgres, sign in & pick a database' },
        { id: 'supabase',    label: 'Supabase',        desc: 'Postgres platform, sign in & pick a project' },
        { id: 'planetscale', label: 'PlanetScale',     desc: 'Serverless MySQL, sign in & pick a database' },
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
  // Providers temporarily turned off (shown as a disabled tab, not connectable).
  const DISABLED_TABS = new Set(['planetscale'])


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
    drizzle:         'text-lime-500/80',
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
  // Top-level entry mode: connect manually vs sign in with a hosting provider.
  let entryMode     = $state(/** @type {'manual'|'provider'} */ ('manual'))
  // Advanced (SSL / SSH / read-only) disclosure - collapsed by default.
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
  // vs. fill individual fields. UI-only - not tracked as a dirty change.
  let fieldMode     = $state(/** @type {'string'|'fields'} */ ('fields'))

  // ── Connection options ───────────────────────────────────────────────────────
  let readOnly        = $state(false)

  // ── SSH tunnel state ─────────────────────────────────────────────────────────
  let sshEnabled      = $state(false)
  let sshHost         = $state('')
  let sshPort         = $state('22')
  let sshUsername     = $state('')
  let sshKeyPath      = $state('')

  /** Set when the D1 connection being edited was created by the Cloudflare sign-in. */
  let d1Oauth = $state(false)
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

  /**
   * Which half of the flow is on screen: 'pick' asks what you're connecting to,
   * 'form' asks for that database's details. Nothing about a connection is shown
   * before it has been chosen - and editing a saved one opens straight at 'form'.
   * @type {'pick' | 'form'}
   */
  let step = $state('pick')

  /** A card in step 1 was chosen: set the engine and move on. @param {string} id */
  function pickEngine(id) {
    if (DISABLED_TABS.has(id)) return
    entryMode = PROVIDER_IDS.includes(id) || id === 'd1' ? 'provider' : 'manual'
    switchDriver(id)
    step = 'form'
    // Choosing what to connect to is navigation, not an edit - re-baseline so
    // opening the picker and closing again doesn't ask about discarding changes
    // nobody made. Only editing a saved connection can be dirty.
    if (!editingId) baseline = snapshot()
  }

  /** Back to the picker, keeping whatever has been typed so far. */
  function backToPick() {
    error = ''
    testOk = false
    step = 'pick'
    engineQuery = ''
  }

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
    // Naming a connection is optional: an empty Name field takes the derived one
    // rather than saving a row that reads "Unnamed" in the sidebar forever.
    const nm = name.trim() || autoName
    if (dbType === 'sqlite' || dbType === 'sqlite-memory')
      return { type: 'sqlite', name: nm, filePath: dbType === 'sqlite-memory' ? ':memory:' : filePath }
    if (dbType === 'libsql') return { type: 'libsql', name: nm, url: libsqlUrl, authToken: libsqlToken || undefined }
    if (dbType === 'd1')     return { type: 'd1', name: nm, accountId, databaseId, apiToken, ...(d1Oauth && { oauth: true }) }
    if (dbType === 'mysql' || dbType === 'mariadb')
      return { type: dbType, name: nm, host, port, database, user, password, ssl, ...(ssh && { ssh }) }
    if (dbType === 'cockroachdb')
      return { type: 'cockroachdb', name: nm, host, port, database, user, password, ssl, ...(ssh && { ssh }) }
    if (dbType === 'clickhouse')
      return { type: 'clickhouse', name: nm, host, port, database, user, password, secure }
    if (dbType === 'duckdb' || dbType === 'duckdb-memory')
      return { type: 'duckdb', name: nm, filePath: dbType === 'duckdb-memory' ? ':memory:' : filePath }
    if (dbType === 'mssql')
      return { type: 'mssql', name: nm, host, port, database, user, password, encrypt, trustCert }
    if (dbType === 'redis')
      return { type: 'redis', name: nm, host, port, password, db: Number(database) || 0, tls: secure }
    return { type: 'postgres', name: nm, host, port, database, user, password, ssl, ...(ssh && { ssh }) }
  }

  /**
   * Report a failure.
   *
   * The alert is a toast, not a panel wedged into the form: a connection error
   * arrives while you are looking at the field that caused it, and a block that
   * grows the page (title + advice + button + raw driver text) pushed the fields
   * around at exactly the wrong moment. `error` is still set, because the footer
   * chip and the diagnosis both read it.
   *
   * @param {string} msg
   */
  function failWith(msg) {
    error = msg
    // errorFix is derived from `error`, so it re-reads against the new message.
    const fix = errorFix
    toast.error(fix ? fix.title : "Couldn't connect", {
      description: fix ? fix.hint : msg,
      // Unrecognised failures show the driver's own words, so they get the
      // monospace treatment the toast already has for raw output.
      ...(fix ? {} : { code: true }),
      duration: 9000,
      ...(fix?.action ? { action: { label: fix.actionLabel, onClick: fix.action } } : {}),
    })
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
      d1Oauth = !!conn.oauth
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
      d1Oauth = false
      libsqlUrl = ''; libsqlToken = ''
      sshEnabled = false; sshHost = ''; sshPort = '22'; sshUsername = ''; sshKeyPath = ''
      readOnly = false
    }
    entryMode = (PROVIDER_IDS.includes(dbType) || dbType === 'd1') ? 'provider' : 'manual'
    // An existing connection already answered "what are you connecting to", so it
    // opens on its details. A new one starts at the choice.
    step = conn ? 'form' : 'pick'
    fieldMode = 'fields'
    advancedOpen = false
    flashedFields = new Set()
    error = ''; testOk = false; connectionUri = ''; uriHint = ''
    d1Reset()
    baseline = snapshot()
  }

  /**
   * A provider adapter resolved a database (with a password if it needed one):
   * build a SavedConnection and connect immediately via connectWith - no detour
   * through the manual form, so picking a project just connects. Runs the same
   * connect/save/close path as any other connection.
   * @param {import('$lib/providers.js').ProviderConnection} conn
   */
  async function connectProviderConnection(conn) {
    error = ''
    // Credentials reused from a saved connection can have been revoked in the
    // provider's console since. Probe them first - connectWith reports failures
    // itself, so letting it fail would toast a scary auth error a moment before
    // the retry silently succeeded.
    if (conn.reusedSaved) {
      const probe = { name: conn.name, host: conn.host, port: conn.port, database: conn.database, user: conn.username, password: conn.password, ssl: conn.ssl }
      let usable = true
      try {
        if (conn.db_type === 'mysql') await testMysqlConnection(probe)
        else await testPostgresConnection(probe)
      } catch {
        usable = false
      }
      const spec = usable ? conn : await providerBuildConnection(dbType, conn.reusedSaved)
      await connectProviderResolved(spec)
      return
    }
    await connectProviderResolved(conn)
  }

  /**
   * Build a SavedConnection from a resolved provider spec and connect.
   * @param {import('$lib/providers.js').ProviderConnection} conn
   */
  async function connectProviderResolved(conn) {
    error = ''
    // dbType is the provider id while the provider flow is showing - tag the
    // connection with it so the status bar can offer switching to the account's
    // other databases later.
    const providerId = ['neon', 'supabase', 'planetscale', 'prisma'].includes(dbType) ? dbType : undefined
    const type = conn.db_type === 'mysql' ? 'mysql' : 'postgres'
    // Reuse an existing saved entry for this exact database (host + user) instead
    // of piling up duplicates - connectWith upserts it, keeping the saved password.
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
    // up duplicates - connectWith upserts it.
    const existing = saved.find((s) => s.type === 'd1' && s.databaseId === info.databaseId)
    await connectWith({
      id: existing?.id ?? newConnectionId(),
      type: 'd1',
      name: info.databaseName,
      accountId: info.accountId,
      databaseId: info.databaseId,
      apiToken: info.token,
      // The token is an OAuth access token with a ~10 minute life, so mark where
      // it came from: reconnecting later has to mint a fresh one rather than
      // replay this snapshot (see d1Call in api.js).
      oauth: true,
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

  /**
   * A readable stand-in for an empty Name field - shown as its placeholder and
   * used verbatim on save, so naming a connection stays optional.
   */
  const autoName = $derived.by(() => {
    if (dbType === 'sqlite-memory' || dbType === 'duckdb-memory') return 'Scratch database'
    if (dbType === 'sqlite' || dbType === 'duckdb')
      return (
        filePath.split(/[\\/]/).pop()?.replace(/\.(sqlite3?|db|duckdb)$/i, '') || activeDriver.label
      )
    if (dbType === 'libsql')
      return libsqlUrl.replace(/^\w+:\/\//, '').split('.')[0] || activeDriver.label
    if (dbType === 'd1') return 'Cloudflare D1'
    if (host.trim()) return `${database.trim() || activeDriver.label}@${host.trim()}`
    return activeDriver.label
  })



  /** Placeholder for the paste bar - the shape this engine actually accepts. */
  const uriPlaceholder = $derived(
    dbType === 'mysql' || dbType === 'mariadb'
      ? 'mysql://user:pass@host:3306/db'
      : dbType === 'cockroachdb'
        ? 'postgresql://user:pass@host:26257/defaultdb'
        : 'postgresql://user:pass@host:5432/db',
  )

  /**
   * Read a connection string straight off the clipboard and fill the form.
   *
   * Pasting is how people actually arrive here - the string is in the buffer
   * from a provider dashboard - so it gets a button rather than requiring a
   * click into the right field first.
   */
  async function pasteConnectionUri() {
    try {
      const text = (await navigator.clipboard.readText()).trim()
      if (!text) { uriHint = 'Clipboard is empty'; return }
      connectionUri = text
      if (!applyConnectionUri() && !uriHint) uriHint = "That doesn't look like a connection string"
    } catch {
      // Clipboard read can be refused; fall back to letting them paste by hand.
      uriHint = 'Paste into the field with ⌘V'
      document.getElementById('cn-paste-uri')?.focus()
    }
  }

  /** @param {string} id */
  function focusField(id) {
    const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id))
    el?.focus()
    el?.select?.()
  }

  /**
   * Turn a driver error into something to *do*.
   *
   * A raw driver message is the least useful moment in the whole flow - it is
   * where people give up and close the dialog. The raw text still shows, but
   * above it goes a plain reading of what failed, and a one-click fix wherever
   * there is an obvious one.
   */
  const errorFix = $derived.by(() => {
    const e = (error || '').toLowerCase()
    if (!e) return null
    // A REST 401 comes first: `auth.*error` used to swallow "401 Unauthorized:
    // …\"errors\":[…]" and report a wrong *password* for a token that had simply
    // expired, which sends people to a field that isn't the problem.
    if (/\b40[13]\b|unauthorized|invalid api token/.test(e)) {
      const cf = dbType === 'd1'
      return {
        title: cf ? 'Cloudflare rejected the saved token' : 'The server rejected the credentials',
        hint: cf
          ? 'The access token from your Cloudflare sign-in has expired. Signing in again mints a fresh one.'
          : 'The endpoint answered but refused the token or key it was given.',
        actionLabel: cf ? 'Reconnect Cloudflare' : 'Check credentials',
        action: cf
          ? () => { entryMode = 'provider'; switchDriver('d1'); step = 'form' }
          : () => focusField('cn-d1-token'),
      }
    }
    if (/password authentication failed|authentication failed|access denied|invalid credentials|login failed/.test(e))
      return {
        title: 'The username or password was rejected',
        hint: 'The server answered, so the address is right — only the credentials were refused.',
        actionLabel: 'Check password',
        action: () => focusField('cn-pass'),
      }
    if (/does not support ssl|ssl.*required|requires ssl|sslmode|tls.*required/.test(e))
      return {
        title: 'This server requires an encrypted connection',
        hint: 'Turn on SSL / TLS and try again.',
        actionLabel: 'Enable SSL & retry',
        action: () => { ssl = true; advancedOpen = true; void handleTest() },
      }
    if (/database ".*" does not exist|unknown database|no such database|database .* not found/.test(e))
      return {
        title: "That database doesn't exist on the server",
        hint: 'Check the name — on PostgreSQL the default database is usually "postgres".',
        actionLabel: 'Edit database',
        action: () => focusField('cn-db'),
      }
    if (/connection refused|econnrefused|timed out|timeout|no route to host|network is unreachable|connection reset/.test(e))
      return {
        title: 'Nothing answered at that address',
        hint: `Is the server running, and is ${host}:${port} the right host and port?`,
        actionLabel: 'Edit host',
        action: () => focusField('cn-host'),
      }
    if (/name or service not known|nodename nor servname|getaddrinfo|failed to lookup|dns/.test(e))
      return {
        title: "That host name doesn't resolve",
        hint: 'Check the spelling, or use an IP address instead.',
        actionLabel: 'Edit host',
        action: () => focusField('cn-host'),
      }
    return null
  })

  /** Left-rail subtitle: engine, or the studio a connection was picked up from. */
  function connSubtitle(conn, cid) {
    const source = conn.origin
      ? (conn.toolLabel || (conn.origin === 'docker' ? 'Docker' : 'Studio'))
      : driverById(cid).label
    return `${source} · ${connDetail(conn)}`
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
      engineQuery = ''
      void refreshLocal()
    })
  })

  function handleDelete(id) {
    saved = removeConnection(id).sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
    if (id === lastId) { lastId = null; setLastConnectionId(null) }
    if (editingId === id) resetForm(null)
  }

  /** Open `conn` with the driver its `type` calls for. */
  function openConnection(conn) {
    if (conn.type === 'sqlite') return connectSqlite(conn)
    if (conn.type === 'd1') return connectD1(conn)
    if (conn.type === 'libsql') return connectLibSql(conn)
    if (conn.type === 'mysql' || conn.type === 'mariadb') return connectMysql(conn)
    if (conn.type === 'clickhouse') return connectClickhouse(conn)
    if (conn.type === 'duckdb') return connectDuckdb(conn)
    if (conn.type === 'mssql') return connectMssql(conn)
    if (conn.type === 'redis') return connectRedis(conn)
    return connectPostgres(conn)
  }

  async function connectWith(conn) {
    const myOp = ++opId
    connecting = conn.id; error = ''
    try {
      await openConnection(conn)
      if (myOp !== opId) return // cancelled by the user
      const updated = { ...conn, lastConnectedAt: Date.now() }
      saved = upsertConnection(updated).sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
      setLastConnectionId(conn.id)
      open = false
      await onconnected(updated, conn.id)
    } catch (e) { if (myOp === opId) failWith(friendlyError(e)) }
    finally { if (myOp === opId) connecting = null }
  }

  // ── Studios running on this machine ─────────────────────────────────────────
  // `prisma studio` / `drizzle-kit studio` are already pointed at a database, and
  // the backend reads which one out of that project's own schema/config. So they
  // appear here as one-click targets: nothing to type, and nothing left behind -
  // the row exists only while the studio does.

  // Free-text filter over the driver grid and the detected studios. 17 engines
  // in six groups is more than anyone should have to scan by eye.
  let engineQuery = $state('')
  /** @type {HTMLInputElement | null} */
  let engineSearchEl = $state(null)

  const engineMatches = $derived.by(() => {
    const q = engineQuery.trim().toLowerCase()
    if (!q) return CATEGORIES
    return CATEGORIES
      .map((c) => ({ ...c, drivers: c.drivers.filter((d) => `${d.label} ${d.desc} ${d.id}`.toLowerCase().includes(q)) }))
      .filter((c) => c.drivers.length > 0)
  })
  /** Enter in the search box opens the single obvious result. */
  const firstEngineMatch = $derived(engineMatches[0]?.drivers.find((d) => !DISABLED_TABS.has(d.id)) ?? null)

  $effect(() => {
    if (open && step === 'pick' && engineSearchEl) engineSearchEl.focus()
  })

  // ── Connections rail: width + collapsed state, remembered ──────────────────
  const RAIL_KEY = 'stroke:conn-rail'
  const RAIL_MIN = 260
  const RAIL_MAX = 520
  const RAIL_DEFAULT = 340

  function loadRail() {
    try {
      const raw = JSON.parse(localStorage.getItem(RAIL_KEY) ?? '{}')
      return {
        width: Math.min(RAIL_MAX, Math.max(RAIL_MIN, Number(raw.width) || RAIL_DEFAULT)),
        open: raw.open !== false,
      }
    } catch { return { width: RAIL_DEFAULT, open: true } }
  }
  const _rail = loadRail()
  let railWidth = $state(_rail.width)
  let railOpen  = $state(_rail.open)
  function saveRail() {
    try { localStorage.setItem(RAIL_KEY, JSON.stringify({ width: railWidth, open: railOpen })) } catch { /* ignore */ }
  }
  let railDragStart = 0

  let studios    = $state(/** @type {import('$lib/api.js').DetectedStudio[]} */ ([]))
  let dockerDbs  = $state(/** @type {import('$lib/api.js').DockerDatabase[]} */ ([]))
  let machineDbs = $state(/** @type {import('$lib/api.js').MachineDatabase[]} */ ([]))
  let localPhase = $state(/** @type {'idle'|'scanning'|'done'} */ ('idle'))

  async function refreshLocal() {
    localPhase = 'scanning'
    // Discovery is a convenience on both sides. A failure means "nothing found",
    // never an error banner over a dialog opened to do something else.
    const [s, d, m] = await Promise.all([
      scanLocalStudios().catch(() => []),
      scanDockerDatabases().catch(() => []),
      scanMachineDatabases().catch(() => []),
    ])
    studios = s
    dockerDbs = d
    machineDbs = m
    localPhase = 'done'
  }

  /**
   * One row in "Running on this machine", from either source.
   * @typedef {{
   *   id: string, mark: string, trailingMark: string | null, title: string,
   *   badge: string, subtitle: string, hint: string, conn: any | null,
   * }} LocalTarget
   */

  /** @param {import('$lib/api.js').DetectedStudio} s */
  function studioTarget(s) {
    const built = s.engine ? studioConnection(s) : null
    return /** @type {LocalTarget} */ ({
      id: studioId(s),
      mark: s.tool,
      trailingMark: s.engine,
      title: s.projectName,
      badge: `:${s.port}`,
      subtitle: built ? s.target : (s.reason ?? ''),
      hint: built ? `${s.target} — from ${s.projectDir}/${s.source}` : (s.reason ?? ''),
      conn: built && { ...built, origin: 'studio', tool: s.tool, toolLabel: s.toolLabel },
    })
  }

  /** @param {import('$lib/api.js').DockerDatabase} d */
  function dockerTarget(d) {
    const label = `Docker · ${d.image}`
    // Engine-shaped extras: the container is on loopback, so TLS is off unless
    // the engine refuses to speak without it (SQL Server does).
    const extras =
      d.engine === 'redis' ? { db: 0, tls: false }
      : d.engine === 'mssql' ? { encrypt: true, trustCert: true }
      : d.engine === 'clickhouse' ? { secure: false }
      : { ssl: false }
    return /** @type {LocalTarget} */ ({
      id: `docker:${d.name}`,
      mark: d.engine,
      trailingMark: null,
      title: d.name,
      badge: d.reason ? '' : `:${d.port}`,
      subtitle: d.reason ?? d.target,
      hint: d.reason ?? `${d.image} · container ${d.containerId} · ${d.user ? d.user + '@' : ''}${d.target}`,
      conn: d.reason ? null : {
        id: `docker:${d.name}`,
        type: d.engine,
        name: d.name,
        host: d.host,
        port: d.port,
        user: d.user,
        password: d.password,
        database: d.database,
        origin: 'docker',
        toolLabel: label,
        ...extras,
      },
    })
  }

  /** @param {import('$lib/api.js').MachineDatabase} m */
  function machineTarget(m) {
    return /** @type {LocalTarget} */ ({
      id: m.id,
      mark: m.engine,
      trailingMark: null,
      title: m.name,
      badge: `:${m.port}`,
      subtitle: m.target,
      hint: `${m.name} (pid ${m.pid}) — connects as ${m.user || 'the default user'}`,
      conn: {
        id: m.id,
        type: m.engine,
        name: `${m.name} (:${m.port})`,
        host: m.host,
        port: m.port,
        user: m.user,
        password: '',
        database: m.database,
        origin: 'machine',
        toolLabel: 'Installed on this machine',
        ...(m.engine === 'redis' ? { db: 0, tls: false } : { ssl: false }),
      },
    })
  }

  const matchesQuery = (/** @type {LocalTarget} */ t) => {
    const q = engineQuery.trim().toLowerCase()
    return !q || `${t.title} ${t.subtitle}`.toLowerCase().includes(q)
  }

  // Three sources, three groups, in the order you'd reach for them: the studio
  // you have open right now, then what's installed, then containers. A Docker
  // container's server process is invisible to the machine scan (its socket
  // lives in the container's netns), but a stray port collision would still be
  // a duplicate row, so Docker wins on port.
  const dockerPorts = $derived(new Set(dockerDbs.filter((d) => !d.reason).map((d) => d.port)))
  const localGroups = $derived([
    { key: 'studios', label: 'Local studios', targets: studios.map(studioTarget).filter(matchesQuery) },
    {
      key: 'machine',
      label: 'Installed on this machine',
      targets: machineDbs.filter((m) => !dockerPorts.has(m.port)).map(machineTarget).filter(matchesQuery),
    },
  ].filter((g) => g.targets.length > 0))
  // Containers sit below the engine picker: eight of them above it pushed the
  // thing most people came here for off the first screen. A container with no
  // published port can't be opened from the host, so it isn't offered at all.
  const dockerTargets = $derived(
    dockerDbs.filter((d) => !d.reason).map(dockerTarget).filter(matchesQuery),
  )
  const localMatches = $derived([...localGroups.flatMap((g) => g.targets), ...dockerTargets])

  /** Stable per project, so query history follows a studio across restarts. */
  function studioId(s) { return `studio:${s.tool}:${s.projectDir}` }

  /**
   * A detected studio as a connection payload. Host engines go through the same
   * URI parser as the paste bar, so one parser owns every connection string in
   * the app. Null when the URL didn't parse.
   */
  function studioConnection(s) {
    const base = { id: studioId(s), name: `${s.projectName} · ${s.toolLabel}` }
    if (s.engine === 'sqlite') return { ...base, type: 'sqlite', filePath: s.filePath }
    if (s.engine === 'libsql') return { ...base, type: 'libsql', url: s.url, authToken: s.authToken ?? '' }
    if (s.engine === 'd1')     return { ...base, type: 'd1', accountId: s.accountId, databaseId: s.databaseId, apiToken: s.apiToken }
    const uriType = s.engine === 'mysql' ? 'mysql' : s.engine === 'mssql' ? 'mssql' : 'postgres'
    const parsed = parseConnectionUri(uriType, s.url ?? '')
    if (!parsed || 'error' in parsed || !('host' in parsed)) return null
    return {
      ...base,
      type: s.engine,
      host: parsed.host, port: Number(parsed.port), database: parsed.database,
      user: parsed.user, password: parsed.password,
      ...('encrypt' in parsed ? { encrypt: parsed.encrypt, trustCert: parsed.trustCert } : { ssl: parsed.ssl }),
    }
  }

  /**
   * Open a local target. Nobody typed these credentials, but the connection
   * still has to survive a disconnect and an app restart — so it joins the list
   * under a stable id and becomes "last connection", and the normal resume path
   * brings it back even once the studio or container scan is stale.
   * @param {LocalTarget} t
   */
  async function connectLocal(t) {
    if (!t.conn) return
    const myOp = ++opId
    connecting = t.conn.id; error = ''
    try {
      await openConnection(t.conn)
      if (myOp !== opId) return // cancelled by the user
      const stamped = { ...t.conn, lastConnectedAt: Date.now() }
      saved = upsertConnection(stamped).sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
      setLastConnectionId(t.conn.id)
      open = false
      await onconnected(stamped, t.conn.id)
    } catch (e) { if (myOp === opId) failWith(friendlyError(e)) }
    finally { if (myOp === opId) connecting = null }
  }

  async function handleTest() {
    const myOp = ++opId
    testing = true; error = ''; testOk = false
    try {
      // In connection-string mode the payload is built from the individual
      // fields, so parse the URI into them first (finally clears `testing`).
      if (fieldMode === 'string' && URI_TOGGLE_ENGINES.includes(dbType) && !applyConnectionUri()) {
        failWith(uriHint || 'Enter a valid connection string')
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
      // Success is a toast for the same reason failure is: the answer belongs
      // next to the button you pressed, not in a chip you have to go find.
      toast.success('Connection OK', { description: statusTarget })
    } catch (e) { if (myOp === opId) failWith(friendlyError(e)) }
    finally { if (myOp === opId) testing = false }
  }

  /**
   * Persist the form WITHOUT connecting. Same validation and payload as
   * handleConnect, minus the connect round trip and the dialog close — so a
   * connection can be filed away (or an edit corrected) while the current
   * session stays live. Re-stamps `baseline` so the "Unsaved" dot clears and the
   * close guard stops treating the form as dirty.
   */
  function handleSave() {
    if (!editingId && saved.length >= maxConnections) {
      failWith(`Free plan allows ${maxConnections} saved connections. Upgrade to Stroke Pro for unlimited.`)
      return
    }
    error = ''
    if (fieldMode === 'string' && URI_TOGGLE_ENGINES.includes(dbType) && !applyConnectionUri()) {
      failWith(uriHint || 'Enter a valid connection string')
      return
    }
    const payload = formPayload()
    const existing = editingId ? saved.find(s => s.id === editingId) : null
    const id = existing?.id ?? newConnectionId()
    const hasHostPort = ['postgres', 'mysql', 'mariadb', 'cockroachdb', 'clickhouse', 'mssql', 'redis'].includes(payload.type)
    const defaultPort = { mysql: 3306, mariadb: 3306, cockroachdb: 26257, postgres: 5432, clickhouse: 8123, mssql: 1433, redis: 6379 }[payload.type] ?? 5432
    saved = upsertConnection({
      id, ...payload,
      port: hasHostPort ? (Number(payload.port) || defaultPort) : undefined,
      // lastConnectedAt is deliberately NOT touched - nothing was connected, so
      // this must not jump to the top of the recents list or become "Resume".
      lastConnectedAt: existing?.lastConnectedAt,
      readOnly: readOnly || undefined,
    }).sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
    // Keep editing the row we just saved, so a follow-up Connect updates it
    // instead of creating a duplicate.
    editingId = id
    baseline = snapshot()
    justSaved = true
    clearTimeout(justSavedTimer)
    justSavedTimer = setTimeout(() => { justSaved = false }, 2000)
  }

  async function handleConnect() {
    if (!editingId && saved.length >= maxConnections) {
      failWith(`Free plan allows ${maxConnections} saved connections. Upgrade to Stroke Pro for unlimited.`)
      return
    }
    const myOp = ++opId
    connecting = editingId ?? '__new__'; error = ''
    try {
      // In connection-string mode the payload is built from the individual
      // fields, so parse the URI into them first (finally clears `connecting`).
      if (fieldMode === 'string' && URI_TOGGLE_ENGINES.includes(dbType) && !applyConnectionUri()) {
        failWith(uriHint || 'Enter a valid connection string')
        return
      }
      const payload = formPayload()
      await openConnection(payload)
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
    } catch (e) { if (myOp === opId) failWith(friendlyError(e)) }
    finally { if (myOp === opId) connecting = null }
  }

  const canTest = $derived(true)
  const isBusy  = $derived(testing || !!connecting)

  // Transient "Saved" confirmation on the Save button (no toast - the dialog
  // stays open, so the feedback belongs on the control that was pressed).
  let justSaved = $state(false)
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let justSavedTimer

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

  /** Attempt to close the dialog - guard against discarding unsaved edits. */
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

  // Field labels are sentence case, not uppercase micro-labels: a form with
  // eight of those stacked reads as shouting, and DESIGN_SYSTEM reserves the
  // uppercase treatment for section headings (§10).
  const lbl = 'mb-1.5 block text-ui-xs font-medium text-foreground/75'
  // Segmented pill switch (entry-mode + field-mode) - shared base for consistency.
  // A quiet segmented pair, right-aligned beside its section heading - not the
  // full-width bordered block it used to be, which competed with the fields it
  // was only there to switch between.
  // Every field row uses this one 6-column template. Rows that each invented
  // their own split (1fr+110px here, 50/50 there) meant no two column edges in
  // the form lined up, which is most of what made it look thrown together.
  const row6 = 'grid grid-cols-6 gap-x-4'
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

<!-- ⌘R / Ctrl+R rescans what's running locally while the dialog is open. The
     preventDefault matters: without it the webview reloads the whole app. -->
<svelte:window onkeydown={(e) => {
  if (!open) return
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'r') {
    e.preventDefault()
    saved = loadSavedConnections().sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
    void refreshLocal()
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b') {
    e.preventDefault()
    railOpen = !railOpen
    saveRail()
  }
}} />

<!-- SSH Tunnel section (shared by PG and MySQL forms) -->
<!-- Advanced options, SSL / SSH tunnel / encryption / read-only. Laid out to
     fill the available width (toggle row + horizontal SSH grid); wraps to a
     column on the narrow provider/D1 collapsible. -->
{#snippet advancedFields()}
  {@const isPgMy = dbType === 'postgres' || dbType === 'cockroachdb' || dbType === 'mysql' || dbType === 'mariadb'}
  <div class="flex flex-col gap-4">
    <!-- Toggle row, on the same six columns as the fields above: hand-tuned
         gap-x spacing left these sitting at arbitrary positions relative to the
         form. -->
    <div class={cn(row6, 'gap-y-3')}>
      {#if isPgMy}
        <label class="col-span-3 flex cursor-pointer select-none items-center gap-2 sm:col-span-2">
          <Checkbox id="cn-ssl" checked={ssl} onCheckedChange={(v) => (ssl = v === true)} />
          <span class="text-ui-xs text-muted-foreground/70">Use SSL / TLS</span>
        </label>
        <label class="col-span-3 flex cursor-pointer select-none items-center gap-2 sm:col-span-2">
          <Checkbox id="cn-ssh-enabled" checked={sshEnabled} onCheckedChange={(v) => (sshEnabled = v === true)} />
          <span class="flex items-center gap-1.5 text-ui-xs text-muted-foreground/70">
            <Icon name="terminal" class="size-3 shrink-0" />
            Connect via SSH tunnel
          </span>
        </label>
      {:else if dbType === 'clickhouse'}
        <label class="col-span-3 flex cursor-pointer select-none items-center gap-2 sm:col-span-2">
          <Checkbox id="cn-ch-secure" checked={secure} onCheckedChange={(v) => { secure = v === true; if (secure && port === '8123') port = '8443'; else if (!secure && port === '8443') port = '8123' }} />
          <span class="text-ui-xs text-muted-foreground/70">Use HTTPS (TLS)</span>
        </label>
      {/if}
      <label class="col-span-3 flex cursor-pointer select-none items-center gap-2 sm:col-span-2">
        <Checkbox id="cn-readonly" checked={readOnly} onCheckedChange={(v) => (readOnly = v === true)} />
        <span class="flex items-center gap-1.5 text-ui-xs text-muted-foreground/70">
          <Icon name="lock" class="size-3 shrink-0" />
          Open in read-only mode
        </span>
      </label>
    </div>

    <!-- SSH tunnel fields, horizontal, fills the width -->
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
          <p class="mt-1 text-ui-3xs leading-snug text-muted-foreground/40">Optional, leave blank to use your SSH agent.</p>
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
      class="fixed inset-x-0 z-50 bg-black/65 data-open:animate-in data-closed:animate-out data-open:fade-in-0 data-closed:fade-out-0 ease-out duration-150"
    />
    <DialogPrimitive.Content
      data-connection-modal
      style="top: var(--app-titlebar-h, 38px); bottom: var(--app-statusbar-h, 0px);"
      class="fixed inset-x-0 z-50 flex bg-background text-foreground outline-none data-open:animate-in data-closed:animate-out data-open:fade-in-0 data-closed:fade-out-0 data-open:zoom-in-[0.98] data-closed:zoom-out-[0.98] ease-out duration-200"
      onEscapeKeydown={(e) => { if (isDirty && !isBusy) { e.preventDefault(); confirmDiscardOpen = true } }}
      onFocusOutside={(e) => {
        // Never let focus leaving the content dismiss the modal. Starting a native
        // window drag/resize from the titlebar makes the webview lose focus, which
        // bits-ui treats as focus-outside and closes the dialog. The modal is only
        // meant to close via ×, Escape, or a genuine outside pointer interaction
        // (handled below) - not because the OS took focus for a window drag.
        e.preventDefault()
      }}
      onInteractOutside={(e) => {
        // Nothing outside the content dismisses this dialog. It is inset to leave
        // the titlebar and status bar usable, so "outside" is window chrome:
        // dragging the window to move or resize it, or a stray click on the tab
        // bar, would otherwise throw away a half-filled connection form. Closing
        // is deliberate only - the × button, Escape, or a successful connect.
        e.preventDefault()
      }}
    >
    <DialogPrimitive.Title class="sr-only">Connections</DialogPrimitive.Title>
    <div
      class="grid h-full w-full min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden"
      style="grid-template-columns: {railOpen ? railWidth : 44}px minmax(0, 1fr)"
    >

      <!-- ── Sidebar ─────────────────────────────────────────────── -->
      {#if !railOpen}
        <aside class="flex min-h-0 flex-col items-center border-r border-border/15 bg-muted/[0.015] pt-2.5">
          <button
            type="button"
            onclick={() => { railOpen = true; saveRail() }}
            title="Show connections (⌘B)"
            aria-label="Show connections"
            class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground/45 transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <Icon name="chevrons-right" class="size-4" />
          </button>
        </aside>
      {:else}
      <aside class="relative flex min-h-0 flex-col overflow-hidden border-r border-border/15 bg-muted/[0.015]">

        <!-- Title -->
        <div class="flex h-[52px] shrink-0 items-center gap-2 px-4">
          <h2 class="text-ui-sm font-semibold text-foreground">Connections</h2>
          {#if saved.length > 0}
            <span class="rounded-full bg-muted/60 px-1.5 py-px text-ui-3xs font-medium tabular-nums text-muted-foreground/70">{saved.length}</span>
          {/if}
          <button
            type="button"
            onclick={() => { railOpen = false; saveRail() }}
            title="Hide connections (⌘B)"
            aria-label="Hide connections"
            class="ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/45 transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <Icon name="chevrons-left" class="size-4" />
          </button>
        </div>

        <!-- New connection button -->
        <div class="shrink-0 border-t border-border/15 px-2 pb-2 pt-2">
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

        <div class="min-h-0 flex-1 border-t border-border/15 pt-1">
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
                      class="relative flex size-6 shrink-0 items-center justify-center rounded-md disabled:opacity-30"
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
                        {connSubtitle(conn, cid)}
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
        <!-- Drag the rail wider when connection names are long. -->
        <div class="absolute inset-y-0 right-0 z-20 w-1">
          <ResizeHandle
            axis="x"
            edge="end"
            onresizestart={() => (railDragStart = railWidth)}
            onresize={(dx) => (railWidth = Math.min(RAIL_MAX, Math.max(RAIL_MIN, railDragStart + dx)))}
            onresizeend={saveRail}
          />
        </div>
      </aside>
      {/if}

      <!-- ── Form panel ──────────────────────────────────────────── -->
      <div class="relative flex min-h-0 min-w-0 flex-col">
        <!-- ── Header ──────────────────────────────────────────────────────
             One question per screen. Step 1 asks only what you're connecting to;
             the title becomes that choice in step 2, with the back arrow as the
             way to change it - so there is never a form on screen for a database
             nobody has picked yet. -->
        <div class="shrink-0 px-8 pt-6">
          {#if step === 'pick'}
            <h2 class="text-ui-lg font-semibold tracking-tight text-foreground">Connect a database</h2>
            <p class="mt-1 text-ui-xs text-muted-foreground">Choose what you're connecting to.</p>
          {:else}
            <div class="flex items-center gap-3">
              <button
                type="button"
                onclick={backToPick}
                title="Choose a different database"
                class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <Icon name="chevron-left" class="size-4" />
              </button>
              <DbIcon id={activeDriver.id} class={cn('size-5 shrink-0', engineTint(activeDriver.id))} />
              <div class="min-w-0">
                <h2 class="truncate text-ui-lg font-semibold tracking-tight text-foreground">
                  {editingId ? name || activeDriver.label : activeDriver.label}
                </h2>
                <p class="mt-0.5 truncate text-ui-xs text-muted-foreground">{activeDriver.desc}</p>
              </div>
            </div>
          {/if}
        </div>

        <!-- ── Step 1 · what are we connecting to ─────────────────────────
             A grid of marks, grouped the way the drivers are grouped. Names only:
             blurbs turned this into a wall of prose to read before the first
             decision, and the mark is what people actually recognise. -->
        {#if step === 'pick'}
          <!-- Search sits outside the scroller: it is how you get to an engine
               without reading six groups, so it must never scroll away. -->
          <div class="shrink-0 px-8 pt-4">
            <div class="relative max-w-[720px]">
              <Icon name="search" class="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/40" />
              <Input
                bind:ref={engineSearchEl}
                bind:value={engineQuery}
                placeholder="Search databases and local studios…"
                aria-label="Search databases"
                class="pl-9 pr-8"
                onkeydown={(e) => {
                  if (e.key !== 'Enter' || !firstEngineMatch) return
                  e.preventDefault()
                  pickEngine(firstEngineMatch.id)
                }}
              />
              {#if engineQuery}
                <button
                  type="button"
                  onclick={() => { engineQuery = ''; engineSearchEl?.focus() }}
                  aria-label="Clear search"
                  class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground/40 transition-colors hover:text-foreground"
                ><Icon name="x" class="size-3" /></button>
              {/if}
            </div>
          </div>
          <ScrollArea type="auto" class="min-h-0 flex-1 scroll-smooth">
            <div class="flex flex-col gap-5 px-8 py-5">
              <!-- ── Studios running on this machine ────────────────────────
                   A running `prisma studio` / `drizzle-kit studio` already knows
                   its database, so this offers it directly - one click, no
                   connection string, nothing saved afterwards. -->
              {#if localPhase !== 'idle' && (localMatches.length > 0 || !engineQuery)}
                <div class="flex flex-col gap-4">
                  {#if localGroups.length === 0}
                    <div>
                      <p class="flex items-center gap-1.5 text-ui-3xs font-medium uppercase tracking-wider text-muted-foreground/40">
                        {@render liveDot()}
                        Running on this machine
                      </p>
                      <p class="mt-2 text-ui-2xs leading-relaxed text-muted-foreground/45">
                        {localPhase === 'scanning'
                          ? 'Looking for local studios, installed servers and database containers…'
                          : 'Nothing running locally. Start a Prisma or Drizzle studio, or a database container, and it shows up here ready to open.'}
                      </p>
                    </div>
                  {/if}
                  {#each localGroups as group, i (group.key)}
                    {@render localGroup(group.label, group.targets, i === 0)}
                  {/each}
                </div>
              {/if}

              {#snippet liveDot()}
                <span class="relative flex size-1.5 shrink-0">
                  <span class="absolute inline-flex size-full animate-ping rounded-full bg-success/60"></span>
                  <span class="relative inline-flex size-1.5 rounded-full bg-success"></span>
                </span>
              {/snippet}

              {#snippet localGroup(/** @type {string} */ label, /** @type {LocalTarget[]} */ targets, /** @type {boolean} */ lead = false)}
                <div>
                  <p class="flex items-center gap-1.5 text-ui-3xs font-medium uppercase tracking-wider text-muted-foreground/40">
                    {#if lead}{@render liveDot()}{/if}
                    {label}
                    <span class="font-mono text-muted-foreground/30">{targets.length}</span>
                    {#if lead}
                      {#if localPhase === 'scanning'}
                        <Icon name="loader-2" class="size-3 animate-spin text-muted-foreground/35" />
                      {:else}
                        <button
                          type="button"
                          title="Scan again (⌘R)"
                          aria-label="Scan again for local databases"
                          onclick={() => void refreshLocal()}
                          class="-my-1 inline-flex size-6 items-center justify-center rounded text-muted-foreground/35 transition-colors hover:bg-muted/50 hover:text-foreground"
                        ><Icon name="refresh-cw" class="size-3" /></button>
                      {/if}
                    {/if}
                  </p>
                  <div class="mt-2 grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-2">
                    {#each targets as t, i (t.id)}
                      {@const busy = connecting === t.id}
                      <button
                        type="button"
                        disabled={!t.conn || !!connecting}
                        title={t.hint}
                        onclick={() => void connectLocal(t)}
                        style="animation-delay: {Math.min(i, 8) * 35}ms"
                        class={cn(
                          'cn-stagger-in group flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-[color,background-color,border-color,transform] duration-150 ease-out',
                          t.conn
                            ? 'border-border/50 text-foreground/90 hover:border-border hover:bg-muted/40 hover:text-foreground active:scale-[0.98] disabled:opacity-60'
                            : 'cursor-not-allowed border-border/30 text-muted-foreground/40',
                        )}
                      >
                        {#if busy}
                          <Icon name="loader-2" class="size-4 shrink-0 animate-spin" />
                        {:else}
                          <DbIcon id={t.mark} class={cn('size-4 shrink-0', t.conn ? engineTint(t.mark) : 'opacity-30 grayscale')} />
                        {/if}
                        <span class="min-w-0 flex-1">
                          <span class="block truncate text-ui-sm font-medium">{t.title}</span>
                          <span class="mt-0.5 block truncate font-mono text-ui-2xs leading-tight text-muted-foreground/50">{t.subtitle}</span>
                        </span>
                        {#if t.trailingMark}
                          <span class="flex size-5 shrink-0 items-center justify-center rounded border border-border/40 bg-muted/40">
                            <DbIcon id={t.trailingMark} class={cn('size-3', engineTint(t.trailingMark))} />
                          </span>
                        {/if}
                      </button>
                    {/each}
                  </div>
                </div>
              {/snippet}

              {#each engineMatches as cat (cat.label)}
                <div>
                  <p class="text-ui-3xs font-semibold uppercase tracking-wider text-muted-foreground/45">
                    {cat.label}
                  </p>
                  <!-- Columns come from the window, not a fixed count: a card
                       never goes below 230px (which is what turned "PostgreSQL"
                       into "PostgreS…"), and on a wide window each group
                       collapses to one row instead of leaving half the dialog
                       empty. -->
                  <div class="mt-2 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2">
                    {#each cat.drivers as d (d.id)}
                      {@const off = DISABLED_TABS.has(d.id)}
                      <button
                        type="button"
                        disabled={off}
                        title={off ? `${d.label} — coming soon` : d.desc}
                        onclick={() => pickEngine(d.id)}
                        class={cn(
                          'group flex h-9 items-center gap-2 rounded-md border px-2.5 text-left transition-[color,background-color,border-color,transform] duration-150 ease-out',
                          off
                            ? 'cursor-not-allowed border-border/30 text-muted-foreground/30'
                            : 'border-border/50 text-foreground/90 hover:border-border hover:bg-muted/40 hover:text-foreground active:scale-[0.98]',
                        )}
                      >
                        <DbIcon
                          id={d.id}
                          class={cn(
                            'size-4 shrink-0 transition-opacity',
                            off ? 'opacity-30 grayscale' : engineTint(d.id),
                          )}
                        />
                        <span class="min-w-0 flex-1 truncate text-ui-sm font-medium">{d.label}</span>
                        {#if off}
                          <span class="shrink-0 rounded bg-muted/50 px-1 py-px text-ui-3xs font-medium text-muted-foreground/50">soon</span>
                        {/if}
                      </button>
                    {/each}
                  </div>
                </div>
              {/each}

              {#if dockerTargets.length > 0}
                {@render localGroup('Docker', dockerTargets, false)}
              {/if}

              {#if engineQuery && engineMatches.length === 0 && localMatches.length === 0}
                <div class="py-10 text-center">
                  <p class="text-ui-sm text-muted-foreground">No database matches “{engineQuery}”.</p>
                  <button
                    type="button"
                    onclick={() => { engineQuery = ''; engineSearchEl?.focus() }}
                    class="mt-1 text-ui-xs text-muted-foreground/60 underline-offset-2 transition-colors hover:text-foreground hover:underline"
                  >Clear search</button>
                </div>
              {/if}
            </div>
          </ScrollArea>

        <!-- ── Step 2 · details for the chosen database ── -->
        {:else}
        <ScrollArea type="auto" class="min-h-0 flex-1 scroll-smooth">
          <div class="flex items-start gap-10 px-8 py-6">
            <!-- Enter connects, from any field - filling a form and having to go
                 find the button is the one interaction nobody expects here. The
                 paste bar's own Enter handler runs first and marks the event
                 handled, so pasting a URI still just fills the fields. -->
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div
              class="min-w-0 flex-1 max-w-[880px]"
              onkeydown={(e) => {
                if (e.key !== 'Enter' || e.defaultPrevented || isBusy) return
                if (!(e.target instanceof HTMLInputElement)) return
                e.preventDefault()
                void handleConnect()
              }}
              role="group"
            >

              {#if entryMode === 'manual'}

                <!-- Manual form, core connection fields, then a full-width Advanced
                     section at the bottom. -->
                <div class="flex min-w-0 flex-col gap-5">

                <!-- The engine came from step 1, so there is no picker here -
                     the header's back arrow is how you change it.

                     Name and the connection string share the first row. Both
                     labels are single-line so they sit on one baseline: the
                     Fields/URI switch used to ride in the right-hand label and
                     pushed that label down a few pixels, which is the kind of
                     misalignment you feel without being able to name. -->
                <div class={cn(row6, 'gap-y-4')}>
                  <div class="col-span-6 lg:col-span-3">
                    <label for="cn-name" class={lbl}>
                      Name
                      <span class="font-normal text-muted-foreground/45">· optional</span>
                    </label>
                    <Input id="cn-name" bind:value={name} class={inp} placeholder={autoName} />
                  </div>

                  {#if hasFieldToggle}
                    <!-- A URI-only mode was redundant once this field fills the
                         ones below: paste here and everything downstream is
                         populated, so there is nothing a separate view added. -->
                    <div class="col-span-6 min-w-0 lg:col-span-3">
                      <label for="cn-paste-uri" class={lbl}>
                        Connection string
                        <span class="font-normal text-muted-foreground/45">· fills the fields below</span>
                      </label>
                      <div class="flex gap-2">
                        <Input
                          id="cn-paste-uri"
                          bind:value={connectionUri}
                          placeholder="postgresql://…"
                          class={cn(inp, 'min-w-0 flex-1 font-mono text-ui-2xs')}
                          onpaste={() => requestAnimationFrame(applyConnectionUri)}
                          onblur={() => connectionUri.trim() && applyConnectionUri()}
                          onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), applyConnectionUri())}
                        />
                        <button
                          type="button"
                          onclick={pasteConnectionUri}
                          title="Paste from clipboard"
                          aria-label="Paste from clipboard"
                          class="inline-flex size-8 shrink-0 items-center justify-center rounded-md border-2 border-foreground/15 bg-muted/20 text-muted-foreground/70 transition-[color,border-color] hover:border-foreground/40 hover:text-foreground"
                        >
                          <Icon name="clipboard-copy" class="size-3.5" />
                        </button>
                      </div>
                      {#if uriHint}
                        <p class="mt-1.5 flex items-center gap-1 text-ui-2xs">
                          {#if uriHint.includes('Could') || uriHint.includes('Expected') || uriHint.includes("doesn't") || uriHint.includes('empty')}
                            <Icon name="alert-circle" class="size-3 shrink-0 text-destructive" />
                            <span class="text-destructive">{uriHint}</span>
                          {:else}
                            <Icon name="check-circle-2" class="size-3 shrink-0 text-success" />
                            <span class="text-success">{uriHint}</span>
                          {/if}
                        </p>
                      {/if}
                    </div>
                  {/if}
                </div>

                <!-- Driver-specific fields -->
                {#key dbType}
                <div class="flex flex-col gap-3.5">

            <!-- ── PostgreSQL / CockroachDB ────────────────── -->
            {#if dbType === 'postgres' || dbType === 'cockroachdb'}

              <!-- Host, port and database are one address, so they share a row -
              and the Host+Port pair spans exactly the three columns Name spans
              above it, so the two rows break on the same line. -->
              <div class={row6}>
                <div class="col-span-3 sm:col-span-2">
                  <label for="cn-host" class={lbl}>Host</label>
                  <Input id="cn-host" bind:value={host} class={cn(inp, flashedFields.has('host') && flashCls)} />
                </div>
                <div class="col-span-3 sm:col-span-1">
                  <label for="cn-port" class={lbl}>Port</label>
                  <Input id="cn-port" bind:value={port} type="text" inputmode="numeric" class={cn(inpNum, flashedFields.has('port') && flashCls)} />
                </div>
                <div class="col-span-6 sm:col-span-3">
                  <label for="cn-db" class={lbl}>Database</label>
                  <Input id="cn-db" bind:value={database} class={cn(inp, flashedFields.has('database') && flashCls)} />
                </div>
              </div>

              <div class={row6}>
                <div class="col-span-6 sm:col-span-3">
                  <label for="cn-user" class={lbl}>Username</label>
                  <Input id="cn-user" bind:value={user} autocomplete="username" class={cn(inp, flashedFields.has('user') && flashCls)} />
                </div>
                <div class="col-span-6 sm:col-span-3">
                  <label for="cn-pass" class={lbl}>Password</label>
                  <Input id="cn-pass" bind:value={password} type="password" autocomplete="current-password" class={cn(inp, flashedFields.has('password') && flashCls)} />
                </div>
              </div>

            <!-- ── MySQL / MariaDB ──────────────────────── -->
            {:else if dbType === 'mysql' || dbType === 'mariadb'}

              <div class={row6}>
                <div class="col-span-3 sm:col-span-2">
                  <label for="cn-mysql-host" class={lbl}>Host</label>
                  <Input id="cn-mysql-host" bind:value={host} class={cn(inp, flashedFields.has('host') && flashCls)} />
                </div>
                <div class="col-span-3 sm:col-span-1">
                  <label for="cn-mysql-port" class={lbl}>Port</label>
                  <Input id="cn-mysql-port" bind:value={port} type="text" inputmode="numeric" class={cn(inpNum, flashedFields.has('port') && flashCls)} />
                </div>
                <div class="col-span-6 sm:col-span-3">
                  <label for="cn-mysql-db" class={lbl}>Database</label>
                  <Input id="cn-mysql-db" bind:value={database} class={cn(inp, flashedFields.has('database') && flashCls)} />
                </div>
              </div>

              <div class={row6}>
                <div class="col-span-6 sm:col-span-3">
                  <label for="cn-mysql-user" class={lbl}>Username</label>
                  <Input id="cn-mysql-user" bind:value={user} autocomplete="username" class={cn(inp, flashedFields.has('user') && flashCls)} />
                </div>
                <div class="col-span-6 sm:col-span-3">
                  <label for="cn-mysql-pass" class={lbl}>Password</label>
                  <Input id="cn-mysql-pass" bind:value={password} type="password" autocomplete="current-password" class={cn(inp, flashedFields.has('password') && flashCls)} />
                </div>
              </div>

            <!-- ── SQLite ────────────────────────────────── -->
            {:else if dbType === 'sqlite'}

              <!-- Local file vs remote SQLite (Turso / libSQL). Remote reuses the
                   dedicated libsql driver + backend by switching dbType. -->
              <div class="flex gap-0.5 rounded-md border border-border/25 bg-muted/30 p-0.5 text-ui-2xs">
                <button type="button" class="flex-1 rounded bg-background px-2 py-1 font-medium text-foreground">Local file</button>
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
                  Data lives only for this session. Nothing is written to disk, closing the connection discards everything.
                </p>
              </div>

            <!-- ── LibSQL / Turso ─────────────────────────── -->
            {:else if dbType === 'libsql'}

              <div class="flex gap-0.5 rounded-md border border-border/25 bg-muted/30 p-0.5 text-ui-2xs">
                <button type="button" onclick={() => (dbType = 'sqlite')}
                  class="flex-1 rounded px-2 py-1 text-muted-foreground/60 transition-colors hover:text-foreground">Local file</button>
                <button type="button" class="flex-1 rounded bg-background px-2 py-1 font-medium text-foreground">Remote (Turso / libSQL)</button>
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
                  A columnar analytical database that lives only for this session. Nothing is written to disk, closing the connection discards everything.
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

                <!-- Advanced, full-width section at the bottom -->
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
                        resolveSavedConnection={(dbName) => {
                          const hit = saved.find(
                            (s) => s.provider === dbType && s.password && (s.database === dbName || s.name?.endsWith(dbName)),
                          )
                          return hit
                            ? { host: hit.host ?? '', user: hit.user ?? '', password: hit.password ?? '', database: hit.database ?? dbName }
                            : undefined
                        }}
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
                        initialAccountId={accountId}
                        initialDatabaseId={databaseId}
                        initialDatabaseName={editingId ? name : ''}
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
        {/if}

        <!-- ── Footer: inline error alert, status chip, then actions ── -->
        <div class="shrink-0 border-t border-border/15 px-8 py-4">
          <div class="mx-auto max-w-none">

            <!-- The alert itself is a toast (see failWith). What stays here is the
                 one-line record of it, so the driver's own words are still
                 readable after the toast has gone - without a panel that shoves
                 the form upward every time a connection fails. -->

            <div class="flex items-center gap-3">
              <!-- Status chip + subtle target preview. Step 1 has no target yet,
                   so it shows nothing rather than "Ready" for a database nobody
                   has chosen. -->
              <div class="flex min-w-0 flex-1 items-center gap-2 text-ui-2xs">
                {#if step === 'pick'}
                  <span class="text-ui-2xs text-muted-foreground/40">
                    {saved.length === 0 ? 'Everything stays on this machine' : railOpen ? 'Or pick a saved connection on the left' : 'Saved connections are hidden — reopen them from the top left'}
                  </span>
                {:else if connecting}
                  <span class="flex shrink-0 items-center gap-1.5 font-medium text-muted-foreground/70"><Icon name="loader-2" class="size-3 animate-spin" />Connecting…</span>
                {:else if testing}
                  <span class="flex shrink-0 items-center gap-1.5 font-medium text-muted-foreground/70"><Icon name="loader-2" class="size-3 animate-spin" />Testing…</span>
                {:else if error}
                  <span class="flex shrink-0 items-center gap-1.5 font-medium text-destructive"><span class="size-1.5 rounded-full bg-destructive"></span>Failed</span>
                  <span
                    class="min-w-0 flex-1 truncate font-mono text-ui-3xs text-muted-foreground/50 select-text"
                    title={error}
                    data-studio-selectable="text">{error}</span
                  >
                {:else if testOk}
                  <span class="flex shrink-0 items-center gap-1.5 font-medium text-success"><span class="size-1.5 rounded-full bg-success"></span>Connection OK</span>
                {:else if isDirty}
                  <span class="flex shrink-0 items-center gap-1.5 font-medium text-warning"><span class="size-1.5 rounded-full bg-warning"></span>Unsaved</span>
                {:else}
                  <span class="flex shrink-0 items-center gap-1.5 text-muted-foreground/50"><span class="size-1.5 rounded-full bg-muted-foreground/30"></span>Ready</span>
                {/if}
                {#if step !== 'pick' && !error}
                  <span class="min-w-0 truncate font-mono text-ui-3xs text-muted-foreground/40" title={statusTarget}>{statusTarget}</span>
                {/if}
              </div>

              <!-- Actions, shared Button variants (Resume ghost · Stop soft-destructive
                   · Test outline · Connect solid primary), one system app-wide. -->
              <div class="ml-auto flex shrink-0 items-center gap-2">
                <!-- Ending the live session belongs next to resuming it: both act
                     on the current connection rather than on the form. -->
                {#if activeConnectionName}
                  <Button
                    variant="ghost"
                    class="max-w-[220px] text-muted-foreground hover:text-destructive"
                    disabled={isBusy}
                    title="Disconnect {activeConnectionName}"
                    onclick={() => { open = false; ondisconnect() }}
                  >
                    <Icon name="unplug" class="size-3.5" />Disconnect
                  </Button>
                {/if}
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
                <!-- Test / Save / Connect belong to a chosen database. On step 1
                     the only action that makes sense is resuming the last one. -->
                {#if step === 'form'}
                {#if canTest}
                  <Button variant="outline" disabled={isBusy} onclick={handleTest}>
                    {#if testing}<Icon name="loader-2" class="size-3.5 animate-spin" />Testing…{:else}Test{/if}
                  </Button>
                {/if}
                <!-- Save only: persists the form and leaves the active session
                     alone. Paired with the solid Connect button beside it. -->
                <Button variant="outline" disabled={isBusy} onclick={handleSave}>
                  {#if justSaved}<Icon name="check" class="size-3.5 text-success" />Saved{:else}Save{/if}
                </Button>
                <Button
                  class={cn('px-5', connecting === (editingId ?? '__new__') && 'disabled:opacity-90')}
                  disabled={isBusy}
                  title="Connect (↵)"
                  onclick={handleConnect}
                >
                  {#if connecting === (editingId ?? '__new__')}
                    <Icon name="loader-2" class="size-3.5 animate-spin" />Connecting…
                  {:else}
                    {editingId ? 'Save & connect' : 'Connect'}
                  {/if}
                </Button>
                {/if}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Close button, routes through the unsaved-changes guard -->
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
      <div class="absolute inset-0 z-[60] flex items-center justify-center bg-black/65 p-6">
        <div class="w-full max-w-sm rounded-[10px] border border-border/40 bg-background p-5 elevate-3-rim">
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
     rows, buttons, status) can't be drag-selected, while real field VALUES stay
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

  /* Decorative entrance for saved / provider rows - fades + rises in.
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
