<script>
	import { Command as CommandPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	} = $props();
</script>

<CommandPrimitive.LinkItem
	bind:ref
	data-slot="command-item"
	class={cn(
		"aria-selected:bg-accent aria-selected:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-ui-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		className
	)}
	{...restProps}
/>