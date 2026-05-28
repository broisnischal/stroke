<script>
  import { activateLicense } from '$lib/stores/license.js'
  import KeyRound from '@lucide/svelte/icons/key-round'
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import Check from '@lucide/svelte/icons/check'
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle'

  let { onactivated = () => {}, compact = false } = $props()

  let key = $state('')
  let loading = $state(false)
  let error = $state('')
  let success = $state(false)

  async function submit() {
    if (!key.trim() || loading || success) return
    loading = true
    error = ''
    const result = await activateLicense(key.trim())
    loading = false
    if (result.ok) {
      success = true
      setTimeout(() => onactivated(), 1400)
    } else {
      error = result.error.replace(/^Error invoking remote method '[^']+': /, '')
    }
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    if (e.key === 'Enter') void submit()
  }
</script>

<div class="flex flex-col gap-3 {compact ? 'p-5' : 'p-6'}">
  {#if !compact}
    <div class="flex flex-col gap-0.5">
      <p class="text-sm font-semibold text-foreground">Enter your license key</p>
      <p class="text-xs text-muted-foreground">Sent to your email after purchase.</p>
    </div>
  {/if}

  <!-- Key input -->
  <div class="relative">
    <KeyRound class="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/40" />
    <input
      type="text"
      bind:value={key}
      onkeydown={handleKeydown}
      placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
      spellcheck="false"
      autocomplete="off"
      disabled={loading || success}
      class="h-10 w-full rounded-lg border border-border bg-muted/30 pl-9 pr-3 font-mono text-sm tracking-wider text-foreground outline-none transition-all placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground/35 focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
    />
  </div>

  <!-- Error -->
  {#if error}
    <div class="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/[0.06] px-3 py-2.5 text-xs text-destructive">
      <AlertTriangle class="mt-px size-3.5 shrink-0" />
      <span class="leading-relaxed">{error}</span>
    </div>
  {/if}

  <!-- Success -->
  {#if success}
    <div class="flex items-center gap-2 rounded-lg border border-green-500/25 bg-green-500/[0.07] px-3 py-2.5 text-xs text-green-600 dark:text-green-400">
      <Check class="size-3.5 shrink-0" />
      <span>License activated — welcome aboard!</span>
    </div>
  {/if}

  <!-- Submit -->
  <button
    type="button"
    disabled={!key.trim() || loading || success}
    onclick={() => void submit()}
    class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
  >
    {#if loading}
      <Loader2 class="size-4 animate-spin" />
      Verifying…
    {:else if success}
      <Check class="size-4" />
      Activated!
    {:else}
      <KeyRound class="size-4" />
      Activate License
    {/if}
  </button>
</div>
