<script>
  // Hard trial gate. Rendered in place of the whole app once the trial has
  // expired and no valid license is present — there is no dismiss path, the
  // only way through is activating a license.
  import Logo from './Logo.svelte'
  import Icon from './Icon.svelte'
  import LicenseActivation from './LicenseActivation.svelte'

  async function quit() {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().close()
    } catch { /* browser/dev — no-op */ }
  }
</script>

<div class="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-y-auto bg-background px-6 py-10">
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
        Activate a license to keep using Stroke. Your saved connections and settings are untouched — they'll be right here.
      </p>
    </div>

    <!-- Activation — the only way forward. No card; just the field + button. -->
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
