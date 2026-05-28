<script>
  import Unplug from '@lucide/svelte/icons/unplug'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { Button } from '$lib/components/ui/button/index.js'

  let {
    open = $bindable(false),
    connectionName = '',
    ondisconnect = () => {},
  } = $props()

  function confirm() {
    open = false
    ondisconnect()
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-[360px] gap-0 overflow-hidden p-0">
    <div class="flex flex-col items-center gap-3 px-6 pt-6 pb-4 text-center">
      <div class="flex size-10 items-center justify-center rounded-full bg-muted">
        <Unplug class="size-4 text-muted-foreground" />
      </div>
      <div>
        <p class="text-sm font-semibold text-foreground">Disconnect</p>
        <p class="mt-1 text-xs text-muted-foreground">
          {#if connectionName}
            Disconnect from <span class="font-medium text-foreground">{connectionName}</span>?
          {:else}
            Disconnect from the current database?
          {/if}
        </p>
      </div>
    </div>
    <div class="flex items-center justify-end gap-2 border-t border-border/60 px-4 py-3">
      <Button type="button" variant="outline" size="sm" class="text-xs" onclick={() => (open = false)}>
        Cancel
      </Button>
      <Button type="button" variant="destructive" size="sm" class="text-xs" onclick={confirm}>
        Disconnect
      </Button>
    </div>
  </Dialog.Content>
</Dialog.Root>
