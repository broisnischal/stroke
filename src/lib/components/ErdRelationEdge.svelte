<script>
  import { getBezierPath } from '@xyflow/svelte'

  let {
    id,
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    selected = false,
  } = $props()

  const pathResult = $derived(
    getBezierPath({
      sourceX, sourceY, sourcePosition,
      targetX, targetY, targetPosition,
      curvature: 0.35,
    }),
  )
  const edgePath = $derived(pathResult[0])

  // midpoint for label positioning
  const midX = $derived((sourceX + targetX) / 2)
  const midY = $derived((sourceY + targetY) / 2)
</script>

<!-- Wider transparent hit area -->
<path
  d={edgePath}
  fill="none"
  stroke="transparent"
  stroke-width="10"
  pointer-events="stroke"
/>

<!-- Visible edge -->
<path
  {id}
  d={edgePath}
  fill="none"
  class="svelte-flow__edge-path"
  stroke={selected ? 'hsl(var(--primary)/0.85)' : 'hsl(var(--border)/0.45)'}
  stroke-width={selected ? 1.5 : 1.2}
  stroke-linecap="round"
/>

<!-- * = many side (FK / source) -->
<text
  x={sourceX + (targetX > sourceX ? 14 : -14)}
  y={sourceY - 6}
  font-size="9"
  font-family="ui-monospace,monospace"
  fill={selected ? 'hsl(var(--primary)/0.7)' : 'hsl(var(--muted-foreground)/0.4)'}
  text-anchor="middle"
  dominant-baseline="auto"
  pointer-events="none"
>*</text>

<!-- 1 = one side (PK / target) -->
<text
  x={targetX + (sourceX > targetX ? 14 : -14)}
  y={targetY - 6}
  font-size="9"
  font-family="ui-monospace,monospace"
  fill={selected ? 'hsl(var(--primary)/0.7)' : 'hsl(var(--muted-foreground)/0.4)'}
  text-anchor="middle"
  dominant-baseline="auto"
  pointer-events="none"
>1</text>
