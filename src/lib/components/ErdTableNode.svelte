<script>
  import { Handle, Position } from '@xyflow/svelte'
  import KeyRound from '@lucide/svelte/icons/key-round'
  import Link from '@lucide/svelte/icons/link'

  let { data = {} } = $props()

  const NODE_W = 220
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
  class="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-colors duration-150
    {data.selected
      ? 'border-primary/60 ring-1 ring-primary/20'
      : !data.highlighted
        ? 'border-border/20 opacity-35'
        : 'border-border/40 hover:border-primary/40'}"
  style="width:{NODE_W}px; cursor: pointer"
  role="button"
  onclick={() => data.onSelect?.(data.name)}
  ondblclick={() => data.onOpen?.(data.name)}
  onkeydown={(e) => { if (e.key === 'Enter') data.onOpen?.(data.name) }}
>
  <!-- Target handle — receives incoming FK arrows -->
  <Handle
    type="target"
    position={Position.Left}
    id="tgt"
    style="left:-5px; width:10px; height:10px; background:hsl(var(--primary)/0.7); border:2px solid hsl(var(--background)); border-radius:50%; top:18px; box-shadow:0 0 0 1.5px hsl(var(--primary)/0.4)"
  />

  <!-- Table header -->
  <div class="flex items-center gap-2 border-b border-border/30 bg-muted/20 px-3 py-2.5">
    <span class="min-w-0 flex-1 truncate font-mono text-[11px] font-bold tracking-tight text-foreground">{data.name}</span>
    <span class="shrink-0 rounded-md bg-muted/50 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground/60">{data.columns?.length ?? 0}</span>
  </div>

  <!-- Column rows -->
  <div class="flex flex-col">
    {#each (data.columns ?? []) as col (col.name)}
      {@const isPk = data.pkCols?.has(col.name)}
      {@const isFk = !!col.foreignKey}
      <div class="relative flex items-center gap-2 px-3 py-[4px]
        {isPk ? 'bg-amber-500/8 border-b border-amber-500/10' : isFk ? 'bg-blue-500/5 border-b border-blue-500/8' : 'border-b border-border/8'}">
        <!-- Source handle for FK columns -->
        {#if isFk}
          <Handle
            type="source"
            position={Position.Right}
            id="src-{col.name}"
            style="right:-5px; width:9px; height:9px; background:hsl(var(--primary)/0.65); border:2px solid hsl(var(--background)); border-radius:50%; top:50%; box-shadow:0 0 0 1.5px hsl(var(--primary)/0.35)"
          />
        {/if}

        <div class="flex size-3.5 shrink-0 items-center justify-center">
          {#if isPk}
            <KeyRound class="size-3 text-amber-400" />
          {:else if isFk}
            <Link class="size-3 text-blue-400/80" />
          {:else}
            <div class="size-1 rounded-full bg-muted-foreground/20"></div>
          {/if}
        </div>

        <span class="min-w-0 flex-1 truncate font-mono text-[10px] leading-snug
          {isPk ? 'font-semibold text-amber-300' : isFk ? 'text-blue-300/90' : 'text-foreground/65'}"
        >{col.name}</span>

        <span class="shrink-0 font-mono text-[9px] leading-snug text-muted-foreground/30">{col.dataType}</span>
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
