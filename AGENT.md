# AGENT.md — Stroke

Instructions for AI agents working in this repository. Read this file before making changes.

## Project overview

**Stroke** is a desktop database management app (Drizzle Studio–style) built with:

| Layer | Stack |
|-------|--------|
| Shell | [Tauri 2](https://tauri.app/) |
| Frontend | Svelte 5 + Vite |
| UI | [shadcn-svelte](https://shadcn-svelte.com/) + Tailwind CSS v4 |
| Editor | Monaco (`monaco-editor`) — SQL console |
| Hotkeys | [@tanstack/svelte-hotkeys](https://tanstack.com/hotkeys/latest/docs/installation#svelte) |
| Backend | Rust + SQLx (PostgreSQL) |

Supported databases today: **PostgreSQL only**. Other engines are future work.

## What agents should do

### Always

1. **Read `README.md` and this file** before large changes.
2. **Use Tailwind utility classes** for layout and styling. Do not add custom CSS in `src/app.css` except shadcn theme tokens (`:root`, `@theme inline`, `@layer base`).
3. **Use shadcn-svelte components** from `$lib/components/ui/*` (Button, Dialog, Input, Table, Tabs, etc.). Run `npx shadcn-svelte@latest add <component> -y` if a component is missing.
4. **Use `$lib/utils.js` `cn()`** for conditional classes — never manual string concatenation for Tailwind.
5. **Use `@lucide/svelte` icons** — not custom SVG icon components.
6. **Keep Tauri commands thin** — DB logic in `src-tauri/src/db/`, expose via `src-tauri/src/commands.rs`.
7. **Match existing patterns** — Svelte 5 runes (`$state`, `$derived`, `$props`, `$bindable`), camelCase JSON from Rust (`#[serde(rename_all = "camelCase")]`).
8. **Minimize diff scope** — only change what the task requires.
9. **Follow [guidelines](.cursor/skills/guidelines/SKILL.md)** — think before coding, simplicity first, surgical edits, verifiable success criteria.

### Frontend rules (shadcn)

- Semantic colors only: `bg-background`, `text-muted-foreground`, `border-border`, etc. No raw `bg-zinc-900` unless necessary.
- Spacing: `flex` + `gap-*`, not `space-y-*` / `space-x-*`.
- Equal dimensions: `size-*`, not `w-* h-*` when equal.
- Compose UI: Dialog for modals, Tabs for tabbed forms, Table for data grids.
- Import aliases: `$lib/...` (see `jsconfig.json` and `vite.config.js`).

### Backend rules

- Async Tauri commands must be `Send` — do not hold `MutexGuard` across `.await`.
- SQL identifiers: quote schema/table names; use parameterized values for data.
- Errors: return `Result<_, String>` with clear messages for the UI.

### Do not

- Add large custom CSS blocks to `app.css` (theme tokens only).
- Commit secrets (`.env`, passwords in repo files).
- Force-push `main` / skip git hooks unless the user explicitly asks.
- Create git commits unless the user asks.
- Reimplement shadcn primitives (buttons, inputs, dialogs) by hand.

## Key paths

```
src/
  App.svelte                 # Root → StudioShell
  app.css                    # Tailwind + shadcn theme only
  lib/
    api.js                   # Tauri invoke wrappers
    utils.js                 # cn()
    stores/connections.js    # localStorage saved connections
    stores/settings.js       # theme + font size (localStorage)
    components/
      StudioShell.svelte     # Main layout + data loading + hotkeys
      CommandPalette.svelte  # shadcn Command dialog (⌘K)
      SqlEditor.svelte       # Monaco SQL editor
      SqlConsole.svelte      # Run query + results
      ConnectionModal.svelte
      Sidebar.svelte
      DataTable.svelte
      RowDetailPanel.svelte  # Right inspector (Shiki, Normal/JSON)
      ShikiBlock.svelte
      TableToolbar.svelte
    monaco-env.js            # Monaco worker setup for Vite
      ui/                    # shadcn-svelte (do not hand-edit unless fixing bugs)
src-tauri/
  src/db/                    # connection, schema, query
  src/commands.rs
  src/lib.rs
components.json              # shadcn-svelte config
AGENT.md                     # this file
```

## Tauri commands (PostgreSQL)

| Command | Purpose |
|---------|---------|
| `test_postgres_connection` | Validate config without persisting pool |
| `connect_postgres` | Open pool + store config |
| `disconnect_postgres` | Close pool |
| `pg_list_schemas` | User schemas |
| `pg_list_tables` | Tables + row counts for schema |
| `pg_get_table_rows` | Paginated rows + column metadata |
| `pg_execute_sql` | Run SQL in SQL editor (SELECT vs DML) |
| `pg_update_table_cell` | Update one cell (requires primary key) |
| `pg_delete_table_row` | Delete one row by primary key |
| `pg_delete_table_rows` | Batch delete rows (`IN` or `VALUES` query) |
| `pg_insert_table_row` | Insert one row (`RETURNING *`; Postgres / SQLite / D1) |

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Mod+K` | Open command palette |
| `Mod+B` | Toggle nav sidebar |
| `Mod+Shift+D` | Data view (table tabs) |
| `Mod+Shift+S` | SQL editor view |
| `Mod+R` | Refresh tables (sidebar focus) or refresh rows / re-run SQL (main area) |
| `Mod+Enter` | Run SQL (SQL view) |
| `Mod+S` | Format SQL (SQL view); save inline cell edit (table view) |
| `Mod+Backspace` | Delete selected rows (table view) |
| Double-click cell | Edit cell value |
| `Enter` | Save edit (in cell input) |
| `Escape` | Close command palette (⌘K), cancel cell edit, or close row inspector |
| `Mod+M` | Toggle light / dark theme |
| `Mod+=` / `Mod+-` / `Mod+0` | Zoom in / out / reset |

`Mod` is Cmd on macOS and Ctrl on Windows/Linux ([TanStack Hotkeys](https://tanstack.com/hotkeys/latest/docs/installation#svelte)).

## Running locally

```bash
npm install
npm run tauri dev    # full app (required for DB APIs)
npm run dev          # Vite only — UI only, invokes will fail
```

## UI / display

- **Fonts**: Geist Sans + Geist Mono via `@fontsource-variable/geist` (see `src/app.css`).
- **Theme**: `light` | `dark` via `stores/settings.js` — toggles `html.dark` class. **Ctrl/Cmd + M** to toggle.
- **Zoom**: CSS `zoom` on `#app` (80%–150% steps). Settings gear icon or **Ctrl + Plus / Minus / 0**. Tauri `zoomHotkeysEnabled` is **off** (use app zoom, not webview zoom).
- Default window: 1280×800 (`src-tauri/tauri.conf.json`).

## Feature status

| Feature | Status |
|---------|--------|
| PostgreSQL connect / test / saved connections | Done |
| Schema + table sidebar | Done |
| Paginated table viewer | Done |
| Theme (light/dark) + font size settings | Done |
| SQL console | Placeholder |
| Add row | Done (toolbar Add → insert dialog) |
| Edit / delete rows | Table grid + batch delete via toolbar ⋯ menu (⌘⌫) |
| Filter / sort UI | Placeholder |
| MySQL / SQLite / etc. | Not started |

## Adding shadcn components

```bash
npx shadcn-svelte@latest add <name> -y
```

Config: `components.json`. Requires `jsconfig.json` paths for `$lib`.

## When implementing new features

1. Add Rust handler + types in `src-tauri/src/db/` if data is needed.
2. Register command in `commands.rs` and `lib.rs` `invoke_handler`.
3. Add `invoke` wrapper in `src/lib/api.js`.
4. Wire UI in `StudioShell` or a focused component under `src/lib/components/`.
5. Use shadcn components; verify with `npm run build`.

## Release builds (GitHub Actions)

Workflow: `.github/workflows/release.yml`

| Trigger | How |
|---------|-----|
| Tag push | `git tag v0.1.0 && git push origin v0.1.0` |
| Manual | Actions → **Release** → Run workflow (set tag, e.g. `v0.1.0`) |

Builds **Linux** (`.deb`, `.AppImage`) on `ubuntu-22.04` and **Windows** (`.msi`) on `windows-latest`, then uploads assets to [GitHub Releases](https://github.com/broisnischal/stroke/releases).

Local build:

```bash
npm run tauri:build                    # native
npm run tauri:build -- --target x86_64-pc-windows-msvc   # Windows cross (needs toolchain)
```

Tag must match `version` in `src-tauri/tauri.conf.json` (e.g. tag `v0.1.0` ↔ version `0.1.0`).

## Commit / PR conventions

- Concise commit messages focused on **why**.
- PRs: Summary bullets + Test plan checklist.
- User rules override: no commits unless asked.
