<script>
  import { RangeCalendar as RangeCalendarPrimitive } from "bits-ui";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { cn } from "$lib/utils.js";

  let {
    value = $bindable(),
    placeholder = $bindable(),
    numberOfMonths = 2,
    class: className,
    weekdayFormat = "short",
    ...restProps
  } = $props();
</script>

<RangeCalendarPrimitive.Root
  bind:value
  bind:placeholder
  {numberOfMonths}
  {weekdayFormat}
  class={cn("p-3", className)}
  {...restProps}
>
  {#snippet children({ months, weekdays })}
    <RangeCalendarPrimitive.Header class="mb-2 flex items-center justify-between px-1">
      <RangeCalendarPrimitive.PrevButton
        class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronLeft class="size-4" />
      </RangeCalendarPrimitive.PrevButton>
      <RangeCalendarPrimitive.Heading class="text-[13px] font-medium text-foreground" />
      <RangeCalendarPrimitive.NextButton
        class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronRight class="size-4" />
      </RangeCalendarPrimitive.NextButton>
    </RangeCalendarPrimitive.Header>

    <div class="flex gap-4">
      {#each months as month}
        <RangeCalendarPrimitive.Grid class="w-full border-collapse">
          <RangeCalendarPrimitive.GridHead>
            <RangeCalendarPrimitive.GridRow class="flex">
              {#each weekdays as day}
                <RangeCalendarPrimitive.HeadCell
                  class="w-9 rounded-md text-[11px] font-normal text-muted-foreground"
                >
                  {day.slice(0, 2)}
                </RangeCalendarPrimitive.HeadCell>
              {/each}
            </RangeCalendarPrimitive.GridRow>
          </RangeCalendarPrimitive.GridHead>
          <RangeCalendarPrimitive.GridBody>
            {#each month.weeks as weekDates}
              <RangeCalendarPrimitive.GridRow class="mt-1 flex">
                {#each weekDates as date}
                  <RangeCalendarPrimitive.Cell
                    {date}
                    month={month.value}
                    class="relative p-0 text-center text-[13px]"
                  >
                    <RangeCalendarPrimitive.Day
                      class={cn(
                        "inline-flex size-9 items-center justify-center rounded-md text-[13px] font-normal transition-colors",
                        "hover:bg-muted hover:text-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "data-selected:bg-primary data-selected:text-primary-foreground data-selected:hover:bg-primary/90",
                        "data-selection-start:rounded-l-md data-selection-end:rounded-r-md",
                        "data-highlighted:bg-primary/15 data-highlighted:text-foreground data-highlighted:rounded-none",
                        "data-selection-start:rounded-l-md data-selection-end:rounded-r-md",
                        "data-today:bg-muted/60 data-today:font-medium",
                        "data-outside-month:text-muted-foreground/30 data-outside-month:pointer-events-none",
                        "data-disabled:pointer-events-none data-disabled:opacity-30"
                      )}
                    />
                  </RangeCalendarPrimitive.Cell>
                {/each}
              </RangeCalendarPrimitive.GridRow>
            {/each}
          </RangeCalendarPrimitive.GridBody>
        </RangeCalendarPrimitive.Grid>
      {/each}
    </div>
  {/snippet}
</RangeCalendarPrimitive.Root>
