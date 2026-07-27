<script>
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	let {
		ref = $bindable(null),
		class: className,
		inset,
		children,
		...restProps
	} = $props();
</script>

<ContextMenuPrimitive.SubTrigger
	bind:ref
	data-slot="context-menu-sub-trigger"
	data-inset={inset}
	class={cn(
		"focus:bg-accent focus:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground gap-1.5 rounded-lg px-1.5 py-1 text-ui-sm data-inset:pl-7 [&_svg:not([class*='size-'])]:size-4 flex min-w-0 cursor-default items-center outline-hidden select-none data-inset:ps-8 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<ChevronRightIcon class="ml-auto" />
</ContextMenuPrimitive.SubTrigger>