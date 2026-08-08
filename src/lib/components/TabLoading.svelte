<script>
  import Loader from "@lucide/svelte/icons/loader";
  import { EASTER_EGGS } from "$lib/easter-eggs.js";
  import { nextLoadingMessage } from "$lib/loading-messages.js";
  // Fallback shown while a lazy tab chunk downloads, so switching to a tab for
  // the first time fades to a spinner over the app background instead of a
  // black flash. Fills its container.
  let { label = "" } = $props();

  // With no label there is nothing to read while the chunk lands - show a
  // credit instead, same pool the table loader draws from.
  const message = label || nextLoadingMessage(EASTER_EGGS);
</script>

<div
  class="flex min-h-0 flex-1 flex-col items-center justify-center bg-background"
  role="status"
  aria-live="polite"
  aria-busy="true"
>
  <Loader class="size-5 animate-spin text-muted-foreground/50" />
  <span class="mt-2 text-ui-xs text-muted-foreground/60">{message}</span>
</div>
