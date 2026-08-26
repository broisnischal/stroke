<script>
  // One-flow provider sign-in: authorize (OAuth) or paste a token, list every
  // database on the account, and hand a ready-to-connect spec to the parent.
  // Generalized from CloudflareLogin.svelte across all provider adapters.
  import { onMount, onDestroy } from 'svelte'
  import Check from '@lucide/svelte/icons/check'
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import LogOut from '@lucide/svelte/icons/log-out'
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import X from '@lucide/svelte/icons/x'
  import DbIcon from './DbIcon.svelte'
  import ProviderAuthPanel from './ProviderAuthPanel.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import Search from '@lucide/svelte/icons/search'
  import KeyRound from '@lucide/svelte/icons/key-round'
  import Eye from '@lucide/svelte/icons/eye'
  import EyeOff from '@lucide/svelte/icons/eye-off'
  import { cn } from '$lib/utils.js'
  import {
    providerMeta,
    providerStartOAuth,
    providerCancelOAuth,
    providerStoreToken,
    providerOAuthStatus,
    providerLogout,
    providerListDatabases,
    providerBuildConnection,
  } from '$lib/providers.js'

  let {
    /** Provider id: 'neon' | 'supabase' | 'planetscale' | 'prisma' */
    provider,
    /**
     * Called with a ready-to-connect spec once the user picks a database.
     * @type {(conn: import('$lib/providers.js').ProviderConnection) => void}
     */
    onselect = () => {},
    ondisconnect = () => {},
    /**
     * Look up a saved connection for a database by name, so picking a database we
     * already hold credentials for doesn't mint a second set. PlanetScale creates
     * a fresh admin-role branch password on every build_connection call, and
     * Prisma a fresh connection record - going through the picker a dozen times
     * leaves a dozen live credentials behind in the user's account.
     * @type {(dbName: string) => { host: string, user: string, password: string, database: string } | undefined}
     */
    resolveSavedConnection = () => undefined,
    /**
     * Look up a previously-saved password for a database (host + user), so a
     * needs-password provider (Supabase) doesn't prompt again once it's known.
     * @type {(host: string, user: string) => string | undefined}
     */
    resolvePassword = () => undefined,
  } = $props()

  const meta = $derived(providerMeta(provider))

  /** @type {'idle'|'authorizing'|'fetching'|'selecting'|'building'|'password'|'error'} */
  let phase = $state('idle')
  let errorMsg = $state('')
  let tokenInput = $state('')
  /** Resolved spec awaiting a password (providers that don't expose it, e.g. Supabase). */
  let resolved = $state(/** @type {import('$lib/providers.js').ProviderConnection | null} */ (null))
  let pw = $state('')
  let showPw = $state(false)

  /** @type {import('$lib/providers.js').ProviderDatabase[]} */
  let databases = $state([])
  let selectedRef = $state('')
  let search = $state('')

  const filtered = $derived(
    search.trim()
      ? databases.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
      : databases,
  )

  // Keyboard navigation for the database list, driven from the search box.
  let hlIdx = $state(0)
  $effect(() => {
    filtered
    hlIdx = 0
  })
  /** @param {KeyboardEvent} e */
  function onSearchKeydown(e) {
    if (e.key === 'Escape') { search = ''; return }
    const n = filtered.length
    if (!n) return
    if (e.key === 'ArrowDown') { e.preventDefault(); hlIdx = (hlIdx + 1) % n }
    else if (e.key === 'ArrowUp') { e.preventDefault(); hlIdx = (hlIdx - 1 + n) % n }
    else if (e.key === 'Enter') { e.preventDefault(); const d = filtered[hlIdx] ?? filtered[0]; if (d) pick(d.db_ref) }
  }

  /** Turn a raw backend error into a calm title + one-line explanation. */
  function friendlyError(msg) {
    const m = String(msg ?? '')
    const name = meta?.name ?? 'the provider'
    if (/not signed in/i.test(m))
      return { title: 'Session expired', detail: `Your ${name} sign-in is no longer valid. Sign in again to continue.` }
    if (/timed out/i.test(m))
      return { title: 'Authorization timed out', detail: 'The browser sign-in took too long. Start again when you are ready.' }
    if (/cancel/i.test(m))
      return { title: 'Sign-in cancelled', detail: 'The browser closed before authorizing. Try again to connect.' }
    if (/denied/i.test(m))
      return { title: 'Authorization denied', detail: `${name} declined the request. Try again and approve access.` }
    if (/port .*in use|bind any callback/i.test(m))
      return { title: 'Callback port in use', detail: m }
    if (/non-JSON|proxy|token exchange/i.test(m))
      return { title: 'Sign-in service unavailable', detail: 'Could not reach the sign-in service. Check your network and try again.' }
    return { title: 'Something went wrong', detail: m || 'Please try again.' }
  }
  const shownError = $derived(friendlyError(errorMsg))

  onMount(async () => {
    try {
      const status = await providerOAuthStatus(provider)
      if (status.connected) {
        phase = 'fetching'
        await loadDatabases()
      }
    } catch { /* stay idle */ }
  })

  // Unmounting mid-authorize (dialog closed, provider switched via {#key}) must
  // free the backend callback port, or the next sign-in attempt hits
  // "Callback port in use" until the 5-minute timeout expires.
  onDestroy(() => {
    if (phase === 'authorizing') void providerCancelOAuth().catch(() => {})
  })

  async function startAuth() {
    phase = 'authorizing'
    errorMsg = ''
    try {
      await providerStartOAuth(provider)
      phase = 'fetching'
      await loadDatabases()
    } catch (e) {
      // User-cancelled aborts quietly back to the start; anything else is an error.
      if (String(e).includes('cancelled')) {
        phase = 'idle'
        errorMsg = ''
      } else {
        phase = 'error'
        errorMsg = String(e)
      }
    }
  }

  /** Abort the in-flight browser auth and return to the start. */
  async function cancelAuth() {
    try { await providerCancelOAuth() } catch { /* ignore */ }
    phase = 'idle'
    errorMsg = ''
  }

  async function saveToken() {
    if (!tokenInput.trim()) return
    phase = 'fetching'
    errorMsg = ''
    try {
      await providerStoreToken(provider, tokenInput.trim())
      await loadDatabases()
    } catch (e) {
      phase = 'error'
      errorMsg = String(e)
    }
  }

  async function loadDatabases() {
    try {
      databases = await providerListDatabases(provider)
      phase = 'selecting'
    } catch (e) {
      phase = 'error'
      errorMsg = String(e)
    }
  }

  /** Providers whose build_connection *creates* a credential rather than reading one. */
  const MINTS_CREDENTIALS = ['planetscale', 'prisma']

  async function pick(ref) {
    selectedRef = ref
    phase = 'building'
    try {
      // Already hold working credentials for this database? Use them. Minting
      // again would work too, and leave another admin-role password behind.
      if (MINTS_CREDENTIALS.includes(provider)) {
        const dbName = databases.find((d) => d.db_ref === ref)?.name ?? ''
        const known = dbName ? resolveSavedConnection(dbName) : undefined
        if (known) {
          phase = 'selecting'
          onselect({
            db_type: meta?.engine === 'mysql' ? 'mysql' : 'postgres',
            host: known.host,
            port: meta?.engine === 'mysql' ? 3306 : 5432,
            username: known.user,
            password: known.password,
            database: known.database,
            ssl: true,
            needs_password: false,
            name: dbName,
            // Lets the caller mint fresh credentials if these turn out to be
            // revoked provider-side, instead of failing for good.
            reusedSaved: ref,
          })
          return
        }
      }
      const conn = await providerBuildConnection(provider, ref)
      if (conn.needs_password) {
        // Reuse a previously-saved password for this exact database (host + user)
        // so we don't ask again. Otherwise ask inline, then connect.
        const known = resolvePassword(conn.host, conn.username)
        if (known) {
          phase = 'selecting'
          onselect({ ...conn, password: known })
          return
        }
        resolved = conn
        pw = ''
        phase = 'password'
      } else {
        phase = 'selecting'
        onselect(conn)
      }
    } catch (e) {
      phase = 'error'
      errorMsg = String(e)
    }
  }

  /** Merge the entered password into the resolved spec and connect. */
  function confirmPassword() {
    if (!resolved || !pw.trim()) return
    onselect({ ...resolved, password: pw })
  }

  async function handleLogout() {
    await providerLogout(provider)
    phase = 'idle'
    databases = []
    selectedRef = ''
    tokenInput = ''
    resolved = null
    pw = ''
    errorMsg = ''
    ondisconnect()
  }
</script>

<div class="flex flex-col gap-3">
  {#if phase === 'idle'}
    {#if meta?.mode === 'token'}
      <!-- Providers with no OAuth: one field and one button, same frame. -->
      <ProviderAuthPanel
        title="Connect to {meta?.name}"
        subtitle="Paste the connection string from your {meta?.name} dashboard. It is stored locally, in this app only."
        hint="Nothing leaves your machine"
      >
        {#snippet mark()}<DbIcon id={provider} class="size-4 shrink-0" />{/snippet}
        {#snippet action()}
          <Button disabled={!tokenInput.trim()} onclick={saveToken}>
            <KeyRound class="size-3.5 shrink-0" /> Continue
          </Button>
        {/snippet}
      </ProviderAuthPanel>
      <input
        type="text"
        bind:value={tokenInput}
        placeholder="postgres://…"
        aria-label="{meta?.name} connection string"
        class="h-9 w-full rounded-lg border-2 border-border bg-muted/25 px-3 font-mono text-ui-2xs outline-none transition-[border-color] focus:border-foreground/55"
        onkeydown={(e) => { if (e.key === 'Enter') saveToken() }}
      />
    {:else}
      <ProviderAuthPanel
        title="Sign in with {meta?.name}"
        subtitle="Opens your browser to authorize. Stroke receives a scoped token - your {meta?.name} password never passes through it."
        hint="Secure PKCE flow"
      >
        {#snippet mark()}<DbIcon id={provider} class="size-4 shrink-0" />{/snippet}
        {#snippet action()}
          <Button class="group" onclick={startAuth}>
            Sign in
            <ArrowRight class="size-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
          </Button>
        {/snippet}
      </ProviderAuthPanel>
    {/if}

  {:else if phase === 'authorizing'}
    <ProviderAuthPanel
      tone="busy"
      progress
      title="Waiting for {meta?.name}…"
      subtitle="Finish authorizing in the browser tab, then come back here."
      hint="Times out in 5 min"
    >
      {#snippet mark()}<DbIcon id={provider} class="size-4 shrink-0" />{/snippet}
      {#snippet action()}
        <Button variant="ghost" size="sm" onclick={cancelAuth}>
          <X class="size-3.5" /> Cancel
        </Button>
      {/snippet}
    </ProviderAuthPanel>

  {:else if phase === 'fetching'}
    <ProviderAuthPanel
      tone="busy"
      progress
      title="Signed in"
      subtitle="Loading your databases…"
      hint={meta?.name ?? ''}
    >
      {#snippet mark()}<Check class="size-4 shrink-0 text-success" />{/snippet}
    </ProviderAuthPanel>

  {:else if phase === 'error'}
    <ProviderAuthPanel tone="error" title={shownError.title} subtitle={shownError.detail} hint="Nothing was saved">
      {#snippet mark()}<AlertTriangle class="size-4 shrink-0 text-destructive" />{/snippet}
      {#snippet action()}
        <Button variant="outline" class="group" onclick={() => (phase = 'idle')}>
          <RefreshCw class="size-3.5 transition-transform duration-500 ease-[var(--ease-out)] group-hover:rotate-180" />
          Try again
        </Button>
      {/snippet}
    </ProviderAuthPanel>

  {:else if phase === 'selecting' || phase === 'building' || phase === 'password'}
    <!-- Connected header -->
    <div class="flex items-center gap-2.5 rounded-lg border border-border/40 bg-muted/[0.04] px-3 py-2.5">
      <div class="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-background">
        <DbIcon id={provider} class="size-4 text-foreground" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-1.5 text-ui-xs font-medium text-foreground">
          {meta?.name}
          <span class="inline-flex items-center gap-1 text-ui-3xs font-normal text-success"><Check class="size-3" />Connected</span>
        </p>
        <p class="text-ui-3xs text-muted-foreground/50">Pick a database to connect</p>
      </div>
      <button
        type="button"
        title="Disconnect"
        class="shrink-0 rounded p-1 text-muted-foreground/40 transition-colors hover:text-destructive"
        onclick={handleLogout}
      >
        <LogOut class="size-3.5" />
      </button>
    </div>

    {#if phase === 'password'}
      <!-- Inline password step, providers that don't expose the DB password -->
      <div class="flex flex-col gap-2.5 rounded-lg border border-border/50 p-3">
        <p class="text-ui-xs text-foreground">
          Database password for <span class="font-medium">{resolved?.name}</span>
        </p>
        <p class="text-ui-2xs leading-relaxed text-muted-foreground/70">
          {meta?.name} doesn't expose the database password through its API, enter it once.
          Find or reset it in your {meta?.name} dashboard under Database settings.
        </p>
        <div class="relative">
          <!-- svelte-ignore a11y_autofocus -->
          <input
            type={showPw ? 'text' : 'password'}
            bind:value={pw}
            autocomplete="current-password"
            autofocus
            placeholder="Database password"
            class="h-9 w-full rounded-lg border-2 border-border bg-muted/30 pl-3 pr-9 text-ui-xs outline-none transition-[border-color] focus:border-foreground/55"
            onkeydown={(e) => { if (e.key === 'Enter') confirmPassword() }}
          />
          <button
            type="button"
            tabindex={-1}
            aria-label={showPw ? 'Hide password' : 'Show password'}
            class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 transition-colors hover:text-foreground"
            onclick={() => (showPw = !showPw)}
          >
            {#if showPw}<EyeOff class="size-3.5" />{:else}<Eye class="size-3.5" />{/if}
          </button>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-lg border border-border px-3 py-2 text-center text-ui-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onclick={() => { phase = 'selecting'; selectedRef = ''; resolved = null }}
          >
            Back
          </button>
          <button
            type="button"
            class="flex-[2] inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-ui-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            disabled={!pw.trim() || phase === 'building'}
            onclick={confirmPassword}
          >
            {#if phase === 'building'}<Loader2 class="size-3.5 shrink-0 animate-spin" />Connecting…{:else}Connect{/if}
          </button>
        </div>
      </div>

    <!-- Database list -->
    {:else if databases.length > 0}
      <div class="flex flex-col overflow-hidden rounded-lg border border-border/60">
        {#if databases.length > 6}
          <div class="relative border-b border-border/50">
            <Search class="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground/40" />
            <input
              type="text"
              aria-label="Search databases"
              placeholder="Search databases…"
              bind:value={search}
              class="no-focus-ring h-8 w-full bg-transparent pl-9 pr-2.5 text-ui-xs text-foreground outline-none placeholder:text-muted-foreground/35"
              onkeydown={onSearchKeydown}
            />
          </div>
        {/if}
        <div class="db-list-scroll flex max-h-[240px] flex-col gap-0.5 overflow-y-auto p-1.5">
          {#each filtered as db, idx (db.db_ref)}
            {@const active = db.db_ref === selectedRef}
            <button
              type="button"
              class={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                active
                  ? 'bg-primary/10 text-foreground ring-1 ring-primary/25'
                  : idx === hlIdx
                    ? 'bg-accent/60 text-foreground'
                    : 'text-foreground/80 hover:bg-accent/60',
              )}
              onclick={() => pick(db.db_ref)}
            >
              <DbIcon id={provider} class={cn('size-4 shrink-0', active ? 'text-foreground' : 'text-muted-foreground/50')} />
              <span class="min-w-0 flex-1 truncate font-mono text-ui-xs leading-snug {active ? 'font-medium text-foreground' : 'text-foreground/85'}">{db.name}</span>
              {#if db.region}<span class="shrink-0 text-ui-3xs text-muted-foreground/40">{db.region}</span>{/if}
              {#if active && phase === 'building'}<Loader2 class="size-3.5 shrink-0 animate-spin text-primary" />{:else if active}<Check class="size-3.5 shrink-0 text-primary" />{/if}
            </button>
          {/each}
          {#if filtered.length === 0}
            <p class="px-2.5 py-3 text-center text-ui-2xs text-muted-foreground/45">No match for “{search}”</p>
          {/if}
        </div>
      </div>
    {:else}
      <div class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/50 px-4 py-5 text-center">
        <DbIcon id={provider} class="size-5 text-muted-foreground/25" />
        <p class="text-ui-2xs text-muted-foreground/50">No databases found on this account.</p>
        <button type="button" class="flex items-center gap-1 text-ui-3xs text-muted-foreground/40 hover:text-muted-foreground" onclick={loadDatabases}>
          <RefreshCw class="size-3" /> Retry
        </button>
      </div>
    {/if}

  {/if}
</div>

