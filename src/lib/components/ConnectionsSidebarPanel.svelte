<script>
  // Connections sidebar panel — VSCode-style switchable panel that lists saved
  // connections, lets the user switch between them, add new ones, and remove
  // them. Purely presentational: every action is delegated to the shell.
  import Icon from "./Icon.svelte";
  import { cn } from "$lib/utils.js";

  let {
    /** @type {import('$lib/stores/connections.js').SavedConnection[]} */
    connections = [],
    /** id of the currently live connection (highlighted row). */
    activeId = "",
    /** @type {(c: import('$lib/stores/connections.js').SavedConnection) => void} */
    onswitch = (c) => {},
    onadd = () => {},
    /** @type {(id: string) => void} */
    onremove = (id) => {},
    ondisconnect = () => {},
  } = $props();

  /**
   * Per-engine leading icon. All engines map to `database` today — kept as a
   * lookup so a per-engine glyph can be swapped in later without touching the row.
   * @param {string | undefined} type
   */
  function engineIcon(type) {
    switch (type) {
      default:
        return "database";
    }
  }

  /** @param {import('$lib/stores/connections.js').SavedConnection} c */
  function subtitle(c) {
    return c.host ?? c.filePath ?? c.database ?? c.type ?? "";
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <!-- Sticky header -->
  <div class="flex h-9 shrink-0 items-center gap-1 px-2.5">
    <span class="min-w-0 flex-1 truncate text-ui-3xs font-medium uppercase tracking-wider text-muted-foreground/50">
      Connections
    </span>
    <button
      type="button"
      title="Add connection"
      aria-label="Add connection"
      onclick={() => onadd()}
      class="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
    >
      <Icon name="plus" class="size-4" />
    </button>
  </div>

  <!-- List -->
  <div class="app-scroll min-h-0 w-full flex-1 overflow-y-auto overscroll-y-contain px-1.5 pb-2">
    {#if connections.length === 0}
      <div class="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <Icon name="database" class="size-5 text-muted-foreground/40" />
        <p class="text-ui-xs text-muted-foreground">No saved connections</p>
        <button
          type="button"
          onclick={() => onadd()}
          class="mt-1 rounded-md border border-border bg-background/40 px-2.5 py-1 text-ui-xs font-medium transition-colors hover:bg-accent/40 hover:text-foreground"
        >
          Add connection
        </button>
      </div>
    {:else}
      {#each connections as c (c.id)}
        {@const active = c.id === activeId}
        <div
          class={cn(
            "group/conn flex min-w-0 items-center rounded-md transition-colors",
            active ? "bg-accent/40" : "hover:bg-accent/20",
          )}
        >
          <button
            type="button"
            title={active ? `${c.name} (connected)` : `Switch to ${c.name}`}
            aria-current={active ? "true" : undefined}
            onclick={() => (active ? undefined : onswitch(c))}
            class="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left"
          >
            <span class="relative flex size-4 shrink-0 items-center justify-center text-muted-foreground">
              <Icon name={engineIcon(c.type)} class="size-4" />
              {#if active}
                <span class="absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full bg-primary ring-2 ring-sidebar"></span>
              {/if}
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-ui-sm font-medium text-sidebar-foreground">{c.name}</span>
              <span class="truncate text-ui-2xs text-muted-foreground">{subtitle(c)}</span>
            </span>
          </button>
          <!-- Trailing state / actions -->
          <div class="flex shrink-0 items-center pr-1.5">
            {#if active}
              <span class="text-ui-2xs font-medium text-primary group-hover/conn:hidden">connected</span>
              <button
                type="button"
                title="Disconnect"
                aria-label="Disconnect"
                onclick={(e) => {
                  e.stopPropagation();
                  ondisconnect();
                }}
                class="hidden size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground group-hover/conn:flex"
              >
                <Icon name="unplug" class="size-3.5" />
              </button>
            {:else}
              <button
                type="button"
                title="Remove connection"
                aria-label="Remove connection"
                onclick={(e) => {
                  e.stopPropagation();
                  onremove(c.id);
                }}
                class="hidden size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground group-hover/conn:flex"
              >
                <Icon name="trash-2" class="size-3.5" />
              </button>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>
