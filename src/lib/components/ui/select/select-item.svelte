<script>
	import { Select as SelectPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";
	import CheckIcon from '@lucide/svelte/icons/check';

	let {
		ref = $bindable(null),
		class: className,
		value,
		label,
		children: childrenProp,
		...restProps
	} = $props();
</script>

<SelectPrimitive.Item
	bind:ref
	{value}
	data-slot="select-item"
	class={cn(
		"focus:bg-accent focus:text-foreground gap-1.5 rounded-md py-1.5 pr-8 pl-2 text-[13px] [&_svg:not([class*='size-'])]:size-3.5 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2 data-highlighted:bg-accent data-highlighted:text-foreground relative flex w-full cursor-default items-center outline-hidden select-none transition-colors duration-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		className
	)}
	{...restProps}
>
	{#snippet children({ selected, highlighted })}
		<span class="absolute end-2 flex size-3.5 items-center justify-center text-primary">
			{#if selected}
				<CheckIcon class="cn-select-item-indicator-icon" />
			{/if}
		</span>
		{#if childrenProp}
			{@render childrenProp({ selected, highlighted })}
		{:else}
			{label || value}
		{/if}
	{/snippet}
</SelectPrimitive.Item>