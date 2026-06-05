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
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import Bug from '@lucide/svelte/icons/bug'
  import Wrench from '@lucide/svelte/icons/wrench'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'

  let {
    onupdatefound = /** @type {() => void} */ (() => {}),
  } = $props()

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
    !dismissed &&
      (status === 'available' ||
        status === 'downloading' ||
        status === 'done' ||
        status === 'error' ||
        status === 'up-to-date' ||
        checking),
  )

  function fmt(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  /**
   * Parse markdown release notes into typed sections.
   * Handles GitHub-style `## Heading` + `- item` lists.
   * @param {string} markdown
   * @returns {{ title: string; type: 'feature'|'fix'|'change'|'other'; items: string[] }[]}
   */
  function parseChangelog(markdown) {
    if (!markdown?.trim()) return []
    const lines = markdown.split('\n')
    /** @type {{ title: string; type: 'feature'|'fix'|'change'|'other'; items: string[] }[]} */
    const sections = []
    /** @type {{ title: string; type: 'feature'|'fix'|'change'|'other'; items: string[] } | null} */
    let current = null

    for (const line of lines) {
      const trimmed = line.trim()
      if (/^#{1,3}\s/.test(trimmed)) {
        const title = trimmed.replace(/^#+\s*/, '').trim()
        const lower = title.toLowerCase()
        /** @type {'feature'|'fix'|'change'|'other'} */
        const type =
          /feat|feature|add|new|what.?s new|✨|🚀|⭐|🆕/.test(lower)
            ? 'feature'
            : /fix|bug|patch|issue|🐛|🔧|🩹/.test(lower)
              ? 'fix'
              : /change|improve|update|refactor|perf|♻️|💄|🔄|⚡/.test(lower)
                ? 'change'
                : 'other'
        current = { title, type, items: [] }
        sections.push(current)
      } else if (/^[-*•]\s/.test(trimmed) && current) {
        // strip leading marker and any trailing PR/commit refs like "(#123)"
        const item = trimmed
          .replace(/^[-*•]\s*/, '')
          .replace(/\s*\(#\d+\)\s*$/, '')
          .trim()
        if (item) current.items.push(item)
      } else if (trimmed && current && current.items.length === 0 && !/^#{1,3}\s/.test(trimmed)) {
        // treat a non-empty non-header line before any bullets as a description item
        current.items.push(trimmed)
      }
    }

    return sections.filter((s) => s.items.length > 0)
  }

  const changelog = $derived(parseChangelog(releaseNotes))

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
      releaseNotes = update.body ?? ''
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
  {#if status === 'available'}
    <!-- Full-screen modal for update available -->
    <div
      role="none"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onclick={(e) => e.target === e.currentTarget && (dismissed = true)}
    >
      <div
        class="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/30"
        role="dialog"
        aria-label="Update available"
        aria-modal="true"
      >
        <!-- header -->
        <div class="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
          <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles class="size-4 text-primary" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-foreground">DB Studio {updateVersion} is ready</p>
            <p class="mt-0.5 text-xs text-muted-foreground">A new version is available to install</p>
          </div>
          <button
            type="button"
            onclick={() => (dismissed = true)}
            class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Dismiss"
          >
            <X class="size-3.5" />
          </button>
        </div>

        <!-- changelog body -->
        {#if changelog.length > 0}
          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <p class="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">What's new</p>
            <div class="flex flex-col gap-4">
              {#each changelog as section}
                <div>
                  <div class="mb-1.5 flex items-center gap-1.5">
                    {#if section.type === 'feature'}
                      <Sparkles class="size-3.5 text-emerald-500" />
                    {:else if section.type === 'fix'}
                      <Bug class="size-3.5 text-orange-500" />
                    {:else if section.type === 'change'}
                      <Wrench class="size-3.5 text-blue-500" />
                    {:else}
                      <ArrowRight class="size-3.5 text-muted-foreground" />
                    {/if}
                    <span class="text-xs font-semibold
                      {section.type === 'feature' ? 'text-emerald-500' :
                       section.type === 'fix' ? 'text-orange-500' :
                       section.type === 'change' ? 'text-blue-500' :
                       'text-muted-foreground'}"
                    >{section.title}</span>
                  </div>
                  <ul class="ml-5 flex flex-col gap-1">
                    {#each section.items as item}
                      <li class="flex gap-2 text-xs text-muted-foreground">
                        <span class="mt-1.5 size-1 shrink-0 rounded-full bg-border"></span>
                        <span>{item}</span>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/each}
            </div>
          </div>
        {:else if releaseNotes}
          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <p class="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Release notes</p>
            <p class="whitespace-pre-wrap text-xs text-muted-foreground">{releaseNotes}</p>
          </div>
        {:else}
          <div class="px-5 py-4">
            <p class="text-xs text-muted-foreground">No release notes available for this version.</p>
          </div>
        {/if}

        <!-- footer actions -->
        <div class="shrink-0 border-t border-border px-5 py-3">
          <div class="flex gap-2">
            <button
              type="button"
              onclick={() => (dismissed = true)}
              class="flex-1 rounded-lg border border-border px-4 py-2 text-center text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Later
            </button>
            <button
              type="button"
              onclick={() => void install()}
              class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              <Download class="size-3.5" />
              Install update
            </button>
          </div>
        </div>
      </div>
    </div>
  {:else}
    <!-- Compact corner toast for all other states -->
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
          {#if checking}Checking for updates…{:else if status === 'downloading'}Downloading update…{:else if status === 'done'}Ready to install{:else if status === 'error'}Update failed{:else if status === 'up-to-date'}Up to date{/if}
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
        {#if status === 'downloading'}
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
            <p class="text-ui-xs text-muted-foreground">
              DB Studio <span class="font-mono font-medium text-foreground">{updateVersion}</span>
            </p>
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
            {checking ? 'Checking GitHub for a newer release…' : "You're on the latest version."}
          </p>
        {/if}
      </div>
    </div>
  {/if}
{/if}
