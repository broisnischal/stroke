<script>
  // Monochrome brand mark for a database / provider driver id.
  // Renders a single-path SVG with fill=currentColor so the parent controls tint
  // (text-muted-foreground, text-foreground when active, etc.). Real marks come
  // from simple-icons; SQL Server + unknowns fall back to a filled cylinder.
  import { BRAND_MARKS, FALLBACK_MARK, MARK_ALIASES } from '$lib/db-icons.js'
  import { cn } from '$lib/utils.js'

  let {
    /** Driver id, e.g. 'postgres' | 'supabase' | 'sqlite-memory' */
    id,
    /** Extra classes - size + color live here (e.g. 'size-4 text-blue-400'). */
    class: className = 'size-4',
  } = $props()

  const resolvedId = $derived(MARK_ALIASES[id] ?? id)
  const path = $derived(BRAND_MARKS[resolvedId]?.d ?? FALLBACK_MARK)
</script>

<svg
  viewBox="0 0 24 24"
  fill="currentColor"
  aria-hidden="true"
  class={cn('shrink-0', className)}
>
  <path d={path} />
</svg>
