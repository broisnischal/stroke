<script>
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import Loader from '@lucide/svelte/icons/loader'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'

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

  function handleConfirm() {
    onconfirm()
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="max-w-[32rem] gap-0 overflow-hidden p-0 sm:rounded-xl">

      <!-- Header -->
      <div class="flex items-start gap-3 px-6 pt-6 pb-5">
        {#if isDestructive}
          <div class="mt-0.5 shrink-0 rounded-full bg-destructive/10 p-1.5 text-destructive">
            <TriangleAlert class="size-4" />
          </div>
        {/if}
        <div class="min-w-0 flex-1">
          <Dialog.Title class="text-sm font-semibold text-foreground">{title}</Dialog.Title>
          {#if description}
            <p class="mt-1 text-sm text-muted-foreground">{description}</p>
          {/if}
        </div>
      </div>

      <div class="border-t border-dashed border-border/60"></div>

      <!-- SQL preview -->
      <div class="px-6 py-4">
        <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">SQL Preview</p>
        <div class="rounded-lg border border-border/50 bg-muted/30 px-4 py-3 font-mono text-sm">
          {#each sqlLines as line, i}
            <div class="{i > 0 ? 'mt-1.5' : ''} flex items-start gap-2">
              <span class="mt-px size-1.5 shrink-0 rounded-full {isDestructive ? 'bg-destructive/60' : 'bg-muted-foreground/30'} mt-1.5"></span>
              <code class="min-w-0 break-all text-foreground/80">{line}</code>
            </div>
          {/each}
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-2 border-t border-border/40 px-6 py-4">
        <button
          type="button"
          disabled={loading}
          class="inline-flex h-9 items-center justify-center rounded-md border border-border bg-transparent px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          onclick={() => (open = false)}
        >Cancel</button>
        <button
          type="button"
          disabled={loading}
          class="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 {isDestructive ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'}"
          onclick={handleConfirm}
        >
          {#if loading}<Loader class="mr-2 size-3.5 animate-spin" />{/if}
          {confirmLabel}
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
