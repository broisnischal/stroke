<script>
  import { onMount } from 'svelte'
  import { Toaster } from '$lib/components/ui/sonner/index.js'
  import StudioShell from './lib/components/StudioShell.svelte'
  import LicenseGate from './lib/components/LicenseGate.svelte'
  import { loadSettings, applySettings, installZoomShortcuts } from '$lib/stores/settings.js'
  import { installPlatformClass } from '$lib/platform.js'

  onMount(async () => {
    installPlatformClass()
    applySettings(loadSettings())
    installZoomShortcuts()

    // Suppress Tauri's internal "Couldn't find callback id" warning.
    // This is harmless noise that fires when Rust resolves a promise after a
    // hot-reload or fast navigation has already torn down the JS callback.
    const _warn = console.warn
    console.warn = (/** @type {unknown} */ ...args) => {
      if (typeof args[0] === 'string' && args[0].includes("Couldn't find callback id")) return
      _warn.apply(console, args)
    }

    // Block print — no Tauri-level API exists for this, so override at the JS boundary
    window.print = () => {}
    window.addEventListener('beforeprint', (e) => e.preventDefault(), { capture: true })
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); e.stopPropagation() }
    }, { capture: true })

    // Show the window (started hidden to avoid flash of small→maximized snap)
    // and fade in the page now that theme + layout are fully ready.
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().show()
    } catch {
      // Browser dev mode or permission error — window already visible, just fade in
    } finally {
      document.documentElement.style.opacity = '1'
    }
  })
</script>

<Toaster position="top-right" offset="12px" closeButton />
<LicenseGate>
  <StudioShell />
</LicenseGate>
