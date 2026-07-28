<script>
  import { activateLicense } from '$lib/stores/license.js'
  import confetti from 'canvas-confetti'
  import Icon from './Icon.svelte'
  import { cn } from '$lib/utils.js'

  let { onactivated = () => {}, compact = false, naked = false, inline = false } = $props()

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

{#snippet keyField(extraClass)}
  <div class={cn('relative', extraClass)}>
    <Icon name="key-round" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/40" />
    <input
      type="text"
      bind:value={key}
      onkeydown={handleKeydown}
      placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
      spellcheck="false"
      autocomplete="off"
      disabled={loading || success}
      class="h-11 w-full rounded-lg border-2 border-border bg-muted/20 pl-10 pr-3 font-mono text-ui-sm tracking-wider text-foreground outline-none transition-[color,border-color] placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground/30 hover:border-foreground/25 focus:border-ring focus-visible:ring-0 disabled:opacity-50"
    />
  </div>
{/snippet}

{#snippet submitBtn(fullWidth, label)}
  <button
    type="button"
    disabled={!ready}
    onclick={() => void submit()}
    class={cn(
      'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-5 text-ui-sm font-semibold transition-colors',
      fullWidth && 'w-full',
      ready
        ? 'bg-foreground text-background hover:bg-foreground/85'
        : success
          ? 'bg-emerald-500/15 text-emerald-500'
          : 'cursor-not-allowed border-2 border-border/50 bg-muted/30 text-muted-foreground/50',
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
      {label}
    {/if}
  </button>
{/snippet}

<div class="flex flex-col gap-2.5 {naked || inline ? '' : compact ? 'p-5' : 'p-6'}">
  {#if !compact && !naked && !inline}
    <div class="flex flex-col gap-0.5">
      <p class="text-ui-sm font-semibold text-foreground">Enter your license key</p>
      <p class="text-ui-xs text-muted-foreground">Sent to your email after purchase.</p>
    </div>
  {/if}

  <!-- Input + button: side-by-side (inline) or stacked -->
  {#if inline}
    <div class="flex items-stretch gap-2">
      {@render keyField('flex-1 min-w-0')}
      {@render submitBtn(false, 'Activate')}
    </div>
  {:else}
    {@render keyField('')}
  {/if}

  <!-- Error -->
  {#if error}
    <div class="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/[0.06] px-3 py-2.5 text-ui-xs text-destructive">
      <Icon name="alert-triangle" class="mt-px size-3.5 shrink-0" />
      <span class="leading-relaxed">{error}</span>
    </div>
  {/if}

  <!-- Success -->
  {#if success}
    <div class="flex items-center gap-2 rounded-lg border border-green-500/25 bg-green-500/[0.07] px-3 py-2.5 text-ui-xs text-green-600 dark:text-green-400">
      <Icon name="check" class="size-3.5 shrink-0" />
      <span>License activated, welcome aboard!</span>
    </div>
  {/if}

  {#if !inline}
    {@render submitBtn(true, 'Activate License')}
  {/if}
</div>
