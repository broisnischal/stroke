<script>
  // Dedicated editor for SQL array cells (Postgres text[]/int[]/… , ClickHouse
  // Array(...)). Prisma-Studio-style add / remove / reorder / insert, instead of
  // treating the array as raw JSON. Emits the edited JS array back to the parent,
  // which serializes it to a Postgres array literal for the write.
  import { tick } from 'svelte'
  import Plus from '@lucide/svelte/icons/plus'
  import X from '@lucide/svelte/icons/x'
  import GripVertical from '@lucide/svelte/icons/grip-vertical'
  import CircleSlash from '@lucide/svelte/icons/circle-slash'
  import Brackets from '@lucide/svelte/icons/brackets'
  import { cn } from '$lib/utils.js'

  let {
    open = $bindable(false),
    /** Column name shown in the header. */
    column = '',
    /** Element type label, e.g. "text", "int4" (from the column type minus []). */
    elementType = '',
    /** Initial elements (array of primitives / null). */
    value = /** @type {any[]} */ ([]),
    /** Called with the new array on save. */
    onsave = /** @type {(next: any[]) => void} */ (() => {}),
  } = $props()

  // Local working copy — each row is { v: string|null }. Strings map to array
  // elements; `null` is a genuine SQL NULL element.
  let items = $state(/** @type {{ v: string | null }[]} */ ([]))
  /** @type {HTMLInputElement[]} */
  let inputEls = []

  // Seed the working copy whenever the editor opens for a new cell.
  $effect(() => {
    if (open) {
      items = (Array.isArray(value) ? value : []).map((el) => ({
        v: el === null || el === undefined ? null : String(el),
      }))
      inputEls.length = items.length
    }
  })

  async function addItem() {
    items = [...items, { v: '' }]
    await tick()
    inputEls[items.length - 1]?.focus()
  }
  function removeAt(i) {
    items = items.filter((_, j) => j !== i)
    // Index-keyed binds shift down; drop the now-stale ref at the old tail so a
    // later addItem() focuses the right (freshly rebound) input.
    inputEls.length = items.length
  }

  // ── Drag to reorder ──────────────────────────────────────────────────────────
  let dragIndex = $state(/** @type {number | null} */ (null))
  let overIndex = $state(/** @type {number | null} */ (null))
  function onDragStart(i, e) {
    dragIndex = i
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)) }
  }
  function onDragOver(i, e) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    overIndex = i
  }
  function onDrop(i) {
    if (dragIndex === null || dragIndex === i) { dragIndex = null; overIndex = null; return }
    const next = items.slice()
    const [moved] = next.splice(dragIndex, 1)
    next.splice(i, 0, moved)
    items = next
    dragIndex = null
    overIndex = null
  }
  function onDragEnd() { dragIndex = null; overIndex = null }
  function toggleNull(i) {
    items = items.map((it, j) => (j === i ? { v: it.v === null ? '' : null } : it))
  }
  function clearAll() {
    items = []
    inputEls.length = 0
  }

  function save() {
    onsave(items.map((it) => (it.v === null ? null : it.v)))
    open = false
  }
  function cancel() {
    open = false
  }
</script>

{#if open}
  <!-- Centered modal overlay; Escape/backdrop cancels. -->
  <div
    class="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-6 data-open:animate-in data-open:fade-in-0"
    data-open
    role="button"
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) cancel() }}
    onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); cancel() } }}
  >
    <div class="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-[10px] border border-border/50 bg-background shadow-2xl shadow-black/40">
      <!-- Header -->
      <div class="flex items-center gap-3 border-b border-border/15 px-4 py-3.5">
        <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Brackets class="size-4" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-ui-sm font-semibold tracking-tight text-foreground antialiased">{column}</p>
          <p class="truncate text-ui-2xs leading-relaxed text-muted-foreground/70">
            <span class="font-mono">{elementType || 'array'}[]</span>
            <span class="text-muted-foreground/40">·</span>
            <span class="tabular-nums">{items.length}</span> {items.length === 1 ? 'element' : 'elements'}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/50 transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted/50 hover:text-foreground active:scale-[0.94]"
          onclick={cancel}
        >
          <X class="size-4" />
        </button>
      </div>

      <!-- Elements -->
      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        {#if items.length === 0}
          <div class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/50 px-4 py-8 text-center">
            <p class="text-ui-xs text-muted-foreground/60">Empty array <span class="font-mono">{'{}'}</span></p>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-2.5 py-1 text-ui-2xs font-medium text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted/40 hover:text-foreground active:scale-[0.96]"
              onclick={addItem}
            >
              <Plus class="size-3.5" /> Add element
            </button>
          </div>
        {:else}
          <div class="flex flex-col">
            {#each items as item, i (i)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class={cn(
                  'group relative flex items-center gap-2 rounded-lg px-1 py-1 transition-[opacity,background-color] duration-150',
                  dragIndex === i && 'opacity-40',
                  overIndex === i && dragIndex !== i && 'bg-primary/5',
                )}
                ondragover={(e) => onDragOver(i, e)}
                ondrop={() => onDrop(i)}
              >
                <!-- Drop indicator line above the hovered row -->
                {#if overIndex === i && dragIndex !== null && dragIndex !== i}
                  <span class="pointer-events-none absolute inset-x-2 -top-px h-0.5 rounded-full bg-primary"></span>
                {/if}
                <!-- Drag handle -->
                <button
                  type="button"
                  aria-label="Drag to reorder"
                  draggable="true"
                  ondragstart={(e) => onDragStart(i, e)}
                  ondragend={onDragEnd}
                  class="flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/30 transition-colors hover:text-muted-foreground/70 active:cursor-grabbing"
                >
                  <GripVertical class="size-3.5" />
                </button>
                <span class="w-5 shrink-0 text-right font-mono text-ui-2xs tabular-nums text-muted-foreground/35">{i}</span>
                {#if item.v === null}
                  <button
                    type="button"
                    class="flex h-8 flex-1 items-center rounded-md border border-border/40 bg-muted/15 px-2.5 text-ui-xs font-medium italic tracking-wide text-amber-500/80 transition-colors hover:bg-muted/25"
                    onclick={() => toggleNull(i)}
                    title="Click to enter a value"
                  >NULL</button>
                {:else}
                  <input
                    bind:this={inputEls[i]}
                    bind:value={item.v}
                    placeholder="value"
                    spellcheck="false"
                    autocomplete="off"
                    class="h-8 min-w-0 flex-1 rounded-md border border-border/40 bg-muted/15 px-2.5 font-mono text-ui-xs leading-none text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/30 hover:border-border/60 focus:border-ring focus:ring-1 focus:ring-ring focus:border-ring focus:ring-1 focus:ring-ring"
                    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                  />
                {/if}
                <div class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                  <button type="button" aria-label={item.v === null ? 'Clear NULL' : 'Set NULL'}
                    class={cn('inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-muted/50', item.v === null ? 'text-amber-500' : 'text-muted-foreground/60 hover:text-foreground')}
                    title={item.v === null ? 'Clear NULL' : 'Set NULL'}
                    onclick={() => toggleNull(i)}><CircleSlash class="size-3.5" /></button>
                  <button type="button" aria-label="Remove element"
                    class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/15 hover:text-destructive"
                    title="Remove"
                    onclick={() => removeAt(i)}><X class="size-3.5" /></button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex items-center gap-2 border-t border-border/15 px-3 py-2.5">
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/50 px-2.5 text-ui-xs font-medium text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted/40 hover:text-foreground active:scale-[0.96]"
          onclick={addItem}
        >
          <Plus class="size-3.5" /> Add
        </button>
        {#if items.length > 0}
          <button
            type="button"
            class="inline-flex h-8 items-center rounded-md px-2.5 text-ui-xs text-muted-foreground/50 transition-colors hover:text-destructive"
            onclick={clearAll}
          >Clear</button>
        {/if}
        <div class="ml-auto flex items-center gap-2">
          <button
            type="button"
            class="inline-flex h-8 items-center rounded-md border border-border/50 px-3 text-ui-xs text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted/40 hover:text-foreground active:scale-[0.96]"
            onclick={cancel}
          >Cancel</button>
          <button
            type="button"
            class="inline-flex h-8 items-center rounded-md bg-foreground px-4 text-ui-xs font-medium text-background shadow-sm transition-[background-color,transform] duration-150 ease-out hover:bg-foreground/85 active:scale-[0.96]"
            onclick={save}
          >Save</button>
        </div>
      </div>
    </div>
  </div>
{/if}
