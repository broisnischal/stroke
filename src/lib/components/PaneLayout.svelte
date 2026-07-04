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
    /** Current pointer-drag drop target (group + edge), or null. Drives the hint. */
    dropTarget = /** @type {{ groupId: string, edge: DropEdge } | null} */ (null),
    /** @type {import('svelte').Snippet<[GroupNode, boolean]>} */
    renderGroup,
    /** @type {(splitId: string, sizes: [number, number]) => void} */
    onresize = () => {},
    /** @type {(groupId: string) => void} */
    onfocusgroup = () => {},
  } = $props()

  /** @type {HTMLElement | null} */
  let splitEl = $state(null)

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

  /** Position/size of the drop-hint overlay for a given edge (translucent preview). */
  const HINT_CLASS = /** @type {Record<DropEdge, string>} */ ({
    left: 'left-0 top-0 h-full w-1/2',
    right: 'right-0 top-0 h-full w-1/2',
    top: 'left-0 top-0 w-full h-1/2',
    bottom: 'left-0 bottom-0 w-full h-1/2',
    center: 'inset-0',
  })
</script>

{#if node.type === 'split'}
  <div
    bind:this={splitEl}
    class={cn('flex min-h-0 min-w-0 flex-1', node.dir === 'row' ? 'flex-row' : 'flex-col')}
  >
    <div class="flex min-h-0 min-w-0 flex-col" style="flex: 0 0 {node.sizes[0]}%">
      <Self node={node.children[0]} {focusedGroupId} {dropTarget} {renderGroup} {onresize} {onfocusgroup} />
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
      <Self node={node.children[1]} {focusedGroupId} {dropTarget} {renderGroup} {onresize} {onfocusgroup} />
    </div>
  </div>
{:else}
  {@const isFocused = node.id === focusedGroupId}
  {@const hintEdge = dropTarget && dropTarget.groupId === node.id ? dropTarget.edge : null}
  <!-- data-pane-group lets the drag orchestrator hit-test which group + edge the
       pointer is over via elementFromPoint. -->
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    data-pane-group={node.id}
    role="group"
    onpointerdowncapture={() => onfocusgroup(node.id)}
  >
    {@render renderGroup(node, isFocused)}

    <!-- Drop hint: translucent preview of where the dragged tab will land. -->
    {#if hintEdge}
      <div class="pointer-events-none absolute inset-0 z-40">
        <div
          class={cn(
            'absolute rounded-md bg-primary/20 ring-2 ring-inset ring-primary/70 transition-all duration-75',
            HINT_CLASS[hintEdge],
          )}
        ></div>
      </div>
    {/if}
  </div>
{/if}
