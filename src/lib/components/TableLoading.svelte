<script>
  import { cn } from '$lib/utils.js'
  import Loader from '@lucide/svelte/icons/loader'

  let { embedded = false } = $props()

  const messages = [
    'Fetching rows…',
    'Querying the database…',
    'Loading table data…',
    'Running your query…',
    'Scanning indexes…',
    'Joining tables…',
    'Crunching the numbers…',
    'Executing the plan…',
    'Reading from storage…',
    'Almost there…',
    'Talking to Postgres…',
    'Traversing the B-tree…',
  ]

  const message = messages[Math.floor(Math.random() * messages.length)]
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
