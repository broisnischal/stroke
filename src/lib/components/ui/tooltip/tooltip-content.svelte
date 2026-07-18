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
			// High-contrast pill — inverts with the theme (near-white on dark, near-black
			// on light) so it reads instantly off any surface.
			"z-50 w-fit max-w-xs rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-lg shadow-black/25 outline-none select-none",
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
			<TooltipPrimitive.Arrow class="text-foreground" width={12} height={6} />
		{/if}
	</TooltipPrimitive.Content>
</TooltipPrimitive.Portal>
