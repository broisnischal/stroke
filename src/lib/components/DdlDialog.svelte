<script>
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import Copy from '@lucide/svelte/icons/copy'
  import Check from '@lucide/svelte/icons/check'

  let {
    open = $bindable(false),
    tableName = '',
    ddl = '',
  } = $props()

  let copied = $state(false)

  async function copyDdl() {
    await navigator.clipboard.writeText(ddl)
    copied = true
    setTimeout(() => { copied = false }, 1500)
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-2xl">
    <Dialog.Header>
      <Dialog.Title class="font-mono text-sm">DDL — {tableName}</Dialog.Title>
    </Dialog.Header>
    <div class="relative mt-2">
      <pre class="max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap break-all">{ddl}</pre>
      <button
        type="button"
        onclick={copyDdl}
        class="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Copy DDL"
      >
        {#if copied}
          <Check class="size-3.5 text-green-500" />
        {:else}
          <Copy class="size-3.5" />
        {/if}
      </button>
    </div>
  </Dialog.Content>
</Dialog.Root>
