<script>
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import { cn } from '$lib/utils.js';

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

  const sqlPreview = $derived(
    isDropAction
      ? `DROP TABLE "${schema}"."${table}"${cascade ? ' CASCADE' : ''}`
      : `TRUNCATE TABLE "${schema}"."${table}"`,
  );

  const confirmLabel = $derived(isDropAction ? 'Drop table' : 'Truncate table');

  const warningText = $derived(
    isDropAction
      ? 'You are about to permanently drop this table, including all its data and constraints.'
      : 'You are about to permanently delete all rows from this table. This cannot be undone.',
  );

  function handleConfirm() {
    open = false;
    onconfirm(cascade);
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="max-w-[32rem] gap-0 overflow-hidden p-0 sm:rounded-xl">
      <!-- Warning -->
      <div class="px-6 pt-6 pb-5">
        <p class="text-sm text-foreground">
          You are about to <strong>permanently</strong>
          {isDropAction ? 'drop this table, including all its data' : 'delete all rows from this table'}.
        </p>
      </div>

      <div class="border-t border-dashed border-border/60"></div>

      {#if isDropAction}
        <!-- Cascade toggle -->
        <div class="flex items-start gap-3 px-6 py-4">
          <button
            type="button"
            role="switch"
            aria-checked={cascade}
            aria-label="Cascade"
            class={cn(
              'relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              cascade ? 'bg-destructive' : 'bg-input',
            )}
            onclick={() => (cascade = !cascade)}
          >
            <span
              class={cn(
                'pointer-events-none block size-4 rounded-full bg-background shadow-lg ring-0 transition-transform',
                cascade ? 'translate-x-4' : 'translate-x-0',
              )}
            ></span>
          </button>
          <div>
            <p class="text-sm font-medium text-foreground">Cascade</p>
            <p class="text-xs text-muted-foreground">Drop all objects that depend on this table</p>
          </div>
        </div>

        <div class="border-t border-dashed border-border/60"></div>
      {/if}

      <!-- SQL preview -->
      <div class="px-6 py-4">
        <div class="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
          <span class="size-2 shrink-0 rounded-full bg-muted-foreground/30"></span>
          <code class="min-w-0 truncate font-mono text-sm">
            <span class="text-destructive">
              {isDropAction ? 'DROP TABLE' : 'TRUNCATE TABLE'}
            </span>
            <span class="text-foreground/80"> "{schema}"."{table}"</span>
            {#if isDropAction && cascade}
              <span class="text-muted-foreground"> CASCADE</span>
            {/if}
          </code>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-2 border-t border-border/40 px-6 py-4">
        <button
          type="button"
          class="inline-flex h-9 items-center justify-center rounded-md border border-border bg-transparent px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          onclick={() => (open = false)}
        >
          Cancel
        </button>
        <button
          type="button"
          class="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-4 text-sm font-bold text-destructive-foreground transition-opacity hover:opacity-90"
          onclick={handleConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
