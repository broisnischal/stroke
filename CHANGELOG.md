# Changelog

All notable changes to Stroke are listed here, newest first.

---

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
