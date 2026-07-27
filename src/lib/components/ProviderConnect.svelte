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
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import X from '@lucide/svelte/icons/x'
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
    <!-- Not connected — compact CTA (the selected provider row above already
         carries the icon + name + blurb, so no redundant hero here). -->
    {#if meta?.mode === 'token'}
      <div class="flex flex-col gap-2">
        <input
          type="text"
          bind:value={tokenInput}
          placeholder="postgres://…"
          class="h-9 w-full rounded-lg border-2 border-border bg-muted/25 px-3 font-mono text-ui-2xs outline-none transition-[border-color] focus:border-foreground/55"
          onkeydown={(e) => { if (e.key === 'Enter') saveToken() }}
        />
        <button
          type="button"
          class="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-ui-sm font-medium text-background shadow-sm transition-[background-color,transform] duration-150 ease-out hover:bg-foreground/90 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
          disabled={!tokenInput.trim()}
          onclick={saveToken}
        >
          <KeyRound class="size-4" /> Continue
        </button>
        <p class="text-ui-xs text-muted-foreground">Paste your {meta?.name} connection string to continue.</p>
      </div>
    {:else}
      <div class="flex flex-col gap-2">
        <button
          type="button"
          class="group flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-ui-sm font-medium text-background shadow-sm transition-[background-color,transform] duration-150 ease-out hover:bg-foreground/90 active:scale-[0.98]"
          onclick={startAuth}
        >
          <DbIcon id={provider} class="size-4 shrink-0" />
          <span>Sign in with {meta?.name}</span>
          <ArrowRight class="size-4 shrink-0 transition-transform duration-150 ease-out group-hover:translate-x-0.5" />
        </button>
        <p class="text-ui-xs text-muted-foreground">Opens your browser to authorize · secure PKCE flow</p>
      </div>
    {/if}

  {:else if phase === 'authorizing'}
    <div class="flex flex-col gap-3.5 rounded-lg border border-border/40 bg-muted/[0.03] p-4">
      <div class="flex items-center gap-3.5">
        <!-- Provider mark with a live pulse ring — reads as "waiting on this one". -->
        <div class="relative flex size-11 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background">
          <span class="pulse-ring pointer-events-none absolute inset-0 rounded-lg ring-1 ring-primary/40"></span>
          <DbIcon id={provider} class="size-5 text-foreground" />
        </div>
        <div class="min-w-0">
          <p class="text-ui-sm font-semibold leading-tight text-foreground">Waiting for {meta?.name}…</p>
          <p class="mt-1 text-ui-xs leading-relaxed text-pretty text-muted-foreground">
            Finish authorizing in the browser tab, then come back here.
          </p>
        </div>
      </div>
      <!-- Indeterminate progress — quiet proof the flow is still alive. -->
      <div class="h-1 overflow-hidden rounded-full bg-muted/60">
        <span class="progress-slide block h-full w-1/3 rounded-full bg-primary/70"></span>
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-ui-2xs tabular-nums text-muted-foreground/50">Times out in 5 min</span>
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border/50 px-2.5 text-ui-2xs font-medium text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted/50 hover:text-foreground active:scale-[0.96]"
          onclick={cancelAuth}
        >
          <X class="size-3" /> Cancel
        </button>
      </div>
    </div>

  {:else if phase === 'fetching'}
    <div class="flex items-center gap-2.5 py-2 text-ui-xs text-muted-foreground">
      <Loader2 class="size-4 animate-spin" /> Loading your databases…
    </div>

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
      <!-- Inline password step — providers that don't expose the DB password -->
      <div class="flex flex-col gap-2.5 rounded-lg border border-border/50 p-3">
        <p class="text-ui-xs text-foreground">
          Database password for <span class="font-medium">{resolved?.name}</span>
        </p>
        <p class="text-ui-2xs leading-relaxed text-muted-foreground/70">
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
                  ? 'bg-accent text-foreground'
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

  {:else if phase === 'error'}
    <div class="err-card overflow-hidden rounded-lg border border-border/70 bg-card shadow-[var(--elevate-1)]">
      <div class="flex items-start gap-3 p-4">
        <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/15">
          <AlertTriangle class="size-[18px]" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-ui-sm font-semibold leading-snug text-foreground">{shownError.title}</p>
          <p class="mt-1.5 break-words rounded-md bg-muted/40 px-2 py-1.5 font-mono text-ui-2xs leading-relaxed text-muted-foreground select-text">{shownError.detail}</p>
        </div>
      </div>
      <div class="flex items-center justify-end border-t border-border/50 bg-muted/[0.15] px-3 py-2.5">
        <button
          type="button"
          class="group inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3.5 text-ui-xs font-medium text-background shadow-sm transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-foreground/90 active:scale-[0.97]"
          onclick={() => (phase = 'idle')}
        >
          <RefreshCw class="size-3.5 transition-transform duration-500 ease-[var(--ease-out)] group-hover:rotate-180" /> Try again
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Expanding pulse ring on the provider mark while awaiting the browser. */
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

  /* Error card entrance — a calm rise + settle (never scale from 0). */
  @keyframes err-in {
    from { opacity: 0; transform: translateY(6px) scale(0.985); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .err-card { animation: err-in 240ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)) both; }

  @media (prefers-reduced-motion: reduce) {
    .pulse-ring { animation: none; opacity: 0.4; }
    .progress-slide { animation: none; width: 100%; opacity: 0.5; }
    .err-card { animation: none; }
  }
</style>
