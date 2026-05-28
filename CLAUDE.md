# CLAUDE.md - DB Studio Project Guide

This file is the source of truth for AI agents working in this repository.
Use it to keep changes consistent with the current architecture and UI patterns.

## 1) Project snapshot

DB Studio is a Tauri desktop app for database work:

- connect to PostgreSQL, SQLite, Cloudflare D1, and MySQL flows in UI
- browse schemas/tables and row counts
- view/edit table data with filters/sort/pagination
- run SQL in Monaco editor with history/saved queries
- use AI features (chat, SQL suggestions, visual outputs)
- run a built-in MCP server for external AI tools

## 2) Tech stack

- Shell/runtime: Tauri 2 (`src-tauri`)
- Frontend: Svelte 5 + Vite
- Styling: Tailwind CSS v4
- UI primitives: bits-ui + shadcn-svelte style wrappers in `src/lib/components/ui/*`
- Icons: `@lucide/svelte`
- Editor: `monaco-editor`
- Hotkeys: `@tanstack/svelte-hotkeys`
- Toasts: `svelte-sonner`
- Backend DB layer: Rust + SQLx (and engine-specific integrations under `src-tauri/src/db`)

## 3) Core architecture

- App root: `src/App.svelte` -> `src/lib/components/StudioShell.svelte`
- Main orchestration happens in `StudioShell.svelte`:
  - connection lifecycle
  - tab routing/state (`table`, `sql`, `ai`, `schema`, `orm`, `security`, `logs`)
  - hotkeys
  - data fetch/update flows
- Frontend API boundary: `src/lib/api.js` (Tauri invoke wrappers)
- Backend command boundary:
  - Rust logic in `src-tauri/src/db/*`
  - exposed via `src-tauri/src/commands.rs` and `src-tauri/src/lib.rs`

## 4) Svelte coding patterns to follow

Use Svelte 5 runes and existing style:

- state: `$state(...)`
- derived values: `$derived(...)` / `$derived.by(...)`
- effects: `$effect(...)`
- props: `$props()` / `$bindable(...)`

Keep code style consistent with the repo:

- prefer small focused helpers over big inline blocks
- JSDoc typedefs in Svelte files are common and encouraged
- avoid over-abstracting unless repetition is meaningful

## 5) UI and styling conventions

- Always prefer components from `src/lib/components/ui/*` instead of ad hoc primitives.
- Use semantic utility classes (`bg-background`, `text-muted-foreground`, `border-border`, etc.).
- Prefer Tailwind utilities and `cn()` from `src/lib/utils.js`.
- Use `size-*` for square icon sizing.
- Use `gap-*` with flex/grid; keep spacing visually consistent with nearby components.
- Use `@lucide/svelte` icons only (no custom SVG systems unless required).

### Command palette row pattern (important)

For `Command` UI (`src/lib/components/ui/command/*`):

- Items are full-width flex rows (`w-full`, `min-w-0`) with internal horizontal padding.
- Label content uses `data-slot="command-label"` so text truncation and flex behavior are consistent.
- Right-side metadata uses `data-slot="command-trailing"` or `Command.Shortcut` with `ml-auto`.
- Do not reintroduce hidden absolute indicators that reserve right-side space.
- Keep one active dialog at a time when opening command palette from global hotkey flow.

## 6) Data and state patterns

- Persisted user settings/states live in `src/lib/stores/*`:
  - `settings.js`, `connections.js`, `layout.js`, `query-history.js`, etc.
- Store local persistence in `localStorage` with defensive `try/catch`.
- Keep async transitions explicit:
  - loading booleans (`loadingRows`, `savingCell`, `insertingRow`, etc.)
  - clear error strings for user-facing failures
- Prefer optimistic-feeling UI only when failure handling is clear and reversible.

## 7) DB/backend conventions

- Keep command handlers thin; place real logic in `src-tauri/src/db/*`.
- Use parameterized queries for values.
- Quote/validate SQL identifiers correctly when needed.
- Return clear error messages that UI can display directly.
- Avoid holding mutex/locks across `.await`.

## 8) Feature implementation checklist

When adding or changing a data-backed feature:

1. Add/extend Rust DB logic in `src-tauri/src/db/*`.
2. Expose command in `commands.rs` and register in `lib.rs`.
3. Add frontend wrapper in `src/lib/api.js`.
4. Wire UI from `StudioShell.svelte` and focused components.
5. Update stores/types/helpers as needed.
6. Verify keyboard shortcuts and command palette integration when relevant.
7. Run build/lint checks before finishing.

## 9) Development commands

- Install: `npm install`
- Frontend only: `npm run dev`
- Full desktop app: `npm run tauri`
- Build frontend: `npm run build`
- Build desktop app: `npm run tauri:build`

Note: `npm run dev` does not provide full Tauri backend behavior.

## 10) Guardrails

Do:

- make focused, surgical diffs
- preserve existing UX behavior unless task explicitly changes it
- keep accessibility in mind (labels, keyboard behavior, focus flow)

Do not:

- add large custom CSS blocks when utilities/components already solve it
- bypass established wrappers in `ui/*` without strong reason
- introduce unrelated refactors in task-focused changes
- commit or rewrite git history unless explicitly requested

## 11) Key files to know

- `src/lib/components/StudioShell.svelte` - main app controller
- `src/lib/components/CommandPalette.svelte` - global command dialog
- `src/lib/components/SqlConsole.svelte` - SQL execution/results
- `src/lib/components/OrmRunner.svelte` - ORM query runner
- `src/lib/components/SchemaPage.svelte` - schema explorer pages
- `src/lib/components/Sidebar.svelte` - tables/schemas navigation
- `src/lib/api.js` - frontend -> Tauri command bridge
- `src/lib/stores/*` - persisted local app state
- `src-tauri/src/db/*` - backend DB logic
