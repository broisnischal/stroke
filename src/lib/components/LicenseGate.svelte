<script>
  import { onMount } from 'svelte'
  import { isBlocked, refreshLicenseStatus, runLicenseCheck } from '$lib/stores/license.js'
  import TrialExpiredScreen from './TrialExpiredScreen.svelte'

  let { children } = $props()

  onMount(async () => {
    // Load the local status immediately so an expired trial gates on first paint,
    // then phone home in the background to catch server-side revocation.
    await refreshLicenseStatus()
    runLicenseCheck()
  })
</script>

{#if $isBlocked}
  <!-- Trial over, no license → hard block: the app is not rendered at all. -->
  <TrialExpiredScreen />
{:else}
  {@render children()}
{/if}
