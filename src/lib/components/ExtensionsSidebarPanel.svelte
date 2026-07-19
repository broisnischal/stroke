<script>
  // Extensions sidebar panel — VSCode-style switchable panel listing built-in
  // extensions with an inline Install / Installed toggle. There is no real
  // install step: "Install" = enable the plugin, "Installed" (click) = disable.
  import Icon from "./Icon.svelte";
  import { cn } from "$lib/utils.js";
  import { EXTENSIONS } from "$lib/plugins/registry.js";
  import { pluginState, pluginEnabledIn, setPluginEnabled } from "$lib/stores/plugins.js";

  let {
    /** @type {(ext: { id: string, name: string, description?: string, kind: string }) => void} */
    onopendetail = (ext) => {},
  } = $props();

  let filter = $state("");

  const filtered = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return EXTENSIONS;
    return EXTENSIONS.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q) ||
        (e.kind ?? "").toLowerCase().includes(q),
    );
  });

  /** Generic per-kind leading glyph (names verified against icon-registry.js). */
  const KIND_ICON = /** @type {Record<string, string>} */ ({
    workflow: "workflow",
    formatter: "sparkles",
    linkify: "link-2",
    annotator: "pin",
    generators: "zap",
    transforms: "replace",
  });

  /** @param {string} kind */
  function kindIcon(kind) {
    return KIND_ICON[kind] ?? "blocks";
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <!-- Sticky header -->
  <div class="flex h-9 shrink-0 items-center gap-1 px-2.5">
    <span class="min-w-0 flex-1 truncate text-ui-3xs font-medium uppercase tracking-wider text-muted-foreground/50">
      Extensions
    </span>
  </div>

  <!-- Filter -->
  <div class="shrink-0 px-2 pb-1.5">
    <div class="relative">
      <Icon
        name="search"
        class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60"
      />
      <input
        type="text"
        bind:value={filter}
        placeholder="Search extensions"
        aria-label="Search extensions"
        class="h-7 w-full min-w-0 rounded-md border border-border bg-background/40 pl-8 pr-2.5 text-ui-sm text-foreground shadow-none outline-none transition-colors hover:bg-background/55 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  </div>

  <!-- List -->
  <div class="app-scroll min-h-0 w-full flex-1 overflow-y-auto overscroll-y-contain px-1.5 pb-2">
    {#if filtered.length === 0}
      <div class="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <Icon name="blocks" class="size-5 text-muted-foreground/40" />
        <p class="text-ui-xs text-muted-foreground">No extensions match "{filter}"</p>
      </div>
    {:else}
      {#each filtered as ext (ext.id)}
        {@const on = pluginEnabledIn($pluginState, ext.id)}
        <div class="group/ext flex min-w-0 items-center rounded-md transition-colors hover:bg-accent/20">
          <button
            type="button"
            title={ext.description || ext.name}
            onclick={() => onopendetail(ext)}
            class="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left"
          >
            <Icon name={kindIcon(ext.kind)} class="size-4 shrink-0 text-muted-foreground" />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-ui-sm font-medium text-sidebar-foreground">{ext.name}</span>
              <span class="truncate text-ui-2xs capitalize text-muted-foreground">{ext.kind}</span>
            </span>
          </button>
          <div class="flex shrink-0 items-center pr-1.5">
            {#if on}
              <button
                type="button"
                title="Installed — click to disable"
                aria-label="Uninstall {ext.name}"
                onclick={(e) => {
                  e.stopPropagation();
                  setPluginEnabled(ext.id, false);
                }}
                class="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-ui-2xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                <Icon name="check" class="size-3" />
                Installed
              </button>
            {:else}
              <button
                type="button"
                title="Install {ext.name}"
                aria-label="Install {ext.name}"
                onclick={(e) => {
                  e.stopPropagation();
                  setPluginEnabled(ext.id, true);
                }}
                class="rounded-md border border-border bg-background/60 px-2 py-0.5 text-ui-2xs font-medium text-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/ext:opacity-100"
              >
                Install
              </button>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>
