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
		class={cn("ml-auto shrink-0 flex items-center gap-[2px] pl-2", className)}
		{...restProps}
	>
		{#each keyChars as key}
			<kbd class="min-w-[18px] rounded-md border border-border/30 bg-muted/40 px-1 py-px font-mono text-[9px] text-muted-foreground/50 shadow-none group-data-[selected]/command-item:border-border/50 group-data-[selected]/command-item:bg-muted/60 group-data-[selected]/command-item:text-muted-foreground/70">
				{key}
			</kbd>
		{/each}
	</span>
{:else}
	<span
		bind:this={ref}
		data-slot="command-shortcut"
		class={cn("ml-auto shrink-0 pl-2 font-mono text-[10px] tabular-nums text-muted-foreground/40 group-data-[selected]/command-item:text-muted-foreground/60", className)}
		{...restProps}
	>
		{@render children?.()}
	</span>
{/if}
