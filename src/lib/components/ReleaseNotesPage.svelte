<script>
  import { cn } from '$lib/utils.js'
  import Sparkles    from '@lucide/svelte/icons/sparkles'
  import Bug         from '@lucide/svelte/icons/bug'
  import Wrench      from '@lucide/svelte/icons/wrench'
  import ArrowRight  from '@lucide/svelte/icons/arrow-right'
  import ChevronLeft from '@lucide/svelte/icons/chevron-left'
  import Download    from '@lucide/svelte/icons/download'
  import RefreshCw   from '@lucide/svelte/icons/refresh-cw'
  import Loader2     from '@lucide/svelte/icons/loader-2'
  import AlertCircle from '@lucide/svelte/icons/alert-circle'

  /**
   * @typedef {{ title: string, type: 'feature'|'fix'|'change'|'other', items: string[] }} ChangeSection
   */

  let {
    version     = '',
    /** @type {ChangeSection[]} */
    changelog   = [],
    releaseNotes = '',
    /** @type {'available'|'downloading'|'done'|'error'} */
    status      = 'available',
    progress    = 0,
    downloadedBytes = 0,
    totalBytes  = 0,
    errorMsg    = '',
    oninstall   = () => {},
    onrestart   = () => {},
    onclose     = () => {},
  } = $props()

  /** @param {number} bytes */
  function fmt(bytes) {
    if (bytes < 1024)       return `${bytes} B`
    if (bytes < 1024*1024)  return `${(bytes/1024).toFixed(1)} KB`
    return `${(bytes/(1024*1024)).toFixed(1)} MB`
  }

  /**
   * Render inline markdown: **bold** and `code`.
   * Content comes from our own CHANGELOG, so @html is safe here.
   * @param {string} text
   */
  function renderInline(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground/90">$1</strong>')
      .replace(/`(.*?)`/g, '<code class="rounded bg-muted/50 px-1 py-0.5 font-mono text-ui-3xs">$1</code>')
  }

  const GROUP_META = {
    feature: { label: 'New Features',  Icon: Sparkles,   color: 'text-emerald-500', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5' },
    fix:     { label: 'Bug Fixes',     Icon: Bug,         color: 'text-orange-400',  border: 'border-orange-400/20',  bg: 'bg-orange-400/5'  },
    change:  { label: 'Improvements',  Icon: Wrench,      color: 'text-blue-400',    border: 'border-blue-400/20',    bg: 'bg-blue-400/5'    },
    other:   { label: 'Changes',       Icon: ArrowRight,  color: 'text-muted-foreground', border: 'border-border/30', bg: 'bg-muted/5'       },
  }

  const grouped = $derived.by(() => {
    /** @type {Record<string, ChangeSection[]>} */
    const map = {}
    for (const s of changelog) {
      if (!map[s.type]) map[s.type] = []
      map[s.type].push(s)
    }
    return /** @type {Array<'feature'|'fix'|'change'|'other'>} */ (['feature', 'fix', 'change', 'other'])
      .filter(t => map[t]?.length)
      .map(t => ({ type: t, meta: GROUP_META[t], sections: map[t] }))
  })
</script>

<div class="fixed inset-0 z-50 flex flex-col bg-background">

  <!-- ── Header ─────────────────────────────────────────────────── -->
  <div class="flex shrink-0 items-center border-b border-border/50 px-4 py-3">
    <button
      type="button"
      onclick={onclose}
      class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
    >
      <ChevronLeft class="size-3.5" />
      Back
    </button>
    <span class="flex-1 text-center text-xs font-medium text-foreground/50">Release Notes</span>
    <span class="w-[60px] text-right font-mono text-xs text-muted-foreground/50">v{version}</span>
  </div>

  <!-- ── Scrollable body ────────────────────────────────────────── -->
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto max-w-xl px-6 pb-10 pt-8">

      <!-- Hero -->
      <div class="mb-8 flex items-center gap-3.5">
        <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Sparkles class="size-4.5 text-primary" />
        </div>
        <div>
          <h1 class="text-lg font-semibold leading-tight text-foreground">What's New</h1>
          <p class="font-mono text-xs text-muted-foreground">Stroke v{version}</p>
        </div>
      </div>

      <!-- Changelog sections -->
      {#if grouped.length > 0}
        <div class="flex flex-col gap-8">
          {#each grouped as group (group.type)}
            <div>
              <!-- Group heading -->
              <div class="mb-3 flex items-center gap-1.5">
                <group.meta.Icon class={cn('size-3.5', group.meta.color)} />
                <span class={cn('text-ui-2xs font-semibold uppercase tracking-widest', group.meta.color)}>
                  {group.meta.label}
                </span>
              </div>

              <!-- Sub-sections -->
              <div class="flex flex-col gap-2">
                {#each group.sections as section (section.title)}
                  <div class={cn('overflow-hidden rounded-lg border', group.meta.border, group.meta.bg)}>
                    <div class={cn('border-b px-3 py-1.5', group.meta.border)}>
                      <span class="text-ui-2xs font-medium text-foreground/65">{section.title}</span>
                    </div>
                    <ul class="divide-y divide-border/10">
                      {#each section.items as item}
                        <li class="flex gap-2 px-3 py-2">
                          <span class="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/30"></span>
                          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                          <span class="min-w-0 text-xs leading-relaxed text-muted-foreground">{@html renderInline(item)}</span>
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>

      {:else if releaseNotes?.trim()}
        <!-- Fallback: raw notes when parser produces nothing -->
        <div class="rounded-lg border border-border/30 bg-muted/5 px-4 py-4">
          <pre class="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{releaseNotes}</pre>
        </div>

      {:else}
        <div class="rounded-lg border border-border/25 bg-muted/5 py-8 text-center">
          <p class="text-xs text-muted-foreground/50">No release notes available for this version.</p>
          <p class="mt-1 text-ui-2xs text-muted-foreground/35">Check the GitHub releases page for details.</p>
        </div>
      {/if}

    </div>
  </div>

  <!-- ── Footer action bar ─────────────────────────────────────── -->
  <div class="shrink-0 border-t border-border/50 bg-background/95 px-5 py-3.5">

    {#if status === 'available'}
      <div class="flex items-center gap-2.5">
        <button
          type="button"
          onclick={onclose}
          class="flex-1 rounded-lg border border-border px-4 py-2 text-center text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Later
        </button>
        <button
          type="button"
          onclick={oninstall}
          class="flex flex-[2] items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          <Download class="size-3.5" />
          Install Stroke {version}
        </button>
      </div>

    {:else if status === 'downloading'}
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between text-ui-2xs text-muted-foreground">
          <span class="flex items-center gap-1.5">
            <Loader2 class="size-3 shrink-0 animate-spin" />
            Downloading update…
          </span>
          <span class="font-mono tabular-nums">
            {totalBytes > 0 ? `${fmt(downloadedBytes)} / ${fmt(totalBytes)}` : `${progress}%`}
          </span>
        </div>
        <div class="h-1 w-full overflow-hidden rounded-full bg-muted">
          <div class="h-full rounded-full bg-primary transition-all duration-150" style="width:{progress}%"></div>
        </div>
      </div>

    {:else if status === 'done'}
      <button
        type="button"
        onclick={onrestart}
        class="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
      >
        <RefreshCw class="size-3.5" />
        Restart to apply update
      </button>

    {:else if status === 'error'}
      <div class="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
        <AlertCircle class="mt-0.5 size-3.5 shrink-0 text-destructive" />
        <p class="font-mono text-ui-2xs text-destructive">{errorMsg || 'Update failed. Please try again.'}</p>
      </div>
    {/if}

  </div>
</div>
