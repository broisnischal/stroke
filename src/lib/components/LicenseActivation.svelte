<script>
  import { activateLicense, licenseStatus } from '$lib/stores/license.js'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import KeyRound from '@lucide/svelte/icons/key-round'
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import Check from '@lucide/svelte/icons/check'
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle'
  import ExternalLink from '@lucide/svelte/icons/external-link'

  let { onactivated = () => {}, compact = false } = $props()

  let key = $state('')
  let loading = $state(false)
  let error = $state('')
  let success = $state(false)

  async function submit() {
    if (!key.trim() || loading) return
    loading = true
    error = ''
    const result = await activateLicense(key)
    loading = false
    if (result.ok) {
      success = true
      setTimeout(() => onactivated(), 1200)
    } else {
      error = result.error.replace(/^Error invoking remote method '[^']+': /, '')
    }
  }

  function handleKeydown(/** @type {KeyboardEvent} */ e) {
    if (e.key === 'Enter') submit()
  }
</script>

<div class="flex flex-col gap-4 {compact ? '' : 'p-6'}">
  {#if !compact}
    <div class="flex flex-col gap-1">
      <h2 class="text-base font-semibold text-foreground">Activate License</h2>
      <p class="text-sm text-muted-foreground">
        Enter the license key from your purchase email.
      </p>
    </div>
  {/if}

  <div class="flex flex-col gap-2">
    <div class="relative">
      <KeyRound class="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
      <input
        type="text"
        bind:value={key}
        onkeydown={handleKeydown}
        placeholder="Paste your license key…"
        spellcheck="false"
        autocomplete="off"
        class="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
        disabled={loading || success}
      />
    </div>

    {#if error}
      <div class="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
        <AlertTriangle class="mt-0.5 size-3.5 shrink-0" />
        <span>{error}</span>
      </div>
    {/if}

    {#if success}
      <div class="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/8 px-3 py-2 text-xs text-green-600 dark:text-green-400">
        <Check class="size-3.5 shrink-0" />
        License activated! Welcome.
      </div>
    {/if}
  </div>

  <button
    type="button"
    class="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
    disabled={!key.trim() || loading || success}
    onclick={submit}
  >
    {#if loading}
      <Loader2 class="size-4 animate-spin" />
      Verifying…
    {:else if success}
      <Check class="size-4" />
      Activated
    {:else}
      <KeyRound class="size-4" />
      Activate
    {/if}
  </button>
</div>
