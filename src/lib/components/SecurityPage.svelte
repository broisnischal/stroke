<script>
  import { executeSql } from "$lib/api.js";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";
  import Users from "@lucide/svelte/icons/users";
  import Lock from "@lucide/svelte/icons/lock";
  import LockOpen from "@lucide/svelte/icons/lock-open";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Plus from "@lucide/svelte/icons/plus";
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import { toast } from "svelte-sonner";
  import { cn } from "$lib/utils.js";
  import SecuritySqlModal from "./SecuritySqlModal.svelte";

  let { active = false } = $props();

  /** @type {'roles' | 'policies' | 'rls'} */
  let activeTab = $state("roles");

  /** @type {Record<string, unknown>[] | null} */
  let roles = $state(null);
  let rolesLoading = $state(false);
  let rolesError = $state("");

  /** @type {Record<string, unknown>[] | null} */
  let policies = $state(null);
  let policiesLoading = $state(false);
  let policiesError = $state("");

  /** @type {Record<string, unknown>[] | null} */
  let rlsTables = $state(null);
  let rlsLoading = $state(false);
  let rlsError = $state("");

  /** @type {{ title: string } | null} */
  let sqlModal = $state(null);
  let sqlDraft = $state("");
  let sqlRunning = $state(false);

  /** @type {number | null} */
  let expandedPolicy = $state(null);

  /** @param {{ columns?: {name:string}[], rows?: unknown[][] } | null} result */
  function toRecords(result) {
    if (!result?.columns || !result?.rows) return [];
    const cols = result.columns.map((c) => c.name);
    return result.rows.map(
      (row) =>
        /** @type {Record<string, unknown>} */ (
          Object.fromEntries(cols.map((c, i) => [c, row[i]]))
        ),
    );
  }

  async function loadRoles() {
    rolesLoading = true;
    rolesError = "";
    try {
      roles = toRecords(
        await executeSql(`
        SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin,
               rolreplication, rolbypassrls, rolconnlimit, rolvaliduntil::text AS rolvaliduntil
        FROM pg_catalog.pg_roles ORDER BY rolcanlogin DESC, rolname
      `),
      );
    } catch (e) {
      rolesError = String(e);
    } finally {
      rolesLoading = false;
    }
  }

  async function loadPolicies() {
    policiesLoading = true;
    policiesError = "";
    try {
      policies = toRecords(
        await executeSql(`
        SELECT schemaname, tablename, policyname, permissive,
               array_to_string(roles, ', ') AS roles, cmd, qual, with_check
        FROM pg_catalog.pg_policies ORDER BY schemaname, tablename, policyname
      `),
      );
    } catch (e) {
      policiesError = String(e);
    } finally {
      policiesLoading = false;
    }
  }

  async function loadRls() {
    rlsLoading = true;
    rlsError = "";
    try {
      rlsTables = toRecords(
        await executeSql(`
        SELECT n.nspname AS schema, c.relname AS table_name,
               c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
        ORDER BY n.nspname, c.relname
      `),
      );
    } catch (e) {
      rlsError = String(e);
    } finally {
      rlsLoading = false;
    }
  }

  function refresh() {
    if (activeTab === "roles") {
      roles = null;
      void loadRoles();
    } else if (activeTab === "policies") {
      policies = null;
      void loadPolicies();
    } else {
      rlsTables = null;
      void loadRls();
    }
  }

  async function runSqlModal() {
    if (!sqlDraft.trim()) return;
    sqlRunning = true;
    try {
      await executeSql(sqlDraft);
      toast.success("Executed successfully");
      sqlModal = null;
      refresh();
    } catch (e) {
      toast.error("Execution failed", { description: String(e) });
    } finally {
      sqlRunning = false;
    }
  }

  function openRoleModal(
    /** @type {Record<string,unknown> | null} */ role = null,
  ) {
    if (role) {
      sqlDraft = `ALTER ROLE "${role.rolname}" WITH LOGIN;\n-- OPTIONS: SUPERUSER | CREATEDB | CREATEROLE | REPLICATION | BYPASSRLS\n-- DROP ROLE "${role.rolname}";`;
      sqlModal = { title: `Edit role — ${role.rolname}` };
    } else {
      sqlDraft = `CREATE ROLE new_role WITH LOGIN PASSWORD 'changeme';`;
      sqlModal = { title: "Create role" };
    }
  }

  function openPolicyModal() {
    sqlDraft = `CREATE POLICY policy_name\n  ON public.table_name\n  AS PERMISSIVE        -- or RESTRICTIVE\n  FOR ALL              -- SELECT | INSERT | UPDATE | DELETE\n  TO PUBLIC\n  USING (true)\n  WITH CHECK (true);`;
    sqlModal = { title: "Create policy" };
  }

  /** @param {Record<string,unknown>} row */
  function openRlsModal(row) {
    const on = bool(row.rls_enabled);
    sqlDraft = on
      ? `ALTER TABLE "${row.schema}"."${row.table_name}" DISABLE ROW LEVEL SECURITY;`
      : `ALTER TABLE "${row.schema}"."${row.table_name}" ENABLE ROW LEVEL SECURITY;`;
    sqlModal = {
      title: `${on ? "Disable" : "Enable"} RLS — ${row.schema}.${row.table_name}`,
    };
  }

  $effect(() => {
    if (activeTab === "roles" && roles === null && !rolesLoading) loadRoles();
    else if (activeTab === "policies" && policies === null && !policiesLoading)
      loadPolicies();
    else if (activeTab === "rls" && rlsTables === null && !rlsLoading)
      loadRls();
  });

  const bool = (v) => v === true || v === "t" || v === "true" || v === 1;

  const isLoading = $derived(
    (activeTab === "roles" && (rolesLoading || roles === null)) ||
      (activeTab === "policies" && (policiesLoading || policies === null)) ||
      (activeTab === "rls" && (rlsLoading || rlsTables === null)),
  );

  const TABS = [
    { id: "roles", label: "Roles & Users" },
    { id: "policies", label: "Policies" },
    { id: "rls", label: "Row Level Security" },
  ];
</script>

<svelte:window
  onkeydown={(e) => {
    if (!active || sqlModal) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === "r") {
      e.preventDefault();
      refresh();
    }
  }}
/>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <!-- Header -->
  <div
    class="studio-chrome flex h-9 shrink-0 items-center gap-2 border-b border-border bg-panel px-3"
  >
    <ShieldCheck class="size-3.5 shrink-0 text-muted-foreground" />
    <span class="font-mono text-ui-sm font-medium">Security</span>
    <div class="flex-1"></div>
    <button
      type="button"
      class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
      title="Refresh (⌘R)"
      onclick={refresh}
    >
      <RefreshCw class={cn("size-3.5", isLoading && "animate-spin")} />
    </button>
  </div>

  <!-- Segmented tab control -->
  <div
    class="flex shrink-0 items-center border-b border-border bg-panel px-3 py-2"
  >
    <div
      class="inline-flex h-7 items-center rounded-md border border-border/60 bg-muted/40 p-0.5 ring-1 ring-inset ring-border/40"
    >
      {#each TABS as tab (tab.id)}
        <button
          type="button"
          class={cn(
            "inline-flex h-6 items-center rounded-[5px] px-2.5 font-mono text-ui-2xs transition-all",
            activeTab === tab.id
              ? "bg-card text-foreground shadow-sm ring-1 ring-border/50"
              : "text-muted-foreground hover:text-foreground",
          )}
          onclick={() => {
            activeTab = /** @type {any} */ (tab.id);
          }}>{tab.label}</button
        >
      {/each}
    </div>
  </div>

  <!-- Content -->
  <div class="app-scroll min-h-0 flex-1 overflow-auto [will-change:transform]">
    <!-- Roles -->
    {#if activeTab === "roles"}
      <div
        class="flex items-center justify-between border-b border-border/40 px-3 py-2"
      >
        <span class="font-mono text-ui-xs text-muted-foreground"
          >{roles?.length ?? 0} roles</span
        >
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 font-mono text-ui-xs text-muted-foreground transition-colors hover:bg-accent/35 hover:text-foreground"
          onclick={() => openRoleModal()}
        >
          <Plus class="size-3.5" />New role
        </button>
      </div>

      {#if rolesLoading || roles === null}
        <div
          class="flex items-center justify-center gap-2 py-16 text-muted-foreground"
        >
          <RefreshCw class="size-4 animate-spin" /><span
            class="font-mono text-ui-sm">Loading…</span
          >
        </div>
      {:else if rolesError}
        <div class="px-4 py-8 text-center">
          <p class="font-mono text-ui-xs text-destructive">{rolesError}</p>
          <button
            onclick={() => {
              roles = null;
              loadRoles();
            }}
            class="mt-2 font-mono text-ui-xs text-muted-foreground underline"
            >Retry</button
          >
        </div>
      {:else if roles.length === 0}
        <div
          class="flex h-full flex-col items-center justify-center gap-3 py-16 text-center"
        >
          <Users class="size-10 text-muted-foreground/20" />
          <p class="font-mono text-ui text-muted-foreground">No roles found</p>
        </div>
      {:else}
        <table class="w-full text-ui-xs">
          <thead class="studio-chrome sticky top-0 z-10 bg-panel text-left">
            <tr class="border-b border-border/50">
              <th class="px-3 py-2 font-mono font-normal text-muted-foreground"
                >Name</th
              >
              <th
                class="px-3 py-2 text-center font-mono font-normal text-muted-foreground"
                title="Can login">Login</th
              >
              <th
                class="px-3 py-2 text-center font-mono font-normal text-muted-foreground"
                title="Superuser">Super</th
              >
              <th
                class="px-3 py-2 text-center font-mono font-normal text-muted-foreground"
                title="Create DB">CreateDB</th
              >
              <th
                class="px-3 py-2 text-center font-mono font-normal text-muted-foreground"
                title="Create Role">CreateRole</th
              >
              <th
                class="px-3 py-2 text-center font-mono font-normal text-muted-foreground"
                title="Bypass RLS">BypassRLS</th
              >
              <th class="px-3 py-2 font-mono font-normal text-muted-foreground"
                >Conn limit</th
              >
              <th class="px-3 py-2 font-mono font-normal text-muted-foreground"
                >Expires</th
              >
              <th class="w-9 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {#each roles ?? [] as role (role.rolname)}
              {@const isSuper = bool(role.rolsuper)}
              {@const isLogin = bool(role.rolcanlogin)}
              <tr
                class="group/row border-b border-border/30 outline-none hover:bg-accent/25"
              >
                <td class="px-3 py-2">
                  <div class="flex items-center gap-2">
                    <span
                      class={cn(
                        "inline-flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold uppercase",
                        isSuper
                          ? "bg-destructive/10 text-destructive"
                          : isLogin
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground",
                      )}>{String(role.rolname).slice(0, 2)}</span
                    >
                    <span
                      class="font-mono text-ui-xs font-medium text-foreground"
                      >{role.rolname}</span
                    >
                    {#if isSuper}
                      <span
                        class="rounded bg-destructive/10 px-1.5 py-px font-mono text-ui-3xs font-medium text-destructive"
                        >superuser</span
                      >
                    {/if}
                  </div>
                </td>
                {#each [{ col: "rolcanlogin", c: "text-primary" }, { col: "rolsuper", c: "text-amber-500" }, { col: "rolcreatedb", c: "text-primary" }, { col: "rolcreaterole", c: "text-primary" }, { col: "rolbypassrls", c: "text-primary" }] as f (f.col)}
                  <td class="px-3 py-2 text-center">
                    {#if bool(role[f.col])}
                      <Check class={cn("mx-auto size-3.5", f.c)} />
                    {:else}
                      <span class="text-muted-foreground/20">—</span>
                    {/if}
                  </td>
                {/each}
                <td
                  class="px-3 py-2 font-mono text-ui-xs tabular-nums text-muted-foreground/70"
                >
                  {role.rolconnlimit === -1 || role.rolconnlimit == null
                    ? "∞"
                    : role.rolconnlimit}
                </td>
                <td
                  class="px-3 py-2 font-mono text-ui-xs text-muted-foreground/60"
                  >{role.rolvaliduntil ?? "—"}</td
                >
                <td class="px-2 py-2">
                  <button
                    type="button"
                    class="invisible inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground group-hover/row:visible"
                    onclick={() => openRoleModal(role)}
                    title="Edit"><KeyRound class="size-3.5" /></button
                  >
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

      <!-- Policies -->
    {:else if activeTab === "policies"}
      <div
        class="flex items-center justify-between border-b border-border/40 px-3 py-2"
      >
        <span class="font-mono text-ui-xs text-muted-foreground"
          >{policies?.length ?? 0} polic{(policies?.length ?? 0) === 1
            ? "y"
            : "ies"}</span
        >
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 font-mono text-ui-xs text-muted-foreground transition-colors hover:bg-accent/35 hover:text-foreground"
          onclick={openPolicyModal}
        >
          <Plus class="size-3.5" />New policy
        </button>
      </div>

      {#if policiesLoading || policies === null}
        <div
          class="flex items-center justify-center gap-2 py-16 text-muted-foreground"
        >
          <RefreshCw class="size-4 animate-spin" /><span
            class="font-mono text-ui-sm">Loading…</span
          >
        </div>
      {:else if policiesError}
        <div class="px-4 py-8 text-center">
          <p class="font-mono text-ui-xs text-destructive">{policiesError}</p>
          <button
            onclick={() => {
              policies = null;
              loadPolicies();
            }}
            class="mt-2 font-mono text-ui-xs text-muted-foreground underline"
            >Retry</button
          >
        </div>
      {:else if policies.length === 0}
        <div
          class="flex h-full flex-col items-center justify-center gap-3 py-20 text-center"
        >
          <ShieldCheck class="size-10 text-muted-foreground/20" />
          <p class="font-mono text-ui text-muted-foreground">
            No policies found
          </p>
          <p class="mt-1 text-ui-xs text-muted-foreground/60">
            Enable RLS on a table and create a policy to control row access
          </p>
          <button
            type="button"
            class="mt-3 inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 font-mono text-ui-xs text-muted-foreground transition-colors hover:bg-accent/35 hover:text-foreground"
            onclick={openPolicyModal}
            ><Plus class="size-3.5" />Create first policy</button
          >
        </div>
      {:else}
        <table class="w-full text-ui-xs">
          <thead class="studio-chrome sticky top-0 z-10 bg-panel text-left">
            <tr class="border-b border-border/50">
              <th class="px-3 py-2 font-mono font-normal text-muted-foreground"
                >Table</th
              >
              <th class="px-3 py-2 font-mono font-normal text-muted-foreground"
                >Policy</th
              >
              <th class="px-3 py-2 font-mono font-normal text-muted-foreground"
                >Command</th
              >
              <th class="px-3 py-2 font-mono font-normal text-muted-foreground"
                >Roles</th
              >
              <th
                class="w-28 px-3 py-2 font-mono font-normal text-muted-foreground"
                >Type</th
              >
              <th class="w-9 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {#each policies ?? [] as pol, i (i)}
              {@const permissive =
                (pol.permissive ?? "").toString().toUpperCase() ===
                "PERMISSIVE"}
              <tr
                class={cn(
                  "group/row border-b border-border/30 outline-none hover:bg-accent/25",
                  expandedPolicy === i && "bg-accent/15",
                )}
              >
                <td class="px-3 py-2 font-mono">
                  <span class="text-muted-foreground/50">{pol.schemaname}.</span
                  ><span class="text-foreground">{pol.tablename}</span>
                </td>
                <td class="px-3 py-2 font-mono text-foreground/80"
                  >{pol.policyname}</td
                >
                <td class="px-3 py-2">
                  <span
                    class="rounded bg-muted px-1.5 py-px font-mono text-ui-2xs text-muted-foreground"
                    >{pol.cmd}</span
                  >
                </td>
                <td
                  class="max-w-[100px] truncate px-3 py-2 font-mono text-muted-foreground/70"
                  >{pol.roles || "public"}</td
                >
                <td class="px-3 py-2">
                  <span
                    class={cn(
                      "rounded px-1.5 py-px font-mono text-ui-3xs font-medium",
                      permissive
                        ? "bg-primary/10 text-primary"
                        : "bg-destructive/10 text-destructive",
                    )}>{permissive ? "Permissive" : "Restrictive"}</span
                  >
                </td>
                <td class="px-2 py-2">
                  <button
                    type="button"
                    class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-foreground"
                    onclick={() => {
                      expandedPolicy = expandedPolicy === i ? null : i;
                    }}
                    ><ChevronDown
                      class={cn(
                        "size-3.5 transition-transform",
                        expandedPolicy === i && "rotate-180",
                      )}
                    /></button
                  >
                </td>
              </tr>
              {#if expandedPolicy === i}
                <tr class="border-b border-border/30 bg-muted/20">
                  <td colspan="6" class="px-4 py-3">
                    <div
                      class={cn(
                        "grid gap-3",
                        pol.qual && pol.with_check
                          ? "grid-cols-2"
                          : "grid-cols-1",
                      )}
                    >
                      {#if pol.qual}
                        <div>
                          <p
                            class="mb-1.5 font-mono text-ui-2xs text-muted-foreground/60 uppercase tracking-wider"
                          >
                            USING
                          </p>
                          <pre
                            class="rounded-md border border-border/40 bg-background px-3 py-2 font-mono text-ui-xs leading-relaxed text-foreground/90">{pol.qual}</pre>
                        </div>
                      {/if}
                      {#if pol.with_check}
                        <div>
                          <p
                            class="mb-1.5 font-mono text-ui-2xs text-muted-foreground/60 uppercase tracking-wider"
                          >
                            WITH CHECK
                          </p>
                          <pre
                            class="rounded-md border border-border/40 bg-background px-3 py-2 font-mono text-ui-xs leading-relaxed text-foreground/90">{pol.with_check}</pre>
                        </div>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      {/if}

      <!-- RLS -->
    {:else if activeTab === "rls"}
      {@const enabledCount = (rlsTables ?? []).filter((r) =>
        bool(r.rls_enabled),
      ).length}
      <div class="flex items-center gap-3 border-b border-border/40 px-3 py-2">
        <span class="font-mono text-ui-xs text-muted-foreground">
          {enabledCount} of {rlsTables?.length ?? 0} tables protected
        </span>
        {#if rlsTables && rlsTables.length > 0}
          <div class="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              class="h-full rounded-full bg-primary/50 transition-all"
              style="width:{Math.round(
                (enabledCount / rlsTables.length) * 100,
              )}%"
            ></div>
          </div>
        {/if}
      </div>

      {#if rlsLoading || rlsTables === null}
        <div
          class="flex items-center justify-center gap-2 py-16 text-muted-foreground"
        >
          <RefreshCw class="size-4 animate-spin" /><span
            class="font-mono text-ui-sm">Loading…</span
          >
        </div>
      {:else if rlsError}
        <div class="px-4 py-8 text-center">
          <p class="font-mono text-ui-xs text-destructive">{rlsError}</p>
          <button
            onclick={() => {
              rlsTables = null;
              loadRls();
            }}
            class="mt-2 font-mono text-ui-xs text-muted-foreground underline"
            >Retry</button
          >
        </div>
      {:else}
        <table class="w-full text-ui-xs">
          <thead class="studio-chrome sticky top-0 z-10 bg-panel text-left">
            <tr class="border-b border-border/50">
              <th class="px-3 py-2 font-mono font-normal text-muted-foreground"
                >Schema</th
              >
              <th class="px-3 py-2 font-mono font-normal text-muted-foreground"
                >Table</th
              >
              <th
                class="px-3 py-2 text-center font-mono font-normal text-muted-foreground"
                >RLS</th
              >
              <th
                class="px-3 py-2 text-center font-mono font-normal text-muted-foreground"
                >Force RLS</th
              >
              <th class="w-28 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {#each rlsTables ?? [] as row (`${row.schema}.${row.table_name}`)}
              {@const enabled = bool(row.rls_enabled)}
              {@const forced = bool(row.rls_forced)}
              <tr
                class="group/row border-b border-border/30 outline-none hover:bg-accent/25"
              >
                <td class="px-3 py-2 font-mono text-muted-foreground/60"
                  >{row.schema}</td
                >
                <td class="px-3 py-2 font-mono font-medium text-foreground"
                  >{row.table_name}</td
                >
                <td class="px-3 py-2 text-center">
                  {#if enabled}
                    <span
                      class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-px font-mono text-ui-3xs font-medium text-primary"
                    >
                      <Lock class="size-2.5" />On
                    </span>
                  {:else}
                    <span
                      class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-px font-mono text-ui-3xs text-muted-foreground/60"
                    >
                      <LockOpen class="size-2.5" />Off
                    </span>
                  {/if}
                </td>
                <td class="px-3 py-2 text-center">
                  {#if forced}
                    <Check class="mx-auto size-3.5 text-primary" />
                  {:else}
                    <span class="text-muted-foreground/20">—</span>
                  {/if}
                </td>
                <td class="px-3 py-2">
                  <button
                    type="button"
                    class={cn(
                      "invisible h-6 w-full rounded-md px-2 font-mono text-ui-2xs transition-colors group-hover/row:visible",
                      enabled
                        ? "border border-border/50 text-muted-foreground hover:bg-accent/35 hover:text-foreground"
                        : "bg-primary/10 text-primary hover:bg-primary/15",
                    )}
                    onclick={() => openRlsModal(row)}
                    >{enabled ? "Disable" : "Enable"}</button
                  >
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {/if}
  </div>
</div>

{#if sqlModal}
  <SecuritySqlModal
    title={sqlModal.title}
    bind:sql={sqlDraft}
    running={sqlRunning}
    onclose={() => {
      sqlModal = null;
    }}
    onrun={runSqlModal}
  />
{/if}
