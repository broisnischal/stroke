### New Features

#### Data Table
- **Array cell editor** — Postgres array columns (`text[]`, `int[]`, …) get a dedicated add / remove / reorder editor instead of being edited as raw JSON, and now display as `{a,b}` array literals.
- **Grid styles** — choose from six table grid styles in Settings: Lines, Bordered, Striped, Dotted, Dots, and Minimal.
- **DML preview** — review (and edit) the prettified SQL for a change before it's applied.

#### Interface
- **Provider sign-in** — refreshed the connection screen and provider sign-in flow.
- **More keyboard shortcuts** — reopen closed tab, jump to tab 1–9, toggle the tab bar, and disconnect.
- **Auto-reconnect** — optionally reconnect to your last database on startup.

### Bug Fixes

#### Data
- **Array columns rendered as garbage** — Postgres array values were decoded from the binary wire format as lossy UTF-8 (□ boxes); they now decode into proper arrays.

#### Security
- **Saved credentials not persisting** — the OS keychain integration now enables a real per-platform backend, so AI keys and OAuth tokens actually persist (previously a missing backend feature silently used a non-persistent in-memory store on some setups).
