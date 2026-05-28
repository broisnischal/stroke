<script>
  import { onMount } from 'svelte'
  import { check } from '@tauri-apps/plugin-updater'
  import { invoke } from '@tauri-apps/api/core'
  import { cn } from '$lib/utils.js'
  import Download from '@lucide/svelte/icons/download'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import X from '@lucide/svelte/icons/x'
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2'
  import AlertCircle from '@lucide/svelte/icons/alert-circle'
  import Loader2 from '@lucide/svelte/icons/loader-2'

  /** @type {'idle'|'available'|'downloading'|'done'|'error'|'up-to-date'} */
  let status = $state('idle')
  let updateVersion = $state('')
  let releaseNotes = $state('')
  let progress = $state(0)
  let downloadedBytes = $state(0)
  let totalBytes = $state(0)
  let errorMsg = $state('')
  /** @type {import('@tauri-apps/plugin-updater').Update | null} */
  let pendingUpdate = $state(null)

  let dismissed = $state(false)
  let checking = $state(false)

  /** Call this to manually trigger an update check (e.g. from the command palette). */
  export async function checkNow() {
    if (checking || status === 'downloading') return
    dismissed = false
    checking = true
    await checkForUpdate()
    if (status === 'idle') status = 'up-to-date'
    checking = false
  }

  const visible = $derived(
    !dismissed && (status === 'available' || status === 'downloading' || status === 'done' || status === 'error' || status === 'up-to-date' || checking),
  )

  function fmt(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  onMount(() => {
    // Skip in Vite dev mode — no GitHub release/latest.json exists for local builds.
    // Don't use `location.protocol === 'http:'` here: macOS Tauri 2 uses `tauri:`,
    // but Linux (WebKitGTK) and Windows (WebView2) production builds use
    // `http://tauri.localhost` — so a protocol check would silently disable the
    // updater on those platforms. import.meta.env.DEV is set at compile time
    // by Vite and is reliable across all platforms.
    if (import.meta.env.DEV) return
    const t = setTimeout(() => void checkForUpdate(), 3000)
    return () => clearTimeout(t)
  })

  async function checkForUpdate() {
    try {
      const update = await check()
      if (!update) {
        console.info('[updater] no update available')
        return
      }
      console.info('[updater] update available:', update.version)
      pendingUpdate = update
      updateVersion = update.version
      releaseNotes = update.body ?? ''
      status = 'available'
    } catch (e) {
      // Always log so issues are visible via devtools. Only show the error UI
      // when manually triggered — background checks shouldn't interrupt the user.
      console.error('[updater] check failed:', e)
      if (checking) {
        errorMsg = String(e)
        status = 'error'
      }
    }
  }

  async function install() {
    if (!pendingUpdate) return
    status = 'downloading'
    progress = 0
    downloadedBytes = 0
    totalBytes = 0
    try {
      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          totalBytes = event.data.contentLength ?? 0
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength
          if (totalBytes > 0) progress = Math.round((downloadedBytes / totalBytes) * 100)
        } else if (event.event === 'Finished') {
          progress = 100
        }
      })
      status = 'done'
    } catch (e) {
      errorMsg = String(e)
      status = 'error'
    }
  }

  async function restart() {
    await invoke('restart_app')
  }
</script>

{#if visible}
  <div
    class="fixed bottom-4 right-4 z-50 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-lg shadow-black/10"
    role="dialog"
    aria-label="Application update"
  >
    <!-- header -->
    <div class="flex items-center gap-2.5 border-b border-border px-4 py-3">
      {#if status === 'done' || status === 'up-to-date'}
        <CheckCircle2 class="size-4 shrink-0 text-green-500" />
      {:else if status === 'error'}
        <AlertCircle class="size-4 shrink-0 text-destructive" />
      {:else if checking}
        <Loader2 class="size-4 shrink-0 animate-spin text-primary/70" />
      {:else}
        <Download class="size-4 shrink-0 text-primary/70" />
      {/if}
      <span class="flex-1 text-ui-sm font-medium text-foreground">
        {#if checking}Checking for updates…{:else if status === 'available'}Update available{:else if status === 'downloading'}Downloading update…{:else if status === 'done'}Ready to install{:else if status === 'error'}Update failed{:else if status === 'up-to-date'}Up to date{/if}
      </span>
      {#if status !== 'downloading'}
        <button
          type="button"
          onclick={() => (dismissed = true)}
          class="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
        >
          <X class="size-3" />
        </button>
      {/if}
    </div>

    <!-- body -->
    <div class="px-4 py-3 text-ui-sm">
      {#if status === 'available'}
        <p class="text-muted-foreground">
          DB Studio <span class="font-mono font-medium text-foreground">{updateVersion}</span> is available.
        </p>
        {#if releaseNotes}
          <p class="mt-1.5 line-clamp-3 text-ui-xs text-muted-foreground/80">{releaseNotes}</p>
        {/if}
        <div class="mt-3 flex gap-2">
          <button
            type="button"
            onclick={() => (dismissed = true)}
            class="flex-1 rounded-md border border-border px-3 py-1.5 text-center text-ui-xs text-muted-foreground hover:bg-muted"
          >
            Later
          </button>
          <button
            type="button"
            onclick={() => void install()}
            class="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-ui-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <Download class="size-3" />
            Install now
          </button>
        </div>

      {:else if status === 'downloading'}
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between text-ui-xs text-muted-foreground">
            <span>{totalBytes > 0 ? `${fmt(downloadedBytes)} / ${fmt(totalBytes)}` : 'Downloading…'}</span>
            <span>{progress}%</span>
          </div>
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              class="h-full rounded-full bg-primary transition-all duration-150"
              style="width: {progress}%"
            ></div>
          </div>
        </div>

      {:else if status === 'done'}
        <p class="text-muted-foreground">
          Version <span class="font-mono font-medium text-foreground">{updateVersion}</span> downloaded. Restart to apply.
        </p>
        <button
          type="button"
          onclick={() => void restart()}
          class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-ui-xs font-medium text-primary-foreground hover:opacity-90"
        >
          <RefreshCw class="size-3" />
          Restart now
        </button>

      {:else if status === 'error'}
        <p class="font-mono text-ui-xs text-destructive">{errorMsg}</p>

      {:else if status === 'up-to-date' || checking}
        <p class="text-muted-foreground">
          {checking ? 'Checking GitHub for a newer release…' : 'You\'re on the latest version.'}
        </p>
      {/if}
    </div>
  </div>
{/if}
