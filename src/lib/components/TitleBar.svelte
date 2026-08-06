<script>
  import { onMount } from 'svelte'
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
  import Logo from './Logo.svelte'
  import WindowControls from './WindowControls.svelte'
  import * as Dialog from '$lib/components/ui/dialog/index.js'

  const isMac = typeof navigator !== 'undefined' && detectOs() === 'macos'
  const mod   = isMac ? '⌘' : 'Ctrl'

  // Window is frameless everywhere (see src-tauri/src/lib.rs), so this bar is
  // the drag region and double-click-to-maximize target.
  let isTauri = $state(false)
  onMount(() => {
    isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  })

  // Native title bars maximize on a background double-click. Our drag region
  // only covers elements tagged `data-tauri-drag-region`; Tauri's own injected
  // handler already maximizes when the click lands directly on one of those -
  // this only picks up the rest (e.g. the flex spacer's non-tagged padding).
  /** @param {MouseEvent} e */
  function onDragRegionDblClick(e) {
    if (!isTauri) return
    if (e.target === e.currentTarget) return
    if (/** @type {Element} */ (e.target).closest('button')) return
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().toggleMaximize())
  }

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
  The window is frameless (see src-tauri/src/lib.rs), so this bar IS the title
  bar: it's the drag region and, on Windows/Linux, draws its own minimize /
  maximize / close. macOS keeps the real OS-drawn traffic lights (Overlay
  style) floating over this bar, so it only reserves space for them here.
-->
<div
  class="studio-chrome relative flex h-[38px] shrink-0 items-center border-b border-border/40 bg-background px-2.5 select-none"
  data-studio-chrome
  data-studio-region="titlebar"
  data-tauri-drag-region
  role="toolbar"
  aria-label="Window title bar"
  tabindex="-1"
  ondblclick={onDragRegionDblClick}
>

  <!-- macOS: space reserved for the native traffic lights -->
  {#if isMac}
    <div class="w-[70px] shrink-0"></div>
  {/if}

  <!-- Stroke mark -->
  <Logo class="mr-2 size-4 shrink-0" />

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
    title="Go back (Alt+←)"
  >
    <ChevronLeft class="size-[13px]" />
  </button>
  <button
    type="button"
    class={cn('shrink-0', iconBtn, !canGoForward && 'opacity-20 !pointer-events-none')}
    onclick={ongoforward}
    disabled={!canGoForward}
    title="Go forward (Alt+→)"
  >
    <ChevronRight class="size-[13px]" />
  </button>

  <!-- Center title -->
  <div class="pointer-events-none absolute inset-x-0 flex items-center justify-center">
    <span class="font-mono text-ui-2xs font-medium tracking-widest text-muted-foreground/30 lowercase select-none">
      {title}
    </span>
  </div>

  <!-- Spacer (also draggable - it's the largest empty stretch of the bar) -->
  <div class="min-w-0 flex-1" data-tauri-drag-region></div>

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

    {#if isTauri && !isMac}
      <div class="ml-1 border-l border-border/40 pl-1.5">
        <WindowControls />
      </div>
    {/if}
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
