<script>
  import { untrack } from 'svelte'
  import Database  from '@lucide/svelte/icons/database'
  import HardDrive from '@lucide/svelte/icons/hard-drive'
  import Cloud     from '@lucide/svelte/icons/cloud'
  import X         from '@lucide/svelte/icons/x'
  import Clock     from '@lucide/svelte/icons/clock'
  import Loader    from '@lucide/svelte/icons/loader'
  import Plus      from '@lucide/svelte/icons/plus'
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
    { id: 'postgres', label: 'PostgreSQL',    icon: Database,  color: 'text-blue-500'   },
    { id: 'mysql',    label: 'MySQL',         icon: Database,  color: 'text-orange-400' },
    { id: 'sqlite',   label: 'SQLite',        icon: HardDrive, color: 'text-green-500'  },
    { id: 'd1',       label: 'D1',            icon: Cloud,     color: 'text-orange-500' },
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
    class="flex max-h-[min(90vh,800px)] w-[min(850px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[850px]"
    showCloseButton={true}
  >
    <!-- Two-panel body -->
    <div class="grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[220px_minmax(0,1fr)]">

      <!-- Left: saved / recent -->
      <section class="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
        <div class="shrink-0 px-4 pt-5 pb-3">
          <h2 class="text-sm font-semibold text-foreground">Connect</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">Select a recent connection or create new</p>
        </div>

        <ScrollArea class="min-h-0 flex-1 px-2 pb-3">
          {#if saved.length === 0}
            <div class="mx-2 flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 px-4 py-8 text-center">
              <Clock class="mb-2 size-6 text-muted-foreground/40" />
              <p class="text-xs font-medium text-foreground">No saved connections</p>
              <p class="mt-0.5 text-[11px] text-muted-foreground">Set up a new connection →</p>
            </div>
          {:else}
            <div class="flex flex-col">
              {#each saved as conn (conn.id)}
                {@const d = driver(conn.type)}
                {@const Icon = d.icon}
                {@const isLast = conn.id === lastId}
                {@const isSelected = conn.id === editingId}
                {@const isBusy = connecting === conn.id}
                <div
                  class={cn(
                    "group relative flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2.5 transition-colors",
                    isSelected ? "bg-accent" : "hover:bg-accent/50"
                  )}
                  role="button"
                  tabindex="0"
                  onclick={() => selectSaved(conn)}
                  onkeydown={(e) => e.key === 'Enter' && selectSaved(conn)}
                >
                  <div class={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
                    isSelected ? "bg-background/60" : "bg-muted"
                  )}>
                    <Icon class="size-3 {d.color}" />
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="flex min-w-0 items-center gap-1.5">
                      <span class="min-w-0 truncate text-xs font-medium text-foreground leading-snug">{conn.name}</span>
                      {#if isLast}
                        <span class="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-medium text-primary">Last</span>
                      {/if}
                    </div>
                    <p class="truncate font-mono text-[10px] text-muted-foreground/70 leading-snug">{connDetail(conn)}</p>
                    <!-- time: shows when not hovered; actions: show on hover — no layout shift -->
                    <div class="mt-1 flex items-center gap-1">
                      <span class="text-[10px] text-muted-foreground/50 group-hover:hidden">
                        {relativeTime(conn.lastConnectedAt) || ''}
                      </span>
                      <div class="hidden items-center gap-1 group-hover:flex">
                        <button
                          type="button"
                          class="inline-flex h-5 items-center gap-1 rounded-md bg-primary px-2 text-[10px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
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
                          class="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
                          onclick={(e) => { e.stopPropagation(); handleDelete(conn.id) }}
                          aria-label="Delete"
                        ><X class="size-3" /></button>
                      </div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <!-- New connection entry -->
          <button
            type="button"
            class={cn(
              "mt-1.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors",
              !editingId ? "bg-accent/60 text-foreground" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
            )}
            onclick={() => resetForm(null)}
          >
            <div class="flex size-7 shrink-0 items-center justify-center rounded-md border border-dashed border-border/60 bg-transparent">
              <Plus class="size-3.5" />
            </div>
            <span class="text-xs font-medium">New connection</span>
          </button>
        </ScrollArea>
      </section>

      <!-- Right: form -->
      <section class="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <ScrollArea class="min-h-0 min-w-0 flex-1">
          <div class="flex min-w-0 flex-col gap-5 px-6 py-5">

            <!-- DB type pill selector -->
            <div class="flex gap-1 rounded-lg bg-muted p-1">
              {#each DRIVERS as d (d.id)}
                {@const Icon = d.icon}
                <button
                  type="button"
                  class={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all",
                    dbType === d.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onclick={() => switchDriver(d.id)}
                >
                  <Icon class="size-3 {dbType === d.id ? d.color : ''}" />
                  {d.label}
                </button>
              {/each}
            </div>

            <!-- Connection name -->
            <div class="flex flex-col gap-1.5">
              <Label for="cn-name" class="text-xs font-medium">Connection name</Label>
              <Input id="cn-name" bind:value={name} class="h-9 text-sm" />
            </div>

            {#if dbType === 'postgres'}
              <!-- URI quick-fill -->
              <div class="flex flex-col gap-1.5">
                <Label for="cn-uri" class="text-xs font-medium text-muted-foreground">
                  Connection string <span class="font-normal">(optional)</span>
                </Label>
                <div class="flex gap-2">
                  <Input
                    id="cn-uri"
                    bind:value={connectionUri}
                    placeholder="postgresql://user:pass@host:5432/db"
                    class="h-9 flex-1 font-mono text-xs"
                    onpaste={handleUriPaste}
                    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyConnectionUri() } }}
                  />
                  <Button type="button" variant="outline" size="sm" class="shrink-0 text-xs" onclick={applyConnectionUri} disabled={!connectionUri.trim()}>
                    Parse
                  </Button>
                </div>
                {#if uriHint}
                  <p class="text-[11px] {uriHintIsError(uriHint) ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}">{uriHint}</p>
                {/if}
              </div>

              <!-- Host / Port / DB -->
              <div class="grid grid-cols-[1fr_80px] gap-2">
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-host" class="text-xs font-medium">Host</Label>
                  <Input id="cn-host" bind:value={host} class="h-9 text-sm" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-port" class="text-xs font-medium">Port</Label>
                  <Input id="cn-port" type="number" bind:value={port} class="h-9 text-sm" />
                </div>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-db" class="text-xs font-medium">Database</Label>
                  <Input id="cn-db" bind:value={database} class="h-9 text-sm" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-user" class="text-xs font-medium">User</Label>
                  <Input id="cn-user" bind:value={user} autocomplete="username" class="h-9 text-sm" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-pass" class="text-xs font-medium">Password</Label>
                  <Input id="cn-pass" type="password" bind:value={password} autocomplete="current-password" class="h-9 text-sm" />
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Checkbox id="cn-ssl" checked={ssl} onCheckedChange={(v) => (ssl = v === true)} />
                <Label for="cn-ssl" class="cursor-pointer text-xs font-normal text-muted-foreground">Use SSL (sslmode=require)</Label>
              </div>

            {:else if dbType === 'mysql'}
              <div class="grid grid-cols-[1fr_80px] gap-2">
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-mysql-host" class="text-xs font-medium">Host</Label>
                  <Input id="cn-mysql-host" bind:value={host} class="h-9 text-sm" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-mysql-port" class="text-xs font-medium">Port</Label>
                  <Input id="cn-mysql-port" type="number" bind:value={port} class="h-9 text-sm" />
                </div>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-mysql-db" class="text-xs font-medium">Database</Label>
                  <Input id="cn-mysql-db" bind:value={database} class="h-9 text-sm" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-mysql-user" class="text-xs font-medium">User</Label>
                  <Input id="cn-mysql-user" bind:value={user} autocomplete="username" class="h-9 text-sm" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-mysql-pass" class="text-xs font-medium">Password</Label>
                  <Input id="cn-mysql-pass" type="password" bind:value={password} autocomplete="current-password" class="h-9 text-sm" />
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Checkbox id="cn-mysql-ssl" checked={ssl} onCheckedChange={(v) => (ssl = v === true)} />
                <Label for="cn-mysql-ssl" class="cursor-pointer text-xs font-normal text-muted-foreground">Use SSL (ssl-mode=required)</Label>
              </div>

            {:else if dbType === 'sqlite'}
              <div class="flex flex-col gap-1.5">
                <Label for="cn-sqlite-uri" class="text-xs font-medium text-muted-foreground">
                  URI <span class="font-normal">(optional)</span>
                </Label>
                <div class="flex gap-2">
                  <Input
                    id="cn-sqlite-uri"
                    bind:value={connectionUri}
                    placeholder="sqlite:///path/to/database.db"
                    class="h-9 flex-1 font-mono text-xs"
                    onpaste={handleUriPaste}
                    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyConnectionUri() } }}
                  />
                  <Button type="button" variant="outline" size="sm" class="shrink-0 text-xs" onclick={applyConnectionUri} disabled={!connectionUri.trim()}>
                    Parse
                  </Button>
                </div>
                {#if uriHint}
                  <p class="text-[11px] {uriHintIsError(uriHint) ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}">{uriHint}</p>
                {/if}
              </div>
              <div class="flex flex-col gap-1.5">
                <Label for="cn-path" class="text-xs font-medium">File path</Label>
                <Input id="cn-path" bind:value={filePath} placeholder="/path/to/database.db" class="h-9 font-mono text-sm" />
                <p class="text-[11px] text-muted-foreground">Absolute path or <code class="font-mono">:memory:</code></p>
              </div>

            {:else if dbType === 'd1'}
              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-acct" class="text-xs font-medium">Account ID</Label>
                  <Input id="cn-acct" bind:value={accountId} placeholder="abcdef1234…" class="h-9 font-mono text-sm" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-dbid" class="text-xs font-medium">Database ID</Label>
                  <Input id="cn-dbid" bind:value={databaseId} placeholder="xxxxxxxx-xxxx-…" class="h-9 font-mono text-sm" />
                </div>
              </div>
              <div class="flex flex-col gap-1.5">
                <Label for="cn-tok" class="text-xs font-medium">API Token</Label>
                <Input id="cn-tok" type="password" bind:value={apiToken} placeholder="Cloudflare API token (D1:Edit)" class="h-9 text-sm" />
              </div>
            {/if}
          </div>
        </ScrollArea>

        <!-- Footer -->
        <div class="shrink-0 border-t border-border/60 px-6 py-4">
          {#if error}
            <div class="mb-3 rounded-md bg-destructive/8 px-3 py-2 text-xs text-destructive">{error}</div>
          {/if}
          {#if testOk}
            <div class="mb-3 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">Connection test successful</div>
          {/if}
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              {#if editingId}
                <Button type="button" variant="ghost" size="sm" class="text-xs text-muted-foreground" onclick={() => resetForm(null)}>
                  Clear
                </Button>
              {/if}
            </div>
            <div class="flex items-center gap-2">
              {#if dbType !== 'd1'}
                <Button type="button" variant="outline" size="sm" class="text-xs" onclick={handleTest} disabled={testing || !!connecting}>
                  {testing ? 'Testing…' : 'Test'}
                </Button>
              {/if}
              <Button type="button" size="sm" class="text-xs" onclick={handleConnect} disabled={!!connecting || testing}>
                {#if connecting === (editingId ?? '__new__')}
                  <Loader class="mr-1.5 size-3 animate-spin" />Connecting…
                {:else}
                  {editingId ? 'Save & connect' : 'Connect'}
                {/if}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </Dialog.Content>
</Dialog.Root>
