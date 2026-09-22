<script>
  import { crashArmed } from '$lib/games/easter-eggs.js'

  // Disarm BEFORE throwing. `<svelte:boundary>`'s reset re-renders this subtree,
  // so an armed flag here would throw again the instant you pressed "Try to
  // recover" and the joke would become a trap. Nothing is persisted either, so
  // "Reload app" is always a clean start.
  crashArmed.set(false)
  throw new Error(
    'FATAL: relation "reality" does not exist\n' +
      '  HINT: you typed "crash" into a search box. Nothing was harmed - ' +
      'Try to recover, or reload. Your connections and data are exactly where you left them.',
  )
</script>
