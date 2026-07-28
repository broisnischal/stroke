<script>
  /** @type {{ bg: string, accent: string, class?: string }} */
  let { bg, accent, class: className = '' } = $props()
</script>

<span
  class="inline-flex size-4 shrink-0 overflow-hidden rounded-md border border-border/60 {className}"
  aria-hidden="true"
>
  <span class="flex-[2]" style:background={bg}></span>
  <span class="flex-1" style:background={accent}></span>
</span>
