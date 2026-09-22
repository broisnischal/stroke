<script>
  import './sonner.css'
  import { fly } from 'svelte/transition'
  import { flip } from 'svelte/animate'
  import CircleCheck from '@lucide/svelte/icons/circle-check'
  import Info from '@lucide/svelte/icons/info'
  import OctagonX from '@lucide/svelte/icons/octagon-x'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import X from '@lucide/svelte/icons/x'
  import { toast } from './toast.svelte.js'

  let {
    position = 'top-right',
    offset = '12px',
  } = $props()

  /**
   * How many cards the stack draws at once.
   *
   * It drew all of them. A batch operation that fails per row - 219 invalid
   * values in one paste - put 219 absolutely-sized cards on screen, each with an
   * enter transition and a flip animation, and the column ran off the bottom of
   * the window. The rest are not lost: their timers are in the store and they
   * come up as the ones above them expire, and the count says how many are
   * waiting.
   */
  const VISIBLE_MAX = 4
  /** Exit duration, and the gap between one card leaving and the next. */
  const OUT_MS = 180
  const STAGGER_MS = 40
  const visible = $derived(toast.toasts.slice(0, VISIBLE_MAX))
  const queued = $derived(Math.max(0, toast.toasts.length - VISIBLE_MAX))
  const showClearAll = $derived(toast.toasts.length > 1)

  /**
   * True while a Clear all is playing, which turns the flip animation off.
   *
   * Clear all used to dismiss one toast every 45ms. With four toasts that reads
   * as a sweep; with two hundred it is a ten-second crawl in which every single
   * removal re-triggers the 200ms flip of everything still on screen, so each
   * card is animating a shift while already animating its own exit. That is the
   * jitter: dozens of overlapping, restarting animations on the same elements.
   *
   * Now the store is emptied in one go and the cards leave together, staggered
   * by their own exit delay - a fixed cost, whether the queue is 4 deep or 400.
   */
  let clearing = $state(false)
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let clearingTimer

  function clearAll() {
    clearing = true
    clearTimeout(clearingTimer)
    toast.dismiss()
    // Held until the longest exit (duration + the last card's delay) has played,
    // so a toast arriving mid-sweep does not get the flip it would have skipped.
    clearingTimer = setTimeout(() => { clearing = false }, OUT_MS + VISIBLE_MAX * STAGGER_MS)
  }

  /**
   * Motion the user has asked not to see.
   *
   * The app-wide reduced-motion rules in app.css are CSS `!important`
   * overrides, and a Svelte transition animates inline styles from JS - it does
   * not read them. Both sources are checked here, in the same order the
   * stylesheet resolves them: the in-app setting wins, and the OS preference
   * decides when the setting is "System".
   */
  const reduced = $derived.by(() => {
    if (typeof document === 'undefined') return false
    const attr = document.documentElement.dataset.motion
    if (attr === 'reduced') return true
    if (attr === 'full') return false
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  const base =
    'group/toast pointer-events-auto relative flex w-full items-start gap-2 overflow-hidden rounded-xl border border-border/40 bg-popover px-2.5 py-2 text-popover-foreground shadow-[0_0_0_0.5px_rgba(0,0,0,0.03),0_10px_38px_-8px_rgba(0,0,0,0.14),0_2px_10px_-3px_rgba(0,0,0,0.06)] dark:border-white/[0.07] dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.05),0_16px_48px_-10px_rgba(0,0,0,0.55),0_4px_14px_-4px_rgba(0,0,0,0.35)]'

  const iconWrap = 'flex size-5 shrink-0 items-center justify-center rounded-md'

  const iconClass = {
    success: 'bg-success/12 text-success',
    error: 'bg-destructive/10 text-destructive dark:bg-destructive/15',
    info: 'bg-info/10 text-info dark:bg-info/12',
    warning: 'bg-warning/12 text-warning',
  }

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

  // Toasts enter from the top edge; the stack lives in normal flow so adding /
  // removing a card just reflows the column - no manual height measurement.
  const flyY = $derived(String(position).startsWith('bottom') ? 16 : -16)
</script>

<section
  class="studio-toast-root pointer-events-none fixed z-[9999] flex flex-col gap-2.5"
  style={hostStyle}
  aria-label="Notifications"
  onmouseenter={toast.pauseAll}
  onmouseleave={toast.resumeAll}
>
  {#if showClearAll}
    <div class="ml-auto flex shrink-0 items-center gap-1.5" transition:fly={{ y: -8, duration: reduced ? 0 : 160 }}>
      {#if queued > 0}
        <!-- Says the stack is capped, rather than leaving the other 215 to look
             like they were dropped. -->
        <span class="pointer-events-none rounded-lg border border-border/40 bg-popover/90 px-2 py-1 font-mono text-ui-3xs tabular-nums text-muted-foreground shadow-sm dark:border-white/[0.06]">
          +{queued.toLocaleString('en-US')}
        </span>
      {/if}
      <button
        type="button"
        class="studio-toast-clear-all pointer-events-auto shrink-0 rounded-lg border border-border/50 bg-popover px-2.5 py-1 text-ui-2xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted/60 hover:text-foreground dark:border-white/[0.08]"
        onclick={clearAll}
      >
        Clear all
      </button>
    </div>
  {/if}

  {#each visible as t, i (t.id)}
    <div
      class={base}
      style="font-family: var(--font-sans); font-size: var(--app-font-size);"
      role="status"
      in:fly={{ y: flyY, duration: reduced ? 0 : 200 }}
      out:fly={{ x: 24, duration: reduced ? 0 : OUT_MS, delay: clearing && !reduced ? i * STAGGER_MS : 0 }}
      animate:flip={{ duration: clearing || reduced ? 0 : 200 }}
    >
      {#if t.type !== 'message'}
        <span class="{iconWrap} {iconClass[t.type]}" aria-hidden="true">
          {#if t.type === 'success'}
            <CircleCheck class="size-3" strokeWidth={2.25} />
          {:else if t.type === 'error'}
            <OctagonX class="size-3" strokeWidth={2.25} />
          {:else if t.type === 'info'}
            <Info class="size-3" strokeWidth={2.25} />
          {:else if t.type === 'warning'}
            <TriangleAlert class="size-3" strokeWidth={2.25} />
          {/if}
        </span>
      {/if}

      <div class="flex min-w-0 flex-1 flex-col {t.action ? 'pr-2' : 'pr-5'}">
        <div
          class="text-ui-xs font-medium capitalize leading-tight tracking-[-0.01em] text-foreground"
        >
          {t.title}
        </div>
        {#if t.description}
          {#if t.code}
            <pre class="app-scroll mt-1 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/40 bg-muted/30 px-2 py-1.5 font-mono text-ui-2xs leading-snug text-foreground/85">{t.description}</pre>
          {:else}
            <div class="mt-0.5 text-ui-2xs leading-snug text-muted-foreground">
              {t.description}
            </div>
          {/if}
        {/if}
        {#if t.action}
          <button
            type="button"
            class="mt-1.5 self-start rounded-md border border-border/50 bg-background/60 px-2 py-0.5 text-ui-2xs font-medium text-foreground transition-colors hover:bg-muted/80"
            onclick={() => { t.action?.onClick(); toast.dismiss(t.id) }}
          >
            {t.action.label}
          </button>
        {/if}
      </div>

      <button
        type="button"
        aria-label="Close"
        class="absolute right-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[opacity,background-color,color,transform] duration-200 hover:bg-foreground/[0.06] hover:text-foreground active:scale-95 group-hover/toast:opacity-100 dark:hover:bg-white/[0.08]"
        onclick={() => toast.dismiss(t.id)}
      >
        <X class="size-3" strokeWidth={2.25} />
      </button>
    </div>
  {/each}
</section>
