<script>
  import { onMount } from 'svelte'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import ChevronLeft   from '@lucide/svelte/icons/chevron-left'
  import ChevronRight  from '@lucide/svelte/icons/chevron-right'
  import PanelLeft     from '@lucide/svelte/icons/panel-left'
  import Sparkles      from '@lucide/svelte/icons/sparkles'
  import MessageSquare from '@lucide/svelte/icons/message-square'
  import { cn } from '$lib/utils.js'
  import { detectOs } from '$lib/platform.js'

  const isMac = typeof navigator !== 'undefined' && detectOs() === 'macos'
  const mod   = isMac ? '⌘' : 'Ctrl'

  let {
    title = 'studio',
    canGoBack = false,
    canGoForward = false,
    sidebarOpen = true,
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
    return () => { p.then(fn => fn()).catch(() => {}) }
  })

  async function winClose()            { try { await getCurrentWindow().close()                    } catch {} }
  async function winMinimize()         { try { await getCurrentWindow().minimize()                 } catch {} }
  async function winToggleFullscreen() { try { await getCurrentWindow().setFullscreen(!fullscreen) } catch {} }
  async function winToggleMaximize()   { try { await getCurrentWindow().toggleMaximize()           } catch {} }

  const iconBtn = 'inline-flex size-[22px] items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-white/[0.07] hover:text-muted-foreground'
</script>

{#if isTauri && !fullscreen}
  <!--
    Drag region is an ABSOLUTE UNDERLAY (z-0). All buttons live in the
    OVERLAY (z-10) which is NOT marked data-tauri-drag-region, so Tauri's
    drag intercept never sees pointer events on the buttons.
  -->
  <div class="studio-chrome relative flex h-[30px] shrink-0 border-b border-border/30 bg-background select-none" data-studio-chrome>

    <!-- ── Drag underlay ──────────────────────────────────────────── -->
    <div
      class="absolute inset-0 z-0"
      data-tauri-drag-region
      role="none"
      ondblclick={winToggleMaximize}
    ></div>

    <!-- ── Button overlay — pointer-events-none so background clicks pass to drag underlay ── -->
    <div class="pointer-events-none relative z-10 flex h-full w-full items-center">

      <!-- Traffic lights -->
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

      <!-- Sidebar toggle -->
      <button
        type="button"
        class={cn('pointer-events-auto ml-2 shrink-0', iconBtn, !sidebarOpen && 'bg-white/[0.05] text-foreground/60')}
        onclick={ontogglesidebar}
        title={sidebarOpen ? `Hide sidebar (${mod}B)` : `Show sidebar (${mod}B)`}
      >
        <PanelLeft class="size-3" />
      </button>

      <!-- Back / Forward navigation -->
      <button
        type="button"
        class={cn('pointer-events-auto ml-0.5 shrink-0', iconBtn, !canGoBack && 'opacity-25 !pointer-events-none')}
        onclick={ongoback}
        disabled={!canGoBack}
        title="Go back"
      >
        <ChevronLeft class="size-3" />
      </button>
      <button
        type="button"
        class={cn('pointer-events-auto shrink-0', iconBtn, !canGoForward && 'opacity-25 !pointer-events-none')}
        onclick={ongoforward}
        disabled={!canGoForward}
        title="Go forward"
      >
        <ChevronRight class="size-3" />
      </button>

      <!-- Center title (pointer-events-none — passes clicks through to drag underlay) -->
      <div class="pointer-events-none absolute inset-x-0 flex items-center justify-center">
        <span class="font-mono text-[11px] font-medium tracking-wide text-muted-foreground/40 lowercase select-none">
          {title}
        </span>
      </div>

      <!-- Spacer -->
      <div class="min-w-0 flex-1"></div>

      <!-- Right: Agent + Chat -->
      <div class="pointer-events-auto mr-2 flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          class={cn(
            'flex h-[20px] items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors',
            aiMode
              ? 'bg-primary/15 text-primary hover:bg-primary/20'
              : 'text-muted-foreground/50 hover:bg-white/[0.07] hover:text-muted-foreground',
          )}
          onclick={ontoggleaimode}
          title={aiMode ? `Exit agent mode (${mod}⇧E)` : `Enter agent mode (${mod}⇧E)`}
        >
          <Sparkles class="size-[10px]" />
          <span>Agent</span>
        </button>

        <button
          type="button"
          class={cn(iconBtn, aiSidebarOpen && 'bg-white/[0.05] text-foreground/60')}
          onclick={ontoggleaisidebar}
          title={aiSidebarOpen ? `Close chat (${mod}I)` : `Open chat (${mod}I)`}
        >
          <MessageSquare class="size-3" />
        </button>
      </div>

    </div>
  </div>
{/if}

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
