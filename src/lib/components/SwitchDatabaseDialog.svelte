<script>
  import ConfirmDialog from './ConfirmDialog.svelte'

  let {
    open = $bindable(false),
    /** Database being switched to. */
    databaseName = '',
    /** Database currently connected to, for the "from → to" framing. */
    currentName = '',
    onconfirm = () => {},
  } = $props()

  const question = $derived(
    currentName
      ? `Connect to ${databaseName} instead of ${currentName}?`
      : `Connect to ${databaseName}?`,
  )
</script>

<ConfirmDialog
  bind:open
  icon="database"
  title="Switch database"
  description={question}
  note="This closes the current connection and its open tabs."
  confirmLabel="Switch"
  confirmIcon="arrow-left-right"
  {onconfirm}
/>
