<script>
  import X from '@lucide/svelte/icons/x'
  import ExternalLink from '@lucide/svelte/icons/external-link'
  import ZoomIn from '@lucide/svelte/icons/zoom-in'
  import ZoomOut from '@lucide/svelte/icons/zoom-out'
  import { toast } from '$lib/components/ui/sonner/toast.svelte.js'

  /** @type {{ url: string | null, type?: 'image' | 'pdf', onclose: () => void }} */
  let { url = null, type = 'image', onclose } = $props()

  let zoom = $state(1)
  let imgNatural = $state({ w: 0, h: 0 })
  /** @type {HTMLElement | null} */
  let backdropEl = $state(null)

  // Reset zoom and focus the backdrop whenever the lightbox opens
  $effect(() => {
    if (url) {
      zoom = 1
      // Focus in next microtask so the DOM has rendered
      Promise.resolve().then(() => backdropEl?.focus())
    }
  })

  /** @param {KeyboardEvent} e */
  function handleKey(e) {
    if (!url) return
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onclose(); return }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom = Math.min(4, zoom + 0.25) }
    if (e.key === '-') { e.preventDefault(); zoom = Math.max(0.25, zoom - 0.25) }
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
<svelte:window onkeydown={handleKey} />

{#if url}
  <!-- Backdrop, focusable so keyboard events land here -->
  <div
    bind:this={backdropEl}
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-label="Media viewer"
    class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 outline-none"
    onclick={onclose}
    onkeydown={handleKey}
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
          onclick={() => { zoom = Math.max(0.25, zoom - 0.25) }}
          disabled={zoom <= 0.25}
        >
          <ZoomOut class="size-4" />
        </button>
        <span class="min-w-[3rem] text-center font-mono text-ui-xs text-white/70">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          class="inline-flex size-8 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 disabled:opacity-40"
          title="Zoom in (+)"
          onclick={() => { zoom = Math.min(4, zoom + 0.25) }}
          disabled={zoom >= 4}
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
      role="presentation"
      class="flex items-center justify-center overflow-auto"
      style="max-width: 94vw; max-height: 88vh"
      onclick={(e) => e.stopPropagation()}
    >
      {#if type === 'image'}
        <img
          src={url}
          alt=""
          class="rounded shadow-2xl select-none transition-transform duration-150"
          style="transform: scale({zoom}); transform-origin: center center; max-width: 90vw; max-height: 85vh; object-fit: contain"
          draggable="false"
          ondblclick={() => { zoom = zoom === 1 ? 2 : 1 }}
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
