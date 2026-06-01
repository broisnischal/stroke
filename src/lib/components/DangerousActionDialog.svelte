<script>
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import { cn } from '$lib/utils.js';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

  /**
   * @typedef {'drop' | 'truncate'} ActionKind
   */

  let {
    open = $bindable(false),
    /** @type {ActionKind} */
    action = 'drop',
    schema = '',
    table = '',
    cascade = $bindable(false),
    onconfirm = /** @type {(cascade: boolean) => void} */ (() => {}),
  } = $props();

  const isDropAction = $derived(action === 'drop');
  const confirmLabel = $derived(isDropAction ? 'Drop table' : 'Truncate table');
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content showCloseButton={false} class="w-[min(460px,calc(100vw-2rem))] sm:max-w-none gap-0 overflow-hidden p-0">

      <!-- Header -->
      <div class="flex items-start gap-3.5 px-5 pt-5 pb-4">
        <div class="mt-px shrink-0 rounded-xl bg-destructive/10 p-2">
          <TriangleAlert class="size-3.5 text-destructive" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-semibold text-foreground">
            {isDropAction ? 'Drop table' : 'Truncate table'}
          </p>
          <p class="mt-1 text-[12px] leading-[1.5] text-muted-foreground/70">
            {isDropAction
              ? 'Permanently removes the table, all data, and constraints. This cannot be undone.'
              : 'Deletes every row in this table. The table structure is kept but all data is permanently lost.'}
          </p>
        </div>
      </div>

      <div class="h-px bg-border/25"></div>

      {#if isDropAction}
        <!-- Cascade toggle -->
        <div class="flex items-center justify-between gap-4 px-5 py-3.5">
          <div>
            <p class="text-[12px] font-medium text-foreground">Cascade</p>
            <p class="mt-0.5 text-[11px] text-muted-foreground/55">Also drop all dependent objects</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={cascade}
            aria-label="Cascade"
            class={cn(
              'relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              cascade ? 'bg-destructive' : 'bg-muted',
            )}
            onclick={() => (cascade = !cascade)}
          >
            <span class={cn(
              'pointer-events-none block size-3.5 rounded-full bg-white shadow-sm transition-transform duration-200',
              cascade ? 'translate-x-[14px]' : 'translate-x-0',
            )}></span>
          </button>
        </div>

        <div class="h-px bg-border/25"></div>
      {/if}

      <!-- SQL preview -->
      <div class="px-5 py-4">
        <p class="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/35">Will execute</p>
        <div class="rounded-xl border border-border/20 bg-muted/[0.3] px-3.5 py-2.5">
          <code class="break-all font-mono text-[12px]">
            <span class="text-destructive">{isDropAction ? 'DROP TABLE' : 'TRUNCATE TABLE'}</span>
            <span class="text-foreground/70"> "{schema}"."{table}"</span>
            {#if isDropAction && cascade}
              <span class="text-muted-foreground/70"> CASCADE</span>
            {/if}
          </code>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-2 border-t border-border/25 px-5 py-3">
        <button
          type="button"
          class="inline-flex h-8 items-center rounded-lg px-3.5 text-[13px] text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
          onclick={() => (open = false)}
        >Cancel</button>
        <button
          type="button"
          class="inline-flex h-8 items-center rounded-lg bg-destructive px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          onclick={() => { open = false; onconfirm(cascade) }}
        >{confirmLabel}</button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
