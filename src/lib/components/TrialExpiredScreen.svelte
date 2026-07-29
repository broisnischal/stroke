<script>
  // Hard trial gate. Rendered in place of the whole app once the trial has
  // expired and no valid license is present - there is no dismiss path, the
  // only way through is activating a license.
  import { onMount } from 'svelte'
  import Logo from './Logo.svelte'
  import Icon from './Icon.svelte'
  import LicenseActivation from './LicenseActivation.svelte'
  import WindowControls from './WindowControls.svelte'
  import { detectOs } from '$lib/platform.js'

  const isMac = typeof navigator !== 'undefined' && detectOs() === 'macos'

  // The window is frameless (see src-tauri/src/lib.rs) and this screen replaces
  // the whole app - including TitleBar.svelte - so without its own bare drag
  // region here, a user on this screen would have no way to move the window to
  // another monitor or minimize it.
  let isTauri = $state(false)
  onMount(() => {
    isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  })

  /** @param {MouseEvent} e */
  function onDragRegionDblClick(e) {
    if (!isTauri) return
    if (e.target === e.currentTarget) return
    if (/** @type {Element} */ (e.target).closest('button')) return
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().toggleMaximize())
  }

  async function quit() {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().close()
    } catch { /* browser/dev - no-op */ }
  }
</script>

<div class="fixed inset-0 z-[9999] flex flex-col bg-background">
  <!-- Bare title bar: just the drag region, the mark, and window controls -->
  <div
    class="flex h-[38px] shrink-0 items-center border-b border-border/40 px-2.5 select-none"
    data-tauri-drag-region
    role="toolbar"
    aria-label="Window title bar"
    tabindex="-1"
    ondblclick={onDragRegionDblClick}
  >
    {#if isMac}
      <div class="w-[70px] shrink-0"></div>
    {/if}
    <Logo class="size-4 shrink-0" />
    <div class="min-w-0 flex-1" data-tauri-drag-region></div>
    <WindowControls />
  </div>

  <div class="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10">
    <!-- Ambient glow -->
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-[55%]"
      style="background: radial-gradient(ellipse 55% 50% at 50% -8%, color-mix(in oklch, var(--primary) 9%, transparent), transparent 70%);"
    ></div>

    <div class="relative flex w-full max-w-[26rem] flex-col items-center gap-6 text-center">
      <div class="grid size-14 place-items-center rounded-2xl border border-border/50 bg-card/40 shadow-sm">
        <Logo class="size-7" />
      </div>

      <div class="space-y-2">
        <h1 class="text-ui-3xl font-semibold tracking-tight text-foreground text-balance">Your free trial has ended</h1>
        <p class="text-ui leading-relaxed text-muted-foreground text-balance">
          Activate a license to keep using Stroke. Your saved connections and settings are untouched, they'll be right here.
        </p>
      </div>

      <!-- Activation, the only way forward. No card; just the field + button. -->
      <div class="w-full">
        <LicenseActivation naked />
      </div>

      <div class="flex items-center gap-4 text-ui-xs">
        <a
          href="https://stroke.click"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 font-medium text-foreground transition-colors hover:text-primary"
        >
          Get a license <Icon name="external-link" class="size-3.5" />
        </a>
        <span class="text-border">·</span>
        <button
          type="button"
          onclick={quit}
          class="text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          Quit Stroke
        </button>
      </div>
    </div>
  </div>
</div>
