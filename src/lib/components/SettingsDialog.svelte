<script>
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import ThemeSwatch from "$lib/components/ThemeSwatch.svelte";
  import SearchableMenu from "$lib/components/SearchableMenu.svelte";
  import SelectMenu from "$lib/components/SelectMenu.svelte";
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
    AGENT_FONT_SIZES,
    THINKING_STYLES,
  } from "$lib/stores/settings.js";
  import { aiProfiles, activeProfileId, setActiveProfile } from "$lib/stores/ai-settings.js";
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
    { id: 'agent',        label: 'Agent',        icon: 'bot' },
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

  const rowCls ="flex items-center justify-between gap-6 border-t border-border/25 py-3.5 first:border-t-0";

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

  function toggleVimMode() {
    settings = updateSettings({ vimMode: !settings.vimMode });
  }

  function toggleCmdkAi() {
    settings = updateSettings({ cmdkAiEnabled: !settings.cmdkAiEnabled });
  }

  function toggleLiveMode() {
    settings = updateSettings({ liveModeEnabled: !settings.liveModeEnabled });
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

  const PAGINATION_OPTIONS = [
    { id: 'offset',   label: 'Offset',   icon: 'hash', hint: 'Classic LIMIT/OFFSET — jump to any page' },
    { id: 'cursor',   label: 'Cursor',   icon: 'chevrons-right', hint: 'Keyset by primary key — fast next/prev, no page jump' },
    { id: 'keyset',   label: 'Keyset',   icon: 'key-round', hint: 'Same as cursor (keyset on the primary key)' },
    { id: 'temporal', label: 'Temporal', icon: 'clock', hint: 'Keyset on a timestamp column, newest-first' },
  ];
  const paginationOption = $derived(
    PAGINATION_OPTIONS.find((o) => o.id === settings.paginationMode) ?? PAGINATION_OPTIONS[0],
  );
  /** @param {string} v */
  function setPaginationMode(v) {
    if (v) settings = updateSettings({ paginationMode: v });
  }

  const NULL_SORT_OPTIONS = [
    { id: 'unset', label: 'Unset' },
    { id: 'first', label: 'Nulls First' },
    { id: 'last', label: 'Nulls Last' },
  ];
  const nullSortOption = $derived(NULL_SORT_OPTIONS.find((o) => o.id === settings.nullSortOrder) ?? NULL_SORT_OPTIONS[0]);
  /** @param {string} v */
  function setNullSort(v) {
    if (v) settings = updateSettings({ nullSortOrder: v });
  }

  // ── Agent (AI chat) settings ─────────────────────────────────────────────
  /** @param {string} v */
  function setAgentChatFont(v) {
    const n = Number(v);
    if (Number.isFinite(n)) settings = updateSettings({ agentChatFontSize: n });
  }
  /** @param {string} v */
  function setAgentCodeFont(v) {
    const n = Number(v);
    if (Number.isFinite(n)) settings = updateSettings({ agentCodeFontSize: n });
  }
  /** @param {string} v */
  function setAgentThinking(v) {
    if (v) settings = updateSettings({ agentThinkingStyle: v });
  }
  const thinkingStyleOption = $derived(
    THINKING_STYLES.find((s) => s.id === settings.agentThinkingStyle) ?? THINKING_STYLES[0],
  );
  const activeModelProfile = $derived(
    $aiProfiles.find((p) => p.id === $activeProfileId) ?? $aiProfiles[0],
  );
  /** @param {string} v */
  function setModelProfile(v) {
    if (v) setActiveProfile(v);
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
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-ui-sm transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98]',
                !searching && category === c.id
                  ? 'bg-muted/60 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
              )}
            >
              <Icon name={c.icon} class="size-4 shrink-0" />
              {$t('settings.nav.' + c.id)}
            </button>
          {/each}
        </nav>
      </aside>

      <!-- ── Right: content ──────────────────────────────────────── -->
      <div class="app-scroll min-h-0 overflow-y-auto">
        <div class="mx-auto max-w-[42rem] px-8 py-7">
          {#key searching ? '__search__' : category}
            <div class="settings-pane">
              <h2 class="mb-6 text-ui-lg font-semibold tracking-tight text-foreground">
                {searching ? $t('common.search') : $t('settings.nav.' + activeCategory.id)}
              </h2>

              {#if searching}
                {@render generalContent()}
                {@render databaseContent()}
                {@render appearanceContent()}
                {@render agentContent()}
                {@render integrationsContent()}
                {@render aboutContent()}
              {:else if category === 'general'}
                {@render generalContent()}
              {:else if category === 'database'}
                {@render databaseContent()}
              {:else if category === 'appearance'}
                {@render appearanceContent()}
              {:else if category === 'agent'}
                {@render agentContent()}
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
    <p class="mt-8 mb-1 text-ui-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground/45 first:mt-0">{text}</p>
    <div class="mb-1 border-b border-border/40"></div>
  {/if}
{/snippet}

{#snippet switchRow(/** @type {string} */ label, /** @type {string} */ desc, /** @type {boolean} */ checked, /** @type {() => void} */ ontoggle)}
  <div class={rowCls}>
    <div class="min-w-0">
      <p class="text-ui-sm font-medium text-foreground">{label}</p>
      <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">{desc}</p>
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
      <p class="flex items-center gap-2 text-ui-sm font-medium text-foreground">
        {label}
        {#if badge}<span class="rounded-full border px-1.5 py-px text-ui-3xs font-medium leading-4 {badge.class}">{badge.label}</span>{/if}
      </p>
      <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">{desc}</p>
    </div>
    <Button type="button" variant="outline" size="sm" class="shrink-0" {onclick}>{btn}</Button>
  </div>
{/snippet}

{#snippet resetBtn(/** @type {string} */ key, /** @type {string|number} */ def, /** @type {boolean} */ dirty)}
  <button
    type="button"
    onclick={() => resetField(/** @type {any} */ (key), def)}
    disabled={!dirty}
    title={$t('settings.resetDefault')}
    aria-label={$t('settings.resetDefault')}
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
      <p class="text-ui-sm font-medium text-foreground">{label}</p>
      <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">{desc}</p>
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
        {#if unit}<span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ui-3xs text-muted-foreground/50">{unit}</span>{/if}
      </div>
      {@render resetBtn(key, def, settings[key] !== def)}
    </div>
  </div>
{/snippet}

{#snippet textRow(/** @type {string} */ label, /** @type {string} */ desc, /** @type {string} */ key, /** @type {string} */ def)}
  <div class={rowCls}>
    <div class="min-w-0">
      <p class="text-ui-sm font-medium text-foreground">{label}</p>
      <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">{desc}</p>
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
  {@render secLabel($t('settings.sec.dataView'))}
  {#if show($t('settings.defaultView'), $t('settings.defaultView.desc'))}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-ui-sm font-medium text-foreground">{$t('settings.defaultView')}</p>
        <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">{$t('settings.defaultView.desc')}</p>
      </div>
      <SelectMenu
        ariaLabel="Default view"
        value={settings.defaultDataView}
        onValueChange={setDefaultDataView}
        items={DATA_VIEW_OPTIONS.map((o) => ({ value: o.id, label: o.label, icon: o.icon, keywords: [o.label] }))}
      />
    </div>
  {/if}

  {#if show($t('settings.pagination'), $t('settings.pagination.desc'))}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-ui-sm font-medium text-foreground">{$t('settings.pagination')}</p>
        <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">{$t('settings.pagination.desc')}</p>
      </div>
      <SelectMenu
        ariaLabel="Pagination strategy"
        value={settings.paginationMode}
        onValueChange={setPaginationMode}
        items={PAGINATION_OPTIONS.map((o) => ({ value: o.id, label: o.label, icon: o.icon, keywords: [o.label] }))}
      />
    </div>
  {/if}

  {@render secLabel('Result Ordering')}
  {#if show('Null sort order', 'Applied to quick-query ordering on databases that support explicit null placement')}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-ui-sm font-medium text-foreground">Null sort order</p>
        <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">Applied to quick-query ordering on databases that support explicit null placement.</p>
      </div>
      <SelectMenu
        ariaLabel="Null sort order"
        value={settings.nullSortOrder}
        onValueChange={setNullSort}
        items={NULL_SORT_OPTIONS.map((o) => ({ value: o.id, label: o.label, keywords: [o.label] }))}
      />
    </div>
  {/if}

  {@render secLabel($t('settings.sec.queryHistory'))}
  {#if show($t('settings.maxQueryHistory'), $t('settings.maxQueryHistory.desc'))}
    {@render numberRow($t('settings.maxQueryHistory'), $t('settings.maxQueryHistory.desc'), 'maxQueryHistory', DEFAULT_MAX_QUERY_HISTORY, '', 1)}
  {/if}

  {@render secLabel($t('settings.sec.connectionDefaults'))}
  {#if show($t('settings.maxAllowedPacket'), $t('settings.maxAllowedPacket.desc'))}
    {@render numberRow($t('settings.maxAllowedPacket'), $t('settings.maxAllowedPacket.desc'), 'maxAllowedPacket', DEFAULT_MAX_ALLOWED_PACKET, 'bytes', 1024)}
  {/if}
  {#if show($t('settings.socketTimeout'), $t('settings.socketTimeout.desc'))}
    {@render numberRow($t('settings.socketTimeout'), $t('settings.socketTimeout.desc'), 'socketTimeoutMs', DEFAULT_SOCKET_TIMEOUT_MS, 'ms', 0)}
  {/if}
  {#if show($t('settings.connectTimeout'), $t('settings.connectTimeout.desc'))}
    {@render numberRow($t('settings.connectTimeout'), $t('settings.connectTimeout.desc'), 'connectTimeoutMs', DEFAULT_CONNECT_TIMEOUT_MS, 'ms', 0)}
  {/if}
  {#if show($t('settings.timezone'), $t('settings.timezone.desc'))}
    {@render textRow($t('settings.timezone'), $t('settings.timezone.desc'), 'sessionTimezone', DEFAULT_SESSION_TIMEZONE)}
  {/if}
{/snippet}

{#snippet agentContent()}
  {@render secLabel('Model')}
  {#if show('Default model', 'The AI model used for chat, SQL suggestions and agent actions')}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-ui-sm font-medium text-foreground">Default model</p>
        <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">Used for chat, SQL suggestions and agent actions.</p>
      </div>
      {#if $aiProfiles.length}
        <SelectMenu
          ariaLabel="Default model"
          placeholder="Select model"
          searchPlaceholder="Search models…"
          value={$activeProfileId}
          onValueChange={setModelProfile}
          items={$aiProfiles.map((p) => ({ value: p.id, label: p.name, keywords: [p.name, p.model] }))}
        />
      {:else}
        <span class="text-ui-xs text-muted-foreground">No models configured</span>
      {/if}
    </div>
  {/if}
  {#if show('Models & API keys', 'Add providers, models and API keys')}
    {@render actionRow('Models & API keys', 'Add providers, choose models and store API keys for OpenAI, Google Gemini, Anthropic and OpenRouter.', 'Manage', () => { open = false; onopenmodelconfiguration(); })}
  {/if}

  {@render secLabel('Chat UI')}
  {#if show('Chat font size', 'Text size for AI chat messages')}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-ui-sm font-medium text-foreground">Chat font size</p>
        <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">Text size for AI chat messages.</p>
      </div>
      <SelectMenu
        ariaLabel="Chat font size"
        value={String(settings.agentChatFontSize)}
        onValueChange={setAgentChatFont}
        items={AGENT_FONT_SIZES.map((s) => ({ value: String(s), label: `${s}px` }))}
      />
    </div>
  {/if}
  {#if show('Code font size', 'Text size for code blocks in chat')}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-ui-sm font-medium text-foreground">Code font size</p>
        <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">Text size for code blocks in chat.</p>
      </div>
      <SelectMenu
        ariaLabel="Code font size"
        value={String(settings.agentCodeFontSize)}
        onValueChange={setAgentCodeFont}
        items={AGENT_FONT_SIZES.map((s) => ({ value: String(s), label: `${s}px` }))}
      />
    </div>
  {/if}
  {#if show('Thinking style', 'How the thinking indicator animates while the model responds')}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-ui-sm font-medium text-foreground">Thinking style</p>
        <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">How the thinking indicator animates while the model responds.</p>
      </div>
      <SelectMenu
        ariaLabel="Thinking style"
        value={settings.agentThinkingStyle}
        onValueChange={setAgentThinking}
        items={THINKING_STYLES.map((o) => ({ value: o.id, label: o.label, keywords: [o.label] }))}
      />
    </div>
  {/if}
{/snippet}

{#snippet generalContent()}
  {@render secLabel($t('settings.sec.startup'))}
  {#if show($t('settings.launchAtLogin'), $t('settings.launchAtLogin.desc'))}
    {@render switchRow($t('settings.launchAtLogin'), $t('settings.launchAtLogin.desc'), launchAtLogin ?? false, toggleLaunchAtLogin)}
  {/if}
  {#if show($t('settings.autoReconnect'), $t('settings.autoReconnect.desc'))}
    {@render switchRow($t('settings.autoReconnect'), $t('settings.autoReconnect.desc'), settings.autoReconnectOnStartup, toggleAutoReconnect)}
  {/if}
  {#if show($t('settings.previewSql'), $t('settings.previewSql.desc'))}
    {@render switchRow($t('settings.previewSql'), $t('settings.previewSql.desc'), settings.previewDmlBeforeApply, togglePreviewDml)}
  {/if}
  {#if show('Vim mode', 'Experimental modal keyboard navigation across the app, the data grid, and the SQL editor')}
    {@render switchRow('Vim mode', 'Experimental — modal keyboard navigation (hjkl, gg/G, i/Esc) across the grid, the SQL editor, and tabs', settings.vimMode, toggleVimMode)}
  {/if}
  {#if show('Cmd+K AI', 'Experimental — ask AI directly from the command palette')}
    {@render switchRow('⌘K AI (experimental)', 'Experimental — show "Ask AI" in the ⌘K command palette. Off by default.', settings.cmdkAiEnabled, toggleCmdkAi)}
  {/if}
  {#if show('Live mode', 'Experimental — auto-refresh the active table when its data changes')}
    {@render switchRow('Live mode (experimental)', 'Experimental — show the Live auto-refresh toggle in the status bar. Off by default.', settings.liveModeEnabled, toggleLiveMode)}
  {/if}
  {#if show($t('settings.mcpAutostart'), $t('settings.mcpAutostart.desc'))}
    {@render switchRow($t('settings.mcpAutostart'), $t('settings.mcpAutostart.desc'), settings.mcpAutoStart, toggleMcpAutoStart)}
  {/if}
{/snippet}

{#snippet appearanceContent()}
  {@render secLabel($t('settings.sec.themeTypeface'))}

  {#if show($t('settings.theme'), $t('settings.theme.desc'))}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-ui-sm font-medium text-foreground">{$t('settings.theme')}</p>
        <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">{$t('settings.theme.desc')}</p>
      </div>
      <SearchableMenu
        align="end"
        contentClass="w-64"
        placeholder="Search themes…"
        items={themeGroups.flatMap((g) => g.themes.map((t) => ({ value: t.id, label: t.name, keywords: [g.label], bg: t.preview.bg, accent: t.preview.accent })))}
        onselect={(it) => setTheme(/** @type {import('$lib/themes/registry.js').ThemeId} */ (it.value))}
      >
        {#snippet trigger(props)}
          <button
            {...props}
            type="button"
            aria-label="Color theme"
            class={cn(
              "flex h-8 w-56 items-center justify-between gap-2 whitespace-nowrap rounded-[10px] border border-border/70 bg-background px-2.5 text-ui-xs font-normal shadow-none outline-none transition-colors hover:bg-muted/30 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 data-[state=open]:border-ring",
            )}
          >
            <span class="flex min-w-0 items-center gap-2">
              <ThemeSwatch bg={activeTheme.preview.bg} accent={activeTheme.preview.accent} />
              <span class="truncate font-medium">{activeTheme.name}</span>
            </span>
            <Icon name="chevron-down" class="size-3.5 shrink-0 opacity-40" />
          </button>
        {/snippet}
        {#snippet item(it)}
          <span class="flex min-w-0 flex-1 items-center gap-2">
            <ThemeSwatch bg={it.bg} accent={it.accent} />
            <span class="truncate text-ui-xs font-medium">{it.label}</span>
          </span>
          {#if $appThemeId === it.value}<Icon name="check" class="ml-auto size-3.5 shrink-0 text-primary" />{/if}
        {/snippet}
      </SearchableMenu>
    </div>
  {/if}

  {#if show($t('settings.font'), $t('settings.font.desc'))}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-ui-sm font-medium text-foreground">{$t('settings.font')}</p>
        <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">{$t('settings.font.desc')}</p>
      </div>
      <SelectMenu
        ariaLabel="Font family"
        value={settings.font}
        onValueChange={(v) => { if (v) setFont(/** @type {import('$lib/stores/settings.js').FontId} */ (v)); }}
        items={fontEntries.map(([id, preset]) => ({ value: id, label: preset.label, sans: preset.sans, keywords: [preset.label] }))}
        searchPlaceholder="Search fonts…"
      >
        {#snippet lead(it)}
          <span class="flex size-5 shrink-0 items-center justify-center rounded border border-border/40 bg-muted/30 text-ui-2xs font-semibold text-foreground/70" style="font-family: {it.sans}" aria-hidden="true">Aa</span>
        {/snippet}
      </SelectMenu>
    </div>
  {/if}

  {#if show($t('settings.language'), $t('settings.language.desc'))}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-ui-sm font-medium text-foreground">{$t('settings.language')}</p>
        <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">{$t('settings.language.desc')}.</p>
      </div>
      <SelectMenu
        ariaLabel="Language"
        value={$locale}
        onValueChange={(v) => { if (v) setLocale(/** @type {any} */ (v)); }}
        items={LOCALES.map((l) => ({ value: l.id, label: l.native, hint: l.label, keywords: [l.native, l.label] }))}
        searchPlaceholder="Search languages…"
      />
    </div>
  {/if}

  {@render secLabel($t('settings.sec.icons'))}

  {#if show($t('settings.iconWeight'), $t('settings.iconWeight.desc'))}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-ui-sm font-medium text-foreground">{$t('settings.iconWeight')}</p>
        <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">{$t('settings.iconWeight.desc')}</p>
      </div>
      <SelectMenu
        ariaLabel="Icon style"
        value={settings.iconStyle}
        onValueChange={(v) => { if (v) setIconStyle(/** @type {import('$lib/stores/settings.js').IconStyleId} */ (v)); }}
        items={iconStyleEntries.map(([id, preset]) => ({ value: id, label: preset.label, strokeWidth: preset.strokeWidth }))}
      >
        {#snippet lead(it)}
          <PenTool class="size-4 shrink-0 text-muted-foreground" style="stroke-width: {it.strokeWidth}px" aria-hidden="true" />
        {/snippet}
      </SelectMenu>
    </div>
  {/if}

  {#if show($t('settings.iconSet'), $t('settings.iconSet.desc'))}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-ui-sm font-medium text-foreground">{$t('settings.iconSet')}</p>
        <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">{$t('settings.iconSet.desc')}</p>
      </div>
      <SelectMenu
        ariaLabel="Icon set"
        value={settings.iconSet}
        onValueChange={(v) => { if (v) setIconSet(/** @type {import('$lib/stores/settings.js').IconSetId} */ (v)); }}
        items={iconSetEntries.map(([id, preset]) => ({ value: id, label: preset.label, keywords: [preset.label] }))}
      >
        {#snippet lead(it)}
          <span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            {#if it.value === "hugeicons"}
              <HugeiconsIcon icon={SparklesIcon} class="size-4" strokeWidth={1.8} />
            {:else if it.value === "phosphor"}
              <PhosphorSparkle class="size-4" size="100%" />
            {:else}
              <LucideSparkles class="size-4" />
            {/if}
          </span>
        {/snippet}
      </SelectMenu>
    </div>
  {/if}

  {#if show($t('settings.tableStyle'), $t('settings.tableStyle.desc'))}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-ui-sm font-medium text-foreground">{$t('settings.tableStyle')}</p>
        <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">{$t('settings.tableStyle.desc')}</p>
      </div>
      <SelectMenu
        ariaLabel="Table style"
        value={settings.tableStyle}
        onValueChange={(v) => { if (v) setTableStyle(/** @type {import('$lib/stores/settings.js').TableStyleId} */ (v)); }}
        items={tableStyleEntries.map(([id, preset]) => ({ value: id, label: preset.label, keywords: [preset.label] }))}
      >
        {#snippet lead(it)}
          <span class="size-4 shrink-0 overflow-hidden rounded-[3px] border border-border/40 bg-background" style={tableStylePreview[it.value] ?? ''} aria-hidden="true"></span>
        {/snippet}
      </SelectMenu>
    </div>
  {/if}

  {@render secLabel($t('settings.sec.display'))}
  {#if show($t('settings.zoom'), $t('settings.zoom.desc'))}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-ui-sm font-medium text-foreground">{$t('settings.zoom')}</p>
        <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">{$t('settings.zoom.desc')}</p>
      </div>
      <div class="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon" class="size-7" aria-label="Zoom out" disabled={!canDecreaseZoom(settings.zoom)} onclick={() => bumpZoom(-1)}>
          <Minus class="size-3.5" />
        </Button>
        <button type="button" class="min-w-12 rounded-md px-2 py-1 font-mono text-ui-xs tabular-nums text-foreground transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-muted active:scale-[0.98]" onclick={() => (settings = resetZoom())} title="Reset to 100%">{zoomLabel}</button>
        <Button type="button" variant="ghost" size="icon" class="size-7" aria-label="Zoom in" disabled={!canIncreaseZoom(settings.zoom)} onclick={() => bumpZoom(1)}>
          <Plus class="size-3.5" />
        </Button>
      </div>
    </div>
  {/if}
{/snippet}

{#snippet integrationsContent()}
  {@render secLabel($t('settings.sec.tools'))}
  {#if show($t('settings.extensions'), $t('settings.extensions.desc'))}
    {@render actionRow($t('settings.extensions'), $t('settings.extensions.desc'), $t('settings.btn.open'), () => { open = false; onopenextensions(); })}
  {/if}
  {#if show($t('settings.mcpConfig'), $t('settings.mcpConfig.desc'))}
    {@render actionRow($t('settings.mcpConfig'), $t('settings.mcpConfig.desc'), $t('settings.btn.open'), () => { open = false; onopenmcp(); })}
  {/if}
  {#if show($t('settings.aiModels'), $t('settings.aiModels.desc'))}
    {@render actionRow($t('settings.aiModels'), $t('settings.aiModels.desc'), $t('settings.btn.configure'), openModelConfiguration)}
  {/if}

  {@render secLabel($t('settings.sec.account'))}
  {#if show($t('settings.license'), $t('settings.license.desc'))}
    {@render actionRow($t('settings.license'), $t('settings.license.desc'), $t('settings.btn.manage'), () => { open = false; onopenlicense(); }, planBadge)}
  {/if}
{/snippet}

{#snippet aboutContent()}
  {@render secLabel($t('settings.sec.about'))}
  {#if show($t('settings.aboutStroke'), $t('settings.aboutStroke.desc'))}
    {@render actionRow($t('settings.aboutStroke'), $t('settings.aboutStroke.desc'), $t('settings.btn.view'), () => { open = false; onopenabout(); })}
  {/if}
  {#if show($t('settings.website'), $t('settings.website.desc'))}
    <div class={rowCls}>
      <div class="min-w-0">
        <p class="text-ui-sm font-medium text-foreground">{$t('settings.website')}</p>
        <p class="mt-0.5 text-ui-xs leading-relaxed text-muted-foreground">{$t('settings.website.desc')}</p>
      </div>
      <a href="https://stroke.click" target="_blank" rel="noopener noreferrer" class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 text-ui-xs font-medium text-foreground transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-muted active:scale-[0.98]">
        stroke.click <Icon name="external-link" class="size-3.5" />
      </a>
    </div>
  {/if}

  {#if !searching}
    <p class="mt-8 mb-1 text-ui-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground/45">{$t('settings.sec.keyboard')}</p>
    <div class="mb-3 border-b border-border/40"></div>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      {@render shortcut('⌘M', $t('settings.kbd.cycleTheme'))}
      {@render shortcut('⌘⇧M', $t('settings.kbd.prevTheme'))}
      {@render shortcut('⌘+ / ⌘−', $t('settings.kbd.zoom'))}
      {@render shortcut('⌘0', $t('settings.kbd.resetZoom'))}
    </div>
  {/if}
{/snippet}

{#snippet shortcut(/** @type {string} */ keys, /** @type {string} */ action)}
  <span class="flex items-center gap-1.5 text-ui-2xs text-muted-foreground">
    <kbd class="rounded border border-border/60 bg-muted/40 px-1 py-px font-mono text-ui-3xs leading-4 text-foreground/70">{keys}</kbd>
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
