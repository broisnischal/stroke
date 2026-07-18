<script>
  // Renders a provider brand mark (see brand-icons.js) as a monochrome,
  // currentColor SVG. Renders nothing when the name has no mark, so callers
  // guard with `hasBrand()` and fall back to a generic <Icon>.
  import { cn } from '$lib/utils.js'
  import { BRAND_PATHS } from '$lib/brand-icons.js'

  let { name = '', class: className = '' } = $props()

  const d = $derived(BRAND_PATHS[name] ?? '')
</script>

{#if d}
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    class={cn('size-4 shrink-0', className)}
  >
    <path d={d} />
  </svg>
{/if}
