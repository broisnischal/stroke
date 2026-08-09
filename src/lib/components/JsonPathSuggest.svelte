<script>
  // The JSONPath suggestion list, shared by every JSON viewer.
  //
  // There were three of these. The JSON tab had a good one — a colour dot per
  // kind, the typed fragment highlighted, the type and a value preview. The SQL
  // and table views had a much poorer one that called `getCompletions`, which
  // throws away `kind`, `detail` and `preview`, and then rebuilt a worse version
  // from the insert string alone: every row printed the same identifier twice
  // and emphasised none of it. This is the good one, made shared, so a fix to
  // the widget is a fix everywhere rather than in whichever copy was noticed.
  import { cn } from '$lib/utils.js'
  import { splitPath } from '$lib/jsonpath.js'

  let {
    /** @type {import('$lib/jsonpath.js').CompletionItem[]} */
    items = [],
    /** The path as typed, for highlighting the fragment being completed. */
    query = '',
    /** Index of the armed row. Bindable so the parent's keyboard handler drives it. */
    activeIdx = $bindable(-1),
    /** @type {(insert: string) => void} */
    onpick = () => {},
  } = $props()

  /** @type {HTMLElement | null} */
  let listEl = $state(null)

  /** What has been typed since the last separator. */
  const token = $derived(splitPath(query).token.replace(/^[.[]/, '').toLowerCase())

  /**
   * Split a label around the typed fragment. Matches anywhere, not just at the
   * start: filtering already accepts an infix match, so highlighting only
   * prefixes left the reason a row was offered invisible.
   * @param {string} label
   */
  function parts(label) {
    if (!token) return { head: label, hit: '', tail: '' }
    const at = label.toLowerCase().indexOf(token)
    if (at === -1) return { head: label, hit: '', tail: '' }
    return { head: label.slice(0, at), hit: label.slice(at, at + token.length), tail: label.slice(at + token.length) }
  }

  /** @param {string} kind */
  function kindMeta(kind) {
    switch (kind) {
      case 'object':   return { dot: 'bg-blue-400',   label: 'obj' }
      case 'array':    return { dot: 'bg-amber-400',  label: 'arr' }
      case 'string':   return { dot: 'bg-green-400',  label: 'str' }
      case 'number':   return { dot: 'bg-yellow-400', label: 'num' }
      case 'boolean':  return { dot: 'bg-purple-400', label: 'bool' }
      case 'null':     return { dot: 'bg-slate-400',  label: 'null' }
      case 'wildcard': return { dot: 'bg-cyan-400',   label: 'all' }
      case 'index':    return { dot: 'bg-indigo-400', label: 'idx' }
      case 'filter':   return { dot: 'bg-rose-400',   label: 'fn' }
      case 'slice':    return { dot: 'bg-teal-400',   label: 'slc' }
      default:         return { dot: 'bg-muted-foreground/40', label: '·' }
    }
  }

  // Keep the armed row in view once the list outgrows its box.
  $effect(() => {
    if (activeIdx < 0 || !listEl) return
    const row = listEl.querySelector(`[data-idx="${activeIdx}"]`)
    if (row instanceof HTMLElement) row.scrollIntoView({ block: 'nearest' })
  })
</script>

<!-- The mousedown handler is not an interaction, it is the opposite of one:
     pressing inside the panel would blur the path input and close the list
     before the click could land, so the default is swallowed. The interactive
     elements are the option buttons inside; this wrapper is scaffolding. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="absolute left-0 top-full z-50 mt-1 w-[min(32rem,calc(100vw-3rem))] overflow-hidden rounded-lg border border-border/70 bg-popover elevate-2-rim"
  onmousedown={(e) => e.preventDefault()}
>
  <ul bind:this={listEl} class="max-h-64 overflow-y-auto p-1" role="listbox" aria-label="Path suggestions">
    {#each items as item, i (item.insert)}
      {@const on = i === activeIdx}
      {@const p = parts(item.label)}
      {@const meta = kindMeta(item.kind)}
      <li>
        <button
          type="button"
          data-idx={i}
          role="option"
          aria-selected={on}
          class={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
            on ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
          )}
          onmousemove={() => (activeIdx = i)}
          onclick={() => onpick(item.insert)}
        >
          <span class={cn('size-1.5 shrink-0 rounded-full', meta.dot)}></span>

          <span class="min-w-0 flex-1 truncate font-mono text-ui-xs">
            {p.head}<span class="font-semibold text-primary">{p.hit}</span>{p.tail}
          </span>

          {#if item.detail}
            <span class="shrink-0 font-mono text-ui-3xs text-muted-foreground/40">{item.detail}</span>
          {/if}
          <!-- The preview is what lets you pick by what is in the data rather
               than by name, so it shows on the armed row where it is being read. -->
          {#if on && item.preview}
            <span class="max-w-40 shrink-0 truncate font-mono text-ui-3xs text-muted-foreground/35">{item.preview}</span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>

  <!-- A list that simply appears teaches none of its keys. -->
  <div class="flex items-center gap-3 border-t border-border/50 bg-muted/20 px-2.5 py-1 font-mono text-ui-3xs text-muted-foreground/45">
    {#snippet key(/** @type {string} */ k)}
      <span class="rounded border border-border/60 bg-background/60 px-1 py-px text-muted-foreground/60">{k}</span>
    {/snippet}
    <span class="flex items-center gap-1">{@render key('↑')}{@render key('↓')} move</span>
    <span class="flex items-center gap-1">{@render key('↵')}{@render key('tab')} accept</span>
    <span class="flex items-center gap-1">{@render key('esc')} dismiss</span>
    <span class="ml-auto tabular-nums">{items.length}</span>
  </div>
</div>
