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
	class={cn("text-muted-foreground/40 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] data-inset:pl-7 data-[inset]:pl-8", className)}
	{...restProps}
>
	{@render children?.()}
</div>