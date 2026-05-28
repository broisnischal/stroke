<script>
  import { onMount } from 'svelte'
  import {
    licenseStatus,
    isBlocked,
    isTrialActive,
    isLicensed,
    refreshLicenseStatus,
  } from '$lib/stores/license.js'
  import LicenseActivation from './LicenseActivation.svelte'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import KeyRound from '@lucide/svelte/icons/key-round'
  import Clock from '@lucide/svelte/icons/clock'
  import X from '@lucide/svelte/icons/x'

  let { children } = $props()

  let showActivationDialog = $state(false)
  let trialBannerDismissed = $state(false)

  onMount(() => refreshLicenseStatus())

  function handleActivated() {
    showActivationDialog = false
  }

  const daysColor = $derived.by(() => {
    const s = $licenseStatus
    if (s?.status !== 'Trial') return ''
    const d = s.days_remaining
    if (d <= 1) return 'border-destructive/40 bg-destructive/5 text-destructive'
    if (d <= 3) return 'border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400'
    return 'border-border/60 bg-muted/30 text-muted-foreground'
  })
</script>

<!-- Pass-through while status is loading -->
{#if $licenseStatus === null}
  {@render children()}

<!-- Blocked: trial expired, no license -->
{:else if $isBlocked}
  <div class="flex h-full min-h-0 flex-col items-center justify-center bg-background p-8">
    <div class="flex w-full max-w-md flex-col gap-6">
      <!-- Logo / hero -->
      <div class="flex flex-col items-center gap-3 text-center">
        <div class="flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
          <Sparkles class="size-7 text-primary" />
        </div>
        <div>
          <h1 class="text-xl font-semibold text-foreground">Your trial has ended</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            Activate a license to keep using DB Studio.
          </p>
        </div>
      </div>

      <!-- Activation form -->
      <div class="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <LicenseActivation onactivated={handleActivated} />
      </div>

      <!-- Footer -->
      <p class="text-center text-xs text-muted-foreground/60">
        Don't have a key yet? Purchase one at
        <a
          href="https://dbstudio.app"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary underline underline-offset-2 hover:opacity-80"
        >dbstudio.app</a>
      </p>
    </div>
  </div>

<!-- Active: show app + optional banners/badges -->
{:else}
  <div class="flex h-full min-h-0 flex-col">

    <!-- Trial banner -->
    {#if $isTrialActive && !trialBannerDismissed}
      {@const days = $licenseStatus?.status === 'Trial' ? $licenseStatus.days_remaining : 0}
      <div class="flex shrink-0 items-center gap-2 border-b {daysColor} px-3 py-1.5 text-xs">
        <Clock class="size-3.5 shrink-0" />
        <span class="flex-1">
          <strong>{days} {days === 1 ? 'day' : 'days'}</strong> left in your free trial.
        </span>
        <button
          type="button"
          class="rounded px-2 py-0.5 font-medium underline underline-offset-2 hover:opacity-70"
          onclick={() => (showActivationDialog = true)}
        >
          Activate License
        </button>
        <button
          type="button"
          class="inline-flex size-5 items-center justify-center rounded opacity-50 hover:opacity-100"
          onclick={() => (trialBannerDismissed = true)}
          title="Dismiss"
        >
          <X class="size-3.5" />
        </button>
      </div>
    {/if}

    <!-- Main app content -->
    <div class="min-h-0 flex-1 overflow-hidden">
      {@render children()}
    </div>
  </div>


  <!-- Activation dialog (during trial) -->
  {#if showActivationDialog}
    <button
      type="button"
      class="fixed inset-0 z-[70] bg-background/60 backdrop-blur-sm"
      onclick={() => (showActivationDialog = false)}
      aria-label="Close"
    ></button>
    <div class="fixed left-1/2 top-1/2 z-[71] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div class="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
        <div class="flex items-center gap-2">
          <KeyRound class="size-4 text-primary" />
          <span class="font-semibold text-sm">Activate License</span>
        </div>
        <button
          type="button"
          class="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          onclick={() => (showActivationDialog = false)}
        ><X class="size-4" /></button>
      </div>
      <LicenseActivation compact onactivated={() => { showActivationDialog = false }} />
    </div>
  {/if}
{/if}
