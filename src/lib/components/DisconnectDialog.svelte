<script>
  import ConfirmDialog from './ConfirmDialog.svelte'

  let {
    open = $bindable(false),
    connectionName = '',
    ondisconnect = () => {},
  } = $props()

  const question = $derived(
    connectionName ? `Disconnect from ${connectionName}?` : 'Disconnect from the current database?',
  )
</script>

<ConfirmDialog
  bind:open
  icon="unplug"
  title="Disconnect"
  description={question}
  confirmLabel="Disconnect"
  confirmIcon="unplug"
  variant="destructive"
  confirmOnEnter
  onconfirm={ondisconnect}
/>
