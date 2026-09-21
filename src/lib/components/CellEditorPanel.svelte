<script>
  /**
   * The focused cell, full size, docked under the grid.
   *
   * A grid row is 28px tall, which is the wrong surface for a paragraph of
   * markdown, a stack trace, a 40-line JSON payload or a SQL snippet stored in a
   * text column - the inline editor shows one line of it and scrolls the rest
   * sideways. Shift+Space opens the same value here: the whole thing, wrapped,
   * editable, with the raw text and a read-only preview side by side when the
   * value is structured.
   *
   * It is a dock, not a dialog. A centred modal over a table put the value on
   * top of the rows it came from, dimmed the data you were comparing it against
   * and took the whole window for one field. The related-rows panel already
   * established where a second surface belongs in this app - along the bottom
   * edge, resizable, with the grid still live above it - so this sits in the
   * same place, wears the same chrome, and leaves the row it belongs to visible.
   *
   * It stages, it does not write. Stage change hands the value back on exactly
   * the path the inline editor uses, so it lands in the same staged-changes
   * queue with the same undo and the same Apply button.
   *
   * @typedef {Object} Props
   * @property {boolean} open
   * @property {string} colName
   * @property {string} colType
   * @property {unknown} value
   * @property {string} [sourceHint] Small context hint, e.g. "row 12".
   * @property {boolean} [readOnly]
   * @property {(next: string) => void} oncommit
   */
  import Pencil from '@lucide/svelte/icons/pencil'
  import Copy from '@lucide/svelte/icons/copy'
  import WrapText from '@lucide/svelte/icons/wrap-text'
  import X from '@lucide/svelte/icons/x'
  import { cn } from '$lib/utils.js'
  import { toast } from '$lib/components/ui/sonner/toast.svelte.js'
  import Kbd from './Kbd.svelte'
  import { resetInputHistory } from '$lib/input-shortcuts.js'

  let {
    open = $bindable(false),
    colName = 'value',
    colType = '',
    value = null,
    sourceHint = '',
    readOnly = false,
    oncommit = /** @type {(next: string) => void} */ (() => {}),
  } = $props()

  /** The value as text, pretty-printed when it is JSON. */
  function toText(/** @type {unknown} */ v) {
    if (v === null || v === undefined) return ''
    if (typeof v === 'object') {
      try { return JSON.stringify(v, null, 2) } catch { return String(v) }
    }
    const s = String(v)
    // A JSON string stored in a text column is still JSON to the person reading
    // it, so it opens formatted rather than as one 4,000-character line.
    const t = s.trim()
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { return JSON.stringify(JSON.parse(t), null, 2) } catch { /* not JSON after all */ }
    }
    return s
  }

  let draft = $state('')
  let original = $state('')
  /** @type {HTMLTextAreaElement | null} */
  let area = $state(null)

  /** The cell the draft was seeded from - `colName` plus the row hint. */
  let seededCell = ''
  let wasOpen = false

  // Re-seed when the CELL changes, not on every `value` change: the parent keeps
  // the row reactive, and rewriting the draft under the cursor mid-edit loses
  // typing. The dock stays mounted and follows the grid's cell cursor, so "which
  // cell is this" has to be part of the comparison.
  //
  // Focus is taken on open only. Following the cursor must not pull focus out of
  // the grid, or the arrow key that moved it would be the last one that worked.
  $effect(() => {
    const cell = `${colName}\u0000${sourceHint}`
    const text = toText(value)
    if (!open) { wasOpen = false; seededCell = ''; return }
    if (wasOpen && cell === seededCell) return
    const justOpened = !wasOpen
    // An unstaged draft is about to be replaced by the cell the cursor moved to.
    // Said out loud, because losing typing silently is worse than a toast.
    if (!justOpened && draft !== original) {
      toast.info('Unstaged edit discarded', { description: seededCell.split('\u0000')[0], duration: 1800 })
    }
    seededCell = cell
    wasOpen = true
    original = text
    draft = text
    // Undo/redo, word-delete and line-delete for every plain field in the app
    // live in `input-shortcuts.js`, and its history is keyed by element. This
    // textarea outlives the cell it is showing, so the history has to be
    // dropped whenever it is re-pointed - otherwise ⌘Z in one cell walks back
    // into the value of a cell you have already left.
    queueMicrotask(() => {
      resetInputHistory(area)
      if (justOpened) area?.focus()
    })
  })

  const dirty = $derived(draft !== original)
  const isNull = $derived(value === null || value === undefined)

  /** Structured values get a preview pane; plain text does not need one. */
  const parsed = $derived.by(() => {
    const t = draft.trim()
    if (!t || (t[0] !== '{' && t[0] !== '[')) return null
    try { return { ok: true, value: JSON.parse(t) } } catch (e) { return { ok: false, error: String(e) } }
  })

  const lines = $derived(draft ? draft.split('\n').length : 0)
  const chars = $derived(draft.length)

  /**
   * Soft wrap, ON by default.
   *
   * The values that need this panel are prose, JSON and stack traces - one long
   * line each - and the point of opening a cell full size is to read it, which
   * no-wrap turns into horizontal scrolling. An editor defaults the other way
   * because it holds source, where a line is a unit; a cell is not.
   *
   * Wrapped, logical line 4 can occupy six rows, so the gutter would have to
   * either number visual rows (disagreeing with the count in the bar and with
   * any error quoting a line) or lie: it hides instead, and Alt+Z turns wrap off
   * to bring it back.
   */
  let wrap = $state(true)

  /** One entry per logical line. Values are a cell, not a file - no windowing. */
  const lineNumbers = $derived(Array.from({ length: Math.max(1, lines) }, (_, i) => i + 1))
  /** Sized to the widest number it will draw, so the text does not shift. */
  const gutterW = $derived(Math.max(2, String(Math.max(1, lines)).length) * 8 + 14)

  // The editor's type metrics, as whole pixels. The gutter has to sit on the
  // same baseline grid as the text beside it, and a fractional line-height
  // (1.5 × 13px = 19.5px) drifts a pixel per line against a separate box that
  // rounds it the other way - by line 30 the numbers no longer line up.
  const LINE_H = 20

  /** @type {HTMLElement | null} */
  let gutterEl = $state(null)
  function syncGutter() {
    if (gutterEl && area) gutterEl.scrollTop = area.scrollTop
  }

  function apply() {
    if (readOnly || !dirty) { open = false; return }
    oncommit(draft)
    open = false
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft)
      toast.success('Copied', { duration: 1800 })
    } catch (e) {
      toast.error('Could not copy', { description: String(e?.message ?? e) })
    }
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    // Cmd/Ctrl+Enter applies, matching every other multi-line editor in the app.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      apply()
      return
    }
    // Escape closes from inside the field. It is stopped here because the shell
    // runs a document-level Escape chain that closes whatever it knows about,
    // and it does not know about this dock - so it was swallowing the key on
    // its way out.
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      open = false
      return
    }
    // Alt+Z toggles wrap, as it does in VS Code and every editor that copied it.
    if (e.altKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault()
      wrap = !wrap
      return
    }
    // Tab indents rather than leaving the field - this is an editor, and the
    // values that need it are JSON and SQL. Shift+Tab still tabs out.
    //
    // Inserted through `execCommand`, not by assigning `draft`: a state write
    // changes the value without an `input` event, so the shared undo stack
    // never records the step and ⌘Z afterwards skipped straight past the
    // indent (or, on the first edit, appeared to do nothing at all).
    if (e.key === 'Tab' && !e.shiftKey && !readOnly && area) {
      e.preventDefault()
      const ok = document.execCommand?.('insertText', false, '  ')
      if (!ok) {
        // execCommand is deprecated and can refuse; setRangeText + a dispatched
        // `input` is the same change through the supported path.
        const { selectionStart: a0, selectionEnd: a1 } = area
        area.setRangeText('  ', a0, a1, 'end')
        area.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
  }
</script>

<!-- Docked bottom panel, fills the dock's height (flex column). The dock
     container provides the top border + resize handle, exactly as it does for
     the related-rows panel. -->
<div class="flex h-full min-h-0 w-full flex-col bg-background">

  <!-- One bar, not a header and a footer: the counts and the two actions fit
       beside the name, and a 28px row of value did not need 92px of chrome. -->
  <div class="flex h-8 shrink-0 items-center gap-2 border-b border-border/40 bg-muted/20 px-2.5">
    <Pencil class="size-3.5 shrink-0 text-muted-foreground" />
    <span class="min-w-0 truncate font-mono text-ui-2xs font-medium text-foreground/85">{colName}</span>
    {#if colType}
      <span class="shrink-0 rounded-[3px] border border-border/50 bg-muted/40 px-1.5 py-px font-mono text-ui-3xs text-muted-foreground">{colType}</span>
    {/if}
    {#if sourceHint}
      <span class="shrink-0 font-mono text-ui-3xs text-muted-foreground">({sourceHint})</span>
    {/if}
    {#if isNull && !dirty}
      <span class="shrink-0 font-mono text-ui-3xs text-muted-foreground">NULL</span>
    {/if}
    {#if readOnly}
      <span class="shrink-0 font-mono text-ui-3xs text-muted-foreground">read-only</span>
    {/if}
    <span class="shrink-0 font-mono text-ui-3xs tabular-nums text-muted-foreground">
      {lines.toLocaleString()}L · {chars.toLocaleString()}c
    </span>
    {#if dirty && !readOnly}
      <span class="shrink-0 text-ui-3xs text-primary">edited</span>
    {/if}

    <div class="ml-auto flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        aria-pressed={wrap}
        class={cn(
          'inline-flex h-7 items-center gap-1.5 rounded px-2 font-mono text-ui-2xs transition-colors hover:bg-muted/40 hover:text-foreground',
          wrap ? 'text-foreground' : 'text-muted-foreground',
        )}
        onclick={() => (wrap = !wrap)}
        title="Soft wrap (Alt+Z)"
      >
        <WrapText class="size-3.5 shrink-0" />
      </button>
      <button
        type="button"
        class="inline-flex h-7 items-center gap-1.5 rounded px-2 font-mono text-ui-2xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        onclick={copy}
        title="Copy the value as text"
      >
        Copy
        <Copy class="size-3.5 shrink-0" />
      </button>
      {#if !readOnly}
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1.5 rounded px-2 font-mono text-ui-2xs text-primary transition-colors hover:bg-primary/10 disabled:opacity-40 disabled:hover:bg-transparent"
          disabled={!dirty}
          onclick={apply}
          title="Stage this value with your other pending edits"
        >
          Stage change
          <Kbd combo="Mod+Enter" />
        </button>
      {/if}
      <button
        type="button"
        class="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        onclick={() => (open = false)}
        aria-label="Close cell editor"
      >
        <X class="size-3.5" />
      </button>
    </div>
  </div>

  <!-- Editor, and the preview beside it only when there is something to
       preview. A second pane holding a copy of the same plain text would be two
       views of one thing. -->
  <div class="flex min-h-0 flex-1">
    <!-- Line numbers, on the same 20px baseline grid as the text. Padded top by
         the same 8px the textarea is, so line 1 lines up with line 1. -->
    {#if !wrap}
      <div
        bind:this={gutterEl}
        aria-hidden="true"
        class="shrink-0 select-none overflow-hidden border-r border-border/30 bg-muted/10 py-2 text-right font-mono text-ui-3xs tabular-nums text-muted-foreground/45"
        style="width:{gutterW}px; line-height:{LINE_H}px"
      >
        {#each lineNumbers as n (n)}<div class="px-2">{n}</div>{/each}
      </div>
    {/if}
    <textarea
      bind:this={area}
      bind:value={draft}
      readonly={readOnly}
      spellcheck="false"
      wrap={wrap ? 'soft' : 'off'}
      onkeydown={onKey}
      onscroll={syncGutter}
      aria-label="{colName} value"
      class={cn(
        'no-field-frame app-scroll min-h-0 flex-1 resize-none bg-transparent py-2 pl-3 pr-3',
        // A code surface, so: whole-pixel leading, two-space tabs, no ligature
        // of prose typography. `leading-relaxed` was 1.625 - a third of a line of
        // air between every row, which is what made this read as a text box
        // rather than an editor.
        'font-mono text-ui-2xs text-foreground outline-none placeholder:text-muted-foreground',
        wrap ? 'whitespace-pre-wrap [overflow-wrap:anywhere]' : 'overflow-x-auto whitespace-pre',
      )}
      style="line-height:{LINE_H}px; tab-size:2"
      placeholder={isNull ? 'NULL' : ''}
    ></textarea>
    {#if parsed}
      <div class="flex min-h-0 w-1/2 shrink-0 flex-col border-l border-border/40">
        <div class="flex h-7 shrink-0 items-center gap-1.5 border-b border-border/30 px-2.5">
          <span class="text-ui-3xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Preview</span>
          {#if !parsed.ok}
            <span class="truncate font-mono text-ui-3xs text-destructive">invalid JSON</span>
          {/if}
        </div>
        <div class="app-scroll min-h-0 flex-1 overflow-auto px-2.5 py-2">
          {#if parsed.ok}
            <pre class="whitespace-pre-wrap break-words font-mono text-ui-3xs leading-relaxed text-foreground/80">{JSON.stringify(parsed.value, null, 2)}</pre>
          {:else}
            <p class="font-mono text-ui-3xs leading-relaxed text-destructive/90">{parsed.error}</p>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
