<script>
	import { cn } from "$lib/utils.js";
	let {
		ref = $bindable(null),
		class: className,
		keys = '',
		children,
		...restProps
	} = $props();

	// Split on "+" separators ("Ctrl+Shift+B") or spread Unicode codepoints ("⌘⇧B").
	// Unicode spread handles symbols correctly: [...'⌘⇧B'] = ['⌘','⇧','B'].
	const tokens = $derived(
		!keys ? [] :
		keys.includes('+') ? keys.split('+').filter(Boolean) :
		[...keys]
	);
</script>

{#if tokens.length > 0}
	<span
		bind:this={ref}
		data-slot="command-shortcut"
		class={cn("ml-auto flex shrink-0 items-center gap-[3px] pl-3", className)}
		{...restProps}
	>
		{#each tokens as token}
			<kbd class="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-border/60 bg-muted/40 px-1.5 font-mono text-ui-3xs font-medium leading-none text-muted-foreground/75 shadow-[0_1px_0_color-mix(in_oklch,var(--border)_50%,transparent)] group-data-[selected]/command-item:border-border/70 group-data-[selected]/command-item:bg-muted/70 group-data-[selected]/command-item:text-foreground/90">
				{token}
			</kbd>
		{/each}
	</span>
{:else}
	<span
		bind:this={ref}
		data-slot="command-shortcut"
		class={cn("ml-auto shrink-0 pl-3 font-mono text-ui-3xs tabular-nums text-muted-foreground/40 group-data-[selected]/command-item:text-muted-foreground/60", className)}
		{...restProps}
	>
		{@render children?.()}
	</span>
{/if}
