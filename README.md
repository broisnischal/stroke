<div align="center">

# Stroke

**A fast, minimal desktop database client.**

Eleven engines and four one-click providers, in one window. Browse and edit data, write SQL, draw
diagrams and maps of what you find, back it up, and let your AI tools query it through a built-in
MCP server.

[Download](#install) · [Features](#features) · [Build from source](#build-from-source) · [Website](https://stroke.click)

</div>

---

## Why Stroke

Built with **Rust + Svelte** — a native backend paired with a reactive UI — so the app is snappy, memory-efficient, and never feels like a browser tab.

- **Fast
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
| **PostgreSQL** | Full schema, enums, sequences, triggers, indexes, extensions |
| **MySQL** | Standard host/port connections |
| **MariaDB** | Its own driver, not a MySQL alias |
| **CockroachDB** | Distributed SQL, Postgres wire protocol |
| **SQLite** | Local file or `:memory:` |
| **Turso / LibSQL** | Serverless SQLite at the edge |
| **Cloudflare D1** | OAuth sign-in or API token; local `wrangler` databases are found automatically |
| **ClickHouse** | Columnar OLAP over HTTP(S) |
| **DuckDB** | Embedded analytical database (local file) |
| **Microsoft SQL Server** | Host/port connections |
| **Redis** | Keyspace browser + command console (key-value; SQL surfaces hidden) |

**One-click providers**

Sign in and pick a database — no connection string to assemble:

| Provider | Based on |
|----------|----------|
| **Neon** | Serverless Postgres |
| **Supabase** | Postgres |
| **Prisma Postgres** | Serverless Postgres |
| **PlanetScale** | MySQL-compatible serverless |

Other PostgreSQL-compatible databases connect through the PostgreSQL option.

Connect directly or through an **SSH tunnel** for databases behind a bastion host or private network.
Stroke also **finds databases already running on your machine** — Docker containers, local
Postgres/MySQL instances, and the SQLite files your project's ORM config points at — so a local
connection is usually one click, not a form.

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

### Cell viewers

Values that don't fit a grid cell get a real viewer instead of being truncated into nonsense:

- **JSON / JSONB** — a collapsible tree, with search and a full-screen editor
- **Vectors** (`pgvector`) — dimension, norm, mean, standard deviation, a per-dimension strip
  and a value histogram, so you can see whether an embedding is shaped the way you expect
- **Geometry** (PostGIS) — the shape drawn on a pannable, zoomable map, with type, SRID and
  vertex list. Offline by default; tiled basemaps are one click away
- **Arrays**, long text, and oversized values (multi-MB cells are capped before they reach the
  UI, so one big blob can't freeze the window)

### Views of the same rows

Every table tab can render its rows as a **grid**, **JSON**, a **record card**, plain **text**,
a **chart**, or an **ER diagram** — switchable per tab, with a default you can set globally.

### Map view

Spatial columns drawn on a map: every PostGIS layer in the database, clustered when there are
too many features to draw individually, filterable with the same operators as the grid. The
basemap ships with the app, so the default view makes no network requests.

### Instance insights

What the server itself is doing — version, uptime, connections, replication state, cache hit
rates, and the configuration values that matter. Settings that are safe to change can be edited
in place.

### Database objects

Every enum, sequence, trigger, function and index in one browsable list, rather than scattered
across the schema tree.

### Notebooks

Interleave SQL cells and Markdown in a `.sqlnb` file — run cells independently, keep the results
with the prose. Useful for an analysis you want to hand to someone else.

### Codegen

Read the live schema back out as **Prisma** or **Drizzle** source. Introspects once and re-renders
locally, so switching between the two is instant even on a large schema.

### Split panes

Drag a tab to either edge to split the window. Compare two tables, or keep a query beside the
rows it returns.

### Activity log

Every statement the app has run, with duration and outcome — including the ones it ran on your
behalf, so nothing the UI does is invisible.

### Read-only mode

Lock any connection so writes are blocked entirely — safe for browsing production.

### AI chat

An assistant with real database access: it runs queries, reads schemas, explains what it found,
and renders charts and diagrams inline. Destructive statements always ask first.

- **Free tier built in** — a shared daily allowance, no key required, nothing to configure
- **Your own key** — any OpenAI-compatible provider (OpenAI, Anthropic, Google, OpenRouter, …)
- **Local models** — Ollama and LM Studio, including Ollama Cloud models that run on their
  hardware with nothing to download. The picker lists what your server actually has, so it can
  never suggest a model you haven't installed
- **GitHub Copilot** — sign in with your existing subscription
- **OmniRoute** — install and start the local gateway from inside the app
- **Skills** — Markdown files that shape how the agent works on your schema
- **Web search** — off by default; when on, the agent can look up an error code or a function's
  syntax that your database can't answer

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

## License

Stroke is **source-available** under the [Stroke Sustainable Use License](LICENSE).
The entire source — Pro features included — lives in this repository:

- **Free to use** — personally, in your company, anywhere
- **Read, modify, and contribute** to all of it
- **Not for resale** — you can't sell Stroke, rebrand it, or offer it as a paid product or hosted service
- **Pro features** are key-gated in official builds — after the built-in trial they
  require a [Stroke Pro](https://stroke.click/pricing) license, which is what funds development

Official builds and updates ship from this repository and [stroke.click](https://stroke.click).

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

- **Discovered automatically** — Docker containers, local Postgres/MySQL, and the SQLite or D1 database your project's ORM config points at. Pick it from the list; no form.
- **PostgreSQL / MySQL / MariaDB / CockroachDB** — host, port, database, user, password, optional SSL. Paste a full connection string and click **Parse** to fill the form automatically.
- **SQLite / DuckDB** — point to a database file (`.db`, `.sqlite`, `.duckdb`), or use `:memory:` for SQLite.
- **Turso / LibSQL** — database URL and optional auth token.
- **Cloudflare D1** — sign in with Cloudflare, or enter Account ID, Database ID, and an API token.
- **ClickHouse** — host, port, database, user, password, optional TLS.
- **SQL Server** — host, port, database, user, password.
- **Redis** — host, port, optional password, database number, optional TLS.
- **Neon / Supabase / Prisma / PlanetScale** — sign in with the provider and pick a database.
- **SSH tunnel** — any connection type can go through an SSH tunnel for databases in private networks.

Connections are saved locally. Stroke reopens your last connection on launch.

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+K` | Command palette |
| `Cmd/Ctrl+N` | Quick access |
| `Cmd/Ctrl+T` | Search tables |
| `Cmd/Ctrl+Shift+D` | Table data view |
| `Cmd/Ctrl+Shift+S` | SQL console |
| `Cmd/Ctrl+Shift+E` | AI chat |
| `Cmd/Ctrl+Enter` | Run SQL query |
| `Cmd/Ctrl+Tab` | Switch tabs |
| `Alt+←/→` | Back / forward |
| `Cmd/Ctrl+B` | Toggle sidebar |
| `Cmd/Ctrl+W` | Close tab |
| `Cmd/Ctrl+?` | Show all shortcuts |

---

## Build from source

This repository is the complete source. Requires [Node.js](https://nodejs.org) 20.19+
(or 22.12+; CI builds on 22) and the [Rust toolchain](https://rustup.rs).

```bash
git clone https://github.com/broisnischal/stroke
cd stroke
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

## Contributing

Bug reports, fixes, features, and docs are all welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup (including one-command
Docker test databases), code conventions, and the PR checklist.

Found a bug or have a feature request? Open an issue at
[github.com/broisnischal/stroke/issues](https://github.com/broisnischal/stroke/issues).
