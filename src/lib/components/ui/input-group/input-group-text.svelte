<script>
	import { cn } from "$lib/utils.js";
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	} = $props();
</script>

<span
	bind:this={ref}
	class={cn("text-muted-foreground gap-2 text-ui-sm [&_svg:not([class*='size-'])]:size-4 flex items-center [&_svg]:pointer-events-none", className)}
	{...restProps}
>
	{@render children?.()}
</span>