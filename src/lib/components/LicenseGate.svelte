<script>
  import { onMount } from 'svelte'
  import {
    licenseStatus,
    isBlocked,
    isTrialActive,
    refreshLicenseStatus,
  } from '$lib/stores/license.js'
  import LicenseActivation from './LicenseActivation.svelte'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import Database from '@lucide/svelte/icons/database'
  import Clock from '@lucide/svelte/icons/clock'
  import KeyRound from '@lucide/svelte/icons/key-round'
  import X from '@lucide/svelte/icons/x'
  import Check from '@lucide/svelte/icons/check'
  import Zap from '@lucide/svelte/icons/zap'
  import ShieldCheck from '@lucide/svelte/icons/shield-check'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'

  let { children } = $props()

  let showActivationDialog = $state(false)
  let trialBannerDismissed = $state(false)

  onMount(() => refreshLicenseStatus())

  function handleActivated() {
    showActivationDialog = false
  }

  const days = $derived(
    $licenseStatus?.status === 'Trial' ? $licenseStatus.days_remaining : 0
  )

  const bannerUrgency = $derived(
    days <= 1
      ? 'border-destructive/30 bg-destructive/[0.04] text-destructive'
      : days <= 3
        ? 'border-amber-500/30 bg-amber-500/[0.05] text-amber-700 dark:text-amber-400'
        : 'border-border/50 bg-muted/30 text-muted-foreground'
  )
</script>

<!-- Loading — pass through -->
{#if $licenseStatus === null}
  {@render children()}

<!-- Blocked — full-page activation -->
{:else if $isBlocked}
  <div class="relative flex h-full min-h-0 flex-col items-center justify-center overflow-hidden bg-background p-6">

    <!-- Subtle radial fade -->
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,hsl(var(--primary)/0.07),transparent)]"></div>

    <div class="relative flex w-full max-w-[400px] flex-col gap-8">

      <!-- Branding -->
      <div class="flex flex-col items-center gap-4 text-center">
        <div class="relative flex size-[60px] items-center justify-center rounded-2xl border border-primary/20 bg-primary/8 shadow-lg shadow-primary/10 ring-4 ring-primary/5">
          <Database class="size-7 text-primary" />
        </div>
        <div class="flex flex-col gap-1">
          <h1 class="text-2xl font-bold tracking-tight text-foreground">DB Studio</h1>
          <p class="text-sm text-muted-foreground">Your trial has ended. Activate a license to continue.</p>
        </div>
      </div>

      <!-- Card -->
      <div class="overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/5">

        <!-- What's included -->
        <div class="border-b border-border/60 bg-muted/20 px-5 py-3.5">
          <div class="flex flex-wrap gap-x-5 gap-y-1.5">
            {#each [
              [Zap, 'All features'],
              [RefreshCw, 'Future updates'],
              [ShieldCheck, 'Unlimited connections'],
            ] as [Icon, label] (label)}
              <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon class="size-3 shrink-0 text-primary/70" />
                {label}
              </span>
            {/each}
          </div>
        </div>

        <!-- Form -->
        <LicenseActivation onactivated={handleActivated} />
      </div>

      <!-- Purchase link -->
      <p class="text-center text-xs text-muted-foreground/50">
        No license yet? &nbsp;
        <a
          href="https://dbstudio.app"
          target="_blank"
          rel="noopener noreferrer"
          class="font-medium text-primary/80 underline-offset-2 transition-opacity hover:opacity-70 hover:underline"
        >
          Get one at dbstudio.app →
        </a>
      </p>
    </div>
  </div>

<!-- Active — app + optional banner -->
{:else}
  <div class="flex h-full min-h-0 flex-col">

    <!-- Trial banner -->
    {#if $isTrialActive && !trialBannerDismissed}
      <div class="flex shrink-0 items-center gap-2.5 border-b {bannerUrgency} px-4 py-1.5 text-xs font-medium">
        <Clock class="size-3.5 shrink-0" />
        <span class="flex-1">
          <strong>{days} {days === 1 ? 'day' : 'days'}</strong> left in your trial.
        </span>
        <button
          type="button"
          class="shrink-0 rounded-md border border-current/25 bg-current/5 px-2.5 py-1 text-[11px] font-semibold transition-opacity hover:opacity-70"
          onclick={() => (showActivationDialog = true)}
        >
          Activate
        </button>
        <button
          type="button"
          class="inline-flex size-5 shrink-0 items-center justify-center rounded opacity-40 transition-opacity hover:opacity-90"
          onclick={() => (trialBannerDismissed = true)}
          title="Dismiss"
        >
          <X class="size-3.5" />
        </button>
      </div>
    {/if}

    <div class="min-h-0 flex-1 overflow-hidden">
      {@render children()}
    </div>
  </div>

  <!-- Activation dialog (trial) -->
  <Dialog.Root bind:open={showActivationDialog}>
    <Dialog.Portal>
      <Dialog.Overlay class="fixed inset-0 z-[70] bg-background/60 backdrop-blur-sm" />
      <Dialog.Content showCloseButton={false} class="fixed left-1/2 top-1/2 z-[71] w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-2xl outline-none">

        <!-- Dialog header -->
        <div class="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div class="flex items-center gap-2.5">
            <div class="flex size-7 items-center justify-center rounded-lg bg-primary/10">
              <KeyRound class="size-3.5 text-primary" />
            </div>
            <div>
              <Dialog.Title class="text-sm font-semibold leading-none text-foreground">Activate License</Dialog.Title>
              <Dialog.Description class="mt-0.5 text-xs text-muted-foreground">Enter your key to unlock all features.</Dialog.Description>
            </div>
          </div>
          <Dialog.Close class="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X class="size-4" />
          </Dialog.Close>
        </div>

        <!-- Form -->
        <LicenseActivation compact onactivated={() => { showActivationDialog = false }} />

        <!-- Footer -->
        <div class="border-t border-border/60 px-5 py-3">
          <p class="text-xs text-muted-foreground/50">
            No license?
            <a href="https://dbstudio.app" target="_blank" rel="noopener noreferrer"
               class="text-primary/70 underline-offset-2 hover:underline">dbstudio.app →</a>
          </p>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
{/if}
