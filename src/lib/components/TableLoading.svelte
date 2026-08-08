<script>
  import { cn } from '$lib/utils.js'
  import Loader from '@lucide/svelte/icons/loader'
  import { nextLoadingMessage } from '$lib/loading-messages.js'

  let { embedded = false } = $props()

  const message = nextLoadingMessage()
</script>

<div
  class={cn(
    'flex w-full items-center justify-center',
    embedded ? 'h-40' : 'min-h-0 flex-1',
  )}
  role="status"
  aria-label="Loading"
>
  <div class="flex flex-col items-center gap-2.5">
    <Loader class="size-5 animate-spin text-muted-foreground/50" aria-hidden="true" />
    <p class="font-mono text-ui-sm text-muted-foreground/70">{message}</p>
  </div>
</div>
