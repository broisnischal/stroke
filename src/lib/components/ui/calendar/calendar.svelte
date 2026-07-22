<script>
	import { Calendar as CalendarPrimitive } from "bits-ui";
	import ChevronLeft from "@lucide/svelte/icons/chevron-left";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import { cn } from "$lib/utils.js";

	let {
		value = $bindable(),
		placeholder = $bindable(),
		class: className,
		weekdayFormat = "short",
		...restProps
	} = $props();
</script>

<CalendarPrimitive.Root
	bind:value
	bind:placeholder
	{weekdayFormat}
	class={cn("p-3", className)}
	{...restProps}
>
	{#snippet children({ months, weekdays })}
		<CalendarPrimitive.Header class="mb-2 flex items-center justify-between px-1">
			<CalendarPrimitive.PrevButton
				class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
			>
				<ChevronLeft class="size-4" />
			</CalendarPrimitive.PrevButton>
			<CalendarPrimitive.Heading class="text-ui-sm font-medium text-foreground" />
			<CalendarPrimitive.NextButton
				class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
			>
				<ChevronRight class="size-4" />
			</CalendarPrimitive.NextButton>
		</CalendarPrimitive.Header>

		{#each months as month}
			<CalendarPrimitive.Grid class="w-full border-collapse">
				<CalendarPrimitive.GridHead>
					<CalendarPrimitive.GridRow class="flex">
						{#each weekdays as day}
							<CalendarPrimitive.HeadCell
								class="w-9 rounded-md text-ui-2xs font-normal text-muted-foreground"
							>
								{day.slice(0, 2)}
							</CalendarPrimitive.HeadCell>
						{/each}
					</CalendarPrimitive.GridRow>
				</CalendarPrimitive.GridHead>
				<CalendarPrimitive.GridBody>
					{#each month.weeks as weekDates}
						<CalendarPrimitive.GridRow class="mt-1 flex">
							{#each weekDates as date}
								<CalendarPrimitive.Cell {date} month={month.value} class="relative p-0 text-center text-ui-sm">
									<CalendarPrimitive.Day
										class={cn(
											"inline-flex size-9 items-center justify-center rounded-md text-ui-sm font-normal transition-colors",
											"hover:bg-muted hover:text-foreground",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
											"data-selected:bg-primary data-selected:text-primary-foreground data-selected:hover:bg-primary/90",
											"data-today:bg-muted/60 data-today:font-medium",
											"data-outside-month:text-muted-foreground/30 data-outside-month:pointer-events-none",
											"data-disabled:pointer-events-none data-disabled:opacity-30"
										)}
									/>
								</CalendarPrimitive.Cell>
							{/each}
						</CalendarPrimitive.GridRow>
					{/each}
				</CalendarPrimitive.GridBody>
			</CalendarPrimitive.Grid>
		{/each}
	{/snippet}
</CalendarPrimitive.Root>
