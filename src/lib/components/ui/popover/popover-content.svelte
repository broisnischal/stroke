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
			"data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-open:zoom-in-[0.96] data-closed:zoom-out-[0.96] [transform-origin:var(--bits-floating-transform-origin)] ease-out duration-150 z-50 rounded-[10px] border border-border/60 bg-popover p-0 elevate-2-rim outline-none",
			className
		)}
		{...restProps}
	/>
</PopoverPrimitive.Portal>
