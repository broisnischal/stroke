# Changelog

All notable changes to Stroke are listed here, newest first.

---

## [1.16.2] - 2026-07-28

### Bug Fixes

#### Data Table
- Dropped the per-cell "JSON" badge on JSON/JSONB columns — it cluttered the grid and was the main cause of scroll lag. Clicking a cell still opens the JSON viewer.
- Much smoother scrolling on tables large and small: plain vertical scroll runs on the compositor again instead of being blocked by the wheel handler on every tick. Ctrl+wheel zoom and Shift+wheel horizontal scroll still work.
- Expanded inline-JSON rows no longer black out or leave the bottom unreachable on very large (millions of rows) tables — their reserved height stays stable while scrolling.

#### Onboarding & Window
- The window can be dragged, minimized, maximized, and closed during onboarding — the tour no longer sits on top of the titlebar.
- The app opens at the full usable size on every platform without sliding under the taskbar; on Windows and macOS it now keeps its maximized state across minimize/restore.
- The date/time picker in the insert/edit form is selectable again.

#### Connections
- Connecting auto-retries transient failures (timeouts, network blips) a few times with fast backoff, but surfaces auth/config errors (e.g. 401 Unauthorized) immediately instead of spinning.

#### Update Dialog
- The "update available" dialog is centered on top of the connection screen instead of hidden behind it, with cleaner buttons.

### Changes

#### Design
- New installs follow the system light/dark theme on first launch, and default to 125% zoom on Windows.
- Refined the light-theme primary accent to a deeper, higher-contrast blue.
- Redesigned the filter bar: consistent control heights and radii, subtle fills, and a neutral AND/OR toggle.
- Slimmer 3-step onboarding with an inline license-activation row.
- Smaller tab labels and removed the blue active-tab underline.
- Removed em dashes from UI copy throughout the app.


## [1.16.1] - 2026-07-27

### Bug Fixes
- **Menus no longer clip long labels.** Context-menu and dropdown panels used fixed widths, so a label that did not fit painted straight through the rounded border — most visibly `Count chars / words / bytes` in the cell **Transform** submenu. Panels now size to their longest label, are capped at a shared maximum, and clip inside the border rather than over it. Labels that do exceed the cap now end in an ellipsis instead of a mid-glyph cut.
- **Chart axis dropdowns are readable again.** The axis pickers in the chart view opened from the SQL editor are native `<select>` elements whose options inherited a transparent background and near-white text, leaving the popup unreadable against the system menu surface. Options are now pinned to the popover colors, which fixes every native dropdown in the app.
- **Image columns no longer stall the grid.** Applying the avatar / image-thumbnail transform to a column started a full-resolution decode for every visible cell at once; on multi-megapixel sources that meant gigabytes of decoded image data. Decodes are now limited to a few at a time, restricted to rows actually on screen, downscaled once and released, and cached with an eviction policy that keeps visible thumbnails. Thumbnails are also freed when a table closes.
- **Fixed a memory leak when exporting CSV from a notebook cell**, which held the entire exported file in memory until the window was reloaded.


## [1.16.0] - 2026-07-27

### Improvements

#### Design
- Unified every text input, search box, and textarea onto one shape — `rounded-lg` corners with a consistent 2px border — so fields no longer vary between screens. Applied at the shared `Input`/`Textarea`/`InputGroup` primitives and across ~30 raw inputs in dialogs, pages, and panels. Seamless inline editors (grid cells, borderless search) are intentionally left untouched.
- Normalized card and panel corner radii to the design-system scale: content cards use `rounded-lg`, floating panels use `rounded-[10px]` (Instance Insights, Backup, Dashboard, ERD detail panel, connection pickers, confirm dialogs).
- Right-click cell menu: sub-menu rows (Transform, Insert, Copy row as) now match the size of their sibling rows instead of rendering a step larger.
- Wider table search field with a clearer resting border, and the six “Export as …” actions in the table’s more-actions menu are now grouped under a single **Export** submenu.

### Internal
- Repaired the unit-test harness (the `$lib` alias was missing from the vitest config, so no tests could run) and added `npm test`. Expanded coverage to the table-query filter/sort/search builder across engines, pagination helpers, response mapping, tab/SQL-format helpers, and the oversized-cell capping guard on the Rust side.

## [1.15.0] - 2026-07-23

### Improvements

#### Search
- Search options (match case, whole word, regex) now work per engine: full support on PostgreSQL and MySQL; case-sensitive matching on SQLite, Cloudflare D1, and libSQL. Toggles the engine can't honor are hidden per connection.
- Redesigned the table search bar — the match/word/regex toggles moved into a compact options popover so the input stays clean.
- Data-table search now uses `instr()` on SQLite/D1 instead of `LIKE`, fixing "LIKE or GLOB pattern too complex" errors on long search terms.

#### Data table
- Relationship columns can now be resized independently (previously resizing one resized all of them).
- Column widths for relationship and expression columns now persist across reloads.

#### Design
- Standardized all in-app text onto the unified `text-ui-*` type scale for consistent sizing across the app.

### Bug Fixes

#### SQL & query execution
- Statement splitting now respects semicolons inside string literals, comments, and `$$…$$` bodies, so multi-statement execution no longer breaks (PostgreSQL).
- MySQL: sorted queries no longer fail — the unsupported `NULLS LAST/FIRST` clause is replaced with an `ISNULL()` equivalent, and null-placement preference is honored.
- Keyset pagination no longer skips or reorders NULLs on nullable sort columns (falls back to offset paging).

#### Filters & search (cross-engine)
- DuckDB, ClickHouse, and MS SQL Server: the filters *not equals*, *not contains*, *starts with*, *ends with*, and *between* were silently ignored — they now apply correctly.
- *Not contains* now includes NULL rows (a null cell doesn't contain the term) on SQLite/D1, MySQL, and PostgreSQL.
- Search/LIKE patterns now escape `%`, `_` (and `[` on SQL Server) so those characters match literally instead of acting as wildcards (DuckDB, MS SQL Server).
- DuckDB: equality compares values natively instead of as text (`5` no longer differs from `05`).
- ClickHouse: *contains* and *ends with* are now case-insensitive, matching the search box.
- MySQL: filter and sort columns are validated, returning a clear error instead of a raw database failure.

#### Editing & data grid
- Duplicating a row that contains an oversized/truncated cell no longer corrupts that cell.
- Quick Look can now save an empty string distinctly from NULL, and switching a NULL cell to an empty string is no longer dropped.
- Saving a cell immediately no longer leaves a stale undo-stack entry that could re-write the value.
- Fixed a keyboard-navigation trap when starting an edit on a hidden column.
- Array cell editor: fixed stale input focus after removing or reordering elements.
- Edited cells now repaint immediately in all cases.

#### App & UI
- Infinite scroll no longer mixes in rows from a previously viewed table when switching quickly.
- The sidebar no longer gets stuck on "loading tables" when schema loading fails.
- Failed row deletions now surface an error toast.
- A single corrupt saved-connection entry no longer wipes the entire connection list.
- Live mode stops its backend watcher cleanly on teardown.
- Ctrl/Cmd+P no longer disrupts the command palette when it is already open.

#### Data diff & schema
- Data diff no longer drops rows when key columns contain duplicate values.
- Data diff now detects changes in JSON/array/object columns (previously always reported "unchanged").
- Data diff matches key columns case-sensitively (no more `ID`/`id` collisions).
- Schema timeline now detects column DEFAULT changes.

#### Import/export & tooling
- CSV exports include a UTF-8 BOM for correct encoding in spreadsheet apps.
- Fixed an object-URL leak in the browser download fallback.
- JSONPath: fixed parsing of quoted keys containing `]`, and `[*]` projection followed by an index, slice, or filter.
- AI: parallel streaming tool calls no longer merge together when the provider omits chunk indexes.

#### Security
- MCP read-only mode can no longer be bypassed via CTE-wrapped writes (`WITH … DELETE`) or `TABLE`/`VALUES` statements.
- LibSQL / D1: fixed incorrect result-truncation reporting in the MCP server.
- Hardened identifier validation (embedded `.` is rejected).

---

## [1.14.0] - 2026-07-23

### New Features

#### Cross-engine parity
- Redis keyspace browser — binary-safe values, non-blocking SCAN, CRUD, DB switcher, and streams
- EXPLAIN / query-plan visualization for DuckDB, ClickHouse, D1, and MS SQL Server (alongside Postgres/MySQL/SQLite)
- Instance Insights for SQLite, ClickHouse, and DuckDB
- Backup export/import for DuckDB (`EXPORT/IMPORT DATABASE`) and MS SQL Server (`BACKUP/RESTORE`)
- Schema introspection: MySQL & SQLite triggers, MySQL function introspection, and incoming foreign keys for more engines

#### Data & editing
- Multi-format export (CSV / JSON / SQL / TSV / Markdown / JSONL) in both the SQL console and the table view
- Inline cell editors for array, date/time, and JSON columns; bulk "fill selected rows"; copy cell as hex
- Query history favorites and run counts

#### Connections
- Saved-connection grouping in the sidebar
- Compact database pickers with keyboard navigation and friendlier connection errors

### Bug Fixes
- Table view now refetches after deleting rows (no more empty grid on paginated/large tables) and shows an "Applying…" indicator while changes are written
- The connection dialog no longer closes when you drag or resize the window by the titlebar
- Standard text-editing shortcuts (undo/redo, word- and line-delete) now work in inputs across the app
- Prisma: request `offline_access` scope and surface a clear "session expired" message on 401
- Hardened database write paths (no panics on bad binds), guarded localStorage writes, and sanitized Redis connection input

### Changes
- Release notes / changelog now open on the website instead of an in-app page
- Performance: heavy views are torn down after being hidden a while to reclaim memory, background polling (live mode, insights, Redis TTL) pauses while the window is hidden, and Monaco editors share a single theme observer
- Design system: refined font-size tokens, radii, accent selection, focus rings, and accessibility; ORM SQL highlighting; updated input borders; window maximizes on launch


## [Unreleased]


## [1.13.0] - 2026-07-22

### New Features

#### Redis (new engine)
- **Redis support** — connect to Redis end-to-end: a keyspace browser (scan keys by type and inspect values), a redis-cli-style command console with formatted replies, and capability-gated UI that hides SQL-only surfaces (table browser, SQL editor, ERD, insights) for key-value connections. Redis replaces BigQuery in the "coming soon" slot.

#### SQL Editor
- **Multiple SQL editor tabs** — open several independent SQL editor tabs from the command palette ("New SQL Editor") and work across them, each with its own draft and results.

#### Charts
- **Charts overhaul** — theme-aware series colours that follow `--primary`, categorical bars sorted by value with ellipsis on truncated labels, bar shadow-hover, a compact Y axis and horizontal scroll, plus crash-safety and large-data handling across sankey / tree / dendrogram / word-cloud.

#### Design System
- **App-wide design system** — a documented `DESIGN_SYSTEM.md` type scale (`text-ui-*`) swept across every surface, aligned `ui/*` primitives (standardized `rounded-[10px]` menus and submenus), a unified searchable-dropdown component, a widened AI model picker with 2-column provider/model grids, and grayscale font antialiasing for crisper text.
- **Connection modal redesign** — a full-page providers-as-tabs layout with a searchable engine picker, a full-width Advanced section and smaller inputs.
- **Command-palette page navigator** — the vertical activity bar is replaced by a ⌘P "Go to page" navigator; a `+` button in the status bar opens new surfaces, and the Tools launcher is removed.

#### Instance Insights
- **Instance Insights** — a live monitoring dashboard for PostgreSQL and MySQL, opened from the command palette or the welcome screen. Activity / State / Config / Replication sub-tabs surface session, TPS, tuple and block-I/O stat cards, ECharts timelines (per-second rates diffed from cumulative counters), sessions / locks / prepared-transaction tables, a searchable `pg_settings` / server-variables browser, and replication stats & slots. Auto-refreshes, and degrades gracefully when catalogs or permissions are missing.

#### Database Objects
- **Database Objects overview** — a database-wide catalog of Tables (name, schema, kind, owner, estimated rows, total / data / index size, comment), Views, Functions / Routines and Triggers, per dialect (Postgres/CockroachDB, MySQL/MariaDB, SQLite/D1/libsql, ClickHouse, DuckDB, SQL Server). Open it from the command palette or the welcome screen.

#### Security
- **Roles & Permissions (RLS)** — a new Permissions view on the Security page: a grouped role tree (superusers / login / group), a role-attributes panel, inherited-from membership, and per-database access grants.

#### AI
- **Agent settings** — a new Agent tab in Settings for the default model, per-provider API keys (OpenAI / Gemini / Anthropic / OpenRouter), chat & code font sizes, and the thinking-indicator style.
- **Multi-tab AI chat** — a horizontal conversation tab bar over the multi-conversation / history model.
- **Command-palette quick-ask** — ask the AI straight from ⌘K as a tool-using, multi-turn chat.
- **Slash-command quick actions** — slash commands in the AI sidebar for common asks.
- **Table mentions as badges** — `@`-mentioned tables become removable badges above the chat input.
- **Downloadable AI results** — an `export_data` tool with JSON / CSV / Markdown downloads (progress + toast), plus an `export_query` MCP tool.

#### Data Table
- **Data view modes** — a segmented switcher renders the current page as Table, JSON (Monaco-based, with JSONPath filtering), Record (one row at a time, DBeaver-style, with field search and inline editing), Text (CSV / TSV / Markdown / JSON Lines), Chart, or ERD. The grid stays mounted so edits, selection and scroll survive switching, and each tab remembers its mode.
- **Per-table ERD** — an entity-relationship diagram scoped to one table and its foreign-key neighbours, with a decrossed layout and orthogonal edge routing; also available as an ERD data view in the switcher above.
- **Saved views** — bookmark the current search + filters + sort + hidden columns + view mode under a name (per connection / schema / table), re-apply with one click, and see a count badge on the toolbar.
- **Find & Replace** — replace text across an editable column with contains / exact / regex matching (capture groups, live pattern errors, optional case sensitivity) and a full before → after preview; changes route through the parameterized cell-save pipeline. Disabled on tables without a primary key and on read-only connections.
- **Column reorder, colours & tags** — move columns left / right / first / last from the header menu (display-only, persisted), paint header bands in six muted tones, and add short badge tags to columns.
- **Docked relation panel** — the foreign-key related-rows sub-view moved into a resizable bottom dock (height persisted) instead of fighting the grid's scroll.
- **Cell display markers** — tell NULL (∅), empty (`""`) and whitespace-only (·) cells apart at a glance; tint timestamp cells by freshness; and render image / avatar columns as thumbnails.
- **Pagination strategies** — choose offset (default), cursor, keyset or temporal paging in Database settings; every mode safely falls back to offset when preconditions aren't met.
- **Configurable NULL sort order** — set where NULLs land in browse queries.
- **Richer tab bar** — an expanded tab context menu and middle-click to close.

#### SQL Editor
- **Run split-button + query parameters** — a DataGrip-style Run dropdown (all statements / statement at cursor with preview / selection) plus `:name` parameters detected by a string-, comment- and cast-aware scanner, with an Auto / Text / Raw SQL / NULL mode per parameter; values inline as escaped literals so history stays reproducible.
- **Generate SQL** — a Generate SQL dialog (with `:name` skeletons), alongside console / count / copy-columns table actions and a redesigned View DDL dialog.
- **Error tab** — failed SQL runs open in a dedicated, copyable Error tab.
- **Query draft restore** — the Query Editor restores its unsaved draft on reopen.
- **Query-log console** — every executed statement logged in a console at the bottom.

#### Interface
- **Panel-switchable sidebar** — a Connections panel (list / add / switch connections inline) and an Extensions panel (VSCode-style list with Install toggles; clicking an extension opens its detail as a tab) alongside the Tables panel.
- **Unified tooltips** — a single delegated GlobalTooltip styles every tooltip app-wide with a consistent arrow, 8px offset, 450ms delay, hover-persistence and viewport-aware flipping, replacing native `title` and per-component tooltips.
- **Status bar** — shows the app version, a searchable connection switcher with provider brand icons, and a last-fetch timing readout; switch database straight from the ⌘K root.

#### Extensions
- **Extensions gallery** — a launcher-style card grid (responsive 2–4 columns) replaces the master-detail list, each card showing its icon, name, kind and an inline enable toggle; click to drill into detail.
- **Cell transform library** — a richer set of per-column cell transforms with a result toast.
- **Data generators** — split into ID Generators (IDs only) and a new Data Gen generator.

#### Themes & Localization
- **High Contrast themes** — new Dark and Light High Contrast themes for accessibility.
- **Localization** — a localization foundation and language picker (English, Spanish, French, German) covering the sidebar, tabs, column menu and Settings.
- **Phosphor icons** — the Phosphor icon family is selectable in the icon wrapper (~80 semantic glyphs mapped).
- **More fonts** — additional UI and editor fonts.

#### Vim
- **Experimental Vim mode** — an off-by-default modal keyboard layer (toggled in Settings) with a status-bar mode indicator, `hjkl` / edit / delete / yank / search bindings in the data grid, monaco-vim in the SQL and ORM editors, and `:` / `gt` / `gT` at the app level.

### Performance

#### Data Grids
- **Non-reactive row storage** — large browse / SQL / ORM row arrays moved to `$state.raw`, removing per-cell Proxy overhead on the canvas draw path and the retained per-index signals when scrolling huge tables; redraws are still driven by explicit signals.
- **Huge tables** — the row cap is raised to 5M with sparse row-top tracking and normalized scroll height so every row is reachable, plus windowed loading for large "All" result sets.
- **Fewer redundant paints** — no double-paint on structural changes, and a per-frame allocation during range-select was removed.

#### App
- **Memory across tabs** — cold background tabs release their result rows at a much lower threshold; the three most-recent tabs stay warm, and closed tabs no longer pin result sets in memory.
- **Faster first open** — table metadata is fetched concurrently with the first page of rows.
- **Instance Insights config** — the large `pg_settings` table uses fixed layout + content-visibility for smooth scrolling.
- **Lighter sidebar & stores** — debounced filtering, memoized sort and capped un-virtualized lists in the sidebar; debounced JSONPath evaluation and localStorage persistence off the keystroke; image thumbnails downscaled once to fix scroll lag.

### Bug Fixes

#### Data Table
- **Huge / scaled tables** — the inline row-expand panel and the cell editor now paint correctly on very large or zoomed tables.
- **Avatar / image cells** — transient avatar loads no longer freeze as a "broken image", and avatar transform detection is fixed.
- **Sticky header seams** — scrolled rows no longer bleed through the sticky header of the data-diff and foreign-key sub-views.
- **Hidden columns** — expanded-row JSON, row copy and exports now respect hidden columns (exporting only the visible ones).
- **Resize & toggle glitches** — fixed resize jitter, a relation-header gap and expand-toggle flicker.

#### Data
- **MySQL DECIMAL** — DECIMAL columns decode exactly instead of through the integer path.
- **Cross-dialect column stats** — column statistics work across engines, D1 shows the right welcome name, and per-connection table state is kept separate.
- **Row counts** — the sidebar counts rows on every engine.
- **Session timezone** — the session timezone setting is actually applied.
- **Clipboard** — copy routes through Tauri's native clipboard plugin.

#### Interface
- **Extensions panel** — per-extension icons and kind labels.
- **Diagram export** — success / error toasts on ERD export.
- **Off-screen window** — an off-screen app window is recovered, and split-pane layout no longer shifts.
- **AI chat** — chat font settings apply; fixed undefined table names and quick-ask auto-scroll / flicker.

#### Stability
- **Crash fixes** — a duplicate keyed-each key and an infinite loop in the sidebar row-height measure no longer crash the app.

### Changes

#### Interface
- **Move sidebar right** — right-click to dock the sidebar to the right side.
- **Split panes** — tmux-style active / inactive pane styling and smoother resizing.
- **Unified input focus** — inputs across the app share a single fused two-tone focus stroke.


## [1.12.0] - 2026-07-14

### New Features

#### Data Table
- **Array cell editor** — Postgres array columns (`text[]`, `int[]`, …) get a dedicated add / remove / reorder editor instead of being edited as raw JSON, and now display as `{a,b}` array literals.
- **Grid styles** — choose from six table grid styles in Settings: Lines, Bordered, Striped, Dotted, Dots, and Minimal.
- **DML preview** — review (and edit) the prettified SQL for a change before it's applied.

#### Interface
- **Provider sign-in** — refreshed the connection screen and provider sign-in flow.
- **More keyboard shortcuts** — reopen closed tab, jump to tab 1–9, toggle the tab bar, and disconnect.
- **Auto-reconnect** — optionally reconnect to your last database on startup.

### Bug Fixes

#### Data
- **Array columns rendered as garbage** — Postgres array values were decoded from the binary wire format as lossy UTF-8 (□ boxes); they now decode into proper arrays.

#### Security
- **Saved credentials not persisting** — the OS keychain integration now enables a real per-platform backend, so AI keys and OAuth tokens actually persist (previously a missing backend feature silently used a non-persistent in-memory store on some setups).


## [1.11.0] - 2026-07-14

### Bug Fixes

#### Backup & Restore
- **Cloudflare D1 export** — internal `_cf_*` tables (e.g. `_cf_KV`) are now hidden and skipped, so D1 backups no longer fail with `SQLITE_AUTH`, and one unreadable table can't abort the whole export.
- **Table selection** — deselecting tables in the backup panel now sticks instead of instantly resetting to all.
- **Restoring routines** — PostgreSQL functions, triggers, and enums (dollar-quoted bodies) and MySQL `DELIMITER` blocks now restore intact rather than being split at their internal semicolons.
- **Restore stability** — a failed statement containing multibyte text no longer panics the restore, and a single PostgreSQL error no longer rolls back the entire restore (per-statement savepoints).
- **Data fidelity** — PostgreSQL `smallint`/`numeric`/`money` values and non-finite floats now export correctly (previously lost or written as `NULL`), and D1 BLOB columns export as hex literals instead of corrupt text.
- **Stop button** — stopping a backup or restore now actually halts the backend, not just the UI.
- **Filtered exports** — backing up a subset of SQLite/D1 tables no longer emits indexes or triggers for tables outside the selection.

### Changes

#### Interface
- **Provider sign-in** — the "Sign in with …" OAuth button now shows the provider's brand mark and lifts subtly on hover.


## [1.10.0] - 2026-07-13

### New Features

#### Interface
- **Signature accent** — the default Studio light & dark themes gain a refined indigo primary, focus ring, and text selection (verified AA).
- **Display headings** — titles use a tighter, optically-sized heading treatment for a more premium feel.
- **Elevation system** — dialogs, menus, popovers and cards use layered, theme-aware shadows with a catch-light rim instead of flat borders.
- **Searchable dropdowns** — the filter condition/value pickers and the status-bar AI model picker gain a search box with a checkmark on the selected item.

#### Data Table
- **Date filter presets** — a relative-range menu (Today, Last 7 / 30 / 90 days, This month, Year to date, and "In the last N hours/days/weeks/months") beside the calendar.
- **Enum value dropdown** — enum columns filter by picking from a searchable list of their values instead of typing free text.
- **Instant rows, count later** — opening a table paints rows immediately and fills in the total ("… of N") in the background instead of waiting on COUNT(*).
- **Multi-column sort** — shift-click column headers to add secondary sort keys; sorted headers show their priority number.
- **Dismiss an expanded row** — press Esc (closes the most recent) or the new close button to collapse an inline expanded-row JSON panel.

#### Security
- **OS keychain storage** — AI keys and provider OAuth tokens now live in the OS keychain (Keychain / Credential Manager / Secret Service), migrated automatically from the old plaintext file.

#### Relation Tree
- **Row counts stream in** — each related table's row count now loads in the background without blocking the relation tree.

### Bug Fixes

#### AI
- **Add-model dialog** — stepper, buttons and provider selection use the app accent consistently.
- **AI empty state** — "Configure a model" is a clear primary action rather than an alarming amber warning.
- **@-mention picker** — decluttered (proper elevation, no redundant per-row schema labels).

#### Data Table
- **Table navigation shortcuts** — Cmd/Ctrl+Arrow now scrolls/paginates cleanly instead of also jumping the cell cursor.
- **Date filters match** — "equals" and "is between" on timestamp columns now match the whole day instead of returning no rows.
- **JSON cell badge** — the braces icon no longer overlaps the "JSON" label; the pill is sized to fit.
- **LIVE indicator** — a calm pill (no neon ring/ping), theme-correct and reduced-motion aware.
- **Row inspector density** — the expanded-row JSON view uses smaller, right-sized text.
- **Image previews** — cell URLs are percent-encoded before preview/open, fixing images that failed to load.

#### Interface
- **Graphite contrast** — button labels on the Graphite theme now meet WCAG AA.
- **Icon-set picker** — preview no longer crams two glyphs together; the description text is legible.
- **Studio Light depth** — cards and menus no longer read as sunken; raised surfaces now sit above the canvas.
- **MCP panel** — client tiles use one consistent neutral style instead of mismatched colors.
- **Title-bar hovers** — control hovers are visible on light themes (were near-invisible white overlays).

#### Connection
- **Provider sessions persist** — connections via Neon/Supabase/etc. no longer prompt for re-login roughly every day.

#### Sidebar
- **Auto-deselect** — multi-select table actions (Open/Close/Copy/Pin) clear the selection when finished.

#### SQL Editor
- **SQL error panel** — errors are now selectable/copyable with a copy button and a terminal-style red gutter.

### Changes

#### Interface
- **Dialog surfaces** — dialogs adopt the elevation system (rounded, layered shadow) in place of flat hairline borders.
- **Button feedback** — primary buttons gain subtle elevation and a press (scale) response.
- **Cleaner tab bar** — removed the recent-tables and new-tab buttons from the tab strip (new tabs open via ⌘T / the command palette).
- **Text selection** — selection colour is brand-tinted from the theme's primary, kept legible over editor and cell content.

#### Data Table
- **Range selection removed** — drag/shift row & cell range selection is disabled (unused); single-cell focus, editing and copy are unchanged.


## [1.9.0] - 2026-07-11

### New Features

#### Connection
- **Silent auto-reconnect** — a dropped database connection (network blip, sleep/wake, idle timeout) now reconnects automatically when the network returns, the window refocuses, or you switch tables / refresh, showing only a subtle status-bar indicator instead of a "Connection lost" popup.

### Bug Fixes

#### Data Table
- **Grid no longer renders blank** — on macOS WebKit the canvas colour reader returned a stale computed colour, collapsing every theme token to one value so cell text and grid lines vanished (only badges/icons showed). Each colour is now resolved on its own node.
- **Grid no longer blacks out when switching tabs** — the cached 2D context could keep pointing at a canvas WebKit had recreated, so draws landed on an off-screen element. The context now always tracks the live canvas and repaints on mount/tab switch.

#### Schema Visualizer
- **Opens readable instead of a tiny sliver** — a deep schema no longer shrinks to an unreadable horizontal band; it lands at a legible zoom at the top-left of the graph (pan to explore), with roomier, larger table cards and more spacing.

#### Interface
- **Spinners and loaders animate at normal speed** — a global reduced-motion rule was forcing every animation to 0.12s, so spinners/pulses ran frantically fast when macOS "Reduce Motion" was on. Removed the global motion overrides.

### Changes

#### Performance
- **Smoother scrolling and lower memory on large tables** — removed per-frame allocations in the grid render loop, decoupled selection/hover repaints from canvas resizing, and avoid allocating a per-page row-offset array on million-row tables.


## [1.8.0] - 2026-07-10

### Changes

#### Connect experience (redesigned) (#40)
- Rebuilt the connection screen as a **two-pane layout** — choose your connection type, driver, and saved connections in a left rail while editing details in a focused right pane, so the fields are reachable without scrolling.
- **Pick one input method** — a segmented switch toggles between pasting a **connection string** and filling **manual fields**, instead of showing both at once. Pasting a string auto-fills the fields and validates on connect.
- **Cleaner provider picker** — Neon, Supabase, PlanetScale, and Prisma Postgres now appear as a single calm list with a clear selected state and a compact sign-in action, replacing the bulky cards.
- Redesigned the **connection error** as a readable inline alert and gave the footer a clear status chip (Ready / Unsaved / Connection OK / Failed) alongside unambiguous Test and Connect actions.
- Inputs now use a **crisp outline and a single accent focus ring**, consistent across the app.
- Widened the connections rail and stopped the connection screen from flickering when switching between saved connections or drivers.

#### Interface polish
- Added **press feedback** to buttons and gave menus, selects, popovers, tooltips, and dialogs consistent, snappier open/close motion; menus now scale from the control that opened them.
- The app now respects the system **"reduce motion"** setting — movement is minimized while feedback is preserved.
- **Sidebar** table rows: names and row counts sit on a shared baseline, resting contrast is higher for easier scanning, and section headers are refined.
- Tightened **Settings** spacing and control feedback.

### Bug Fixes
- Fixed **"Limit must be at least 1"** when opening a table after choosing "All" rows — the page size now falls back to a valid default (50) instead of erroring.
- The data grid no longer offers **Set NULL** on NOT NULL columns; it shows a clear message instead of attempting a write that would fail.
- Text on the connection screen is no longer accidentally selectable, and the cursor now shows a pointer on every clickable control.


## [1.7.0] - 2026-07-06

### New Features

#### Database Providers
- **Sign in to a database provider** — connect **Neon, Supabase, PlanetScale, and Prisma Postgres** from inside Stroke. Authorize once (OAuth in your browser, or a pasted key), see every database on your account, and connect in one click — no hunting for connection strings. Supabase remembers your database password after the first connect.
- **Switch provider databases from the status bar** — the database switcher now lists your account's other databases and jumps to them directly.

### Bug Fixes
- **Ctrl/Cmd+A** now selects the text inside a cell editor instead of selecting every row
- **Status badges** and **boolean glyphs** are now legible in light mode (they were tuned only for dark)
- The **foreign-key sub-view** now scrolls vertically and horizontally instead of trapping the wheel


## [1.5.1] - 2026-07-06

### Bug Fixes
- Fixed a console warning in the JSON tree view where the initial expand state read reactive props directly

### Changes

#### Updates
- Added a **View changelog** link in the updater toast that opens the online changelog
- Windows updates now install in place with a passive progress bar (no setup wizard to click through)


## [1.5.0] - 2026-07-05

### Changes
- Data-table, SQL editor, JSON viewer & extensions improvements (minor release) (#36)


## [1.4.0] - 2026-07-04

### Changes
- Release v1.3.0 — split panes, block selection, staged deletes & more (#18)


## [1.2.0] - 2026-07-03

### New Features

#### Data Table
- Search highlighting: the toolbar search now shows exactly where each match falls — matched text is highlighted inside the visible cells, across every column
- JSON tree view in expanded rows: fold and unfold any nested object or array with proper chevrons, type-colored values, and item/key counts — plus per-field **Copy value** and **Open in JSON viewer** actions that jump straight into the full Monaco viewer. A Tree/Raw toggle is remembered across sessions

### Bug Fixes

#### Stability
- Fixed the app freezing when opening tables with very large cells — multi-MB file buffers stored in `jsonb`/`text`/blob columns could lock up the whole app. Cells above 256 KB now load as a truncated preview with the real size shown; the grid, JSON viewer, copy, and export all mark the truncation clearly, and editing or filtering on a truncated cell is blocked so a preview can never be saved back over real data. Applies to PostgreSQL, MySQL, SQLite, and the built-in MCP server
- A crash inside one table view can no longer take down the whole app: rendering and interaction errors are contained to that tab, which shows a "Reload this view" card while every other tab, the sidebar, and the status bar keep working
- SQLite: large blobs no longer render as unbounded hex text (the worst case doubled the data size on screen)

#### Database Switcher
- The search box is now always there and focused the moment the switcher opens — start typing immediately, with any number of databases
- New shortcuts: **⌘D** opens the database switcher, **⇧⌘C** the connection switcher; arrows, Tab, and Enter drive the list right from the search box

#### Sidebar
- Restored smooth scrolling to the bottom of large table lists: removed the inline column-expansion rows that broke the virtualized list
- "View data structure" is now "View structure"

#### Licensing
- Active trials always keep Pro access: only a definitive "trial expired" verdict locks Pro features — a transient license-check failure can no longer lock out trial or paid users

### Changes

#### AI Chat
- The conversation column now matches the composer width for a comfortable reading measure, with more breathing room between messages

#### Performance
- Sorting SQL results by JSON columns no longer re-stringifies every cell on every comparison
- Copy and export of object cells reuse one serialization path and stay fast on large result sets


## [1.1.0] - 2026-07-03

### New Features

#### Tabs
- Pin tabs: pinned tabs stay grouped at the front, show a pin badge, and survive "Close Others" / "Close All"

#### Themes
- New **Graphite** theme, wired through the editor and diagram themes

#### Licensing
- New in-app license page: "Activate Pro" now opens a dedicated tab with key entry, plan status, what Pro unlocks, and a purchase link — confetti included on activation
- License entry in Settings with a live plan badge (Pro / Trial / Free)

#### SQL Editor
- Column sorting on query results — numbers sort numerically, NULLs last, and the sorted order carries into the JSON view, charts, and CSV/JSON exports

### Bug Fixes

#### Data Table
- Pinned columns now freeze flush to the left edge — no more empty gutter-wide gap after scrolling
- Query results grid is read-only: removed actions that can't apply to ad-hoc results (Filter/Exclude by value, Edit, Set NULL, Duplicate/Delete row, INSERT copy)
- Column stats no longer error with "Invalid identifier" on SQL editor results
- Sidebar rows no longer shift as row counts load in

#### Window
- Double-clicking the titlebar now maximizes reliably (a duplicate handler was maximizing and instantly restoring)

### Changes

#### Performance
- Reconnect feels instant: the overlay drops as soon as the connection is live, and schemas/tables stream into the sidebar instead of blocking the screen
- Table row counts load lazily — the sidebar renders immediately with placeholders and exact counts fill in from a background pass; schema switches get the same speedup
- Faster Postgres connect: one fewer round trip per pooled connection, and the reachability check runs concurrently with the real handshake
- AI streaming responses parse markdown at most once per frame instead of once per token

#### Settings
- Settings dialog redesigned: grouped sections (Appearance / Behavior / More), clearer hierarchy, keyboard-shortcut chips

#### Release pipeline
- Releases now publish to the public `stroke` repository — auto-update, Homebrew, and Scoop keep working with the private source repo


## [1.0.0] - 2026-07-01

### Performance
- Faster (re)connect: `onConnected` now loads query history + MCP autostart concurrently with the schema/table load instead of behind it, and no longer double-fetches the query stores on startup.
- Fixed the reconnect "slow acquire" storm: per-table `COUNT(*)` on large Postgres schemas now runs with bounded concurrency (capped at the pool size) instead of firing every count at once and starving the 4-connection pool.
- Sidebar row counts for SQLite / D1 / LibSQL / DuckDB are batched into one `UNION ALL` round-trip per chunk (a 40-table Turso/D1 sidebar goes from ~40 requests to 1), with a per-table fallback.
- Extended the `include_meta` fast-path to MySQL / MSSQL / ClickHouse / DuckDB so pagination, sort and filter stop re-fetching primary-key / foreign-key / column metadata every page (MSSQL plain paging drops from 4 serialized round-trips to 2).
- Table list is cached per connection + schema (short TTL) so rapid tab/schema navigation stops re-hitting the catalog; refresh and DDL force a fresh load.
- Real query cancellation for PostgreSQL (`pg_cancel_backend`) and MySQL (`KILL QUERY`): cancelling now stops the statement server-side instead of only abandoning the client future.

### Themes & UI
- Retuned every theme's `muted-foreground` to clear WCAG AA (≥4.5:1); secondary text (sidebar row counts, labels) was previously failing contrast and hard to read.
- Added four curated themes: **GitHub** (light), **Rosé Pine**, **Catppuccin Mocha**, and **Solarized** (dark) — wired through the registry, editor themes, and Mermaid.
- New selectable **icon weight** (Light / Regular / Bold) in Settings, applied globally to every Lucide icon.
- Extensions page: refreshed detail header into an accent-tinted card that adapts to the active theme.
- Connection modal: removed the Environment selector and reworked the layout so the action buttons are always visible and the form body scrolls cleanly.

### Refactoring
- Introduced a shared `db/sql_util` module (statement classification, identifier quoting, LIKE/literal escaping) and collapsed the near-identical D1 and LibSQL row helpers into generic functions behind a `RemoteSqlite` trait (~210 lines removed from `query.rs`).
- Collapsed 13 duplicated `open*Tab` functions in the shell into one data-driven helper; extracted column-shape normalization (`column.js`), table/UI preferences (`stores/table-prefs.js`), and the row-response mapper (`readRowsResponse`).

### Fixes
- Fixed a crash on the schema Enums page (`each_key_duplicate`): the Postgres enum query fanned out labels once per column that used the type; values are now computed in a subquery, with a defensive frontend dedupe.
- Guarded persisted store writes (connections / settings / layout) so a full/blocked `localStorage` can't throw into connect/disconnect flows.
- `formatInvokeError` no longer masks genuine backend errors that happen to mention "invoke" / "Tauri".
- Removed a shadowed duplicate `Mod+T` hotkey.

### Chore
- Removed build cruft committed to the repo (an extracted AppImage `squashfs-root/`, a stale `schema.rs.tmp` copy, `dummy.txt`, `file.txt`) and hardened `.gitignore`.


## [0.7.2] - 2026-06-26

### Changes
- feat:: a11y, font rasterization, and more fixes. (#11)


## [0.7.0] - 2026-06-24

### Changes
- fix: cross-driver correctness, a11y, and faster command-palette, ux and ui improvement, rendering fps improvements (#10)


## [0.6.0] - 2026-06-23

### Changes
- feat:: features and improvements (#9)


## [0.5.0] - 2026-06-17

### Changes
- feat:: bugs, optimizations, virtual cols and many more  (#8)


## [0.4.3] - 2026-06-06

### Bug Fixes

#### Auto-update
- Fixed auto-update failing on macOS (and all platforms) with "invalid encoding in minisign data" — the updater public key in `tauri.conf.json` was accidentally base64-encoded twice, so the embedded key couldn't be parsed. It's now the correct single-encoded value.

> **Note:** 0.4.1 and 0.4.2 shipped with the malformed key baked in, so those installs cannot auto-update — download 0.4.3 manually (or via `brew`/`scoop`) once. Auto-update works normally from 0.4.3 onward.

## [0.4.2] - 2026-06-06

### Bug Fixes

#### Release Pipeline
- Fixed the Linux release job failing to find its bundles — Tauri names them after the product name (`Stroke_*`), but the upload step expected lowercase `stroke_*`; it now globs the real files and normalizes the asset names. This also restores `latest.json` (auto-update) publishing.

### Changes

#### Distribution
- **Homebrew (macOS):** `brew install --cask broisnischal/tap/stroke` — installs warning-free, no manual `xattr`
- **Scoop (Windows):** `scoop bucket add stroke https://github.com/broisnischal/stroke && scoop install stroke` — installs without the SmartScreen block
- Dropped the self-signed Windows certificate (it never cleared SmartScreen, so it added nothing); direct `.exe` downloads are unsigned — use Scoop, or click "More info → Run anyway"

## [0.4.1] - 2026-06-06

### Bug Fixes

#### Release Pipeline
- Fixed release builds failing on all platforms — regenerated the Tauri updater signing key so the private key and password match again (`incorrect updater private key password: failed to fill whole buffer`)
- Fixed macOS builds failing during code signing (`PKCS12 import MAC verification failed`) by switching macOS to ad-hoc signing; mac users run `xattr -cr /Applications/Stroke.app` once after install

## [0.4.0] - 2026-06-05

### New Features

#### Release Pipeline
- **In-app release notes** — the update dialog now shows a structured release notes page with ✨ New Features, 🐛 Bug Fixes, and 🔧 Improvements sections parsed from the changelog
- **Code signing** — builds are now signed on macOS (Developer ID + notarization) and Windows (certificate thumbprint via cert store) in CI

### Bug Fixes
- Fixed rel columns remaining visible in the canvas after being hidden from the columns panel — the toolbar was capped at showing 5 rel entries, so hiding all 5 caused DataTable to promote the next batch of FK tables into view with no way to hide them
- Fixed the `rel` badge not dimming visually when a relationship column is toggled to hidden in the columns panel
- Fixed the "Hide all" button in the columns panel not including relationship columns — clicking Hide now hides both regular and rel columns together

### Changes
- Renamed app references from **DB Studio** to **Stroke** across all files, workflows, and documentation
- Updated domain from `dbstudio.app` to `stroke.app` in license gate and about dialog
- Updated GitHub repo references from `broisnischal/studio` to `broisnischal/stroke` in updater endpoint, release workflow, and README
- Updated macOS bundle artifact name from `db-studio.app` to `Stroke.app` and all installer filenames from `db-studio_*` to `stroke_*` to match the `productName` in tauri config


## [0.3.4] - 2026-06-04

### New Features

#### Canvas Table
- **Canvas zoom** — `Ctrl/Cmd + Scroll` or `Ctrl/Cmd + =/-/0` zooms the entire table (rows, fonts, columns) proportionally; zoom level is shared across all open tabs and persisted to `localStorage`
- **FK inline sub-view** — clicking a foreign-key cell opens a compact panel below the row showing the referenced record(s); `Ctrl/Cmd + click` navigates to the full table; `Esc` closes
- **Reverse FK relationship columns** — tables that reference the current table appear as pill-badge columns on the right; clicking a badge shows related rows in the inline panel (max 5 columns, deduplicated by `fromTable`)
- **Per-tab expand state** — JSON expand rows and FK sub-view state are saved per table tab and restored when switching back; different tables start with their own clean slate
- **Shift + scroll for horizontal** — default mouse wheel scrolls vertically; Shift + scroll moves the table horizontally, preventing accidental horizontal hijack on wide tables
- **`Ctrl/Cmd + T` clears table search** — when viewing a table tab, this shortcut clears and focuses the row search input
- **Go-to-top / bottom buttons** always visible in the status bar when on a table tab

#### SQL Editor
- **Ctrl/Cmd + Enter runs query from first keystroke** — uses a document-level `capture` listener so it fires even before the editor is clicked into; also works from the very first open without clicking Run first
- **Auto-focus on tab open** — the SQL editor receives focus automatically whenever the SQL tab becomes active

#### SQL Console
- **Export results** — `CSV` and `JSON` download buttons appear in the result toolbar when a query returns data
- **0-row results hidden** — when a query returns 0 rows, no result card is added to the AI chat; the AI still knows the result was empty

#### MCP Server
- **Read-only mode** — toggle in the MCP dialog restricts the agent to `SELECT`-only queries; `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, and other write operations are rejected at the server level with a clear error; setting is persisted and synced to the Rust backend live
- **MCP panel revamp** — redesigned in the Linear/Resend/Raycast style: compact list rows instead of large cards, inline Start/Stop button, amber-accented read-only toggle, theme-aware borders throughout

#### AI Chat
- **Image rendering removed** — database columns containing image URLs no longer trigger dozens of simultaneous network requests; images are replaced with compact link chips (`filename.ext`) that open on click; resolves major performance lag on tables with image URL columns
- **Schema/describe results hidden** — internal AI tool calls (`describe_table`, `get_schema`) no longer show result cards in the chat; the AI still receives the data and answers correctly but the intermediate steps stay invisible
- **Inline code chip styling** — column name chips (`created_at`, `user_id`) are more polished: 5px radius, proper padding, `Geist Mono` font, `white-space: nowrap`
- **AI chat table styling** — uppercase small-caps headers, hover-highlight rows (replaces static zebra striping), 8px border-radius with `overflow: hidden` clipping
- **Input textarea** — replaced hardcoded `#3a3a3a` border with `var(--border)` tokens; `focus-within` ring; `font-family: inherit` ensures Inter is used for typed text
- **AI chart save preserves spec** — AI-generated charts (including `meter` and `choropleth` types that don't use ECharts) now save the full `aiSpec` so previews render correctly in Charts and Dashboard pages

### Bug Fixes
- Fixed `onCanvasPointerLeave` missing after tooltip removal — hover state now clears correctly on mouse leave
- Fixed `cy` variable not defined in virtual column badge drawing — was causing a `ReferenceError` silently
- Fixed `run` not in scope in `docRunHandler` — `Ctrl+Enter` in SQL editor would silently fail with `ReferenceError` instead of running the query
- Fixed connection pool exhaustion — reverse FK relationships are now cached per `schema.table` and loaded only once, not on every page/sort/filter reload
- Fixed `canvasZoom` not live-updating open tabs — replaced local `$state` with a module-level `$state` store so all DataTable instances react immediately; also fixed passive wheel listener that prevented `preventDefault`
- Fixed `Cmd+K` command palette search persisting between opens — `paletteSearch` is now cleared when the dialog closes
- Fixed FK sub-view "Open in sub view" not navigating for reverse FK — now correctly passes `reverseRel` info to `handleFollowForeignKey` and navigates to the referencing table with filters applied
- Fixed virtual relationship column width too narrow — minimum raised to 300px with conservative `10px/char` estimate; eliminates `cart_it...` truncation
- Fixed row lines not extending into virtual columns — bottom grid line now draws to full `_viewportWidth` and is painted after cell fills so it stays on top
- Fixed FK sub-view panel position — panel now anchors to viewport left edge using `transform: translateX(_scrollLeft)` (GPU-composited, no layout thrashing) regardless of horizontal scroll
- Fixed FK sub-view lag on open — replaced debounced `ResizeObserver` height chain with zero-cost overlay (panel doesn't push rows down, no `rowTops` recomputation)
- Fixed horizontal scroll hijack in FK sub-view — only horizontal `wheel` events are stopped from propagating; vertical scroll always passes through to the main table

### Changes
- Removed column collapse (drag-to-hide) — columns now have a hard 48px minimum width instead of snapping to a 12px strip
- Removed hover tooltips on canvas cells — eliminated the 450ms `setTimeout` loop that was firing on every mouse move at 120Hz
- Not-null dot badge removed from column headers — was visually indistinguishable from the `·` type separator and caused confusion
- FK sub-view and JSON expand are mutually exclusive per row — opening one closes the other
- Ctrl+T in table view clears search instead of opening the command palette tables page (the command palette shortcut is unchanged from other views)
- `prose-ai` table rows use hover highlight instead of static even/odd zebra striping for a cleaner look

---

## [0.3.3] - 2026-06-04

### New Features
- Canvas-based table renderer handles 1M+ rows without freezing
- Foreign key sub-view panel — click any FK cell to see related rows inline
- Reverse FK navigation — view all rows in a child table referencing the current row
- Update dialog now shows a proper "What's New" changelog with sections per update

### Bug Fixes
- Fixed query filter not applying correctly on certain column types
- Fixed table-query building incorrect WHERE clause for nullable columns
- Fixed row expand viewer not reflecting cell edits immediately
- Fixed FK dialog not refreshing after schema changes

### Changes
- DataTable split into canvas renderer + geometry helpers for maintainability
- SQL console result panel now persists last query result across tab switches

---

## [0.3.2] - 2026-06-02

### New Features
- JSON cell lightbox — view large JSON values full-screen with syntax highlighting
- Row expand viewer for inspecting all columns of a row in a side panel
- Structure view shows indexes, constraints, and triggers per table

### Bug Fixes
- Fixed slow query performance on large schemas
- Fixed status bar not updating after table switch
- Fixed command palette search not matching table names with underscores

### Changes
- Database switcher redesigned for clarity
- Foreign key dialog now shows column mappings inline
- Sidebar table list performance improved for schemas with 500+ tables
- Sonner toast positioning adjusted to avoid overlap with status bar

---

## [0.3.1] - 2026-06-01

### New Features
- Tab bar with per-tab state — switch between multiple tables without losing scroll/filter state

### Bug Fixes
- Fixed table loading spinner not dismissing on empty result sets
- Fixed structure view crashing on tables with no primary key

### Changes
- StudioShell refactored for faster tab routing

---

## [0.3.0] - 2026-06-01

### New Features
- Charts & Dashboard page — visualize query results as bar, line, pie, and scatter charts
- Diagrams page with Mermaid ER diagram viewer — auto-generated from schema
- AI Chat redesigned with conversation history and query suggestion chips
- Cloudflare D1 authentication flow added
- Command palette overhauled — full-width rows, keyboard shortcut badges, grouped results

### Bug Fixes
- Fixed EGL rendering crash on Wayland (Linux)
- Fixed chart re-renders causing CPU spikes

### Changes
- App shell layout refactored to support tabbed side panels
- Status bar now shows active connection and row count at all times

---

## [0.2.2] - 2026-05-29

### Bug Fixes
- Fixed chart rendering causing CPU overload — disabled aspect ratio maintenance on resize
- Fixed virtualized row rendering dropping rows at certain scroll speeds

### Changes
- Query execution pipeline optimized — large result sets stream in chunks

---

## [0.2.0] - 2026-05-28

### New Features
- Comprehensive rendering and memory optimizations for the data table
- X11 fallback added for EGL stability on Linux

### Bug Fixes
- Fixed EGL_BAD_ALLOC crash on Wayland with WebKitGTK
- Fixed AUR package build missing `patchelf` dependency

---

## [0.1.22] - 2026-05-28

### New Features
- UI styling pass — refined spacing, typography, and color tokens across all panels

### Bug Fixes
- Fixed multiple Svelte reactivity warnings causing unnecessary re-renders

---

## [0.1.12] - 2026-05-24

### New Features
- Built-in MCP server — expose your connected database to AI agents (Cursor, VS Code, Claude)
- One-click deep links to install the MCP server into Cursor and VS Code
- MCP server toggle moved to Settings (off by default)
- Themes — light, dark, and system-follow support

### Bug Fixes
- Fixed `latest.json` generation in release workflow — updater now works on all platforms
- Fixed URL opener blocking `cursor://` and `vscode:` protocol links

---

## [0.1.11] - 2026-05-24

### New Features
- AI can now fix SQL errors automatically when a query fails
- Manual "Check for updates" action added to command palette

---

## [0.1.7] - 2026-05-24

### New Features
- URL preview and media lightbox for URL-type columns in the data table

---

## [0.1.5] - 2026-05-23

### Bug Fixes
- macOS ad-hoc signing added — Gatekeeper workaround instructions in release notes

---

## [0.1.2] - 2026-05-21

### New Features
- Table filters — filter by any column with eq/neq/contains/gt/lt operators
- Foreign key navigation — click FK values to jump to the referenced row
- SQL editor improvements — syntax highlighting, history, saved queries
- GitHub Actions release workflow — automated builds for Linux, Windows, and macOS
