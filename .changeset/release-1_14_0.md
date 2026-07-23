### New Features

#### Cross-engine parity
- Redis keyspace browser — binary-safe values, non-blocking SCAN, CRUD, DB switcher, and streams
- EXPLAIN / query-plan visualization for DuckDB, ClickHouse, D1, and MS SQL Server (alongside Postgres/MySQL/SQLite)
- Instance Insights for SQLite, ClickHouse, and DuckDB
- Backup export/import for DuckDB (`EXPORT/IMPORT DATABASE`) and MS SQL Server (`BACKUP/RESTORE`)
- Schema introspection: MySQL & SQLite triggers, MySQL function introspection, and incoming foreign keys for more engines

#### Data & editing
- Multi-format export (CSV / JSON / SQL / TSV / Markdown / JSONL) in both the SQL console and the table view
- Inline cell editors for array, date/time, and JSON columns; bulk "fill selected rows"; copy cell as hex
- Query history favorites and run counts

#### Connections
- Saved-connection grouping in the sidebar
- Compact database pickers with keyboard navigation and friendlier connection errors

### Bug Fixes
- Table view now refetches after deleting rows (no more empty grid on paginated/large tables) and shows an "Applying…" indicator while changes are written
- The connection dialog no longer closes when you drag or resize the window by the titlebar
- Standard text-editing shortcuts (undo/redo, word- and line-delete) now work in inputs across the app
- Prisma: request `offline_access` scope and surface a clear "session expired" message on 401
- Hardened database write paths (no panics on bad binds), guarded localStorage writes, and sanitized Redis connection input

### Changes
- Release notes / changelog now open on the website instead of an in-app page
- Performance: heavy views are torn down after being hidden a while to reclaim memory, background polling (live mode, insights, Redis TTL) pauses while the window is hidden, and Monaco editors share a single theme observer
- Design system: refined font-size tokens, radii, accent selection, focus rings, and accessibility; ORM SQL highlighting; updated input borders; window maximizes on launch
