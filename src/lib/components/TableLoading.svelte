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
    'ugh, i hate Prisma…',
    'Drizzle is mid, tbh…',
    'vibe coding my way through this…',
    'SELECT * FROM skill_issue…',
    'have you tried turning the database off and on again?',
    'your ORM is crying somewhere…',
    'this would be faster with raw SQL, just saying…',
    'touching grass while waiting…',
    'blame the N+1 queries, not me…',
    'migrating 47 times and counting…',
    'raw SQL supremacy loading…',
    'who wrote this schema? 💀',
    'connection pooling is a lifestyle…',
    'null is not your friend…',
    'no more ORMs.',
    'just use SQL.',
    'schema? never heard of her.',
    'indexes go brrr…',
    'touching the void…',
    'cursed query incoming…',
    'type safety? lol.',
    'migrations are pain.',
    'foreign key jumpscare…',
    'skill issue detected.',
    'no cap, almost done.',
    'WHERE did my data go…',
    'vibing with the buffer…',
    'npm install brain…',
    'deadlock speedrun…',
    'YOLO commit incoming…',
    'ChatGPT wrote this query.',
    'pray to the query planner…',
    'it works on my machine.',
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
