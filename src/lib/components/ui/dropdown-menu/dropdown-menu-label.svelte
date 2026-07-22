<script>
	import { cn } from "$lib/utils.js";
	let {
		ref = $bindable(null),
		class: className,
		inset,
		children,
		...restProps
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="dropdown-menu-label"
	data-inset={inset}
	class={cn("text-muted-foreground/60 px-2 py-1 text-ui-3xs font-medium uppercase tracking-[0.08em] data-inset:pl-7 data-[inset]:pl-8", className)}
	{...restProps}
>
	{@render children?.()}
</div>