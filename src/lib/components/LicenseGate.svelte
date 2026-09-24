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

  // Once the gate has shown, it stays up until the screen says it is done.
  // activateLicense() refreshes the status before it resolves, so $isBlocked
  // goes false mid-activation - and dropping the gate right then mounted the
  // whole app in the same tick the confetti started, which is what made the
  // celebration stutter (and hid the "Activated" state it was celebrating).
  let holdGate = $state(false)
  $effect(() => {
    if ($isBlocked) holdGate = true
  })
</script>

{#if $isBlocked || holdGate}
  <!-- Trial over, no license → hard block: the app is not rendered at all. -->
  <TrialExpiredScreen onactivated={() => (holdGate = false)} />
{:else}
  {@render children()}
{/if}
