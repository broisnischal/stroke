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
	data-slot="context-menu-shortcut"
	class={cn("text-muted-foreground/60 group-focus/context-menu-item:text-muted-foreground ml-auto shrink-0 pl-3 text-ui-2xs", className)}
	{...restProps}
>
	{@render children?.()}
</span>