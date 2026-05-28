<script>
  import { onMount } from 'svelte'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { licenseStatus, deactivateLicense, refreshLicenseStatus } from '$lib/stores/license.js'
  import LicenseActivation from './LicenseActivation.svelte'
  import Database from '@lucide/svelte/icons/database'
  import ShieldCheck from '@lucide/svelte/icons/shield-check'
  import Clock from '@lucide/svelte/icons/clock'
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle'
  import KeyRound from '@lucide/svelte/icons/key-round'
  import ExternalLink from '@lucide/svelte/icons/external-link'

  let { open = $bindable(false) } = $props()

  let appVersion = $state('—')
  let showActivate = $state(false)
  let deactivating = $state(false)

  onMount(async () => {
    try {
      const { getVersion } = await import('@tauri-apps/api/app')
      appVersion = await getVersion()
    } catch {
      // browser / dev fallback
      appVersion = 'dev'
    }
  })

  async function handleDeactivate() {
    deactivating = true
    await deactivateLicense()
    deactivating = false
    showActivate = false
  }

  function handleOpenChange(next) {
    open = next
    if (!next) showActivate = false
  }

  const licenseColor = $derived.by(() => {
    const s = $licenseStatus
    if (!s) return ''
    if (s.status === 'Valid') return 'text-green-600 dark:text-green-400'
    if (s.status === 'Trial') return s.days_remaining <= 1 ? 'text-destructive' : s.days_remaining <= 3 ? 'text-amber-500' : 'text-muted-foreground'
    return 'text-destructive'
  })
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
  <Dialog.Content class="w-full max-w-sm gap-0 overflow-hidden p-0">

    <!-- Hero -->
    <div class="flex flex-col items-center gap-3 bg-muted/30 px-8 py-8 text-center border-b border-border/60">
      <div class="flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20 shadow-sm">
        <Database class="size-7 text-primary" />
      </div>
      <div>
        <h2 class="text-lg font-semibold text-foreground tracking-tight">DB Studio</h2>
        <p class="text-xs text-muted-foreground mt-0.5">Database management, reimagined</p>
      </div>
      <div class="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] font-mono text-muted-foreground">
        v{appVersion}
      </div>
    </div>

    <!-- License section -->
    <div class="px-6 py-5 flex flex-col gap-4">
      <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground/60">License</p>

      {#if !$licenseStatus}
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <span class="size-3.5 animate-spin rounded-full border-2 border-border border-t-muted-foreground inline-block shrink-0"></span>
          Checking license…
        </div>

      {:else if $licenseStatus.status === 'Valid'}
        <!-- Licensed -->
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center gap-2">
            <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-green-500/10">
              <ShieldCheck class="size-3.5 text-green-500" />
            </div>
            <span class="text-sm font-semibold {licenseColor}">Licensed</span>
          </div>
          <div class="rounded-lg border border-border/60 bg-muted/20 divide-y divide-border/40">
            <div class="flex items-center justify-between px-3 py-2 text-xs">
              <span class="text-muted-foreground">Email</span>
              <span class="font-mono text-foreground truncate max-w-[180px]">{$licenseStatus.email}</span>
            </div>
            <div class="flex items-center justify-between px-3 py-2 text-xs">
              <span class="text-muted-foreground">Plan</span>
              <span class="font-medium capitalize text-foreground">{$licenseStatus.plan}</span>
            </div>
            <div class="flex items-center justify-between px-3 py-2 text-xs">
              <span class="text-muted-foreground">Expires</span>
              <span class="text-foreground">
                {$licenseStatus.expires_at
                  ? new Date($licenseStatus.expires_at * 1000).toLocaleDateString()
                  : 'Lifetime'}
              </span>
            </div>
          </div>
          <button
            type="button"
            class="w-full rounded-lg border border-border/60 py-1.5 text-xs text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive disabled:opacity-50"
            onclick={handleDeactivate}
            disabled={deactivating}
          >
            {deactivating ? 'Deactivating…' : 'Deactivate license'}
          </button>
        </div>

      {:else if $licenseStatus.status === 'Trial'}
        <!-- Trial -->
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center gap-2">
            <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
              <Clock class="size-3.5 text-amber-500" />
            </div>
            <div>
              <p class="text-sm font-semibold {licenseColor}">Free Trial</p>
              <p class="text-[10px] text-muted-foreground">
                {$licenseStatus.days_remaining} {$licenseStatus.days_remaining === 1 ? 'day' : 'days'} remaining
              </p>
            </div>
          </div>
          {#if !showActivate}
            <button
              type="button"
              class="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              onclick={() => (showActivate = true)}
            >
              <KeyRound class="size-3.5" />
              Activate a license
            </button>
          {:else}
            <div class="rounded-lg border border-border bg-muted/10">
              <LicenseActivation compact onactivated={() => { showActivate = false; open = false }} />
            </div>
            <button
              type="button"
              class="text-xs text-muted-foreground hover:text-foreground"
              onclick={() => (showActivate = false)}
            >Cancel</button>
          {/if}
        </div>

      {:else}
        <!-- Expired / no license -->
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center gap-2">
            <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle class="size-3.5 text-destructive" />
            </div>
            <div>
              <p class="text-sm font-semibold text-destructive">Trial Expired</p>
              <p class="text-[10px] text-muted-foreground">Activate a license to continue</p>
            </div>
          </div>
          {#if !showActivate}
            <button
              type="button"
              class="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              onclick={() => (showActivate = true)}
            >
              <KeyRound class="size-3.5" />
              Activate a license
            </button>
          {:else}
            <div class="rounded-lg border border-border bg-muted/10">
              <LicenseActivation compact onactivated={() => { showActivate = false; open = false }} />
            </div>
            <button
              type="button"
              class="text-xs text-muted-foreground hover:text-foreground"
              onclick={() => (showActivate = false)}
            >Cancel</button>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Footer links -->
    <div class="flex items-center justify-between border-t border-border/60 px-6 py-3">
      <p class="text-[10px] text-muted-foreground/50">© 2025 DB Studio</p>
      <div class="flex items-center gap-3">
        <a
          href="https://github.com/broisnischal/db-studio"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          <!-- GitHub mark (official SVG) -->
          <svg class="size-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.014-1.703-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
          </svg>
          GitHub
        </a>
        <a
          href="https://dbstudio.app"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          <ExternalLink class="size-3" />
          Website
        </a>
      </div>
    </div>

  </Dialog.Content>
</Dialog.Root>
