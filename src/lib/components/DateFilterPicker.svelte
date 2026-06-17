<script>
  /**
   * Single-date picker for the filter bar. Shows a styled button that opens
   * a popover calendar. Emits YYYY-MM-DD strings via onchange.
   */
  import { Popover, PopoverTrigger, PopoverContent } from "$lib/components/ui/popover/index.js";
  import { Calendar } from "$lib/components/ui/calendar/index.js";
  import { CalendarDate } from "@internationalized/date";
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import { cn } from "$lib/utils.js";

  let { value = "", onchange, class: className } = $props();

  let open = $state(false);

  /** @returns {import("@internationalized/date").CalendarDate | undefined} */
  const calValue = $derived.by(() => {
    if (!value) return undefined;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!m) return undefined;
    try { return new CalendarDate(+m[1], +m[2], +m[3]); } catch { return undefined; }
  });

  const label = $derived(value || "Pick date…");

  /** @param {import("@internationalized/date").DateValue | undefined} d */
  function pick(d) {
    if (!d) return;
    const yyyy = String(d.year).padStart(4, "0");
    const mm   = String(d.month).padStart(2, "0");
    const dd   = String(d.day).padStart(2, "0");
    onchange(`${yyyy}-${mm}-${dd}`);
    open = false;
  }
</script>

<Popover bind:open>
  <PopoverTrigger
    class={cn(
      "inline-flex h-7 items-center gap-1.5 rounded-md border border-input bg-input/30 px-2 text-ui-sm text-foreground transition-colors hover:bg-accent focus:outline-none",
      !value && "text-muted-foreground",
      className
    )}
  >
    <CalendarIcon class="size-3 shrink-0 text-muted-foreground/60" />
    {label}
  </PopoverTrigger>
  <PopoverContent class="w-auto p-0" align="start">
    <Calendar value={calValue} onValueChange={pick} />
  </PopoverContent>
</Popover>
