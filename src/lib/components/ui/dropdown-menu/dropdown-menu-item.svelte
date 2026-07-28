<script>
	import { cn } from "$lib/utils.js";
	import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		class: className,
		inset,
		variant = "default",
		...restProps
	} = $props();
</script>

<DropdownMenuPrimitive.Item
	bind:ref
	data-slot="dropdown-menu-item"
	data-inset={inset}
	data-variant={variant}
	class={cn(
		"focus:bg-accent focus:text-foreground focus:*:[svg]:text-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:text-destructive gap-2 rounded-md px-2 py-1.5 text-ui-sm data-inset:pl-7 [&_svg:not([class*='size-'])]:size-3.5 group/dropdown-menu-item relative flex min-w-0 cursor-default items-center outline-hidden select-none transition-colors duration-100 data-disabled:pointer-events-none data-disabled:opacity-40 data-[inset]:pl-8 [&>[data-slot=menu-label]]:min-w-0 [&>[data-slot=menu-label]]:truncate [&_svg]:pointer-events-none [&_svg]:shrink-0",
		className
	)}
	{...restProps}
/>