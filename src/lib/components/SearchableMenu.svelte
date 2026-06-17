<script>
  // Reusable searchable dropdown: a Popover anchored to a trigger, containing a
  // cmdk Command (search input + filtered, keyboard-navigable list). The input
  // auto-focuses on open; ArrowUp/Down move the highlight, Enter selects, Tab /
  // Shift+Tab also move the highlight, Esc closes. Used by the table toolbar's
  // Sort / Columns / Filter menus.
  import { Command, Popover } from "bits-ui";
  import { cn } from "$lib/utils.js";
  import SearchIcon from "@lucide/svelte/icons/search";

  let {
    open = $bindable(false),
    /** @type {Array<{ value: string, label?: string, keywords?: string[], disabled?: boolean }>} */
    items = [],
    placeholder = "Search…",
    empty = "No results",
    closeOnSelect = true,
    align = "start",
    contentClass = "w-56",
    /** @type {(item: any) => void} */
    onselect = () => {},
    /** snippet({ props }) — renders the trigger button */
    trigger,
    /** snippet(item) — renders one row's content */
    item,
    /** optional snippet() rendered above the list (e.g. a header bar) */
    header,
  } = $props();

  let search = $state("");
  /** @type {HTMLInputElement | null} */
  let inputEl = $state(null);

  // Clear the query whenever the menu closes so it reopens fresh.
  $effect(() => { if (!open) search = ""; });

  function handleSelect(/** @type {any} */ it) {
    if (it?.disabled) return;
    onselect(it);
    if (closeOnSelect) {
      open = false;
    } else {
      // Refocus the search input so cmdk clears its keyboard-selection cursor.
      // Without this, cmdk resets data-selected to the first item on the next
      // re-render (triggered by the parent state change), making hover jump to "id".
      requestAnimationFrame(() => inputEl?.focus());
    }
  }

  /** Esc closes; Tab / Shift+Tab map onto the Command's Arrow navigation. */
  function onInputKeydown(/** @type {KeyboardEvent} */ e) {
    if (e.key === "Escape") {
      // Close here and stop it bubbling to the app's global Escape handler
      // (which would otherwise close the row inspector / other UI).
      e.preventDefault();
      e.stopPropagation();
      open = false;
      return;
    }
    if (e.key !== "Tab") return;
    e.preventDefault();
    const el = /** @type {HTMLElement} */ (e.currentTarget);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: e.shiftKey ? "ArrowUp" : "ArrowDown", bubbles: true }));
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      {@render trigger(props)}
    {/snippet}
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      {align}
      sideOffset={6}
      onOpenAutoFocus={(e) => { e.preventDefault(); inputEl?.focus(); }}
      class={cn(
        "z-[100] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg outline-none",
        contentClass,
      )}
    >
      <Command.Root loop class="flex max-h-72 flex-col">
        <div class="flex items-center gap-2 border-b border-border/40 px-2.5 py-2">
          <SearchIcon class="size-3.5 shrink-0 text-muted-foreground/45" />
          <Command.Input bind:value={search} {placeholder}>
            {#snippet child({ props })}
              <input
                {...props}
                bind:value={search}
                bind:this={inputEl}
                onkeydown={(e) => { /** @type {any} */ (props).onkeydown?.(e); onInputKeydown(e); }}
                {placeholder}
                class="min-w-0 flex-1 bg-transparent text-ui-sm text-foreground outline-none placeholder:text-muted-foreground/40"
              />
            {/snippet}
          </Command.Input>
        </div>
        {@render header?.()}
        <Command.List class="min-h-0 flex-1 overflow-y-auto p-1">
          <Command.Empty class="px-2 py-5 text-center text-ui-xs text-muted-foreground/50">{empty}</Command.Empty>
          {#each items as it (it.value)}
            <Command.Item
              value={it.value}
              keywords={it.keywords}
              disabled={it.disabled}
              onSelect={() => handleSelect(it)}
              class={cn(
                "flex w-full min-w-0 cursor-default items-center gap-1.5 rounded-[5px] px-1.5 py-1.5 text-ui-xs outline-hidden select-none",
                "text-foreground/85 data-selected:bg-accent data-selected:text-foreground",
                "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40",
                "[&_svg]:pointer-events-none [&_svg]:shrink-0",
              )}
            >
              {@render item(it)}
            </Command.Item>
          {/each}
        </Command.List>
      </Command.Root>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
