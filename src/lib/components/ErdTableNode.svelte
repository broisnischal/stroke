<script>
  import { Handle, Position } from '@xyflow/svelte'
  import KeyRound from '@lucide/svelte/icons/key-round'
  import Link from '@lucide/svelte/icons/link'

  let { data = {} } = $props()

  const NODE_W = 220
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
  class="flex flex-col overflow-hidden rounded-[10px] border bg-card shadow-sm transition-all
    {data.selected
      ? 'border-primary shadow-md shadow-primary/20 ring-1 ring-primary/30'
      : !data.highlighted
        ? 'border-border/25 opacity-40'
        : 'border-border/50 hover:border-primary/50 hover:shadow-md'}"
  style="width:{NODE_W}px; cursor: pointer"
  role="button"
  onclick={() => data.onSelect?.(data.name)}
  ondblclick={() => data.onOpen?.(data.name)}
  onkeydown={(e) => { if (e.key === 'Enter') data.onOpen?.(data.name) }}
>
  <!-- Target handle — receives incoming FK arrows (on left edge) -->
  <Handle
    type="target"
    position={Position.Left}
    id="tgt"
    style="left:-5px; width:10px; height:10px; background:hsl(var(--primary)/0.5); border:2px solid hsl(var(--primary)/0.7); border-radius:50%; top:18px"
  />

  <!-- Table header -->
  <div class="flex items-center gap-2 border-b border-border/40 bg-muted/30 px-3 py-2">
    <span class="min-w-0 flex-1 truncate font-mono text-[11px] font-bold text-foreground/90">{data.name}</span>
    <span class="shrink-0 rounded bg-muted/60 px-1 font-mono text-[9px] text-muted-foreground/50">{data.columns?.length ?? 0}</span>
  </div>

  <!-- Column rows -->
  <div class="flex flex-col divide-y divide-border/10">
    {#each (data.columns ?? []) as col (col.name)}
      {@const isPk = data.pkCols?.has(col.name)}
      {@const isFk = !!col.foreignKey}
      <div class="relative flex items-center gap-1.5 px-2.5 py-[3px] {isPk ? 'bg-amber-500/6' : isFk ? 'bg-blue-500/4' : ''}">
        <!-- Source handle for FK columns (right edge) -->
        {#if isFk}
          <Handle
            type="source"
            position={Position.Right}
            id="src-{col.name}"
            style="right:-5px; width:8px; height:8px; background:hsl(var(--primary)/0.6); border:1.5px solid hsl(var(--primary)); border-radius:50%; top:50%"
          />
        {/if}

        <div class="flex size-3 shrink-0 items-center justify-center">
          {#if isPk}
            <KeyRound class="size-2.5 text-amber-400/90" />
          {:else if isFk}
            <Link class="size-2.5 text-blue-400/70" />
          {:else}
            <div class="size-[3px] rounded-full bg-muted-foreground/25"></div>
          {/if}
        </div>

        <span class="min-w-0 flex-1 truncate font-mono text-[10px] leading-snug
          {isPk ? 'font-semibold text-amber-300/90' : isFk ? 'text-blue-300/75' : 'text-foreground/60'}"
        >{col.name}</span>

        <span class="shrink-0 font-mono text-[9px] leading-snug text-muted-foreground/35">{col.dataType}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  /* Let our card styles fully override XYFlow default node box */
  :global(.svelte-flow__node-tableNode) {
    background: transparent !important;
    border: none !important;
    padding: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }
</style>
