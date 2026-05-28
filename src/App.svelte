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
