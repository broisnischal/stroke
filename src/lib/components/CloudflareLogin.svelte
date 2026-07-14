<script>
  import { onMount } from 'svelte'
  import Check from '@lucide/svelte/icons/check'
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import LogOut from '@lucide/svelte/icons/log-out'
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
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

  /** Turn a raw backend error into a calm title + one-line explanation. */
  function friendlyError(msg) {
    const m = String(msg ?? '')
    if (/not signed in|no.*token|unauthor/i.test(m))
      return { title: 'Session expired', detail: 'Your Cloudflare sign-in is no longer valid. Sign in again to continue.' }
    if (/timed out/i.test(m))
      return { title: 'Authorization timed out', detail: 'The browser sign-in took too long. Start again when you are ready.' }
    if (/cancel|denied/i.test(m))
      return { title: 'Authorization not completed', detail: 'The browser closed before authorizing. Try again to connect.' }
    if (/port .*in use|bind any callback/i.test(m))
      return { title: 'Callback port in use', detail: m }
    return { title: 'Something went wrong', detail: m || 'Please try again.' }
  }
  const shownError = $derived(friendlyError(errorMsg))

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
    <!-- Not connected — compact CTA (the provider row above already names it). -->
    <div class="flex flex-col gap-2">
      <button
        type="button"
        class="group flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-[13px] font-semibold text-background shadow-sm transition-[background-color,transform] duration-150 ease-out hover:bg-foreground/85 active:scale-[0.98]"
        onclick={startAuth}
      >
        Sign in with Cloudflare
        <ArrowRight class="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
      </button>
      <p class="text-xs text-muted-foreground">Opens your browser to authorize · same PKCE flow as Wrangler</p>
    </div>

  {:else if phase === 'authorizing'}
    <!-- ── Waiting for browser ── -->
    <div class="flex flex-col gap-3.5 rounded-xl border border-border/40 bg-muted/[0.03] p-4">
      <div class="flex items-center gap-3.5">
        <div class="relative flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background">
          <span class="pulse-ring pointer-events-none absolute inset-0 rounded-xl ring-1 ring-primary/40"></span>
          <DbIcon id="d1" class="size-5 text-foreground" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold leading-tight text-foreground">Waiting for Cloudflare…</p>
          <p class="mt-1 text-xs leading-relaxed text-pretty text-muted-foreground">
            Finish authorizing in the browser tab, then come back here.
          </p>
        </div>
      </div>
      <div class="h-1 overflow-hidden rounded-full bg-muted/60">
        <span class="progress-slide block h-full w-1/3 rounded-full bg-primary/70"></span>
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
    <div class="flex flex-col gap-3 rounded-xl border border-destructive/25 bg-destructive/[0.07] p-3.5">
      <div class="flex items-start gap-3">
        <div class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-destructive/12 text-destructive">
          <AlertTriangle class="size-4" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-semibold leading-tight text-destructive">{shownError.title}</p>
          <p class="mt-1 text-xs leading-relaxed text-pretty break-words text-destructive/75">{shownError.detail}</p>
        </div>
      </div>
      <button
        type="button"
        class="inline-flex h-8 items-center justify-center gap-1.5 self-start rounded-lg border border-destructive/30 bg-destructive/5 px-3 text-xs font-medium text-destructive transition-[color,background-color,transform] duration-150 ease-out hover:bg-destructive/12 active:scale-[0.96]"
        onclick={startAuth}
      >
        <RefreshCw class="size-3.5" /> Try again
      </button>
    </div>
  {/if}

</div>

<style>
  /* Expanding pulse ring on the Cloudflare mark while awaiting the browser. */
  @keyframes pulse-ring {
    0%   { opacity: 0.55; transform: scale(1); }
    100% { opacity: 0;    transform: scale(1.35); }
  }
  .pulse-ring { animation: pulse-ring 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

  /* Indeterminate bar sweeping left→right. */
  @keyframes progress-slide {
    0%   { transform: translateX(-120%); }
    100% { transform: translateX(320%); }
  }
  .progress-slide { animation: progress-slide 1.3s ease-in-out infinite; }

  @media (prefers-reduced-motion: reduce) {
    .pulse-ring { animation: none; opacity: 0.4; }
    .progress-slide { animation: none; width: 100%; opacity: 0.5; }
  }
</style>
