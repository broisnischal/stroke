<script>
  import CircleCheck from '@lucide/svelte/icons/circle-check'
  import Info from '@lucide/svelte/icons/info'
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import OctagonX from '@lucide/svelte/icons/octagon-x'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import X from '@lucide/svelte/icons/x'
  import { toast, Toaster as Sonner } from 'svelte-sonner'
  import { mode } from 'mode-watcher'

  let {
    position = 'top-right',
    offset = '12px',
    visibleToasts = 8,
    expand = false,
    ...restProps
  } = $props()

  const activeCount = $derived.by(() => toast.getActiveToasts().length)
  const showClearAll = $derived(activeCount > 1)

  const base =
    'group/toast pointer-events-auto relative flex w-full items-start gap-2.5 overflow-hidden rounded-xl border border-border/40 bg-popover/90 px-3 py-2.5 text-popover-foreground shadow-[0_0_0_0.5px_rgba(0,0,0,0.03),0_10px_38px_-8px_rgba(0,0,0,0.14),0_2px_10px_-3px_rgba(0,0,0,0.06)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/[0.07] dark:bg-popover/75 dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.05),0_16px_48px_-10px_rgba(0,0,0,0.55),0_4px_14px_-4px_rgba(0,0,0,0.35)]'

  const toastOptions = {
    unstyled: true,
    classes: {
      toast: base,
      title:
        'text-[13px] font-medium capitalize leading-snug tracking-[-0.01em] text-foreground',
      description: 'mt-0.5 text-[11.5px] leading-snug text-muted-foreground/90',
      content: 'flex min-w-0 flex-1 flex-col pr-5',
      icon: 'm-0 mt-0.5 flex shrink-0 items-center self-start [&_svg]:pointer-events-none',
      actionButton:
        'h-6 shrink-0 rounded-md bg-foreground/90 px-2.5 text-[11px] font-medium text-background transition-[background-color,transform] duration-200 hover:bg-foreground active:scale-[0.98] dark:bg-foreground/85 dark:hover:bg-foreground',
      cancelButton:
        'h-6 shrink-0 rounded-md bg-muted/80 px-2.5 text-[11px] font-medium text-muted-foreground transition-[background-color,transform] duration-200 hover:bg-muted active:scale-[0.98]',
      closeButton:
        '!absolute right-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded-md text-muted-foreground/45 opacity-0 transition-[opacity,background-color,color,transform] duration-200 hover:bg-foreground/[0.06] hover:text-foreground active:scale-95 group-hover/toast:opacity-100 dark:hover:bg-white/[0.08]',
      success: base,
      error: base,
      warning: base,
      info: base,
    },
  }

  const iconWrap =
    'flex size-6 shrink-0 items-center justify-center rounded-lg'

  /** @param {string} pos @param {string | Record<string, string | number>} off */
  function hostInsetStyle(pos, off) {
    const [y, x] = pos.split('-')
    /** @type {Record<string, string>} */
    const style = { width: 'min(20rem, calc(100vw - 1.5rem))' }

    const apply = (/** @type {Record<string, string | number>} */ o) => {
      for (const key of ['top', 'right', 'bottom', 'left']) {
        const v = o[key]
        if (v !== undefined) style[key] = typeof v === 'number' ? `${v}px` : String(v)
      }
    }

    if (typeof off === 'string' || typeof off === 'number') {
      const v = typeof off === 'number' ? `${off}px` : off
      if (y === 'top') style.top = v
      if (y === 'bottom') style.bottom = v
      if (x === 'right') style.right = v
      if (x === 'left') style.left = v
      if (x === 'center') {
        style.left = '50%'
        style.transform = 'translateX(-50%)'
      }
    } else if (off && typeof off === 'object') {
      apply(off)
    }

    return Object.entries(style)
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ')
  }

  const hostStyle = $derived(hostInsetStyle(position, offset))
</script>

<section
  class="studio-toast-root"
  style={hostStyle}
  aria-label="Notifications"
>
  {#if showClearAll}
    <button
      type="button"
      class="studio-toast-clear-all pointer-events-auto ml-auto shrink-0 rounded-lg border border-border/50 bg-popover/90 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-xl transition-colors hover:bg-muted/60 hover:text-foreground dark:border-white/[0.08] dark:bg-popover/80"
      onclick={() => toast.dismiss()}
    >
      Clear all
    </button>
  {/if}

  <Sonner
    theme={mode.current}
    class="toaster studio-toaster group"
    {position}
    {offset}
    {visibleToasts}
    {expand}
    toastOptions={toastOptions}
    gap={10}
    duration={4500}
    style="--width: min(20rem, calc(100vw - 1.5rem)); --border-radius: 0.75rem; font-family: var(--font-sans); font-size: var(--app-font-size); --normal-bg: var(--popover); --normal-text: var(--popover-foreground); --normal-border: var(--border);"
    {...restProps}
  >
    {#snippet loadingIcon()}
      <span
        class="{iconWrap} bg-muted/60 text-muted-foreground"
        aria-hidden="true"
      >
        <Loader2 class="size-3.5 animate-spin" />
      </span>
    {/snippet}
    {#snippet successIcon()}
      <span
        class="{iconWrap} bg-emerald-500/12 text-emerald-600 dark:bg-emerald-400/12 dark:text-emerald-400"
        aria-hidden="true"
      >
        <CircleCheck class="size-3.5" strokeWidth={2.25} />
      </span>
    {/snippet}
    {#snippet errorIcon()}
      <span
        class="{iconWrap} bg-destructive/10 text-destructive dark:bg-destructive/15"
        aria-hidden="true"
      >
        <OctagonX class="size-3.5" strokeWidth={2.25} />
      </span>
    {/snippet}
    {#snippet infoIcon()}
      <span
        class="{iconWrap} bg-blue-500/10 text-blue-600 dark:bg-blue-400/12 dark:text-blue-400"
        aria-hidden="true"
      >
        <Info class="size-3.5" strokeWidth={2.25} />
      </span>
    {/snippet}
    {#snippet warningIcon()}
      <span
        class="{iconWrap} bg-amber-500/12 text-amber-600 dark:bg-amber-400/12 dark:text-amber-400"
        aria-hidden="true"
      >
        <TriangleAlert class="size-3.5" strokeWidth={2.25} />
      </span>
    {/snippet}
    {#snippet closeIcon()}
      <X class="size-3" strokeWidth={2.25} />
    {/snippet}
  </Sonner>
</section>

<style>
  .studio-toast-root {
    position: fixed;
    z-index: 999999999;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    pointer-events: none;
  }

  /* Anchor toaster inside host so clear-all + stack share one column */
  :global(.studio-toast-root .studio-toaster[data-sonner-toaster]) {
    position: relative !important;
    top: auto !important;
    right: auto !important;
    bottom: auto !important;
    left: auto !important;
    width: 100% !important;
    transform: none !important;
    margin: 0;
  }

  /* No slide/fade-in-up — appear in place; stack motion only */
  :global(.studio-toaster [data-sonner-toast]) {
    --y: translateY(0) !important;
    transition:
      transform 400ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 200ms ease,
      height 400ms cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 200ms ease !important;
  }

  :global(.studio-toaster [data-sonner-toast]:not([data-mounted='true'])) {
    opacity: 0;
  }

  :global(.studio-toaster [data-sonner-toast][data-mounted='true']) {
    opacity: 1;
  }

  :global(.studio-toaster [data-sonner-toast][data-removed='true'][data-swipe-out='false']) {
    --y: translateY(0) !important;
    opacity: 0 !important;
  }

  /* Collapsed stack: cards peek behind the front toast */
  :global(.studio-toaster[data-expanded='false'] [data-sonner-toast][data-front='false']) {
    opacity: 0.9;
  }

  :global(.studio-toaster[data-expanded='true'] [data-sonner-toast]) {
    opacity: 1;
  }

  /* Hide description element when empty so no ghost space below title-only toasts */
  :global(.studio-toaster [data-description]:empty) {
    display: none;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.studio-toaster [data-sonner-toast]) {
      transition-duration: 0.01ms !important;
    }
  }
</style>
