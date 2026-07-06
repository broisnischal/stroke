<script>
  // One-flow provider sign-in: authorize (OAuth) or paste a token, list every
  // database on the account, and hand a ready-to-connect spec to the parent.
  // Generalized from CloudflareLogin.svelte across all provider adapters.
  import { onMount } from 'svelte'
  import Check from '@lucide/svelte/icons/check'
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import LogOut from '@lucide/svelte/icons/log-out'
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import DbIcon from './DbIcon.svelte'
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

  onMount(async () => {
    try {
      const status = await providerOAuthStatus(provider)
      if (status.connected) {
        phase = 'fetching'
        await loadDatabases()
      }
    } catch { /* stay idle */ }
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

  async function pick(ref) {
    selectedRef = ref
    phase = 'building'
    try {
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
    <!-- Not connected — left-aligned, no card -->
    <div class="flex flex-col gap-5 py-1">
      <div class="flex items-center gap-3.5">
        <div class="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/25">
          <DbIcon id={provider} class="size-6 text-foreground" />
        </div>
        <div class="min-w-0">
          <p class="text-[15px] font-semibold text-foreground">Connect with {meta?.name}</p>
          <p class="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{meta?.blurb}</p>
        </div>
      </div>

      {#if meta?.mode === 'token'}
        <div class="flex flex-col gap-2">
          <input
            type="text"
            bind:value={tokenInput}
            placeholder="postgres://…"
            class="h-9 w-full rounded-lg border border-border/60 bg-muted/25 px-3 font-mono text-[11px] outline-none transition-[border-color,box-shadow] focus:border-ring focus:ring-2 focus:ring-ring/20"
            onkeydown={(e) => { if (e.key === 'Enter') saveToken() }}
          />
          <button
            type="button"
            class="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-[13px] font-semibold text-background transition-colors hover:bg-foreground/85 disabled:opacity-40"
            disabled={!tokenInput.trim()}
            onclick={saveToken}
          >
            <KeyRound class="size-4" /> Continue
          </button>
        </div>
      {:else}
        <div class="flex flex-col gap-2.5">
          <button
            type="button"
            class="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-[13px] font-semibold text-background transition-colors hover:bg-foreground/85"
            onclick={startAuth}
          >
            <DbIcon id={provider} class="size-4" />
            Sign in with {meta?.name}
          </button>
          <p class="text-[11px] text-muted-foreground/45">Opens your browser to authorize · secure PKCE flow</p>
        </div>
      {/if}
    </div>

  {:else if phase === 'authorizing'}
    <div class="flex flex-col gap-4 py-2">
      <div class="flex items-center gap-3.5">
        <div class="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/25">
          <Loader2 class="size-5 animate-spin text-foreground" />
        </div>
        <div class="min-w-0">
          <p class="text-[14px] font-semibold text-foreground">Waiting for {meta?.name}…</p>
          <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">Authorize Stroke in the browser tab, then return here. Times out in 5 min.</p>
        </div>
      </div>
      <button
        type="button"
        class="h-9 w-full rounded-lg border border-border/60 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        onclick={cancelAuth}
      >
        Cancel
      </button>
    </div>

  {:else if phase === 'fetching'}
    <div class="flex items-center gap-2.5 py-2 text-[12.5px] text-muted-foreground">
      <Loader2 class="size-4 animate-spin" /> Loading your databases…
    </div>

  {:else if phase === 'selecting' || phase === 'building' || phase === 'password'}
    <!-- Connected header -->
    <div class="flex items-center gap-2.5 rounded-lg border border-border/40 bg-muted/[0.04] px-3 py-2.5">
      <div class="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-background">
        <DbIcon id={provider} class="size-4 text-foreground" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
          {meta?.name}
          <span class="inline-flex items-center gap-1 text-[10px] font-normal text-emerald-500"><Check class="size-3" />Connected</span>
        </p>
        <p class="text-[10px] text-muted-foreground/50">Pick a database to connect</p>
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
      <!-- Inline password step — providers that don't expose the DB password -->
      <div class="flex flex-col gap-2.5 rounded-lg border border-border/50 p-3">
        <p class="text-[12px] text-foreground">
          Database password for <span class="font-medium">{resolved?.name}</span>
        </p>
        <p class="text-[11px] leading-relaxed text-muted-foreground/70">
          {meta?.name} doesn't expose the database password through its API — enter it once.
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
            class="h-9 w-full rounded-lg border border-border bg-muted/30 pl-3 pr-9 text-[12px] outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
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
            class="flex-1 rounded-lg border border-border px-3 py-2 text-center text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onclick={() => { phase = 'selecting'; selectedRef = ''; resolved = null }}
          >
            Back
          </button>
          <button
            type="button"
            class="flex-[2] rounded-lg bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            disabled={!pw.trim()}
            onclick={confirmPassword}
          >
            Connect
          </button>
        </div>
      </div>

    <!-- Database list -->
    {:else if databases.length > 0}
      <div class="flex flex-col overflow-hidden rounded-lg border border-border/50">
        {#if databases.length > 6}
          <div class="relative border-b border-border/40">
            <Search class="pointer-events-none absolute top-1/2 left-2.5 size-3 -translate-y-1/2 text-muted-foreground/40" />
            <input
              type="text"
              placeholder="Search databases…"
              bind:value={search}
              class="h-8 w-full bg-transparent pl-7 pr-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/35"
              onkeydown={(e) => { if (e.key === 'Escape') search = '' }}
            />
          </div>
        {/if}
        <div class="db-list-scroll flex max-h-[220px] flex-col gap-0.5 overflow-y-auto p-1.5">
          {#each filtered as db (db.db_ref)}
            {@const active = db.db_ref === selectedRef}
            <button
              type="button"
              class={cn(
                'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors',
                active ? 'bg-primary/15 ring-1 ring-primary/30' : 'hover:bg-muted/50',
              )}
              onclick={() => pick(db.db_ref)}
            >
              <DbIcon id={provider} class={cn('size-3.5', active ? 'text-foreground' : 'text-muted-foreground/45')} />
              <span class="min-w-0 flex-1 truncate font-mono text-[12px] font-medium leading-snug {active ? 'text-foreground' : 'text-foreground/85'}">{db.name}</span>
              {#if db.region}<span class="shrink-0 text-[10px] text-muted-foreground/40">{db.region}</span>{/if}
              {#if active && phase === 'building'}<Loader2 class="size-3.5 shrink-0 animate-spin text-primary" />{:else if active}<Check class="size-3.5 shrink-0 text-primary" />{/if}
            </button>
          {/each}
          {#if filtered.length === 0}
            <p class="px-2.5 py-3 text-center text-[11px] text-muted-foreground/45">No match for “{search}”</p>
          {/if}
        </div>
      </div>
    {:else}
      <div class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/50 px-4 py-5 text-center">
        <DbIcon id={provider} class="size-5 text-muted-foreground/25" />
        <p class="text-[11px] text-muted-foreground/50">No databases found on this account.</p>
        <button type="button" class="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground" onclick={loadDatabases}>
          <RefreshCw class="size-3" /> Retry
        </button>
      </div>
    {/if}

  {:else if phase === 'error'}
    <div class="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/[0.06] px-3 py-3">
      <div class="flex items-start gap-2 text-[11px] text-destructive">
        <AlertTriangle class="mt-0.5 size-3.5 shrink-0" />
        <span class="break-words">{errorMsg || 'Something went wrong.'}</span>
      </div>
      <button
        type="button"
        class="self-start text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        onclick={() => (phase = 'idle')}
      >Try again</button>
    </div>
  {/if}
</div>
