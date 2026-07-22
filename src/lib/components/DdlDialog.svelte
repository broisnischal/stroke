<script>
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import Icon from './Icon.svelte'
  import ShikiBlock from './ShikiBlock.svelte'

  let {
    open = $bindable(false),
    tableName = '',
    ddl = '',
    /** @type {((sql: string) => void) | null} */
    onopeninsql = null,
  } = $props()

  let copied = $state(false)
  /** @type {ReturnType<typeof setTimeout> | null} */
  let copiedTimer = null

  function copyDdl() {
    navigator.clipboard.writeText(ddl).then(() => {
      copied = true
      if (copiedTimer) clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => { copied = false }, 2000)
    })
  }

  function openInEditor() {
    if (!onopeninsql || !ddl) return
    onopeninsql(ddl)
    open = false
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    showCloseButton={false}
    class="w-[min(680px,calc(100vw-2rem))] gap-0 overflow-hidden rounded-xl p-0 sm:max-w-none"
  >
    <!-- Header -->
    <div class="flex h-12 items-center gap-2.5 border-b border-border/60 pl-4 pr-2.5">
      <span class="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
        <Icon name="table-2" class="size-3.5" />
      </span>
      <Dialog.Title class="min-w-0 flex-1 truncate text-ui-sm font-medium text-foreground">
        Table DDL
        <span class="text-muted-foreground/50">·</span>
        <span class="font-mono text-ui-sm">{tableName}</span>
      </Dialog.Title>
      <Dialog.Close
        class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,scale] hover:bg-accent hover:text-foreground active:scale-[0.96]"
        aria-label="Close"
      >
        <Icon name="x" class="size-3.5" />
      </Dialog.Close>
    </div>

    <!-- DDL body -->
    <div class="flex h-[min(380px,60vh)] min-h-0 flex-col bg-panel">
      <ShikiBlock code={ddl} lang="sql" nowrap />
    </div>

    <!-- Footer -->
    <div class="flex h-13 items-center justify-end gap-2 border-t border-border/60 bg-background px-4">
      <button
        type="button"
        class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-ui-xs text-muted-foreground transition-[background-color,color,scale] hover:bg-accent hover:text-foreground active:scale-[0.96]"
        onclick={copyDdl}
      >
        {#if copied}
          <Icon name="check" class="size-3 text-green-500" />
          Copied
        {:else}
          <Icon name="copy" class="size-3" />
          Copy
        {/if}
      </button>
      {#if onopeninsql}
        <button
          type="button"
          class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-ui-xs font-medium text-primary-foreground transition-[opacity,scale] hover:opacity-90 active:scale-[0.96]"
          onclick={openInEditor}
        >
          <Icon name="terminal" class="size-3" />
          Open in SQL editor
        </button>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
