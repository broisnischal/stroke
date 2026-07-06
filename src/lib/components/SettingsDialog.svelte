<script>
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Blocks from "@lucide/svelte/icons/blocks";
  import Server from "@lucide/svelte/icons/server";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import Info from "@lucide/svelte/icons/info";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import ThemeSwatch from "$lib/components/ThemeSwatch.svelte";
  import { getThemeDefinition, themesByGroup } from "$lib/themes/registry.js";
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
  } from "$lib/stores/settings.js";
  import PenTool from "@lucide/svelte/icons/pen-tool";
  import LucideSearch from "@lucide/svelte/icons/search";
  import LucideSparkles from "@lucide/svelte/icons/sparkles";
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { Search01Icon, SparklesIcon } from "@hugeicons/core-free-icons";
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
    "h-7 w-[11.5rem] justify-between gap-2 border-border/80 bg-background px-2 text-ui-xs font-normal shadow-none";

  function refreshSettings() {
    settings = loadSettings();
  }

  /** @param {boolean} next */
  function handleOpenChange(next) {
    if (next) refreshSettings();
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
  <Dialog.Content class="flex max-h-[min(40rem,85vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[24rem]">
    <Dialog.Header class="shrink-0 space-y-0.5 border-b border-border/60 px-5 pb-3.5 pt-4">
      <Dialog.Title class="text-sm font-semibold tracking-tight">Settings</Dialog.Title>
      <Dialog.Description class="text-ui-xs text-muted-foreground">
        Appearance, behavior, and integrations
      </Dialog.Description>
    </Dialog.Header>

    <div class="app-scroll flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-4">
      <!-- ── Appearance ─────────────────────────────────────────────── -->
      <section class="flex flex-col gap-1.5">
        <h3 class="px-0.5 text-ui-2xs font-medium uppercase tracking-wider text-muted-foreground/70">Appearance</h3>
        <div class="divide-y divide-border/50 rounded-lg border border-border/70 bg-card/40">
          <div class="flex h-11 items-center justify-between gap-3 px-3">
            <span class="text-ui-xs font-medium text-foreground">Theme</span>
            <Select.Root
              type="single"
              value={$appThemeId}
              onValueChange={(v) => {
                if (v) setTheme(/** @type {import('$lib/themes/registry.js').ThemeId} */ (v));
              }}
            >
              <Select.Trigger size="sm" class={themeSelectTrigger} aria-label="Color theme">
                <span class="flex min-w-0 items-center gap-2">
                  <ThemeSwatch bg={activeTheme.preview.bg} accent={activeTheme.preview.accent} />
                  <span class="truncate font-medium">{activeTheme.name}</span>
                </span>
              </Select.Trigger>
              <Select.Content
                class="z-[100] max-h-[min(24rem,70vh)] w-[var(--bits-select-anchor-width)] min-w-[13rem] p-1"
                sideOffset={6}
              >
                {#each themeGroups as group, i (group.id)}
                  {#if i > 0}
                    <Select.Separator class="my-1" />
                  {/if}
                  <Select.Group>
                    <Select.GroupHeading
                      class="px-2 py-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
                    >
                      {group.label}
                    </Select.GroupHeading>
                    {#each group.themes as theme (theme.id)}
                      <Select.Item value={theme.id} label={theme.name} class="rounded-md py-1.5 pr-8 pl-2">
                        {#snippet children()}
                          <span class="flex min-w-0 items-center gap-2">
                            <ThemeSwatch bg={theme.preview.bg} accent={theme.preview.accent} />
                            <span class="min-w-0">
                              <span class="block truncate text-xs font-medium">{theme.name}</span>
                              <span class="block truncate text-[10px] text-muted-foreground">
                                {theme.description}
                              </span>
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

          <div class="flex h-11 items-center justify-between gap-3 px-3">
            <span class="text-ui-xs font-medium text-foreground">Font</span>
            <Select.Root
              type="single"
              value={settings.font}
              onValueChange={(v) => { if (v) setFont(/** @type {import('$lib/stores/settings.js').FontId} */ (v)); }}
            >
              <Select.Trigger size="sm" class={themeSelectTrigger} aria-label="Font family">
                <span class="flex min-w-0 items-center gap-2">
                  <span
                    class="shrink-0 text-[11px] font-semibold text-muted-foreground/70"
                    style="font-family: {FONT_PRESETS[settings.font]?.sans}"
                    aria-hidden="true"
                  >Aa</span>
                  <span class="truncate font-medium">{FONT_PRESETS[settings.font]?.label ?? "Geist"}</span>
                </span>
              </Select.Trigger>
              <Select.Content
                class="z-[100] w-[var(--bits-select-anchor-width)] min-w-[13rem] p-1"
                sideOffset={6}
              >
                {#each fontEntries as [id, preset] (id)}
                  <Select.Item value={id} label={preset.label} class="rounded-md py-1.5 pr-8 pl-2">
                    {#snippet children()}
                      <span class="flex min-w-0 items-center gap-2.5">
                        <span
                          class="flex size-8 shrink-0 items-center justify-center rounded border border-border/40 bg-muted/30 text-[14px] font-semibold text-foreground/70"
                          style="font-family: {preset.sans}"
                          aria-hidden="true"
                        >Aa</span>
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

          <div class="flex h-11 items-center justify-between gap-3 px-3">
            <span class="text-ui-xs font-medium text-foreground">Icons</span>
            <Select.Root
              type="single"
              value={settings.iconStyle}
              onValueChange={(v) => { if (v) setIconStyle(/** @type {import('$lib/stores/settings.js').IconStyleId} */ (v)); }}
            >
              <Select.Trigger size="sm" class={themeSelectTrigger} aria-label="Icon style">
                <span class="flex min-w-0 items-center gap-2">
                  <PenTool
                    class="size-3.5 shrink-0 text-muted-foreground"
                    style="stroke-width: {ICON_STYLES[settings.iconStyle]?.strokeWidth ?? 2}px"
                    aria-hidden="true"
                  />
                  <span class="truncate font-medium">{ICON_STYLES[settings.iconStyle]?.label ?? "Regular"}</span>
                </span>
              </Select.Trigger>
              <Select.Content
                class="z-[100] w-[var(--bits-select-anchor-width)] min-w-[13rem] p-1"
                sideOffset={6}
              >
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

          <div class="flex h-11 items-center justify-between gap-3 px-3">
            <span class="text-ui-xs font-medium text-foreground">Icon set</span>
            <Select.Root
              type="single"
              value={settings.iconSet}
              onValueChange={(v) => { if (v) setIconSet(/** @type {import('$lib/stores/settings.js').IconSetId} */ (v)); }}
            >
              <Select.Trigger size="sm" class={themeSelectTrigger} aria-label="Icon set">
                <span class="flex min-w-0 items-center gap-2">
                  <Icon name="sparkles" class="size-3.5 shrink-0 text-muted-foreground" />
                  <span class="truncate font-medium">{ICON_SETS[settings.iconSet]?.label ?? "Lucide"}</span>
                </span>
              </Select.Trigger>
              <Select.Content
                class="z-[100] w-[var(--bits-select-anchor-width)] min-w-[14rem] p-1"
                sideOffset={6}
              >
                {#each iconSetEntries as [id, preset] (id)}
                  <Select.Item value={id} label={preset.label} class="rounded-md py-1.5 pr-8 pl-2">
                    {#snippet children()}
                      <span class="flex min-w-0 items-center gap-2.5">
                        <span class="flex size-8 shrink-0 items-center justify-center gap-1 rounded border border-border/40 bg-muted/30 text-foreground/70">
                          {#if id === "hugeicons"}
                            <HugeiconsIcon icon={Search01Icon} class="size-3.5" strokeWidth={1.8} />
                            <HugeiconsIcon icon={SparklesIcon} class="size-3.5" strokeWidth={1.8} />
                          {:else}
                            <LucideSearch class="size-3.5" />
                            <LucideSparkles class="size-3.5" />
                          {/if}
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

          <div class="flex h-11 items-center justify-between gap-3 px-3">
            <span class="text-ui-xs font-medium text-foreground">Zoom</span>
            <div class="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="size-7"
                aria-label="Zoom out"
                disabled={!canDecreaseZoom(settings.zoom)}
                onclick={() => bumpZoom(-1)}
              >
                <Minus class="size-3.5" />
              </Button>
              <button
                type="button"
                class="min-w-12 rounded-md px-2 py-1 font-mono text-xs tabular-nums text-foreground hover:bg-muted"
                onclick={() => (settings = resetZoom())}
                title="Reset to 100%"
              >
                {zoomLabel}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="size-7"
                aria-label="Zoom in"
                disabled={!canIncreaseZoom(settings.zoom)}
                onclick={() => bumpZoom(1)}
              >
                <Plus class="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Behavior ───────────────────────────────────────────────── -->
      <section class="flex flex-col gap-1.5">
        <h3 class="px-0.5 text-ui-2xs font-medium uppercase tracking-wider text-muted-foreground/70">Behavior</h3>
        <div class="divide-y divide-border/50 rounded-lg border border-border/70 bg-card/40">
          {@render toggleRow('Launch at login', 'Start Stroke when you sign in', launchAtLogin ?? false, toggleLaunchAtLogin)}
          {@render toggleRow('Auto reconnect on startup', 'Reconnect to the last database on launch', settings.autoReconnectOnStartup, toggleAutoReconnect)}
          {@render toggleRow('Preview SQL before applying', 'Review the DML before edits, inserts, and deletes run', settings.previewDmlBeforeApply, togglePreviewDml)}
          {@render toggleRow('MCP auto-start', 'Start the MCP server on database connect', settings.mcpAutoStart, toggleMcpAutoStart)}
        </div>
      </section>

      <!-- ── More ───────────────────────────────────────────────────── -->
      <section class="flex flex-col gap-1.5">
        <h3 class="px-0.5 text-ui-2xs font-medium uppercase tracking-wider text-muted-foreground/70">More</h3>
        <div class="divide-y divide-border/50 rounded-lg border border-border/70 bg-card/40">
          {@render navRow('blocks', 'Extensions', () => { open = false; onopenextensions(); })}
          {@render navRow('server', 'MCP configuration', () => { open = false; onopenmcp(); })}
          {@render navRow('sparkles', 'AI models', openModelConfiguration)}
          {@render navRow('key-round', 'License', () => { open = false; onopenlicense(); }, planBadge)}
          {@render navRow('info', 'About Stroke', () => { open = false; onopenabout(); })}
        </div>
      </section>
    </div>

    <!-- Shortcuts -->
    <div class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border/60 px-5 py-3">
      {@render shortcut('⌘M', 'cycle theme')}
      {@render shortcut('⌘⇧M', 'previous theme')}
      {@render shortcut('⌘+ / ⌘−', 'zoom')}
      {@render shortcut('⌘0', 'reset zoom')}
    </div>
  </Dialog.Content>
</Dialog.Root>

{#snippet toggleRow(/** @type {string} */ label, /** @type {string} */ description, /** @type {boolean} */ checked, /** @type {() => void} */ ontoggle)}
  <div class="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
    <div class="min-w-0">
      <p class="text-ui-xs font-medium text-foreground">{label}</p>
      <p class="text-[10px] text-muted-foreground">{description}</p>
    </div>
    <button
      type="button"
      role="switch"
      aria-label="Toggle {label}"
      aria-checked={checked}
      class={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        checked ? "bg-foreground" : "bg-muted",
      )}
      onclick={ontoggle}
    >
      <span
        class={cn(
          "pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      ></span>
    </button>
  </div>
{/snippet}

{#snippet navRow(/** @type {string} */ iconName, /** @type {string} */ label, /** @type {() => void} */ onselect, /** @type {{ label: string, class: string } | null} */ badge = null)}
  <button
    type="button"
    class="flex h-10 w-full items-center gap-2.5 px-3 text-left transition-colors hover:bg-muted/40"
    onclick={onselect}
  >
    <Icon name={iconName} class="size-3.5 shrink-0 text-muted-foreground/70" />
    <span class="min-w-0 flex-1 truncate text-ui-xs font-medium text-foreground">{label}</span>
    {#if badge}
      <span class="shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium leading-4 {badge.class}">{badge.label}</span>
    {/if}
    <Icon name="chevron-right" class="size-3.5 shrink-0 text-muted-foreground/50" />
  </button>
{/snippet}

{#snippet shortcut(/** @type {string} */ keys, /** @type {string} */ action)}
  <span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
    <kbd class="rounded border border-border/60 bg-muted/40 px-1 py-px font-mono text-[9px] leading-4 text-foreground/70">{keys}</kbd>
    {action}
  </span>
{/snippet}
