<script>
  import ChevronLeft   from '@lucide/svelte/icons/chevron-left'
  import ChevronRight  from '@lucide/svelte/icons/chevron-right'
  import PanelLeft     from '@lucide/svelte/icons/panel-left'
  import MessageSquare from '@lucide/svelte/icons/message-square'
  import X             from '@lucide/svelte/icons/x'
  import KeyRound      from '@lucide/svelte/icons/key-round'
  import { cn } from '$lib/utils.js'
  import { detectOs } from '$lib/platform.js'
  import { isTrialActive, licenseStatus } from '$lib/stores/license.js'
  import LicenseActivation from './LicenseActivation.svelte'
  import * as Dialog from '$lib/components/ui/dialog/index.js'

  const isMac = typeof navigator !== 'undefined' && detectOs() === 'macos'
  const mod   = isMac ? '⌘' : 'Ctrl'

  let {
    title = 'studio',
    canGoBack = false,
    canGoForward = false,
    sidebarOpen = true,
    connected = false,
    aiSidebarOpen = false,
    ongoback          = () => {},
    ongoforward       = () => {},
    ontogglesidebar   = () => {},
    ontoggleaisidebar = () => {},
  } = $props()

  let showActivationDialog = $state(false)

  const trialDays = $derived(
    $licenseStatus?.status === 'Trial' ? $licenseStatus.days_remaining : 0
  )
  const trialUrgent = $derived(trialDays <= 3)

  const iconBtn = 'inline-flex size-[24px] items-center justify-center rounded-md text-muted-foreground/50 transition-[background-color,color] duration-150 hover:bg-foreground/[0.06] hover:text-foreground'
</script>

<!--
  App toolbar. The window uses native OS decorations, so the OS draws the title
  bar and the minimize / maximize / close controls. This bar carries only the
  in-app controls (sidebar, navigation, chat) — no window chrome, drag region,
  or window-state handling.
-->
<div class="studio-chrome relative flex h-[38px] shrink-0 items-center border-b border-border/40 bg-background px-2.5 select-none" data-studio-chrome>

  <!-- Sidebar toggle, disabled when not connected -->
  <button
    type="button"
    class={cn(
      'shrink-0',
      iconBtn,
      !connected ? 'opacity-25 !pointer-events-none' : !sidebarOpen && 'bg-foreground/[0.05] text-foreground/60',
    )}
    onclick={ontogglesidebar}
    disabled={!connected}
    title={connected ? (sidebarOpen ? `Hide sidebar (${mod}B)` : `Show sidebar (${mod}B)`) : 'No active connection'}
  >
    <PanelLeft class="size-[13px]" />
  </button>

  <!-- Back / Forward -->
  <button
    type="button"
    class={cn('ml-0.5 shrink-0', iconBtn, !canGoBack && 'opacity-20 !pointer-events-none')}
    onclick={ongoback}
    disabled={!canGoBack}
    title="Go back"
  >
    <ChevronLeft class="size-[13px]" />
  </button>
  <button
    type="button"
    class={cn('shrink-0', iconBtn, !canGoForward && 'opacity-20 !pointer-events-none')}
    onclick={ongoforward}
    disabled={!canGoForward}
    title="Go forward"
  >
    <ChevronRight class="size-[13px]" />
  </button>

  <!-- Center title -->
  <div class="pointer-events-none absolute inset-x-0 flex items-center justify-center">
    <span class="font-mono text-ui-2xs font-medium tracking-widest text-muted-foreground/30 lowercase select-none">
      {title}
    </span>
  </div>

  <!-- Spacer -->
  <div class="min-w-0 flex-1"></div>

  <!-- Right: trial pill + Chat -->
  <div class="flex shrink-0 items-center gap-1">

    <!-- Trial pill, shown only during active trial -->
    {#if $isTrialActive}
      <button
        type="button"
        onclick={() => (showActivationDialog = true)}
        class={cn(
          'flex h-[22px] items-center gap-1.5 rounded-full px-2.5 text-ui-3xs font-semibold transition-[color,background-color,border-color] duration-150',
          trialUrgent
            ? 'border border-warning/40 bg-warning/10 text-warning hover:bg-warning/20'
            : 'border border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        )}
        title="Activate license"
      >
        <span class={cn('size-1.5 rounded-full', trialUrgent ? 'bg-warning' : 'bg-muted-foreground/50')}></span>
        {trialDays}d trial
      </button>
    {/if}

    <!-- Chat sidebar -->
    <button
      type="button"
      class={cn(iconBtn, aiSidebarOpen && 'bg-foreground/[0.05] text-foreground/70')}
      onclick={ontoggleaisidebar}
      title={aiSidebarOpen ? `Close chat (${mod}I)` : `Open chat (${mod}I)`}
    >
      <MessageSquare class="size-[13px]" />
    </button>
  </div>
</div>

<!-- License activation dialog (from trial pill) -->
<Dialog.Root bind:open={showActivationDialog}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-[70] bg-black/65" />
    <Dialog.Content showCloseButton={false} class="fixed left-1/2 top-1/2 z-[71] w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border/60 bg-background p-0 elevate-3-rim outline-none">
      <div class="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div class="flex items-center gap-2.5">
          <div class="flex size-7 items-center justify-center rounded-lg bg-primary/10">
            <KeyRound class="size-3.5 text-primary" />
          </div>
          <div>
            <Dialog.Title class="text-ui-sm font-semibold leading-none text-foreground">Activate License</Dialog.Title>
            <Dialog.Description class="mt-0.5 text-ui-xs text-muted-foreground">Enter your key to unlock all features.</Dialog.Description>
          </div>
        </div>
        <Dialog.Close class="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <X class="size-4" />
        </Dialog.Close>
      </div>
      <LicenseActivation compact onactivated={() => { showActivationDialog = false }} />
      <div class="border-t border-border/60 px-5 py-3">
        <p class="text-ui-xs text-muted-foreground/50">
          No license? <a href="https://stroke.click" target="_blank" rel="noopener noreferrer" class="text-primary/70 underline-offset-2 hover:underline">stroke.click →</a>
        </p>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
