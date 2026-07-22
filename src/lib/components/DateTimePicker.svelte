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

  const hourVal = $derived(parsed ? parsed.getHours() : 0);
  const minVal = $derived(parsed ? parsed.getMinutes() : 0);

  function handleHourChange(e) {
    const h = Math.max(0, Math.min(23, parseInt(e.currentTarget.value) || 0));
    const base = calValue ?? new CalendarDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    const m = String(minVal).padStart(2, "0");
    onchange(buildIsoString(base, `${String(h).padStart(2, "0")}:${m}`));
  }

  function handleMinChange(e) {
    const m = Math.max(0, Math.min(59, parseInt(e.currentTarget.value) || 0));
    const base = calValue ?? new CalendarDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    const h = String(hourVal).padStart(2, "0");
    onchange(buildIsoString(base, `${h}:${String(m).padStart(2, "0")}`));
  }

  function setNow() {
    const now = new Date();
    const d = new CalendarDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    onchange(buildIsoString(d, `${h}:${m}`));
  }

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
      <div class="border-t border-border/20 px-3 pb-3 pt-2.5">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-ui-2xs font-medium text-muted-foreground/70 uppercase tracking-wider">Time</span>
          <button
            type="button"
            onclick={setNow}
            class="rounded px-1.5 py-0.5 text-ui-2xs text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
          >Now</button>
        </div>
        <div class="flex items-center gap-1.5">
          <div class="flex flex-1 items-center overflow-hidden rounded-md border border-border/40 bg-muted/20 focus-within:border-primary/50">
            <input
              type="number"
              min="0"
              max="23"
              value={hourVal}
              oninput={handleHourChange}
              class="no-focus-ring w-full bg-transparent px-2 py-1.5 text-center font-mono text-ui-sm text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              placeholder="HH"
            />
          </div>
          <span class="shrink-0 font-mono text-ui font-bold text-muted-foreground/50">:</span>
          <div class="flex flex-1 items-center overflow-hidden rounded-md border border-border/40 bg-muted/20 focus-within:border-primary/50">
            <input
              type="number"
              min="0"
              max="59"
              value={minVal}
              oninput={handleMinChange}
              class="no-focus-ring w-full bg-transparent px-2 py-1.5 text-center font-mono text-ui-sm text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              placeholder="MM"
            />
          </div>
        </div>
      </div>
    {/if}
  </PopoverContent>
</Popover>
