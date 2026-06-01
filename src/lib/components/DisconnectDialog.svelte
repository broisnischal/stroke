<script>
  import Unplug from '@lucide/svelte/icons/unplug'
  import * as Dialog from '$lib/components/ui/dialog/index.js'

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
  <Dialog.Content showCloseButton={false} class="w-[min(380px,calc(100vw-2rem))] sm:max-w-none gap-0 overflow-hidden p-0">

    <!-- Body -->
    <div class="flex items-start gap-3.5 px-5 pt-5 pb-4">
      <div class="mt-px shrink-0 rounded-xl bg-muted/50 p-2">
        <Unplug class="size-3.5 text-muted-foreground/70" />
      </div>
      <div class="min-w-0">
        <p class="text-[13px] font-semibold text-foreground">Disconnect</p>
        <p class="mt-0.5 text-[12px] leading-[1.5] text-muted-foreground/70">
          {#if connectionName}
            Disconnect from <span class="font-medium text-foreground/80">{connectionName}</span>?
          {:else}
            Disconnect from the current database?
          {/if}
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-end gap-2 border-t border-border/25 px-5 py-3">
      <button
        type="button"
        class="inline-flex h-8 items-center rounded-lg px-3.5 text-[13px] text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
        onclick={() => (open = false)}
      >Cancel</button>
      <button
        type="button"
        class="inline-flex h-8 items-center rounded-lg bg-foreground px-4 text-[13px] font-medium text-background transition-colors hover:bg-foreground/85"
        onclick={confirm}
      >Disconnect</button>
    </div>
  </Dialog.Content>
</Dialog.Root>
