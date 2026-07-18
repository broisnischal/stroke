<script>
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import ThemeSwatch from "$lib/components/ThemeSwatch.svelte";
  import { getThemeDefinition, themesByGroup } from "$lib/themes/registry.js";
  import { t, locale, LOCALES, setLocale } from "$lib/i18n.js";
  import { licenseStatus } from "$lib/stores/license.js";
  import {
    appThemeId,
    loadSettings,
    updateSettings,
    increaseZoom,
    decreaseZoom,
    resetZoom,
    canIncreaseZoom,
    canDecreaseZoom,
    FONT_PRESETS,
    ICON_STYLES,
    ICON_SETS,
    TABLE_STYLES,
    DEFAULT_MAX_QUERY_HISTORY,
    DEFAULT_CONNECT_TIMEOUT_MS,
    DEFAULT_SOCKET_TIMEOUT_MS,
    DEFAULT_MAX_ALLOWED_PACKET,
    DEFAULT_SESSION_TIMEZONE,
  } from "$lib/stores/settings.js";
  import PenTool from "@lucide/svelte/icons/pen-tool";
  import LucideSearch from "@lucide/svelte/icons/search";
  import LucideSparkles from "@lucide/svelte/icons/sparkles";
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { Search01Icon, SparklesIcon } from "@hugeicons/core-free-icons";
  import PhosphorSparkle from "phosphor-svelte/lib/Sparkle";
  import Icon from "./Icon.svelte";
  import { cn } from "$lib/utils.js";
  import {
    enableAutostart,
    disableAutostart,
    getAutostartStatus,
  } from "$lib/api.js";

  let {
    open = $bindable(false),
    onopenmcp = () => {},
    onopenmodelconfiguration = () => {},
    onopenabout = () => {},
    onopenextensions = () => {},
    onopenlicense = () => {},
  } = $props();

  let settings = $state(loadSettings());

  // ── Category navigation + search ─────────────────────────────────────────
  const CATEGORIES = [
    { id: 'general',      label: 'General',      icon: 'sliders-horizontal' },
    { id: 'database',     label: 'Database',     icon: 'database' },
    { id: 'appearance',   label: 'Appearance',   icon: 'sparkles' },
    { id: 'integrations', label: 'Integrations', icon: 'blocks' },
    { id: 'about',        label: 'About',        icon: 'info' },
  ];
  let category = $state('general');
  let query = $state('');
  const q = $derived(query.trim().toLowerCase());
  const searching = $derived(q.length > 0);
  /** Row visibility under the current search query. */
  const show = (/** @type {string} */ title, /** @type {string} */ desc = '') =>
    !q || `${title} ${desc}`.toLowerCase().includes(q);
  const activeCategory = $derived(CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0]);

  const themeGroups = $derived(themesByGroup());
  /** Kept in sync with applySettings / ⌘M via appThemeId store */
  const activeTheme = $derived(getThemeDefinition($appThemeId));

  $effect(() => {
    const id = $appThemeId;
    if (settings.theme !== id) {
      settings = { ...settings, theme: id };
    }
  });

  const themeSelectTrigger =
    "h-8 w-56 justify-between gap-2 border-border/70 bg-background px-2.5 text-ui-xs font-normal shadow-none";
  const rowCls = "flex items-center justify-between gap-6 border-t border-border/25 py-3.5 first:border-t-0";

  function refreshSettings() {
    settings = loadSettings();
  }

  /** @param {boolean} next */
  function handleOpenChange(next) {
    if (next) { refreshSettings(); category = 'general'; query = ''; }
  }

  /** @param {import('$lib/themes/registry.js').ThemeId} themeId */
  function setTheme(themeId) {
    if (themeId === $appThemeId) return;
    settings = updateSettings({ theme: themeId });
  }

  function bumpZoom(delta) {
    settings = delta > 0 ? increaseZoom() : decreaseZoom();
  }

  /** @param {import('$lib/stores/settings.js').FontId} font */
  function setFont(font) {
    if (font === settings.font) return;
    settings = updateSettings({ font });
  }
  const fontEntries = Object.entries(FONT_PRESETS);
  const iconStyleEntries = Object.entries(ICON_STYLES);
  const iconSetEntries = Object.entries(ICON_SETS);
  const tableStyleEntries = Object.entries(TABLE_STYLES);
  // Theme-aware CSS previews (mirror how each preset renders on the canvas grid).
  const tableStylePreview = {
    lines:   "background-image:linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px);background-size:7px 7px;",
    bordered:"background-image:linear-gradient(var(--muted-foreground) 1px,transparent 1px),linear-gradient(90deg,var(--muted-foreground) 1px,transparent 1px);background-size:7px 7px;",
    striped: "background-image:repeating-linear-gradient(var(--muted) 0 7px,transparent 7px 14px);",
    dotted:  "background-image:radial-gradient(color-mix(in oklab,var(--border) 90%,transparent) 0.7px,transparent 0.8px);background-size:4px 4px;",
    dots:    "background-image:radial-gradient(var(--muted-foreground) 1.1px,transparent 1.3px);background-size:9px 9px;background-position:center;",
    minimal: "background-image:linear-gradient(var(--border) 1px,transparent 1px);background-size:100% 7px;",
    dashed:  "background-image:repeating-linear-gradient(90deg,var(--border) 0 3px,transparent 3px 6px),repeating-linear-gradient(0deg,var(--border) 0 3px,transparent 3px 6px);background-size:100% 7px,7px 100%;background-repeat:repeat;",
    columns: "background-image:linear-gradient(90deg,var(--border) 1px,transparent 1px);background-size:7px 100%;",
  };

  /** @param {import('$lib/stores/settings.js').TableStyleId} tableStyle */
  function setTableStyle(tableStyle) {
    if (tableStyle === settings.tableStyle) return;
    settings = updateSettings({ tableStyle });
  }

  /** @param {import('$lib/stores/settings.js').IconStyleId} iconStyle */
  function setIconStyle(iconStyle) {
    if (iconStyle === settings.iconStyle) return;
    settings = updateSettings({ iconStyle });
  }

  /** @param {import('$lib/stores/settings.js').IconSetId} iconSet */
  function setIconSet(iconSet) {
    if (iconSet === settings.iconSet) return;
    settings = updateSettings({ iconSet });
  }

  function toggleMcpAutoStart() {
    settings = updateSettings({ mcpAutoStart: !settings.mcpAutoStart });
  }

  function toggleAutoReconnect() {
    settings = updateSettings({ autoReconnectOnStartup: !settings.autoReconnectOnStartup });
  }

  function togglePreviewDml() {
    settings = updateSettings({ previewDmlBeforeApply: !settings.previewDmlBeforeApply });
  }

  // ── Database (query & connection) numeric/text settings ──────────────────
  /** @param {keyof import('$lib/stores/settings.js').AppSettings} key @param {string|number} raw @param {number} def @param {number} min */
  function setNumber(key, raw, def, min = 0) {
    let n = Math.round(Number(raw));
    if (!Number.isFinite(n)) n = def;
    if (n < min) n = min;
    settings = updateSettings({ [key]: n });
  }
  /** @param {keyof import('$lib/stores/settings.js').AppSettings} key @param {string} raw @param {string} def */
  function setText(key, raw, def) {
    settings = updateSettings({ [key]: String(raw).trim() || def });
  }
  /** @param {keyof import('$lib/stores/settings.js').AppSettings} key @param {string|number} def */
  function resetField(key, def) {
    settings = updateSettings({ [key]: def });
  }

  const DATA_VIEW_OPTIONS = [
    { id: 'table',  label: 'Table',  icon: 'table-2' },
    { id: 'json',   label: 'JSON',   icon: 'braces' },
    { id: 'record', label: 'Record', icon: 'layout-list' },
    { id: 'text',   label: 'Text',   icon: 'file-text' },
    { id: 'chart',  label: 'Chart',  icon: 'bar-chart-2' },
  ];
  const defaultViewOption = $derived(
    DATA_VIEW_OPTIONS.find((o) => o.id === settings.defaultDataView) ?? DATA_VIEW_OPTIONS[0],
  );
  /** @param {string} v */
  function setDefaultDataView(v) {
    if (v) settings = updateSettings({ defaultDataView: v });
  }

  /** @type {boolean | null} */
  let launchAtLogin = $state(null);

  $effect(() => {
    if (launchAtLogin === null) {
      getAutostartStatus()
        .then((v) => { launchAtLogin = v; })
        .catch(() => { launchAtLogin = false; });
    }
  });

  async function toggleLaunchAtLogin() {
    const next = !launchAtLogin;
    launchAtLogin = next;
    try {
      if (next) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }
    } catch {
      launchAtLogin = !next;
    }
  }

  function openModelConfiguration() {
    open = false;
    onopenmodelconfiguration();
  }

  const zoomLabel = $derived(`${Math.round(settings.zoom * 100)}%`);

  const planBadge = $derived.by(() => {
    const s = $licenseStatus;
    if (s?.status === "Valid") return { label: "Pro", class: "border-green-500/25 bg-green-500/10 text-green-600 dark:text-green-400" };
    if (s?.status === "Trial") return { label: `Trial · ${s.days_remaining}d`, class: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400" };
    return { label: "Free", class: "border-border/70 bg-muted/40 text-muted-foreground" };
  });
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Content class="flex h-[min(40rem,88vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[56rem]">
    <Dialog.Title class="sr-only">Settings</Dialog.Title>
    <Dialog.Description class="sr-only">Appearance, behavior, and integrations</Dialog.Description>

    <div class="grid min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)] overflow-hidden">
      <!-- ── Left: search + category nav ─────────────────────────── -->
      <aside class="flex min-h-0 flex-col gap-3 border-r border-border/40 bg-muted/[0.015] p-3">
        <div class="relative">
          <Icon name="search" class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/45" />
          <input
            bind:value={query}
            placeholder="Search settings…"
            class="h-8 w-full rounded-lg border border-border/60 bg-background pl-8 pr-2.5 text-ui-xs text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/40 focus:border-ring focus:ring-1 focus:ring-ring"
          />
        </div>
        <nav class="flex flex-col gap-0.5">
          {#each CATEGORIES as c (c.id)}
            <button
              type="button"
              onclick={() => { category = c.id; query = ''; }}
              class={cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98]',
                !searching && category === c.id
                  ? 'bg-muted/60 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
              )}
            >
              <Icon name={c.icon} class="size-4 shrink-0" />
              {c.label}
            </button>
          {/each}
        </nav>
      </aside>

      <!-- ── Right: content ──────────────────────────────────────── -->
      <div class="app-scroll min-h-0 overflow-y-auto">
        <div class="mx-auto max-w-[42rem] px-8 py-7">
          {#key searching ? '__search__' : category}
            <div class="settings-pane">
              <h2 class="mb-6 text-[15px] font-semibold tracking-tight text-foreground">
                {searching ? 'Search results' : activeCategory.label}
              </h2>

              {#if searching}
                {@render generalContent()}
                {@render databaseContent()}
                {@render appearanceContent()}
                {@render integrationsContent()}
                {@render aboutContent()}
              {:else if category === 'general'}
                {@render generalContent()}
              {:else if category === 'database'}
                {@render databaseContent()}
              {:else if category === 'appearance'}
                {@render appearanceContent()}
              {:else if category === 'integrations'}
                {@render integrationsContent()}
              {:else}
                {@render aboutContent()}
              {/if}
            </div>
          {/key}
        </div>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>

<!-- ── Content snippets ──────────────────────────────────────────── -->
{#snippet secLabel(/** @type {string} */ text)}
  {#if !searching}
    <p class="mt-8 mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/45 first:mt-0">{text}</p>
    <div class="mb-1 border-b border-border/40"></div>
  {/if}
{/snippet}

{#snippet switchRow(/** @type {string} */ label, /** @type {string} */ desc, /** @type {boolean} */ checked, /** @type {() => void} */ ontoggle)}
  <div class={rowCls}>
    <div class="min-w-0">
      <p class="text-[13px] font-medium text-foreground">{label}</p>
      <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{desc}</p>
    </div>
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label}
      onclick={ontoggle}
      class={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98]',
        checked ? 'bg-primary' : 'bg-muted',
      )}
    >
      <span class={cn('pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]', checked ? 'translate-x-4' : 'translate-x-0.5')}></span>
    </button>
  </div>
{/snippet}

{#snippet actionRow(/** @type {string} */ label, /** @type {string} */ desc, /** @type {string} */ btn, /** @type {() => void} */ onclick, /** @type {{label:string,class:string}|null} */ badge = null)}
  <div class={rowCls}>
    <div class="min-w-0">
      <p class="flex items-center gap-2 text-[13px] font-medium text-foreground">
        {label}
        {#if badge}<span class="rounded-full border px-1.5 py-px text-[10px] font-medium leading-4 {badge.class}">{badge.label}</span>{/if}
      </p>
      <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{desc}</p>
    </div>
    <Button type="button" variant="outline" size="sm" class="shrink-0" {onclick}>{btn}</Button>
  </div>
{/snippet}

{#snippet resetBtn(/** @type {string} */ key, /** @type {string|number} */ def, /** @type {boolean} */ dirty)}
  <button
    type="button"
    onclick={() => resetField(/** @type {any} */ (key), def)}
    disabled={!dirty}
    title="Reset to default"
    aria-label="Reset to default"
    class={cn(
      'inline-flex size-8 shrink-0 items-center justify-center rounded-lg border transition-[background-color,color,border-color,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.96]',
      dirty
        ? 'border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground'
        : 'cursor-default border-transparent text-muted-foreground/20',
    )}
  >
    <RotateCcw class="size-3.5" />
  </button>
{/snippet}

{#snippet numberRow(/** @type {string} */ label, /** @type {string} */ desc, /** @type {string} */ key, /** @type {number} */ def, /** @type {string} */ unit, /** @type {number} */ min)}
  <div class={rowCls}>
    <div class="min-w-0">
      <p class="text-[13px] font-medium text-foreground">{label}</p>
      <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{desc}</p>
    </div>
    <div class="flex shrink-0 items-center gap-1.5">
      <div class="relative">
        <input
          type="number" {min}
          value={settings[key]}
          aria-label={label}
          onchange={(e) => setNumber(/** @type {any} */ (key), e.currentTarget.value, def, min)}
          class={cn(
            'h-8 w-48 rounded-lg border border-border/60 bg-background pl-2.5 text-right font-mono text-ui-xs tabular-nums text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring',
            unit ? 'pr-11' : 'pr-2.5',
          )}
        />
        {#if unit}<span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50">{unit}</span>{/if}
      </div>
      {@render resetBtn(key, def, settings[key] !== def)}
    </div>
  </div>
{/snippet}

{#snippet textRow(/** @type {string} */ label, /** @type {string} */ desc, /** @type {string} */ key, /** @type {string} */ def)}
  <div class={rowCls}>
    <div class="min-w-0">
      <p class="text-[13px] font-medium text-foreground">{label}</p>
      <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{desc}</p>
    </div>
    <div class="flex shrink-0 items-center gap-1.5">
      <input
        type="text" spellcheck="false" autocapitalize="off" autocomplete="off"
        value={settings[key]}
        aria-label={label}
        onchange={(e) => setText(/** @type {any} */ (key), e.currentTarget.value, def)}
        class="h-8 w-48 rounded-lg border border-border/60 bg-background px-2.5 font-mono text-ui-xs text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring focus:ring-1 focus:ring-ring"
      />
      {@render resetBtn(key, def, settings[key] !== def)}
    </div>
  </div>
{/snippet}

{#snippet databaseContent()}
  {@render secLabel('Data view')}
  {#if show('Default view', 'Which view a table opens in')}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-[13px] font-medium text-foreground">Default view</p>
        <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">Which view a table opens in — Table, JSON, Record, Text, or Chart.</p>
      </div>
      <Select.Root type="single" value={settings.defaultDataView} onValueChange={setDefaultDataView}>
        <Select.Trigger size="sm" class={themeSelectTrigger} aria-label="Default view">
          <span class="flex min-w-0 items-center gap-2">
            <Icon name={defaultViewOption.icon} class="size-3.5 shrink-0 text-muted-foreground" />
            <span class="truncate font-medium">{defaultViewOption.label}</span>
          </span>
        </Select.Trigger>
        <Select.Content class="z-[100] w-[var(--bits-select-anchor-width)] min-w-[13rem] p-1" sideOffset={6}>
          {#each DATA_VIEW_OPTIONS as o (o.id)}
            <Select.Item value={o.id} label={o.label} class="rounded-md py-1.5 pr-8 pl-2">
              {#snippet children()}
                <span class="flex min-w-0 items-center gap-2.5">
                  <Icon name={o.icon} class="size-4 shrink-0 text-muted-foreground" />
                  <span class="text-xs font-medium">{o.label}</span>
                </span>
              {/snippet}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  {/if}

  {@render secLabel('Query history')}
  {#if show('Max query history', 'How many executed queries to keep per connection')}
    {@render numberRow('Max query history', 'How many executed queries to keep per connection.', 'maxQueryHistory', DEFAULT_MAX_QUERY_HISTORY, '', 1)}
  {/if}

  {@render secLabel('Connection defaults')}
  {#if show('Max allowed packet', 'Maximum packet size for a single query or result')}
    {@render numberRow('Max allowed packet', 'Maximum packet size for a single query or result.', 'maxAllowedPacket', DEFAULT_MAX_ALLOWED_PACKET, 'bytes', 1024)}
  {/if}
  {#if show('Socket timeout', 'Socket timeout in milliseconds')}
    {@render numberRow('Socket timeout', 'Socket timeout in milliseconds.', 'socketTimeoutMs', DEFAULT_SOCKET_TIMEOUT_MS, 'ms', 0)}
  {/if}
  {#if show('Connect timeout', 'Connection timeout in milliseconds')}
    {@render numberRow('Connect timeout', 'Connection timeout in milliseconds.', 'connectTimeoutMs', DEFAULT_CONNECT_TIMEOUT_MS, 'ms', 0)}
  {/if}
  {#if show('Timezone', 'Session timezone applied after connecting')}
    {@render textRow('Timezone', 'Session timezone applied after connecting.', 'sessionTimezone', DEFAULT_SESSION_TIMEZONE)}
  {/if}
{/snippet}

{#snippet generalContent()}
  {@render secLabel('Startup & behavior')}
  {#if show('Launch at login', 'Start Stroke when you sign in')}
    {@render switchRow('Launch at login', 'Start Stroke when you sign in', launchAtLogin ?? false, toggleLaunchAtLogin)}
  {/if}
  {#if show('Auto reconnect on startup', 'Reconnect to the last database on launch')}
    {@render switchRow('Auto reconnect on startup', 'Reconnect to the last database on launch', settings.autoReconnectOnStartup, toggleAutoReconnect)}
  {/if}
  {#if show('Preview SQL before applying', 'Review the DML before edits, inserts, and deletes run')}
    {@render switchRow('Preview SQL before applying', 'Review the DML before edits, inserts, and deletes run', settings.previewDmlBeforeApply, togglePreviewDml)}
  {/if}
  {#if show('MCP auto-start', 'Start the MCP server on database connect')}
    {@render switchRow('MCP auto-start', 'Start the MCP server on database connect', settings.mcpAutoStart, toggleMcpAutoStart)}
  {/if}
{/snippet}

{#snippet appearanceContent()}
  {@render secLabel('Theme & typeface')}

  {#if show('Theme', 'Color theme for the whole app')}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-[13px] font-medium text-foreground">{$t('settings.theme')}</p>
        <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">Color theme for the whole app.</p>
      </div>
      <Select.Root type="single" value={$appThemeId} onValueChange={(v) => { if (v) setTheme(/** @type {import('$lib/themes/registry.js').ThemeId} */ (v)); }}>
        <Select.Trigger size="sm" class={themeSelectTrigger} aria-label="Color theme">
          <span class="flex min-w-0 items-center gap-2">
            <ThemeSwatch bg={activeTheme.preview.bg} accent={activeTheme.preview.accent} />
            <span class="truncate font-medium">{activeTheme.name}</span>
          </span>
        </Select.Trigger>
        <Select.Content class="z-[100] max-h-[min(24rem,70vh)] w-[var(--bits-select-anchor-width)] min-w-[13rem] p-1" sideOffset={6}>
          {#each themeGroups as group, i (group.id)}
            {#if i > 0}<Select.Separator class="my-1" />{/if}
            <Select.Group>
              <Select.GroupHeading class="px-2 py-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{group.label}</Select.GroupHeading>
              {#each group.themes as theme (theme.id)}
                <Select.Item value={theme.id} label={theme.name} class="rounded-md py-1.5 pr-8 pl-2">
                  {#snippet children()}
                    <span class="flex min-w-0 items-center gap-2">
                      <ThemeSwatch bg={theme.preview.bg} accent={theme.preview.accent} />
                      <span class="min-w-0">
                        <span class="block truncate text-xs font-medium">{theme.name}</span>
                        <span class="block truncate text-[10px] text-muted-foreground">{theme.description}</span>
                      </span>
                    </span>
                  {/snippet}
                </Select.Item>
              {/each}
            </Select.Group>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  {/if}

  {#if show('Font', 'UI and editor typeface')}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-[13px] font-medium text-foreground">{$t('settings.font')}</p>
        <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">UI and editor typeface.</p>
      </div>
      <Select.Root type="single" value={settings.font} onValueChange={(v) => { if (v) setFont(/** @type {import('$lib/stores/settings.js').FontId} */ (v)); }}>
        <Select.Trigger size="sm" class={themeSelectTrigger} aria-label="Font family">
          <span class="flex min-w-0 items-center gap-2">
            <span class="shrink-0 text-[11px] font-semibold text-muted-foreground/70" style="font-family: {FONT_PRESETS[settings.font]?.sans}" aria-hidden="true">Aa</span>
            <span class="truncate font-medium">{FONT_PRESETS[settings.font]?.label ?? "Geist"}</span>
          </span>
        </Select.Trigger>
        <Select.Content class="z-[100] w-[var(--bits-select-anchor-width)] min-w-[13rem] p-1" sideOffset={6}>
          {#each fontEntries as [id, preset] (id)}
            <Select.Item value={id} label={preset.label} class="rounded-md py-1.5 pr-8 pl-2">
              {#snippet children()}
                <span class="flex min-w-0 items-center gap-2.5">
                  <span class="flex size-8 shrink-0 items-center justify-center rounded border border-border/40 bg-muted/30 text-[14px] font-semibold text-foreground/70" style="font-family: {preset.sans}" aria-hidden="true">Aa</span>
                  <span class="min-w-0">
                    <span class="block text-xs font-medium leading-snug">{preset.label}</span>
                    <span class="block text-[10px] leading-snug text-muted-foreground/65">{preset.description}</span>
                  </span>
                </span>
              {/snippet}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  {/if}

  {#if show('Language', 'Interface language')}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-[13px] font-medium text-foreground">{$t('settings.language')}</p>
        <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{$t('settings.language.desc')}.</p>
      </div>
      <Select.Root type="single" value={$locale} onValueChange={(v) => { if (v) setLocale(/** @type {any} */ (v)); }}>
        <Select.Trigger size="sm" class={themeSelectTrigger} aria-label="Language">
          <span class="truncate font-medium">{LOCALES.find((l) => l.id === $locale)?.native ?? 'English'}</span>
        </Select.Trigger>
        <Select.Content class="z-[100] w-[var(--bits-select-anchor-width)] min-w-[13rem] p-1" sideOffset={6}>
          {#each LOCALES as l (l.id)}
            <Select.Item value={l.id} label={l.native} class="rounded-md py-1.5 pr-8 pl-2">
              {#snippet children()}
                <span class="flex min-w-0 items-center justify-between gap-2">
                  <span class="truncate text-xs font-medium">{l.native}</span>
                  <span class="shrink-0 text-[10px] text-muted-foreground/65">{l.label}</span>
                </span>
              {/snippet}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  {/if}

  {@render secLabel('Icons')}

  {#if show('Icon weight', 'Stroke thickness of Lucide icons')}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-[13px] font-medium text-foreground">Icon weight</p>
        <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">Stroke thickness of the icon set.</p>
      </div>
      <Select.Root type="single" value={settings.iconStyle} onValueChange={(v) => { if (v) setIconStyle(/** @type {import('$lib/stores/settings.js').IconStyleId} */ (v)); }}>
        <Select.Trigger size="sm" class={themeSelectTrigger} aria-label="Icon style">
          <span class="flex min-w-0 items-center gap-2">
            <PenTool class="size-3.5 shrink-0 text-muted-foreground" style="stroke-width: {ICON_STYLES[settings.iconStyle]?.strokeWidth ?? 2}px" aria-hidden="true" />
            <span class="truncate font-medium">{ICON_STYLES[settings.iconStyle]?.label ?? "Regular"}</span>
          </span>
        </Select.Trigger>
        <Select.Content class="z-[100] w-[var(--bits-select-anchor-width)] min-w-[13rem] p-1" sideOffset={6}>
          {#each iconStyleEntries as [id, preset] (id)}
            <Select.Item value={id} label={preset.label} class="rounded-md py-1.5 pr-8 pl-2">
              {#snippet children()}
                <span class="flex min-w-0 items-center gap-2.5">
                  <span class="flex size-8 shrink-0 items-center justify-center rounded border border-border/40 bg-muted/30">
                    <PenTool class="size-4 text-foreground/70" style="stroke-width: {preset.strokeWidth}px" aria-hidden="true" />
                  </span>
                  <span class="min-w-0">
                    <span class="block text-xs font-medium leading-snug">{preset.label}</span>
                    <span class="block text-[10px] leading-snug text-muted-foreground/65">{preset.description}</span>
                  </span>
                </span>
              {/snippet}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  {/if}

  {#if show('Icon set', 'Icon family used across the app')}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-[13px] font-medium text-foreground">Icon set</p>
        <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">Icon family used across the app.</p>
      </div>
      <Select.Root type="single" value={settings.iconSet} onValueChange={(v) => { if (v) setIconSet(/** @type {import('$lib/stores/settings.js').IconSetId} */ (v)); }}>
        <Select.Trigger size="sm" class={themeSelectTrigger} aria-label="Icon set">
          <span class="flex min-w-0 items-center gap-2">
            <Icon name="sparkles" class="size-3.5 shrink-0 text-muted-foreground" />
            <span class="truncate font-medium">{ICON_SETS[settings.iconSet]?.label ?? "Lucide"}</span>
          </span>
        </Select.Trigger>
        <Select.Content class="z-[100] w-[var(--bits-select-anchor-width)] min-w-[14rem] p-1" sideOffset={6}>
          {#each iconSetEntries as [id, preset] (id)}
            <Select.Item value={id} label={preset.label} class="rounded-md py-1.5 pr-8 pl-2">
              {#snippet children()}
                <span class="flex min-w-0 items-center gap-2.5">
                  <span class="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/40 bg-muted/30 text-foreground/70">
                    {#if id === "hugeicons"}
                      <HugeiconsIcon icon={SparklesIcon} class="size-4" strokeWidth={1.8} />
                    {:else if id === "phosphor"}
                      <PhosphorSparkle class="size-4" size="100%" />
                    {:else}
                      <LucideSparkles class="size-4" />
                    {/if}
                  </span>
                  <span class="min-w-0">
                    <span class="block text-xs font-medium leading-snug">{preset.label}</span>
                    <span class="block text-[11px] leading-snug text-muted-foreground/65">{preset.description}</span>
                  </span>
                </span>
              {/snippet}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  {/if}

  {#if show('Table style', 'Grid style for the data table')}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-[13px] font-medium text-foreground">Table style</p>
        <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">Grid style for the data table — lines, dotted, or connection dots.</p>
      </div>
      <Select.Root type="single" value={settings.tableStyle} onValueChange={(v) => { if (v) setTableStyle(/** @type {import('$lib/stores/settings.js').TableStyleId} */ (v)); }}>
        <Select.Trigger size="sm" class={themeSelectTrigger} aria-label="Table style">
          <span class="flex min-w-0 items-center gap-2">
            <span class="size-3.5 shrink-0 rounded-[3px] border border-border/50 bg-background" style={tableStylePreview[settings.tableStyle] ?? ''} aria-hidden="true"></span>
            <span class="truncate font-medium">{TABLE_STYLES[settings.tableStyle]?.label ?? "Lines"}</span>
          </span>
        </Select.Trigger>
        <Select.Content class="z-[100] w-[var(--bits-select-anchor-width)] min-w-[16rem] p-1" sideOffset={6}>
          {#each tableStyleEntries as [id, preset] (id)}
            <Select.Item value={id} label={preset.label} class="rounded-md py-1.5 pr-8 pl-2">
              {#snippet children()}
                <span class="flex min-w-0 items-center gap-2.5">
                  <span class="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/40 bg-background" style={tableStylePreview[id] ?? ''} aria-hidden="true"></span>
                  <span class="min-w-0">
                    <span class="block text-xs font-medium leading-snug">{preset.label}</span>
                    <span class="block text-[11px] leading-snug text-muted-foreground/65">{preset.description}</span>
                  </span>
                </span>
              {/snippet}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  {/if}

  {@render secLabel('Display')}
  {#if show('Zoom', 'Scale the whole interface')}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-[13px] font-medium text-foreground">{$t('settings.zoom')}</p>
        <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">Scale the whole interface.</p>
      </div>
      <div class="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon" class="size-7" aria-label="Zoom out" disabled={!canDecreaseZoom(settings.zoom)} onclick={() => bumpZoom(-1)}>
          <Minus class="size-3.5" />
        </Button>
        <button type="button" class="min-w-12 rounded-md px-2 py-1 font-mono text-xs tabular-nums text-foreground transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-muted active:scale-[0.98]" onclick={() => (settings = resetZoom())} title="Reset to 100%">{zoomLabel}</button>
        <Button type="button" variant="ghost" size="icon" class="size-7" aria-label="Zoom in" disabled={!canIncreaseZoom(settings.zoom)} onclick={() => bumpZoom(1)}>
          <Plus class="size-3.5" />
        </Button>
      </div>
    </div>
  {/if}
{/snippet}

{#snippet integrationsContent()}
  {@render secLabel('Tools')}
  {#if show('Extensions', 'Cell formatters, ID generators & transforms')}
    {@render actionRow('Extensions', 'Cell formatters, ID generators & transforms.', 'Open', () => { open = false; onopenextensions(); })}
  {/if}
  {#if show('MCP configuration', 'Expose your database to external AI tools')}
    {@render actionRow('MCP configuration', 'Expose your database to external AI tools.', 'Open', () => { open = false; onopenmcp(); })}
  {/if}
  {#if show('AI models', 'Configure AI providers and API keys')}
    {@render actionRow('AI models', 'Configure AI providers and API keys.', 'Configure', openModelConfiguration)}
  {/if}

  {@render secLabel('Account')}
  {#if show('License', 'Activate or manage your Stroke license')}
    {@render actionRow('License', 'Activate or manage your Stroke license.', 'Manage', () => { open = false; onopenlicense(); }, planBadge)}
  {/if}
{/snippet}

{#snippet aboutContent()}
  {@render secLabel('About')}
  {#if show('About Stroke', 'Version, credits, and release notes')}
    {@render actionRow('About Stroke', 'Version, credits, and release notes.', 'View', () => { open = false; onopenabout(); })}
  {/if}
  {#if show('Website', 'stroke.click — docs, licensing, and support')}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-[13px] font-medium text-foreground">Website</p>
        <p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">Docs, licensing, and support.</p>
      </div>
      <a href="https://stroke.click" target="_blank" rel="noopener noreferrer" class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 text-ui-xs font-medium text-foreground transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-muted active:scale-[0.98]">
        stroke.click <Icon name="external-link" class="size-3.5" />
      </a>
    </div>
  {/if}

  {#if !searching}
    <p class="mt-8 mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/45">Keyboard</p>
    <div class="mb-3 border-b border-border/40"></div>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      {@render shortcut('⌘M', 'cycle theme')}
      {@render shortcut('⌘⇧M', 'previous theme')}
      {@render shortcut('⌘+ / ⌘−', 'zoom')}
      {@render shortcut('⌘0', 'reset zoom')}
    </div>
  {/if}
{/snippet}

{#snippet shortcut(/** @type {string} */ keys, /** @type {string} */ action)}
  <span class="flex items-center gap-1.5 text-[11px] text-muted-foreground">
    <kbd class="rounded border border-border/60 bg-muted/40 px-1 py-px font-mono text-[9px] leading-4 text-foreground/70">{keys}</kbd>
    {action}
  </span>
{/snippet}

<style>
  /* Section/search switch: opacity + subtle lift, ease-out, <250ms */
  .settings-pane {
    animation: settings-pane-in 200ms cubic-bezier(0.23, 1, 0.32, 1) both;
  }

  @keyframes settings-pane-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .settings-pane {
      animation: none;
    }
  }
</style>
