<script>
  import Icon from './Icon.svelte'
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
      paletteSearch = ''  // clear search so it never persists between opens
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

  // Strip word separators so "-", "_", "." and spaces are all interchangeable:
  // "product likes", "product-likes", "productlikes" all match "product_likes".
  const stripSep = (/** @type {string} */ s) => s.replace(/[\s_.\-]+/g, '')

  // Precompute per table ONCE per table-list change (not per keystroke): lowercased
  // name, separator-stripped form, word segments, and word initials (for acronym
  // matches like "pv" → product_visitor). The keystroke path then only runs the
  // integer scorer, never re-lowercasing/splitting N names — so it stays instant
  // (sub-millisecond) for thousands of tables WITHOUT a debounce.
  /** @param {{ name: string }} t */
  const prep = (t) => {
    const l = t.name.toLowerCase()
    const words = l.split(/[\s_.\-]+/).filter(Boolean)
    return { t, l, loose: stripSep(l), words, initials: words.map((w) => w[0]).join('') }
  }
  const _loweredRegular  = $derived(regularTables.map(prep))
  const _loweredViews    = $derived(viewTables.map(prep))
  const _loweredMatViews = $derived(matViewTables.map(prep))

  /**
   * Subsequence check with a tightness bonus: returns -1 if `q`'s chars don't all
   * appear in order in `text`, otherwise a score that's higher when the matched
   * chars are closer together (fewer gaps) and the first match is earlier.
   * @param {string} text @param {string} q (both lowercased, separator-stripped)
   */
  function subseqScore(text, q) {
    let ti = 0, qi = 0, gaps = 0, first = -1, last = -1
    while (ti < text.length && qi < q.length) {
      if (text[ti] === q[qi]) {
        if (first === -1) first = ti
        if (last >= 0) gaps += ti - last - 1
        last = ti
        qi++
      }
      ti++
    }
    if (qi < q.length) return -1
    return Math.max(0, 80 - gaps - first)
  }

  /**
   * Intuitive relevance score, separator-insensitive. Tiers (high→low):
   * exact, loose-exact, prefix, loose-prefix, word-prefix, acronym, substring,
   * loose-substring, fuzzy subsequence. 0 = no match.
   * @param {{ l: string, loose: string, words: string[], initials: string }} x
   * @param {string} q lowercased query @param {string} qLoose separator-stripped query
   */
  function scoreName(x, q, qLoose) {
    if (x.l === q) return 1000
    if (x.loose === qLoose) return 980
    if (x.l.startsWith(q)) return 940 - Math.min(x.l.length - q.length, 60)
    if (x.loose.startsWith(qLoose)) return 900 - Math.min(x.loose.length - qLoose.length, 60)
    for (const w of x.words) if (w.startsWith(q)) return 860
    if (qLoose.length >= 2) {
      if (x.initials.startsWith(qLoose)) return 840
      if (x.initials.includes(qLoose)) return 800
    }
    const sub = x.l.indexOf(q)
    if (sub !== -1) return 760 - Math.min(sub, 60)
    const lsub = x.loose.indexOf(qLoose)
    if (lsub !== -1) return 700 - Math.min(lsub, 60)
    const ss = subseqScore(x.loose, qLoose)
    return ss >= 0 ? 400 + ss : 0
  }

  /** @param {ReturnType<typeof prep>[]} prepped */
  function filterAndCap(prepped) {
    const q = paletteSearch.trim().toLowerCase()
    if (!q) return { items: prepped.slice(0, TABLES_PAGE_CAP).map((x) => x.t), total: prepped.length }
    const qLoose = stripSep(q)
    /** @type {{ t: { name: string }, s: number, len: number }[]} */
    const scored = []
    for (const x of prepped) {
      const s = scoreName(x, q, qLoose)
      if (s > 0) scored.push({ t: x.t, s, len: x.l.length })
    }
    // Higher score first; ties broken by shorter name (more relevant) then A–Z.
    scored.sort((a, b) => b.s - a.s || a.len - b.len || (a.t.name < b.t.name ? -1 : 1))
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
    const v = value.toLowerCase(), s = search.toLowerCase()
    if (v.includes(s)) return 1
    // Separator-insensitive fallback so "newtable"/"new-table" match "new table".
    return stripSep(v).includes(stripSep(s)) ? 1 : 0
  }

  /** @param {() => void} action */
  function run(action) {
    open = false
    action()
  }

  /** @param {'postgres'|'sqlite'|'d1'} type */
  function driverIcon(type) {
    if (type === 'sqlite') return 'hard-drive'
    if (type === 'd1')     return 'cloud'
    return 'database'
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
            <Icon name="chevron-left" class="size-3" />
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
                <Icon name="table-2" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Table data</span>
                <Command.Shortcut keys="⌘⇧D" />
              </Command.Item>
              <Command.Item value="find search rows data across all tables global database" onSelect={() => run(onglobalsearch)}>
                <Icon name="search" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Find in database</span>
                <Command.Shortcut keys="⌘⇧G" />
              </Command.Item>
              <Command.Item value="open sql editor query console" onSelect={() => run(onopensql)}>
                <Icon name="terminal" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">SQL editor</span>
                <Command.Shortcut keys="⌘⇧S" />
              </Command.Item>
              <Command.Item value="open orm runner drizzle prisma query builder" onSelect={() => run(onopenorm)}>
                <Icon name="code-2" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">ORM Runner</span>
                <Command.Shortcut keys="⌘⇧O" />
              </Command.Item>
              <Command.Item value="open er diagram entity relationship foreign key pk fk graph" onSelect={() => run(onopenerd)}>
                <Icon name="network" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">ER Diagram</span>
              </Command.Item>
              {#if hasSchemaExplorer}
                <Command.Item value="open schema explorer indexes enums views materialized" onSelect={() => run(onopenSchema)}>
                  <Icon name="layout-template" class="size-4 shrink-0 opacity-60" />
                  <span data-slot="command-label" class="truncate">Schema Explorer</span>
                </Command.Item>
              {/if}
              {#if hasSecurity}
                <Command.Item value="open security roles users policies rls row level" onSelect={() => run(onopensecurity)}>
                  <Icon name="shield-check" class="size-4 shrink-0 opacity-60" />
                  <span data-slot="command-label" class="truncate">Security</span>
                </Command.Item>
              {/if}
              <Command.Item value="open activity log events history operations" onSelect={() => run(onopenlogs)}>
                <Icon name="history" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Activity Log</span>
              </Command.Item>
              <Command.Item value="open extensions plugins formatters generators transforms better time uuid" onSelect={() => run(onopenextensions)}>
                <Icon name="blocks" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Extensions</span>
              </Command.Item>
              <Command.Item value="open json viewer explorer jsonpath tool" onSelect={() => run(onopenJsonViewer)}>
                <Icon name="braces" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">JSON Viewer</span>
              </Command.Item>
              <Command.Item value="new sql notebook jupyter cells sql markdown" onSelect={() => run(onopennotebook)}>
                <Icon name="file-text" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">New Notebook</span>
              </Command.Item>
              <Command.Item value="open notebook file sqlnb" onSelect={() => run(onopennotebookfile)}>
                <Icon name="file-text" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Open Notebook…</span>
              </Command.Item>
              <Command.Item value="schema timeline drift detection history changes diff" onSelect={() => run(openschematimeline)}>
                <Icon name="git-branch" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Schema Timeline</span>
              </Command.Item>
              <Command.Item value="data diff compare tables rows changes" onSelect={() => run(opendatadiff)}>
                <Icon name="git-compare" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Data Diff</span>
              </Command.Item>
            </Command.Group>

            {#if schemas.length > 0}
              <Command.Group heading="Schemas">
                {#each schemas as schema (schema)}
                  <Command.Item value="schema {schema}" onSelect={() => run(() => onschemachange(schema))}>
                    <Icon name="database" class="size-4 shrink-0 opacity-60" />
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
                    <Icon name="table-2" class="size-4 shrink-0 opacity-60" />
                    <span data-slot="command-label" class="truncate font-mono">{table.name}</span>
                    <span data-slot="command-trailing" class="shrink-0 font-mono text-ui-xs tabular-nums text-muted-foreground">{formatTableRowCount(table.rowCount)}</span>
                  </Command.Item>
                {/each}
                {#each viewTables.slice(0, 4) as table (table.name)}
                  <Command.Item value="view {activeSchema} {table.name}" onSelect={() => run(() => ontableselect(table.name))}>
                    <Icon name="eye" class="size-4 shrink-0 opacity-60" />
                    <span data-slot="command-label" class="truncate font-mono">{table.name}</span>
                    <span data-slot="command-trailing" class="shrink-0 text-ui-xs text-muted-foreground">view</span>
                  </Command.Item>
                {/each}
                {#if tables.length > 12}
                  <Command.Item value="browse all tables views search" onSelect={() => navigate('tables')}>
                    <Icon name="table-2" class="size-4 shrink-0 opacity-40" />
                    <span data-slot="command-label" class="truncate text-muted-foreground">All {tables.length} tables & views…</span>
                    <Icon name="chevron-right" class="size-3.5 shrink-0 text-muted-foreground/40" />
                  </Command.Item>
                {/if}
              </Command.Group>
            {/if}

            <Command.Group heading="AI">
              <Command.Item value="ask ai assistant chat query" onSelect={() => run(onopenai)}>
                <Icon name="bot" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Ask AI</span>
                <Command.Shortcut keys="⌘⇧E" />
              </Command.Item>
              <Command.Item value="toggle ai sidebar inline assistant context" onSelect={() => run(onopenaisidebar)}>
                <Icon name="sparkles" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">AI sidebar</span>
                <Command.Shortcut keys="⌘I" />
              </Command.Item>
              <Command.Item
                value={aiMode ? "close ai panel hide assistant" : "open ai panel show assistant chat"}
                onSelect={() => run(ontoggleaimode)}
              >
                <Icon name="arrow-left-right" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">{aiMode ? 'Close AI panel' : 'Open AI panel'}</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Queries">
              <Command.Item value="open query history sql statements" onSelect={() => run(onopenqueryhistory)}>
                <Icon name="history" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Query history</span>
              </Command.Item>
            </Command.Group>

            {#if savedQueries.length > 0}
              <Command.Group heading="Saved queries">
                {#each savedQueries as entry (entry.id)}
                  <Command.Item value="saved query {entry.name} {entry.sql}" onSelect={() => run(() => onqueryselect(entry.sql))}>
                    <Icon name="bookmark" class="size-4 shrink-0 opacity-60" />
                    <span data-slot="command-label" class="min-w-0 truncate font-mono text-ui-xs">{entry.name}</span>
                  </Command.Item>
                {/each}
              </Command.Group>
            {/if}

            {#if queryHistory.length > 0}
              <Command.Group heading="Recent queries">
                {#each queryHistory.slice(0, 20) as entry (entry.id)}
                  <Command.Item value="recent query {entry.title} {entry.sql}" onSelect={() => run(() => onqueryselect(entry.sql))}>
                    <Icon name="history" class="size-4 shrink-0 opacity-60" />
                    <span data-slot="command-label" class="min-w-0 truncate font-mono text-ui-xs">{entry.title}</span>
                  </Command.Item>
                {/each}
              </Command.Group>
            {/if}

            <Command.Group heading="Actions">
              <Command.Item value="refresh schema tables" onSelect={() => run(onrefresh)}>
                <Icon name="refresh-cw" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Refresh tables</span>
              </Command.Item>
              <Command.Item value="open settings preferences" onSelect={() => run(onopensettings)}>
                <Icon name="settings" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Settings</span>
              </Command.Item>
              <Command.Item value="keyboard shortcuts keybindings hotkeys help" onSelect={() => run(onopenshortcuts)}>
                <Icon name="keyboard" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Keyboard shortcuts</span>
                <Command.Shortcut keys="?" />
              </Command.Item>
              <Command.Item value="about license version info app" onSelect={() => run(onopenabout)}>
                <Icon name="info" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">About Stroke</span>
              </Command.Item>
              <Command.Item value="report issue bug crash problem feedback github" onSelect={() => run(onopenreport)}>
                <Icon name="bug" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Report an issue</span>
              </Command.Item>
              <Command.Item value="check for updates upgrade version" onSelect={() => run(oncheckupdate)}>
                <Icon name="arrow-down-to-line" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Check for updates</span>
              </Command.Item>
              <Command.Item value="disconnect database" onSelect={() => run(ondisconnect)}>
                <Icon name="unplug" class="size-4 shrink-0 opacity-60" />
                <span data-slot="command-label" class="truncate">Disconnect</span>
              </Command.Item>
            </Command.Group>
          {/if}

          <!-- ── Switch database — other saved connections, right at root ── -->
          {@const otherConns = savedConnections.filter((c) => c.id !== activeConnectionId)}
          {#if otherConns.length > 0}
            <Command.Group heading="Switch database">
              {#each otherConns.slice(0, 8) as conn (conn.id)}
                <Command.Item
                  value="switch database connection {conn.name} {connSubtitle(conn)} {conn.type}"
                  onSelect={() => run(() => onswitchdatabase(conn))}
                >
                  <Icon name={driverIcon(conn.type ?? 'postgres')} class="size-4 shrink-0 opacity-60" />
                  <div data-slot="command-label" class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate">{conn.name}</span>
                    <span class="truncate font-mono text-[11px] text-muted-foreground">{connSubtitle(conn)}</span>
                  </div>
                  {#if savedConnections.indexOf(conn) < 9}
                    <Command.Shortcut keys="⌘⌥{savedConnections.indexOf(conn) + 1}" />
                  {/if}
                </Command.Item>
              {/each}
            </Command.Group>
          {/if}

          <!-- ── Drill-in: Connections ───────────────────────────────── -->
          <Command.Group heading="Database">
            <Command.Item
              value="connections switch database connect postgres mysql sqlite saved {savedConnections.map(c => c.name).join(' ')}"
              onSelect={() => navigate('connections')}
            >
              <Icon name="database" class="size-4 shrink-0 opacity-60" />
              <span data-slot="command-label" class="truncate">Connections</span>
              {#if savedConnections.length > 0}
                <span class="shrink-0 font-mono text-ui-xs text-muted-foreground">{savedConnections.length}</span>
              {/if}
              <Icon name="chevron-right" class="size-3.5 shrink-0 text-muted-foreground/40" />
            </Command.Item>
          </Command.Group>

          <!-- ── Drill-in: Docker ───────────────────────────────────── -->
          <Command.Group heading="Launch">
            <Command.Item value="docker containers postgresql mysql launch run" onSelect={() => navigate('docker')}>
              <Icon name="package" class="size-4 shrink-0 opacity-60" />
              <span data-slot="command-label" class="truncate">Docker</span>
              <Icon name="chevron-right" class="size-3.5 shrink-0 text-muted-foreground/40" />
            </Command.Item>
          </Command.Group>

        <!-- ── TABLES PAGE ───────────────────────────────────────────── -->
        {:else if page === 'tables'}
          {#if tablesPageRegular.total > 0}
            <Command.Group heading="Tables">
              {#each tablesPageRegular.items as table (table.name)}
                <Command.Item value="table {activeSchema} {table.name} {table.name}" onSelect={() => run(() => ontableselect(table.name))}>
                  <Icon name="table-2" class="size-4 shrink-0 opacity-60" />
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
                  <Icon name="eye" class="size-4 shrink-0 opacity-60" />
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
                  <Icon name="eye" class="size-4 shrink-0 opacity-60" />
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
              <Icon name="package" class="size-4 shrink-0 opacity-60" />
              <span data-slot="command-label" class="truncate">PostgreSQL container</span>
              <span data-slot="command-trailing" class="shrink-0 font-mono text-ui-2xs text-muted-foreground">:5433</span>
            </Command.Item>
            <Command.Item
              value="launch mysql container pull run 3307"
              onSelect={() => run(() => ondockerlaunch('mysql'))}
            >
              <Icon name="package" class="size-4 shrink-0 opacity-60" />
              <span data-slot="command-label" class="truncate">MySQL container</span>
              <span data-slot="command-trailing" class="shrink-0 font-mono text-ui-2xs text-muted-foreground">:3307</span>
            </Command.Item>
          </Command.Group>

        <!-- ── CONNECTIONS PAGE ───────────────────────────────────────── -->
        {:else if page === 'connections'}
          {#if savedConnections.length > 0}
            <Command.Group heading="Saved connections">
              {#each savedConnections as conn (conn.id)}
                {@const driverIconName = driverIcon(conn.type ?? 'postgres')}
                {@const isActive = conn.id === activeConnectionId}
                <Command.Item
                  value="connection {conn.name} {connSubtitle(conn)} {conn.type}"
                  onSelect={() => run(() => onswitchdatabase(conn))}
                  disabled={isActive}
                >
                  <Icon name={driverIconName} class="size-4 shrink-0 opacity-60" />
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
              <Icon name="database" class="size-4 shrink-0 opacity-60" />
              <span data-slot="command-label" class="truncate">New connection…</span>
            </Command.Item>
          </Command.Group>
        {/if}

      </Command.List>
    </div>
  {/snippet}
</Command.Dialog>
