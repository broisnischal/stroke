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

  // Which wire format the incoming value is in. An edit has to write the column
  // back in the format it already stores: a `created_at` column holding Unix
  // millis (as text or an integer) must not come back as "2026-07-30T12:34", and
  // a seconds column must not silently gain three digits.
  const valueFormat = $derived.by(() => {
    const s = String(value ?? "").trim();
    if (/^-?\d{11,}$/.test(s)) return "epoch-ms";
    if (/^-?\d{9,10}$/.test(s)) return "epoch-s";
    return "iso";
  });

  // Parse the current string value into date parts
  const parsed = $derived.by(() => {
    const s = String(value ?? "").trim();
    if (!s) return null;
    try {
      // Epoch numbers are not parseable as `s + "T00:00:00"` - that produced an
      // Invalid Date, so the calendar rendered "Pick a date…" for a row that
      // plainly held a timestamp, and picking a date overwrote it with ISO text.
      if (valueFormat === "epoch-ms" || valueFormat === "epoch-s") {
        const n = Number(s);
        if (!Number.isFinite(n)) return null;
        const d = new Date(valueFormat === "epoch-s" ? n * 1000 : n);
        return isNaN(d.getTime()) ? null : d;
      }
      const d = new Date(s.includes("T") ? s : s + "T00:00:00");
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

  /**
   * Serialise a picked date back into the format the column already stores -
   * see `valueFormat`. Emitting ISO into an epoch column is a silent data
   * corruption: the write succeeds and the timestamp is destroyed.
   */
  function buildIsoString(dateVal, time) {
    if (!dateVal) return "";
    const yyyy = String(dateVal.year).padStart(4, "0");
    const mm = String(dateVal.month).padStart(2, "0");
    const dd = String(dateVal.day).padStart(2, "0");
    const [hh, mi] = (time || "00:00").split(":").map((s) => s.padStart(2, "0"));
    if (valueFormat === "epoch-ms" || valueFormat === "epoch-s") {
      // An epoch always carries a time component, so honour hh:mm even when the
      // picker is in date-only mode. Seconds/millis are carried over from the
      // stored value rather than zeroed - the picker only edits down to the
      // minute, so it must not quietly drop precision it never showed.
      const ms = new Date(
        Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi),
        parsed?.getSeconds() ?? 0, parsed?.getMilliseconds() ?? 0,
      ).getTime();
      return String(valueFormat === "epoch-s" ? Math.floor(ms / 1000) : ms);
    }
    if (!showTime) return `${yyyy}-${mm}-${dd}`;
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
  <!-- Type or pick, not one or the other. A calendar is the wrong tool for
       "same as the row above but a year earlier", and typing is the wrong tool
       for "some Tuesday in March" - the field does both, and the value is the
       column's own text either way, so an epoch column stays editable as digits
       rather than being hidden behind a formatted label. -->
  <div class="relative flex w-full min-w-0 items-center gap-1.5">
    <!-- Anchor only: it spans the field so the calendar lines up with it, and
         takes no pointer events so the input keeps every click. -->
    <PopoverTrigger tabindex={-1} aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10" />
    <button
      type="button"
      {disabled}
      tabindex={-1}
      aria-label="Open calendar"
      class="inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground disabled:opacity-50"
      onclick={() => (open = !open)}
    >
      <CalendarIcon class="size-3" />
    </button>
    <input
      type="text"
      {disabled}
      data-new-row-input={colName}
      value={value ?? ""}
      placeholder={showTime ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD"}
      autocomplete="off"
      spellcheck="false"
      title={parsed ? displayLabel : undefined}
      class={cn(
        "w-full min-w-0 bg-transparent font-mono text-ui-sm text-foreground outline-none",
        "placeholder:text-muted-foreground/40 disabled:opacity-50",
      )}
      oninput={(e) => onchange(e.currentTarget.value)}
      onfocus={onfocus}
      onkeydown={(e) => {
        // The calendar is opt-in from the keyboard too, and Escape closes it
        // without the keystroke escaping to the row's cancel handler.
        if (e.key === "ArrowDown" && !open) { e.preventDefault(); open = true }
        else if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); open = false }
      }}
    />
  </div>
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
