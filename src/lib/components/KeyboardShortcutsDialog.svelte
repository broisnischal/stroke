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
        { keys: [mod, "T"], desc: "Search tables" },
        { keys: [mod, "N"], desc: "New tab" },
        { keys: [mod, "W"], desc: "Close tab" },
        { keys: [mod, "Tab"], desc: "Next tab" },
        { keys: [mod, "⇧", "Tab"], desc: "Previous tab" },
        { keys: [mod, "B"], desc: "Toggle sidebar" },
        { keys: [mod, "⇧", "F"], desc: "Focus table filter" },
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
        { keys: [mod, "⇧", "E"], desc: "Toggle AI panel" },
        { keys: [mod, "I"], desc: "Toggle AI sidebar" },
        { keys: [mod, "⇧", "L"], desc: "Activity log" },
        { keys: [mod, "R"], desc: "Refresh current view" },
      ],
    },
    {
      label: "SQL Editor",
      icon: Terminal,
      shortcuts: [
        { keys: [mod, "↵"], desc: "Run query" },
        { keys: [mod, "S"], desc: "Format SQL" },
        { keys: [mod, "R"], desc: "Re-run last query" },
        { keys: [mod, "K"], desc: "Search query history" },
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
        { keys: ["↵", "/ F2"], desc: "Edit cell" },
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
        { keys: ["?"], desc: "Keyboard shortcuts" },
        { keys: [mod, ","], desc: "Settings" },
        { keys: ["Esc"], desc: "Dismiss / close" },
      ],
    },
  ];

  let query = $state("");

  const filtered = $derived.by(() => {
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
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="fixed inset-0 z-50 flex flex-col bg-background"
    role="document"
    tabindex="-1"
    onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); open = false } }}
  >
    <!-- Header -->
    <div class="flex shrink-0 items-start gap-4 border-b border-border/60 px-6 py-4">
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <div
          class="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted"
        >
          <Keyboard class="size-3.5 text-muted-foreground" />
        </div>
        <div class="min-w-0 flex-1">
          <h1 class="text-sm font-semibold">Keyboard Shortcuts</h1>
          <p class="mt-0.5 text-xs text-muted-foreground">
            All shortcuts use <kbd
              class="rounded border border-border bg-muted px-1 font-mono text-[10px]"
              >{mod}</kbd
            > on this platform.
          </p>
        </div>
      </div>

      <!-- Search -->
      <div class="relative w-64 shrink-0">
        <Search
          class="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground/50"
        />
        <input
          type="text"
          placeholder="Search shortcuts…"
          bind:value={query}
          class="h-8 w-full rounded-md border border-border/60 bg-muted/40 pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground/40 focus:border-ring focus:ring-1 focus:ring-ring/30"
        />
      </div>

      <button
        type="button"
        class="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onclick={() => (open = false)}
        aria-label="Close"
        title="Close (Esc)"
      >
        <X class="size-4" />
      </button>
    </div>

    <!-- Body -->
    <div class="min-h-0 flex-1 overflow-y-auto">
      {#if filtered.length === 0}
        <div class="flex flex-col items-center gap-2 py-12 text-center">
          <p class="text-sm text-muted-foreground">
            No shortcuts match "{query}"
          </p>
        </div>
      {:else}
        <div class="grid grid-cols-2 divide-x divide-border/50 lg:grid-cols-3 xl:grid-cols-4">
          {#each filtered as group (group.label)}
            {@const Icon = group.icon}
            <div
              class="flex flex-col border-b border-border/50 px-5 py-4"
            >
              <!-- Group heading -->
              <div class="mb-3 flex items-center gap-2">
                <Icon class="size-3.5 shrink-0 text-muted-foreground/60" />
                <span
                  class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {group.label}
                </span>
              </div>

              <!-- Shortcuts list -->
              <ul class="flex flex-col gap-1.5">
                {#each group.shortcuts as shortcut (shortcut.desc)}
                  <li class="flex items-center justify-between gap-4">
                    <span class="min-w-0 truncate text-xs text-foreground/80"
                      >{shortcut.desc}</span
                    >
                    <span class="flex shrink-0 items-center gap-0.5">
                      {#each shortcut.keys as key, i (i)}
                        <kbd
                          class={cn(
                            "inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded border px-1.5 font-mono text-[10px] leading-none",
                            "border-border bg-muted text-muted-foreground",
                            "shadow-[0_1px_0_hsl(var(--border))]",
                          )}>{key}</kbd
                        >
                        {#if i < shortcut.keys.length - 1}
                          <span
                            class="mx-0.5 text-[10px] text-muted-foreground/30"
                            >+</span
                          >
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
{/if}
