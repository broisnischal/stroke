<script>
  import { untrack } from 'svelte'
  import X            from '@lucide/svelte/icons/x'
  import Clock        from '@lucide/svelte/icons/clock'
  import Loader2      from '@lucide/svelte/icons/loader-2'
  import Plus         from '@lucide/svelte/icons/plus'
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2'
  import AlertCircle  from '@lucide/svelte/icons/alert-circle'
  import Trash2       from '@lucide/svelte/icons/trash-2'
  import Database     from '@lucide/svelte/icons/database'
  import HardDrive    from '@lucide/svelte/icons/hard-drive'
  import Zap          from '@lucide/svelte/icons/zap'
  import Globe        from '@lucide/svelte/icons/globe'
  import Cloud        from '@lucide/svelte/icons/cloud'
  import BarChart2    from '@lucide/svelte/icons/bar-chart-2'
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
  import * as Select    from '$lib/components/ui/select/index.js'
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
        { id: 'sqlite-memory', label: 'In-Memory SQLite', desc: 'Ephemeral, nothing on disk' },
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
  let name        = $state('Local PostgreSQL')
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

  function formPayload() {
    if (dbType === 'sqlite' || dbType === 'sqlite-memory')
      return { type: 'sqlite', name, filePath: dbType === 'sqlite-memory' ? ':memory:' : filePath }
    if (dbType === 'libsql') return { type: 'libsql', name, url: libsqlUrl, authToken: libsqlToken || undefined }
    if (dbType === 'd1')     return { type: 'd1', name, accountId, databaseId, apiToken }
    if (dbType === 'mysql')  return { type: 'mysql', name, host, port, database, user, password, ssl }
    return { type: 'postgres', name, host, port, database, user, password, ssl }
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
    } else {
      dbType = 'postgres'; name = 'Local PostgreSQL'; host = '127.0.0.1'; port = '5432'
      database = 'postgres'; user = 'postgres'; password = ''; ssl = false
      filePath = ''; accountId = ''; databaseId = ''; apiToken = ''
      libsqlUrl = ''; libsqlToken = ''
    }
    error = ''; testOk = false; connectionUri = ''; uriHint = ''
    d1Reset()
  }

  function switchDriver(id) {
    dbType = id
    const d = DEFAULTS[id] ?? DEFAULTS.postgres
    if (Object.values(DEFAULTS).map(v => v.name).includes(name)) name = d.name
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

  const lbl = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/50'
  const inp = 'h-8 w-full border-border/25 bg-muted/[0.4] text-sm placeholder:text-muted-foreground/30 focus-visible:border-border/50 focus-visible:ring-0'
  const divider = 'border-t border-border/25 my-0.5'
</script>

<!-- Driver icon, monochrome -->
{#snippet dicon(id, cls = 'size-4')}
  {#if id === 'postgres'}           <Database  class="{cls} shrink-0 text-muted-foreground" />
  {:else if id === 'mysql'}         <Database  class="{cls} shrink-0 text-muted-foreground" />
  {:else if id === 'sqlite'}        <HardDrive class="{cls} shrink-0 text-muted-foreground" />
  {:else if id === 'sqlite-memory'} <Zap       class="{cls} shrink-0 text-muted-foreground" />
  {:else if id === 'libsql'}        <Globe     class="{cls} shrink-0 text-muted-foreground" />
  {:else if id === 'd1'}            <Cloud     class="{cls} shrink-0 text-muted-foreground" />
  {:else}                           <BarChart2 class="{cls} shrink-0 text-muted-foreground" />{/if}
{/snippet}

<Dialog.Root bind:open>
  <Dialog.Content
    showCloseButton={false}
    class="flex h-[min(90vh,800px)] w-[min(920px,calc(100vw-2rem))] max-w-none sm:max-w-none flex-col gap-0 overflow-hidden rounded-2xl border border-border/40 bg-background p-0 shadow-2xl shadow-black/50"
  >
    <div class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[200px_minmax(0,1fr)]">

      <!-- ══════════════ LEFT sidebar ══════════════════════════════ -->
      <aside class="flex min-h-0 flex-col border-b border-border/30 md:border-b-0 md:border-r">

        <div class="shrink-0 px-4 py-4">
          <p class="text-[15px] font-semibold tracking-tight text-foreground">Connect</p>
          <p class="mt-0.5 text-[11px] text-muted-foreground/50">Select or add a connection</p>
        </div>

        <ScrollArea class="min-h-0 flex-1 px-1.5 pb-3">

          <!-- New connection -->
          <button
            type="button"
            class={cn(
              "mb-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors",
              !editingId
                ? "bg-muted/60 text-foreground"
                : "text-muted-foreground/70 hover:bg-muted/30 hover:text-foreground"
            )}
            onclick={() => resetForm(null)}
          >
            <Plus class="size-3.5 shrink-0 opacity-60" />
            New connection
          </button>

          {#if saved.length > 0}
            <p class="px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/30">
              Recent
            </p>
            {#each saved as conn (conn.id)}
              {@const isSel  = conn.id === editingId}
              {@const busy2  = connecting === conn.id}
              {@const cid    = conn.type === 'sqlite' && conn.filePath === ':memory:' ? 'sqlite-memory' : conn.type}
              <div
                class={cn(
                  "group flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 transition-colors",
                  isSel ? "bg-muted/60" : "hover:bg-muted/30"
                )}
                role="button" tabindex="0"
                onclick={() => resetForm(conn)}
                onkeydown={(e) => e.key === 'Enter' && resetForm(conn)}
              >
                {@render dicon(cid, 'size-3.5')}

                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <p class="min-w-0 truncate text-[13px] font-medium leading-none text-foreground">{conn.name}</p>
                    {#if conn.id === lastId}
                      <span class="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/30">last</span>
                    {/if}
                  </div>
                  <p class="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/40">{connDetail(conn)}</p>
                </div>

                <div class="hidden shrink-0 items-center gap-1 group-hover:flex">
                  <button type="button"
                    class="rounded-md bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                    disabled={!!connecting}
                    onclick={(e) => { e.stopPropagation(); void connectWith(conn) }}
                  >
                    {#if busy2}<Loader2 class="size-2.5 animate-spin inline" />{:else}Connect{/if}
                  </button>
                  <button type="button"
                    class="rounded-md p-0.5 text-muted-foreground/25 transition-colors hover:text-destructive"
                    onclick={(e) => { e.stopPropagation(); handleDelete(conn.id) }}
                  ><Trash2 class="size-3" /></button>
                </div>
              </div>
            {/each}

          {:else}
            <div class="mx-1 mt-2 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/20 px-3 py-8 text-center">
              <Clock class="size-4 text-muted-foreground/20" />
              <p class="text-[11px] text-muted-foreground/30">No saved connections</p>
            </div>
          {/if}
        </ScrollArea>
      </aside>

      <!-- ══════════════ RIGHT form ════════════════════════════════ -->
      <div class="flex min-h-0 min-w-0 flex-col">
        <ScrollArea class="min-h-0 flex-1">
          <div class="flex flex-col gap-5 px-7 py-6">

            <!-- Database type -->
            <div>
              <label class={lbl}>Database type</label>
              <Select.Root
                type="single"
                value={dbType}
                onValueChange={(v) => v && switchDriver(v)}
              >
                <Select.Trigger class="h-9 w-full border-border/25 bg-muted/[0.4] text-sm hover:border-border/40 hover:bg-muted/50 focus:border-border/50 focus:ring-0">
                  <div class="flex items-center gap-2">
                    {@render dicon(dbType, 'size-[14px]')}
                    <span class="text-foreground">{activeDriver.label}</span>
                  </div>
                </Select.Trigger>
                <Select.Content class="w-[var(--bits-select-anchor-width)] min-w-[var(--bits-select-anchor-width)] rounded-xl p-1.5">
                  {#each CATEGORIES as cat, i}
                    {#if i > 0}<Select.Separator class="my-1 opacity-40" />{/if}
                    <Select.Group>
                      <Select.GroupHeading class="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/40">
                        {cat.label}
                      </Select.GroupHeading>
                      {#each cat.drivers as d (d.id)}
                        <Select.Item value={d.id} label={d.label} disabled={!!d.soon} class="rounded-lg py-1.5">
                          <div class="flex items-center gap-2.5 pl-0.5">
                            {@render dicon(d.id, 'size-[14px]')}
                            <div class="min-w-0 flex-1">
                              <p class="text-[13px] leading-none">{d.label}</p>
                              <p class="mt-0.5 text-[11px] text-muted-foreground/60">{d.desc}</p>
                            </div>
                            {#if d.soon}
                              <span class="mr-5 rounded border border-border px-1.5 py-px text-[9px] uppercase tracking-wide text-muted-foreground/40">Soon</span>
                            {/if}
                          </div>
                        </Select.Item>
                      {/each}
                    </Select.Group>
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>

            <!-- Connection name -->
            <div>
              <label for="cn-name" class={lbl}>Connection name</label>
              <Input id="cn-name" bind:value={name} class="h-9 w-full border-border/20 bg-transparent text-[15px] font-medium placeholder:text-muted-foreground/20 focus-visible:border-border/40 focus-visible:ring-0" />
            </div>

            <!-- ════ PostgreSQL ════════════════════════════════════ -->
            {#if dbType === 'postgres'}

              <div class={divider}></div>

              <!-- Connection string -->
              <div>
                <label for="cn-uri" class={lbl}>Connection string <span class="font-normal normal-case opacity-60">(optional)</span></label>
                <div class="flex gap-2">
                  <Input id="cn-uri" bind:value={connectionUri}
                    placeholder="postgresql://user:pass@host:5432/db"
                    class="h-8 flex-1 border-border/25 bg-muted/[0.4] font-mono text-xs placeholder:text-muted-foreground/30 focus-visible:border-border/50 focus-visible:ring-0"
                    onpaste={() => requestAnimationFrame(applyConnectionUri)}
                    onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), applyConnectionUri())}
                  />
                  <button type="button"
                    class="h-8 shrink-0 rounded-lg bg-muted/40 px-3.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:opacity-40"
                    onclick={applyConnectionUri} disabled={!connectionUri.trim()}>Parse</button>
                </div>
                {#if uriHint}
                  <p class={cn("mt-1.5 flex items-center gap-1.5 text-xs",
                    uriHint.includes('Could') || uriHint.includes('Expected') ? 'text-destructive' : 'text-emerald-500')}>
                    {#if uriHint.includes('Could') || uriHint.includes('Expected')}
                      <AlertCircle class="size-3 shrink-0" />
                    {:else}
                      <CheckCircle2 class="size-3 shrink-0" />
                    {/if}
                    {uriHint}
                  </p>
                {/if}
              </div>

              <div class={divider}></div>

              <!-- Host + Port -->
              <div class="grid grid-cols-[1fr_80px] gap-3">
                <div>
                  <label for="cn-host" class={lbl}>Host</label>
                  <Input id="cn-host" bind:value={host} class={inp} />
                </div>
                <div>
                  <label for="cn-port" class={lbl}>Port</label>
                  <Input id="cn-port" bind:value={port} type="number" class={inp} />
                </div>
              </div>

              <!-- Database / User / Password -->
              <div>
                <label for="cn-db" class={lbl}>Database</label>
                <Input id="cn-db" bind:value={database} class={inp} />
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label for="cn-user" class={lbl}>Username</label>
                  <Input id="cn-user" bind:value={user} autocomplete="username" class={inp} />
                </div>
                <div>
                  <label for="cn-pass" class={lbl}>Password</label>
                  <Input id="cn-pass" bind:value={password} type="password" autocomplete="current-password" class={inp} />
                </div>
              </div>

              <div class={divider}></div>

              <!-- SSL -->
              <label class="flex cursor-pointer select-none items-center gap-3 rounded-xl border border-border/20 bg-muted/[0.15] px-4 py-3 transition-colors hover:bg-muted/30">
                <Checkbox id="cn-ssl" checked={ssl} onCheckedChange={(v) => (ssl = v === true)} />
                <div>
                  <p class="text-sm font-medium text-foreground">Use SSL / TLS</p>
                  <p class="text-[11px] text-muted-foreground/60">Require an encrypted connection</p>
                </div>
              </label>

            <!-- ════ MySQL ══════════════════════════════════════════ -->
            {:else if dbType === 'mysql'}

              <div class={divider}></div>

              <div class="grid grid-cols-[1fr_80px] gap-3">
                <div>
                  <label for="cn-mysql-host" class={lbl}>Host</label>
                  <Input id="cn-mysql-host" bind:value={host} class={inp} />
                </div>
                <div>
                  <label for="cn-mysql-port" class={lbl}>Port</label>
                  <Input id="cn-mysql-port" bind:value={port} type="number" class={inp} />
                </div>
              </div>

              <div>
                <label for="cn-mysql-db" class={lbl}>Database</label>
                <Input id="cn-mysql-db" bind:value={database} class={inp} />
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label for="cn-mysql-user" class={lbl}>Username</label>
                  <Input id="cn-mysql-user" bind:value={user} autocomplete="username" class={inp} />
                </div>
                <div>
                  <label for="cn-mysql-pass" class={lbl}>Password</label>
                  <Input id="cn-mysql-pass" bind:value={password} type="password" autocomplete="current-password" class={inp} />
                </div>
              </div>

              <div class={divider}></div>

              <label class="flex cursor-pointer select-none items-center gap-3 rounded-xl border border-border/20 bg-muted/[0.15] px-4 py-3 transition-colors hover:bg-muted/30">
                <Checkbox id="cn-mysql-ssl" checked={ssl} onCheckedChange={(v) => (ssl = v === true)} />
                <div>
                  <p class="text-sm font-medium text-foreground">Use SSL / TLS</p>
                  <p class="text-[11px] text-muted-foreground/60">Require an encrypted connection</p>
                </div>
              </label>

            <!-- ════ SQLite ══════════════════════════════════════════ -->
            {:else if dbType === 'sqlite'}

              <div class={divider}></div>

              <div>
                <label for="cn-path" class={lbl}>File path</label>
                <Input id="cn-path" bind:value={filePath}
                  placeholder="/path/to/database.db"
                  class="h-8 w-full border-border/25 bg-muted/[0.4] font-mono text-sm placeholder:text-muted-foreground/30 focus-visible:border-border/50 focus-visible:ring-0" />
                <p class="mt-1.5 text-[11px] text-muted-foreground/40">
                  Absolute path to a <code class="font-mono">.db</code> or <code class="font-mono">.sqlite</code> file
                </p>
              </div>

            <!-- ════ In-Memory ══════════════════════════════════════ -->
            {:else if dbType === 'sqlite-memory'}

              <div class={divider}></div>

              <div class="rounded-xl border border-border/20 bg-muted/[0.15] px-4 py-3.5">
                <p class="text-sm font-medium text-foreground">Ephemeral in-memory database</p>
                <p class="mt-1 text-[12px] leading-relaxed text-muted-foreground/60">
                  Data exists only while this session is open. Nothing is written to disk —
                  ideal for testing SQL queries or quick exploration.
                </p>
              </div>

            <!-- ════ LibSQL / Turso ════════════════════════════════ -->
            {:else if dbType === 'libsql'}

              <div class={divider}></div>

              <div>
                <label for="cn-libsql-url" class={lbl}>Database URL</label>
                <Input id="cn-libsql-url" bind:value={libsqlUrl}
                  placeholder="libsql://your-db.turso.io"
                  class="h-8 w-full border-border/25 bg-muted/[0.4] font-mono text-sm placeholder:text-muted-foreground/30 focus-visible:border-border/50 focus-visible:ring-0" />
                <p class="mt-1.5 text-[11px] text-muted-foreground/40">
                  Accepts <code class="font-mono">libsql://</code>, <code class="font-mono">https://</code>, or <code class="font-mono">http://localhost:PORT</code>
                </p>
              </div>

              <div>
                <label for="cn-libsql-token" class={lbl}>
                  Auth token <span class="font-normal normal-case opacity-60">(optional for local servers)</span>
                </label>
                <Input id="cn-libsql-token" bind:value={libsqlToken} type="password"
                  placeholder="eyJhbGciOiJFZERTQSJ9…"
                  class="h-8 w-full border-border/25 bg-muted/[0.4] font-mono text-sm placeholder:text-muted-foreground/30 focus-visible:border-border/50 focus-visible:ring-0" />
              </div>

            <!-- ════ Cloudflare D1 ═════════════════════════════════ -->
            {:else if dbType === 'd1'}

              <div class={divider}></div>

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
                <summary class="cursor-pointer list-none select-none text-xs text-muted-foreground/30 transition-colors hover:text-muted-foreground">
                  <span class="group-open:hidden">↓ Use an API token manually</span>
                  <span class="hidden group-open:inline">↑ Use an API token manually</span>
                </summary>
                <div class="mt-3 flex flex-col gap-3">
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class={lbl}>Account ID</label>
                      <Input bind:value={accountId} placeholder="abcdef1234…" class="h-8 w-full border-border/25 bg-muted/[0.4] font-mono text-xs placeholder:text-muted-foreground/30 focus-visible:border-border/50 focus-visible:ring-0" />
                    </div>
                    <div>
                      <label class={lbl}>Database ID</label>
                      <Input bind:value={databaseId} placeholder="xxxxxxxx-xxxx-…" class="h-8 w-full border-border/25 bg-muted/[0.4] font-mono text-xs placeholder:text-muted-foreground/30 focus-visible:border-border/50 focus-visible:ring-0" />
                    </div>
                  </div>
                  <div>
                    <label class={lbl}>API token</label>
                    <Input bind:value={apiToken} type="password"
                      placeholder="Cloudflare API token with D1:Edit" class={inp} />
                  </div>
                </div>
              </details>

            {/if}

          </div>
        </ScrollArea>

        <!-- ════ Footer ════════════════════════════════════════════ -->
        <div class="shrink-0 border-t border-border/25 bg-muted/[0.02]">

          {#if error}
            <div class="flex items-start gap-2.5 border-b border-border/25 px-5 py-3">
              <AlertCircle class="mt-px size-3.5 shrink-0 text-destructive" />
              <p class="text-xs leading-relaxed text-destructive">{error}</p>
            </div>
          {/if}

          {#if testOk && !error}
            <div class="flex items-center gap-2.5 border-b border-border/25 px-5 py-3">
              <CheckCircle2 class="size-3.5 shrink-0 text-emerald-500" />
              <p class="text-xs text-emerald-500">Connection successful</p>
            </div>
          {/if}

          <div class="flex items-center justify-between px-5 py-3">
            <div>
              {#if editingId}
                <button type="button"
                  class="text-xs text-muted-foreground/30 transition-colors hover:text-muted-foreground"
                  onclick={() => resetForm(null)}>Clear form</button>
              {/if}
            </div>
            <div class="flex items-center gap-2">
              {#if canTest}
                <button type="button"
                  class="inline-flex h-8 items-center gap-1.5 rounded-lg px-4 text-sm text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-40"
                  onclick={handleTest} disabled={isBusy}
                >
                  {#if testing}<Loader2 class="size-3.5 animate-spin" />Testing…{:else}Test connection{/if}
                </button>
              {/if}
              <button type="button"
                class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-foreground/85 disabled:opacity-50"
                onclick={handleConnect} disabled={isBusy || dbType === 'bigquery'}
              >
                {#if connecting === (editingId ?? '__new__')}
                  <Loader2 class="size-3.5 animate-spin" />Connecting…
                {:else}
                  {editingId ? 'Save & connect' : 'Connect'}
                {/if}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Dialog.Close class="absolute right-4 top-4 inline-flex size-6 items-center justify-center rounded-lg text-muted-foreground/30 transition-colors hover:bg-muted/50 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
      <X class="size-3.5" />
    </Dialog.Close>
  </Dialog.Content>
</Dialog.Root>
