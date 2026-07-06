<script>
  import { onMount } from 'svelte'
  import Check from '@lucide/svelte/icons/check'
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import LogOut from '@lucide/svelte/icons/log-out'
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import Search from '@lucide/svelte/icons/search'
  import DbIcon from './DbIcon.svelte'
  import { cfStartOAuth, cfOAuthStatus, cfLogout } from '$lib/cloudflare.js'
  import { cloudflareListAccounts, cloudflareListD1Databases } from '$lib/api.js'
  import { cn } from '$lib/utils.js'

  let {
    /**
     * Called when user has selected an account + database.
     * @type {(info: {accountId: string, databaseId: string, databaseName: string, token: string}) => void}
     */
    onselect = () => {},
    /** Called when user logs out. */
    ondisconnect = () => {},
  } = $props()

  /** @type {'idle' | 'authorizing' | 'fetching' | 'selecting' | 'error'} */
  let phase = $state('idle')
  let email = $state('')
  let errorMsg = $state('')

  /** @type {Array<{id: string, name: string}>} */
  let accounts = $state([])
  let selectedAccountId = $state('')

  /** @type {Array<{uuid: string, name: string, created_at?: string, num_tables?: number}>} */
  let databases = $state([])
  let selectedDbUuid = $state('')
  let loadingDbs = $state(false)
  let dbSearch = $state('')

  const filteredDatabases = $derived(
    dbSearch.trim()
      ? databases.filter((d) => d.name.toLowerCase().includes(dbSearch.toLowerCase()))
      : databases,
  )

  onMount(async () => {
    const status = await cfOAuthStatus()
    if (status.connected) {
      email = status.email ?? ''
      phase = 'fetching'
      await loadAccounts()
    }
  })

  async function startAuth() {
    phase = 'authorizing'
    errorMsg = ''
    try {
      const result = await cfStartOAuth()
      email = result.email ?? ''
      phase = 'fetching'
      await loadAccounts()
    } catch (e) {
      phase = 'error'
      errorMsg = String(e)
    }
  }

  async function loadAccounts() {
    try {
      const { cfGetValidToken } = await import('$lib/cloudflare.js')
      const token = await cfGetValidToken()
      accounts = await cloudflareListAccounts(token)
      phase = 'selecting'
      if (accounts.length === 1) {
        await selectAccount(accounts[0].id)
      }
    } catch (e) {
      phase = 'error'
      errorMsg = String(e)
    }
  }

  async function selectAccount(id) {
    selectedAccountId = id
    selectedDbUuid = ''
    databases = []
    loadingDbs = true
    try {
      const { cfGetValidToken } = await import('$lib/cloudflare.js')
      const token = await cfGetValidToken()
      databases = await cloudflareListD1Databases(token, id)
    } catch (e) {
      errorMsg = String(e)
    } finally {
      loadingDbs = false
    }
  }

  async function selectDatabase(uuid) {
    selectedDbUuid = uuid
    const db = databases.find(d => d.uuid === uuid)
    if (!db) return
    try {
      const { cfGetValidToken } = await import('$lib/cloudflare.js')
      const token = await cfGetValidToken()
      onselect({
        accountId: selectedAccountId,
        databaseId: uuid,
        databaseName: db.name,
        token,
      })
    } catch (e) {
      errorMsg = String(e)
    }
  }

  async function handleLogout() {
    await cfLogout()
    phase = 'idle'
    email = ''
    accounts = []
    selectedAccountId = ''
    databases = []
    selectedDbUuid = ''
    errorMsg = ''
    ondisconnect()
  }
</script>

<div class="flex flex-col gap-3">

  {#if phase === 'idle'}
    <!-- ── Not connected — left-aligned, no card ── -->
    <div class="flex flex-col gap-5 py-1">
      <div class="flex items-center gap-3.5">
        <div class="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/25">
          <DbIcon id="d1" class="size-6 text-foreground" />
        </div>
        <div class="min-w-0">
          <p class="text-[15px] font-semibold text-foreground">Connect with Cloudflare</p>
          <p class="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">Authorize Stroke to browse your D1 databases.</p>
        </div>
      </div>
      <div class="flex flex-col gap-2.5">
        <button
          type="button"
          class="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-[13px] font-semibold text-background transition-colors hover:bg-foreground/85"
          onclick={startAuth}
        >
          <DbIcon id="d1" class="size-4" />
          Authorize with Cloudflare
        </button>
        <p class="text-[11px] text-muted-foreground/45">Same OAuth flow as the Wrangler CLI · secure PKCE.</p>
      </div>
    </div>

  {:else if phase === 'authorizing'}
    <!-- ── Waiting for browser ── -->
    <div class="flex items-center gap-3.5 py-2">
      <div class="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/25">
        <Loader2 class="size-5 animate-spin text-foreground" />
      </div>
      <div class="min-w-0">
        <p class="text-[14px] font-semibold text-foreground">Waiting for Cloudflare…</p>
        <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">Authorize Stroke in the browser tab, then return here.</p>
      </div>
    </div>

  {:else if phase === 'fetching'}
    <!-- ── Loading accounts ── -->
    <div class="flex items-center gap-2.5 py-2 text-[12.5px] text-muted-foreground">
      <Loader2 class="size-4 animate-spin" />
      Loading your Cloudflare accounts…
    </div>

  {:else if phase === 'selecting'}
    <!-- ── Connected header ── -->
    <div class="flex items-center gap-2.5 rounded-lg border border-border/40 bg-muted/[0.04] px-3 py-2.5">
      <div class="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-background">
        <DbIcon id="d1" class="size-4 text-foreground" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
          Cloudflare
          <span class="inline-flex items-center gap-1 text-[10px] font-normal text-emerald-500"><Check class="size-3" />Connected</span>
        </p>
        {#if email}
          <p class="truncate text-[10px] text-muted-foreground/50">{email}</p>
        {/if}
      </div>
      <button
        type="button"
        title="Disconnect"
        class="shrink-0 rounded p-1 text-muted-foreground/40 hover:text-destructive transition-colors"
        onclick={handleLogout}
      >
        <LogOut class="size-3.5" />
      </button>
    </div>

    <!-- Account selector -->
    {#if accounts.length > 1}
      <div class="flex flex-col gap-1.5">
        <label for="cf-account-select" class="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/55">Account</label>
        <div class="relative">
          <select
            id="cf-account-select"
            class="h-9 w-full appearance-none rounded-lg border border-border/60 bg-muted/25 pl-3 pr-8 text-[12px] transition-[border-color,box-shadow] hover:border-border focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
            value={selectedAccountId}
            onchange={(e) => selectAccount(e.currentTarget.value)}
          >
            {#if !selectedAccountId}<option value="">— select account —</option>{/if}
            {#each accounts as acc (acc.id)}
              <option value={acc.id}>{acc.name}</option>
            {/each}
          </select>
          <ChevronDown class="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>
    {:else if accounts.length === 1}
      <p class="text-[11px] text-muted-foreground/50">Account · <span class="text-foreground/70">{accounts[0].name}</span></p>
    {/if}

    <!-- Database selector -->
    {#if selectedAccountId}
      <div class="flex flex-col gap-1.5">
        <label class="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/55">
          D1 Database
          {#if loadingDbs}<Loader2 class="size-3 animate-spin text-muted-foreground" />{/if}
        </label>

        {#if databases.length > 0}
          <div class="flex flex-col overflow-hidden rounded-lg border border-border/60">
            {#if databases.length > 6}
              <div class="relative border-b border-border/50">
                <Search class="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground/40" />
                <input
                  type="text"
                  placeholder="Search databases…"
                  bind:value={dbSearch}
                  class="h-9 w-full bg-transparent pl-9 pr-2.5 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/35"
                  onkeydown={(e) => { if (e.key === 'Escape') dbSearch = '' }}
                />
              </div>
            {/if}
            <div class="db-list-scroll flex max-h-[240px] flex-col gap-0.5 overflow-y-auto p-1.5">
              {#each filteredDatabases as db (db.uuid)}
                {@const selected = db.uuid === selectedDbUuid}
                <button
                  type="button"
                  class={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                    selected ? "bg-primary/10 text-foreground ring-1 ring-primary/25" : "hover:bg-muted/50"
                  )}
                  onclick={() => selectDatabase(db.uuid)}
                >
                  <DbIcon id="d1" class={cn("size-4 shrink-0", selected ? "text-foreground" : "text-muted-foreground/45")} />
                  <span class="min-w-0 flex-1 truncate font-mono text-[12.5px] font-medium leading-snug {selected ? 'text-foreground' : 'text-foreground/85'}">{db.name}</span>
                  {#if selected}
                    <Check class="size-3.5 shrink-0 text-primary" />
                  {/if}
                </button>
              {/each}
              {#if filteredDatabases.length === 0}
                <p class="px-2.5 py-3 text-center text-[11px] text-muted-foreground/45">No match for “{dbSearch}”</p>
              {/if}
            </div>
          </div>
        {:else if !loadingDbs}
          <div class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/50 px-4 py-6 text-center">
            <DbIcon id="d1" class="size-5 text-muted-foreground/25" />
            <p class="text-[11px] text-muted-foreground/50">No D1 databases in this account.</p>
            <button
              type="button"
              class="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground"
              onclick={() => selectAccount(selectedAccountId)}
            >
              <RefreshCw class="size-3" /> Retry
            </button>
          </div>
        {/if}
      </div>
    {/if}

  {:else if phase === 'error'}
    <div class="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/[0.06] px-3 py-3">
      <div class="flex items-start gap-2 text-[11px] text-destructive">
        <AlertTriangle class="mt-0.5 size-3.5 shrink-0" />
        <span class="break-words">{errorMsg || 'Authorization failed.'}</span>
      </div>
      <button
        type="button"
        class="self-start text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        onclick={startAuth}
      >Try again</button>
    </div>
  {/if}

</div>
