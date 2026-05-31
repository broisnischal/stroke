<script>
  import { onDestroy, tick } from "svelte";
  import { createSwapy } from "swapy";
  import EChartPanel from "./EChartPanel.svelte";
  import { savedCharts } from "$lib/stores/saved-charts.js";
  import {
    dashboards,
    activeDashboardId,
    createDashboard,
    deleteDashboard,
    updateDashboard,
    addChartToDashboard,
    removeChartFromDashboard,
    setItemSpan,
    reorderItems,
  } from "$lib/stores/dashboards.js";
  import { cn } from "$lib/utils.js";
  import BarChart2 from "@lucide/svelte/icons/bar-chart-2";
  import Plus from "@lucide/svelte/icons/plus";
  import X from "@lucide/svelte/icons/x";
  import Grip from "@lucide/svelte/icons/grip";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import LayoutGrid from "@lucide/svelte/icons/layout-grid";

  let {
    /** @type {import('$lib/stores/connections.js').SavedConnection | null} */
    connection = null,
  } = $props();

  // ── Active dashboard ───────────────────────────────────────────────────────
  const activeDash = $derived(
    $dashboards.find((d) => d.id === $activeDashboardId) ?? null,
  );

  // ── Chart picker modal ─────────────────────────────────────────────────────
  let pickerOpen = $state(false);

  /** @param {string} chartId */
  function pickChart(chartId) {
    if (!activeDash) return;
    addChartToDashboard(activeDash.id, chartId);
    pickerOpen = false;
  }

  // ── Dashboard CRUD ─────────────────────────────────────────────────────────
  let namingOpen = $state(false);
  let nameInput = $state("");
  let editingName = $state(false);
  let editNameInput = $state("");

  function handleCreateDashboard() {
    const n = nameInput.trim() || "Dashboard";
    createDashboard(n);
    nameInput = "";
    namingOpen = false;
  }

  function startEditName() {
    if (!activeDash) return;
    editNameInput = activeDash.name;
    editingName = true;
  }

  function commitEditName() {
    if (activeDash && editNameInput.trim()) {
      updateDashboard(activeDash.id, { name: editNameInput.trim() });
    }
    editingName = false;
  }

  let dashDropdownOpen = $state(false);

  // ── Column toggle ──────────────────────────────────────────────────────────
  /** @type {(2|3)[]} */
  const COL_OPTIONS = [2, 3];

  function cycleColumns() {
    if (!activeDash) return;
    const idx = COL_OPTIONS.indexOf(activeDash.columns);
    const next = COL_OPTIONS[(idx + 1) % COL_OPTIONS.length];
    updateDashboard(activeDash.id, { columns: next });
  }

  // ── Swapy ─────────────────────────────────────────────────────────────────
  /** @type {HTMLDivElement | null} */
  let gridEl = $state(null);
  /** @type {ReturnType<typeof createSwapy> | null} */
  let swapyInstance = null;

  /**
   * A stable string that captures every layout-affecting piece of state.
   * Changing any of: active dashboard, column count, item order, item spans
   * produces a different key and triggers Swapy re-init.
   */
  const layoutKey = $derived(
    activeDash
      ? `${activeDash.id}|${activeDash.columns}|${activeDash.items
          .map((i) => `${i.id}:${Math.min(i.span, activeDash.columns)}`)
          .join(",")}`
      : "none",
  );

  $effect(() => {
    // Subscribe to layoutKey so Svelte tracks it.
    const _key = layoutKey;
    let cancelled = false;

    // Destroy synchronously first so Swapy releases the DOM before the
    // next tick re-render.
    swapyInstance?.destroy();
    swapyInstance = null;

    void (async () => {
      await tick(); // wait for Svelte to reconcile the DOM
      if (cancelled || !gridEl || !activeDash?.items.length) return;

      const grid = gridEl;
      const dash = activeDash;

      swapyInstance = createSwapy(grid, {
        animation: "dynamic",
        swapMode: "hover",
      });

      swapyInstance.onSwapEnd(() => {
        // Read DOM order after swap and persist to store.
        // The store update changes layoutKey → this effect re-runs → Swapy re-inits.
        const newOrder = Array.from(
          grid.querySelectorAll("[data-swapy-item]"),
        )
          .map((el) => el.getAttribute("data-swapy-item"))
          .filter(/** @param {string|null} id */ (id) => id !== null);
        reorderItems(dash.id, /** @type {string[]} */ (newOrder));
      });
    })();

    return () => {
      cancelled = true;
      swapyInstance?.destroy();
      swapyInstance = null;
    };
  });

  onDestroy(() => {
    swapyInstance?.destroy();
  });

  // ── Grid layout ────────────────────────────────────────────────────────────
  // Fixed column count so Swapy can predict slot positions reliably.
  const gridStyle = $derived(
    `grid-template-columns: repeat(${activeDash?.columns ?? 3}, 1fr)`,
  );

  /**
   * Clamp span to the current column count so items never overflow the grid.
   * @param {import('$lib/stores/dashboards.js').DashItem} item
   */
  function effectiveSpan(item) {
    return Math.min(item.span, activeDash?.columns ?? 3);
  }

  // ── Chart lookup ───────────────────────────────────────────────────────────
  /** @param {string | null} chartId */
  function getChart(chartId) {
    return chartId ? ($savedCharts.find((c) => c.id === chartId) ?? null) : null;
  }

  // ── Delete active dashboard ────────────────────────────────────────────────
  let confirmDeleteDash = $state(false);

  function handleDeleteDashboard() {
    if (!activeDash) return;
    if (confirmDeleteDash) {
      deleteDashboard(activeDash.id);
      confirmDeleteDash = false;
    } else {
      confirmDeleteDash = true;
      setTimeout(() => { confirmDeleteDash = false; }, 3000);
    }
  }
</script>

{#if !connection}
  <div class="flex min-h-0 flex-1 items-center justify-center bg-panel">
    <div class="flex flex-col items-center gap-2 text-center">
      <LayoutGrid class="size-8 text-muted-foreground/25" />
      <p class="text-ui-sm text-muted-foreground">Connect to a database to view dashboards</p>
    </div>
  </div>
{:else}
<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <!-- Header -->
  <div
    class="studio-chrome flex h-10 shrink-0 items-center gap-2 border-b border-border bg-panel px-3"
    data-studio-chrome
  >
    <LayoutGrid class="size-4 shrink-0 text-muted-foreground/50" />

    <!-- Dashboard selector -->
    <div class="relative">
      <button
        type="button"
        class="flex h-7 items-center gap-1.5 rounded-md border border-border/50 bg-background/60 px-2.5 text-ui-xs font-medium transition-colors hover:bg-accent"
        onclick={() => (dashDropdownOpen = !dashDropdownOpen)}
      >
        {#if editingName}
          <span class="flex items-center gap-1">
            <input
              type="text"
              bind:value={editNameInput}
              class="w-32 bg-transparent font-medium outline-none"
              onblur={commitEditName}
              onkeydown={(e) => {
                if (e.key === "Enter") commitEditName();
                if (e.key === "Escape") editingName = false;
              }}
              onclick={(e) => e.stopPropagation()}
            />
            <span
              role="button"
              tabindex="0"
              class="cursor-pointer text-primary"
              onclick={(e) => { e.stopPropagation(); commitEditName(); }}
              onkeydown={(e) => { if (e.key === "Enter") commitEditName(); }}
            >
              <Check class="size-3" />
            </span>
          </span>
        {:else}
          <span>{activeDash?.name ?? "Select dashboard"}</span>
          <ChevronDown class="size-3 text-muted-foreground/60" />
        {/if}
      </button>

      {#if dashDropdownOpen}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="absolute left-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
          onmouseleave={() => (dashDropdownOpen = false)}
        >
          {#each $dashboards as d (d.id)}
            <button
              type="button"
              class={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-ui-xs transition-colors hover:bg-accent",
                d.id === $activeDashboardId
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
              onclick={() => { activeDashboardId.set(d.id); dashDropdownOpen = false; }}
            >
              <LayoutGrid class="size-3 shrink-0" />
              <span class="flex-1 truncate">{d.name}</span>
              {#if d.id !== $activeDashboardId}
                <span
                  role="button"
                  tabindex="0"
                  class="cursor-pointer text-muted-foreground/30 hover:text-destructive"
                  onclick={(e) => { e.stopPropagation(); deleteDashboard(d.id); }}
                  onkeydown={(e) => { if (e.key === "Enter") { e.stopPropagation(); deleteDashboard(d.id); } }}
                >
                  <X class="size-3" />
                </span>
              {/if}
            </button>
          {/each}

          <div class="border-t border-border/50 px-2 py-1.5">
            {#if namingOpen}
              <div class="flex items-center gap-1">
                <input
                  type="text"
                  bind:value={nameInput}
                  placeholder="Dashboard name…"
                  class="h-5 flex-1 rounded border border-border/60 bg-background px-1.5 font-mono text-ui-2xs outline-none focus:border-ring"
                  onkeydown={(e) => {
                    if (e.key === "Enter") handleCreateDashboard();
                    if (e.key === "Escape") namingOpen = false;
                  }}
                />
                <button type="button" class="text-primary" onclick={handleCreateDashboard}>
                  <Check class="size-3" />
                </button>
              </div>
            {:else}
              <button
                type="button"
                class="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-ui-xs text-muted-foreground/60 transition-colors hover:text-foreground"
                onclick={() => { namingOpen = true; nameInput = ""; }}
              >
                <Plus class="size-3" />
                New
              </button>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    {#if activeDash}
      <!-- Rename -->
      <button
        type="button"
        class="inline-flex size-6 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-muted/60 hover:text-foreground"
        title="Rename dashboard"
        onclick={startEditName}
      >
        <Pencil class="size-3" />
      </button>

      <!-- Column count cycle -->
      <div class="flex items-center gap-px rounded border border-border/50">
        {#each COL_OPTIONS as cols (cols)}
          <button
            type="button"
            class={cn(
              "flex h-6 w-7 items-center justify-center text-ui-2xs transition-colors first:rounded-l last:rounded-r",
              activeDash.columns === cols
                ? "bg-primary/15 text-primary font-medium"
                : "text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground",
            )}
            title="{cols} columns"
            onclick={() => updateDashboard(activeDash.id, { columns: cols })}
          >{cols}</button>
        {/each}
      </div>

      <!-- Delete -->
      <button
        type="button"
        class={cn(
          "inline-flex size-6 items-center justify-center rounded transition-colors",
          confirmDeleteDash
            ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
            : "text-muted-foreground/30 hover:bg-muted/60 hover:text-destructive",
        )}
        title={confirmDeleteDash ? "Click again to confirm delete" : "Delete dashboard"}
        onclick={handleDeleteDashboard}
      >
        <Trash2 class="size-3" />
      </button>
    {/if}

    <div class="ml-auto flex items-center gap-1.5">
      {#if activeDash}
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-ui-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          onclick={() => (pickerOpen = true)}
        >
          <Plus class="size-3.5" />
          Add Chart
        </button>
      {/if}
    </div>
  </div>

  <!-- Content -->
  <div class="min-h-0 flex-1 overflow-y-auto p-4">
    {#if !activeDash}
      <div class="flex h-full min-h-[300px] flex-col items-center justify-center gap-4">
        <div class="flex size-16 items-center justify-center rounded-2xl bg-muted/30">
          <LayoutGrid class="size-8 text-muted-foreground/20" />
        </div>
        <div class="text-center">
          <p class="font-medium text-foreground/60">No dashboard yet</p>
          <p class="mt-1 text-ui-sm text-muted-foreground/50">
            Create a dashboard to arrange your saved charts
          </p>
        </div>
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          onclick={() => createDashboard("My Dashboard")}
        >
          <Plus class="size-4" />
          Create Dashboard
        </button>
      </div>

    {:else if activeDash.items.length === 0}
      <div class="flex h-full min-h-[300px] flex-col items-center justify-center gap-4">
        <div class="flex size-16 items-center justify-center rounded-2xl border-2 border-dashed border-border/40">
          <BarChart2 class="size-8 text-muted-foreground/20" />
        </div>
        <p class="text-ui-sm text-muted-foreground/50">Add charts to build your dashboard</p>
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onclick={() => (pickerOpen = true)}
        >
          <Plus class="size-4" />
          Add Chart
        </button>
      </div>

    {:else}
      <!-- Dashboard grid — fixed columns so Swapy can compute slot positions reliably -->
      <div bind:this={gridEl} class="grid gap-3" style={gridStyle}>
        {#each activeDash.items as item (item.id)}
          {@const chart = getChart(item.chartId)}
          {@const span = effectiveSpan(item)}
          <div
            data-swapy-slot={item.id}
            style="grid-column: span {span}"
          >
            <div
              data-swapy-item={item.id}
              class="group flex h-[260px] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md"
            >
              <!-- Card header -->
              <div class="flex h-9 shrink-0 items-center gap-1 border-b border-border/40 bg-card px-2">
                <!-- Drag handle -->
                <div
                  data-swapy-handle
                  class="flex size-6 cursor-grab items-center justify-center rounded text-muted-foreground/30 transition-colors hover:text-muted-foreground active:cursor-grabbing"
                  title="Drag to reorder"
                >
                  <Grip class="size-3.5" />
                </div>

                <!-- Title -->
                <span class="min-w-0 flex-1 truncate text-ui-xs font-medium text-foreground/80">
                  {chart?.name ?? "Unknown chart"}
                </span>

                <!-- Span selector (1 … columns) -->
                <div class="flex items-center gap-px opacity-0 transition-opacity group-hover:opacity-100">
                  {#each Array.from({ length: activeDash.columns }, (_, i) => i + 1) as s (s)}
                    <button
                      type="button"
                      onclick={() => setItemSpan(activeDash.id, item.id, /** @type {1|2|3} */ (s))}
                      class={cn(
                        "flex size-5 items-center justify-center rounded text-ui-2xs font-mono transition-colors",
                        span === s
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground/40 hover:bg-muted/60 hover:text-foreground",
                      )}
                      title="{s} column{s > 1 ? 's' : ''}"
                    >{s}</button>
                  {/each}
                </div>

                <!-- Remove -->
                <button
                  type="button"
                  onclick={() => removeChartFromDashboard(activeDash.id, item.id)}
                  class="ml-1 flex size-5 items-center justify-center rounded text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/40 hover:!text-destructive"
                  title="Remove from dashboard"
                >
                  <X class="size-3" />
                </button>
              </div>

              <!-- Chart body -->
              <div class="relative min-h-0 flex-1">
                {#if chart?.previewOption && Object.keys(chart.previewOption).length > 0}
                  <EChartPanel option={chart.previewOption} class="absolute inset-0" />
                {:else}
                  <div class="absolute inset-0 flex items-center justify-center gap-2 text-muted-foreground/30">
                    <BarChart2 class="size-6" />
                    <span class="text-ui-xs">No preview</span>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
{/if}

<!-- Chart picker modal -->
{#if pickerOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
    onclick={(e) => { if (e.target === e.currentTarget) pickerOpen = false; }}
    onkeydown={(e) => { if (e.key === "Escape") pickerOpen = false; }}
  >
    <div class="flex w-[480px] max-h-[70vh] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
      <div class="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
        <span class="text-sm font-semibold">Add chart to dashboard</span>
        <button type="button" onclick={() => (pickerOpen = false)} class="text-muted-foreground/50 hover:text-foreground">
          <X class="size-4" />
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-3">
        {#if $savedCharts.length === 0}
          <div class="py-10 text-center text-ui-sm text-muted-foreground/50">
            No saved charts yet. Save a chart from the Query Editor first.
          </div>
        {:else}
          <div class="grid grid-cols-2 gap-2">
            {#each $savedCharts as chart (chart.id)}
              <button
                type="button"
                onclick={() => pickChart(chart.id)}
                class="group flex flex-col overflow-hidden rounded-lg border border-border/50 bg-background text-left transition-colors hover:border-primary/50 hover:bg-accent/30"
              >
                <div class="relative h-[100px] border-b border-border/30 bg-muted/20">
                  {#if chart.previewOption && Object.keys(chart.previewOption).length > 0}
                    <EChartPanel option={chart.previewOption} class="absolute inset-0" />
                  {:else}
                    <div class="absolute inset-0 flex items-center justify-center text-muted-foreground/25">
                      <BarChart2 class="size-8" />
                    </div>
                  {/if}
                </div>
                <div class="px-2.5 py-1.5">
                  <p class="truncate text-ui-xs font-medium text-foreground/80">{chart.name}</p>
                  <p class="text-[10px] text-muted-foreground/50">{chart.group}</p>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
