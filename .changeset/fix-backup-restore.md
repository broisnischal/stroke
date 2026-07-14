### Bug Fixes

#### Backup & Restore
- **Cloudflare D1 export** — internal `_cf_*` tables (e.g. `_cf_KV`) are now hidden and skipped, so D1 backups no longer fail with `SQLITE_AUTH`, and one unreadable table can't abort the whole export.
- **Table selection** — deselecting tables in the backup panel now sticks instead of instantly resetting to all.
- **Restoring routines** — PostgreSQL functions, triggers, and enums (dollar-quoted bodies) and MySQL `DELIMITER` blocks now restore intact rather than being split at their internal semicolons.
- **Restore stability** — a failed statement containing multibyte text no longer panics the restore, and a single PostgreSQL error no longer rolls back the entire restore (per-statement savepoints).
- **Data fidelity** — PostgreSQL `smallint`/`numeric`/`money` values and non-finite floats now export correctly (previously lost or written as `NULL`), and D1 BLOB columns export as hex literals instead of corrupt text.
- **Stop button** — stopping a backup or restore now actually halts the backend, not just the UI.
- **Filtered exports** — backing up a subset of SQLite/D1 tables no longer emits indexes or triggers for tables outside the selection.
