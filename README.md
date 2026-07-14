<div align="center">

# Stroke

**A fast, minimal desktop database client.**

Connect to PostgreSQL, MySQL, SQLite, Turso/LibSQL, Cloudflare D1, ClickHouse, DuckDB, and SQL Server —
browse schemas, edit data, write SQL, visualize results, and let AI tools talk to your database through a built-in MCP server.

[Download](#install) · [Features](#features) · [Build from source](#build-from-source) · [Website](https://stroke.click)

</div>

---

## Why Stroke

Built with **Rust + Svelte** — a native backend paired with a reactive UI — so the app is snappy, memory-efficient, and never feels like a browser tab.

- **Under 40 MB memory** at runtime
- **Handles millions of rows** without slowing down
- **Keyboard-first** — every feature is reachable without a mouse
- **Read-only mode** — safely browse production without risking accidental writes
- **AI-native** — a built-in assistant and an MCP server your other AI tools can connect to
- **Extensions** — expand functionality with plugins
- **Themes** — dark and light, out of the box

---

## Supported databases

**Core engines**

| Database | Notes |
|----------|-------|
| **PostgreSQL** | Full schema, enums, sequences, triggers, indexes |
| **MySQL / MariaDB** | Standard host/port connections |
| **SQLite** | Local file or `:memory:` |
| **Turso / LibSQL** | Serverless SQLite at the edge |
| **Cloudflare D1** | OAuth sign-in or API token |
| **ClickHouse** | Columnar OLAP over HTTP(S) |
| **DuckDB** | Embedded analytical database (local file) |
| **Microsoft SQL Server** | Host/port connections |

**One-click providers**

Sign in and pick a database — no connection string to assemble:

| Provider | Based on |
|----------|----------|
| **Neon** | Serverless Postgres |
| **Supabase** | Postgres |
| **Prisma Postgres** | Serverless Postgres |
| **PlanetScale** | MySQL-compatible serverless |

**CockroachDB** and other PostgreSQL-compatible databases connect through the PostgreSQL option.

Connect directly or through an **SSH tunnel** for databases behind a bastion host or private network.

---

## Features

### Data grid

- Paginated browsing with configurable page size
- Rows paint immediately; the total count (`… of N`) fills in the background
- Resizable columns, saved per table
- Pin columns to keep them in view while scrolling
- Show/hide columns and reset column width to default
- Column statistics — min, max, avg, nulls, distinct count
- Multi-column sort — shift-click headers to add secondary keys
- Full-text search and a visual filter builder, with relative date-range presets and enum value pickers
- Click any foreign-key value to jump to the referenced row
- Choose from six grid styles (Lines, Bordered, Striped, Dotted, Dots, Minimal) in **Settings → Appearance**

**Cell right-click menu**

Open · Edit · Copy · Filter by value · Exclude this value · Set NULL · Expand · Select row · Delete row
Copy row as → JSON · CSV · Plain text · Markdown table · INSERT statement

**Column header right-click menu**

Sort ascending · Sort descending · Filter by this column · Pin column · Hide column · Reset column width · Column stats

### Inline editing

Edit text, numbers, booleans, enums, dates, UUIDs, and JSON in place.
Insert rows with smart defaults, delete rows, and set any cell to NULL in one action.
Postgres array columns (`text[]`, `int[]`, …) get a dedicated add / remove / reorder editor.
Optionally preview the generated SQL for any change before it's applied.

### Row inspector

View any row in formatted, raw JSON, or preview mode — with a rich viewer for nested JSON, arrays, and media/URL values.

### Schema explorer

- Tables, views, materialized views, and foreign tables
- Live row counts in the sidebar
- Index browser and DDL viewer for any object
- Create tables, schemas, sequences, triggers, enums, and foreign keys through guided dialogs
- Manage PostgreSQL enum types

### Relation tree

Walk foreign-key relationships as an expandable tree, drilling from a row into everything it references — row counts stream in without blocking navigation.

### Global search

Search across tables and objects to find what you need without hunting through the sidebar.

### Live mode

Watch a table for real-time changes — inserts, updates, and deletes stream into the grid as they happen on the database.

### SQL console

- Syntax highlighting and schema-aware autocomplete
- Query formatting and execution timing
- **EXPLAIN plans** — visualize the query planner's execution plan
- CSV, JSON, and SQL export of results
- Automatic query history — everything is saved
- Saved queries — bookmark the ones you keep
- SQL Notebooks (`.sqlnb`) — multi-cell notebooks for documenting and replaying query sequences

### Quick access

Open the quick-access screen to jump anywhere in one keystroke:

| | |
|--|--|
| **SQL** | Console with history and saved queries |
| **Dashboard** | Pinned charts and saved views |
| **AI** | AI chat assistant |
| **ORM** | ORM query runner |
| **Schema** | Schema and index explorer |
| **Security** | Roles, grants, and privilege viewer |
| **Logs** | Query and audit logs |
| **Charts** | Turn query results into charts |
| **Diagrams** | Auto-generated ERDs |
| **Timeline** | Schema drift detection across snapshots |
| **Data Diff** | Row-level diff between snapshots or queries |
| **Search** | Global search across the database |
| **Extensions** | Install and manage plugins |
| **Connect** | Manage and switch connections |

### Charts & dashboards

Turn any query result into a chart — bar, line, area, pie, and geographic **choropleth** maps (powered by ECharts) — and pin it to a dashboard.

### Schema diagrams

Auto-generated entity-relationship diagrams (ERDs) built from your live schema, with an interactive canvas.

### Schema timeline

Track schema changes over time. See exactly which columns, indexes, or constraints were added or removed between snapshots.

### Data diff

Compare two query results or table snapshots row-by-row — added, removed, and modified rows are highlighted clearly.

### ORM runner

Write ORM-style queries, preview the generated SQL, and run them against the connected database.

### Security viewer

Inspect roles, grants, and privileges — see who can read or write what, at a glance.

### Backup & restore

Export a full **SQL dump** — schema DDL, data, views, triggers, functions, sequences, and enums — with granular include toggles and per-table selection. A live log streams progress, and any export can be stopped mid-run. Restore by executing a `.sql` file, with per-statement results and clear error reporting.

Available for **PostgreSQL, MySQL, SQLite, and Cloudflare D1**.

### Docker launch

Spin up a local PostgreSQL or MySQL container in one click without leaving the app.

### Extensions

Install community and first-party extensions to add new panels, query tools, or integrations.

### Read-only mode

Lock any connection so writes are blocked entirely — safe for browsing production.

### AI chat

An AI assistant with direct database access that runs queries, explains schemas, generates SQL, and renders diagrams and charts inline.
Works with any OpenAI-compatible API — configure a base URL, model, and API key in **Settings**.

### MCP server

Stroke ships a built-in **Model Context Protocol** server so Claude, Cursor, and other MCP clients can query your database directly.

1. Open **Settings → MCP Server**
2. Click **Start**
3. Copy the one-click config for your AI tool

Uses a stable bearer token — configure once and it just works.

### Command palette

`Cmd/Ctrl+K` — type anything (table name, feature, shortcut) to jump there instantly.

### Status bar

Active connection, database name, row counts, query execution time, and connection health — always visible at the bottom.

### Security & storage

AI keys and provider OAuth tokens are stored in the **OS keychain** (macOS Keychain, Windows Credential Manager, or the Linux Secret Service), and migrated automatically from any older plaintext store.

---

## Install

### Recommended: package managers

**macOS** — [Homebrew](https://brew.sh)

```bash
brew install --cask broisnischal/tap/stroke
```

**Windows** — [Scoop](https://scoop.sh)

```powershell
scoop bucket add stroke https://github.com/broisnischal/stroke
scoop install stroke
```

### Or download directly

Grab the installer from the [Releases](https://github.com/broisnischal/stroke/releases) page.

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `stroke_x.x.x_aarch64.dmg` |
| macOS (Intel) | `stroke_x.x.x_x64.dmg` |
| Windows | `stroke_x.x.x_x64-setup.exe` |
| Linux (Debian/Ubuntu) | `stroke_x.x.x_amd64.deb` |
| Linux (AppImage) | `stroke_x.x.x_amd64.AppImage` |

**macOS** — open the `.dmg`, drag Stroke to Applications. If macOS blocks it on first launch:

```bash
xattr -cr /Applications/Stroke.app
```

**Windows** — run the `.exe`. If SmartScreen shows a warning, click **More info → Run anyway**. (Scoop skips this.)

**Linux (Debian/Ubuntu)**

```bash
sudo dpkg -i stroke_*_amd64.deb
```

**Linux (AppImage)**

```bash
chmod +x stroke_*_amd64.AppImage
./stroke_*_amd64.AppImage
```

---

## Connecting

Pick a database type and fill in your credentials. Hit **Test connection**, then **Connect**.

- **PostgreSQL / MySQL** — host, port, database, user, password, optional SSL. Paste a full connection string and click **Parse** to fill the form automatically.
- **SQLite / DuckDB** — point to a database file (`.db`, `.sqlite`, `.duckdb`), or use `:memory:` for SQLite.
- **Turso / LibSQL** — database URL and optional auth token.
- **Cloudflare D1** — sign in with Cloudflare, or enter Account ID, Database ID, and an API token.
- **ClickHouse** — host, port, database, user, password, optional TLS.
- **SQL Server** — host, port, database, user, password.
- **Neon / Supabase / Prisma / PlanetScale** — sign in with the provider and pick a database.
- **SSH tunnel** — any connection type can go through an SSH tunnel for databases in private networks.

Connections are saved locally. Stroke reopens your last connection on launch.

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+K` | Command palette |
| `Ctrl+T` | Quick access |
| `Cmd/Ctrl+Shift+D` | Table data view |
| `Cmd/Ctrl+Shift+S` | SQL console |
| `Cmd/Ctrl+Shift+A` | AI chat |
| `Cmd/Ctrl+Enter` | Run SQL query |
| `Cmd/Ctrl+⌥+←/→` | Switch tabs |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+W` | Close tab |
| `Cmd/Ctrl+?` | Show all shortcuts |

---

## Build from source

The source repo is private — `github.com/broisnischal/stroke` is the public
releases/bucket repo. Collaborators clone the source repo:

Requires [Node.js](https://nodejs.org) 18+ and the [Rust toolchain](https://rustup.rs).

```bash
git clone https://github.com/broisnischal/stroke-app
cd stroke-app
npm install
npm run tauri        # dev
npm run tauri:build  # release binary
```

**Arch Linux** — build `.deb` only to avoid an AppImage linker issue:

```bash
npm run tauri:build -- --bundles deb
```

Or use the included Arch helper:

```bash
npm run tauri:build:arch
```

---

## Issues

Found a bug or have a feature request? Open an issue at
[github.com/broisnischal/stroke/issues](https://github.com/broisnischal/stroke/issues).
