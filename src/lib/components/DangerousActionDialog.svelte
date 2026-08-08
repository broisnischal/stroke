<script>
  import ConfirmDialog from './ConfirmDialog.svelte';
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
  const title = $derived(isDropAction ? 'Drop table' : 'Truncate table');
  const description = $derived(
    isDropAction
      ? 'Permanently removes the table, all data, and constraints. This cannot be undone.'
      : 'Deletes every row in this table. The table structure is kept but all data is permanently lost.',
  );
</script>

{#snippet extra()}
  {#if isDropAction}
    <div class="flex items-center justify-between gap-4 px-5 py-3.5">
      <div>
        <p class="text-ui-xs font-medium text-foreground">Cascade</p>
        <p class="mt-0.5 text-ui-2xs text-muted-foreground/55">Also drop all dependent objects</p>
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

  <!-- The exact statement, so the confirmation is against what actually runs. -->
  <div class="px-5 py-4">
    <p class="mb-2 text-ui-3xs font-semibold uppercase tracking-[0.07em] text-muted-foreground/35">Will execute</p>
    <div class="rounded-lg border border-border/20 bg-muted/[0.3] px-3.5 py-2.5">
      <code class="break-all font-mono text-ui-xs">
        <span class="text-destructive">{isDropAction ? 'DROP TABLE' : 'TRUNCATE TABLE'}</span>
        <span class="text-foreground/70"> "{schema}"."{table}"</span>
        {#if isDropAction && cascade}
          <span class="text-muted-foreground/70"> CASCADE</span>
        {/if}
      </code>
    </div>
  </div>
{/snippet}

<ConfirmDialog
  bind:open
  icon="alert-triangle"
  {title}
  {description}
  confirmLabel={title}
  confirmIcon="trash-2"
  variant="destructive"
  {extra}
  onconfirm={() => onconfirm(cascade)}
/>
