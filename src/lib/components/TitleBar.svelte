<script>
  import { onMount } from 'svelte'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import ChevronLeft   from '@lucide/svelte/icons/chevron-left'
  import ChevronRight  from '@lucide/svelte/icons/chevron-right'
  import PanelLeft     from '@lucide/svelte/icons/panel-left'
  import Sparkles      from '@lucide/svelte/icons/sparkles'
  import MessageSquare from '@lucide/svelte/icons/message-square'
  import X             from '@lucide/svelte/icons/x'
  import Minus         from '@lucide/svelte/icons/minus'
  import Square        from '@lucide/svelte/icons/square'
  import Copy          from '@lucide/svelte/icons/copy'
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
    aiMode = false,
    aiSidebarOpen = false,
    ongoback          = () => {},
    ongoforward       = () => {},
    ontogglesidebar   = () => {},
    ontoggleaimode    = () => {},
    ontoggleaisidebar = () => {},
  } = $props()

  let maximized  = $state(false)
  let fullscreen = $state(false)
  let isTauri    = $state(false)
  let showActivationDialog = $state(false)

  const trialDays = $derived(
    $licenseStatus?.status === 'Trial' ? $licenseStatus.days_remaining : 0
  )
  const trialUrgent = $derived(trialDays <= 3)

  onMount(() => {
    isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    if (!isTauri) return

    const win = getCurrentWindow()
    Promise.all([win.isMaximized(), win.isFullscreen()])
      .then(([m, f]) => { maximized = m; fullscreen = f })
      .catch(() => {})

    const p = win.listen('tauri://resize', async () => {
      [maximized, fullscreen] = await Promise.all([win.isMaximized(), win.isFullscreen()])
    })

    // After minimize/restore, WebKit's pointer hit-testing tree can become stale,
    // making buttons unresponsive. Briefly toggling pointer-events forces a rebuild.
    const pFocus = win.listen('tauri://focus', () => {
      document.documentElement.style.pointerEvents = 'none'
      requestAnimationFrame(() => { document.documentElement.style.pointerEvents = '' })
    })

    return () => {
      p.then(fn => fn()).catch(() => {})
      pFocus.then(fn => fn()).catch(() => {})
    }
  })

  async function winClose()            { try { await getCurrentWindow().close()                    } catch {} }
  async function winMinimize()         { try { await getCurrentWindow().minimize()                 } catch {} }
  async function winToggleFullscreen() { try { await getCurrentWindow().setFullscreen(!fullscreen) } catch {} }
  async function winToggleMaximize()   { try { await getCurrentWindow().toggleMaximize()           } catch {} }

  const iconBtn = 'inline-flex size-[24px] items-center justify-center rounded-md text-muted-foreground/50 transition-[background-color,color] duration-150 hover:bg-foreground/[0.06] hover:text-foreground'
  // Windows / Linux native-style caption buttons: full-height, square, flush right.
  const winCtl = 'pointer-events-auto inline-flex h-full w-[46px] items-center justify-center text-muted-foreground/55 transition-[background-color,color] duration-150 hover:bg-foreground/[0.07] hover:text-foreground'
</script>

{#if isTauri && !fullscreen}
  <!--
    Drag region is an ABSOLUTE UNDERLAY (z-0). All buttons live in the
    OVERLAY (z-10) which is NOT marked data-tauri-drag-region, so Tauri's
    drag intercept never sees pointer events on the buttons.
  -->
  <div class="studio-chrome relative flex h-[38px] shrink-0 border-b border-border/40 bg-background select-none" data-studio-chrome>

    <!-- ── Drag underlay ──────────────────────────────────────────── -->
    <!-- No ondblclick here: Tauri's injected drag-region script already
         toggles maximize on double-click (on macOS via mouseup). Adding our
         own handler made both fire — maximize + instant restore. -->
    <div
      class="absolute inset-0 z-0"
      data-tauri-drag-region
      role="none"
    ></div>

    <!-- ── Button overlay ── -->
    <div class="pointer-events-none relative z-10 flex h-full w-full items-center">

      {#if isMac}
        <!-- macOS traffic lights -->
        <div class="traffic-group pointer-events-auto flex shrink-0 items-center gap-[7px] pl-[14px]">
          <button type="button" class="traffic-dot traffic-close"    onclick={winClose}            aria-label="Close">
            <svg class="traffic-icon" viewBox="0 0 8 8" width="6" height="6" fill="none">
              <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
          <button type="button" class="traffic-dot traffic-minimize" onclick={winMinimize}          aria-label="Minimize">
            <svg class="traffic-icon" viewBox="0 0 8 8" width="6" height="6" fill="none">
              <path d="M1 4h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
          <button type="button" class="traffic-dot traffic-maximize" onclick={winToggleFullscreen}  aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
            {#if fullscreen}
              <svg class="traffic-icon" viewBox="0 0 8 8" width="6" height="6" fill="none">
                <path d="M1.5 3.5h2v-2M6.5 4.5h-2v2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            {:else}
              <svg class="traffic-icon" viewBox="0 0 8 8" width="6" height="6" fill="none">
                <path d="M1.5 3.5v-2h2M6.5 4.5v2h-2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            {/if}
          </button>
        </div>

        <!-- Divider -->
        <div class="mx-2.5 h-[14px] w-px shrink-0 bg-border/30"></div>
      {:else}
        <!-- Windows / Linux: no left lights — pad so the first control isn't flush to the corner -->
        <div class="w-2.5 shrink-0"></div>
      {/if}

      <!-- Sidebar toggle — disabled when not connected -->
      <button
        type="button"
        class={cn(
          'pointer-events-auto shrink-0',
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
        class={cn('pointer-events-auto ml-0.5 shrink-0', iconBtn, !canGoBack && 'opacity-20 !pointer-events-none')}
        onclick={ongoback}
        disabled={!canGoBack}
        title="Go back"
      >
        <ChevronLeft class="size-[13px]" />
      </button>
      <button
        type="button"
        class={cn('pointer-events-auto shrink-0', iconBtn, !canGoForward && 'opacity-20 !pointer-events-none')}
        onclick={ongoforward}
        disabled={!canGoForward}
        title="Go forward"
      >
        <ChevronRight class="size-[13px]" />
      </button>

      <!-- Center title -->
      <div class="pointer-events-none absolute inset-x-0 flex items-center justify-center">
        <span class="font-mono text-[11px] font-medium tracking-widest text-muted-foreground/30 lowercase select-none">
          {title}
        </span>
      </div>

      <!-- Spacer -->
      <div class="min-w-0 flex-1"></div>

      <!-- Right: trial pill + Agent + Chat -->
      <div class={cn('pointer-events-auto flex shrink-0 items-center gap-1', isMac ? 'mr-3' : 'mr-2')}>

        <!-- Trial pill — shown only during active trial -->
        {#if $isTrialActive}
          <button
            type="button"
            onclick={() => (showActivationDialog = true)}
            class={cn(
              'flex h-[22px] items-center gap-1.5 rounded px-2.5 text-[10px] font-semibold transition-all',
              trialUrgent
                ? 'border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                : 'border border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            )}
            title="Activate license"
          >
            <span class={cn('size-1.5 rounded-full', trialUrgent ? 'bg-amber-400' : 'bg-muted-foreground/50')}></span>
            {trialDays}d trial
          </button>
        {/if}

        <!-- Agent mode -->
        <button
          type="button"
          class={cn(
            'flex h-[22px] items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors',
            aiMode
              ? 'bg-primary/15 text-primary ring-1 ring-inset ring-primary/25 hover:bg-primary/20'
              : 'text-muted-foreground/50 hover:bg-foreground/[0.06] hover:text-foreground',
          )}
          onclick={ontoggleaimode}
          title={aiMode ? `Exit agent mode (${mod}⇧E)` : `Enter agent mode (${mod}⇧E)`}
        >
          <Sparkles class="size-[11px]" />
          <span>Agent</span>
        </button>

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

      {#if !isMac}
        <!-- Windows / Linux native caption buttons (flush to the top-right corner) -->
        <div class="pointer-events-auto flex h-full shrink-0 items-stretch self-stretch">
          <button type="button" class={winCtl} onclick={winMinimize} aria-label="Minimize" title="Minimize">
            <Minus class="size-[15px]" strokeWidth={1.5} />
          </button>
          <button type="button" class={winCtl} onclick={winToggleMaximize} aria-label={maximized ? 'Restore' : 'Maximize'} title={maximized ? 'Restore' : 'Maximize'}>
            {#if maximized}
              <Copy class="size-[12px]" strokeWidth={1.5} />
            {:else}
              <Square class="size-[12px]" strokeWidth={1.5} />
            {/if}
          </button>
          <button type="button" class={cn(winCtl, 'hover:bg-[#e81123] hover:text-white')} onclick={winClose} aria-label="Close" title="Close">
            <X class="size-[15px]" strokeWidth={1.5} />
          </button>
        </div>
      {/if}

    </div>
  </div>
{/if}

<!-- License activation dialog (from trial pill) -->
<Dialog.Root bind:open={showActivationDialog}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-[70] bg-background/80" />
    <Dialog.Content showCloseButton={false} class="fixed left-1/2 top-1/2 z-[71] w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-2xl outline-none">
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
      <LicenseActivation compact onactivated={() => { showActivationDialog = false }} />
      <div class="border-t border-border/60 px-5 py-3">
        <p class="text-xs text-muted-foreground/50">
          No license? <a href="https://stroke.click" target="_blank" rel="noopener noreferrer" class="text-primary/70 underline-offset-2 hover:underline">stroke.click →</a>
        </p>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  .traffic-group { pointer-events: auto; }

  .traffic-dot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: none;
    cursor: default;
    flex-shrink: 0;
    transition: opacity 0.1s;
    pointer-events: auto;
  }
  .traffic-dot:active { opacity: 0.5; }
  .traffic-close    { background-color: #ff5f57; color: #7c0902; }
  .traffic-minimize { background-color: #ffbd2e; color: #7c4d00; }
  .traffic-maximize { background-color: #27c93f; color: #0a5c1d; }
  .traffic-icon {
    opacity: 0;
    transition: opacity 0.08s;
    pointer-events: none;
  }
  .traffic-group:hover .traffic-icon { opacity: 1; }
  .traffic-group:not(:hover) .traffic-dot { opacity: 0.45; }
</style>
