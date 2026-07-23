# TODO — feat/optimizations

All code items are implemented and verified (`svelte-check` = 0 errors +
clean `cargo check`). The only open boxes are **runtime-verification** ones,
which need a live engine to exercise (the code paths themselves are shipped).

> **Implemented across two passes** (all compile-verified):
> - P2.9 — **EXPLAIN** for **D1** (`explain_from_sqlite_plan` → `build_sqlite_tree`)
>   and **MSSQL** (`SET SHOWPLAN_XML ON` on the single tiberius connection; RelOp
>   XML → `explain_from_text_lines`).
> - P2.10 — **Instance Insights** extended to **SQLite / ClickHouse / DuckDB**
>   across all 5 functions (graceful degradation, never errors).
> - P2.11 — **Backup export/import** for **DuckDB** (`EXPORT/IMPORT DATABASE`,
>   directory target) and **MSSQL** (`BACKUP/RESTORE … DISK`, server-side).
> - P2.12 — **MySQL + SQLite triggers**; **incoming FKs** for MySQL/SQLite (already
>   present) + **D1 / LibSQL / DuckDB / MSSQL** (new); sequences documented N/A.
> - P3.13 — **table export menu** (SQL/TSV/MD/JSONL); **saved-connection grouping**
>   (group field + grouped sidebar + assign UI); **cell copy-as hex**.
> - P3.14 — inline **Array / DateTime / JSON** editors in the cell-edit path;
>   **bulk fill** (apply-to-selected via Apply preview); **row undo/redo** (pre-existing).

## Phase 2 — Cross-engine backend parity

### P2.10 — Instance Insights for more engines
- [x] SQLite: `PRAGMA` stats (page_count, page_size, cache_size, freelist, journal_mode) + derived DB size.
- [x] ClickHouse: `system.metrics`, `system.processes`, `system.settings`, `system.parts`.
- [x] DuckDB: `pragma_database_size()`, `duckdb_settings()`, `version()`.

### P2.11 — Backup export/import for DuckDB + MSSQL
- [x] DuckDB: `EXPORT DATABASE '<dir>' (FORMAT PARQUET)` / `IMPORT DATABASE` (directory target, derived from live DB path).
- [x] MSSQL: `BACKUP DATABASE … TO DISK` / `RESTORE … WITH REPLACE` (server-side path; DB from `DB_NAME()`).

### P2.9 — EXPLAIN for MSSQL + D1
- [x] MSSQL: `SET SHOWPLAN_XML ON` (stateful, one connection; RelOp scan → text-lines tree).
- [x] D1: `EXPLAIN QUERY PLAN` (SQLite-shaped; `explain_from_sqlite_plan` reuses `build_sqlite_tree`).

### P2.12 — introspection parity
- [x] MySQL triggers (`information_schema.TRIGGERS`) + SQLite triggers (`sqlite_master`).
- [x] Sequences: N/A for MySQL/SQLite — documented in `list_sequences`.
- [x] Incoming FKs: MySQL/SQLite (present) + D1, LibSQL, DuckDB (`duckdb_constraints()`), MSSQL (`sys.foreign_keys`). ClickHouse/Redis N/A (no FKs).

## Phase 3 — Feature depth

### P3.14 — Editing depth (DataTable)
- [x] Wire `ArrayCellEditor` + `DateTimePicker` + inline JSON (Monaco/QuickLook) into the cell edit overlay.
- [x] Bulk row edit: multi-select → "Fill N rows with this value" (stages through the Apply DML preview + undo).
- [x] Row-level undo/redo stack (`⌘Z` / `⌘⇧Z`) over `pendingEdits` (`pastEdits`/`futureEdits`).

### P3.13 — quick wins
- [x] Saved-connection grouping (`group` field + grouped sidebar sections + per-row assign popover).
- [x] Cell copy-as formats (raw / JSON / CSV / hex — hex added this pass; row copy-as already had json/csv/plain/md/insert).
- [x] DataTable export menu — CSV/JSON/SQL/TSV/Markdown/JSONL through `TableToolbar` → `handleExport`.

## Runtime verification (needs a live connection — code paths are shipped, not yet exercised)
- [ ] EXPLAIN against a live **DuckDB**, **ClickHouse**, **MSSQL**, **D1** connection.
- [ ] Instance Insights against live **SQLite / ClickHouse / DuckDB**.
- [ ] Backup export→import round-trip against live **DuckDB** + **MSSQL**.
- [ ] Incoming FKs against live **DuckDB / MSSQL / D1 / LibSQL**.
- [ ] `list_functions` / triggers against a live **MySQL** connection.
- [ ] `redis_scan` (keyspace load) + DB switcher against a live **Redis** with many keys.

## Notes
- **P0.3 / P0.4** were investigated and found to be **non-bugs** (tokio `Mutex`
  releases on panic-unwind; the cancel-lock is already statement-scoped).
- **P1.6 (FK click-through)** and **P1.8 (schema diff)** were already fully
  implemented (inline FK subview; `SchemaTimelinePage` + `diffSnapshots`).
- ClickHouse/Redis have no foreign keys; ClickHouse `system.asynchronous_metrics`
  (float gauges) don't map onto the insight structs, so they're intentionally skipped.
