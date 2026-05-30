<script>
  import { onDestroy } from "svelte";
  import { toast } from "svelte-sonner";
  import Download from "@lucide/svelte/icons/download";
  import Upload from "@lucide/svelte/icons/upload";
  import Check from "@lucide/svelte/icons/check";
  import AlertTriangle from "@lucide/svelte/icons/alert-triangle";
  import Loader from "@lucide/svelte/icons/loader";
  import FileText from "@lucide/svelte/icons/file-text";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import SquareCheck from "@lucide/svelte/icons/square-check";
  import Square from "@lucide/svelte/icons/square";
  import X from "@lucide/svelte/icons/x";
  import StopCircle from "@lucide/svelte/icons/stop-circle";
  import { backupExport, backupImport } from "$lib/api.js";
  import { cn } from "$lib/utils.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";

  /** @typedef {{ name: string, rowCount?: number }} TableRow */

  let {
    /** @type {'postgres'|'sqlite'|'mysql'|'d1'|null} */
    dbType = null,
    activeSchema = /** @type {string|null} */ (null),
    schemas = /** @type {string[]} */ ([]),
    /** @type {TableRow[]} */
    tables = [],
  } = $props();

  /** @type {'backup'|'restore'} */
  let activeTab = $state("backup");

  const supportsSchemaFilter = $derived(
    dbType === "postgres" || dbType === "mysql",
  );
  const isPostgres = $derived(dbType === "postgres");
  const isMysql = $derived(dbType === "mysql");
  const isSqliteFamily = $derived(dbType === "sqlite" || dbType === "d1");
  const dbLabel = $derived(
    dbType === "postgres"
      ? "PostgreSQL"
      : dbType === "mysql"
        ? "MySQL"
        : dbType === "sqlite"
          ? "SQLite"
          : dbType === "d1"
            ? "Cloudflare D1"
            : "Unknown",
  );

  // ── Export state ──────────────────────────────────────────────────────────
  let exportSchema = $state("");
  $effect(() => {
    exportSchema = activeSchema ?? "";
  });
  /** @type {'idle'|'running'|'done'|'error'} */
  let exportPhase = $state("idle");
  /** @type {{sql:string,tableCount:number,rowCount:number}|null} */
  let exportResult = $state(null);
  let exportError = $state("");
  let exportCancelled = $state(false);

  // Export options
  let optIncludeSchema = $state(true);
  let optIncludeData = $state(true);
  let optIncludeSequences = $state(true);
  let optIncludeEnums = $state(true);
  let optIncludeFunctions = $state(true);
  let optIncludeTriggers = $state(true);
  let optIncludeViews = $state(true);

  // Table selection
  /** @type {Set<string>} */
  /** @type {Set<string>} */
  let selectedTables = $state(new Set());
  $effect(() => {
    selectedTables = new Set(tables.map((t) => t.name));
  });

  function toggleTable(/** @type {string} */ name) {
    const next = new Set(selectedTables);
    next.has(name) ? next.delete(name) : next.add(name);
    selectedTables = next;
  }
  function selectAll() {
    selectedTables = new Set(tables.map((t) => t.name));
  }
  function selectNone() {
    selectedTables = new Set();
  }

  // Live log (backup)
  /** @type {{level:string,message:string,ts:number}[]} */
  let exportLogs = $state([]);
  let exportLogEl = $state(/** @type {HTMLElement|null} */ (null));
  let unlistenExport = /** @type {(() => void)|null} */ (null);

  async function startExportLog() {
    try {
      const { listen } = await import("@tauri-apps/api/event");
      unlistenExport = await listen("backup-log", (/** @type {any} */ e) => {
        exportLogs = [...exportLogs, { ...e.payload, ts: Date.now() }];
        setTimeout(() => {
          if (exportLogEl) exportLogEl.scrollTop = exportLogEl.scrollHeight;
        }, 0);
      });
    } catch {
      /* dev */
    }
  }
  function stopExportLog() {
    if (unlistenExport) {
      unlistenExport();
      unlistenExport = null;
    }
  }

  // Live log (restore)
  /** @type {{level:string,message:string,ts:number}[]} */
  let restoreLogs = $state([]);
  let restoreLogEl = $state(/** @type {HTMLElement|null} */ (null));
  let unlistenRestore = /** @type {(() => void)|null} */ (null);

  async function startRestoreLog() {
    try {
      const { listen } = await import("@tauri-apps/api/event");
      unlistenRestore = await listen("restore-log", (/** @type {any} */ e) => {
        restoreLogs = [...restoreLogs, { ...e.payload, ts: Date.now() }];
        setTimeout(() => {
          if (restoreLogEl) restoreLogEl.scrollTop = restoreLogEl.scrollHeight;
        }, 0);
      });
    } catch {
      /* dev */
    }
  }
  function stopRestoreLog() {
    if (unlistenRestore) {
      unlistenRestore();
      unlistenRestore = null;
    }
  }

  onDestroy(() => {
    stopExportLog();
    stopRestoreLog();
  });

  // ── Export ────────────────────────────────────────────────────────────────
  async function runExport() {
    if (selectedTables.size === 0) {
      toast.error("Select at least one table");
      return;
    }
    exportPhase = "running";
    exportResult = null;
    exportError = "";
    exportCancelled = false;
    exportLogs = [];
    await startExportLog();
    try {
      const schema = supportsSchemaFilter && exportSchema ? exportSchema : null;
      const tableList =
        tables.length > 0 && selectedTables.size < tables.length
          ? [...selectedTables]
          : null;
      const result = await backupExport(schema, tableList, {
        includeSchema: optIncludeSchema,
        includeData: optIncludeData,
        includeSequences: optIncludeSequences,
        includeEnums: optIncludeEnums,
        includeFunctions: optIncludeFunctions,
        includeTriggers: optIncludeTriggers,
        includeViews: optIncludeViews,
      });
      if (exportCancelled) return;
      exportResult = result;
      exportPhase = "done";
    } catch (e) {
      if (exportCancelled) return;
      exportError = String(/** @type {any} */ (e)?.message ?? e);
      exportPhase = "error";
      toast.error("Export failed");
    } finally {
      stopExportLog();
    }
  }

  function stopExport() {
    exportCancelled = true;
    stopExportLog();
    exportPhase = "idle";
    exportLogs = [];
    toast.info("Export stopped");
  }

  function downloadSql() {
    if (!exportResult?.sql) return;
    const blob = new Blob([exportResult.sql], {
      type: "text/sql;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date()
      .toISOString()
      .slice(0, 19)
      .replace("T", "_")
      .replace(/:/g, "-");
    const schemaSlug =
      supportsSchemaFilter && exportSchema ? `_${exportSchema}` : "";
    a.download = `backup_${dbLabel.toLowerCase().replace(/\s+/g, "_")}${schemaSlug}_${ts}.sql`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup file downloaded");
  }

  function resetExport() {
    exportPhase = "idle";
    exportResult = null;
    exportError = "";
    exportLogs = [];
  }

  // ── Import ────────────────────────────────────────────────────────────────
  /** @type {'idle'|'running'|'done'|'error'} */
  let importPhase = $state("idle");
  /** @type {{statementsOk:number,statementsErr:number,errors:string[]}|null} */
  let importResult = $state(null);
  let importError = $state("");
  let importSql = $state("");
  let importFileName = $state("");
  let importFileSize = $state("");
  let showImportErrors = $state(false);
  let importConfirmed = $state(false);
  let importCancelled = $state(false);

  function onFileSelect(/** @type {Event} */ e) {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const file = input.files?.[0];
    if (!file) return;
    importFileName = file.name;
    importFileSize = fmtFileSize(file.size);
    importConfirmed = false;
    const reader = new FileReader();
    reader.onload = (ev) => {
      importSql = /** @type {string} */ (ev.target?.result ?? "");
    };
    reader.readAsText(file);
    input.value = "";
  }

  function discardFile() {
    importSql = "";
    importFileName = "";
    importFileSize = "";
    importConfirmed = false;
  }

  async function runImport() {
    if (!importSql.trim()) {
      toast.error("No SQL loaded");
      return;
    }
    importPhase = "running";
    importResult = null;
    importError = "";
    importCancelled = false;
    showImportErrors = false;
    restoreLogs = [];
    await startRestoreLog();
    try {
      const result = await backupImport(importSql);
      if (importCancelled) return;
      importResult = result;
      importPhase = "done";
      if (result.statementsErr === 0) {
        toast.success(`Restore complete — ${result.statementsOk} statements`);
      } else {
        toast.warning(`Restore finished with ${result.statementsErr} error(s)`);
      }
    } catch (e) {
      if (importCancelled) return;
      importError = String(/** @type {any} */ (e)?.message ?? e);
      importPhase = "error";
      toast.error("Restore failed");
    } finally {
      stopRestoreLog();
    }
  }

  function stopImport() {
    importCancelled = true;
    stopRestoreLog();
    importPhase = "idle";
    toast.info("Restore stopped");
  }

  function resetImport() {
    importPhase = "idle";
    importResult = null;
    importError = "";
    importSql = "";
    importFileName = "";
    importFileSize = "";
    showImportErrors = false;
    importConfirmed = false;
    importCancelled = false;
    restoreLogs = [];
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fmtRows(/** @type {number} */ n) {
    if (n == null || n < 0) return "—";
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
    return String(n);
  }
  function fmtBytes(/** @type {string} */ sql) {
    const b = new TextEncoder().encode(sql).length;
    if (b >= 1_048_576) return (b / 1_048_576).toFixed(1) + " MB";
    if (b >= 1_024) return (b / 1_024).toFixed(1) + " KB";
    return b + " B";
  }
  function fmtFileSize(/** @type {number} */ b) {
    if (b >= 1_048_576) return (b / 1_048_576).toFixed(1) + " MB";
    if (b >= 1_024) return (b / 1_024).toFixed(1) + " KB";
    return b + " B";
  }
  /** @type {Record<string, string>} */
  const logColor = {
    info: "text-muted-foreground",
    ok: "text-green-400",
    warn: "text-amber-400",
    error: "text-destructive",
  };
</script>

{#snippet optionRow(checked, onChange, label, hint = "")}
  <button
    type="button"
    class="flex w-full items-center gap-2.5 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-accent/20"
    onclick={() => onChange(!checked)}
  >
    <Checkbox {checked} class="pointer-events-none shrink-0" />
    <span class="min-w-0 flex-1">
      <span class="block text-ui-xs text-foreground/80">{label}</span>
      {#if hint}
        <span class="block text-ui-3xs text-muted-foreground/50">{hint}</span>
      {/if}
    </span>
  </button>
{/snippet}

{#snippet exportLogPanel()}
  <div class="flex min-w-0 flex-1 flex-col">
    <div
      class="studio-chrome flex shrink-0 items-center gap-2 border-b border-border/40 px-4 py-2"
      data-studio-chrome
    >
      <span
        class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >Live log</span
      >
      {#if exportPhase === "running"}
        <Loader class="ml-auto size-3 animate-spin text-muted-foreground" />
      {:else if exportLogs.length > 0}
        <span class="ml-auto text-[10px] text-muted-foreground/50"
          >{exportLogs.length} entries</span
        >
      {/if}
    </div>
    <div
      bind:this={exportLogEl}
      class="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-4 font-mono"
    >
      {#if exportLogs.length === 0}
        <p class="text-[11px] text-muted-foreground/30">
          Run an export to see progress here.
        </p>
      {:else}
        {#each exportLogs as entry (entry.ts + entry.message)}
          <div
            class="mb-0.5 text-[11px] leading-relaxed {logColor[entry.level] ??
              'text-muted-foreground'}"
          >
            {entry.message}
          </div>
        {/each}
        {#if exportPhase === "running"}
          <div
            class="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/50"
          >
            <Loader class="size-3 animate-spin" /><span>Running…</span>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/snippet}

{#snippet restoreLogPanel()}
  <div class="flex min-w-0 flex-1 flex-col">
    <div
      class="studio-chrome flex shrink-0 items-center gap-2 border-b border-border/40 px-4 py-2"
      data-studio-chrome
    >
      <span
        class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >Live log</span
      >
      {#if importPhase === "running"}
        <Loader class="ml-auto size-3 animate-spin text-muted-foreground" />
      {:else if restoreLogs.length > 0}
        <span class="ml-auto text-[10px] text-muted-foreground/50"
          >{restoreLogs.length} entries</span
        >
      {/if}
    </div>
    <div
      bind:this={restoreLogEl}
      class="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-4 font-mono"
    >
      {#if restoreLogs.length === 0}
        <p class="text-[11px] text-muted-foreground/30">
          {importPhase === "idle"
            ? "Run a restore to see progress here."
            : "Waiting for log entries…"}
        </p>
      {:else}
        {#each restoreLogs as entry (entry.ts + entry.message)}
          <div
            class="mb-0.5 text-[11px] leading-relaxed {logColor[entry.level] ??
              'text-muted-foreground'}"
          >
            {entry.message}
          </div>
        {/each}
        {#if importPhase === "running"}
          <div
            class="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/50"
          >
            <Loader class="size-3 animate-spin" /><span>Running…</span>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/snippet}

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <!-- Tab bar -->
  <div
    class="studio-chrome flex shrink-0 items-center gap-1 border-b border-border px-3"
    data-studio-chrome
  >
    <button
      type="button"
      class={cn(
        "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
        activeTab === "backup"
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
      onclick={() => (activeTab = "backup")}
    >
      <Download class="size-3.5" />Backup
    </button>
    <button
      type="button"
      class={cn(
        "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
        activeTab === "restore"
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
      onclick={() => (activeTab = "restore")}
    >
      <Upload class="size-3.5" />Restore
    </button>
  </div>

  <!-- ── Backup tab ─────────────────────────────────────────────────────────── -->
  {#if activeTab === "backup"}
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <!-- Left: config -->
      <div class="flex w-72 shrink-0 flex-col border-r border-border/50">
        <div class="min-h-0 flex-1 overflow-y-auto">
          <!-- DB label -->
          <div class="border-b border-border/30 px-4 py-3">
            <p
              class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              Database
            </p>
            <p class="mt-0.5 font-mono text-xs text-foreground">{dbLabel}</p>
          </div>

          <!-- Schema picker -->
          {#if supportsSchemaFilter && schemas.length > 0}
            <div class="border-b border-border/30 px-4 py-3">
              <label
                for="export-schema-select"
                class="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >Schema</label
              >
              <div class="relative">
                <select
                  id="export-schema-select"
                  bind:value={exportSchema}
                  class="h-8 w-full appearance-none rounded-md border border-border/60 bg-background pl-3 pr-8 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                >
                  <option value="">All schemas</option>
                  {#each schemas as s (s)}<option value={s}>{s}</option>{/each}
                </select>
                <ChevronDown
                  class="pointer-events-none absolute right-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/50"
                />
              </div>
            </div>
          {/if}

          <!-- What to include -->
          <div class="border-b border-border/30 px-4 py-3">
            <p
              class="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              Include
            </p>
            <div class="flex flex-col">
              {@render optionRow(
                optIncludeSchema,
                (v) => (optIncludeSchema = v),
                "Schema / DDL",
              )}
              {@render optionRow(
                optIncludeData,
                (v) => (optIncludeData = v),
                "Data",
              )}
              {#if !isSqliteFamily}
                {@render optionRow(
                  optIncludeViews,
                  (v) => (optIncludeViews = v),
                  "Views",
                )}
                {@render optionRow(
                  optIncludeFunctions,
                  (v) => (optIncludeFunctions = v),
                  "Functions & Procedures",
                )}
                {@render optionRow(
                  optIncludeTriggers,
                  (v) => (optIncludeTriggers = v),
                  "Triggers",
                )}
              {/if}
              {#if isPostgres}
                {@render optionRow(
                  optIncludeSequences,
                  (v) => (optIncludeSequences = v),
                  "Sequences",
                )}
                {@render optionRow(
                  optIncludeEnums,
                  (v) => (optIncludeEnums = v),
                  "Custom types (enums)",
                )}
              {/if}
              {#if isSqliteFamily}
                {@render optionRow(
                  optIncludeViews,
                  (v) => (optIncludeViews = v),
                  "Views",
                )}
                {@render optionRow(
                  optIncludeTriggers,
                  (v) => (optIncludeTriggers = v),
                  "Triggers",
                )}
              {/if}
            </div>
          </div>

          <!-- Table selection -->
          <div class="px-4 py-3">
            <div class="mb-2 flex items-center justify-between">
              <span
                class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                Tables
                {#if tables.length > 0}
                  <span class="ml-1 text-muted-foreground/50"
                    >{selectedTables.size}/{tables.length}</span
                  >
                {/if}
              </span>
              {#if tables.length > 0}
                <div class="flex gap-2 text-[10px] text-muted-foreground">
                  <button
                    type="button"
                    class="hover:text-foreground"
                    onclick={selectAll}>All</button
                  >
                  <span class="text-border">·</span>
                  <button
                    type="button"
                    class="hover:text-foreground"
                    onclick={selectNone}>None</button
                  >
                </div>
              {/if}
            </div>

            {#if tables.length === 0}
              <p class="text-[11px] text-muted-foreground/40">
                No tables found.
              </p>
            {:else}
              <div
                class="flex max-h-48 flex-col divide-y divide-border/20 overflow-y-auto rounded-md border border-border/40"
              >
                {#each tables as t (t.name)}
                  {@const checked = selectedTables.has(t.name)}
                  <button
                    type="button"
                    class="flex items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors hover:bg-accent/20 {checked
                      ? ''
                      : 'opacity-50'}"
                    onclick={() => toggleTable(t.name)}
                  >
                    {#if checked}
                      <SquareCheck class="size-3.5 shrink-0 text-primary" />
                    {:else}
                      <Square
                        class="size-3.5 shrink-0 text-muted-foreground/30"
                      />
                    {/if}
                    <span
                      class="min-w-0 flex-1 truncate font-mono text-xs text-foreground"
                      >{t.name}</span
                    >
                    {#if t.rowCount != null && t.rowCount >= 0}
                      <span
                        class="shrink-0 font-mono text-[10px] text-muted-foreground/50"
                        >{fmtRows(t.rowCount)}</span
                      >
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>

          {#if exportPhase === "done" && exportResult}
            <div class="px-4 pb-3">
              <div
                class="rounded-md border border-green-700/30 bg-green-900/10 p-3"
              >
                <div class="flex items-center gap-2">
                  <Check class="size-3.5 shrink-0 text-green-400" />
                  <span class="text-xs font-medium text-foreground"
                    >Export ready</span
                  >
                </div>
                <div
                  class="mt-2 grid grid-cols-3 gap-1 font-mono text-[10px] text-muted-foreground"
                >
                  <span
                    >{exportResult.tableCount} table{exportResult.tableCount ===
                    1
                      ? ""
                      : "s"}</span
                  >
                  <span>{fmtRows(exportResult.rowCount)} rows</span>
                  <span>{fmtBytes(exportResult.sql)}</span>
                </div>
              </div>
            </div>
          {:else if exportPhase === "error"}
            <div class="px-4 pb-3">
              <div
                class="rounded-md border border-destructive/30 bg-destructive/8 p-3 text-xs text-destructive"
              >
                <AlertTriangle class="mb-1 size-3.5" />
                <span class="break-words">{exportError}</span>
              </div>
            </div>
          {/if}
        </div>

        <!-- Action bar -->
        <div class="shrink-0 border-t border-border/40 p-3">
          {#if exportPhase === "idle" || exportPhase === "error"}
            <button
              type="button"
              disabled={selectedTables.size === 0}
              onclick={runExport}
              class="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              <Download class="size-3.5" />
              Export {selectedTables.size} table{selectedTables.size === 1
                ? ""
                : "s"}
            </button>
          {:else if exportPhase === "running"}
            <div class="flex gap-2">
              <button
                disabled
                class="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary/60 px-4 py-2 text-xs font-medium text-primary-foreground"
              >
                <Loader class="size-3.5 animate-spin" />Exporting…
              </button>
              <button
                type="button"
                onclick={stopExport}
                title="Stop export"
                class="flex items-center justify-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/8 hover:text-destructive"
              >
                <StopCircle class="size-3.5" />Stop
              </button>
            </div>
          {:else if exportPhase === "done" && exportResult}
            <div class="flex gap-2">
              <button
                type="button"
                onclick={downloadSql}
                class="flex flex-1 items-center justify-center gap-2 rounded-md bg-green-700 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-green-600"
              >
                <Download class="size-3.5" />Download .sql
              </button>
              <button
                type="button"
                onclick={resetExport}
                class="rounded-md border border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/20"
              >
                Reset
              </button>
            </div>
          {/if}
        </div>
      </div>

      <!-- Right: live log -->
      {@render exportLogPanel()}
    </div>

    <!-- ── Restore tab ────────────────────────────────────────────────────────── -->
  {:else}
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <!-- Left: file + confirm + results -->
      <div class="flex w-80 shrink-0 flex-col border-r border-border/50">
        <div class="min-h-0 flex-1 overflow-y-auto p-5">
          {#if importPhase === "idle"}
            <!-- File zone -->
            {#if importFileName}
              <div
                class="mb-4 flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-3.5"
              >
                <div
                  class="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background"
                >
                  <FileText class="size-4 text-muted-foreground/60" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-xs font-medium text-foreground">
                    {importFileName}
                  </p>
                  <p class="mt-0.5 text-[10px] text-muted-foreground">
                    {importFileSize} · SQL file
                  </p>
                  <div class="mt-2 flex items-center gap-2">
                    <label
                      class="cursor-pointer text-[11px] text-primary hover:underline"
                    >
                      <input
                        type="file"
                        accept=".sql,.txt"
                        class="sr-only"
                        onchange={onFileSelect}
                      />
                      Replace
                    </label>
                    <span class="text-border">·</span>
                    <button
                      type="button"
                      onclick={discardFile}
                      class="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"
                    >
                      <X class="size-3" />Discard
                    </button>
                  </div>
                </div>
              </div>
            {:else}
              <label class="mb-4 block cursor-pointer">
                <input
                  type="file"
                  accept=".sql,.txt"
                  class="sr-only"
                  onchange={onFileSelect}
                />
                <div
                  class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/50 bg-muted/10 px-4 py-10 text-center transition-colors hover:bg-muted/20"
                >
                  <div
                    class="flex size-11 items-center justify-center rounded-xl border border-border/50 bg-background shadow-sm"
                  >
                    <FileText class="size-5 text-muted-foreground/40" />
                  </div>
                  <div>
                    <p class="text-xs font-medium text-foreground">
                      Select a SQL backup file
                    </p>
                    <p class="mt-0.5 text-[10px] text-muted-foreground/60">
                      Supports <span class="font-mono">.sql</span> and
                      <span class="font-mono">.txt</span>
                    </p>
                  </div>
                  <span
                    class="rounded-md border border-border/60 bg-background px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm"
                    >Browse file…</span
                  >
                </div>
              </label>
            {/if}

            <!-- Confirm block -->
            {#if importSql}
              <div
                class="rounded-xl border border-amber-600/25 bg-amber-500/5 p-4"
              >
                <div class="mb-2.5 flex items-center gap-2">
                  <AlertTriangle class="size-3.5 shrink-0 text-amber-500" />
                  <span class="text-xs font-semibold text-foreground"
                    >Confirm restore</span
                  >
                </div>
                <p
                  class="mb-3 text-[11px] leading-relaxed text-muted-foreground"
                >
                  Executes SQL against <strong class="text-foreground"
                    >{dbLabel}</strong
                  >. Existing data may be overwritten. This cannot be undone.
                </p>
                <label class="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    bind:checked={importConfirmed}
                    class="mt-0.5 shrink-0 accent-amber-500"
                  />
                  <span class="text-[11px] text-muted-foreground"
                    >I understand and want to proceed</span
                  >
                </label>
              </div>
            {/if}
          {:else if importPhase === "running"}
            <div class="flex flex-col items-center justify-center gap-4 py-12">
              <div class="relative flex size-14 items-center justify-center">
                <div
                  class="absolute inset-0 animate-ping rounded-full bg-primary/10"
                ></div>
                <div
                  class="flex size-14 items-center justify-center rounded-full border border-border/60 bg-background shadow"
                >
                  <Loader class="size-6 animate-spin text-primary" />
                </div>
              </div>
              <div class="text-center">
                <p class="text-sm font-medium text-foreground">
                  Executing statements…
                </p>
                <p class="mt-1 text-[11px] text-muted-foreground">
                  This may take a moment.
                </p>
              </div>
            </div>
          {:else if importPhase === "done" && importResult}
            <div
              class="rounded-xl border {importResult.statementsErr === 0
                ? 'border-green-700/30 bg-green-900/8'
                : 'border-amber-600/30 bg-amber-900/8'} p-4"
            >
              <div class="mb-3 flex items-center gap-2.5">
                {#if importResult.statementsErr === 0}
                  <div
                    class="flex size-8 shrink-0 items-center justify-center rounded-full border border-green-700/30 bg-green-900/20"
                  >
                    <Check class="size-3.5 text-green-400" />
                  </div>
                  <div>
                    <p class="text-xs font-semibold text-foreground">
                      Restore complete
                    </p>
                    <p class="text-[10px] text-muted-foreground">
                      All statements succeeded
                    </p>
                  </div>
                {:else}
                  <div
                    class="flex size-8 shrink-0 items-center justify-center rounded-full border border-amber-600/30 bg-amber-900/20"
                  >
                    <AlertTriangle class="size-3.5 text-amber-400" />
                  </div>
                  <div>
                    <p class="text-xs font-semibold text-foreground">
                      Finished with errors
                    </p>
                    <p class="text-[10px] text-muted-foreground">
                      Some statements failed
                    </p>
                  </div>
                {/if}
              </div>

              <div
                class="flex gap-5 rounded-lg border border-border/40 bg-background/60 px-3 py-2.5 font-mono text-xs"
              >
                <div>
                  <p
                    class="text-[10px] uppercase tracking-wide text-muted-foreground/60"
                  >
                    OK
                  </p>
                  <p class="mt-0.5 font-semibold text-green-400">
                    {importResult.statementsOk}
                  </p>
                </div>
                {#if importResult.statementsErr > 0}
                  <div>
                    <p
                      class="text-[10px] uppercase tracking-wide text-muted-foreground/60"
                    >
                      Failed
                    </p>
                    <p class="mt-0.5 font-semibold text-destructive">
                      {importResult.statementsErr}
                    </p>
                  </div>
                {/if}
              </div>

              {#if importResult.errors.length > 0}
                <button
                  type="button"
                  class="mt-3 text-[11px] text-muted-foreground underline"
                  onclick={() => (showImportErrors = !showImportErrors)}
                >
                  {showImportErrors ? "Hide" : "Show"}
                  {importResult.errors.length} error{importResult.errors
                    .length === 1
                    ? ""
                    : "s"}
                </button>
                {#if showImportErrors}
                  <div
                    class="mt-2 max-h-36 overflow-y-auto rounded-lg border border-border/40 bg-background p-2.5"
                  >
                    {#each importResult.errors as err, i (i)}
                      <p class="font-mono text-[10px] text-destructive/80">
                        {err}
                      </p>
                    {/each}
                  </div>
                {/if}
              {/if}
            </div>
          {:else if importPhase === "error"}
            <div
              class="rounded-xl border border-destructive/30 bg-destructive/6 p-4"
            >
              <div class="flex items-start gap-2.5">
                <div
                  class="flex size-8 shrink-0 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10"
                >
                  <AlertTriangle class="size-3.5 text-destructive" />
                </div>
                <div class="min-w-0">
                  <p class="mb-1 text-xs font-semibold text-foreground">
                    Restore failed
                  </p>
                  <p class="break-words text-[11px] text-destructive/80">
                    {importError}
                  </p>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Action bar -->
        <div class="shrink-0 border-t border-border/40 p-3">
          {#if importPhase === "idle"}
            <button
              type="button"
              disabled={!importSql || !importConfirmed}
              onclick={runImport}
              class="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              <Upload class="size-3.5" />Execute restore
            </button>
          {:else if importPhase === "running"}
            <div class="flex gap-2">
              <button
                disabled
                class="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary/60 px-4 py-2 text-xs font-medium text-primary-foreground"
              >
                <Loader class="size-3.5 animate-spin" />Running…
              </button>
              <button
                type="button"
                onclick={stopImport}
                title="Stop restore"
                class="flex items-center justify-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/8 hover:text-destructive"
              >
                <StopCircle class="size-3.5" />Stop
              </button>
            </div>
          {:else}
            <button
              type="button"
              onclick={resetImport}
              class="flex w-full items-center justify-center gap-2 rounded-md border border-border/60 px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/20"
            >
              New restore
            </button>
          {/if}
        </div>
      </div>

      <!-- Right: restore live log -->
      {@render restoreLogPanel()}
    </div>
  {/if}
</div>
