<script>
	import { Tooltip as TooltipPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		side = "bottom",
		sideOffset = 8,
		children,
		...restProps
	} = $props();
</script>

<TooltipPrimitive.Portal>
	<TooltipPrimitive.Content
		bind:ref
		{side}
		{sideOffset}
		class={cn(
			"data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-open:zoom-in-[0.96] data-closed:zoom-out-[0.96] [transform-origin:var(--bits-floating-transform-origin)] ease-out duration-[125ms] z-50 w-fit max-w-xs rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-lg shadow-black/20 outline-none select-none",
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		<TooltipPrimitive.Arrow width={12} height={6} class="text-foreground" />
	</TooltipPrimitive.Content>
</TooltipPrimitive.Portal>
