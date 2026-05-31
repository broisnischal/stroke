<script>
  import { untrack } from 'svelte'
  import X         from '@lucide/svelte/icons/x'
  import Clock     from '@lucide/svelte/icons/clock'
  import Loader    from '@lucide/svelte/icons/loader'
  import Plus      from '@lucide/svelte/icons/plus'
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2'
  import AlertCircle  from '@lucide/svelte/icons/alert-circle'
  import Link2        from '@lucide/svelte/icons/link-2'
  import Trash2       from '@lucide/svelte/icons/trash-2'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import {
    testPostgresConnection, connectPostgres,
    testSqliteConnection,   connectSqlite,
    testMysqlConnection,    connectMysql,
    testD1Connection,       connectD1,
    testLibSqlConnection,   connectLibSql,
  } from '$lib/api.js'
  import {
    loadSavedConnections, upsertConnection, removeConnection,
    newConnectionId, getLastConnectionId, setLastConnectionId,
  } from '$lib/stores/connections.js'
  import { Input }      from '$lib/components/ui/input/index.js'
  import { Label }      from '$lib/components/ui/label/index.js'
  import { Checkbox }   from '$lib/components/ui/checkbox/index.js'
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js'
  import * as Dialog    from '$lib/components/ui/dialog/index.js'
  import { cn }         from '$lib/utils.js'
  import { parseConnectionUri } from '$lib/connection-uri.js'

  let {
    open = $bindable(false),
    /** @param {import('$lib/stores/connections.js').SavedConnection} conn @param {string} id */
    onconnected = (conn, id) => {},
  } = $props()

  // ── Driver catalogue ──────────────────────────────────────────────────────────
  const CATEGORIES = [
    {
      label: 'Relational',
      drivers: [
        { id: 'postgres', label: 'PostgreSQL', desc: 'Open-source relational DB', color: '#3b82f6', emoji: '🐘' },
        { id: 'mysql',    label: 'MySQL',      desc: 'Popular relational DB',     color: '#f97316', emoji: '🐬' },
      ],
    },
    {
      label: 'SQLite Family',
      drivers: [
        { id: 'sqlite',        label: 'SQLite',         desc: 'Local file database',         color: '#22c55e', emoji: '📁' },
        { id: 'sqlite-memory', label: 'In-Memory',      desc: 'Temporary in-memory DB',      color: '#10b981', emoji: '⚡' },
        { id: 'libsql',        label: 'Turso / LibSQL', desc: 'Serverless SQLite edge DB',   color: '#a855f7', emoji: '🌐' },
      ],
    },
    {
      label: 'Cloud & Edge',
      drivers: [
        { id: 'd1',       label: 'Cloudflare D1',  desc: 'Edge SQLite via REST API', color: '#f59e0b', emoji: '☁️' },
        { id: 'bigquery', label: 'BigQuery',        desc: 'Google analytics warehouse', color: '#4285f4', emoji: '🔵', soon: true },
      ],
    },
  ]

  const ALL_DRIVERS = CATEGORIES.flatMap(c => c.drivers)

  function driverById(id) { return ALL_DRIVERS.find(d => d.id === id) ?? ALL_DRIVERS[0] }

  // ── State ─────────────────────────────────────────────────────────────────────
  /** @type {import('$lib/stores/connections.js').SavedConnection[]} */
  let saved      = $state(loadSavedConnections().sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0)))
  let lastId     = $state(getLastConnectionId())
  /** @type {string|null} */
  let editingId  = $state(null)
  let connecting = $state(/** @type {string|null} */ (null))
  let testing    = $state(false)
  let error      = $state('')
  let testOk     = $state(false)
  let showSaved  = $state(true)

  let dbType     = $state('postgres')
  let name       = $state('Local PostgreSQL')
  let host       = $state('127.0.0.1')
  let port       = $state('5432')
  let database   = $state('postgres')
  let user       = $state('postgres')
  let password   = $state('')
  let ssl        = $state(false)
  let filePath   = $state('')
  let accountId  = $state('')
  let databaseId = $state('')
  let apiToken   = $state('')
  let libsqlUrl  = $state('')
  let libsqlToken = $state('')
  let connectionUri = $state('')
  let uriHint      = $state('')

  const DEFAULTS = {
    postgres:       { name: 'Local PostgreSQL', host: '127.0.0.1', port: '5432', database: 'postgres', user: 'postgres' },
    mysql:          { name: 'Local MySQL',       host: '127.0.0.1', port: '3306', database: 'mysql',    user: 'root' },
    sqlite:         { name: 'Local SQLite',      filePath: '' },
    'sqlite-memory':{ name: 'In-Memory SQLite',  filePath: ':memory:' },
    libsql:         { name: 'My Turso DB',       libsqlUrl: '', libsqlToken: '' },
    d1:             { name: 'Cloudflare D1',     accountId: '', databaseId: '', apiToken: '' },
  }

  function formPayload() {
    if (dbType === 'sqlite' || dbType === 'sqlite-memory') {
      const fp = dbType === 'sqlite-memory' ? ':memory:' : filePath
      return { type: 'sqlite', name, filePath: fp }
    }
    if (dbType === 'libsql') return { type: 'libsql', name, url: libsqlUrl, authToken: libsqlToken || undefined }
    if (dbType === 'd1')     return { type: 'd1', name, accountId, databaseId, apiToken }
    if (dbType === 'mysql')  return { type: 'mysql', name, host, port, database, user, password, ssl }
    return { type: 'postgres', name, host, port, database, user, password, ssl }
  }

  function resetForm(conn) {
    editingId = conn?.id ?? null
    if (conn) {
      const t = conn.type === 'sqlite' && conn.filePath === ':memory:' ? 'sqlite-memory' : (conn.type ?? 'postgres')
      dbType     = t
      name       = conn.name ?? ''
      host       = conn.host ?? '127.0.0.1'
      port       = String(conn.port ?? 5432)
      database   = conn.database ?? 'postgres'
      user       = conn.user ?? 'postgres'
      password   = conn.password ?? ''
      ssl        = Boolean(conn.ssl)
      filePath   = conn.filePath ?? ''
      accountId  = conn.accountId ?? ''
      databaseId = conn.databaseId ?? ''
      apiToken   = conn.apiToken ?? ''
      libsqlUrl  = conn.url ?? ''
      libsqlToken = conn.authToken ?? ''
    } else {
      const d = DEFAULTS.postgres
      dbType = 'postgres'; name = d.name; host = d.host; port = d.port
      database = d.database; user = d.user; password = ''; ssl = false
      filePath = ''; accountId = ''; databaseId = ''; apiToken = ''
      libsqlUrl = ''; libsqlToken = ''
    }
    error = ''; testOk = false; connectionUri = ''; uriHint = ''
  }

  function switchDriver(id) {
    dbType = id
    const d = DEFAULTS[id] ?? DEFAULTS.postgres
    if ([...Object.values(DEFAULTS).map(v => v.name)].includes(name)) name = d.name
    if (id === 'postgres') port = '5432'
    if (id === 'mysql')    port = '3306'
    if (id === 'sqlite-memory') filePath = ':memory:'
    error = ''; testOk = false; connectionUri = ''; uriHint = ''
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
    if (conn.type === 'd1')     return `${conn.accountId?.slice(0,8) ?? ''}…`
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
      showSaved = saved.length > 0
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
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    showCloseButton={false}
    class="flex max-h-[min(90vh,800px)] w-[min(900px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border border-border/60 bg-background p-0 shadow-2xl sm:max-w-[900px]"
  >
    <div class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[260px_minmax(0,1fr)]">

      <!-- ── Left sidebar ─────────────────────────────────────────────────── -->
      <aside class="flex min-h-0 flex-col border-b border-border/50 bg-muted/[0.03] md:border-b-0 md:border-r md:border-border/50">

        <!-- Header -->
        <div class="shrink-0 px-4 py-4">
          <h2 class="text-sm font-semibold tracking-tight text-foreground">Connect</h2>
          <p class="mt-0.5 text-[11px] text-muted-foreground/60">Select or add a database connection</p>
        </div>

        <ScrollArea class="min-h-0 flex-1 px-2 pb-2">
          <!-- New connection button -->
          <button
            type="button"
            class={cn(
              "mb-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-colors",
              !editingId
                ? "bg-accent ring-1 ring-border/40 text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
            onclick={() => resetForm(null)}
          >
            <div class={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-lg border transition-colors",
              !editingId ? "border-border/60 bg-background/60" : "border-dashed border-border/50"
            )}>
              <Plus class="size-3.5" />
            </div>
            New connection
          </button>

          <!-- Saved connections -->
          {#if saved.length > 0}
            <div class="mb-1 flex items-center gap-1.5 px-2 pt-2 pb-1">
              <span class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">Recent</span>
              <span class="rounded-full bg-muted px-1 font-mono text-[9px] text-muted-foreground/50">{saved.length}</span>
            </div>
            <div class="flex flex-col gap-0.5">
              {#each saved as conn (conn.id)}
                {@const d = driverById(conn.type === 'sqlite' && conn.filePath === ':memory:' ? 'sqlite-memory' : conn.type)}
                {@const isSelected = conn.id === editingId}
                {@const isBusy2 = connecting === conn.id}
                <div
                  class={cn(
                    "group relative flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 transition-colors",
                    isSelected ? "bg-accent ring-1 ring-border/40" : "hover:bg-accent/50"
                  )}
                  role="button" tabindex="0"
                  onclick={() => resetForm(conn)}
                  onkeydown={(e) => e.key === 'Enter' && resetForm(conn)}
                >
                  <div class="flex size-7 shrink-0 items-center justify-center rounded-lg text-[14px]"
                    style="background:{d.color}15; box-shadow: inset 0 0 0 1px {d.color}30"
                  >{d.emoji}</div>

                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                      <span class="min-w-0 truncate text-[12px] font-medium leading-snug text-foreground">{conn.name}</span>
                      {#if conn.id === lastId}
                        <span class="shrink-0 rounded-full px-1.5 py-px text-[8px] font-bold uppercase tracking-wider" style="background:{d.color}25;color:{d.color}">last</span>
                      {/if}
                    </div>
                    <p class="mt-px truncate font-mono text-[10px] text-muted-foreground/50">{connDetail(conn)}</p>
                    <div class="mt-0.5 flex h-4 items-center">
                      <span class="text-[10px] text-muted-foreground/35 group-hover:hidden">{relativeTime(conn.lastConnectedAt)}</span>
                      <div class="hidden items-center gap-1 group-hover:flex">
                        <button type="button"
                          class="inline-flex h-5 items-center rounded-md px-2 text-[10px] font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                          style="background:{d.color}"
                          disabled={!!connecting}
                          onclick={(e) => { e.stopPropagation(); void connectWith(conn) }}
                        >
                          {#if isBusy2}<Loader class="size-2.5 animate-spin" />{:else}Connect{/if}
                        </button>
                        <button type="button"
                          class="inline-flex size-5 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:text-destructive"
                          onclick={(e) => { e.stopPropagation(); handleDelete(conn.id) }}
                        ><Trash2 class="size-3" /></button>
                      </div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="mx-2 my-1 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/40 px-4 py-8 text-center">
              <Clock class="size-5 text-muted-foreground/25" />
              <p class="text-[11px] text-muted-foreground/50">No saved connections yet</p>
            </div>
          {/if}
        </ScrollArea>
      </aside>

      <!-- ── Right: form ─────────────────────────────────────────────────── -->
      <div class="flex min-h-0 min-w-0 flex-col">
        <ScrollArea class="min-h-0 flex-1">
          <div class="flex flex-col gap-5 px-6 py-5">

            <!-- DB type picker — categories -->
            <div class="flex flex-col gap-3">
              {#each CATEGORIES as cat}
                <div>
                  <p class="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">{cat.label}</p>
                  <div class="grid gap-2" style="grid-template-columns: repeat(auto-fill, minmax(110px, 1fr))">
                    {#each cat.drivers as d (d.id)}
                      {@const active = dbType === d.id}
                      <button
                        type="button"
                        class={cn(
                          "relative flex flex-col gap-1.5 rounded-xl border px-3 py-3 text-left transition-all",
                          d.soon ? "cursor-not-allowed opacity-40" : "cursor-pointer",
                          active
                            ? "border-border/70 bg-card shadow-sm"
                            : "border-transparent bg-muted/25 hover:bg-muted/50 hover:border-border/30"
                        )}
                        onclick={() => !d.soon && switchDriver(d.id)}
                        disabled={d.soon}
                      >
                        {#if active}
                          <span class="absolute inset-x-3 bottom-0 h-[2px] rounded-full" style="background:{d.color}"></span>
                        {/if}
                        <span class="text-lg leading-none">{d.emoji}</span>
                        <div>
                          <div class="flex items-center gap-1">
                            <span class={cn("text-[11px] font-semibold leading-tight", active ? "text-foreground" : "text-foreground/70")}>{d.label}</span>
                            {#if d.soon}
                              <span class="rounded bg-muted px-1 text-[8px] font-bold uppercase tracking-wide text-muted-foreground/60">soon</span>
                            {/if}
                          </div>
                          <p class="mt-0.5 text-[9px] leading-tight text-muted-foreground/50">{d.desc}</p>
                        </div>
                      </button>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>

            <!-- Connection name -->
            <div class="flex flex-col gap-1.5">
              <Label for="cn-name" class="text-xs font-medium text-foreground/80">Connection name</Label>
              <Input id="cn-name" bind:value={name} class="h-9 bg-muted/30 text-sm focus-visible:bg-background" />
            </div>

            <!-- ── PostgreSQL ── -->
            {#if dbType === 'postgres'}
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center gap-1.5">
                  <Link2 class="size-3 text-muted-foreground/50" />
                  <Label for="cn-uri" class="text-xs font-medium text-muted-foreground/70">
                    Connection string <span class="font-normal opacity-60">(optional)</span>
                  </Label>
                </div>
                <div class="flex gap-2">
                  <Input id="cn-uri" bind:value={connectionUri}
                    placeholder="postgresql://user:pass@host:5432/db"
                    class="h-9 flex-1 bg-muted/30 font-mono text-xs focus-visible:bg-background"
                    onpaste={() => requestAnimationFrame(applyConnectionUri)}
                    onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), applyConnectionUri())}
                  />
                  <button type="button" class="h-9 shrink-0 rounded-md border border-border/50 bg-muted/30 px-3 text-xs text-muted-foreground transition-colors hover:bg-muted/60 disabled:opacity-40" onclick={applyConnectionUri} disabled={!connectionUri.trim()}>Parse</button>
                </div>
                {#if uriHint}
                  <p class={cn("flex items-center gap-1 text-[11px]", uriHint.includes('Could') || uriHint.includes('Expected') ? 'text-destructive' : 'text-emerald-500')}>
                    {#if uriHint.includes('Could') || uriHint.includes('Expected')}<AlertCircle class="size-3 shrink-0" />{:else}<CheckCircle2 class="size-3 shrink-0" />{/if}
                    {uriHint}
                  </p>
                {/if}
              </div>
              <div class="flex items-center gap-2">
                <div class="h-px flex-1 bg-border/30"></div>
                <span class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/35">or fill manually</span>
                <div class="h-px flex-1 bg-border/30"></div>
              </div>
              <div class="grid grid-cols-[1fr_90px] gap-2">
                <div class="flex flex-col gap-1.5"><Label for="cn-host" class="text-xs font-medium text-foreground/75">Host</Label><Input id="cn-host" bind:value={host} class="h-9 bg-muted/30 text-sm focus-visible:bg-background" /></div>
                <div class="flex flex-col gap-1.5"><Label for="cn-port" class="text-xs font-medium text-foreground/75">Port</Label><Input id="cn-port" type="number" bind:value={port} class="h-9 bg-muted/30 text-sm focus-visible:bg-background" /></div>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div class="flex flex-col gap-1.5"><Label for="cn-db" class="text-xs font-medium text-foreground/75">Database</Label><Input id="cn-db" bind:value={database} class="h-9 bg-muted/30 text-sm focus-visible:bg-background" /></div>
                <div class="flex flex-col gap-1.5"><Label for="cn-user" class="text-xs font-medium text-foreground/75">User</Label><Input id="cn-user" bind:value={user} autocomplete="username" class="h-9 bg-muted/30 text-sm focus-visible:bg-background" /></div>
                <div class="flex flex-col gap-1.5"><Label for="cn-pass" class="text-xs font-medium text-foreground/75">Password</Label><Input id="cn-pass" type="password" bind:value={password} autocomplete="current-password" class="h-9 bg-muted/30 text-sm focus-visible:bg-background" /></div>
              </div>
              <label class="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/40 bg-muted/15 px-3 py-2.5 transition-colors hover:bg-muted/30">
                <Checkbox id="cn-ssl" checked={ssl} onCheckedChange={(v) => (ssl = v === true)} />
                <div>
                  <p class="text-xs font-medium text-foreground/75">Use SSL / TLS</p>
                  <p class="text-[11px] text-muted-foreground/55">Enables sslmode=require for encrypted connections</p>
                </div>
              </label>

            <!-- ── MySQL ── -->
            {:else if dbType === 'mysql'}
              <div class="grid grid-cols-[1fr_90px] gap-2">
                <div class="flex flex-col gap-1.5"><Label for="cn-mysql-host" class="text-xs font-medium text-foreground/75">Host</Label><Input id="cn-mysql-host" bind:value={host} class="h-9 bg-muted/30 text-sm focus-visible:bg-background" /></div>
                <div class="flex flex-col gap-1.5"><Label for="cn-mysql-port" class="text-xs font-medium text-foreground/75">Port</Label><Input id="cn-mysql-port" type="number" bind:value={port} class="h-9 bg-muted/30 text-sm focus-visible:bg-background" /></div>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div class="flex flex-col gap-1.5"><Label for="cn-mysql-db" class="text-xs font-medium text-foreground/75">Database</Label><Input id="cn-mysql-db" bind:value={database} class="h-9 bg-muted/30 text-sm focus-visible:bg-background" /></div>
                <div class="flex flex-col gap-1.5"><Label for="cn-mysql-user" class="text-xs font-medium text-foreground/75">User</Label><Input id="cn-mysql-user" bind:value={user} autocomplete="username" class="h-9 bg-muted/30 text-sm focus-visible:bg-background" /></div>
                <div class="flex flex-col gap-1.5"><Label for="cn-mysql-pass" class="text-xs font-medium text-foreground/75">Password</Label><Input id="cn-mysql-pass" type="password" bind:value={password} autocomplete="current-password" class="h-9 bg-muted/30 text-sm focus-visible:bg-background" /></div>
              </div>
              <label class="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/40 bg-muted/15 px-3 py-2.5 transition-colors hover:bg-muted/30">
                <Checkbox id="cn-mysql-ssl" checked={ssl} onCheckedChange={(v) => (ssl = v === true)} />
                <div><p class="text-xs font-medium text-foreground/75">Use SSL / TLS</p><p class="text-[11px] text-muted-foreground/55">Enables ssl-mode=required for encrypted connections</p></div>
              </label>

            <!-- ── SQLite file ── -->
            {:else if dbType === 'sqlite'}
              <div class="flex flex-col gap-1.5">
                <Label for="cn-path" class="text-xs font-medium text-foreground/75">File path</Label>
                <Input id="cn-path" bind:value={filePath} placeholder="/path/to/database.db" class="h-9 bg-muted/30 font-mono text-sm focus-visible:bg-background" />
                <p class="text-[11px] text-muted-foreground/50">Absolute path to the <code class="rounded bg-muted px-1 font-mono text-[10px]">.db</code> or <code class="rounded bg-muted px-1 font-mono text-[10px]">.sqlite</code> file.</p>
              </div>

            <!-- ── SQLite in-memory ── -->
            {:else if dbType === 'sqlite-memory'}
              <div class="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-3">
                <p class="text-[11px] leading-relaxed text-emerald-600/80 dark:text-emerald-400/80">
                  An in-memory SQLite database — data exists only for this session. Perfect for testing SQL or quick exploration.
                  No file is created on disk.
                </p>
              </div>

            <!-- ── LibSQL / Turso ── -->
            {:else if dbType === 'libsql'}
              <div class="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] px-4 py-3">
                <p class="text-[11px] leading-relaxed text-purple-600/80 dark:text-purple-400/80">
                  Connect to a <strong>Turso</strong> cloud database or any self-hosted <strong>libsql-server</strong>.
                  Find your database URL and auth token in the Turso dashboard.
                </p>
              </div>
              <div class="flex flex-col gap-1.5">
                <Label for="cn-libsql-url" class="text-xs font-medium text-foreground/75">Database URL</Label>
                <Input id="cn-libsql-url" bind:value={libsqlUrl}
                  placeholder="libsql://your-db-name.turso.io"
                  class="h-9 bg-muted/30 font-mono text-xs focus-visible:bg-background"
                />
                <p class="text-[11px] text-muted-foreground/50">Format: <code class="font-mono text-[10px]">libsql://…</code> · <code class="font-mono text-[10px]">https://…</code> · <code class="font-mono text-[10px]">http://localhost:PORT</code></p>
              </div>
              <div class="flex flex-col gap-1.5">
                <Label for="cn-libsql-token" class="text-xs font-medium text-foreground/75">
                  Auth Token <span class="font-normal opacity-60">(optional for local servers)</span>
                </Label>
                <Input id="cn-libsql-token" type="password" bind:value={libsqlToken}
                  placeholder="eyJhbGciOiJFZERTQSJ9…"
                  class="h-9 bg-muted/30 font-mono text-xs focus-visible:bg-background"
                />
              </div>

            <!-- ── Cloudflare D1 ── -->
            {:else if dbType === 'd1'}
              <div class="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
                <p class="text-[11px] leading-relaxed text-amber-600/80 dark:text-amber-400/80">
                  Connect to a Cloudflare D1 database via REST API. Find your credentials in the
                  <strong>Cloudflare Dashboard → Workers & Pages → D1</strong>.
                </p>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1.5"><Label for="cn-acct" class="text-xs font-medium text-foreground/75">Account ID</Label><Input id="cn-acct" bind:value={accountId} placeholder="abcdef1234…" class="h-9 bg-muted/30 font-mono text-xs focus-visible:bg-background" /></div>
                <div class="flex flex-col gap-1.5"><Label for="cn-dbid" class="text-xs font-medium text-foreground/75">Database ID</Label><Input id="cn-dbid" bind:value={databaseId} placeholder="xxxxxxxx-xxxx-…" class="h-9 bg-muted/30 font-mono text-xs focus-visible:bg-background" /></div>
              </div>
              <div class="flex flex-col gap-1.5">
                <Label for="cn-tok" class="text-xs font-medium text-foreground/75">API Token</Label>
                <Input id="cn-tok" type="password" bind:value={apiToken} placeholder="Cloudflare API token (D1:Edit)" class="h-9 bg-muted/30 text-sm focus-visible:bg-background" />
              </div>
            {/if}

          </div>
        </ScrollArea>

        <!-- ── Footer ──────────────────────────────────────────────────── -->
        <div class="shrink-0 border-t border-border/50 bg-muted/[0.02] px-6 py-4">

          {#if error}
            <div class="mb-3 flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/[0.06] px-3.5 py-2.5">
              <AlertCircle class="mt-px size-3.5 shrink-0 text-destructive/70" />
              <p class="text-[11px] leading-relaxed text-destructive/90">{error}</p>
            </div>
          {/if}
          {#if testOk && !error}
            <div class="mb-3 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3.5 py-2.5">
              <CheckCircle2 class="size-3.5 shrink-0 text-emerald-500" />
              <p class="text-[11px] text-emerald-600 dark:text-emerald-400">Connection successful</p>
            </div>
          {/if}

          <div class="flex items-center justify-between gap-3">
            <div>
              {#if editingId}
                <button type="button" class="text-[11px] text-muted-foreground/50 transition-colors hover:text-muted-foreground" onclick={() => resetForm(null)}>
                  Clear form
                </button>
              {/if}
            </div>
            <div class="flex items-center gap-2">
              {#if canTest}
                <button type="button"
                  class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-3.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 disabled:opacity-40"
                  onclick={handleTest} disabled={isBusy}
                >
                  {#if testing}<Loader class="size-3 animate-spin" />Testing…{:else}Test connection{/if}
                </button>
              {/if}
              <button type="button"
                class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                onclick={handleConnect} disabled={isBusy || dbType === 'bigquery'}
              >
                {#if connecting === (editingId ?? '__new__')}<Loader class="size-3 animate-spin" />Connecting…{:else}{editingId ? 'Save & connect' : 'Connect'}{/if}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Close button -->
    <Dialog.Close class="absolute right-3.5 top-3.5 inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <X class="size-4" />
    </Dialog.Close>
  </Dialog.Content>
</Dialog.Root>
