<script>
	import { Select as SelectPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	} = $props();
</script>

<SelectPrimitive.GroupHeading
	bind:ref
	data-slot="select-group-heading"
	class={cn("text-muted-foreground/70 px-2 pt-1.5 pb-1 text-ui-2xs font-medium", className)}
	{...restProps}
>
	{@render children?.()}
</SelectPrimitive.GroupHeading>