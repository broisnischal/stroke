<script>
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import Cloud from '@lucide/svelte/icons/cloud'
  import CloudUpload from '@lucide/svelte/icons/cloud-upload'
  import CloudDownload from '@lucide/svelte/icons/cloud-download'
  import LogOut from '@lucide/svelte/icons/log-out'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import Check from '@lucide/svelte/icons/check'
  import ExternalLink from '@lucide/svelte/icons/external-link'
  import Copy from '@lucide/svelte/icons/copy'
  import {
    githubSync,
    githubAuthStart,
    githubAuthPoll,
  } from '$lib/stores/github-sync.svelte.js'
  import { toast } from 'svelte-sonner'

  let {
    open = $bindable(false),
    onpull = /** @type {(conns: any[]) => void} */ (() => {}),
    onpush = /** @type {() => Promise<void>} */ (async () => {}),
  } = $props()

  /** @type {'idle' | 'waiting' | 'polling' | 'done' | 'error'} */
  let flowStep = $state('idle')
  let userCode = $state('')
  let verificationUri = $state('')
  let flowError = $state('')
  let copied = $state(false)
  /** @type {ReturnType<typeof setInterval> | null} */
  let pollTimer = null

  const loggedIn = $derived(githubSync.user !== null)

  function handleOpenChange(/** @type {boolean} */ next) {
    if (!next) cancelFlow()
  }

  async function startLogin() {
    flowError = ''
    flowStep = 'waiting'
    try {
      const resp = await githubAuthStart()
      userCode = resp.user_code
      verificationUri = resp.verification_uri
      flowStep = 'polling'

      const intervalMs = Math.max((resp.interval ?? 5) * 1000, 5000)
      const expiresAt = Date.now() + resp.expires_in * 1000

      pollTimer = setInterval(async () => {
        if (Date.now() > expiresAt) {
          cancelFlow()
          flowError = 'Code expired. Please try again.'
          flowStep = 'error'
          return
        }
        try {
          const result = await githubAuthPoll(resp.device_code)
          if (result) {
            clearInterval(/** @type {any} */ (pollTimer))
            pollTimer = null
            githubSync._setFromPoll(result)   // set user + token in one shot
            flowStep = 'done'
            toast.success(`Signed in as @${result.user.login}`)
          }
        } catch (e) {
          clearInterval(/** @type {any} */ (pollTimer))
          pollTimer = null
          flowError = String(e)
          flowStep = 'error'
        }
      }, intervalMs)
    } catch (e) {
      flowError = String(e)
      flowStep = 'error'
    }
  }

  function cancelFlow() {
    if (pollTimer) { clearInterval(/** @type {any} */ (pollTimer)); pollTimer = null }
    if (flowStep !== 'done') flowStep = 'idle'
    userCode = ''
    verificationUri = ''
  }

  async function logout() {
    await githubSync.logout()
    flowStep = 'idle'
    toast.success('Signed out')
  }

  async function handlePush() {
    try {
      await onpush()
      toast.success('Connections pushed to GitHub')
    } catch (e) {
      toast.error(String(e))
    }
  }

  async function handlePull() {
    try {
      const conns = await githubSync.pull()
      if (conns && conns.length > 0) {
        onpull(conns)
        toast.success(`Pulled ${conns.length} connection${conns.length === 1 ? '' : 's'}`)
        open = false
      } else {
        toast.info('No saved connections found in your sync yet')
      }
    } catch (e) {
      toast.error(String(e))
    }
  }

  async function copyCode() {
    await navigator.clipboard.writeText(userCode)
    copied = true
    setTimeout(() => { copied = false }, 2000)
  }

  async function openGitHub() {
    const url = verificationUri || 'https://github.com/login/device'
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(url)
    } catch {
      window.open(url, '_blank')
    }
  }

  const lastSynced = $derived(
    githubSync.lastSyncedAt
      ? new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(githubSync.lastSyncedAt))
      : null
  )
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Content class="gap-0 overflow-hidden p-0 sm:max-w-[20rem]">
    <Dialog.Header class="space-y-1 px-5 pt-5 pb-1">
      <Dialog.Title class="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <Cloud class="size-4" />
        GitHub Sync
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        Save and restore your connections via GitHub
      </Dialog.Description>
    </Dialog.Header>

    <div class="px-5 py-4 space-y-3">

      {#if loggedIn}
        <!-- Logged-in view -->
        <div class="flex items-center gap-3 rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5">
          <img
            src={githubSync.user?.avatar_url}
            alt={githubSync.user?.login}
            class="size-8 rounded-full border border-border/60"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-medium">{githubSync.user?.name ?? githubSync.user?.login}</p>
            <p class="truncate text-[10px] text-muted-foreground">@{githubSync.user?.login}</p>
          </div>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground transition-colors"
            onclick={logout}
            title="Sign out"
          >
            <LogOut class="size-3.5" />
          </button>
        </div>

        {#if lastSynced}
          <p class="text-[10px] text-muted-foreground/60 text-center">Last synced at {lastSynced}</p>
        {/if}

        {#if githubSync.error}
          <p class="rounded bg-destructive/10 px-3 py-2 text-[11px] text-destructive">{githubSync.error}</p>
        {/if}

        <div class="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" class="gap-1.5 text-xs" disabled={githubSync.syncing} onclick={handlePush}>
            {#if githubSync.syncing}
              <RefreshCw class="size-3.5 animate-spin" />
            {:else}
              <CloudUpload class="size-3.5" />
            {/if}
            Push
          </Button>
          <Button variant="outline" size="sm" class="gap-1.5 text-xs" disabled={githubSync.syncing} onclick={handlePull}>
            {#if githubSync.syncing}
              <RefreshCw class="size-3.5 animate-spin" />
            {:else}
              <CloudDownload class="size-3.5" />
            {/if}
            Pull
          </Button>
        </div>

        <p class="text-[10px] text-muted-foreground/60 leading-relaxed">
          <strong>Push</strong> saves your connections to GitHub.
          <strong>Pull</strong> restores them on this machine.
        </p>

      {:else if flowStep === 'polling'}
        <!-- Device code display -->
        <div class="space-y-3 text-center">
          <p class="text-xs text-muted-foreground">Enter this code on GitHub:</p>
          <div class="flex items-center justify-center gap-2">
            <span class="rounded-lg border border-border bg-muted/50 px-4 py-2 font-mono text-lg font-bold tracking-widest select-all">
              {userCode}
            </span>
            <button type="button" class="text-muted-foreground hover:text-foreground transition-colors" onclick={copyCode} title="Copy">
              {#if copied}
                <Check class="size-4 text-green-500" />
              {:else}
                <Copy class="size-4" />
              {/if}
            </button>
          </div>
          <Button variant="outline" size="sm" class="gap-1.5 text-xs w-full" onclick={openGitHub}>
            <ExternalLink class="size-3.5" />
            Open github.com/login/device
          </Button>
          <div class="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <RefreshCw class="size-3 animate-spin" />
            Waiting for authorization…
          </div>
          <button type="button" class="text-[11px] text-muted-foreground hover:text-foreground" onclick={cancelFlow}>
            Cancel
          </button>
        </div>

      {:else if flowStep === 'done'}
        <div class="flex flex-col items-center gap-2 py-2 text-center">
          <div class="flex size-10 items-center justify-center rounded-full bg-green-500/10">
            <Check class="size-5 text-green-500" />
          </div>
          <p class="text-xs font-medium">Signed in successfully</p>
        </div>

      {:else if flowStep === 'error'}
        <p class="rounded bg-destructive/10 px-3 py-2 text-[11px] text-destructive">{flowError}</p>
        <Button variant="outline" size="sm" class="w-full text-xs" onclick={() => { flowStep = 'idle'; flowError = '' }}>
          Try again
        </Button>

      {:else}
        <!-- Login prompt -->
        <p class="text-xs text-muted-foreground leading-relaxed">
          Sign in with GitHub to sync your saved connections across machines.
        </p>
        <Button class="w-full gap-2 text-xs" size="sm" disabled={flowStep === 'waiting'} onclick={startLogin}>
          <Cloud class="size-3.5" />
          {flowStep === 'waiting' ? 'Starting…' : 'Login with GitHub'}
        </Button>
      {/if}

    </div>
  </Dialog.Content>
</Dialog.Root>
