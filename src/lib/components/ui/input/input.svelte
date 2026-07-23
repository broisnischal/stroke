<script>
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		"data-slot": dataSlot = "input",
		...restProps
	} = $props();

	const noSuggest = { autocomplete: "off", autocorrect: "off", autocapitalize: "off", spellcheck: false };
</script>

{#if type === "file"}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"dark:bg-input/30 border-foreground/15 focus-visible:border-foreground/55 focus-visible:ring-0 aria-invalid:ring-destructive/60 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 h-9 rounded-lg border-2 bg-transparent px-3 py-1 text-ui-sm transition-[color,box-shadow,border-color] hover:border-foreground/25 file:h-6 file:text-ui-sm file:font-medium aria-invalid:ring-1 file:text-foreground placeholder:text-muted-foreground w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"dark:bg-input/30 border-foreground/15 focus-visible:border-foreground/55 focus-visible:ring-0 aria-invalid:ring-destructive/60 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 h-9 rounded-lg border-2 bg-transparent px-3 py-1 text-ui-sm transition-[color,box-shadow,border-color] hover:border-foreground/25 file:h-6 file:text-ui-sm file:font-medium aria-invalid:ring-1 file:text-foreground placeholder:text-muted-foreground w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
			className
		)}
		{type}
		{...noSuggest}
		bind:value
		{...restProps}
	/>
{/if}
