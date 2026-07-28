<script>
  import { cn } from '$lib/utils.js'

  let {
    class: className = '',
    rounded = 'md',
    style = '',
  } = $props()
</script>

<div
  {style}
  class={cn(
    'skeleton',
    rounded === 'none' && 'rounded-none',
    rounded === 'sm' && 'rounded-md',
    rounded === 'md' && 'rounded-md',
    rounded === 'lg' && 'rounded-lg',
    rounded === 'full' && 'rounded-full',
    className,
  )}
  aria-hidden="true"
></div>
