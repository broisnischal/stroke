<script>
  import { Handle, Position } from '@xyflow/svelte'
  import Table2 from '@lucide/svelte/icons/table-2'

  let { data = {} } = $props()

  const NODE_W = 230
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
  class="erd-card flex flex-col overflow-visible rounded-lg border shadow-lg transition-all duration-100
    {data.selected
      ? 'border-primary/70 shadow-primary/10 ring-1 ring-primary/25'
      : !data.highlighted
        ? 'border-border/10 opacity-20'
        : 'border-border/40 hover:border-border/70 hover:shadow-xl'}"
  style="width:{NODE_W}px; cursor:pointer; background:hsl(var(--card))"
  role="button"
  onclick={() => data.onSelect?.(data.name)}
  ondblclick={() => data.onOpen?.(data.name)}
  onkeydown={(e) => { if (e.key === 'Enter') data.onOpen?.(data.name) }}
>
  <!--
    Target handle — invisible 1×1 px anchor at the vertical center of the left edge.
    Uses !important to beat XYFlow's base CSS `min-width/min-height: 5px` rule.
  -->
  <Handle
    type="target"
    position={Position.Left}
    id="tgt"
    style="position:absolute; left:0; top:50%; transform:translateY(-50%);
           width:1px!important; height:1px!important;
           min-width:0!important; min-height:0!important;
           background:transparent!important; border:none!important;
           box-shadow:none!important; border-radius:0!important; opacity:0"
  />

  <!-- Header -->
  <div
    class="flex items-center gap-2 border-b px-3 py-2"
    style="background:hsl(var(--muted)/0.45); border-color:hsl(var(--border)/0.5)"
  >
    <span
      class="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold tracking-tight"
      style="color:hsl(var(--foreground))"
    >{data.name}</span>
    <Table2 class="size-3.5 shrink-0" style="color:hsl(var(--muted-foreground)/0.3)" />
  </div>

  <!-- Column rows -->
  <div class="flex flex-col divide-y" style="divide-color:hsl(var(--border)/0.1)">
    {#each (data.columns ?? []) as col (col.name)}
      {@const isPk = data.pkCols?.has(col.name)}
      {@const isFk = !!col.foreignKey}
      <div class="relative flex items-center gap-1 px-3 py-[4px]">
        <!--
          Source handle — invisible 1×1 px anchor at vertical center of THIS column row.
          Placed inside the row div so getBoundingClientRect() returns the row's y.
        -->
        {#if isFk}
          <Handle
            type="source"
            position={Position.Right}
            id="src-{col.name}"
            style="position:absolute; right:0; top:50%; transform:translateY(-50%);
                   width:1px!important; height:1px!important;
                   min-width:0!important; min-height:0!important;
                   background:transparent!important; border:none!important;
                   box-shadow:none!important; border-radius:0!important; opacity:0"
          />
        {/if}

        <!-- Column name -->
        <span
          class="min-w-0 flex-1 truncate font-mono text-[10px] leading-[1.45]"
          style="color:{isPk
            ? 'hsl(var(--foreground)/0.9)'
            : isFk
              ? 'hsl(var(--foreground)/0.72)'
              : 'hsl(var(--muted-foreground)/0.75)'}"
        >{col.name}</span>

        <!-- Data type — always right-aligned, clipped when long -->
        <span
          class="ml-1 max-w-[80px] shrink-0 truncate font-mono text-[9px] leading-[1.45] text-right"
          style="color:hsl(var(--muted-foreground)/0.38)"
        >{col.dataType}</span>

        <!-- PK / FK badge -->
        {#if isPk}
          <span
            class="ml-1 shrink-0 rounded px-[5px] py-[1px] font-mono text-[7.5px] font-bold uppercase tracking-wide"
            style="background:hsl(38 92% 50% / 0.18); color:hsl(38 92% 65%); letter-spacing:0.04em"
          >pk</span>
        {:else if isFk}
          <span
            class="ml-1 shrink-0 rounded px-[5px] py-[1px] font-mono text-[7.5px] font-semibold uppercase tracking-wide"
            style="background:hsl(217 91% 60% / 0.14); color:hsl(217 91% 67% / 0.8); letter-spacing:0.04em"
          >fk</span>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  /* Remove all XYFlow default node chrome */
  :global(.svelte-flow__node-tableNode) {
    background: transparent !important;
    border: none !important;
    padding: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }
  :global(.svelte-flow__node-tableNode.selected) {
    box-shadow: none !important;
    outline: none !important;
  }
  /* Nuke ALL handle visuals — !important here works because these are stylesheet rules */
  :global(.svelte-flow__node-tableNode .svelte-flow__handle) {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    outline: none !important;
    opacity: 0 !important;
    min-width: 0 !important;
    min-height: 0 !important;
  }
  :global(.svelte-flow__node-tableNode .svelte-flow__handle:hover),
  :global(.svelte-flow__node-tableNode .svelte-flow__handle.connectingfrom),
  :global(.svelte-flow__node-tableNode .svelte-flow__handle.valid) {
    background: transparent !important;
    border: none !important;
  }
</style>
