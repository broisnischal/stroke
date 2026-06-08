<script>
  import { onMount } from 'svelte'
  import {
    licenseStatus,
    isBlocked,
    refreshLicenseStatus,
  } from '$lib/stores/license.js'
  import LicenseActivation from './LicenseActivation.svelte'
  import Database from '@lucide/svelte/icons/database'
  import Zap from '@lucide/svelte/icons/zap'
  import ShieldCheck from '@lucide/svelte/icons/shield-check'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'

  let { children } = $props()

  onMount(() => refreshLicenseStatus())
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
          <h1 class="text-2xl font-bold tracking-tight text-foreground">Stroke</h1>
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
        <LicenseActivation onactivated={() => refreshLicenseStatus()} />
      </div>

      <!-- Purchase link -->
      <p class="text-center text-xs text-muted-foreground/50">
        No license yet? &nbsp;
        <a
          href="https://stroke.click"
          target="_blank"
          rel="noopener noreferrer"
          class="font-medium text-primary/80 underline-offset-2 transition-opacity hover:opacity-70 hover:underline"
        >
          Get one at stroke.click →
        </a>
      </p>
    </div>
  </div>

<!-- Active — app + optional banner -->
{:else}
  {@render children()}
{/if}
