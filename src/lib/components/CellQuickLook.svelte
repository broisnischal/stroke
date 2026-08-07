<script>
  import { tick } from "svelte";
  import X from "@lucide/svelte/icons/x";
  import CircleSlash from "@lucide/svelte/icons/circle-slash";
  import { Button } from "$lib/components/ui/button/index.js";
  import { cn } from "$lib/utils.js";

  /**
   * @typedef {{
   *   rowIdx: number,
   *   colIdx: number,
   *   draft: string,
   *   original: string,
   *   isNull: boolean,
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

  // NULL is an explicit state (set via "Set NULL"), distinct from an empty
  // string. Typing anything clears it so `""` can be saved as a real value.
  const isNull = $derived(cell !== null && cell.isNull);
  const charCount = $derived(cell?.draft.length ?? 0);

  // Save chord is Cmd+Enter on macOS, Ctrl+Enter elsewhere - the hint has to
  // match what handleKeydown actually accepts.
  const isMac =
    typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
  const saveHint = isMac ? "⌘↵" : "Ctrl ↵";

  /** Inline chord hint: dim monospace inside the button, not a stacked keycap. */
  const hintCls = "font-mono text-ui-3xs tracking-tight opacity-55";

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
    cell.isNull = true;
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
      class="absolute inset-0 bg-black/65"
      onclick={oncancel}
      role="presentation"
    ></div>

    <!-- Panel -->
    <div
      class="relative z-10 flex w-[680px] max-w-[calc(100vw-3rem)] flex-col rounded-2xl border border-border/60 bg-background elevate-3-rim"
      style="max-height: min(80vh, 640px)"
    >
      <!-- Header -->
      <div class="flex shrink-0 items-center gap-2.5 border-b border-border/40 px-4 py-3">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <span class="truncate font-mono text-ui-sm font-medium text-foreground">
            {cell.columnName}
          </span>
          {#if cell.dataType}
            <span class="shrink-0 rounded border border-border/50 bg-muted/50 px-1.5 py-0.5 font-mono text-ui-3xs text-muted-foreground/70">
              {cell.dataType}
            </span>
          {/if}
          {#if cell.nullable}
            <span class="shrink-0 rounded border border-border/40 bg-muted/30 px-1.5 py-0.5 font-mono text-ui-3xs text-muted-foreground/50">
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
            <span class="font-mono text-ui-sm text-muted-foreground/30 italic">NULL</span>
          </div>
        {/if}
        <textarea
          bind:this={textareaEl}
          bind:value={cell.draft}
          disabled={saving}
          spellcheck={false}
          class={cn(
            "block h-full min-h-[280px] w-full resize-none bg-transparent p-4 font-mono text-ui-sm text-foreground outline-none placeholder:text-muted-foreground/30",
            isNull && "opacity-0 pointer-events-none",
          )}
          placeholder="Enter value…"
          oninput={() => { if (cell) cell.isNull = false; }}
          onkeydown={handleKeydown}
        ></textarea>
      </div>

      <!-- Footer -->
      <div class="flex shrink-0 items-center gap-1.5 border-t border-border/40 px-3 py-2.5">
        {#if cell.nullable}
          <Button
            variant="ghost"
            size="sm"
            disabled={saving || isNull}
            class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onclick={setNull}
          >
            <CircleSlash />
            Set NULL
          </Button>
        {/if}

        <span class="ml-auto pr-1 font-mono text-ui-2xs tabular-nums text-muted-foreground/50">
          {charCount.toLocaleString()} chars
        </span>

        <Button
          variant="ghost"
          size="sm"
          disabled={saving}
          class="text-muted-foreground hover:text-foreground"
          onclick={oncancel}
        >
          Cancel
          <span class={hintCls}>Esc</span>
        </Button>

        <Button size="sm" disabled={saving} onclick={onsave}>
          {saving ? "Saving…" : "Save"}
          <span class={hintCls}>{saveHint}</span>
        </Button>
      </div>
    </div>
  </div>
{/if}
