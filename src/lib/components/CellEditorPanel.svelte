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
   * @property {boolean} [detached] Showing a value with no cell behind it.
   * @property {boolean} [truncatedLoad] The value was loaded, but the server
   *   stopped at its ceiling - the text on screen is not all of it.
   * @property {() => Promise<void>} [onloadfull] Fetch the whole value for a
   *   capped cell. The parent replaces `value` with it, which is what clears
   *   `oversize` and turns the preview back into an ordinary value.
   * @property {{ bytes: number, dataType: string } | null} [oversize] Set when
   *   only a preview of the cell was loaded: the backend caps a cell at 256KB
   *   and ships the first 16KB, so what is on screen is a slice of the value,
   *   not the value.
   * @property {(next: string) => void} oncommit
   */
  import Pencil from '@lucide/svelte/icons/pencil'
  import Copy from '@lucide/svelte/icons/copy'
  import Download from '@lucide/svelte/icons/download'
  import Undo2 from '@lucide/svelte/icons/undo-2'
  import WrapText from '@lucide/svelte/icons/wrap-text'
  import X from '@lucide/svelte/icons/x'
  import { cn } from '$lib/utils.js'
  import { toast } from '$lib/components/ui/sonner/toast.svelte.js'
  import Kbd from './Kbd.svelte'
  import JsonTree from './JsonTree.svelte'
  import Search from '@lucide/svelte/icons/search'
  import { searchJson, matchOffsets, splitHighlight } from '$lib/json-search.js'
  import Braces from '@lucide/svelte/icons/braces'
  import { resetInputHistory } from '$lib/input-shortcuts.js'

  let {
    open = $bindable(false),
    colName = 'value',
    colType = '',
    value = null,
    sourceHint = '',
    readOnly = false,
    detached = false,
    /** @type {{ bytes: number, dataType: string } | null} */
    oversize = null,
    /** @type {null | (() => Promise<void>)} */
    onloadfull = null,
    truncatedLoad = false,
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
  /** @type {HTMLElement | null} */
  let root = $state(null)

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
    // The oversize flag is part of the identity: loading the full value swaps
    // what this cell holds without moving the cursor, and the draft has to
    // follow it.
    const cell = `${colName}\u0000${sourceHint}\u0000${detached ? 'd' : ''}\u0000${oversize ? 'preview' : 'full'}`
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
      // Focus the textarea on open, because editing is what the raw pane is
      // for - but only then. A JSON cell opens on the tree, and taking focus
      // there would cost the thing that makes this a dock rather than a
      // dialog: the grid keeps the cursor, arrow keys still move it, and the
      // panel follows. Escape from the grid closes the dock through the grid's
      // own handler; Escape from inside the dock goes through `onRootKey`.
      if (justOpened && rawOpen) area?.focus()
    })
  })

  const dirty = $derived(draft !== original)
  const isNull = $derived(value === null || value === undefined)

  /** Structured values get a tree pane; plain text does not need one. */
  /**
   * Past this, nothing runs over the whole value on its own.
   *
   * A jsonb holding a file as an array of byte integers comes back as tens of
   * megabytes of text. `JSON.parse` on 18MB is a few hundred milliseconds, and
   * a derived re-runs it on every keystroke; the search splits the same string
   * into highlight runs; a `<textarea>` with 18MB in it has to lay all of it
   * out. Each of those is fine at 100KB and none of them is fine at 18MB, so
   * above the line the tree is built when asked for, the highlight layer stands
   * down, and the raw pane is opt-in.
   */
  const HEAVY_VALUE_CHARS = 2 * 1024 * 1024

  const heavy = $derived(draft.length > HEAVY_VALUE_CHARS)
  /** Set by "Render it anyway" - one parse, on demand, for a heavy value. */
  let forceParse = $state(false)
  // A new cell is a new decision.
  $effect(() => { void colName; void sourceHint; forceParse = false })

  const parsed = $derived.by(() => {
    const t = draft.trim()
    if (!t || (t[0] !== '{' && t[0] !== '[')) return null
    // A capped cell ships its first 16KB, which for a JSON value stops
    // mid-token: parsing it can only ever fail, and reporting that failure as
    // "invalid JSON" sent people looking for a corrupt row that does not exist.
    // Name what actually happened instead.
    if (oversize) {
      // `draft.length` rather than a Blob: this runs on every keystroke, and
      // allocating a Blob to measure a string is the expensive way to ask.
      const loaded = draft.length
      return {
        ok: false,
        truncated: true,
        error: loaded
          ? `Showing the first ${formatBytes(loaded)} of ${formatBytes(oversize.bytes)}. The page fetched a preview of this column instead of the value - that is what keeps a table of half-megabyte cells openable at all.`
          : `This cell holds ${formatBytes(oversize.bytes)}. The page fetched its size, not its contents: reading a column like this for every row on screen is what makes a table take ten seconds to open. It is one click away.`,
      }
    }
    // Loaded, but the server stopped at the ceiling: the text really is cut, so
    // parsing it can only fail. Say which it is.
    if (truncatedLoad) {
      return {
        ok: false,
        truncated: true,
        error: `Loaded ${formatBytes(draft.length)}, which is as much of this value as this view holds. The rest is not shown, so it cannot be parsed or edited here - read it with a query if you need all of it.`,
      }
    }
    if (heavy && !forceParse) {
      return {
        ok: false,
        heavy: true,
        error: `${formatBytes(draft.length)} of JSON. Building a tree from it means parsing the whole thing, which takes long enough to be felt - so it waits until you ask.`,
      }
    }
    try { return { ok: true, value: JSON.parse(t) } } catch (e) { return { ok: false, error: String(e) } }
  })

  let loadingFull = $state(false)
  async function loadFull() {
    if (!onloadfull || loadingFull) return
    loadingFull = true
    try {
      await onloadfull()
    } catch (e) {
      toast.error('Could not load the value', { description: String(e?.message ?? e) })
    } finally {
      loadingFull = false
    }
  }

  /** @param {number} n */
  function formatBytes(n) {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`
    return `${(n / 1024 / 1024).toFixed(1)} MB`
  }
  const isTreeable = $derived(!!parsed?.ok)
  // A heavy value has no tree until it is asked for, so the raw text is the
  // thing to show - and the pane it lives in is the one that was hidden.
  $effect(() => { if (heavy && !forceParse) rawOpen = true })

  /**
   * Whether the raw text sits beside the tree.
   *
   * A JSON cell opens as the tree alone, because that is what you came to do -
   * read the shape of it. The raw pane is one click away and is where editing
   * happens. Plain text has no tree, so it is always the raw pane and this
   * never applies.
   *
   * Latched on `isTreeable` rather than set from the seed effect: the dock
   * follows the cell cursor, and re-deciding this on every move would override
   * a choice made two rows ago. It flips only when the cursor crosses between a
   * structured value and a flat one, which is when the old choice stops
   * meaning anything.
   */
  let rawOpen = $state(false)
  let _lastTreeable = /** @type {boolean | null} */ (null)
  $effect(() => {
    const t = isTreeable
    if (t === _lastTreeable) return
    _lastTreeable = t
    rawOpen = !t
  })

  // ── Find, inside the value ────────────────────────────────────────────────
  //
  // A tree is the one shape you cannot scan: what you are looking for is behind
  // a chevron three levels down. Typing here opens exactly the branches that
  // lead to a hit and leaves the rest closed, and highlights the run that
  // matched. The raw pane marks its hits too - see the highlight layer in the
  // template. It used to only step the caret from match to match, on the
  // reasoning that a textarea cannot be highlighted: true of the element
  // itself, but the marks can be drawn behind it. Stepping alone meant typing a
  // query showed "1/1" over a value with nothing marked on it, and even after
  // pressing Enter the selection was invisible the moment focus went back to
  // the find box.
  let query = $state('')
  /** @type {HTMLInputElement | null} */
  let findEl = $state(null)
  let hit = $state(0)

  const treeSearch = $derived(
    isTreeable && query ? searchJson(parsed?.value, query) : null,
  )
  // Searching a value this size means walking it per keystroke, twice (offsets,
  // then highlight runs). The find box still works on everything under the line.
  const rawHits = $derived(query && !heavy ? matchOffsets(draft, query) : [])
  /** @type {HTMLElement | null} */
  let hlEl = $state(null)
  /**
   * The raw value split into plain and matched runs, each hit carrying its index
   * so the one the caret is on can be brighter than the others. Null when there
   * is nothing to mark, which is what keeps the layer out of the DOM entirely
   * for the overwhelmingly common case of no query.
   */
  const rawRuns = $derived.by(() => {
    if (!query || heavy || !rawHits.length) return null
    let n = -1
    return splitHighlight(draft, query).map((run) => ({
      t: run.t,
      hit: run.hit ? ++n : -1,
    }))
  })
  /** What the counter says: tree rows while the tree is what you are reading. */
  const hitCount = $derived(rawOpen && !isTreeable ? rawHits.length : (treeSearch?.count ?? rawHits.length))

  // A query that no longer matches anything should not leave the step index
  // pointing past the end of the list.
  $effect(() => {
    const n = rawHits.length
    if (hit >= n) hit = n ? n - 1 : 0
  })

  /** Select the nth match in the raw pane and scroll it into view. */
  function stepRaw(/** @type {number} */ dir) {
    if (!rawHits.length || !area) return
    hit = (hit + dir + rawHits.length) % rawHits.length
    const at = rawHits[hit]
    if (!rawOpen) rawOpen = true
    area.focus()
    area.setSelectionRange(at, at + query.length)
    // `blur`/`focus` is what makes a textarea scroll to the selection in WebKit.
    const before = area.scrollTop
    area.blur()
    area.focus()
    if (area.scrollTop === before) area.scrollTop = before
  }

  /**
   * Put the stored value back.
   *
   * Written through the textarea rather than by assigning `draft`, for the same
   * reason the Tab handler below does: a state write changes the value without an
   * `input` event, so the shared undo stack never records the step and the revert
   * would be the one edit ⌘Z could not bring back. Reverting is a big change to
   * make with one keystroke - it should be as undoable as any other.
   */
  function revert() {
    if (readOnly || !dirty) return
    // The tree pane has no textarea to write through; nothing to keep undoable
    // there either, since the tree is not what you edited it with.
    if (!rawOpen || !area) {
      draft = original
      return
    }
    area.focus()
    area.setSelectionRange(0, area.value.length)
    const ok = document.execCommand?.('insertText', false, original)
    if (!ok) {
      area.setRangeText(original, 0, area.value.length, 'end')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  function clearFind() {
    query = ''
    hit = 0
  }

  // `split` allocates an array the size of the line count; on a one-line 18MB
  // value that is cheap, on a large multi-line one it is not, and the number is
  // chrome either way.
  const lines = $derived.by(() => {
    if (!draft) return 0
    if (heavy) return 0
    return draft.split('\n').length
  })
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
  // Wrapping is what a multi-megabyte value cannot afford: one 18MB line laid
  // out across the pane's width is the most expensive thing this panel can be
  // asked to do. It comes back the moment the value is small again, and the
  // toggle still works if you want it.
  $effect(() => { if (heavy) wrap = false })

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
    // The highlight layer has to track both axes: with wrapping off the textarea
    // scrolls sideways, and a mark that does not follow it lands on the wrong
    // characters rather than merely looking untidy.
    if (hlEl && area) {
      hlEl.scrollTop = area.scrollTop
      hlEl.scrollLeft = area.scrollLeft
    }
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
  function onFindKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      // First Escape gives up the search, second closes the dock - the same
      // order a browser's find bar uses.
      if (query) { clearFind(); return }
      open = false
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      if (rawHits.length) stepRaw(e.shiftKey ? -1 : 1)
      return
    }
  }

  /**
   * Escape, from anywhere in the dock.
   *
   * It used to live on the textarea alone, which was fine while the textarea
   * was the only thing in here and always had focus. It is not: a JSON cell
   * opens on the tree with the textarea hidden, `focus()` on a hidden element
   * does nothing, and a click on a tree row or a bar button leaves focus on
   * something with no handler - so Escape went nowhere. On the root it catches
   * the key whichever child it bubbled from.
   *
   * @param {KeyboardEvent} e
   */
  function onRootKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      open = false
      return
    }
    // ⌘F / Ctrl+F puts the caret in the find field, as it does everywhere else.
    if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault()
      e.stopPropagation()
      findEl?.focus()
      findEl?.select()
      return
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
    // Alt+Z toggles wrap, as it does in VS Code and every editor that copied it.
    if (e.altKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault()
      wrap = !wrap
      return
    }
    // Alt+R reverts. In the same Alt+letter family as the wrap toggle, and
    // `preventDefault` is what stops macOS inserting ® instead - the same reason
    // Alt+Z above does not leave an Ω behind.
    if (e.altKey && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault()
      revert()
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
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- `tabindex=-1` so the panel itself can hold focus when the raw textarea is
     hidden, which is what gives Escape somewhere to land. -->
<div
  bind:this={root}
  tabindex="-1"
  role="group"
  aria-label="{colName} value"
  class="flex h-full min-h-0 w-full flex-col bg-background outline-none"
  onkeydown={onRootKey}
>

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
      <span class="shrink-0 font-mono text-ui-3xs text-muted-foreground">
        {detached ? 'inside a row · read-only' : 'read-only'}
      </span>
    {/if}
    <span class="shrink-0 font-mono text-ui-3xs tabular-nums text-muted-foreground">
      {lines.toLocaleString()}L · {chars.toLocaleString()}c
    </span>
    {#if oversize}
      <span
        class="shrink-0 rounded-[3px] border border-warning/30 bg-warning/10 px-1.5 py-px font-mono text-ui-3xs text-warning"
        title="A wide column reports its size per row instead of its contents - the value is not loaded and cannot be edited until it is"
      >{formatBytes(oversize.bytes)} · not loaded</span>
      {#if onloadfull}
        <button
          type="button"
          disabled={loadingFull}
          title="Load this value ({formatBytes(oversize.bytes)})"
          aria-label="Load this value"
          class="inline-flex h-6 shrink-0 items-center gap-1 rounded-md bg-primary/15 px-2 font-mono text-ui-3xs font-medium text-primary transition-colors hover:bg-primary/25 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onclick={() => void loadFull()}
        >
          {#if loadingFull}
            <span class="size-3 shrink-0 animate-spin rounded-full border border-current border-t-transparent"></span>
            Loading
          {:else}
            <Download class="size-3 shrink-0" />
            Load
          {/if}
        </button>
      {/if}
    {/if}
    {#if dirty && !readOnly}
      <span class="shrink-0 text-ui-3xs text-primary">edited</span>
    {/if}

    <div class="ml-auto flex shrink-0 items-center gap-1.5">
      <!-- Find. Always here rather than behind a toggle: the dock exists to
           read one value, and finding something in it is the second thing you
           do after opening it. -->
      <!-- The frame every field in this app wears: `--field-border-width` (2px)
           in `--field-border`. At `border/50` this one was a hairline against
           the dock's own surface and read as a gap between the icon and the
           text rather than as a control. The input inside opts out with
           `no-focus-ring`, which is exactly the case app.css documents: the
           container carries the frame. -->
      <div
        class="flex h-7 items-center gap-1 bg-input/30 px-1.5 focus-within:border-ring/60"
        style="border-radius: var(--radius-field); border: var(--field-border-width) solid var(--field-border)"
      >
        <Search class="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          bind:this={findEl}
          bind:value={query}
          type="text"
          aria-label="Find in this value"
          placeholder="Find"
          spellcheck="false"
          class="no-focus-ring h-6 w-24 min-w-0 bg-transparent font-mono text-ui-2xs text-foreground outline-none placeholder:text-muted-foreground"
          onkeydown={onFindKey}
        />
        {#if query}
          <span class="shrink-0 font-mono text-ui-3xs tabular-nums text-muted-foreground">
            {hitCount ? (rawOpen && rawHits.length ? `${hit + 1}/${rawHits.length}` : hitCount) : 'none'}{treeSearch?.truncated ? '+' : ''}
          </span>
          <button
            type="button"
            class="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            onclick={clearFind}
            aria-label="Clear the search"
          >
            <X class="size-3" />
          </button>
        {/if}
      </div>
      {#if isTreeable}
        <!-- The tree is the default for a structured value and the raw text is
             one click away, which is the other way round from how this started:
             the pane beside the editor was a `<pre>` of the very same
             pretty-printed JSON, so the dock showed one value twice. -->
        <button
          type="button"
          aria-pressed={rawOpen}
          class={cn(
            'inline-flex h-7 items-center gap-1.5 rounded px-2 font-mono text-ui-2xs transition-colors hover:bg-muted/40 hover:text-foreground',
            rawOpen ? 'bg-muted/40 text-foreground' : 'text-muted-foreground',
          )}
          onclick={() => (rawOpen = !rawOpen)}
          title={rawOpen ? 'Hide the raw text' : 'Show the raw text, which is where editing happens'}
        >
          <Braces class="size-3.5 shrink-0" />
          Raw
        </button>
      {/if}
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
      <!-- Icon only, like the wrap toggle beside it. The word "Copy" next to a
           copy glyph is the label saying what the picture already says, and this
           row has to fit a find box, three actions and a close button. -->
      <button
        type="button"
        class="inline-flex h-7 items-center rounded px-2 font-mono text-ui-2xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        onclick={copy}
        title="Copy the value as text"
        aria-label="Copy the value as text"
      >
        <Copy class="size-3.5 shrink-0" />
      </button>
      {#if !readOnly}
        <button
          type="button"
          class="inline-flex h-7 items-center rounded px-2 font-mono text-ui-2xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          disabled={!dirty}
          onclick={revert}
          title="Revert to the stored value (Alt+R)"
          aria-label="Revert to the stored value"
        >
          <Undo2 class="size-3.5 shrink-0" />
        </button>
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
  <!-- `relative`: the raw pane's highlight layer is absolutely positioned inside
       this box, beside the gutter rather than under it. -->
  <div class="relative flex min-h-0 flex-1">
    <!-- Line numbers, on the same 20px baseline grid as the text. Padded top by
         the same 8px the textarea is, so line 1 lines up with line 1. -->
    {#if !wrap && rawOpen}
      <div
        bind:this={gutterEl}
        aria-hidden="true"
        class="shrink-0 select-none overflow-hidden border-r border-border/30 bg-muted/10 py-2 text-right font-mono text-ui-3xs tabular-nums text-muted-foreground/45"
        style="width:{gutterW}px; line-height:{LINE_H}px"
      >
        {#each lineNumbers as n (n)}<div class="px-2">{n}</div>{/each}
      </div>
    {/if}
    <!-- Find highlights for the raw pane.
         A textarea cannot mark a range inside itself, so the marks are drawn on
         a layer *behind* it: same font, same padding, same 20px leading, same
         wrap mode, scrolled in lockstep by `syncGutter`, and the textarea's
         background is already transparent - so each glyph sits directly on top
         of its own highlight. `text-transparent` here because the visible text
         is the textarea's; this layer contributes nothing but the marks.
         Only mounted while something matches, which is almost never. -->
    {#if rawOpen && rawRuns}
      <div
        bind:this={hlEl}
        aria-hidden="true"
        class={cn(
          'pointer-events-none absolute inset-y-0 right-0 z-0 overflow-hidden py-2 pr-3 pl-3',
          'font-mono text-ui-2xs text-transparent select-none',
          wrap ? 'whitespace-pre-wrap [overflow-wrap:anywhere]' : 'whitespace-pre',
        )}
        style="left:{!wrap && rawOpen ? gutterW : 0}px; line-height:{LINE_H}px; tab-size:2"
      >{#each rawRuns as run, i (i)}{#if run.hit >= 0}<mark
              class={cn(
                'rounded-[2px] px-0 text-transparent',
                run.hit === hit ? 'bg-warning/60' : 'bg-warning/35',
              )}>{run.t}</mark>{:else}{run.t}{/if}{/each}</div>
    {/if}
    <!-- `hidden`, not unmounted: the textarea holds the draft, the undo history
         and the caret. Tearing it down to show the tree would discard all three
         and re-seed the value on the way back. -->
    <textarea
      class:hidden={!rawOpen}
      bind:this={area}
      bind:value={draft}
      readonly={readOnly}
      spellcheck="false"
      wrap={wrap ? 'soft' : 'off'}
      onkeydown={onKey}
      onscroll={syncGutter}
      aria-label="{colName} value"
      class={cn(
        // `relative z-10`: an absolutely-positioned sibling paints above a static
        // one whatever the DOM order, so without this the highlight layer covers
        // the text it is meant to sit behind.
        'no-field-frame app-scroll relative z-10 min-h-0 flex-1 resize-none bg-transparent py-2 pl-3 pr-3',
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
      <!-- A tree, not a second copy of the text. This is also what a JSON cell
           opens into now: it used to open a modal that instantiated Monaco -
           a ~4MB chunk, its workers and a full editor - to display a 300-byte
           object, which is the whole of the lag. `JsonTree` mounts only the
           nodes that are expanded and pages long arrays, so a click costs
           nothing and there is no dialog over the rows the value came from. -->
      <div
        class={cn(
          'flex min-h-0 flex-col',
          rawOpen ? 'w-1/2 shrink-0 border-l border-border/40' : 'flex-1',
        )}
      >
        <div class="flex h-7 shrink-0 items-center gap-1.5 border-b border-border/30 px-2.5">
          <span class="text-ui-3xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {parsed.ok ? 'Tree' : 'Preview'}
          </span>
          {#if parsed.truncated}
            <span class="truncate font-mono text-ui-3xs text-warning">truncated value</span>
          {:else if !parsed.ok}
            <span class="truncate font-mono text-ui-3xs text-destructive">invalid JSON</span>
          {/if}
        </div>
        <div class="app-scroll min-h-0 flex-1 overflow-auto px-2 py-1.5">
          {#if parsed.ok && query && !treeSearch?.count}
            <p class="px-1 py-1 font-mono text-ui-3xs text-muted-foreground">
              No match for <span class="text-foreground/80">{query}</span> in this value.
            </p>
          {:else if parsed.ok}
            <JsonTree
              value={parsed.value}
              defaultDepth={2}
              {query}
              matchPaths={treeSearch?.paths ?? null}
              openPaths={treeSearch?.open ?? null}
              oncopy={(v) => {
                const text = typeof v === 'string' ? v : JSON.stringify(v, null, 2)
                void navigator.clipboard?.writeText(text)
                toast.success('Copied')
              }}
            />
          {:else}
            <p class={cn('whitespace-pre-wrap font-mono text-ui-3xs leading-relaxed', parsed.truncated ? 'text-muted-foreground' : 'text-destructive/90')}>{parsed.error}</p>
            {#if parsed.heavy}
              <button
                type="button"
                class="mt-2.5 inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 font-mono text-ui-3xs font-medium text-primary-foreground transition-[opacity,transform] hover:opacity-90 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onclick={() => (forceParse = true)}
              >
                Render it anyway
              </button>
              <p class="mt-1.5 font-mono text-ui-3xs text-muted-foreground/70">
                The raw text is already here, and Find works on it under 2 MB.
              </p>
            {/if}
            {#if parsed.truncated && onloadfull}
              <button
                type="button"
                disabled={loadingFull}
                class="mt-2.5 inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 font-mono text-ui-3xs font-medium text-primary-foreground transition-[opacity,transform] hover:opacity-90 active:scale-[0.97] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onclick={() => void loadFull()}
              >
                {#if loadingFull}
                  <span class="size-3 shrink-0 animate-spin rounded-full border border-current border-t-transparent"></span>
                  Loading {formatBytes(oversize?.bytes ?? 0)}…
                {:else}
                  Load {formatBytes(oversize?.bytes ?? 0)}
                {/if}
              </button>
              <p class="mt-1.5 font-mono text-ui-3xs text-muted-foreground/70">
                Fetched for this row only - the page stays light.
              </p>
            {/if}
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
