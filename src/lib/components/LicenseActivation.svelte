<script>
  import { activateLicense } from '$lib/stores/license.js'
  import confetti from 'canvas-confetti'
  import Icon from './Icon.svelte'
  import { cn } from '$lib/utils.js'

  let { onactivated = () => {}, compact = false, naked = false } = $props()

  function fireConfetti() {
    const burst = (angle, origin) =>
      confetti({ angle, origin, spread: 55, particleCount: 80, startVelocity: 45, decay: 0.92, scalar: 1.1, ticks: 200 })
    burst(60,  { x: 0, y: 0.65 })
    burst(120, { x: 1, y: 0.65 })
    setTimeout(() => {
      burst(75,  { x: 0.15, y: 0.5 })
      burst(105, { x: 0.85, y: 0.5 })
    }, 150)
  }

  let key = $state('')
  let loading = $state(false)
  let error = $state('')
  let success = $state(false)

  const ready = $derived(!!key.trim() && !loading && !success)

  async function submit() {
    if (!key.trim() || loading || success) return
    loading = true
    error = ''
    const result = await activateLicense(key.trim())
    loading = false
    if (result.ok) {
      success = true
      fireConfetti()
      setTimeout(() => onactivated(), 1800)
    } else {
      error = result.error.replace(/^Error invoking remote method '[^']+': /, '')
    }
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    if (e.key === 'Enter') void submit()
  }
</script>

<div class="flex flex-col gap-3 {naked ? '' : compact ? 'p-5' : 'p-6'}">
  {#if !compact && !naked}
    <div class="flex flex-col gap-0.5">
      <p class="text-sm font-semibold text-foreground">Enter your license key</p>
      <p class="text-xs text-muted-foreground">Sent to your email after purchase.</p>
    </div>
  {/if}

  <!-- Key input -->
  <div class="relative">
    <Icon name="key-round" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/40" />
    <input
      type="text"
      bind:value={key}
      onkeydown={handleKeydown}
      placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
      spellcheck="false"
      autocomplete="off"
      disabled={loading || success}
      class="h-11 w-full rounded-lg border border-border/60 bg-muted/25 pl-10 pr-3 font-mono text-[13px] tracking-wider text-foreground outline-none transition-[border-color,box-shadow] placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground/30 hover:border-border focus:border-ring focus:ring-1 focus:ring-ring focus:bg-muted/10 focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-50"
    />
  </div>

  <!-- Error -->
  {#if error}
    <div class="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/[0.06] px-3 py-2.5 text-xs text-destructive">
      <Icon name="alert-triangle" class="mt-px size-3.5 shrink-0" />
      <span class="leading-relaxed">{error}</span>
    </div>
  {/if}

  <!-- Success -->
  {#if success}
    <div class="flex items-center gap-2 rounded-lg border border-green-500/25 bg-green-500/[0.07] px-3 py-2.5 text-xs text-green-600 dark:text-green-400">
      <Icon name="check" class="size-3.5 shrink-0" />
      <span>License activated — welcome aboard!</span>
    </div>
  {/if}

  <!-- Submit -->
  <button
    type="button"
    disabled={!ready}
    onclick={() => void submit()}
    class={cn(
      'inline-flex w-full items-center justify-center gap-2 rounded-lg font-semibold transition-colors',
      naked ? 'h-11 text-[13px]' : 'h-11 text-sm',
      ready
        ? 'bg-foreground text-background hover:bg-foreground/85'
        : success
          ? 'bg-emerald-500/15 text-emerald-500'
          : 'cursor-not-allowed border border-border/50 bg-muted/30 text-muted-foreground/50',
    )}
  >
    {#if loading}
      <Icon name="loader-2" class="size-4 animate-spin" />
      Verifying…
    {:else if success}
      <Icon name="check" class="size-4" />
      Activated!
    {:else}
      <Icon name="key-round" class="size-4" />
      Activate License
    {/if}
  </button>
</div>
