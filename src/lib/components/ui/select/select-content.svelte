<script>
	import { Select as SelectPrimitive } from "bits-ui";
	import SelectPortal from "./select-portal.svelte";
	import SelectScrollUpButton from "./select-scroll-up-button.svelte";
	import SelectScrollDownButton from "./select-scroll-down-button.svelte";
	import { cn } from "$lib/utils.js";
	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		portalProps,
		children,
		preventScroll = true,
		...restProps
	} = $props();
</script>

<SelectPortal {...portalProps}>
	<SelectPrimitive.Content
		bind:ref
		{sideOffset}
		{preventScroll}
		data-slot="select-content"
		class={cn(
			"bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-open:zoom-in-[0.96] data-closed:zoom-out-[0.96] [transform-origin:var(--bits-floating-transform-origin)] ease-out duration-150 border border-border/60 min-w-36 rounded-xl elevate-2-rim relative isolate z-50 overflow-x-hidden overflow-y-auto",
			className
		)}
		{...restProps}
	>
		<SelectScrollUpButton />
		<SelectPrimitive.Viewport
			class={cn(
				"h-(--bits-select-anchor-height) w-full min-w-(--bits-select-anchor-width) scroll-my-1"
			)}
		>
			{@render children?.()}
		</SelectPrimitive.Viewport>
		<SelectScrollDownButton />
	</SelectPrimitive.Content>
</SelectPortal>