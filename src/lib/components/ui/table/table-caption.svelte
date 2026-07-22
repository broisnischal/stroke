<script>
	import { cn } from "$lib/utils.js";
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	} = $props();
</script>

<caption
	bind:this={ref}
	data-slot="table-caption"
	class={cn("text-muted-foreground mt-4 text-ui-sm", className)}
	{...restProps}
>
	{@render children?.()}
</caption>