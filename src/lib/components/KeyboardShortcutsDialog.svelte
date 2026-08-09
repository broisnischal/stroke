<script>
  import { tick } from "svelte";
  import { cn } from "$lib/utils.js";
  import Keyboard from "@lucide/svelte/icons/keyboard";
  import Search from "@lucide/svelte/icons/search";
  import Navigation from "@lucide/svelte/icons/navigation";
  import Monitor from "@lucide/svelte/icons/monitor";
  import Terminal from "@lucide/svelte/icons/terminal";
  import Code2 from "@lucide/svelte/icons/code-2";
  import Table2 from "@lucide/svelte/icons/table-2";
  import Bot from "@lucide/svelte/icons/bot";
  import Palette from "@lucide/svelte/icons/palette";
  import Settings from "@lucide/svelte/icons/settings";
  import X from "@lucide/svelte/icons/x";

  import { SHORTCUT_GROUPS, keycaps, comboText, IS_MAC } from "$lib/shortcuts.js";

  let { open = $bindable(false) } = $props();

  // Platform flag comes from the index too, so this dialog and the bindings
  // agree on what machine they are running on.
  const isMac = IS_MAC;
  const mod = isMac ? "⌘" : "Ctrl";

  // The shortcut list lives in $lib/shortcuts.js. It used to be written out here
  // as per-platform keycap arrays, which meant this dialog could — and did —
  // describe a binding the app no longer had. Groups now carry an icon NAME so
  // that module can stay plain data; the components stay here.
  /** @type {Record<string, any>} */
  const GROUP_ICONS = {
    navigation: Navigation,
    monitor: Monitor,
    terminal: Terminal,
    "code-2": Code2,
    "table-2": Table2,
    bot: Bot,
    palette: Palette,
    settings: Settings,
  };

  /**
   * @typedef {{ combo: string; desc: string }} Shortcut
   * @typedef {{ label: string; icon: string; shortcuts: Shortcut[] }} Group
   */

  /** @type {Group[]} */
  const groups = SHORTCUT_GROUPS;

  let query = $state("");
  let selectedGroup = $state(groups[0].label);
  /** @type {HTMLInputElement | null} */
  let searchEl = $state(null);

  // The component stays mounted across opens, so clear the stale query each
  // time — and focus the search box so the advertised ⌘F/Esc keys work without
  // first clicking inside the overlay. selectedGroup deliberately persists.
  $effect(() => {
    if (open) {
      query = "";
      tick().then(() => searchEl?.focus());
    }
  });

  const isSearching = $derived(query.trim().length > 0);

  const filteredGroups = $derived.by(() => {
    const q = query.toLowerCase().trim();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        shortcuts: g.shortcuts.filter(
          (s) =>
            s.desc.toLowerCase().includes(q) ||
            comboText(s.combo).includes(q),
        ),
      }))
      .filter((g) => g.shortcuts.length > 0);
  });

  const displayGroups = $derived(
    isSearching
      ? filteredGroups
      : groups.filter((g) => g.label === selectedGroup),
  );

  /** @param {KeyboardEvent} e */
  function handleGlobalKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      open = false;
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      e.preventDefault();
      searchEl?.focus();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="fixed inset-0 z-50 flex flex-col bg-background"
    role="document"
    tabindex="-1"
    onkeydown={handleGlobalKey}
  >
    <!-- Header -->
    <div class="flex shrink-0 items-center gap-4 border-b border-border/40 px-5 py-3">
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <div class="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/60">
          <Keyboard class="size-3.5 text-muted-foreground/70" />
        </div>
        <div>
          <h1 class="text-ui-sm font-semibold tracking-tight">Keyboard Shortcuts</h1>
          <p class="text-ui-2xs text-muted-foreground/50 leading-none mt-0.5">
            {mod} on {isMac ? "macOS" : "Windows/Linux"} · {mod}F to search
          </p>
        </div>
      </div>

      <!-- Search -->
      <div class="relative w-52 shrink-0">
        <Search class="pointer-events-none absolute top-1/2 left-2.5 size-3 -translate-y-1/2 text-muted-foreground/35" />
        <input
          bind:this={searchEl}
          type="text"
          placeholder="Search shortcuts…"
          bind:value={query}
          class="h-7 w-full rounded-lg border-2 border-border bg-muted/25 pl-7 pr-3 text-ui-xs text-foreground outline-none placeholder:text-muted-foreground/30 focus:border-ring/55 focus:ring-2 focus:ring-ring/15 focus:bg-muted/50 transition-colors"
        />
        {#if query}
          <button
            type="button"
            class="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground/35 hover:text-muted-foreground transition-colors"
            onclick={() => (query = "")}
          >
            <X class="size-3" />
          </button>
        {/if}
      </div>

      <button
        type="button"
        class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
        onclick={() => (open = false)}
        aria-label="Close"
        title="Close (Esc)"
      >
        <X class="size-3.5" />
      </button>
    </div>

    <!-- Body -->
    <div class="flex min-h-0 flex-1 overflow-hidden">

      <!-- Sidebar -->
      {#if !isSearching}
        <nav class="flex w-48 shrink-0 flex-col gap-px overflow-y-auto border-r border-border/40 px-2 py-3">
          {#each groups as group (group.label)}
            {@const Icon = GROUP_ICONS[group.icon]}
            {@const active = selectedGroup === group.label}
            <button
              type="button"
              onclick={() => (selectedGroup = group.label)}
              class={cn(
                "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-ui-xs transition-colors",
                active
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground/80",
              )}
            >
              <Icon
                class={cn(
                  "size-3.5 shrink-0 transition-colors",
                  active ? "text-foreground/80" : "text-muted-foreground/50 group-hover:text-muted-foreground/70",
                )}
              />
              {group.label}
              <span class={cn(
                "ml-auto text-ui-3xs tabular-nums transition-colors",
                active ? "text-muted-foreground/70" : "text-muted-foreground/30 group-hover:text-muted-foreground/50",
              )}>
                {group.shortcuts.length}
              </span>
            </button>
          {/each}
        </nav>
      {/if}

      <!-- Content -->
      <div class="min-h-0 flex-1 overflow-y-auto">
        {#if displayGroups.length === 0}
          <div class="flex flex-col items-center gap-3 py-20 text-center">
            <div class="flex size-10 items-center justify-center rounded-full border border-border/30 bg-muted/30">
              <Search class="size-4 text-muted-foreground/30" />
            </div>
            <p class="text-ui-sm text-muted-foreground/50">No shortcuts match <span class="text-foreground/60">"{query}"</span></p>
          </div>
        {:else}
          <div class={cn(isSearching ? "divide-y divide-border/30" : "")}>
            {#each displayGroups as group (group.label)}
              {@const Icon = GROUP_ICONS[group.icon]}
              <div class="px-6 py-5">

                {#if isSearching}
                  <div class="mb-4 flex items-center gap-2">
                    <Icon class="size-3.5 text-muted-foreground/40" />
                    <span class="text-ui-2xs font-semibold uppercase tracking-widest text-muted-foreground/40">
                      {group.label}
                    </span>
                  </div>
                {/if}

                <ul class="flex flex-col">
                  {#each group.shortcuts as shortcut, i (group.label + ':' + i)}
                    {@const caps = keycaps(shortcut.combo)}
                    <li
                      class={cn(
                        "group/row flex items-center justify-between gap-8 px-2 py-2 rounded-md transition-colors hover:bg-accent/30",
                        i !== group.shortcuts.length - 1 && "border-b border-border/20",
                      )}
                    >
                      <span class="text-ui-xs text-foreground/65 group-hover/row:text-foreground/80 transition-colors">
                        {shortcut.desc}
                      </span>

                      <span class="flex shrink-0 items-center gap-1">
                        {#each caps as key, ki (ki)}
                          <kbd>{key}</kbd>
                          {#if ki < caps.length - 1}
                            <span class="text-ui-3xs text-muted-foreground/20 select-none">+</span>
                          {/if}
                        {/each}
                      </span>
                    </li>
                  {/each}
                </ul>

              </div>
            {/each}
          </div>
        {/if}
      </div>

    </div>
  </div>
{/if}

