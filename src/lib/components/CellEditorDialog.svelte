<script>
  /**
   * The focused cell, full size.
   *
   * A grid row is 28px tall, which is the wrong surface for a paragraph of
   * markdown, a stack trace, a 40-line JSON payload or a SQL snippet stored in a
   * text column - the inline editor shows one line of it and scrolls the rest
   * sideways. Shift+Space opens the same value here: the whole thing, wrapped,
   * editable, with the raw text and a read-only preview side by side when the
   * value is structured.
   *
   * It stages, it does not write. Apply hands the value back on exactly the path
   * the inline editor uses, so it lands in the same staged-changes queue with the
   * same undo and the same Apply button.
   *
   * @typedef {Object} Props
   * @property {boolean} open
   * @property {string} colName
   * @property {string} colType
   * @property {unknown} value
   * @property {boolean} [readOnly]
   * @property {(next: string) => void} oncommit
   */
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import Icon from "./Icon.svelte";
  import { cn } from "$lib/utils.js";
  import { toast } from "$lib/components/ui/sonner/toast.svelte.js";
  import { IS_MAC } from "$lib/shortcuts.js";

  let {
    open = $bindable(false),
    colName = "value",
    colType = "",
    value = null,
    readOnly = false,
    oncommit = /** @type {(next: string) => void} */ (() => {}),
  } = $props();

  /** The value as text, pretty-printed when it is JSON. */
  function toText(/** @type {unknown} */ v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") {
      try { return JSON.stringify(v, null, 2); } catch { return String(v); }
    }
    const s = String(v);
    // A JSON string stored in a text column is still JSON to the person reading
    // it, so it opens formatted rather than as one 4,000-character line.
    const t = s.trim();
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
      try { return JSON.stringify(JSON.parse(t), null, 2); } catch { /* not JSON after all */ }
    }
    return s;
  }

  let draft = $state("");
  let original = $state("");
  /** @type {HTMLTextAreaElement | null} */
  let area = $state(null);

  // Re-seed on each open, not on every `value` change: the parent keeps the row
  // reactive, and rewriting the draft under the cursor mid-edit loses typing.
  $effect(() => {
    if (!open) return;
    const text = toText(value);
    original = text;
    draft = text;
    queueMicrotask(() => area?.focus());
  });

  const dirty = $derived(draft !== original);
  const isNull = $derived(value === null || value === undefined);

  /** Structured values get a preview pane; plain text does not need one. */
  const parsed = $derived.by(() => {
    const t = draft.trim();
    if (!t || (t[0] !== "{" && t[0] !== "[")) return null;
    try { return { ok: true, value: JSON.parse(t) }; } catch (e) { return { ok: false, error: String(e) }; }
  });

  const lines = $derived(draft ? draft.split("\n").length : 0);
  const chars = $derived(draft.length);

  function apply() {
    if (readOnly || !dirty) { open = false; return; }
    oncommit(draft);
    open = false;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    // Cmd/Ctrl+Enter applies, matching every other multi-line editor in the app.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      apply();
      return;
    }
    // Escape closes from inside the field. It is handled (and stopped) here
    // because the shell runs a document-level Escape chain that closes whatever
    // it knows about - and it does not know about this dialog, so it was
    // swallowing the key on its way out.
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      open = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-[70] bg-black/60" />
    <Dialog.Content
      showCloseButton={false}
      onEscapeKeydown={() => (open = false)}
      class={cn(
        "fixed left-1/2 top-1/2 z-[71] flex w-[min(56rem,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden",
        "rounded-xl border border-border/60 bg-background p-0 elevate-3-rim outline-none",
        // Sized to the value: a 64-character id got a 78vh slab with an acre of
        // empty field under one line of text. It grows with the content and
        // stops at 80vh; the preview pane, when there is one, sets the floor.
        parsed ? "h-[min(80vh,44rem)]" : "max-h-[80vh]",
      )}
    >
      <div class="flex h-11 shrink-0 items-center gap-2 border-b border-border/50 px-3.5">
        <Icon name="pencil" class="size-3.5 shrink-0 text-muted-foreground" />
        <Dialog.Title class="min-w-0 truncate font-mono text-ui-sm font-medium text-foreground">{colName}</Dialog.Title>
        {#if colType}
          <span class="shrink-0 rounded bg-muted/50 px-1.5 py-px font-mono text-ui-3xs text-muted-foreground">{colType}</span>
        {/if}
        {#if isNull && !dirty}
          <span class="shrink-0 rounded bg-muted/50 px-1.5 py-px font-mono text-ui-3xs text-muted-foreground">NULL</span>
        {/if}
        {#if readOnly}
          <span class="shrink-0 rounded bg-muted/50 px-1.5 py-px text-ui-3xs text-muted-foreground">read-only</span>
        {/if}
        <div class="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Copy value"
            aria-label="Copy value"
            onclick={copy}
          >
            <Icon name="copy" class="size-3.5" />
          </button>
          <Dialog.Close
            class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <Icon name="x" class="size-3.5" />
          </Dialog.Close>
        </div>
      </div>

      <!-- Editor, and the preview beside it only when there is something to
           preview. A second pane holding a copy of the same plain text would be
           two views of one thing. -->
      <div class="flex min-h-0 flex-1">
        <textarea
          bind:this={area}
          bind:value={draft}
          readonly={readOnly}
          spellcheck="false"
          onkeydown={onKey}
          aria-label="{colName} value"
          class={cn(
            "no-field-frame min-h-[9rem] flex-1 resize-none bg-transparent p-4 font-mono text-ui-sm leading-relaxed text-foreground outline-none",
            "max-h-[calc(80vh-6rem)] placeholder:text-muted-foreground",
          )}
          placeholder={isNull ? "NULL" : ""}
        ></textarea>
        {#if parsed}
          <div class="flex min-h-0 w-1/2 shrink-0 flex-col border-l border-border/50">
            <div class="flex shrink-0 items-center gap-1.5 border-b border-border/40 px-3 py-1.5">
              <span class="text-ui-3xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Preview</span>
              {#if !parsed.ok}
                <span class="truncate text-ui-3xs text-destructive">invalid JSON</span>
              {/if}
            </div>
            <div class="app-scroll min-h-0 flex-1 overflow-auto p-4">
              {#if parsed.ok}
                <pre class="whitespace-pre-wrap break-words font-mono text-ui-xs leading-relaxed text-foreground/80">{JSON.stringify(parsed.value, null, 2)}</pre>
              {:else}
                <p class="font-mono text-ui-2xs leading-relaxed text-destructive/90">{parsed.error}</p>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <div class="flex h-12 shrink-0 items-center gap-3 border-t border-border/50 px-3.5">
        <span class="font-mono text-ui-3xs tabular-nums text-muted-foreground">
          {lines.toLocaleString()} {lines === 1 ? "line" : "lines"} · {chars.toLocaleString()} {chars === 1 ? "char" : "chars"}
        </span>
        {#if dirty && !readOnly}
          <span class="text-ui-3xs text-primary">edited</span>
        {/if}
        <div class="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onclick={() => (open = false)}>Cancel</Button>
          <Button size="sm" disabled={readOnly || !dirty} onclick={apply}>
            Stage change
          </Button>
          <span class="font-mono text-ui-3xs text-muted-foreground">{IS_MAC ? '⌘↵' : 'Ctrl+↵'}</span>
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
