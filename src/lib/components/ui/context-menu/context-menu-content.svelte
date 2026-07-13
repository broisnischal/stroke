<script>
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";
	import ContextMenuPortal from "./context-menu-portal.svelte";
	let {
		ref = $bindable(null),
		portalProps,
		class: className,
		...restProps
	} = $props();
</script>

<ContextMenuPortal {...portalProps}>
	<ContextMenuPrimitive.Content
		bind:ref
		data-slot="context-menu-content"
		class={cn(
			"data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 border border-border/60 bg-popover text-popover-foreground min-w-36 rounded-xl p-1 elevate-2-rim duration-100 z-50 overflow-x-hidden overflow-y-auto outline-none",
			className
		)}
		{...restProps}
	/>
</ContextMenuPortal>