<script>
  import { useSvelteFlow } from '@xyflow/svelte'

  let { focusNodeId = /** @type {string|null} */ (null) } = $props()

  const { fitView } = useSvelteFlow()

  $effect(() => {
    const id = focusNodeId
    if (!id) return
    setTimeout(() => {
      fitView({ nodes: [{ id }], duration: 500, maxZoom: 1.5, padding: 0.25 })
    }, 60)
  })
</script>
