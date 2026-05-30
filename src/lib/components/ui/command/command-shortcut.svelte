<script>
	import { cn } from "$lib/utils.js";
	let {
		ref = $bindable(null),
		class: className,
		keys = '',
		children,
		...restProps
	} = $props();

	const keyChars = $derived(keys ? [...keys] : []);
</script>

{#if keyChars.length > 0}
	<span
		bind:this={ref}
		data-slot="command-shortcut"
		class={cn("ml-auto shrink-0 flex items-center gap-[3px] pl-2", className)}
		{...restProps}
	>
		{#each keyChars as key}
			<kbd class="group-data-[selected]/command-item:border-accent-foreground/25 group-data-[selected]/command-item:bg-accent-foreground/10 group-data-[selected]/command-item:text-accent-foreground group-data-[selected]/command-item:shadow-none">
				{key}
			</kbd>
		{/each}
	</span>
{:else}
	<span
		bind:this={ref}
		data-slot="command-shortcut"
		class={cn("ml-auto shrink-0 pl-2 font-mono text-ui-xs tabular-nums text-muted-foreground group-data-[selected]/command-item:text-accent-foreground", className)}
		{...restProps}
	>
		{@render children?.()}
	</span>
{/if}
