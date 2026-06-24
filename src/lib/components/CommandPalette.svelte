<script>
  import Table2         from '@lucide/svelte/icons/table-2'
  import Terminal       from '@lucide/svelte/icons/terminal'
  import Code2          from '@lucide/svelte/icons/code-2'
  import LayoutTemplate from '@lucide/svelte/icons/layout-template'
  import Settings       from '@lucide/svelte/icons/settings'
  import Unplug         from '@lucide/svelte/icons/unplug'
  import Database       from '@lucide/svelte/icons/database'
  import HardDrive      from '@lucide/svelte/icons/hard-drive'
  import Cloud          from '@lucide/svelte/icons/cloud'
  import RefreshCw      from '@lucide/svelte/icons/refresh-cw'
  import Bot            from '@lucide/svelte/icons/bot'
  import Sparkles       from '@lucide/svelte/icons/sparkles'
  import Keyboard       from '@lucide/svelte/icons/keyboard'
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right'
  import ArrowDownToLine from '@lucide/svelte/icons/arrow-down-to-line'
  import Info           from '@lucide/svelte/icons/info'
  import Bug            from '@lucide/svelte/icons/bug'
  import History        from '@lucide/svelte/icons/history'
  import Bookmark       from '@lucide/svelte/icons/bookmark'
  import ShieldCheck    from '@lucide/svelte/icons/shield-check'
  import Package        from '@lucide/svelte/icons/package'
  import Braces         from '@lucide/svelte/icons/braces'
  import Blocks         from '@lucide/svelte/icons/blocks'
  import ChevronRight   from '@lucide/svelte/icons/chevron-right'
  import ChevronLeft    from '@lucide/svelte/icons/chevron-left'
  import Eye            from '@lucide/svelte/icons/eye'
  import Network        from '@lucide/svelte/icons/network'
import Search         from '@lucide/svelte/icons/search'
  import FileText       from '@lucide/svelte/icons/file-text'
  import GitCompare     from '@lucide/svelte/icons/git-compare'
  import GitBranch      from '@lucide/svelte/icons/git-branch'
  import * as Command from '$lib/components/ui/command/index.js'
  import { formatTableRowCount } from '$lib/table-list.js'

  let {
    open = $bindable(false),
    /** @type {'root' | 'docker' | 'connections' | 'tables'} */
    page = $bindable('root'),
    connected = false,
    schemas = [],
    tables = [],
    activeSchema = 'public',
    /** @type {import('$lib/stores/connections.js').SavedConnection[]} */
    savedConnections = [],
    /** Currently connected connection id (to mark it) */
    activeConnectionId = '',
    ontableselect = () => {},
    onschemachange = () => {},
    onopensql = () => {},
    onopentable = () => {},
    onopensettings = () => {},
    onopenconnection = () => {},
    ondisconnect = () => {},
    onrefresh = () => {},
    onopenai = () => {},
    onopenaisidebar = () => {},
    /** Whether the app is currently in AI mode (fullscreen chat) */
    aiMode = false,
    /** Toggle between AI mode and dev mode */
    ontoggleaimode = () => {},
    onopenorm = () => {},
    onopenerd = () => {},
    onopenSchema = () => {},
    onopensecurity = () => {},
    hasSchemaExplorer = true,
    hasSecurity = true,
    onopenlogs = () => {},
    onopenextensions = () => {},
    onopenJsonViewer = () => {},
    onopenshortcuts = () => {},
    onopenabout = () => {},
    onopenreport = () => {},
    oncheckupdate = () => {},
    /** @param {'postgres'|'mysql'} dbType */
    ondockerlaunch = (dbType) => {},
    /** @param {import('$lib/stores/connections.js').SavedConnection} conn */
    onswitchdatabase = (conn) => {},
    /** @type {import('$lib/stores/query-history.js').QueryHistoryEntry[]} */
    queryHistory = [],
    /** @type {import('$lib/stores/query-history.js').SavedQuery[]} */
    savedQueries = [],
    /** @param {string} sql */
    onqueryselect = (sql) => {},
    onopenqueryhistory = () => {},
    onglobalsearch = () => {},
    onopennotebook = () => {},
    onopennotebookfile = () => {},
    openschematimeline = () => {},
    opendatadiff = () => {},
  } = $props()

  /** @param {'docker' | 'connections' | 'tables'} target */
  function navigate(target) {
    page = target
  }

  function goBack() {
    page = 'root'
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(e) {
    if (page !== 'root' && e.key === 'Backspace') {
      const input = /** @type {HTMLInputElement | null} */ (
        e.currentTarget instanceof Element
          ? e.currentTarget.querySelector('[data-slot="command-input"]')
          : null
      )
      if (!input || input.value === '') {
        e.preventDefault()
        goBack()
      }
    }
  }

  $effect(() => {
    if (!open) {
      page = 'root'
      paletteSearch = ''   // clear search so it never persists between opens
      debouncedSearch = '' // keep the debounced mirror in sync (no stale results on reopen)
    }
  })

  // Focus the search input when the dialog opens or navigates to a sub-page.
  // Command.Input is now first in DOM order so bits-ui's focus trap lands on it
  // directly. A single rAF is still used as a safety net for async rendering.
  $effect(() => {
    open  // dependency
    page  // dependency
    if (!open) return
    const id = requestAnimationFrame(() => {
      /** @type {HTMLInputElement | null} */
      const input = document.querySelector('[data-slot="command-input"] input')
      input?.focus()
    })
    return () => cancelAnimationFrame(id)
  })

  // Derived table groups — used in both the root page and the dedicated tables page
  const regularTables = $derived(tables.filter((t) => !t.tableKind || t.tableKind === 'table' || t.tableKind === 'foreign_table'))
  const viewTables    = $derived(tables.filter((t) => t.tableKind === 'view'))
  const matViewTables = $derived(tables.filter((t) => t.tableKind === 'materialized_view'))

  // Search text bound from Command.Input. We filter + cap the Tables page
  // ourselves (instead of mounting every table and letting bits-ui score them
  // all on each keystroke), which keeps the rendered list small and scrolling
  // smooth even with thousands of tables.
  let paletteSearch = $state('')
  const TABLES_PAGE_CAP = 100

  // Debounced mirror of `paletteSearch`. The input stays bound to `paletteSearch`
  // so typing feels instant, but the expensive scoring pass (over potentially
  // thousands of tables) reads `debouncedSearch`, which only settles ~50ms after
  // the last keystroke — collapsing a burst of keystrokes into a single re-score.
  let debouncedSearch = $state('')
  $effect(() => {
    const v = paletteSearch
    const id = setTimeout(() => { debouncedSearch = v }, 50)
    return () => clearTimeout(id)
  })

  // Pre-lowercase table names ONCE per table-list change (not per keystroke), so
  // filtering thousands of tables stays cheap as the user types — the keystroke
  // path then only runs the integer-scoring loop, never N× String.toLowerCase().
  const _loweredRegular  = $derived(regularTables.map((t) => ({ t, l: t.name.toLowerCase() })))
  const _loweredViews    = $derived(viewTables.map((t) => ({ t, l: t.name.toLowerCase() })))
  const _loweredMatViews = $derived(matViewTables.map((t) => ({ t, l: t.name.toLowerCase() })))

  /**
   * Substring score against an already-lowercased name: exact > starts-with > contains.
   * @param {string} nLower @param {string} q (already trimmed + lowercased)
   */
  function scoreLower(nLower, q) {
    if (nLower === q) return 1000
    if (nLower.startsWith(q)) return 900
    const sub = nLower.indexOf(q)
    return sub !== -1 ? 800 - sub : 0
  }

  /** @param {{ t: { name: string }, l: string }[]} lowered */
  function filterAndCap(lowered) {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return { items: lowered.slice(0, TABLES_PAGE_CAP).map((x) => x.t), total: lowered.length }
    /** @type {{ t: { name: string }, s: number }[]} */
    const scored = []
    for (const x of lowered) {
      const s = scoreLower(x.l, q)
      if (s > 0) scored.push({ t: x.t, s })
    }
    scored.sort((a, b) => b.s - a.s)
    return { items: scored.slice(0, TABLES_PAGE_CAP).map((x) => x.t), total: scored.length }
  }

  const tablesPageRegular  = $derived(filterAndCap(_loweredRegular))
  const tablesPageViews    = $derived(filterAndCap(_loweredViews))
  const tablesPageMatViews = $derived(filterAndCap(_loweredMatViews))

  // On tables page: shouldFilter=false so bits-ui skips its sort/filter pass entirely
  // (no CSS `order` reordering, no keyboard-nav interference). We pre-filter in JS.
  // On root page: bits-ui filters with a plain substring check against item value strings.
  const shouldFilter = $derived(page !== 'tables')

  /** @type {(value: string, search: string) => number} */
  const commandFilter = (value, search) => {
    if (!search) return 1
    return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
  }

  /** @param {() => void} action */
  function run(action) {
    open = false
    action()
  }

  /** @param {'postgres'|'sqlite'|'d1'} type */
  function driverIcon(type) {
    if (type === 'sqlite') return HardDrive
    if (type === 'd1')     return Cloud
    return Database
  }

  /** @param {import('$lib/stores/connections.js').SavedConnection} conn */
  function connSubtitle(conn) {
    if (conn.type === 'sqlite') return conn.filePath ?? ''
    if (conn.type === 'd1')     return `${conn.accountId?.slice(0, 8) ?? ''}… / ${conn.databaseId?.slice(0, 8) ?? ''}…`
    return `${conn.user ?? ''}@${conn.host ?? ''}:${conn.port ?? ''}/${conn.database ?? ''}`
  }

  const pageLabel = /** @type {Record<string, string>} */ ({
    docker: 'Docker',
    connections: 'Connections',
    tables: 'Tables',
  })
</script>

<Command.Dialog
  bind:open
  filter={commandFilter}
  shouldFilter={shouldFilter}
  title="Command menu"
  description="Search tables, schemas, and commands"
  class="w-[min(540px,calc(100vw-2rem))] sm:max-w-none"
>
  {#snippet children()}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- Command.Input is FIRST in DOM so bits-ui's focus trap always lands on it.
         The breadcrumb is rendered after but floated to the top visually via order-first,
         keeping it above the input without disrupting the focus-trap scan order. -->
    <div class="flex flex-col" onkeydown={handleKeydown}>
      <Command.Input
        bind:value={paletteSearch}
        oninput={(/** @type {Event} */ e) => { paletteSearch = /** @type {HTMLInputElement} */ (e.currentTarget).value }}
        placeholder={
          page === 'root' ? 'Search tables, schemas, commands…'
          : page === 'tables' ? 'Search tables and views…'
          : `Search ${pageLabel[page]}…`
        }
      />

      {#if page !== 'root'}
        <div class="order-first flex items-center gap-1.5 border-b border-border/25 px-4 py-2">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none"
            onclick={goBack}
          >
            <ChevronLeft class="size-3" />
            Back
          </button>
          <span class="text-muted-foreground/25 text-[11px]">/</span>
          <span class="text-[11px] font-medium text-foreground/80">{pageLabel[page]}</span>
        </div>
      {/if}

      <Command.List class="max-h-[min(440px,58vh)]">
        <Command.Empty class="py-8 text-center text-[12px] text-muted-foreground/40">No results.</Command.Empty>

        <!-- ── ROOT PAGE ─────────────────────────────────────────────── -->
        {#if page === 'root'}

          {#if connected}
            <Command.Group heading="Views">
              <Command.Item value="open table data browser" onSelect={() => run(onopentable)}>
                <Table2 class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Table data</span>
                <Command.Shortcut keys="⌘⇧D" />
              </Command.Item>
              <Command.Item value="find search rows data across all tables global database" onSelect={() => run(onglobalsearch)}>
                <Search class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Find in database</span>
                <Command.Shortcut keys="⌘⇧G" />
              </Command.Item>
              <Command.Item value="open sql editor query console" onSelect={() => run(onopensql)}>
                <Terminal class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">SQL editor</span>
                <Command.Shortcut keys="⌘⇧S" />
              </Command.Item>
              <Command.Item value="open orm runner drizzle prisma query builder" onSelect={() => run(onopenorm)}>
                <Code2 class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">ORM Runner</span>
                <Command.Shortcut keys="⌘⇧O" />
              </Command.Item>
              <Command.Item value="open er diagram entity relationship foreign key pk fk graph" onSelect={() => run(onopenerd)}>
                <Network class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">ER Diagram</span>
              </Command.Item>
              {#if hasSchemaExplorer}
                <Command.Item value="open schema explorer indexes enums views materialized" onSelect={() => run(onopenSchema)}>
                  <LayoutTemplate class="size-4 shrink-0 opacity-60" />
                  <span data-slot="command-label" class="truncate">Schema Explorer</span>
                </Command.Item>
              {/if}
              {#if hasSecurity}
                <Command.Item value="open security roles users policies rls row level" onSelect={() => run(onopensecurity)}>
                  <ShieldCheck class="size-4 shrink-0 opacity-60" />
                  <span data-slot="command-label" class="truncate">Security</span>
                </Command.Item>
              {/if}
              <Command.Item value="open activity log events history operations" onSelect={() => run(onopenlogs)}>
                <History class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Activity Log</span>
              </Command.Item>
              <Command.Item value="open extensions plugins formatters generators transforms better time uuid" onSelect={() => run(onopenextensions)}>
                <Blocks class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Extensions</span>
              </Command.Item>
              <Command.Item value="open json viewer explorer jsonpath tool" onSelect={() => run(onopenJsonViewer)}>
                <Braces class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">JSON Viewer</span>
              </Command.Item>
              <Command.Item value="new sql notebook jupyter cells sql markdown" onSelect={() => run(onopennotebook)}>
                <FileText class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">New Notebook</span>
              </Command.Item>
              <Command.Item value="open notebook file sqlnb" onSelect={() => run(onopennotebookfile)}>
                <FileText class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Open Notebook…</span>
              </Command.Item>
              <Command.Item value="schema timeline drift detection history changes diff" onSelect={() => run(openschematimeline)}>
                <GitBranch class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Schema Timeline</span>
              </Command.Item>
              <Command.Item value="data diff compare tables rows changes" onSelect={() => run(opendatadiff)}>
                <GitCompare class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Data Diff</span>
              </Command.Item>
            </Command.Group>

            {#if schemas.length > 0}
              <Command.Group heading="Schemas">
                {#each schemas as schema (schema)}
                  <Command.Item value="schema {schema}" onSelect={() => run(() => onschemachange(schema))}>
                    <Database class="size-4 shrink-0 opacity-60" />
                    <span data-slot="command-label" class="truncate font-mono">{schema}</span>
                    {#if schema === activeSchema}
                      <span data-slot="command-trailing" class="shrink-0 text-ui-xs text-muted-foreground">current</span>
                    {/if}
                  </Command.Item>
                {/each}
              </Command.Group>
            {/if}

            {#if tables.length > 0}
              <Command.Group heading="Tables">
                {#each regularTables.slice(0, 8) as table (table.name)}
                  <Command.Item value="table {activeSchema} {table.name}" onSelect={() => run(() => ontableselect(table.name))}>
                    <Table2 class="size-4 shrink-0 opacity-60" />
                    <span data-slot="command-label" class="truncate font-mono">{table.name}</span>
                    <span data-slot="command-trailing" class="shrink-0 font-mono text-ui-xs tabular-nums text-muted-foreground">{formatTableRowCount(table.rowCount)}</span>
                  </Command.Item>
                {/each}
                {#each viewTables.slice(0, 4) as table (table.name)}
                  <Command.Item value="view {activeSchema} {table.name}" onSelect={() => run(() => ontableselect(table.name))}>
                    <Eye class="size-4 shrink-0 opacity-60" />
                    <span data-slot="command-label" class="truncate font-mono">{table.name}</span>
                    <span data-slot="command-trailing" class="shrink-0 text-ui-xs text-muted-foreground">view</span>
                  </Command.Item>
                {/each}
                {#if tables.length > 12}
                  <Command.Item value="browse all tables views search" onSelect={() => navigate('tables')}>
                    <Table2 class="size-4 shrink-0 opacity-40" />
                    <span data-slot="command-label" class="truncate text-muted-foreground">All {tables.length} tables & views…</span>
                    <ChevronRight class="size-3.5 shrink-0 text-muted-foreground/40" />
                  </Command.Item>
                {/if}
              </Command.Group>
            {/if}

            <Command.Group heading="AI">
              <Command.Item value="ask ai assistant chat query" onSelect={() => run(onopenai)}>
                <Bot class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Ask AI</span>
                <Command.Shortcut keys="⌘⇧E" />
              </Command.Item>
              <Command.Item value="toggle ai sidebar inline assistant context" onSelect={() => run(onopenaisidebar)}>
                <Sparkles class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">AI sidebar</span>
                <Command.Shortcut keys="⌘I" />
              </Command.Item>
              <Command.Item
                value={aiMode ? "close ai panel hide assistant" : "open ai panel show assistant chat"}
                onSelect={() => run(ontoggleaimode)}
              >
                <ArrowLeftRight class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">{aiMode ? 'Close AI panel' : 'Open AI panel'}</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Queries">
              <Command.Item value="open query history sql statements" onSelect={() => run(onopenqueryhistory)}>
                <History class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Query history</span>
              </Command.Item>
            </Command.Group>

            {#if savedQueries.length > 0}
              <Command.Group heading="Saved queries">
                {#each savedQueries as entry (entry.id)}
                  <Command.Item value="saved query {entry.name} {entry.sql}" onSelect={() => run(() => onqueryselect(entry.sql))}>
                    <Bookmark class="size-4 shrink-0 opacity-60" />
                    <span data-slot="command-label" class="min-w-0 truncate font-mono text-ui-xs">{entry.name}</span>
                  </Command.Item>
                {/each}
              </Command.Group>
            {/if}

            {#if queryHistory.length > 0}
              <Command.Group heading="Recent queries">
                {#each queryHistory.slice(0, 20) as entry (entry.id)}
                  <Command.Item value="recent query {entry.title} {entry.sql}" onSelect={() => run(() => onqueryselect(entry.sql))}>
                    <History class="size-4 shrink-0 opacity-60" />
                    <span data-slot="command-label" class="min-w-0 truncate font-mono text-ui-xs">{entry.title}</span>
                  </Command.Item>
                {/each}
              </Command.Group>
            {/if}

            <Command.Group heading="Actions">
              <Command.Item value="refresh schema tables" onSelect={() => run(onrefresh)}>
                <RefreshCw class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Refresh tables</span>
              </Command.Item>
              <Command.Item value="open settings preferences" onSelect={() => run(onopensettings)}>
                <Settings class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Settings</span>
              </Command.Item>
              <Command.Item value="keyboard shortcuts keybindings hotkeys help" onSelect={() => run(onopenshortcuts)}>
                <Keyboard class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Keyboard shortcuts</span>
                <Command.Shortcut keys="?" />
              </Command.Item>
              <Command.Item value="about license version info app" onSelect={() => run(onopenabout)}>
                <Info class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">About Stroke</span>
              </Command.Item>
              <Command.Item value="report issue bug crash problem feedback github" onSelect={() => run(onopenreport)}>
                <Bug class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Report an issue</span>
              </Command.Item>
              <Command.Item value="check for updates upgrade version" onSelect={() => run(oncheckupdate)}>
                <ArrowDownToLine class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Check for updates</span>
              </Command.Item>
              <Command.Item value="disconnect database" onSelect={() => run(ondisconnect)}>
                <Unplug class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Disconnect</span>
              </Command.Item>
            </Command.Group>
          {/if}

          <!-- ── Drill-in: Connections ───────────────────────────────── -->
          <Command.Group heading="Database">
            <Command.Item
              value="connections switch database connect postgres mysql sqlite saved {savedConnections.map(c => c.name).join(' ')}"
              onSelect={() => navigate('connections')}
            >
              <Database class="size-4 shrink-0 opacity-60" />
              <span data-slot="command-label" class="truncate">Connections</span>
              {#if savedConnections.length > 0}
                <span class="shrink-0 font-mono text-ui-xs text-muted-foreground">{savedConnections.length}</span>
              {/if}
              <ChevronRight class="size-3.5 shrink-0 text-muted-foreground/40" />
            </Command.Item>
          </Command.Group>

          <!-- ── Drill-in: Docker ───────────────────────────────────── -->
          <Command.Group heading="Launch">
            <Command.Item value="docker containers postgresql mysql launch run" onSelect={() => navigate('docker')}>
              <Package class="size-4 shrink-0 opacity-60" />
              <span data-slot="command-label" class="truncate">Docker</span>
              <ChevronRight class="size-3.5 shrink-0 text-muted-foreground/40" />
            </Command.Item>
          </Command.Group>

        <!-- ── TABLES PAGE ───────────────────────────────────────────── -->
        {:else if page === 'tables'}
          {#if tablesPageRegular.total > 0}
            <Command.Group heading="Tables">
              {#each tablesPageRegular.items as table (table.name)}
                <Command.Item value="table {activeSchema} {table.name} {table.name}" onSelect={() => run(() => ontableselect(table.name))}>
                  <Table2 class="size-4 shrink-0 opacity-60" />
                  <span data-slot="command-label" class="truncate font-mono">{table.name}</span>
                  <span
                    data-slot="command-trailing"
                    class="shrink-0 font-mono text-ui-xs tabular-nums text-muted-foreground"
                    title={table.rowCount != null ? Number(table.rowCount).toLocaleString('en-US') : undefined}
                  >{formatTableRowCount(table.rowCount)}</span>
                </Command.Item>
              {/each}
              {#if tablesPageRegular.total > tablesPageRegular.items.length}
                <div class="px-2.5 py-1.5 text-[11px] text-muted-foreground/40">
                  Showing {tablesPageRegular.items.length} of {tablesPageRegular.total} — keep typing to narrow.
                </div>
              {/if}
            </Command.Group>
          {/if}
          {#if tablesPageViews.total > 0}
            <Command.Group heading="Views">
              {#each tablesPageViews.items as table (table.name)}
                <Command.Item value="view {activeSchema} {table.name} {table.name}" onSelect={() => run(() => ontableselect(table.name))}>
                  <Eye class="size-4 shrink-0 opacity-60" />
                  <span data-slot="command-label" class="truncate font-mono">{table.name}</span>
                </Command.Item>
              {/each}
              {#if tablesPageViews.total > tablesPageViews.items.length}
                <div class="px-2.5 py-1.5 text-[11px] text-muted-foreground/40">
                  Showing {tablesPageViews.items.length} of {tablesPageViews.total} — keep typing to narrow.
                </div>
              {/if}
            </Command.Group>
          {/if}
          {#if tablesPageMatViews.total > 0}
            <Command.Group heading="Materialized views">
              {#each tablesPageMatViews.items as table (table.name)}
                <Command.Item value="materialized view {activeSchema} {table.name} {table.name}" onSelect={() => run(() => ontableselect(table.name))}>
                  <Eye class="size-4 shrink-0 opacity-60" />
                  <span data-slot="command-label" class="truncate font-mono">{table.name}</span>
                  <span
                    data-slot="command-trailing"
                    class="shrink-0 font-mono text-ui-xs tabular-nums text-muted-foreground"
                  >{formatTableRowCount(table.rowCount)}</span>
                </Command.Item>
              {/each}
              {#if tablesPageMatViews.total > tablesPageMatViews.items.length}
                <div class="px-2.5 py-1.5 text-[11px] text-muted-foreground/40">
                  Showing {tablesPageMatViews.items.length} of {tablesPageMatViews.total} — keep typing to narrow.
                </div>
              {/if}
            </Command.Group>
          {/if}

        <!-- ── DOCKER PAGE ────────────────────────────────────────────── -->
        {:else if page === 'docker'}
          <Command.Group heading="Docker containers">
            <Command.Item
              value="launch postgresql postgres container pull run 5433"
              onSelect={() => run(() => ondockerlaunch('postgres'))}
            >
              <Package class="size-4 shrink-0 opacity-60" />
              <span data-slot="command-label" class="truncate">PostgreSQL container</span>
              <span data-slot="command-trailing" class="shrink-0 font-mono text-ui-2xs text-muted-foreground">:5433</span>
            </Command.Item>
            <Command.Item
              value="launch mysql container pull run 3307"
              onSelect={() => run(() => ondockerlaunch('mysql'))}
            >
              <Package class="size-4 shrink-0 opacity-60" />
              <span data-slot="command-label" class="truncate">MySQL container</span>
              <span data-slot="command-trailing" class="shrink-0 font-mono text-ui-2xs text-muted-foreground">:3307</span>
            </Command.Item>
          </Command.Group>

        <!-- ── CONNECTIONS PAGE ───────────────────────────────────────── -->
        {:else if page === 'connections'}
          {#if savedConnections.length > 0}
            <Command.Group heading="Saved connections">
              {#each savedConnections as conn (conn.id)}
                {@const Icon = driverIcon(conn.type ?? 'postgres')}
                {@const isActive = conn.id === activeConnectionId}
                <Command.Item
                  value="connection {conn.name} {connSubtitle(conn)} {conn.type}"
                  onSelect={() => run(() => onswitchdatabase(conn))}
                  disabled={isActive}
                >
                  <Icon class="size-4 shrink-0 opacity-60" />
                  <div data-slot="command-label" class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate">{conn.name}</span>
                    <span class="truncate font-mono text-[11px] text-muted-foreground">{connSubtitle(conn)}</span>
                  </div>
                  {#if isActive}
                    <span data-slot="command-trailing" class="shrink-0 text-xs text-muted-foreground">connected</span>
                  {/if}
                </Command.Item>
              {/each}
            </Command.Group>
          {/if}
          <Command.Group heading="Add">
            <Command.Item value="new connection add connect database" onSelect={() => run(onopenconnection)}>
              <Database class="size-4 shrink-0 opacity-60" />
              <span data-slot="command-label" class="truncate">New connection…</span>
            </Command.Item>
          </Command.Group>
        {/if}

      </Command.List>
    </div>
  {/snippet}
</Command.Dialog>
