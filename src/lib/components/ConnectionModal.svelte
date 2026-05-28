<script>
  import { untrack } from 'svelte'
  import Database  from '@lucide/svelte/icons/database'
  import HardDrive from '@lucide/svelte/icons/hard-drive'
  import Cloud     from '@lucide/svelte/icons/cloud'
  import X         from '@lucide/svelte/icons/x'
  import Clock     from '@lucide/svelte/icons/clock'
  import Loader    from '@lucide/svelte/icons/loader'
  import Plus      from '@lucide/svelte/icons/plus'
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2'
  import AlertCircle  from '@lucide/svelte/icons/alert-circle'
  import Link2        from '@lucide/svelte/icons/link-2'
  import {
    testPostgresConnection, connectPostgres,
    testSqliteConnection,   connectSqlite,
    testMysqlConnection,    connectMysql,
    testD1Connection,       connectD1,
  } from '$lib/api.js'
  import {
    loadSavedConnections,
    upsertConnection,
    removeConnection,
    newConnectionId,
    getLastConnectionId,
    setLastConnectionId,
  } from '$lib/stores/connections.js'
  import { Button }     from '$lib/components/ui/button/index.js'
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

  const DRIVERS = [
    { id: 'postgres', label: 'PostgreSQL',    icon: Database,  color: '#3b82f6' },
    { id: 'mysql',    label: 'MySQL',         icon: Database,  color: '#f97316' },
    { id: 'sqlite',   label: 'SQLite',        icon: HardDrive, color: '#22c55e' },
    { id: 'd1',       label: 'D1',            icon: Cloud,     color: '#f59e0b' },
  ]

  /** @type {import('$lib/stores/connections.js').SavedConnection[]} */
  let saved      = $state(loadSavedConnections().sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0)))
  let lastId     = $state(getLastConnectionId())
  /** @type {string|null} */
  let editingId  = $state(null)
  let connecting = $state(/** @type {string|null} */ (null))
  let testing    = $state(false)
  let error      = $state('')
  let testOk     = $state(false)

  /** @type {'postgres'|'mysql'|'sqlite'|'d1'} */
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
  let connectionUri = $state('')
  let uriHint      = $state('')

  function defaultName(t) {
    if (t === 'sqlite') return 'Local SQLite'
    if (t === 'd1')     return 'Cloudflare D1'
    if (t === 'mysql')  return 'Local MySQL'
    return 'Local PostgreSQL'
  }

  function formPayload() {
    if (dbType === 'sqlite') return { type: 'sqlite', name, filePath }
    if (dbType === 'd1')     return { type: 'd1', name, accountId, databaseId, apiToken }
    if (dbType === 'mysql')  return { type: 'mysql', name, host, port: port || '3306', database, user, password, ssl }
    return { type: 'postgres', name, host, port, database, user, password, ssl }
  }

  /** @param {import('$lib/stores/connections.js').SavedConnection|null} conn */
  function resetForm(conn) {
    editingId = conn?.id ?? null
    if (conn) {
      dbType     = conn.type ?? 'postgres'
      name       = conn.name ?? defaultName(dbType)
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
    } else {
      dbType = 'postgres'; name = 'Local PostgreSQL'; host = '127.0.0.1'
      port = '5432'; database = 'postgres'; user = 'postgres'
      password = ''; ssl = false; filePath = ''
      accountId = ''; databaseId = ''; apiToken = ''
    }
    port = port || defaultPortForType(dbType)
    error = ''; testOk = false; connectionUri = ''; uriHint = ''
  }

  function applyConnectionUri() {
    uriHint = ''
    const parsed = parseConnectionUri(dbType === 'sqlite' ? 'sqlite' : 'postgres', connectionUri)
    if (!parsed) return
    if ('error' in parsed) {
      uriHint = parsed.error
      return
    }
    if (dbType === 'sqlite' && 'filePath' in parsed) {
      filePath = parsed.filePath
      uriHint = 'Fields updated from URI'
      return
    }
    if ('host' in parsed) {
      host = parsed.host
      port = parsed.port
      database = parsed.database
      user = parsed.user
      password = parsed.password
      ssl = parsed.ssl
      uriHint = 'Fields updated from URI'
    }
  }

  function handleUriPaste() {
    requestAnimationFrame(() => applyConnectionUri())
  }

  function uriHintIsError(hint) {
    return hint.includes('Could') || hint.includes('Expected') || hint.includes('missing')
  }

  function driver(t) { return DRIVERS.find(d => d.id === (t ?? 'postgres')) ?? DRIVERS[0] }

  function connDetail(conn) {
    if (conn.type === 'sqlite') return conn.filePath || '—'
    if (conn.type === 'd1')     return `${conn.accountId?.slice(0,8) ?? ''}…`
    return `${conn.host ?? ''}/${conn.database ?? ''}`
  }

  function defaultPortForType(t) {
    return t === 'mysql' ? '3306' : '5432'
  }

  function relativeTime(ts) {
    if (!ts) return ''
    const s = (Date.now() - ts) / 1000
    if (s < 60)      return 'just now'
    if (s < 3600)    return `${Math.floor(s / 60)}m ago`
    if (s < 86400)   return `${Math.floor(s / 3600)}h ago`
    if (s < 604800)  return `${Math.floor(s / 86400)}d ago`
    return new Date(ts).toLocaleDateString()
  }

  $effect(() => {
    if (!open) return
    untrack(() => {
      const list = loadSavedConnections().sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
      saved  = list
      lastId = getLastConnectionId()
      resetForm(null)
    })
  })

  function handleDelete(id) {
    saved = removeConnection(id).sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
    if (id === lastId) { lastId = null; setLastConnectionId(null) }
    if (editingId === id) resetForm(null)
  }

  /** @param {import('$lib/stores/connections.js').SavedConnection} conn */
  function selectSaved(conn) {
    resetForm(conn)
  }

  async function connectWith(conn) {
    connecting = conn.id; error = ''
    try {
      if (conn.type === 'sqlite') await connectSqlite(conn)
      else if (conn.type === 'd1') await connectD1(conn)
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
      else if (payload.type === 'mysql') await connectMysql(payload)
      else await connectPostgres(payload)

      const existing = editingId
        ? saved.find((s) => s.id === editingId)
        : saved.find((s) => {
            if (s.type !== payload.type) return false
            if (payload.type === 'sqlite') return s.filePath === payload.filePath
            if (payload.type === 'd1') return s.databaseId === payload.databaseId && s.accountId === payload.accountId
            if (payload.type === 'mysql') return s.host === payload.host && s.port === payload.port && s.database === payload.database
            return s.host === payload.host && s.database === payload.database
          })
      const id = existing?.id ?? newConnectionId()
      const saved_conn = {
        id,
        ...payload,
        port: (payload.type === 'postgres' || payload.type === 'mysql') ? (Number(payload.port) || (payload.type === 'mysql' ? 3306 : 5432)) : undefined,
        lastConnectedAt: Date.now(),
      }
      saved = upsertConnection(saved_conn).sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
      setLastConnectionId(id)
      open = false
      await onconnected(saved_conn, id)
    } catch (e) { error = String(e) }
    finally { connecting = null }
  }

  function switchDriver(id) {
    const AUTO = ['Local PostgreSQL', 'Local MySQL', 'Local SQLite', 'Cloudflare D1']
    if (AUTO.includes(name)) name = defaultName(id)
    dbType = id
    port = defaultPortForType(id)
    connectionUri = ''
    uriHint = ''
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    showCloseButton={false}
    class="flex max-h-[min(88vh,780px)] w-[min(860px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border border-border/60 bg-background p-0 shadow-2xl sm:max-w-[860px]"
  >
    <div class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[240px_minmax(0,1fr)]">

      <!-- ── Left: saved connections ──────────────────────────────────────── -->
      <aside class="flex min-h-0 flex-col border-b border-border/50 bg-muted/[0.03] md:border-b-0 md:border-r md:border-border/50">

        <!-- Header -->
        <div class="shrink-0 px-4 pt-5 pb-4">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold tracking-tight text-foreground">Connections</h2>
            {#if saved.length > 0}
              <span class="flex h-4.5 min-w-[1.125rem] items-center justify-center rounded-full bg-muted px-1 font-mono text-[10px] text-muted-foreground">{saved.length}</span>
            {/if}
          </div>
          <p class="mt-0.5 text-[11px] leading-tight text-muted-foreground/70">Recent and saved databases</p>
        </div>

        <ScrollArea class="min-h-0 flex-1 px-2 pb-2">
          {#if saved.length === 0}
            <div class="mx-2 my-1 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/50 px-4 py-7 text-center">
              <div class="flex size-9 items-center justify-center rounded-full bg-muted">
                <Clock class="size-4 text-muted-foreground/50" />
              </div>
              <div>
                <p class="text-xs font-medium text-foreground/70">No saved connections</p>
                <p class="mt-0.5 text-[11px] text-muted-foreground/50">Create one on the right →</p>
              </div>
            </div>
          {:else}
            <div class="flex flex-col gap-0.5">
              {#each saved as conn (conn.id)}
                {@const d = driver(conn.type)}
                {@const Icon = d.icon}
                {@const isSelected = conn.id === editingId}
                {@const isBusy = connecting === conn.id}
                {@const isLast = conn.id === lastId}
                <div
                  class={cn(
                    "group relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                    isSelected
                      ? "bg-accent ring-1 ring-border/40"
                      : "hover:bg-accent/60"
                  )}
                  role="button"
                  tabindex="0"
                  onclick={() => selectSaved(conn)}
                  onkeydown={(e) => e.key === 'Enter' && selectSaved(conn)}
                >
                  <!-- DB icon tile -->
                  <div
                    class="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-background/60"
                    style="box-shadow: inset 0 0 0 1px {d.color}22"
                  >
                    <Icon class="size-3.5" style="color: {d.color}" />
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="flex min-w-0 items-center gap-1.5">
                      <span class="min-w-0 truncate text-[12px] font-medium leading-tight text-foreground">{conn.name}</span>
                      {#if isLast}
                        <span class="shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide" style="background: {d.color}22; color: {d.color}">Last</span>
                      {/if}
                    </div>
                    <p class="mt-px truncate font-mono text-[10px] leading-tight text-muted-foreground/60">{connDetail(conn)}</p>

                    <!-- Time / hover actions -->
                    <div class="mt-1 flex h-4 items-center">
                      <span class="text-[10px] text-muted-foreground/40 group-hover:hidden">
                        {relativeTime(conn.lastConnectedAt)}
                      </span>
                      <div class="hidden items-center gap-1 group-hover:flex">
                        <button
                          type="button"
                          class="inline-flex h-5 items-center rounded-md px-2 text-[10px] font-semibold text-primary-foreground transition-opacity hover:opacity-85 disabled:opacity-50"
                          style="background: {d.color}"
                          disabled={!!connecting}
                          onclick={(e) => { e.stopPropagation(); void connectWith(conn) }}
                        >
                          {#if isBusy}
                            <Loader class="size-2.5 animate-spin" />
                          {:else}
                            Connect
                          {/if}
                        </button>
                        <button
                          type="button"
                          class="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                          onclick={(e) => { e.stopPropagation(); handleDelete(conn.id) }}
                          aria-label="Remove"
                        ><X class="size-3" /></button>
                      </div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <!-- New connection button -->
          <button
            type="button"
            class={cn(
              "mt-1.5 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-colors",
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
        </ScrollArea>
      </aside>

      <!-- ── Right: form ──────────────────────────────────────────────────── -->
      <div class="flex min-h-0 min-w-0 flex-col">
        <ScrollArea class="min-h-0 flex-1">
          <div class="flex flex-col gap-5 px-6 py-5">

            <!-- DB type selector -->
            <div class="grid grid-cols-4 gap-1.5">
              {#each DRIVERS as d (d.id)}
                {@const Icon = d.icon}
                {@const active = dbType === d.id}
                <button
                  type="button"
                  class={cn(
                    "group relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center transition-all",
                    active
                      ? "border-border/60 bg-card shadow-sm"
                      : "border-transparent bg-muted/30 hover:bg-muted/60 hover:border-border/30"
                  )}
                  onclick={() => switchDriver(d.id)}
                >
                  {#if active}
                    <!-- Colored accent line at bottom -->
                    <span class="absolute inset-x-3 bottom-0 h-[2px] rounded-full" style="background: {d.color}"></span>
                  {/if}
                  <div
                    class={cn(
                      "flex size-7 items-center justify-center rounded-lg transition-colors",
                      active ? "bg-background/80 shadow-sm" : "bg-muted/50 group-hover:bg-muted"
                    )}
                  >
                    <Icon class="size-3.5 transition-colors" style={active ? `color: ${d.color}` : ''} />
                  </div>
                  <span class={cn("text-[11px] font-medium leading-none transition-colors", active ? "text-foreground" : "text-muted-foreground")}>
                    {d.label}
                  </span>
                </button>
              {/each}
            </div>

            <!-- Connection name -->
            <div class="flex flex-col gap-1.5">
              <Label for="cn-name" class="text-xs font-medium text-foreground/80">Connection name</Label>
              <Input id="cn-name" bind:value={name} class="h-9 bg-muted/30 text-sm focus-visible:bg-background" />
            </div>

            <!-- ── Postgres fields ── -->
            {#if dbType === 'postgres'}

              <!-- URI quick-fill -->
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center gap-1.5">
                  <Link2 class="size-3 text-muted-foreground/50" />
                  <Label for="cn-uri" class="text-xs font-medium text-muted-foreground/70">
                    Connection string <span class="font-normal opacity-60">(optional)</span>
                  </Label>
                </div>
                <div class="flex gap-2">
                  <Input
                    id="cn-uri"
                    bind:value={connectionUri}
                    placeholder="postgresql://user:pass@host:5432/db"
                    class="h-9 flex-1 bg-muted/30 font-mono text-xs focus-visible:bg-background"
                    onpaste={handleUriPaste}
                    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyConnectionUri() } }}
                  />
                  <Button type="button" variant="outline" size="sm" class="h-9 shrink-0 bg-muted/30 text-xs hover:bg-muted/60" onclick={applyConnectionUri} disabled={!connectionUri.trim()}>
                    Parse
                  </Button>
                </div>
                {#if uriHint}
                  <p class={cn("flex items-center gap-1 text-[11px]", uriHintIsError(uriHint) ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')}>
                    {#if uriHintIsError(uriHint)}
                      <AlertCircle class="size-3 shrink-0" />
                    {:else}
                      <CheckCircle2 class="size-3 shrink-0" />
                    {/if}
                    {uriHint}
                  </p>
                {/if}
              </div>

              <!-- Divider -->
              <div class="flex items-center gap-3">
                <div class="h-px flex-1 bg-border/40"></div>
                <span class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40">or fill manually</span>
                <div class="h-px flex-1 bg-border/40"></div>
              </div>

              <!-- Host + Port -->
              <div class="grid grid-cols-[1fr_90px] gap-2">
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-host" class="text-xs font-medium text-foreground/80">Host</Label>
                  <Input id="cn-host" bind:value={host} class="h-9 bg-muted/30 text-sm focus-visible:bg-background" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-port" class="text-xs font-medium text-foreground/80">Port</Label>
                  <Input id="cn-port" type="number" bind:value={port} class="h-9 bg-muted/30 text-sm focus-visible:bg-background" />
                </div>
              </div>

              <!-- DB + User + Password -->
              <div class="grid grid-cols-3 gap-2">
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-db" class="text-xs font-medium text-foreground/80">Database</Label>
                  <Input id="cn-db" bind:value={database} class="h-9 bg-muted/30 text-sm focus-visible:bg-background" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-user" class="text-xs font-medium text-foreground/80">User</Label>
                  <Input id="cn-user" bind:value={user} autocomplete="username" class="h-9 bg-muted/30 text-sm focus-visible:bg-background" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-pass" class="text-xs font-medium text-foreground/80">Password</Label>
                  <Input id="cn-pass" type="password" bind:value={password} autocomplete="current-password" class="h-9 bg-muted/30 text-sm focus-visible:bg-background" />
                </div>
              </div>

              <label class="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/40">
                <Checkbox id="cn-ssl" checked={ssl} onCheckedChange={(v) => (ssl = v === true)} />
                <div>
                  <p class="text-xs font-medium text-foreground/80">Use SSL</p>
                  <p class="text-[11px] text-muted-foreground/60">Enables sslmode=require for encrypted connections</p>
                </div>
              </label>

            <!-- ── MySQL fields ── -->
            {:else if dbType === 'mysql'}

              <div class="grid grid-cols-[1fr_90px] gap-2">
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-mysql-host" class="text-xs font-medium text-foreground/80">Host</Label>
                  <Input id="cn-mysql-host" bind:value={host} class="h-9 bg-muted/30 text-sm focus-visible:bg-background" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-mysql-port" class="text-xs font-medium text-foreground/80">Port</Label>
                  <Input id="cn-mysql-port" type="number" bind:value={port} class="h-9 bg-muted/30 text-sm focus-visible:bg-background" />
                </div>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-mysql-db" class="text-xs font-medium text-foreground/80">Database</Label>
                  <Input id="cn-mysql-db" bind:value={database} class="h-9 bg-muted/30 text-sm focus-visible:bg-background" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-mysql-user" class="text-xs font-medium text-foreground/80">User</Label>
                  <Input id="cn-mysql-user" bind:value={user} autocomplete="username" class="h-9 bg-muted/30 text-sm focus-visible:bg-background" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-mysql-pass" class="text-xs font-medium text-foreground/80">Password</Label>
                  <Input id="cn-mysql-pass" type="password" bind:value={password} autocomplete="current-password" class="h-9 bg-muted/30 text-sm focus-visible:bg-background" />
                </div>
              </div>
              <label class="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/40">
                <Checkbox id="cn-mysql-ssl" checked={ssl} onCheckedChange={(v) => (ssl = v === true)} />
                <div>
                  <p class="text-xs font-medium text-foreground/80">Use SSL</p>
                  <p class="text-[11px] text-muted-foreground/60">Enables ssl-mode=required for encrypted connections</p>
                </div>
              </label>

            <!-- ── SQLite fields ── -->
            {:else if dbType === 'sqlite'}

              <div class="flex flex-col gap-1.5">
                <div class="flex items-center gap-1.5">
                  <Link2 class="size-3 text-muted-foreground/50" />
                  <Label for="cn-sqlite-uri" class="text-xs font-medium text-muted-foreground/70">
                    URI <span class="font-normal opacity-60">(optional)</span>
                  </Label>
                </div>
                <div class="flex gap-2">
                  <Input
                    id="cn-sqlite-uri"
                    bind:value={connectionUri}
                    placeholder="sqlite:///path/to/database.db"
                    class="h-9 flex-1 bg-muted/30 font-mono text-xs focus-visible:bg-background"
                    onpaste={handleUriPaste}
                    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyConnectionUri() } }}
                  />
                  <Button type="button" variant="outline" size="sm" class="h-9 shrink-0 bg-muted/30 text-xs" onclick={applyConnectionUri} disabled={!connectionUri.trim()}>
                    Parse
                  </Button>
                </div>
                {#if uriHint}
                  <p class={cn("flex items-center gap-1 text-[11px]", uriHintIsError(uriHint) ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')}>
                    {#if uriHintIsError(uriHint)}<AlertCircle class="size-3" />{:else}<CheckCircle2 class="size-3" />{/if}
                    {uriHint}
                  </p>
                {/if}
              </div>

              <div class="flex flex-col gap-1.5">
                <Label for="cn-path" class="text-xs font-medium text-foreground/80">File path</Label>
                <Input id="cn-path" bind:value={filePath} placeholder="/path/to/database.db" class="h-9 bg-muted/30 font-mono text-sm focus-visible:bg-background" />
                <p class="text-[11px] text-muted-foreground/50">Absolute path or <code class="rounded bg-muted px-1 font-mono text-[10px]">:memory:</code> for in-memory</p>
              </div>

            <!-- ── D1 fields ── -->
            {:else if dbType === 'd1'}

              <div class="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
                <p class="text-[11px] leading-relaxed text-amber-600/80 dark:text-amber-400/80">
                  Connect to a Cloudflare D1 database via REST API. Find your credentials in the <strong>Cloudflare Dashboard → Workers & Pages → D1</strong>.
                </p>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-acct" class="text-xs font-medium text-foreground/80">Account ID</Label>
                  <Input id="cn-acct" bind:value={accountId} placeholder="abcdef1234…" class="h-9 bg-muted/30 font-mono text-xs focus-visible:bg-background" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-dbid" class="text-xs font-medium text-foreground/80">Database ID</Label>
                  <Input id="cn-dbid" bind:value={databaseId} placeholder="xxxxxxxx-xxxx-…" class="h-9 bg-muted/30 font-mono text-xs focus-visible:bg-background" />
                </div>
              </div>
              <div class="flex flex-col gap-1.5">
                <Label for="cn-tok" class="text-xs font-medium text-foreground/80">API Token</Label>
                <Input id="cn-tok" type="password" bind:value={apiToken} placeholder="Cloudflare API token (D1:Edit)" class="h-9 bg-muted/30 text-sm focus-visible:bg-background" />
              </div>
            {/if}

          </div>
        </ScrollArea>

        <!-- ── Footer ─────────────────────────────────────────────────────── -->
        <div class="shrink-0 border-t border-border/50 bg-muted/[0.03] px-6 py-4">

          <!-- Error / success messages -->
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
                <button type="button" class="text-[11px] text-muted-foreground/60 transition-colors hover:text-muted-foreground" onclick={() => resetForm(null)}>
                  Clear form
                </button>
              {/if}
            </div>
            <div class="flex items-center gap-2">
              {#if dbType !== 'd1'}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="h-8 bg-muted/30 px-3.5 text-xs hover:bg-muted/60"
                  onclick={handleTest}
                  disabled={testing || !!connecting}
                >
                  {#if testing}
                    <Loader class="mr-1.5 size-3 animate-spin" />Testing…
                  {:else}
                    Test connection
                  {/if}
                </Button>
              {/if}
              <Button
                type="button"
                size="sm"
                class="h-8 px-4 text-xs font-semibold"
                onclick={handleConnect}
                disabled={!!connecting || testing}
              >
                {#if connecting === (editingId ?? '__new__')}
                  <Loader class="mr-1.5 size-3 animate-spin" />Connecting…
                {:else}
                  {editingId ? 'Save & connect' : 'Connect'}
                {/if}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Close button -->
    <Dialog.Close class="absolute right-3.5 top-3.5 inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <X class="size-4" />
    </Dialog.Close>
  </Dialog.Content>
</Dialog.Root>
