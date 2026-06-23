<script>
  import { onMount } from 'svelte'
  import { runLicenseCheck } from '$lib/stores/license.js'

  let { children } = $props()

  onMount(() => runLicenseCheck())
</script>

<!-- Always render the app — Pro feature gates in StudioShell/SqlConsole handle restrictions -->
{@render children()}
