### New Features

#### Connections
- **Save without connecting** — the connection dialog has a Save button alongside Save & Connect, so you can store a connection's details without dialling it.

### Bug Fixes

#### Connections
- **Fixed connections hanging or failing outright** — the reachability preflight could veto a connection that would have succeeded (observed vetoing a database that then handshook in 335ms). It now races the probe against the real connect: zero added latency, fails fast only when the host is *definitively* unreachable, and never overrides a working handshake. Addresses are probed concurrently (happy eyeballs) instead of walked one at a time, which is what made this far worse on Windows with unroutable IPv6.
- **Fixed retry amplification** — a definitively unreachable host was being retried as if it were a transient error, turning one dead host into ~17s of spinner. Unreachable errors now fail immediately; only genuinely transient ones retry, under a total time budget.
- **Fixed `pool timed out` errors during normal browsing** — sidebar row counts ran unbounded `COUNT(*)` queries that pinned most of the connection pool, starving interactive queries and leaving counts stuck on `…`. Counts are now time-bounded (Postgres via `SET LOCAL statement_timeout` inside a transaction, MySQL via `MAX_EXECUTION_TIME` plus a client-side backstop for MariaDB) and run below the pool's capacity.
- **Release builds now write logs** — logging was compiled out of release builds, so failures on user machines produced nothing to diagnose.
