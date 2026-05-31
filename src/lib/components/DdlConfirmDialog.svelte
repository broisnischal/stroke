<script>
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import Loader from '@lucide/svelte/icons/loader'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import Terminal from '@lucide/svelte/icons/terminal'

  let {
    open = $bindable(false),
    title = '',
    description = '',
    /** One or more SQL statements to preview */
    sql = /** @type {string | string[]} */ (''),
    confirmLabel = 'Apply',
    /** 'destructive' turns the confirm button red */
    variant = /** @type {'default' | 'destructive'} */ ('default'),
    loading = false,
    onconfirm = () => {},
  } = $props()

  const sqlLines = $derived(Array.isArray(sql) ? sql : [sql])
  const isDestructive = $derived(variant === 'destructive')
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content showCloseButton={false} class="w-[min(500px,calc(100vw-2rem))] sm:max-w-none gap-0 overflow-hidden p-0">

      <!-- Header -->
      <div class="flex items-start gap-3.5 px-5 pt-5 pb-4">
        <div class="mt-px shrink-0 rounded-xl p-2 {isDestructive ? 'bg-destructive/10' : 'bg-muted/50'}">
          {#if isDestructive}
            <TriangleAlert class="size-3.5 text-destructive" />
          {:else}
            <Terminal class="size-3.5 text-muted-foreground/70" />
          {/if}
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-semibold text-foreground">{title}</p>
          {#if description}
            <p class="mt-0.5 text-[12px] leading-[1.5] text-muted-foreground/70">{description}</p>
          {/if}
        </div>
      </div>

      <div class="h-px bg-border/25"></div>

      <!-- SQL preview -->
      <div class="px-5 py-4">
        <p class="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/35">SQL preview</p>
        <div class="rounded-xl border border-border/20 bg-muted/[0.3] px-3.5 py-3">
          {#each sqlLines as line, i}
            <div class="{i > 0 ? 'mt-2 pt-2 border-t border-border/15' : ''} flex items-start gap-2.5">
              <span class="mt-[5px] size-1.5 shrink-0 rounded-full {isDestructive ? 'bg-destructive/50' : 'bg-muted-foreground/25'}"></span>
              <code class="min-w-0 break-all font-mono text-[12px] text-foreground/80">{line}</code>
            </div>
          {/each}
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-2 border-t border-border/25 px-5 py-3">
        <button
          type="button"
          disabled={loading}
          class="inline-flex h-8 items-center rounded-lg px-3.5 text-[13px] text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-40"
          onclick={() => (open = false)}
        >Cancel</button>
        <button
          type="button"
          disabled={loading}
          class="inline-flex h-8 items-center gap-1.5 rounded-lg px-4 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-40 {isDestructive ? 'bg-destructive text-white' : 'bg-foreground text-background'}"
          onclick={onconfirm}
        >
          {#if loading}<Loader class="size-3 animate-spin" />{/if}
          {confirmLabel}
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
