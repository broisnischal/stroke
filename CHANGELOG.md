# Changelog

All notable changes to DB Studio are listed here, newest first.

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
