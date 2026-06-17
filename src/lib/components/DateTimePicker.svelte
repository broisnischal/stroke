<script>
  /**
   * A popover-based date/time picker for insert-row inputs.
   * Accepts/emits an ISO-ish string (YYYY-MM-DDTHH:mm:ss).
   * @typedef {Object} Props
   * @property {string} value
   * @property {(v: string) => void} onchange
   * @property {boolean} [showTime]
   * @property {boolean} [disabled]
   * @property {string} [colName]
   * @property {() => void} [onfocus]
   */
  import { Popover, PopoverTrigger, PopoverContent } from "$lib/components/ui/popover/index.js";
  import { Calendar } from "$lib/components/ui/calendar/index.js";
  import { CalendarDate, parseDate, toCalendarDate } from "@internationalized/date";
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import { cn } from "$lib/utils.js";

  let {
    value = $bindable(""),
    onchange,
    showTime = true,
    disabled = false,
    colName,
    onfocus,
  } = $props();

  let open = $state(false);

  // Parse the current string value into date parts
  const parsed = $derived.by(() => {
    if (!value) return null;
    try {
      const d = new Date(value.includes("T") ? value : value + "T00:00:00");
      if (isNaN(d.getTime())) return null;
      return d;
    } catch {
      return null;
    }
  });

  const calValue = $derived.by(() => {
    if (!parsed) return undefined;
    try {
      return new CalendarDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
    } catch {
      return undefined;
    }
  });

  const timeStr = $derived.by(() => {
    if (!parsed) return "00:00";
    const hh = String(parsed.getHours()).padStart(2, "0");
    const mm = String(parsed.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  });

  const displayLabel = $derived.by(() => {
    if (!parsed) return "Pick a date…";
    const date = parsed.toLocaleDateString("en-CA"); // YYYY-MM-DD
    return showTime ? `${date}  ${timeStr}` : date;
  });

  function buildIsoString(dateVal, time) {
    if (!dateVal) return "";
    const yyyy = String(dateVal.year).padStart(4, "0");
    const mm = String(dateVal.month).padStart(2, "0");
    const dd = String(dateVal.day).padStart(2, "0");
    if (!showTime) return `${yyyy}-${mm}-${dd}`;
    const [hh, mi] = (time || "00:00").split(":").map((s) => s.padStart(2, "0"));
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  function handleCalendarChange(newDate) {
    if (!newDate) return;
    const iso = buildIsoString(newDate, timeStr);
    onchange(iso);
    if (!showTime) open = false;
  }

  function handleTimeChange(e) {
    const t = e.currentTarget.value;
    const base = calValue ?? new CalendarDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    const iso = buildIsoString(base, t);
    onchange(iso);
  }
</script>

<Popover bind:open>
  <PopoverTrigger
    {disabled}
    data-new-row-input={colName}
    onfocus={onfocus}
    class={cn(
      "flex w-full items-center gap-1.5 rounded bg-transparent font-mono text-ui-sm outline-none",
      !parsed && "text-muted-foreground/50",
      disabled && "opacity-50 pointer-events-none"
    )}
  >
    <CalendarIcon class="size-3 shrink-0 text-muted-foreground/60" />
    <span class="truncate">{displayLabel}</span>
  </PopoverTrigger>
  <PopoverContent class="w-auto" align="start">
    <Calendar
      value={calValue}
      onValueChange={handleCalendarChange}
    />
    {#if showTime}
      <div class="border-t border-border/30 px-3 pb-3 pt-2">
        <p class="mb-1.5 text-[11px] text-muted-foreground">Time</p>
        <input
          type="time"
          value={timeStr}
          oninput={handleTimeChange}
          class="w-full rounded-md border border-border/40 bg-muted/30 px-2 py-1 font-mono text-[13px] text-foreground outline-none focus:border-primary/60 focus:ring-0"
        />
      </div>
    {/if}
  </PopoverContent>
</Popover>
