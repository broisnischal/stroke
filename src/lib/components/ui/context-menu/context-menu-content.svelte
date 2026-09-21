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
			// Fade only, and fast - the same call the submenu makes, for the same
			// reason. A context menu opens directly under a pointer that is already
			// there, so a 100ms slide meant the panel was still moving into place
			// when the eye had already arrived: that is what reads as "the menu
			// lagged", and nothing about it was actually slow.
			"data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 border border-border/60 bg-popover text-popover-foreground min-w-36 max-w-(--menu-max-w) rounded-[10px] p-1 elevate-2-rim duration-75 z-50 overflow-x-hidden overflow-y-auto outline-none",
			className
		)}
		{...restProps}
	/>
</ContextMenuPortal>