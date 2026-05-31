<script>
  import { onMount } from 'svelte'
  import Cloud from '@lucide/svelte/icons/cloud'
  import Check from '@lucide/svelte/icons/check'
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import LogOut from '@lucide/svelte/icons/log-out'
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import Database from '@lucide/svelte/icons/database'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
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
    <!-- ── Not connected ── -->
    <div class="flex flex-col items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-6 text-center">
      <div class="flex size-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
        <Cloud class="size-5 text-amber-500" />
      </div>
      <div>
        <p class="text-sm font-medium text-foreground">Connect with Cloudflare</p>
        <p class="mt-0.5 text-[11px] text-muted-foreground">Authorize DB Studio to access your D1 databases.</p>
      </div>
      <button
        type="button"
        class="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-amber-400"
        onclick={startAuth}
      >
        <Cloud class="size-3.5" />
        Authorize with Cloudflare
      </button>
      <p class="text-[10px] text-muted-foreground/40">
        Uses the same OAuth flow as the Wrangler CLI
      </p>
    </div>

  {:else if phase === 'authorizing'}
    <!-- ── Waiting for browser ── -->
    <div class="flex flex-col items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-6 text-center">
      <Loader2 class="size-6 animate-spin text-amber-500" />
      <div>
        <p class="text-sm font-medium text-foreground">Browser opened</p>
        <p class="mt-0.5 text-[11px] text-muted-foreground">Authorize DB Studio in the Cloudflare page, then return here.</p>
      </div>
      <p class="text-[10px] text-muted-foreground/40">Waiting… (5 min timeout)</p>
    </div>

  {:else if phase === 'fetching'}
    <!-- ── Loading accounts ── -->
    <div class="flex items-center justify-center gap-2 rounded-xl border border-border/50 bg-muted/20 py-6 text-[11px] text-muted-foreground">
      <Loader2 class="size-3.5 animate-spin" />
      Loading your Cloudflare accounts…
    </div>

  {:else if phase === 'selecting'}
    <!-- ── Connected header ── -->
    <div class="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5">
      <div class="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
        <Check class="size-3.5 text-amber-500" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-[12px] font-medium text-foreground">Connected to Cloudflare</p>
        {#if email}
          <p class="truncate text-[10px] text-muted-foreground/60">{email}</p>
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
        <label for="cf-account-select" class="text-[11px] font-medium text-foreground/75">Account</label>
        <div class="relative">
          <select
            id="cf-account-select"
            class="h-9 w-full appearance-none rounded-lg border border-border bg-muted/30 pl-3 pr-8 text-[12px] focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30"
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
      <p class="text-[10px] text-muted-foreground/50">Account: <span class="text-foreground/70">{accounts[0].name}</span></p>
    {/if}

    <!-- Database selector -->
    {#if selectedAccountId}
      <div class="flex flex-col gap-1.5">
        <label class="flex items-center gap-1.5 text-[11px] font-medium text-foreground/75">
          D1 Database
          {#if loadingDbs}<Loader2 class="size-3 animate-spin text-muted-foreground" />{/if}
        </label>

        {#if databases.length > 0}
          <div class="flex flex-col gap-1.5 rounded-lg border border-border/50 p-1.5">
            {#each databases as db (db.uuid)}
              {@const selected = db.uuid === selectedDbUuid}
              <button
                type="button"
                class={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                  selected
                    ? "bg-amber-500/15 ring-1 ring-amber-500/30"
                    : "hover:bg-muted/50"
                )}
                onclick={() => selectDatabase(db.uuid)}
              >
                <Database class={cn("size-3.5 shrink-0", selected ? "text-amber-500" : "text-muted-foreground/50")} />
                <div class="min-w-0 flex-1">
                  <p class="truncate font-mono text-[12px] font-medium leading-snug text-foreground">{db.name}</p>
                  {#if db.num_tables != null}
                    <p class="text-[10px] text-muted-foreground/50">{db.num_tables} table{db.num_tables !== 1 ? 's' : ''}</p>
                  {/if}
                </div>
                {#if selected}
                  <Check class="size-3.5 shrink-0 text-amber-500" />
                {/if}
              </button>
            {/each}
          </div>
        {:else if !loadingDbs}
          <div class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/50 px-4 py-5 text-center">
            <Database class="size-5 text-muted-foreground/25" />
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
