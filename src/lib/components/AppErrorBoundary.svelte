<script>
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'

  let { children } = $props()
</script>

<svelte:boundary onerror={(e) => { try { console.error('[app-boundary]', e) } catch { /* noop */ } }}>
  {@render children()}

  {#snippet failed(error, reset)}
    <div class="flex h-screen w-screen flex-col items-center justify-center gap-5 bg-background px-8 text-center select-none">
      <div class="flex size-12 items-center justify-center rounded-2xl bg-destructive/10">
        <TriangleAlert class="size-6 text-destructive" />
      </div>

      <div class="space-y-1">
        <h1 class="text-ui font-semibold text-foreground">Something went wrong</h1>
        <p class="mx-auto max-w-md text-ui-sm text-muted-foreground">
          The interface hit an unexpected error. Try to recover, or reload — your
          connections and data are safe.
        </p>
      </div>

      <pre class="max-h-40 w-full max-w-lg overflow-auto rounded-lg border border-border/60 bg-muted/30 p-3 text-left font-mono text-ui-2xs leading-relaxed text-muted-foreground select-text">{String(/** @type {any} */ (error)?.message ?? error)}</pre>

      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={reset}
          class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-ui-xs font-medium text-background transition-opacity hover:opacity-85"
        >
          <RotateCcw class="size-3.5" /> Try to recover
        </button>
        <button
          type="button"
          onclick={() => location.reload()}
          class="inline-flex h-8 items-center rounded-lg border border-border/60 px-3 text-ui-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          Reload app
        </button>
      </div>
    </div>
  {/snippet}
</svelte:boundary>
