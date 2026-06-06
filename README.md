<div align="center">

# Stroke

**A fast, modern desktop database client.**

Connect to PostgreSQL, MySQL, SQLite, Turso/LibSQL, and Cloudflare D1 — browse schemas, edit data inline, write SQL, visualize, and let AI tools talk to your database through a built-in MCP server.

[Download](#install) · [Features](#features) · [Build from source](#build-from-source) · [Website](https://stroke.app)

</div>

---

## Supported databases

| Database | Notes |
|----------|-------|
| **PostgreSQL** | Full schema, enums, sequences, triggers, indexes |
| **MySQL** | Standard host/port connections |
| **SQLite** | Local file or `:memory:` |
| **Turso / LibSQL** | Serverless SQLite at the edge |
| **Cloudflare D1** | Connect via OAuth or API token |

---

## Features

- **Schema explorer** — tables, views, materialized views, and foreign tables with live row counts, plus an index browser.
- **Data grid** — paginated browsing, resizable columns (saved per table), column show/hide, multi-column sort, full-text search, and a visual filter builder.
- **Inline editing** — type-aware editors for text, numbers, booleans, enums, dates, UUIDs, and JSON. Insert and delete rows with smart defaults.
- **Row inspector** — view any row in formatted, JSON, or preview mode.
- **Foreign keys** — click a value to jump to the referenced table with the filter applied.
- **SQL console** — Monaco editor with syntax highlighting, schema-aware autocomplete, formatting, execution time, and CSV/JSON export.
- **Query history & saved queries** — every query is saved automatically; bookmark the ones you keep.
- **Schema diagrams** — auto-generated ERDs of your tables and relationships.
- **Charts & dashboards** — turn query results into charts and pin them to a dashboard.
- **ORM runner** — run and preview ORM-style queries.
- **Docker launch** — spin up a local Postgres or MySQL container in one click.
- **Backup & restore** — export and import your data.
- **AI chat** — an assistant with direct access to your database that runs queries, explains schemas, generates SQL, and renders diagrams (works with any OpenAI-compatible API).
- **MCP server** — expose your database to Claude, Cursor, and other MCP clients (see below).
- **Command palette** — `Cmd/Ctrl+K` to jump anywhere instantly.

---

## Install

### Recommended: package managers (no warnings)

The smoothest, warning-free way to install on macOS and Windows:

**macOS** — [Homebrew](https://brew.sh)

```bash
brew install --cask broisnischal/tap/stroke
```

**Windows** — [Scoop](https://scoop.sh)

```powershell
scoop bucket add stroke https://github.com/broisnischal/stroke
scoop install stroke
```

These handle the OS security prompts for you, so the app just opens.

### Or download directly

Grab the installer for your platform from the [Releases](https://github.com/broisnischal/stroke/releases) page.

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `stroke_x.x.x_aarch64.dmg` |
| macOS (Intel) | `stroke_x.x.x_x64.dmg` |
| Windows | `stroke_x.x.x_x64-setup.exe` |
| Linux (Debian/Ubuntu) | `stroke_x.x.x_amd64.deb` |
| Linux (AppImage) | `stroke_x.x.x_amd64.AppImage` |

**macOS** — open the `.dmg`, drag **Stroke** to Applications. Stroke is ad-hoc signed (no paid Apple cert), so on first launch macOS may say it's from an unidentified developer or "damaged". Fix it once with:

```bash
xattr -cr /Applications/Stroke.app
```

…then open normally. (The Homebrew install above does this for you.)

**Windows** — run the `.exe` installer. It's unsigned, so SmartScreen shows "Windows protected your PC" — click **More info → Run anyway**. (The Scoop install above avoids this.)

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

Pick a database type on the connection screen and fill in the details. Hit **Test connection** to verify, then **Connect**.

- **PostgreSQL / MySQL** — host, port, database, user, password (optional SSL). You can also paste a full connection string and click **Parse**.
- **SQLite** — point to a `.db`/`.sqlite` file, or use an in-memory database.
- **Turso / LibSQL** — enter the database URL and (optionally) an auth token.
- **Cloudflare D1** — sign in with Cloudflare, or enter Account ID, Database ID, and an API token manually.

Connections are saved locally, and Stroke reopens your last one on launch.

---

## AI & MCP server

Configure any OpenAI-compatible provider (OpenAI, Mistral, Ollama, …) in **Settings** with a base URL, model, and API key to enable AI chat and SQL suggestions.

To connect external AI tools, Stroke ships a built-in **Model Context Protocol** server:

1. Open **Settings → MCP Server**.
2. Click **Start**.
3. Copy the one-click config for Claude or Cursor into your tool's config.

The server uses a stable bearer token, so you only configure it once.

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+K` | Command palette |
| `Cmd/Ctrl+Shift+D` | Table data view |
| `Cmd/Ctrl+Shift+S` | SQL console |
| `Cmd/Ctrl+Shift+A` | AI chat |
| `Cmd/Ctrl+Enter` | Run SQL query |
| `Cmd/Ctrl+⌥+←/→` | Switch tabs |
| `Cmd/Ctrl+?` | Show all shortcuts |

---

## Build from source

Requires [Node.js](https://nodejs.org) 18+ and the [Rust toolchain](https://rustup.rs).

```bash
git clone https://github.com/broisnischal/stroke
cd stroke
npm install
npm run tauri        # run in dev
npm run tauri:build  # build a release binary
```

**Arch Linux** — the AppImage step can fail due to a linker quirk. Build only the `.deb`:

```bash
npm run tauri:build -- --bundles deb
```

…or use the included helper for AppImage on Arch:

```bash
npm run tauri:build:arch
```

---

## Issues

Found a bug or have a feature request? Open an issue at
[github.com/broisnischal/stroke/issues](https://github.com/broisnischal/stroke/issues).
