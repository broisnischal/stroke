# Stroke

A desktop database client for PostgreSQL, SQLite, and Cloudflare D1. Browse tables, run SQL, edit rows inline, and connect AI tools directly to your database through a built-in MCP server.

---

## Download

Go to the [Releases](../../releases) page and grab the installer for your platform:

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `stroke_x.x.x_aarch64.dmg` |
| macOS (Intel) | `stroke_x.x.x_x64.dmg` |
| Windows | `stroke_x.x.x_x64-setup.exe` |
| Linux (Debian/Ubuntu) | `stroke_x.x.x_amd64.deb` |
| Linux (AppImage) | `stroke_x.x.x_amd64.AppImage` |

### macOS

1. Open the `.dmg` file.
2. Drag **Stroke** into your Applications folder.
3. On first launch, right-click → Open if macOS shows an unverified developer warning.

### Windows

Run the `.exe` installer and follow the prompts. No additional dependencies needed.

### Linux (Debian/Ubuntu)

```bash
sudo dpkg -i stroke_*_amd64.deb
```

Then launch from your application menu or run `stroke` in a terminal.

### Linux (Arch)

```bash
./stroke_*_amd64.AppImage
```

Or build from source (see [Build from Source](#build-from-source) below).

---

## Connecting to a Database

When you open Stroke you'll see the connection screen. Choose your database type and fill in the details.

### PostgreSQL

| Field | Default |
|-------|---------|
| Host | `127.0.0.1` |
| Port | `5432` |
| Database | `postgres` |
| User | `postgres` |
| Password | _(your password)_ |
| SSL | off |

Click **Test Connection** to verify before saving.

### SQLite

Enter the file path to your `.db` or `.sqlite` file. Use `:memory:` for an in-memory database.

### Cloudflare D1

Enter your Cloudflare **Account ID**, **Database ID**, and **API Token** from the Cloudflare dashboard.

---

Saved connections are stored locally on your machine. You can save as many connections as you like and switch between them at any time. Stroke reopens your last-used connection automatically on the next launch.

---

## Features

### Schema Explorer

The left sidebar lists every schema in your database. Expand a schema to see all its tables, views, materialized views, and foreign tables — each showing a live row count. Use the search box to filter by name, or press **Cmd/Ctrl+K** to open the command palette and jump to any table instantly.

### Table Data Grid

Click any table to open a paginated data grid. You can:

- Page through rows in steps of 25, 50, 100, 250, or up to 1,000 rows per page
- See total row count and current page position
- Resize columns by dragging their headers — widths are saved per table
- Hide or show individual columns from the toolbar
- Sort by any column (ascending or descending) by clicking its header

### Filtering & Search

- **Search bar** — searches across all columns using a case-insensitive match
- **Filter builder** — add one or more column filters with operators: `equals`, `not equal`, `contains`, `does not contain`, `starts with`, `ends with`, `greater than`, `greater or equal`, `less than`, `less or equal`, `is null`, `is not null`

Filters combine with AND logic. Sorting and filters work together.

### Inline Cell Editing

Double-click any cell to edit it in place. Stroke knows the column type:

- Text, numbers, and booleans each get the right input
- Enum columns show a dropdown of valid values
- Timestamp and date columns use a date/time picker
- UUID columns can be edited or regenerated
- JSON/JSONB columns are editable as text
- Binary (bytea) columns are display-only

Changes are saved to the database immediately when you confirm.

### Insert Rows

Click **Insert row** to open the insert form. Every column is listed with its data type and whether it's required. Stroke pre-fills sensible defaults:

- Auto-increment and identity columns are skipped automatically
- `created_at` / `updated_at` style columns get the current timestamp
- UUID and CUID ID columns get a generated value
- Enum columns show a dropdown
- All NOT NULL columns with no default are marked as required

### Delete Rows

Select one or more rows using the checkboxes on the left, then click **Delete** in the toolbar. Single-row deletion is also available through the row context menu. Bulk deletes show a confirmation prompt.

### Row Inspector

Click any row to open the inspector panel on the right. It shows every column value in a readable layout. Switch between three views:

- **Normal** — formatted values, one per line
- **JSON** — the full row as a JSON object
- **Preview** — large cell content or URL detection with external link opening

The inspector panel is resizable and its state persists between sessions.

### Foreign Key Navigation

When a column is a foreign key, Stroke detects the relationship and lets you click the cell value to jump to the referenced table with the matching filter already applied.

### Index Browser

Open the **Indexes** tab in the schema explorer to see every index on your tables — including the type (B-tree, Hash, GIN, GIST, BRIN), the indexed columns, and whether it's unique or a primary key.

### SQL Console

Press **Cmd/Ctrl+Shift+S** or open the SQL tab to get a full SQL editor:

- Syntax highlighting and schema-aware autocomplete
- Format your query automatically
- Run with **Cmd/Ctrl+Enter**
- See execution time and row count after each query
- Results appear in a table below — up to 5,000 rows, with a 30-second timeout to protect your connection
- Export results as CSV or JSON

### Query History & Saved Queries

Every query you execute is automatically saved to history. You can re-run any past query, or bookmark it as a saved query to keep it permanently. Both are accessible from the sidebar and the command palette.

### Data Export

From either the table grid or the SQL results panel, export data as:

- **CSV** — properly quoted and escaped
- **JSON** — formatted array of objects

On desktop a native save dialog opens. On web it falls back to a browser download.

### AI Chat

Open the AI tab (**Cmd/Ctrl+Shift+A**) to chat with an AI assistant that has direct access to your database. The AI can:

- Run queries and return real data in its answers
- Describe any table's schema
- Generate and explain SQL
- Render Mermaid diagrams and formatted Markdown

Configure any OpenAI-compatible API (OpenAI, Mistral, Ollama, etc.) in Settings by entering your base URL, model name, and API key.

### AI SQL Suggestions

In the SQL editor, Stroke can suggest relevant queries for the table you're viewing — common filters, joins to related tables, aggregations, and more. Click a suggestion to insert it into the editor.

### MCP Server (Connect AI Tools)

Stroke includes a built-in **Model Context Protocol (MCP) server** that exposes your connected database to AI tools like Claude Desktop, Cursor, and any other MCP-compatible client.

1. Open **Settings → MCP Server**
2. Click **Start** — the server starts on port `39847` (or the next available port)
3. Copy the one-click config snippet for Claude or Cursor and paste it into your AI tool's config file

The server uses bearer token authentication. The token is stable across restarts so you only need to configure your AI tool once.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+K` | Command palette |
| `Cmd/Ctrl+Shift+D` | Table data view |
| `Cmd/Ctrl+Shift+S` | SQL console |
| `Cmd/Ctrl+Shift+A` | AI chat |
| `Cmd/Ctrl+Enter` | Run SQL query |
| `Cmd/Ctrl+?` | Show all shortcuts |
| `Cmd/Ctrl+⌥+←/→` | Switch tabs |

---

## Build from Source

You'll need [Node.js](https://nodejs.org) (v18+) and the [Rust toolchain](https://rustup.rs).

```bash
git clone https://github.com/broisnischal/stroke
cd stroke
npm install
npm run tauri dev
```

To build a release binary:

```bash
npm run tauri build
```

**Arch Linux note:** The AppImage step can fail due to a linker incompatibility. Build only the `.deb` to avoid it:

```bash
npm run tauri build -- --bundles deb
```

Or use the included script that sets the right flag for AppImage on Arch:

```bash
npm run tauri:build:arch
```

---

## Reporting Issues

Found a bug or want to request a feature? Open an issue at [github.com/broisnischal/stroke/issues](https://github.com/broisnischal/stroke/issues).
