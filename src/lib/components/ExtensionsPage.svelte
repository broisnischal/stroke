<script>
  import { cn } from "$lib/utils.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { EXTENSIONS } from "$lib/plugins/registry.js";
  import {
    pluginState,
    pluginEnabledIn,
    setPluginEnabled,
    setPluginConfig,
  } from "$lib/stores/plugins.js";
  import { TIMEZONE_OPTIONS } from "$lib/plugins/extensions/better-time.js";
  import { CURRENCIES } from "$lib/plugins/extensions/money-format.js";
  import { DEFAULT_RULES } from "$lib/plugins/extensions/linkify.js";
  import Clock from "@lucide/svelte/icons/clock";
  import Hash from "@lucide/svelte/icons/hash";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import Wand2 from "@lucide/svelte/icons/wand-2";
  import Blocks from "@lucide/svelte/icons/blocks";
  import DollarSign from "@lucide/svelte/icons/dollar-sign";
  import Timer from "@lucide/svelte/icons/timer";
  import Tag from "@lucide/svelte/icons/tag";
  import ToggleLeft from "@lucide/svelte/icons/toggle-left";
  import Palette from "@lucide/svelte/icons/palette";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import Globe from "@lucide/svelte/icons/globe";
  import Flame from "@lucide/svelte/icons/flame";
  import ShieldAlert from "@lucide/svelte/icons/shield-alert";
  import Link2 from "@lucide/svelte/icons/link-2";
  import BarChart3 from "@lucide/svelte/icons/bar-chart-3";
  import Plus from "@lucide/svelte/icons/plus";
  import X from "@lucide/svelte/icons/x";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Bookmark from "@lucide/svelte/icons/bookmark";
  import Replace from "@lucide/svelte/icons/replace";

  const ICONS = {
    "better-time": Clock,
    "money-format": DollarSign,
    "number-format": Hash,
    "duration-format": Timer,
    "status-badge": Tag,
    "boolean-glyph": ToggleLeft,
    "color-swatch": Palette,
    "mask-sensitive": EyeOff,
    "smart-text": Globe,
    heatmap: Flame,
    validators: ShieldAlert,
    linkify: Link2,
    "column-annotator": BarChart3,
    "id-generators": Sparkles,
    "cell-transforms": Wand2,
    "saved-views": Bookmark,
    "find-replace": Replace,
  };

  const SECTIONS = [
    { title: "Workflow", kinds: ["workflow"] },
    { title: "Formatters", kinds: ["formatter"] },
    { title: "Links & annotations", kinds: ["linkify", "annotator"] },
    { title: "Cell tools", kinds: ["generators", "transforms"] },
  ];

  const KIND_LABEL = {
    formatter: "Display formatter",
    linkify: "Linkifier",
    annotator: "Column annotator",
    generators: "Value generator",
    transforms: "Cell transform",
    workflow: "Workflow feature",
  };

  const CONFIGURABLE = new Set([
    "better-time", "number-format", "money-format", "duration-format",
    "boolean-glyph", "mask-sensitive", "heatmap", "linkify",
  ]);

  // Short "how to use" steps, keyed by extension kind.
  const USAGE = {
    formatter: [
      "Toggle it on.",
      "Open any table — matching cells restyle automatically.",
      "Data is never changed; hover a cell to see the raw value.",
    ],
    generators: [
      "Open an editable table (one with a primary key).",
      "Right-click a cell → Insert generated value.",
      "Pick a generator, then Save the staged edit.",
    ],
    transforms: [
      "Right-click any cell → Transform.",
      "Choose a conversion that fits the value.",
      "The result is copied to your clipboard.",
    ],
    linkify: [
      "Add pattern → URL rules below.",
      "Open a table; matching IDs become links.",
      "Click a linked cell to open its URL.",
    ],
    annotator: [
      "Toggle it on.",
      "A distribution strip appears under each column header.",
    ],
  };

  // Per-extension usage overrides (workflow features differ too much to share).
  const USAGE_BY_ID = {
    "saved-views": [
      "Open a table and set up filters, sort, search, hidden columns or a view mode.",
      "Click the bookmark icon in the table toolbar → name it → Save.",
      "Switch views from the same menu — each table keeps its own list.",
    ],
    "find-replace": [
      "Open a table, then choose Find & replace… from the toolbar's ⋯ menu.",
      "Pick a column, a match mode (contains / exact / regex) and a replacement.",
      "Review the full before → after preview, then apply — nothing is written blind.",
    ],
  };

  /** null → grid overview; an id → drilled into that extension's detail page. */
  let selectedId = $state(/** @type {string | null} */ (null));
  const selected = $derived(selectedId ? (EXTENSIONS.find((e) => e.id === selectedId) ?? null) : null);
  const enabledCount = $derived(EXTENSIONS.filter((e) => pluginEnabledIn($pluginState, e.id)).length);

  /** @param {string} id */
  function isOn(id) {
    return pluginEnabledIn($pluginState, id);
  }
  /** @param {string} id @param {Record<string, unknown>} defaults */
  function cfg(id, defaults) {
    return { ...defaults, ...($pluginState.config[id] ?? {}) };
  }

  const tzLabel = (id) =>
    TIMEZONE_OPTIONS.find((t) => t.value === cfg(id, { timeZone: "local" }).timeZone)?.label ??
    "Local (system)";

  const DURATION_UNITS = [
    { value: "auto", label: "Auto (by name)" },
    { value: "ms", label: "Milliseconds" },
    { value: "s", label: "Seconds" },
  ];
  const HEAT_PALETTES = [
    { value: "blue", label: "Blue" },
    { value: "heat", label: "Heat (green→red)" },
    { value: "green", label: "Green" },
  ];

  // ── Linkifier rules editor ──────────────────────────────────────────────
  function rulesOf() {
    const r = $pluginState.config["linkify"]?.rules;
    return Array.isArray(r) ? r : DEFAULT_RULES;
  }
  function setRules(rules) { setPluginConfig("linkify", { rules }); }
  function updateRule(i, patch) { setRules(rulesOf().map((r, idx) => (idx === i ? { ...r, ...patch } : r))); }
  function addRule() { setRules([...rulesOf(), { pattern: "", template: "" }]); }
  function removeRule(i) { setRules(rulesOf().filter((_, idx) => idx !== i)); }

  const selTrigger =
    "h-7 w-[12rem] justify-between gap-2 border-border/70 bg-background px-2.5 text-xs font-normal shadow-none";
  const ruleInput =
    "h-7 min-w-0 rounded-md border border-border/70 bg-background px-2.5 font-mono text-[12px] text-foreground outline-none focus:border-primary/60";
</script>

<!-- Compact Linear/Resend-style toggle -->
{#snippet toggle(on, onclick, label)}
  <button
    type="button"
    role="switch"
    aria-label={label}
    aria-checked={on}
    {onclick}
    class={cn(
      // before: expands the hit area beyond the 18px visual without moving neighbors
      "group/toggle relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full before:absolute before:-inset-1 before:content-[''] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
      "transition-[background-color] duration-150",
      // Inset rim defines the pill edge on dark surfaces; inner shadow gives the
      // trough depth so the knob reads as sitting *in* the track, not on it.
      "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07),inset_0_1px_2px_rgba(0,0,0,0.2)]",
      // Emerald = the app's "extension enabled" signal (matches the card icon
      // tint); bg-primary is near-white on Studio themes and swallowed the knob.
      on ? "bg-emerald-600 dark:bg-emerald-500" : "bg-muted-foreground/25 hover:bg-muted-foreground/35",
    )}
  >
    <span
      class={cn(
        // iOS-style press feedback: the knob stretches along the travel axis
        // while staying anchored to its end of the track.
        "pointer-events-none block h-3.5 w-3.5 rounded-full bg-white",
        "shadow-[0_1px_2px_rgba(0,0,0,0.28),0_0_1px_rgba(0,0,0,0.16)]",
        "transition-[translate,width] duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)]",
        "group-active/toggle:w-4",
        on ? "translate-x-4 group-active/toggle:translate-x-3.5" : "translate-x-0.5",
      )}
    ></span>
  </button>
{/snippet}

{#snippet settingRow(label, hint, control)}
  <div class="flex items-center justify-between gap-4 py-2.5">
    <div class="flex min-w-0 flex-col">
      <span class="text-[13px] text-foreground">{label}</span>
      {#if hint}<span class="mt-0.5 text-[11.5px] text-muted-foreground/70">{hint}</span>{/if}
    </div>
    {@render control()}
  </div>
{/snippet}

<!-- Group label + hairline-bordered list -->
{#snippet sectionLabel(text)}
  <h3 class="mb-2 px-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/50">{text}</h3>
{/snippet}

<div class="app-scroll min-h-0 flex-1 overflow-y-auto bg-background">
  {#if !selected}
    <!-- ── Grid overview ─────────────────────────────────────────────────── -->
    <div class="mx-auto w-full max-w-[52rem] px-8 py-8">
      <div class="flex items-center gap-2.5">
        <span class="grid size-6 shrink-0 place-items-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground">
          <Blocks class="size-3.5" />
        </span>
        <h1 class="text-[15px] font-semibold tracking-tight text-foreground">Extensions</h1>
        <span
          class="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
          title="{enabledCount} of {EXTENSIONS.length} extensions enabled"
        >
          {#if enabledCount > 0}<span class="size-1.5 rounded-full bg-emerald-500"></span>{/if}
          {enabledCount} on
        </span>
      </div>
      <p class="mt-1.5 text-[12.5px] text-muted-foreground">
        Display formatters, linkifiers and cell tools for the data grid. Click a card to configure it.
      </p>

      {#each SECTIONS as section (section.title)}
        {@const items = EXTENSIONS.filter((e) => section.kinds.includes(e.kind))}
        <h3 class="mb-2.5 mt-7 px-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/50">{section.title}</h3>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {#each items as ext (ext.id)}
            {@const Icon = ICONS[ext.id]}
            {@const on = isOn(ext.id)}
            <div class="relative">
              <button
                type="button"
                onclick={() => (selectedId = ext.id)}
                class="group relative flex h-full w-full flex-col gap-3 rounded-lg border border-border/60 bg-card p-3 text-left transition-[border-color,background-color] hover:border-border hover:bg-accent/40"
              >
                {#if Icon}
                  <Icon class={cn("size-4 shrink-0 transition-colors", on ? "text-emerald-500" : "text-muted-foreground group-hover:text-foreground")} />
                {/if}
                <span class="mt-auto flex min-w-0 flex-col">
                  <span class="truncate text-[12.5px] font-medium leading-tight text-foreground/85 transition-colors group-hover:text-foreground">{ext.name}</span>
                  <span class="mt-0.5 truncate text-[10.5px] text-muted-foreground/60">{KIND_LABEL[ext.kind] ?? "Extension"}</span>
                </span>
              </button>
              <!-- Toggle overlays the card so it isn't a nested button -->
              <div class="absolute right-3 top-3">
                {@render toggle(on, () => setPluginEnabled(ext.id, !on), `Toggle ${ext.name}`)}
              </div>
            </div>
          {/each}
        </div>
      {/each}
    </div>
  {:else}
    <!-- ── Detail (drill-in) ─────────────────────────────────────────────── -->
    {#key selected.id}
      {@const Icon = ICONS[selected.id]}
      {@const on = isOn(selected.id)}
      <div class="mx-auto w-full max-w-[42rem] px-8 py-6">
        <button
          type="button"
          class="-ml-1.5 mb-4 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground transition-[background-color,color] hover:bg-muted/50 hover:text-foreground"
          onclick={() => (selectedId = null)}
        >
          <ArrowLeft class="size-3.5" />
          All extensions
        </button>
        <!-- Header card — the icon tile carries the on/off state (emerald when
             enabled), so the card and toggle stay quiet. One signal, not four. -->
        <div class="rounded-xl border border-border/60 bg-card/40 p-4">
          <div class="flex items-start gap-3.5">
            <span
              class={cn(
                "grid size-10 shrink-0 place-items-center rounded-lg border transition-colors",
                on ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "border-border/60 bg-muted/40 text-muted-foreground",
              )}
            >
              {#if Icon}<Icon class="size-5" />{/if}
            </span>
            <div class="min-w-0 flex-1 pt-0.5">
              <h2 class="text-[15px] font-semibold tracking-tight text-foreground">{selected.name}</h2>
              <p class="mt-0.5 text-[11.5px] text-muted-foreground">{KIND_LABEL[selected.kind] ?? "Extension"}</p>
            </div>
            {@render toggle(on, () => setPluginEnabled(selected.id, !on), `Toggle ${selected.name}`)}
          </div>
          <p class="mt-3 text-[13px] leading-relaxed text-muted-foreground">{selected.description}</p>
        </div>

        <!-- How to use -->
        {#if USAGE_BY_ID[selected.id] ?? USAGE[selected.kind]}
          <div class="mt-7">
            {@render sectionLabel("How to use")}
            <ol class="space-y-2">
              {#each USAGE_BY_ID[selected.id] ?? USAGE[selected.kind] as step, i (i)}
                <li class="flex items-start gap-2.5">
                  <span class="mt-px grid size-4 shrink-0 place-items-center rounded-full border border-border/60 text-[9px] font-semibold text-muted-foreground/70">{i + 1}</span>
                  <span class="text-[12.5px] leading-relaxed text-foreground/75">{step}</span>
                </li>
              {/each}
            </ol>
          </div>
        {/if}

        <!-- Available generators / conversions -->
        {#if selected.kind === "generators" || selected.kind === "transforms"}
          {@const list = selected.kind === "generators" ? selected.generators : selected.transforms}
          <div class="mt-7">
            {@render sectionLabel(selected.kind === "generators" ? "Generators" : "Conversions")}
            <ul class="overflow-hidden rounded-lg border border-border/50">
              {#each list as it, i (it.id)}
                <li class="flex items-center gap-3 px-3 py-2 {i > 0 ? 'border-t border-border/40' : ''}">
                  <span class="min-w-0 shrink-0 text-[13px] text-foreground/85">{it.label}</span>
                  {#if it.hint}<span class="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground/55">{it.hint}</span>{:else}<span class="flex-1"></span>{/if}
                  <span class="shrink-0 rounded border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground/50">{selected.kind === "generators" ? "Insert" : "Copy"}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        <!-- Settings -->
        {#if CONFIGURABLE.has(selected.id)}
          <div class="mt-7">
            {@render sectionLabel("Settings")}
            <div class="rounded-lg border border-border/50 px-3.5 [&>*]:border-border/40 [&>*+*]:border-t">
              {#if selected.id === "better-time"}
                {@const c = cfg(selected.id, { mode: "absolute", timeZone: "local" })}
                {#snippet tzControl()}
                  <Select.Root type="single" value={c.timeZone} onValueChange={(v) => v && setPluginConfig(selected.id, { timeZone: v })}>
                    <Select.Trigger size="sm" class={selTrigger} aria-label="Timezone"><span class="truncate">{tzLabel(selected.id)}</span></Select.Trigger>
                    <Select.Content class="z-[120] max-h-[18rem] min-w-[12rem] p-1" sideOffset={6}>
                      {#each TIMEZONE_OPTIONS as tz (tz.value)}<Select.Item value={tz.value} label={tz.label} class="rounded-md py-1.5 pl-2 text-xs">{tz.label}</Select.Item>{/each}
                    </Select.Content>
                  </Select.Root>
                {/snippet}
                {#snippet relControl()}{@render toggle(c.mode === "relative", () => setPluginConfig(selected.id, { mode: c.mode === "relative" ? "absolute" : "relative" }), "Toggle relative time")}{/snippet}
                {@render settingRow("Timezone", "Render timestamps in this zone", tzControl)}
                {@render settingRow("Relative time", 'Show "3 hours ago" instead of a date', relControl)}
              {:else if selected.id === "number-format"}
                {@const c = cfg(selected.id, { mode: "thousands" })}
                {#snippet ctl()}{@render toggle(c.mode === "compact", () => setPluginConfig(selected.id, { mode: c.mode === "compact" ? "thousands" : "compact" }), "Toggle compact")}{/snippet}
                {@render settingRow("Compact notation", "1,234,000 → 1.2M", ctl)}
              {:else if selected.id === "money-format"}
                {@const c = cfg(selected.id, { currency: "USD", minorUnits: false })}
                {#snippet curCtl()}
                  <Select.Root type="single" value={c.currency} onValueChange={(v) => v && setPluginConfig(selected.id, { currency: v })}>
                    <Select.Trigger size="sm" class={selTrigger} aria-label="Currency"><span class="truncate">{c.currency}</span></Select.Trigger>
                    <Select.Content class="z-[120] max-h-[18rem] min-w-[8rem] p-1" sideOffset={6}>
                      {#each CURRENCIES as cur (cur)}<Select.Item value={cur} label={cur} class="rounded-md py-1.5 pl-2 text-xs">{cur}</Select.Item>{/each}
                    </Select.Content>
                  </Select.Root>
                {/snippet}
                {#snippet centsCtl()}{@render toggle(c.minorUnits === true, () => setPluginConfig(selected.id, { minorUnits: !c.minorUnits }), "Toggle minor units")}{/snippet}
                {@render settingRow("Currency", null, curCtl)}
                {@render settingRow("Stored as cents", "Divide by 100 before formatting", centsCtl)}
              {:else if selected.id === "duration-format"}
                {@const c = cfg(selected.id, { unit: "auto" })}
                {#snippet ctl()}
                  <Select.Root type="single" value={c.unit} onValueChange={(v) => v && setPluginConfig(selected.id, { unit: v })}>
                    <Select.Trigger size="sm" class={selTrigger} aria-label="Duration unit"><span class="truncate">{DURATION_UNITS.find((u) => u.value === c.unit)?.label ?? "Auto"}</span></Select.Trigger>
                    <Select.Content class="z-[120] min-w-[12rem] p-1" sideOffset={6}>
                      {#each DURATION_UNITS as u (u.value)}<Select.Item value={u.value} label={u.label} class="rounded-md py-1.5 pl-2 text-xs">{u.label}</Select.Item>{/each}
                    </Select.Content>
                  </Select.Root>
                {/snippet}
                {@render settingRow("Source unit", "How the stored number is interpreted", ctl)}
              {:else if selected.id === "boolean-glyph"}
                {@const c = cfg(selected.id, { style: "dot" })}
                {#snippet ctl()}{@render toggle(c.style === "check", () => setPluginConfig(selected.id, { style: c.style === "check" ? "dot" : "check" }), "Toggle glyph style")}{/snippet}
                {@render settingRow("Use ✓ / ✗", "Instead of a colored dot", ctl)}
              {:else if selected.id === "mask-sensitive"}
                {@const c = cfg(selected.id, { revealOnHover: true })}
                {#snippet ctl()}{@render toggle(c.revealOnHover !== false, () => setPluginConfig(selected.id, { revealOnHover: c.revealOnHover === false }), "Toggle reveal on hover")}{/snippet}
                {@render settingRow("Reveal on hover", "Show the real value while hovering the cell", ctl)}
              {:else if selected.id === "heatmap"}
                {@const c = cfg(selected.id, { palette: "blue" })}
                {#snippet ctl()}
                  <Select.Root type="single" value={c.palette} onValueChange={(v) => v && setPluginConfig(selected.id, { palette: v })}>
                    <Select.Trigger size="sm" class={selTrigger} aria-label="Heatmap palette"><span class="truncate">{HEAT_PALETTES.find((p) => p.value === c.palette)?.label ?? "Blue"}</span></Select.Trigger>
                    <Select.Content class="z-[120] min-w-[12rem] p-1" sideOffset={6}>
                      {#each HEAT_PALETTES as p (p.value)}<Select.Item value={p.value} label={p.label} class="rounded-md py-1.5 pl-2 text-xs">{p.label}</Select.Item>{/each}
                    </Select.Content>
                  </Select.Root>
                {/snippet}
                {@render settingRow("Palette", "Color scale for the value gradient", ctl)}
              {:else if selected.id === "linkify"}
                <div class="py-3">
                  <p class="text-[12px] leading-relaxed text-muted-foreground/80">
                    When a cell matches a <span class="font-mono text-foreground/80">pattern</span> (regex), clicking it opens the
                    <span class="font-mono text-foreground/80">template</span>. Use <span class="font-mono text-foreground/80">{"{value}"}</span> for the cell value.
                  </p>
                  <div class="mt-3 space-y-2">
                    {#each rulesOf() as rule, i (i)}
                      <div class="grid grid-cols-[9rem_1fr_auto] items-center gap-2">
                        <input class={ruleInput} placeholder="^cus_" value={rule.pattern} oninput={(e) => updateRule(i, { pattern: e.currentTarget.value })} />
                        <input class={ruleInput} placeholder={"https://…/{value}"} value={rule.template} oninput={(e) => updateRule(i, { template: e.currentTarget.value })} />
                        <button type="button" class="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Remove rule" onclick={() => removeRule(i)}>
                          <X class="size-3.5" />
                        </button>
                      </div>
                    {/each}
                  </div>
                  <button type="button" class="mt-2.5 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground hover:text-foreground" onclick={addRule}>
                    <Plus class="size-3.5" /> Add rule
                  </button>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/key}
  {/if}
</div>
