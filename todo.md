# TODO — feat/optimizations

Remaining work from the optimization + feature pass. Everything else on this
branch is implemented and verified (`svelte-check` + `cargo check` clean).

> **Done this pass** (deterministic / no live engine required, verified with
> `svelte-check` = 0 errors + a clean `cargo` rebuild):
> - P2.9 — **D1 EXPLAIN** (`EXPLAIN QUERY PLAN` → reuse `build_sqlite_tree`).
> - P2.12 — **MySQL + SQLite triggers**; **sequences documented N/A** for MySQL/SQLite.
> - P3.13 — **DataTable/table-view export menu** (SQL / TSV / Markdown / JSONL added
>   alongside CSV / JSON, mirroring the SQL console).
> - P3.14 — **Row-level undo/redo** was already implemented (`pastEdits`/`futureEdits`,
>   ⌘Z / ⌘⇧Z / ⌘Y) — verified, no change needed.
>
> Everything still unchecked below needs either a **live target engine**
> (the todo itself warns a blind impl ships wrong metrics) or a larger UI build
> (connection grouping, inline-editor rework, bulk fill) — left for a focused pass.

## Phase 2 — Cross-engine backend parity

### P2.10 — Instance Insights for more engines
Extend `src-tauri/src/db/insights.rs` (Activity / State / Config / Replication)
beyond PostgreSQL + MySQL.
- [ ] SQLite: `PRAGMA` stats (page_count, cache_size, journal_mode) + file size.
- [ ] ClickHouse: `system.metrics`, `system.asynchronous_metrics`, `system.parts`.
- [ ] DuckDB: `pragma_database_size()`, `duckdb_settings()`.
- Each engine exposes stats through different system tables — build + verify with
  the target engine running; a blind implementation ships wrong metrics.

### P2.11 — Backup export/import for DuckDB + MSSQL
`src-tauri/src/db/backup.rs` currently returns "not yet supported" for these.
- [ ] DuckDB: `EXPORT DATABASE '<dir>' (FORMAT PARQUET)` / `IMPORT DATABASE`.
- [ ] MSSQL: `BACKUP DATABASE … TO DISK` / `RESTORE` (needs server-side file access).
- File-format + path handling must be tested against the real engine or backups
  can be silently unrestorable.

### P2.9 remainder — EXPLAIN for MSSQL + D1
EXPLAIN now works for Postgres/MySQL/SQLite/DuckDB/ClickHouse.
- [ ] MSSQL: `SET SHOWPLAN_XML ON` (stateful — run on a scoped connection, parse XML).
- [x] D1: `EXPLAIN QUERY PLAN` (SQLite-shaped; `explain_from_sqlite_plan` reuses `build_sqlite_tree`).

### P2.12 remainder — introspection parity
`list_functions` now covers MySQL. Remaining non-PG gaps in `src-tauri/src/db/schema.rs`:
- [x] MySQL triggers (`information_schema.TRIGGERS`) + SQLite triggers (`sqlite_master WHERE type='trigger'`).
- [x] Sequences: N/A for MySQL/SQLite — documented in `list_sequences` rather than implemented.
- [ ] Incoming FKs for engines still returning empty.

## Phase 3 — Feature depth

### P3.14 — Editing depth (DataTable)
- [ ] Wire `ArrayCellEditor` + `DateTimePicker` + inline JSON (Monaco) into the cell focus path.
- [ ] Bulk row edit: multi-select → apply-to-selected / templated fill + dry-run preview.
- [x] Row-level undo/redo stack (`⌘Z` / `⌘⇧Z`) over `pendingEdits` — already implemented (`pastEdits`/`futureEdits`).

### P3.13 remainder — quick wins
- [ ] Saved-connection grouping (add `group` field + tree/tabs UI in the connection list).
- [ ] Cell copy-as formats (raw / JSON / CSV / hex) context menu.
- [x] DataTable export menu — CSV/JSON/SQL/TSV/Markdown/JSONL wired through `TableToolbar` → `handleExport`.

## Runtime verification (new backend paths shipped on this branch)
- [ ] EXPLAIN against a live **DuckDB** and **ClickHouse** connection.
- [ ] `list_functions` against a live **MySQL** connection.
- [ ] `redis_scan` (keyspace load) + DB switcher against a live **Redis** with many keys.

## Notes
- **P0.3 / P0.4** were investigated and found to be **non-bugs** (tokio `Mutex`
  releases on panic-unwind; the cancel-lock is already statement-scoped) — no change made.
- **P1.6 (FK click-through)** and **P1.8 (schema diff)** were already fully
  implemented (inline FK subview; `SchemaTimelinePage` + `diffSnapshots`).
