<script>
  import X from '@lucide/svelte/icons/x'
  import ExternalLink from '@lucide/svelte/icons/external-link'
  import ZoomIn from '@lucide/svelte/icons/zoom-in'
  import ZoomOut from '@lucide/svelte/icons/zoom-out'
  import { toast } from '$lib/components/ui/sonner/toast.svelte.js'
  import { cn } from '$lib/utils.js'
  import { focusTrap } from '$lib/actions/focus-trap.js'

  /** @type {{ url: string | null, type?: 'image' | 'pdf', onclose: () => void }} */
  let { url = null, type = 'image', onclose } = $props()

  const ZOOM_MIN = 0.25, ZOOM_MAX = 8
  let zoom = $state(1)
  /** Pan offset in px, applied before the scale. */
  let pan = $state({ x: 0, y: 0 })
  let imgNatural = $state({ w: 0, h: 0 })
  /** Off during wheel/pinch/drag: a 150ms ease on every delta reads as lag. */
  let animate = $state(true)
  let dragging = $state(false)
  /** @type {HTMLElement | null} */
  let backdropEl = $state(null)
  /** @type {HTMLElement | null} */
  let stageEl = $state(null)

  // Reset zoom and focus the backdrop whenever the lightbox opens
  $effect(() => {
    if (url) {
      reset()
      // Focus in next microtask so the DOM has rendered
      Promise.resolve().then(() => backdropEl?.focus())
    }
  })

  function reset() {
    zoom = 1
    pan = { x: 0, y: 0 }
    animate = true
  }

  const clamp = (/** @type {number} */ z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))

  /**
   * Zoom about a point, so the pixel under the cursor stays under the cursor.
   * Zooming about the centre instead is what made the buttons feel like they
   * were zooming the wrong part of the picture: the detail you were looking at
   * slid off the edge as it grew.
   * @param {number} next target zoom
   * @param {number} [cx] pointer x, viewport px (defaults to the stage centre)
   * @param {number} [cy] pointer y
   */
  function zoomTo(next, cx, cy) {
    const z2 = clamp(next)
    if (z2 === zoom) return
    const box = stageEl?.getBoundingClientRect()
    // Offset of the anchor from the stage centre, which is the transform origin.
    const ax = box && cx !== undefined ? cx - (box.left + box.width / 2) : 0
    const ay = box && cy !== undefined ? cy - (box.top + box.height / 2) : 0
    const k = z2 / zoom
    pan = { x: ax - (ax - pan.x) * k, y: ay - (ay - pan.y) * k }
    zoom = z2
  }

  /** A zoom step from a button or a key: centred, and worth animating. */
  function step(/** @type {number} */ factor) {
    animate = true
    zoomTo(zoom * factor)
  }

  /**
   * Ctrl/Cmd+wheel and trackpad pinch zoom at the cursor; a plain wheel pans.
   *
   * The backdrop carries `data-zoom-surface`, which is what stops the app-wide
   * Ctrl+scroll blocker in stores/settings.js from swallowing these events in
   * the capture phase before this handler ever runs.
   * @param {WheelEvent} e
   */
  function onWheel(e) {
    if (type !== 'image') return
    e.preventDefault()
    animate = false
    if (e.ctrlKey || e.metaKey) {
      // A pinch arrives as ctrl+wheel with small deltas; a mouse wheel arrives
      // in notches of ~100. Exponentiating keeps both proportional.
      zoomTo(zoom * Math.exp(-e.deltaY / 220), e.clientX, e.clientY)
      return
    }
    pan = { x: pan.x - e.deltaX, y: pan.y - e.deltaY }
  }

  /** @param {PointerEvent} e */
  function onPointerDown(e) {
    if (type !== 'image' || e.button !== 0) return
    const start = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
    dragging = true
    animate = false
    const el = /** @type {HTMLElement} */ (e.currentTarget)
    el.setPointerCapture(e.pointerId)
    const move = (/** @type {PointerEvent} */ ev) => {
      pan = { x: start.px + (ev.clientX - start.x), y: start.py + (ev.clientY - start.y) }
    }
    const up = () => {
      dragging = false
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  /** macOS WebKit pinch. Same opt-out, same anchored zoom. @param {any} e */
  function onGesture(e) {
    if (type !== 'image') return
    e.preventDefault()
    animate = false
    // `e.scale` is cumulative from gesturestart; step from the scale we had then.
    const base = _gestureBase || zoom
    zoomTo(base * (e.scale ?? 1), e.clientX, e.clientY)
  }
  let _gestureBase = 0

  /** @param {KeyboardEvent} e */
  function handleKey(e) {
    if (!url) return
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onclose(); return }
    if (type !== 'image') return
    // With or without the modifier: ⌘+ / ⌘- are what the app's own zoom uses, so
    // the fingers already there should work on the picture too.
    if (e.key === '+' || e.key === '=') { e.preventDefault(); step(1.25); return }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); step(1 / 1.25); return }
    if (e.key === '0') { e.preventDefault(); reset(); return }
    if (e.key === '1') { e.preventDefault(); animate = true; pan = { x: 0, y: 0 }; zoom = 1 }
  }

  async function openExternal() {
    if (!url) return
    try {
      const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
      if (isTauri) {
        const { openUrl: open } = await import('@tauri-apps/plugin-opener')
        await open(url)
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      toast.error(`Could not open URL: ${String(err)}`)
    }
  }
</script>

<!-- Global fallback so ESC works even if backdrop loses focus -->
<svelte:window
  onkeydown={handleKey}
  ongesturestart={(e) => { if (url && type === 'image') { _gestureBase = zoom; onGesture(e) } }}
  ongesturechange={(e) => { if (url) onGesture(e) }}
  ongestureend={(e) => { if (url) { onGesture(e); _gestureBase = 0 } }}
/>

{#if url}
  <!-- Backdrop, focusable so keyboard events land here -->
  <div
    bind:this={backdropEl}
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-label="Media viewer"
    class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 outline-none"
    data-zoom-surface
    onclick={onclose}
    onkeydown={handleKey}
    onwheel={onWheel}
    use:focusTrap={{ autoFocus: false }}
  >
    <!-- Top toolbar -->
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div
      role="presentation"
      class="absolute top-4 right-4 z-10 flex items-center gap-2"
      onclick={(e) => e.stopPropagation()}
    >
      {#if type === 'image'}
        <button
          type="button"
          class="inline-flex size-8 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 disabled:opacity-40"
          title="Zoom out (−)"
          onclick={() => step(1 / 1.25)}
          disabled={zoom <= ZOOM_MIN}
        >
          <ZoomOut class="size-4" />
        </button>
        <button
          type="button"
          class="min-w-[3rem] rounded-full text-center font-mono text-ui-xs text-white/70 transition-colors hover:text-white"
          title="Reset to 100% (0)"
          onclick={reset}
        >{Math.round(zoom * 100)}%</button>
        <button
          type="button"
          class="inline-flex size-8 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 disabled:opacity-40"
          title="Zoom in (+)"
          onclick={() => step(1.25)}
          disabled={zoom >= ZOOM_MAX}
        >
          <ZoomIn class="size-4" />
        </button>
        <span class="h-5 w-px bg-white/20"></span>
      {/if}
      <button
        type="button"
        class="inline-flex size-8 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
        title="Open in browser"
        onclick={(e) => { e.stopPropagation(); void openExternal() }}
      >
        <ExternalLink class="size-4" />
      </button>
      <button
        type="button"
        class="inline-flex size-8 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
        title="Close (Esc)"
        onclick={(e) => { e.stopPropagation(); onclose() }}
      >
        <X class="size-4" />
      </button>
    </div>

    <!-- Content -->
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div
      bind:this={stageEl}
      role="presentation"
      class={cn(
        'flex items-center justify-center overflow-hidden',
        type === 'image' && (zoom > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'),
      )}
      style="max-width: 94vw; max-height: 88vh"
      onclick={(e) => e.stopPropagation()}
      onpointerdown={onPointerDown}
    >
      {#if type === 'image'}
        <!-- Panned with a transform rather than by scrolling the box: a scaled
             element does not grow its scroll area, so the old `overflow-auto`
             had nothing to scroll and everything past the edge was simply
             unreachable once you zoomed in. -->
        <img
          src={url}
          alt=""
          class={cn('rounded shadow-2xl select-none', animate && 'transition-transform duration-150')}
          style="transform: translate3d({pan.x}px, {pan.y}px, 0) scale({zoom}); transform-origin: center center; max-width: 90vw; max-height: 85vh; object-fit: contain"
          draggable="false"
          ondblclick={(e) => { animate = true; if (zoom === 1) zoomTo(2, e.clientX, e.clientY); else reset() }}
          onload={(e) => {
            const img = /** @type {HTMLImageElement} */ (e.currentTarget)
            imgNatural = { w: img.naturalWidth, h: img.naturalHeight }
          }}
        />
      {:else if type === 'pdf'}
        <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
        <div
          role="presentation"
          class="flex flex-col items-center gap-5 rounded-2xl bg-white/10 px-10 py-12 text-white backdrop-blur-sm"
          onclick={(e) => e.stopPropagation()}
        >
          <svg class="size-16 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9v-3z"/>
            <path d="M13 13h2v1.5h-2V13z"/>
            <path d="M16 13v3"/>
          </svg>
          <div class="text-center">
            <p class="text-ui-lg font-semibold">PDF Document</p>
            <p class="mt-1 max-w-xs truncate text-ui-sm text-white/60">{url.split('/').pop()?.split('?')[0]}</p>
          </div>
          <button
            type="button"
            class="inline-flex h-9 items-center gap-2 rounded-lg bg-white/15 px-5 text-ui-sm font-medium text-white transition-colors hover:bg-white/25"
            onclick={() => void openExternal()}
          >
            <ExternalLink class="size-4" />
            Open in system PDF viewer
          </button>
          <p class="text-ui-xs text-white/40">PDFs open in your default application</p>
        </div>
      {/if}
    </div>

    <!-- Bottom info bar -->
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div
      role="presentation"
      class="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur-sm"
      onclick={(e) => e.stopPropagation()}
    >
      {#if imgNatural.w > 0}
        <span class="font-mono text-ui-3xs text-white/50">{imgNatural.w} × {imgNatural.h}</span>
        <span class="h-3 w-px bg-white/20"></span>
      {/if}
      <p class="max-w-[55ch] truncate font-mono text-ui-3xs text-white/60">{url}</p>
    </div>
  </div>
{/if}
