<script>
  import { onMount }     from 'svelte'
  import { check }       from '@tauri-apps/plugin-updater'
  import { invoke }      from '@tauri-apps/api/core'
  import Download        from '@lucide/svelte/icons/download'
  import RefreshCw       from '@lucide/svelte/icons/refresh-cw'
  import X               from '@lucide/svelte/icons/x'
  import CheckCircle2    from '@lucide/svelte/icons/check-circle-2'
  import AlertCircle     from '@lucide/svelte/icons/alert-circle'
  import Loader2         from '@lucide/svelte/icons/loader-2'
  import Sparkles        from '@lucide/svelte/icons/sparkles'
  import ScrollText      from '@lucide/svelte/icons/scroll-text'
  import ExternalLink    from '@lucide/svelte/icons/external-link'
  import { cn }          from '$lib/utils.js'

  let {
    onupdatefound = /** @type {() => void} */ (() => {}),
  } = $props()

  /** @type {'idle'|'available'|'downloading'|'done'|'error'|'up-to-date'} */
  let status          = $state('idle')
  let updateVersion   = $state('')
  let releaseNotes    = $state('')
  let progress        = $state(0)
  let downloadedBytes = $state(0)
  let totalBytes      = $state(0)
  let errorMsg        = $state('')
  /** @type {import('@tauri-apps/plugin-updater').Update | null} */
  let pendingUpdate   = $state(null)
  let dismissed       = $state(false)
  let checking        = $state(false)

  /** Manually trigger an update check (e.g. from the command palette). */
  export async function checkNow() {
    if (checking || status === 'downloading') return
    dismissed = false
    checking = true
    await checkForUpdate()
    if (status === 'idle') status = 'up-to-date'
    checking = false
  }

  const visible = $derived(
    !dismissed &&
    (status === 'available' ||
     status === 'downloading' ||
     status === 'done' ||
     status === 'error' ||
     status === 'up-to-date' ||
     checking),
  )

  /** @param {number} bytes */
  function fmt(bytes) {
    if (bytes < 1024)      return `${bytes} B`
    if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`
    return `${(bytes/(1024*1024)).toFixed(1)} MB`
  }

  /**
   * Parse markdown release notes into typed sections.
   * Handles GitHub-style `### Section` + `#### Category` + `- item` lists.
   * Sub-sections inherit their parent section type so "Canvas Table" under
   * "New Features" correctly gets type='feature'.
   * @param {string} markdown
   * @returns {{ title: string; type: 'feature'|'fix'|'change'|'other'; items: string[] }[]}
   */
  function parseChangelog(markdown) {
    if (!markdown?.trim()) return []
    const lines = markdown.split('\n')
    /** @type {'feature'|'fix'|'change'|'other'} */
    let currentType = 'other'
    /** @type {{ title: string; type: 'feature'|'fix'|'change'|'other'; items: string[] } | null} */
    let current = null
    /** @type {{ title: string; type: 'feature'|'fix'|'change'|'other'; items: string[] }[]} */
    const sections = []

    for (const line of lines) {
      const trimmed = line.trim()

      if (/^#{1,3}\s/.test(trimmed)) {
        // Top-level section (## or ###) - determines the type inherited by sub-sections
        const title = trimmed.replace(/^#+\s*/, '').trim()
        const lower = title.toLowerCase()
        currentType =
          /feat|feature|add|new|what.?s new|✨|🚀|⭐|🆕/.test(lower) ? 'feature'
          : /fix|bug|patch|issue|🐛|🔧|🩹/.test(lower)               ? 'fix'
          : /change|improve|update|refactor|perf|♻️|💄|🔄|⚡/.test(lower) ? 'change'
          : 'other'
        // Only create a section for the top-level heading if it collects items directly
        current = { title, type: currentType, items: [] }
        sections.push(current)

      } else if (/^#{4,}\s/.test(trimmed)) {
        // Sub-section (#### Category) - inherits parent type
        const title = trimmed.replace(/^#+\s*/, '').trim()
        current = { title, type: currentType, items: [] }
        sections.push(current)

      } else if (/^[-*•]\s/.test(trimmed)) {
        if (!current) {
          current = { title: 'Changes', type: 'other', items: [] }
          sections.push(current)
        }
        const item = trimmed
          .replace(/^[-*•]\s*/, '')
          .replace(/\s*\(#\d+\)\s*$/, '')
          .trim()
        if (item) current.items.push(item)

      } else if (trimmed && current && current.items.length === 0 && !/^#+/.test(trimmed)) {
        // Plain text before any bullet - treat as a description item
        current.items.push(trimmed)
      }
    }

    return sections.filter((s) => s.items.length > 0)
  }

  const changelog = $derived(parseChangelog(releaseNotes))

  // Actionable states are true modals (dark backdrop, blocks the app);
  // passive states (checking / up-to-date) float without blocking.
  const isModal = $derived(
    status === 'available' ||
    status === 'downloading' ||
    status === 'done' ||
    status === 'error',
  )

  onMount(() => {
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
      releaseNotes  = update.body ?? ''
      status = 'available'
      onupdatefound()
    } catch (e) {
      console.error('[updater] check failed:', e)
      if (checking) {
        errorMsg = String(e)
        status = 'error'
      }
    }
  }

  async function install() {
    if (!pendingUpdate) return
    dismissed = false   // ensure toast / release-notes footer stays visible
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

  // Tagged so web analytics can attribute changelog views to the desktop app.
  const CHANGELOG_URL = 'https://stroke.click/changelog?utm_source=stroke-app&utm_medium=update-dialog&utm_campaign=changelog'

  /** Open the online changelog in the user's browser (never the in-app tab). */
  async function openChangelog() {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(CHANGELOG_URL)
    } catch {
      window.open(CHANGELOG_URL, '_blank', 'noopener,noreferrer')
    }
  }
</script>

<!-- ── Centered update dialog (sits above the connection modal) ───── -->
{#if visible}
  <!-- Actionable states get a dark backdrop; passive states float without blocking. -->
  <div
    class={cn(
      'fixed inset-0 z-[200] flex items-center justify-center p-4',
      !isModal && 'pointer-events-none',
    )}
    role="dialog"
    aria-modal={isModal}
    aria-label="Application update"
  >
    {#if isModal}
      <button
        type="button"
        tabindex="-1"
        aria-label="Dismiss"
        class="absolute inset-0 cursor-default bg-black/50"
        onclick={() => { if (status !== 'downloading') dismissed = true }}
      ></button>
    {/if}

    <div
      class="pointer-events-auto relative w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl shadow-black/30"
    >
      <!-- header row -->
      <div class="flex items-center gap-3 border-b border-border/40 px-5 py-3.5">
        <div class="shrink-0 rounded-xl bg-muted/50 p-2">
          {#if status === 'done' || status === 'up-to-date'}
            <CheckCircle2 class="size-4 text-green-500" />
          {:else if status === 'error'}
            <AlertCircle class="size-4 text-destructive" />
          {:else if checking}
            <Loader2 class="size-4 animate-spin text-primary/70" />
          {:else if status === 'available'}
            <Sparkles class="size-4 text-primary" />
          {:else}
            <Download class="size-4 text-primary/70" />
          {/if}
        </div>

        <span class="flex-1 whitespace-nowrap text-ui font-semibold text-foreground">
          {#if checking}
            Checking for updates…
          {:else if status === 'available'}
            Stroke {updateVersion} available
          {:else if status === 'downloading'}
            Downloading update…
          {:else if status === 'done'}
            Ready to install
          {:else if status === 'error'}
            Update failed
          {:else if status === 'up-to-date'}
            Up to date
          {/if}
        </span>

        {#if status !== 'downloading'}
          <button
            type="button"
            onclick={() => (dismissed = true)}
            class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Dismiss"
          >
            <X class="size-4" />
          </button>
        {/if}
      </div>

      <!-- body -->
      <div class="px-5 py-4 text-ui-sm">

        {#if status === 'available'}
          <p class="mb-4 text-ui-sm text-muted-foreground">A new version is ready to install.</p>
          <div class="flex gap-2.5">
            <button
              type="button"
              onclick={openChangelog}
              class="inline-flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 text-ui-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ScrollText class="size-3.5 shrink-0" />
              Release Notes
            </button>
            <button
              type="button"
              onclick={() => void install()}
              class="inline-flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 text-ui-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Download class="size-3.5 shrink-0" />
              Install
            </button>
          </div>

        {:else if status === 'downloading'}
          <div class="flex flex-col gap-2.5">
            <div class="flex items-center justify-between text-ui-xs text-muted-foreground">
              <span>{totalBytes > 0 ? `${fmt(downloadedBytes)} / ${fmt(totalBytes)}` : 'Downloading…'}</span>
              <span class="font-mono tabular-nums">{progress}%</span>
            </div>
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full bg-primary transition-all duration-150"
                style="width:{progress}%"
              ></div>
            </div>
            <p class="text-ui-xs text-muted-foreground">
              Stroke <span class="font-mono font-medium text-foreground">{updateVersion}</span>
            </p>
          </div>

        {:else if status === 'done'}
          <p class="mb-4 text-ui-sm text-muted-foreground">
            Version <span class="font-mono font-medium text-foreground">{updateVersion}</span> downloaded. Restart to apply.
          </p>
          <div class="flex gap-2.5">
            {#if changelog.length > 0}
              <button
                type="button"
                onclick={openChangelog}
                class="inline-flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 text-ui-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ScrollText class="size-3.5 shrink-0" />
                What's New
              </button>
            {/if}
            <button
              type="button"
              onclick={() => void restart()}
              class="inline-flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 text-ui-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <RefreshCw class="size-3.5 shrink-0" />
              Restart now
            </button>
          </div>

        {:else if status === 'error'}
          <p class="font-mono text-ui-xs text-destructive">{errorMsg}</p>

        {:else if status === 'up-to-date' || checking}
          <p class="text-ui-sm leading-relaxed text-muted-foreground">
            {checking ? 'Checking GitHub for a newer release…' : "You're on the latest version."}
          </p>
          {#if !checking}
            <button
              type="button"
              onclick={openChangelog}
              class="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-ui-sm text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-[0.97]"
            >
              <ScrollText class="size-3.5 shrink-0" />
              View changelog
              <ExternalLink class="ml-0.5 size-3 shrink-0 text-muted-foreground/60" />
            </button>
          {/if}
        {/if}

      </div>
    </div>
  </div>
{/if}
