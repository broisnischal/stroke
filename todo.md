# TODO — feat/optimizations

Remaining work from the optimization + feature pass. Everything else on this
branch is implemented and verified (`svelte-check` + `cargo check` clean).

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
- [ ] D1: `EXPLAIN QUERY PLAN` (SQLite-shaped; map SqlResult rows → reuse `build_sqlite_tree`).

### P2.12 remainder — introspection parity
`list_functions` now covers MySQL. Remaining non-PG gaps in `src-tauri/src/db/schema.rs`:
- [ ] MySQL triggers (`information_schema.TRIGGERS`) + SQLite triggers (`sqlite_master WHERE type='trigger'`).
- [ ] Sequences: N/A for MySQL/SQLite — document rather than implement.
- [ ] Incoming FKs for engines still returning empty.

## Phase 3 — Feature depth

### P3.14 — Editing depth (DataTable)
- [ ] Wire `ArrayCellEditor` + `DateTimePicker` + inline JSON (Monaco) into the cell focus path.
- [ ] Bulk row edit: multi-select → apply-to-selected / templated fill + dry-run preview.
- [ ] Row-level undo/redo stack (`⌘Z` / `⌘⇧Z`) over `pendingEdits`.

### P3.13 remainder — quick wins
- [ ] Saved-connection grouping (add `group` field + tree/tabs UI in the connection list).
- [ ] Cell copy-as formats (raw / JSON / CSV / hex) context menu.
- [ ] DataTable export menu — the formats + generators already exist in `src/lib/export.js`.

## Runtime verification (new backend paths shipped on this branch)
- [ ] EXPLAIN against a live **DuckDB** and **ClickHouse** connection.
- [ ] `list_functions` against a live **MySQL** connection.
- [ ] `redis_scan` (keyspace load) + DB switcher against a live **Redis** with many keys.

## Notes
- **P0.3 / P0.4** were investigated and found to be **non-bugs** (tokio `Mutex`
  releases on panic-unwind; the cancel-lock is already statement-scoped) — no change made.
- **P1.6 (FK click-through)** and **P1.8 (schema diff)** were already fully
  implemented (inline FK subview; `SchemaTimelinePage` + `diffSnapshots`).
