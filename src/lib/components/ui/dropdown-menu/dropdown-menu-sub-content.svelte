<script>
	import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	} = $props();
</script>

<DropdownMenuPrimitive.SubContent
	bind:ref
	data-slot="dropdown-menu-sub-content"
	class={cn("data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-open:zoom-in-[0.96] data-closed:zoom-out-[0.96] [transform-origin:var(--bits-floating-transform-origin)] ease-out duration-150 border border-border/60 bg-popover text-popover-foreground min-w-[96px] max-w-(--menu-max-w) rounded-[10px] p-1 elevate-2-rim w-auto z-50 overflow-x-hidden overflow-y-auto outline-none", className)}
	{...restProps}
/>