<script>
  import { tick } from "svelte";
  import X from "@lucide/svelte/icons/x";
  import { cn } from "$lib/utils.js";

  /**
   * @typedef {{
   *   rowIdx: number,
   *   colIdx: number,
   *   draft: string,
   *   original: string,
   *   columnName: string,
   *   dataType: string,
   *   nullable: boolean,
   * }} QuickLookCell
   */

  let {
    cell = $bindable(/** @type {QuickLookCell | null} */ (null)),
    saving = false,
    oncancel = () => {},
    onsave = /** @type {() => void} */ (() => {}),
  } = $props();

  /** @type {HTMLTextAreaElement | null} */
  let textareaEl = $state(null);

  const isNull = $derived(cell !== null && cell.draft === "");
  const charCount = $derived(cell?.draft.length ?? 0);

  $effect(() => {
    if (!cell) return;
    void tick().then(() => {
      textareaEl?.focus();
      textareaEl?.select();
    });
  });

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      oncancel();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      onsave();
      return;
    }
  }

  function setNull() {
    if (!cell) return;
    cell.draft = "";
  }
</script>

{#if cell}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center"
    onkeydown={handleKeydown}
  >
    <div
      class="absolute inset-0 bg-black/50"
      onclick={oncancel}
      role="presentation"
    ></div>

    <!-- Panel -->
    <div
      class="relative z-10 flex w-[680px] max-w-[calc(100vw-3rem)] flex-col rounded-xl border border-border/60 bg-background shadow-2xl"
      style="max-height: min(80vh, 640px)"
    >
      <!-- Header -->
      <div class="flex shrink-0 items-center gap-2.5 border-b border-border/40 px-4 py-3">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <span class="truncate font-mono text-sm font-medium text-foreground">
            {cell.columnName}
          </span>
          {#if cell.dataType}
            <span class="shrink-0 rounded border border-border/50 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70">
              {cell.dataType}
            </span>
          {/if}
          {#if cell.nullable}
            <span class="shrink-0 rounded border border-border/40 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/50">
              nullable
            </span>
          {/if}
        </div>
        <button
          type="button"
          class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
          onclick={oncancel}
          aria-label="Close"
        >
          <X class="size-3.5" />
        </button>
      </div>

      <!-- Body -->
      <div class="relative min-h-0 flex-1 overflow-hidden">
        {#if isNull}
          <div
            class="pointer-events-none absolute inset-0 flex items-start p-4"
          >
            <span class="font-mono text-sm text-muted-foreground/30 italic">NULL</span>
          </div>
        {/if}
        <textarea
          bind:this={textareaEl}
          bind:value={cell.draft}
          disabled={saving}
          spellcheck={false}
          class={cn(
            "block h-full min-h-[280px] w-full resize-none bg-transparent p-4 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/30",
            isNull && "opacity-0 pointer-events-none",
          )}
          placeholder="Enter value…"
          onkeydown={handleKeydown}
        ></textarea>
      </div>

      <!-- Footer -->
      <div class="flex shrink-0 items-center gap-2 border-t border-border/40 px-4 py-3">
        {#if cell.nullable}
          <button
            type="button"
            disabled={saving || isNull}
            class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/50 px-2.5 text-xs text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
            onclick={setNull}
          >
            Set NULL
          </button>
        {/if}

        <span class="ml-auto font-mono text-[11px] text-muted-foreground/30 tabular-nums">
          {charCount.toLocaleString()} chars
        </span>

        <button
          type="button"
          disabled={saving}
          class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/50 px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          onclick={oncancel}
        >
          Cancel
          <kbd>Esc</kbd>
        </button>

        <button
          type="button"
          disabled={saving}
          class="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
          onclick={onsave}
        >
          {saving ? "Saving…" : "Save"}
          <span class="flex items-center gap-px">
            <kbd class="kbd-on-primary">⌘</kbd>
            <kbd class="kbd-on-primary">↵</kbd>
          </span>
        </button>
      </div>
    </div>
  </div>
{/if}
