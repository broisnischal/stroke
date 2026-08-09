<script>
  /**
   * The frame the provider sign-in flows live in.
   *
   * Cloudflare and the OAuth providers each used to draw their own idle CTA,
   * waiting card, loading row and error card. Four shapes per provider, none of
   * them the same size, so every step of a sign-in resized the pane under the
   * cursor - and the idle step was a full-bleed black slab that read like a
   * landing-page CTA rather than a control in a desktop app.
   *
   * This is one card with four tones. The mark, the two lines of copy and the
   * footer stay exactly where they are from the first frame to the last; only
   * their contents change. Nothing moves while you sign in.
   */
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import { cn } from '$lib/utils.js'

  let {
    /** 'idle' waits on the user · 'busy' waits on the network · 'error' failed. */
    tone = /** @type {'idle' | 'busy' | 'error'} */ ('idle'),
    title = '',
    subtitle = '',
    /** Quiet line in the footer, left of the action. */
    hint = '',
    /** Indeterminate bar under the header - proof a long wait is still alive. */
    progress = false,
    /** The provider logo. Sits in a fixed 36px well so every provider aligns. */
    mark = undefined,
    /** The one button for this step. */
    action = undefined,
  } = $props()
</script>

<div
  class={cn(
    'flex flex-col overflow-hidden rounded-xl border bg-card/40',
    tone === 'error' ? 'border-destructive/25' : 'border-border/50',
  )}
>
  <div class="flex items-start gap-3 p-3.5">
    <div
      class={cn(
        'relative flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background',
        tone === 'error' ? 'border-destructive/25' : 'border-border/50',
      )}
    >
      {#if tone === 'busy'}
        <!-- Expanding ring, so waiting reads as progress and not as a stall. -->
        <span class="pulse-ring pointer-events-none absolute inset-0 rounded-lg ring-1 ring-primary/40"></span>
      {/if}
      {#if mark}{@render mark()}{:else}<Loader2 class="size-4 animate-spin text-muted-foreground" />{/if}
    </div>
    <div class="min-w-0 flex-1 pt-px">
      <p class="text-ui-sm font-medium leading-snug text-foreground">{title}</p>
      {#if subtitle}
        <p class="mt-1 text-pretty text-ui-xs leading-relaxed text-muted-foreground">{subtitle}</p>
      {/if}
    </div>
  </div>

  <!-- Reserved whether or not it is running: a bar that appears mid-flow would
       nudge the footer down by its own height. -->
  <div class="h-px bg-border/40">
    {#if progress}
      <span class="progress-slide block h-px w-1/3 bg-primary/70"></span>
    {/if}
  </div>

  <div class="flex min-h-11 items-center justify-between gap-3 px-3.5 py-2">
    <span class="min-w-0 truncate text-ui-2xs text-muted-foreground/55">{hint}</span>
    {#if action}<div class="shrink-0">{@render action()}</div>{/if}
  </div>
</div>

<style>
  @keyframes pulse-ring {
    0%   { opacity: 0.55; transform: scale(1); }
    100% { opacity: 0;    transform: scale(1.35); }
  }
  .pulse-ring { animation: pulse-ring 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

  @keyframes progress-slide {
    0%   { transform: translateX(-120%); }
    100% { transform: translateX(320%); }
  }
  .progress-slide { animation: progress-slide 1.3s ease-in-out infinite; }

  @media (prefers-reduced-motion: reduce) {
    .pulse-ring { animation: none; opacity: 0.4; }
    .progress-slide { animation: none; width: 100%; opacity: 0.5; }
  }
</style>
