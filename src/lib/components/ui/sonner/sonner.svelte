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

  const showClearAll = $derived(toast.toasts.length > 1)

  // Cascade the dismissal (newest first) instead of clearing everything in the
  // same frame, so the stack sweeps out smoothly rather than all flying at once.
  function clearAll() {
    const ids = toast.getActiveToasts().map((t) => t.id)
    ids.forEach((id, i) => setTimeout(() => toast.dismiss(id), i * 45))
  }

  const base =
    'group/toast pointer-events-auto relative flex w-full items-start gap-2 overflow-hidden rounded-xl border border-border/40 bg-popover px-2.5 py-2 text-popover-foreground shadow-[0_0_0_0.5px_rgba(0,0,0,0.03),0_10px_38px_-8px_rgba(0,0,0,0.14),0_2px_10px_-3px_rgba(0,0,0,0.06)] dark:border-white/[0.07] dark:shadow-[0_0_0_0.5px_rgba(255,255,255,0.05),0_16px_48px_-10px_rgba(0,0,0,0.55),0_4px_14px_-4px_rgba(0,0,0,0.35)]'

  const iconWrap = 'flex size-5 shrink-0 items-center justify-center rounded-md'

  const iconClass = {
    success:
      'bg-emerald-500/12 text-emerald-600 dark:bg-emerald-400/12 dark:text-emerald-400',
    error: 'bg-destructive/10 text-destructive dark:bg-destructive/15',
    info: 'bg-blue-500/10 text-blue-600 dark:bg-blue-400/12 dark:text-blue-400',
    warning:
      'bg-amber-500/12 text-amber-600 dark:bg-amber-400/12 dark:text-amber-400',
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
  // removing a card just reflows the column — no manual height measurement.
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
    <button
      type="button"
      transition:fly={{ y: -8, duration: 160 }}
      class="studio-toast-clear-all pointer-events-auto ml-auto shrink-0 rounded-lg border border-border/50 bg-popover px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted/60 hover:text-foreground dark:border-white/[0.08]"
      onclick={clearAll}
    >
      Clear all
    </button>
  {/if}

  {#each toast.toasts as t (t.id)}
    <div
      class={base}
      style="font-family: var(--font-sans); font-size: var(--app-font-size);"
      role="status"
      in:fly={{ y: flyY, duration: 200 }}
      out:fly={{ x: 24, duration: 180 }}
      animate:flip={{ duration: 200 }}
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
          class="text-[12px] font-medium capitalize leading-tight tracking-[-0.01em] text-foreground"
        >
          {t.title}
        </div>
        {#if t.description}
          {#if t.code}
            <pre class="app-scroll mt-1 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/40 bg-muted/30 px-2 py-1.5 font-mono text-[11px] leading-snug text-foreground/85">{t.description}</pre>
          {:else}
            <div class="mt-0.5 text-[11px] leading-snug text-muted-foreground/80">
              {t.description}
            </div>
          {/if}
        {/if}
        {#if t.action}
          <button
            type="button"
            class="mt-1.5 self-start rounded-md border border-border/50 bg-background/60 px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/80"
            onclick={() => { t.action?.onClick(); toast.dismiss(t.id) }}
          >
            {t.action.label}
          </button>
        {/if}
      </div>

      <button
        type="button"
        aria-label="Close"
        class="absolute right-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded-md text-muted-foreground/45 opacity-0 transition-[opacity,background-color,color,transform] duration-200 hover:bg-foreground/[0.06] hover:text-foreground active:scale-95 group-hover/toast:opacity-100 dark:hover:bg-white/[0.08]"
        onclick={() => toast.dismiss(t.id)}
      >
        <X class="size-3" strokeWidth={2.25} />
      </button>
    </div>
  {/each}
</section>
