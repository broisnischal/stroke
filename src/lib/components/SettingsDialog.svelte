<script>
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import ThemeSwatch from "$lib/components/ThemeSwatch.svelte";
  import { getThemeDefinition, themesByGroup } from "$lib/themes/registry.js";
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
  } from "$lib/stores/settings.js";
  import PenTool from "@lucide/svelte/icons/pen-tool";
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
    "h-8 w-[11.5rem] justify-between gap-2 border-border/80 bg-background px-2 text-ui-xs font-normal shadow-none";

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

  /** @param {import('$lib/stores/settings.js').IconStyleId} iconStyle */
  function setIconStyle(iconStyle) {
    if (iconStyle === settings.iconStyle) return;
    settings = updateSettings({ iconStyle });
  }

  function toggleMcpAutoStart() {
    settings = updateSettings({ mcpAutoStart: !settings.mcpAutoStart });
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
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Content class="gap-0 overflow-hidden p-0 sm:max-w-[22rem]">
    <Dialog.Header class="space-y-1 px-5 pt-5 pb-1">
      <Dialog.Title class="text-sm font-semibold tracking-tight"
        >Settings</Dialog.Title
      >
      <Dialog.Description class="text-xs text-muted-foreground">
        Appearance and integrations
      </Dialog.Description>
    </Dialog.Header>

    <div class="px-5 py-3">
      <div class="divide-y divide-border/60 rounded-lg border border-border/80">
        <div class="flex items-center justify-between gap-3 px-3 py-2.5">
          <span class="text-xs text-muted-foreground">Theme</span>
          <Select.Root
            type="single"
            value={$appThemeId}
            onValueChange={(v) => {
              if (v)
                setTheme(
                  /** @type {import('$lib/themes/registry.js').ThemeId} */ (v),
                );
            }}
          >
            <Select.Trigger
              size="sm"
              class={themeSelectTrigger}
              aria-label="Color theme"
            >
              <span class="flex min-w-0 items-center gap-2">
                <ThemeSwatch
                  bg={activeTheme.preview.bg}
                  accent={activeTheme.preview.accent}
                />
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
                    <Select.Item
                      value={theme.id}
                      label={theme.name}
                      class="rounded-md py-1.5 pr-8 pl-2"
                    >
                      {#snippet children()}
                        <span class="flex min-w-0 items-center gap-2">
                          <ThemeSwatch
                            bg={theme.preview.bg}
                            accent={theme.preview.accent}
                          />
                          <span class="min-w-0">
                            <span class="block truncate text-xs font-medium"
                              >{theme.name}</span
                            >
                            <span
                              class="block truncate text-[10px] text-muted-foreground"
                            >
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

        <div class="flex items-center justify-between gap-3 px-3 py-2.5">
          <span class="text-xs text-muted-foreground">Font</span>
          <Select.Root
            type="single"
            value={settings.font}
            onValueChange={(v) => { if (v) setFont(/** @type {import('$lib/stores/settings.js').FontId} */ (v)); }}
          >
            <Select.Trigger
              size="sm"
              class={themeSelectTrigger}
              aria-label="Font family"
            >
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

        <div class="flex items-center justify-between gap-3 px-3 py-2.5">
          <span class="text-xs text-muted-foreground">Icons</span>
          <Select.Root
            type="single"
            value={settings.iconStyle}
            onValueChange={(v) => { if (v) setIconStyle(/** @type {import('$lib/stores/settings.js').IconStyleId} */ (v)); }}
          >
            <Select.Trigger
              size="sm"
              class={themeSelectTrigger}
              aria-label="Icon style"
            >
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

        <div class="flex items-center justify-between gap-3 px-3 py-2.5">
          <span class="text-xs text-muted-foreground">Zoom</span>
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

        <div class="flex items-center justify-between gap-3 px-3 py-2.5">
          <div class="min-w-0">
            <p class="text-xs text-muted-foreground">MCP auto-start</p>
            <p class="text-[10px] text-muted-foreground/80">
              On database connect
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Toggle MCP auto-start"
            aria-checked={settings.mcpAutoStart}
            class={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
              settings.mcpAutoStart ? "bg-foreground" : "bg-muted",
            )}
            onclick={toggleMcpAutoStart}
          >
            <span
              class={cn(
                "pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform",
                settings.mcpAutoStart ? "translate-x-4" : "translate-x-0.5",
              )}
            ></span>
          </button>
        </div>

        <div class="flex items-center justify-between gap-3 px-3 py-2.5">
          <div class="min-w-0">
            <p class="text-xs text-muted-foreground">Launch at login</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Toggle launch at login"
            aria-checked={launchAtLogin ?? false}
            class={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
              launchAtLogin ? "bg-foreground" : "bg-muted",
            )}
            onclick={toggleLaunchAtLogin}
          >
            <span
              class={cn(
                "pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform",
                launchAtLogin ? "translate-x-4" : "translate-x-0.5",
              )}
            ></span>
          </button>
        </div>

        <div class="flex items-center justify-between gap-3 px-3 py-2.5">
          <div class="min-w-0">
            <p class="text-xs text-muted-foreground">Auto reconnect on startup</p>
            <p class="text-[10px] text-muted-foreground/80">
              Reconnect to last database on launch
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Toggle auto reconnect on startup"
            aria-checked={settings.autoReconnectOnStartup}
            class={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
              settings.autoReconnectOnStartup ? "bg-foreground" : "bg-muted",
            )}
            onclick={() => { settings = updateSettings({ autoReconnectOnStartup: !settings.autoReconnectOnStartup }) }}
          >
            <span
              class={cn(
                "pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform",
                settings.autoReconnectOnStartup ? "translate-x-4" : "translate-x-0.5",
              )}
            ></span>
          </button>
        </div>

        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          onclick={() => {
            open = false;
            onopenextensions();
          }}
        >
          <span>Extensions</span>
          <ChevronRight class="size-3.5 shrink-0 opacity-60" />
        </button>
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          onclick={() => {
            open = false;
            onopenmcp();
          }}
        >
          <span>MCP configuration</span>
          <ChevronRight class="size-3.5 shrink-0 opacity-60" />
        </button>
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          onclick={openModelConfiguration}
        >
          <span>Model Configuration</span>
          <ChevronRight class="size-3.5 shrink-0 opacity-60" />
        </button>
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          onclick={() => { open = false; onopenabout() }}
        >
          <span>About Stroke</span>
          <ChevronRight class="size-3.5 shrink-0 opacity-60" />
        </button>
      </div>

      <p
        class="mt-3 px-0.5 text-[10px] leading-relaxed text-muted-foreground/80"
      >
        ⌘M cycle theme · ⌘⇧M previous theme · ⌘+ / ⌘− zoom · ⌘0 reset
      </p>
    </div>
  </Dialog.Content>
</Dialog.Root>
