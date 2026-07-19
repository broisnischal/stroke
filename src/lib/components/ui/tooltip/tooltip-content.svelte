<script>
	import { Tooltip as TooltipPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		side = "bottom",
		sideOffset = 6,
		arrow = true,
		children,
		...restProps
	} = $props();
</script>

<TooltipPrimitive.Portal>
	<TooltipPrimitive.Content
		bind:ref
		{side}
		{sideOffset}
		class={cn(
			// Popover-surface pill — same surface as menus/dropdowns so rich content
			// (labels, descriptions, ⌘ chips) renders with the normal theme colors and
			// stays readable. Border + shadow lift it off the background.
			"z-50 w-fit max-w-xs rounded-lg border border-border/60 bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-lg shadow-black/30 outline-none select-none",
			// Origin-aware, snappy entrance from the trigger. Tooltips are seen constantly,
			// so keep it quick; a strong ease-out curve gives instant feedback and the exit
			// is faster than the enter (the system responding, not the user deciding).
			"[transform-origin:var(--bits-floating-transform-origin)] ease-[cubic-bezier(0.23,1,0.32,1)] data-open:animate-in data-open:duration-150 data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:duration-100 data-closed:fade-out-0 data-closed:zoom-out-95",
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		{#if arrow}
			<TooltipPrimitive.Arrow class="text-popover" width={12} height={6} />
		{/if}
	</TooltipPrimitive.Content>
</TooltipPrimitive.Portal>
