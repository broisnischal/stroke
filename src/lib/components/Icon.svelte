<script>
  // Shared icon wrapper. Renders the active icon family (Lucide or Hugeicons)
  // for a stable semantic `name`. Falls back to Lucide when the current set has
  // no mapping for that name, so switching sets never leaves a hole.
  //
  //   <Icon name="search" class="size-4 text-muted-foreground" />
  //
  // Sizing + color come from `class` (size-*, text-*), matching how Lucide icons
  // are used across the app — so this is a drop-in replacement for a bare glyph.
  import { HugeiconsIcon } from '@hugeicons/svelte'
  import { appIconSet } from '$lib/stores/settings.js'
  import { ICON_MAP } from '$lib/icon-registry.js'
  import { cn } from '$lib/utils.js'

  let {
    /** Semantic icon name — a key in ICON_MAP. */
    name,
    class: className = 'size-4',
    /** Hugeicons stroke weight (Lucide weight is driven globally by data-icon-style). */
    strokeWidth = 1.8,
    ...rest
  } = $props()

  const entry = $derived(ICON_MAP[name])
  const useHuge = $derived($appIconSet === 'hugeicons' && !!entry?.huge)
  const Lucide = $derived(entry?.lucide)
</script>

{#if useHuge}
  <HugeiconsIcon icon={entry.huge} class={cn('shrink-0', className)} {strokeWidth} {...rest} />
{:else if Lucide}
  <Lucide class={cn('shrink-0', className)} {...rest} />
{/if}
