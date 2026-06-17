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
			<kbd class="min-w-[18px] rounded border border-border/50 bg-muted/50 px-[5px] py-0 font-mono text-[10px] font-medium leading-[18px] text-muted-foreground/70 [border-bottom-width:2px] [border-bottom-color:var(--border)] group-data-[selected]/command-item:border-border/70 group-data-[selected]/command-item:bg-muted/70 group-data-[selected]/command-item:text-muted-foreground/90">
				{token}
			</kbd>
		{/each}
	</span>
{:else}
	<span
		bind:this={ref}
		data-slot="command-shortcut"
		class={cn("ml-auto shrink-0 pl-3 font-mono text-[10px] tabular-nums text-muted-foreground/40 group-data-[selected]/command-item:text-muted-foreground/60", className)}
		{...restProps}
	>
		{@render children?.()}
	</span>
{/if}
