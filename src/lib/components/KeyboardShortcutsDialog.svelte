<script>
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

  let { open = $bindable(false) } = $props();

  const isMac =
    typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
  const mod = isMac ? "⌘" : "Ctrl";
  const opt = isMac ? "⌥" : "Alt";

  /**
   * @typedef {{ keys: string[]; desc: string }} Shortcut
   * @typedef {{ label: string; icon: any; shortcuts: Shortcut[] }} Group
   */

  /** @type {Group[]} */
  const groups = [
    {
      label: "Navigation",
      icon: Navigation,
      shortcuts: [
        { keys: [mod, "K"], desc: "Command menu" },
        { keys: [mod, "⇧", "P"], desc: "Command menu" },
        { keys: [mod, opt, "1–9"], desc: "Switch to saved connection" },
        { keys: [mod, "T"], desc: "Search tables" },
        { keys: [mod, "N"], desc: "New tab" },
        { keys: [mod, "W"], desc: "Close tab" },
        { keys: [mod, "Tab"], desc: "Next tab" },
        { keys: [mod, "⇧", "Tab"], desc: "Previous tab" },
        { keys: [mod, "⇧", "T"], desc: "Reopen closed tab" },
        { keys: [mod, "1–9"], desc: "Go to tab (9 = last)" },
        { keys: [opt, "⇧", "T"], desc: "Toggle tab bar" },
        { keys: [mod, "B"], desc: "Toggle sidebar" },
        { keys: [mod, "⇧", "F"], desc: "Focus table filter" },
        { keys: [mod, "D"], desc: "Switch database" },
        { keys: [mod, "⇧", "C"], desc: "Switch connection" },
        { keys: [mod, opt, "D"], desc: "Disconnect" },
        { keys: [mod, "/"], desc: "Keyboard shortcuts" },
        { keys: ["F11"], desc: "Toggle fullscreen" },
      ],
    },
    {
      label: "Views",
      icon: Monitor,
      shortcuts: [
        { keys: [mod, "⇧", "D"], desc: "Data view" },
        { keys: [mod, "⇧", "S"], desc: "SQL editor" },
        { keys: [mod, "⇧", "O"], desc: "ORM Runner" },
        { keys: [mod, "⇧", "X"], desc: "Extensions" },
        { keys: [mod, "⇧", "E"], desc: "Toggle AI panel" },
        { keys: [mod, "I"], desc: "Toggle AI sidebar" },
        { keys: [mod, "⇧", "L"], desc: "Activity log" },
        { keys: [mod, "R"], desc: "Refresh current view" },
        { keys: [mod, "⇧", "V"], desc: "Cycle table data view" },
        { keys: [opt, "1–5"], desc: "Table / JSON / Record / Text / Chart view" },
        { keys: [mod, opt, "F"], desc: "Find & replace in table" },
      ],
    },
    {
      label: "SQL Editor",
      icon: Terminal,
      shortcuts: [
        { keys: [mod, "↵"], desc: "Run all statements" },
        { keys: [mod, "R"], desc: "Run statement at cursor" },
        { keys: [mod, "L"], desc: "Select current statement" },
        { keys: [mod, "S"], desc: "Save query" },
        { keys: [mod, "J"], desc: "Toggle output panel" },
        { keys: [mod, "⇧", "B"], desc: "Query history" },
      ],
    },
    {
      label: "ORM Runner",
      icon: Code2,
      shortcuts: [
        { keys: [mod, "↵"], desc: "Run query" },
        { keys: [mod, "S"], desc: "Format code" },
      ],
    },
    {
      label: "Data Table",
      icon: Table2,
      shortcuts: [
        { keys: [mod, "F"], desc: "Search rows" },
        { keys: [opt, "⇧", "F"], desc: "Open filter menu" },
        { keys: [opt, "⇧", "S"], desc: "Open sort menu" },
        { keys: [opt, "⇧", "C"], desc: "Open columns menu" },
        { keys: [opt, "⇧", "R"], desc: "Reset table view (clear filters/sort/search)" },
        { keys: ["↵", "F2"], desc: "Edit cell" },
        { keys: ["Esc"], desc: "Cancel edit" },
        { keys: [mod, "↵"], desc: "Navigate to FK row" },
        { keys: [mod, "C"], desc: "Copy cell value" },
        { keys: [mod, "⌫"], desc: "Delete selected rows" },
        { keys: [mod, "A"], desc: "Select all rows" },
        { keys: [mod, "Z"], desc: "Undo cell edit" },
        { keys: [mod, "⇧", "Z"], desc: "Redo cell edit" },
        { keys: [mod, "↑"], desc: "Scroll to top" },
        { keys: [mod, "↓"], desc: "Scroll to bottom" },
        { keys: [mod, "←"], desc: "Previous page" },
        { keys: [mod, "→"], desc: "Next page" },
        { keys: [mod, "⇧", "←"], desc: "First page" },
        { keys: [mod, "⇧", "→"], desc: "Last page" },
        { keys: [opt, "⇧", "1–5"], desc: "Jump to pinned table" },
      ],
    },
    {
      label: "AI Chat",
      icon: Bot,
      shortcuts: [
        { keys: ["↵"], desc: "Send message" },
        { keys: ["⇧", "↵"], desc: "New line" },
        { keys: [mod, "⇧", "B"], desc: "Toggle conversation list" },
        { keys: [mod, "⇧", "T"], desc: "New conversation" },
      ],
    },
    {
      label: "Appearance",
      icon: Palette,
      shortcuts: [
        { keys: [mod, "B"], desc: "Toggle sidebar" },
        { keys: [mod, "⇧", "T"], desc: "Toggle tab bar" },
        { keys: [mod, "⇧", "B"], desc: "Toggle status bar" },
        { keys: [mod, "M"], desc: "Cycle theme" },
        { keys: [mod, "⇧", "M"], desc: "Previous theme" },
        { keys: [mod, "+"], desc: "Zoom in" },
        { keys: [mod, "−"], desc: "Zoom out" },
        { keys: [mod, "0"], desc: "Reset zoom" },
      ],
    },
    {
      label: "General",
      icon: Settings,
      shortcuts: [
        { keys: [mod, "?"], desc: "Keyboard shortcuts" },
        { keys: ["?"], desc: "Keyboard shortcuts" },
        { keys: [mod, ","], desc: "Settings" },
        { keys: ["Esc"], desc: "Dismiss / close" },
      ],
    },
  ];

  let query = $state("");
  let selectedGroup = $state(groups[0].label);
  /** @type {HTMLInputElement | null} */
  let searchEl = $state(null);

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
            s.keys.join(" ").toLowerCase().includes(q),
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
          class="h-7 w-full rounded-lg border border-border bg-muted/25 pl-7 pr-3 text-ui-xs text-foreground outline-none placeholder:text-muted-foreground/30 focus:border-ring focus:ring-1 focus:ring-ring focus:bg-muted/50 transition-colors"
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
            {@const Icon = group.icon}
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
              {@const Icon = group.icon}
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
                        {#each shortcut.keys as key, ki (ki)}
                          <kbd>{key}</kbd>
                          {#if ki < shortcut.keys.length - 1}
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

