<script>
  import Self from './PaneLayout.svelte'
  import { cn } from '$lib/utils.js'

  /** @typedef {import('$lib/pane-layout.js').PaneNode} PaneNode */
  /** @typedef {import('$lib/pane-layout.js').GroupNode} GroupNode */
  /** @typedef {import('$lib/pane-layout.js').DropEdge} DropEdge */

  let {
    /** @type {PaneNode} */
    node,
    /** @type {string | null} */
    focusedGroupId = null,
    /** Whether a tab drag is currently in progress (shows drop targets). */
    dragActive = false,
    /** @type {import('svelte').Snippet<[GroupNode, boolean]>} */
    renderGroup,
    /** @type {(splitId: string, sizes: [number, number]) => void} */
    onresize = () => {},
    /** @type {(groupId: string, edge: DropEdge) => void} */
    ondropzone = () => {},
    /** @type {(groupId: string) => void} */
    onfocusgroup = () => {},
  } = $props()

  /** @type {HTMLElement | null} */
  let splitEl = $state(null)

  /** @type {DropEdge | null} */
  let hoverEdge = $state(null)

  /** @param {PointerEvent} e */
  function startResize(e) {
    if (!splitEl || node.type !== 'split') return
    e.preventDefault()
    const rect = splitEl.getBoundingClientRect()
    const horizontal = node.dir === 'row'
    const splitId = node.id
    /** @param {PointerEvent} ev */
    const move = (ev) => {
      const total = horizontal ? rect.width : rect.height
      if (total <= 0) return
      const pos = horizontal ? ev.clientX - rect.left : ev.clientY - rect.top
      let pct = (pos / total) * 100
      pct = Math.min(90, Math.max(10, pct))
      onresize(splitId, [pct, 100 - pct])
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** @param {DragEvent} e @param {string} groupId @param {DropEdge} edge */
  function onDrop(e, groupId, edge) {
    e.preventDefault()
    e.stopPropagation()
    hoverEdge = null
    ondropzone(groupId, edge)
  }

  /** @param {DragEvent} e */
  function allowDrop(e) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  }

  const zones = /** @type {{ edge: DropEdge, cls: string }[]} */ ([
    { edge: 'left', cls: 'left-0 top-0 h-full w-1/4' },
    { edge: 'right', cls: 'right-0 top-0 h-full w-1/4' },
    { edge: 'top', cls: 'left-1/4 top-0 h-1/3 w-1/2' },
    { edge: 'bottom', cls: 'bottom-0 left-1/4 h-1/3 w-1/2' },
    { edge: 'center', cls: 'left-1/4 top-1/3 h-1/3 w-1/2' },
  ])
</script>

{#if node.type === 'split'}
  <div
    bind:this={splitEl}
    class={cn('flex min-h-0 min-w-0 flex-1', node.dir === 'row' ? 'flex-row' : 'flex-col')}
  >
    <div class="flex min-h-0 min-w-0 flex-col" style="flex: 0 0 {node.sizes[0]}%">
      <Self
        node={node.children[0]}
        {focusedGroupId}
        {dragActive}
        {renderGroup}
        {onresize}
        {ondropzone}
        {onfocusgroup}
      />
    </div>

    <!-- Splitter -->
    <div
      class={cn(
        'group/split relative shrink-0 bg-border/40 transition-colors hover:bg-primary/40',
        node.dir === 'row' ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize',
      )}
      onpointerdown={startResize}
      role="separator"
      aria-orientation={node.dir === 'row' ? 'vertical' : 'horizontal'}
      tabindex="-1"
    >
      <!-- widened invisible hit area -->
      <div
        class={cn(
          'absolute',
          node.dir === 'row' ? '-left-1 -right-1 top-0 h-full' : '-top-1 -bottom-1 left-0 w-full',
        )}
      ></div>
    </div>

    <div class="flex min-h-0 min-w-0 flex-col" style="flex: 0 0 {node.sizes[1]}%">
      <Self
        node={node.children[1]}
        {focusedGroupId}
        {dragActive}
        {renderGroup}
        {onresize}
        {ondropzone}
        {onfocusgroup}
      />
    </div>
  </div>
{:else}
  {@const isFocused = node.id === focusedGroupId}
  <div
    class={cn(
      'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
      isFocused ? '' : 'opacity-[0.98]',
    )}
    role="group"
    onpointerdowncapture={() => onfocusgroup(node.id)}
  >
    {@render renderGroup(node, isFocused)}

    {#if dragActive}
      <div class="pointer-events-none absolute inset-0 z-40">
        {#each zones as z (z.edge)}
          <div
            class={cn(
              'pointer-events-auto absolute transition-colors',
              z.cls,
              hoverEdge === z.edge ? 'bg-primary/25 ring-1 ring-inset ring-primary/60' : '',
            )}
            role="button"
            tabindex="-1"
            aria-label="Drop to {z.edge === 'center' ? 'move here' : 'split ' + z.edge}"
            ondragover={allowDrop}
            ondragenter={() => (hoverEdge = z.edge)}
            ondragleave={() => { if (hoverEdge === z.edge) hoverEdge = null }}
            ondrop={(e) => onDrop(e, node.id, z.edge)}
          ></div>
        {/each}
      </div>
    {/if}
  </div>
{/if}
