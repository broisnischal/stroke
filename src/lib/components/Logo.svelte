<script>
  import { cn } from '$lib/utils.js'
  import { isCurrentThemeDark } from '$lib/stores/settings.js'

  /**
   * Stroke brand mark. Picks the asset from the active app theme (not the CSS
   * media query) so a light mark shows on dark UI and a dark mark on light UI -
   * keeping the logo visible either way.
   * @type {{ class?: string }}
   */
  let { class: className = '' } = $props()

  const src = $derived($isCurrentThemeDark ? '/stroke_white.png' : '/stroke_light.png')
</script>

<img
  {src}
  alt="Stroke"
  draggable="false"
  class={cn('select-none object-contain', className)}
/>
