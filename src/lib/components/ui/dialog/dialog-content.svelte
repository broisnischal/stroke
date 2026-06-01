<script>
	import { Dialog as DialogPrimitive } from "bits-ui";
	import DialogPortal from "./dialog-portal.svelte";
	import * as Dialog from "./index.js";
	import { cn } from "$lib/utils.js";
	import X from '@lucide/svelte/icons/x';

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		showCloseButton = true,
		...restProps
	} = $props();
</script>

<DialogPortal {...portalProps}>
	<Dialog.Overlay />
	<DialogPrimitive.Content
		bind:ref
		data-slot="dialog-content"
		class={cn(
			"bg-background text-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-[0.97] data-open:zoom-in-[0.97] flex flex-col gap-4 rounded-2xl border border-border/35 p-5 text-sm shadow-2xl shadow-black/50 duration-150 w-full max-w-[calc(100%-2rem)] fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 outline-none",
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		{#if showCloseButton}
			<DialogPrimitive.Close data-slot="dialog-close">
				{#snippet child({ props })}
					<button
						class="absolute right-3.5 top-3.5 inline-flex size-6 items-center justify-center rounded-lg text-muted-foreground/30 transition-colors hover:bg-muted/50 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						{...props}
					>
						<X class="size-3.5" />
						<span class="sr-only">Close</span>
					</button>
				{/snippet}
			</DialogPrimitive.Close>
		{/if}
	</DialogPrimitive.Content>
</DialogPortal>
