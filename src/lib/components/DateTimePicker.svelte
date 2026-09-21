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
   * @property {(e: KeyboardEvent) => void} [onkeydown]
   * @property {HTMLInputElement | null} [inputRef]
   * @property {boolean} [iconTrailing]
   */
  import { Popover, PopoverTrigger, PopoverContent } from "$lib/components/ui/popover/index.js";
  import { Calendar } from "$lib/components/ui/calendar/index.js";
  import { CalendarDate, parseDate, toCalendarDate } from "@internationalized/date";
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import { cn } from "$lib/utils.js";

  let {
    value = $bindable(""),
    /** A committed value: a calendar pick, a time change, or "now". */
    onchange,
    /**
     * A keystroke in the text field. Split from `onchange` because a caller may
     * want to COMMIT on a pick but only stage on typing - the grid's inline cell
     * editor does exactly that, and while both went through `onchange` it
     * committed after the first character and tore its own editor down, so the
     * field accepted exactly one keypress. Defaults to `onchange` so callers
     * that genuinely want both are unaffected.
     */
    oninput = undefined,
    /**
     * Keys the picker does not claim itself (Enter, Tab, Ctrl+Backspace) go
     * back to the caller, so an inline grid editor keeps its own commit and
     * cancel keys while the field still owns ArrowDown and Escape.
     */
    onkeydown: onKeyDown = undefined,
    /** The text field itself, for a caller that focuses or selects it. */
    inputRef = $bindable(null),
    /**
     * Cell-editor trim: the calendar button sits after the value rather than
     * before it, so the text stays on the x the canvas drew it at.
     */
    iconTrailing = false,
    class: className = "",
    inputClass = "",
    inputStyle = "",
    showTime = true,
    disabled = false,
    colName,
    onfocus,
  } = $props();
  const onType = $derived(oninput ?? onchange);

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

  /**
   * The fields of a timestamp, read straight out of its text.
   *
   * Deliberately textual rather than via `new Date`. A database timestamp is a
   * wall clock plus, sometimes, an offset - and the user is editing those
   * digits, not an instant. Going through a local `Date` rendered
   * `2026-05-22 11:28:40.501 UTC` in the machine's own zone and dropped the
   * offset, so every edit moved the value. It also could not parse that string
   * at all: the old code appended `T00:00:00` to anything without a `T`, making
   * `…501 UTCT00:00:00`, an Invalid Date - which is why the calendar said
   * "Pick a date…" and the hour and minute boxes both read 00 for a row that
   * plainly held a time.
   *
   * `second`, `fraction` and `zone` are carried untouched so a date pick cannot
   * spend precision the picker never showed.
   */
  const ISO_PARTS_RE =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(\.\d+)?\s*(Z|UTC|GMT|[+-]\d{2}(?::?\d{2})?)?)?$/i;

  const parts = $derived.by(() => {
    const s = String(value ?? "").trim();
    if (!s) return null;

    // An epoch is a true instant, so it does go through a Date - in local time,
    // which is the zone its hour and minute boxes are showing.
    if (valueFormat === "epoch-ms" || valueFormat === "epoch-s") {
      const n = Number(s);
      if (!Number.isFinite(n)) return null;
      const d = new Date(valueFormat === "epoch-s" ? n * 1000 : n);
      if (isNaN(d.getTime())) return null;
      return {
        year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
        hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds(),
        fraction: "", zone: "",
      };
    }

    const m = ISO_PARTS_RE.exec(s);
    if (!m) return null;
    return {
      year: Number(m[1]), month: Number(m[2]), day: Number(m[3]),
      hour: Number(m[4] ?? 0), minute: Number(m[5] ?? 0), second: Number(m[6] ?? 0),
      fraction: m[7] ?? "",
      zone: m[8] ?? "",
    };
  });

  const calValue = $derived.by(() => {
    if (!parts) return undefined;
    try {
      return new CalendarDate(parts.year, parts.month, parts.day);
    } catch {
      return undefined;
    }
  });

  const timeStr = $derived(
    parts
      ? `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
      : "00:00",
  );

  const hourVal = $derived(parts ? parts.hour : 0);
  const minVal = $derived(parts ? parts.minute : 0);

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
    if (!parts) return "Pick a date…";
    const date = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    return showTime ? `${date}  ${timeStr}${parts.zone ? ` ${parts.zone}` : ""}` : date;
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
      const fractionMs = parts?.fraction ? Math.round(Number(parts.fraction) * 1000) : 0;
      const ms = new Date(
        Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi),
        parts?.second ?? 0, fractionMs,
      ).getTime();
      return String(valueFormat === "epoch-s" ? Math.floor(ms / 1000) : ms);
    }
    if (!showTime) return `${yyyy}-${mm}-${dd}`;
    // Seconds, fractional seconds and the offset ride along untouched, for the
    // same reason the epoch branch carries them: picking a date must change the
    // date, not the column's precision or its zone.
    const ss = String(parts?.second ?? 0).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${parts?.fraction ?? ""}${parts?.zone ?? ""}`;
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
  <div class={cn("relative flex w-full min-w-0 items-center gap-1.5", className)}>
    <!-- Anchor only: it spans the field so the calendar lines up with it, and
         takes no pointer events so the input keeps every click. -->
    <PopoverTrigger tabindex={-1} aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10" />
    {#snippet calendarButton()}
      <button
        type="button"
        {disabled}
        tabindex={-1}
        aria-label="Open calendar"
        class="inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        onclick={() => (open = !open)}
      >
        <CalendarIcon class="size-3" />
      </button>
    {/snippet}
    {#if !iconTrailing}{@render calendarButton()}{/if}
    <input
      type="text"
      bind:this={inputRef}
      {disabled}
      data-new-row-input={colName}
      value={value ?? ""}
      placeholder={showTime ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD"}
      autocomplete="off"
      spellcheck="false"
      title={parts ? displayLabel : undefined}
      class={cn(
        "w-full min-w-0 bg-transparent font-mono text-ui-sm text-foreground outline-none",
        "placeholder:text-muted-foreground disabled:opacity-50",
        inputClass,
      )}
      style={inputStyle}
      oninput={(e) => onType(e.currentTarget.value)}
      onfocus={onfocus}
      onkeydown={(e) => {
        // The calendar is opt-in from the keyboard too, and Escape closes it
        // without the keystroke escaping to the row's cancel handler.
        if (e.key === "ArrowDown" && !open) { e.preventDefault(); open = true; return }
        if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); open = false; return }
        // Everything else is the caller's: without this the grid's inline editor
        // never saw Enter or Tab, so a typed timestamp could not be committed.
        onKeyDown?.(e);
      }}
    />
    {#if iconTrailing}{@render calendarButton()}{/if}
  </div>
  <PopoverContent class="w-auto" align="start">
    <Calendar
      value={calValue}
      onValueChange={handleCalendarChange}
    />
    {#if showTime}
      <div class="border-t border-border/20 px-3 pb-3 pt-2.5">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-ui-2xs font-medium text-muted-foreground uppercase tracking-wider">Time</span>
          <button
            type="button"
            onclick={setNow}
            class="rounded px-1.5 py-0.5 text-ui-2xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
          <span class="shrink-0 font-mono text-ui font-bold text-muted-foreground">:</span>
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
