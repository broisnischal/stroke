<script>
  import { onMount } from 'svelte'
  import Check from '@lucide/svelte/icons/check'
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import LogOut from '@lucide/svelte/icons/log-out'
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import DbIcon from './DbIcon.svelte'
  import SearchableMenu from './SearchableMenu.svelte'
  import ProviderAuthPanel from './ProviderAuthPanel.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
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
    // Seeds from a saved connection picked in the dialog's sidebar, so its
    // account and database show as already selected instead of the picker
    // restarting on the first account. Selection only - see `seedFromSaved`.
    initialAccountId = '',
    initialDatabaseId = '',
    initialDatabaseName = '',
  } = $props()

  /** @type {'idle' | 'authorizing' | 'fetching' | 'selecting' | 'error'} */
  let phase = $state('idle')
  let email = $state('')
  let errorMsg = $state('')

  /** @type {Array<{id: string, name: string}>} */
  let accounts = $state([])
  let selectedAccountId = $state('')
  const selectedAccountName = $derived(accounts.find((a) => a.id === selectedAccountId)?.name ?? '')

  /** @type {Array<{uuid: string, name: string, created_at?: string, num_tables?: number}>} */
  let databases = $state([])
  let selectedDbUuid = $state('')
  let loadingDbs = $state(false)

  // `value` is the uuid because that is what selection needs; SearchableMenu makes
  // the label searchable on its own.
  const dbItems = $derived(databases.map((d) => ({ value: d.uuid, label: d.name })))
  // Falls back to the saved connection's name so a sidebar pick reads as selected
  // straight away, before (or even without) the account's database list arriving.
  const selectedDbName = $derived(
    databases.find((d) => d.uuid === selectedDbUuid)?.name || initialDatabaseName || '',
  )

  // Show a saved connection's database as the current selection. Deliberately
  // does not call `onselect` - that is what connects, and picking a row in the
  // connections sidebar is not a request to dial it. Latched on the id so it
  // seeds once per saved connection and never fights a manual pick.
  let seededDbId = ''
  $effect(() => {
    const want = initialDatabaseId
    if (!want || seededDbId === want) return
    if (databases.some((d) => d.uuid === want)) {
      seededDbId = want
      selectedDbUuid = want
    }
  })

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
    try {
      const status = await cfOAuthStatus()
      if (status.connected) {
        email = status.email ?? ''
        phase = 'fetching'
        await loadAccounts()
      }
    } catch { /* stay idle */ }
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
      // Auto-select an account so the D1 database list loads immediately; the
      // user can still switch accounts via the dropdown when there are several.
      // A saved connection's own account wins, otherwise the first one.
      if (accounts.length && !selectedAccountId) {
        const seeded = accounts.some((a) => a.id === initialAccountId)
          ? initialAccountId
          : accounts[0].id
        await selectAccount(seeded)
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
      // Show the error card - staying in 'selecting' rendered a misleading
      // "No D1 databases in this account" empty state over a real failure.
      phase = 'error'
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
      phase = 'error'
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
    <ProviderAuthPanel
      title="Sign in with Cloudflare"
      subtitle="Opens your browser to authorize. Stroke gets a scoped token for D1 - your Cloudflare password never passes through it."
      hint="Same PKCE flow as Wrangler"
    >
      {#snippet mark()}<DbIcon id="d1" class="size-4 shrink-0" />{/snippet}
      {#snippet action()}
        <Button class="group" onclick={startAuth}>
          Sign in
          <ArrowRight class="size-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
        </Button>
      {/snippet}
    </ProviderAuthPanel>

  {:else if phase === 'authorizing'}
    <ProviderAuthPanel
      tone="busy"
      progress
      title="Waiting for Cloudflare…"
      subtitle="Finish authorizing in the browser tab, then come back here."
      hint="Times out in 5 min"
    >
      {#snippet mark()}<DbIcon id="d1" class="size-4 shrink-0" />{/snippet}
    </ProviderAuthPanel>

  {:else if phase === 'fetching'}
    <ProviderAuthPanel
      tone="busy"
      progress
      title="Signed in"
      subtitle="Loading your Cloudflare accounts…"
      hint={email}
    >
      {#snippet mark()}<Check class="size-4 shrink-0 text-success" />{/snippet}
    </ProviderAuthPanel>

  {:else if phase === 'error'}
    <ProviderAuthPanel tone="error" title={shownError.title} subtitle={shownError.detail} hint="Nothing was saved">
      {#snippet mark()}<AlertTriangle class="size-4 shrink-0 text-destructive" />{/snippet}
      {#snippet action()}
        <Button variant="outline" class="group" onclick={startAuth}>
          <RefreshCw class="size-3.5 transition-transform duration-500 ease-[var(--ease-out)] group-hover:rotate-180" />
          Try again
        </Button>
      {/snippet}
    </ProviderAuthPanel>

  {:else if phase === 'selecting'}
    <!-- ── Connected header ── -->
    <div class="flex items-center gap-2.5 rounded-lg border border-border/40 bg-muted/[0.04] px-3 py-2.5">
      <div class="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-background">
        <DbIcon id="d1" class="size-4 text-foreground" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-1.5 text-ui-xs font-medium text-foreground">
          Cloudflare
          <span class="inline-flex items-center gap-1 text-ui-3xs font-normal text-success"><Check class="size-3" />Connected</span>
        </p>
        {#if email}
          <p class="truncate text-ui-3xs text-muted-foreground/50">{email}</p>
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
        <span class="text-ui-3xs font-semibold uppercase tracking-[0.06em] text-muted-foreground/55">Account</span>
        <SearchableMenu
          items={accounts.map((a) => ({ value: a.id, label: a.name }))}
          placeholder="Search accounts…"
          empty="No matching account"
          contentClass="w-[var(--bits-popover-anchor-width)] min-w-[240px]"
          onselect={(it) => selectAccount(it.value)}
        >
          {#snippet trigger(props)}
            <button
              {...props}
              type="button"
              class="flex h-9 w-full items-center gap-2 rounded-lg border-2 border-border/60 bg-muted/25 pl-3 pr-2.5 text-left text-ui-xs transition-[border-color,box-shadow] hover:border-border focus:border-ring/55 focus:ring-2 focus:ring-ring/15 focus:outline-none data-[state=open]:border-ring"
            >
              <span class={cn('min-w-0 flex-1 truncate', !selectedAccountId && 'text-muted-foreground')}>
                {selectedAccountName || '- select account -'}
              </span>
              <ChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          {/snippet}
          {#snippet item(it)}
            <DbIcon id="d1" class="size-3.5 shrink-0 text-muted-foreground/45" />
            <span class="min-w-0 flex-1 truncate">{it.label}</span>
            {#if it.value === selectedAccountId}<Check class="size-3.5 shrink-0 text-primary" />{/if}
          {/snippet}
        </SearchableMenu>
      </div>
    {:else if accounts.length === 1}
      <p class="text-ui-2xs text-muted-foreground/50">Account · <span class="text-foreground/70">{accounts[0].name}</span></p>
    {/if}

    <!-- Database selector -->
    {#if selectedAccountId}
      <div class="flex flex-col gap-1.5">
        <span class="text-ui-3xs font-semibold uppercase tracking-[0.06em] text-muted-foreground/55">D1 Database</span>

        {#if databases.length > 0}
          <SearchableMenu
            items={dbItems}
            placeholder="Search databases…"
            empty="No matching database"
            contentClass="w-[var(--bits-popover-anchor-width)] min-w-[240px]"
            align="start"
            onselect={(it) => selectDatabase(it.value)}
          >
            {#snippet trigger(props)}
              <button
                {...props}
                type="button"
                class="flex h-9 w-full items-center gap-2 rounded-lg border-2 border-border/60 bg-muted/25 pl-3 pr-2.5 text-left text-ui-xs transition-[border-color,box-shadow] hover:border-border focus:border-ring/55 focus:ring-2 focus:ring-ring/15 focus:outline-none data-[state=open]:border-ring"
              >
                <DbIcon id="d1" class={cn('size-4 shrink-0', selectedDbName ? 'text-foreground' : 'text-muted-foreground/45')} />
                <span class={cn('min-w-0 flex-1 truncate font-mono', !selectedDbName && 'font-sans text-muted-foreground')}>
                  {selectedDbName || '- select database -'}
                </span>
                <ChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            {/snippet}
            {#snippet item(it)}
              <DbIcon id="d1" class={cn('size-4 shrink-0', it.value === selectedDbUuid ? 'text-foreground' : 'text-muted-foreground/50')} />
              <span class="min-w-0 flex-1 truncate font-mono leading-snug">{it.label}</span>
              {#if it.value === selectedDbUuid}<Check class="size-3.5 shrink-0 text-primary" />{/if}
            {/snippet}
          </SearchableMenu>
        {:else if loadingDbs}
          <!-- Hold the control's footprint while the list loads so the form does
               not jump once the databases arrive. -->
          <div class="flex h-9 w-full items-center gap-2 rounded-lg border border-border/60 bg-muted/15 pl-3 pr-2.5 text-ui-xs text-muted-foreground/50">
            <Loader2 class="size-3.5 shrink-0 animate-spin" />
            <span class="min-w-0 flex-1 truncate">Loading databases…</span>
          </div>
        {:else}
          <div class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/50 px-4 py-6 text-center">
            <DbIcon id="d1" class="size-5 text-muted-foreground/25" />
            <p class="text-ui-2xs text-muted-foreground/50">No D1 databases in this account.</p>
            <button
              type="button"
              class="flex items-center gap-1 text-ui-3xs text-muted-foreground/40 hover:text-muted-foreground"
              onclick={() => selectAccount(selectedAccountId)}
            >
              <RefreshCw class="size-3" /> Retry
            </button>
          </div>
        {/if}
      </div>
    {/if}

  {/if}

</div>

