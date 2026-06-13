<script>
  import { onMount } from 'svelte'
  import {
    licenseStatus,
    isBlocked,
    runLicenseCheck,
  } from '$lib/stores/license.js'
  import { toggleLightDark, isCurrentThemeDark } from '$lib/stores/settings.js'
  import LicenseActivation from './LicenseActivation.svelte'
  import TitleBar from './TitleBar.svelte'
  import Database   from '@lucide/svelte/icons/database'
  import Zap        from '@lucide/svelte/icons/zap'
  import ShieldCheck from '@lucide/svelte/icons/shield-check'
  import RefreshCw  from '@lucide/svelte/icons/refresh-cw'
  import Sun        from '@lucide/svelte/icons/sun'
  import Moon       from '@lucide/svelte/icons/moon'
  import Settings   from '@lucide/svelte/icons/settings'
  import Bot        from '@lucide/svelte/icons/bot'
  import Command    from '@lucide/svelte/icons/command'
  import Lock       from '@lucide/svelte/icons/lock'
  import WifiOff    from '@lucide/svelte/icons/wifi-off'

  let { children } = $props()

  onMount(() => runLicenseCheck())

  const FEATURES = [
    [Zap,         'All features'],
    [RefreshCw,   'Future updates'],
    [ShieldCheck, 'Unlimited connections'],
  ]
</script>

<!-- Loading — pass through -->
{#if $licenseStatus === null}
  {@render children()}

<!-- Blocked — full-page activation with app chrome -->
{:else if $isBlocked}
  <div class="flex h-full min-h-0 flex-col bg-background">

    <!-- ── Window title bar ─────────────────────────────────────────── -->
    <TitleBar title="Stroke" />

    <!-- ── Main content ─────────────────────────────────────────────── -->
    <div class="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-8 py-12">
      <div class="flex w-full max-w-[440px] flex-col gap-8">

        <!-- ── Branding ─────────────────────────────────────────────── -->
        <div class="flex flex-col items-center gap-5 text-center">
          <div class="flex size-[44px] items-center justify-center rounded-xl border border-border bg-card">
            <Database class="size-[18px] text-foreground" />
          </div>
          <div>
            <h1 class="text-[19px] font-semibold tracking-tight text-foreground">Activate Stroke</h1>
            <p class="mt-1.5 text-[13px] leading-relaxed text-muted-foreground/70">
              Your trial has ended. Enter your license key to get full access.
            </p>
          </div>
        </div>

        <!-- ── Form (no card — Resend style) ────────────────────────── -->
        <div class="flex flex-col gap-2">
          <div>
            <p class="text-[13px] font-medium text-foreground">License key</p>
            <p class="mt-0.5 text-xs text-muted-foreground/50">Sent to your email after purchase.</p>
          </div>
          <LicenseActivation naked onactivated={runLicenseCheck} />
        </div>

        <!-- ── Features ──────────────────────────────────────────────── -->
        <div class="flex items-center justify-center gap-6">
          {#each FEATURES as [Icon, label] (label)}
            <span class="flex items-center gap-1.5 text-[11.5px] text-muted-foreground/40">
              <Icon class="size-3 shrink-0" />
              {label}
            </span>
          {/each}
        </div>

        <!-- ── Purchase link ─────────────────────────────────────────── -->
        <p class="text-center text-xs text-muted-foreground/40">
          No license yet?&thinsp;
          <a
            href="https://stroke.click"
            target="_blank"
            rel="noopener noreferrer"
            class="text-muted-foreground/60 underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >stroke.click →</a>
        </p>

      </div>
    </div>

    <!-- ── Status bar (simplified) ──────────────────────────────────── -->
    <div
      class="flex h-8 shrink-0 items-center border-t border-border/30 bg-background px-2 text-[11px] select-none"
      data-studio-region="statusbar"
    >
      <!-- Left: not connected indicator -->
      <div class="flex min-w-0 flex-1 items-center">
        <span class="flex items-center gap-1.5 px-2 py-1 text-muted-foreground/20">
          <WifiOff class="size-3 shrink-0" />
          <span class="font-medium">Not connected</span>
        </span>
      </div>

      <!-- Right: disabled items + active theme toggle -->
      <div class="flex shrink-0 items-center gap-0.5 text-muted-foreground/20">
        <span class="inline-flex size-6 cursor-not-allowed items-center justify-center rounded-md"><Bot class="size-3.5" /></span>
        <span class="inline-flex size-6 cursor-not-allowed items-center justify-center rounded-md"><Command class="size-3.5" /></span>
        <span class="inline-flex size-6 cursor-not-allowed items-center justify-center rounded-md"><Lock class="size-3.5" /></span>

        <span class="mx-1 h-3.5 w-px shrink-0 bg-border/20"></span>

        <!-- ACTIVE: Theme toggle -->
        <button
          type="button"
          class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground"
          title={$isCurrentThemeDark ? 'Switch to light (⌘M)' : 'Switch to dark (⌘M)'}
          onclick={() => toggleLightDark()}
        >
          {#if $isCurrentThemeDark}
            <Sun class="size-3.5" />
          {:else}
            <Moon class="size-3.5" />
          {/if}
        </button>

        <span class="inline-flex size-6 cursor-not-allowed items-center justify-center rounded-md"><Settings class="size-3.5" /></span>

        <span class="mx-1 h-3.5 w-px shrink-0 bg-border/20"></span>

        <span class="flex cursor-not-allowed items-center gap-1 rounded-md px-2 py-1">
          <span class="size-1.5 shrink-0 rounded-full bg-muted-foreground/20"></span>
          <span class="font-medium">MCP</span>
        </span>

        <span class="mx-1 h-3.5 w-px shrink-0 bg-border/20"></span>

        <span class="flex cursor-not-allowed items-center gap-1 rounded-md px-2 py-1">
          <Bot class="size-3 shrink-0 opacity-60" />
          <span class="font-medium">No model</span>
        </span>
      </div>
    </div>

  </div>

<!-- Active — render app -->
{:else}
  {@render children()}
{/if}
