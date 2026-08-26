<script>
  /**
   * Range date picker for the filter bar "between" operator.
   * Emits start/end as YYYY-MM-DD strings.
   */
  import { Popover, PopoverTrigger, PopoverContent } from "$lib/components/ui/popover/index.js";
  import { RangeCalendar } from "$lib/components/ui/calendar/index.js";
  import { CalendarDate } from "@internationalized/date";
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import { cn } from "$lib/utils.js";

  /** @type {{ from: string, to: string, onchange: (from: string, to: string) => void }} */
  let { from = "", to = "", onchange } = $props();

  let open = $state(false);

  /** @param {string} s @returns {import("@internationalized/date").CalendarDate | undefined} */
  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return undefined;
    try { return new CalendarDate(+m[1], +m[2], +m[3]); } catch { return undefined; }
  }

  /** @param {import("@internationalized/date").DateValue | undefined} d */
  function fmt(d) {
    if (!d) return "";
    return `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
  }

  const rangeValue = $derived.by(() => ({
    start: parseDate(from),
    end: parseDate(to),
  }));

  const label = $derived.by(() => {
    if (from && to) return `${from} to ${to}`;
    if (from) return `${from} to …`;
    return "Pick range…";
  });

  function handleRangeChange(range) {
    if (!range) return;
    const newFrom = fmt(range.start);
    const newTo   = fmt(range.end);
    onchange(newFrom, newTo);
    if (newFrom && newTo) open = false;
  }
</script>

<Popover bind:open>
  <PopoverTrigger
    class={cn(
      "inline-flex h-7 items-center gap-1.5 rounded-md border border-input bg-input/30 px-2 text-ui-sm text-foreground transition-colors hover:bg-accent focus:outline-none min-w-[14rem]",
      !from && "text-muted-foreground"
    )}
  >
    <CalendarIcon class="size-3 shrink-0 text-muted-foreground/60" />
    {label}
  </PopoverTrigger>
  <PopoverContent class="w-auto p-0" align="start">
    <RangeCalendar
      value={rangeValue}
      onValueChange={handleRangeChange}
      numberOfMonths={2}
    />
  </PopoverContent>
</Popover>
