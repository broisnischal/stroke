<script>
	import { Popover as PopoverPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		align = "start",
		...restProps
	} = $props();
</script>

<PopoverPrimitive.Portal>
	<PopoverPrimitive.Content
		bind:ref
		{sideOffset}
		{align}
		class={cn(
			"data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-[0.97] data-open:zoom-in-[0.97] data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 z-50 rounded-xl border border-border/35 bg-background p-0 shadow-xl shadow-black/30 outline-none duration-150",
			className
		)}
		{...restProps}
	/>
</PopoverPrimitive.Portal>
