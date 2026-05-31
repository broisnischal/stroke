<script>
	import { Separator } from "$lib/components/ui/separator/index.js";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	} = $props();
</script>

<Separator
	bind:ref
	data-slot="select-separator"
	class={cn("bg-border/25 -mx-1.5 my-1.5 h-px pointer-events-none", className)}
	{...restProps}
/>