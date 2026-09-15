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
			"field-surface aria-invalid:ring-destructive/60 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 h-9 px-3 py-1 text-ui-sm transition-[color,box-shadow,border-color] hover:border-foreground/30 file:h-6 file:text-ui-sm file:font-medium aria-invalid:ring-1 file:text-foreground placeholder:text-muted-foreground w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
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
			"field-surface aria-invalid:ring-destructive/60 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 h-9 px-3 py-1 text-ui-sm transition-[color,box-shadow,border-color] hover:border-foreground/30 file:h-6 file:text-ui-sm file:font-medium aria-invalid:ring-1 file:text-foreground placeholder:text-muted-foreground w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
			className
		)}
		{type}
		{...noSuggest}
		bind:value
		{...restProps}
	/>
{/if}
