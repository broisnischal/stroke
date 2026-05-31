<script>
	import { Command as CommandPrimitive, useId } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		heading,
		value,
		...restProps
	} = $props();
</script>

<CommandPrimitive.Group
	bind:ref
	data-slot="command-group"
	class={cn(
		"text-foreground py-1",
		"[&_[data-command-group-items]]:flex [&_[data-command-group-items]]:w-full [&_[data-command-group-items]]:min-w-0 [&_[data-command-group-items]]:flex-col [&_[data-command-group-items]]:gap-px",
		className,
	)}
	value={value ?? heading ?? `----${useId()}`}
	{...restProps}
>
	{#if heading}
		<CommandPrimitive.GroupHeading
			class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/40"
		>
			{heading}
		</CommandPrimitive.GroupHeading>
	{/if}
	<CommandPrimitive.GroupItems {children} />
</CommandPrimitive.Group>
