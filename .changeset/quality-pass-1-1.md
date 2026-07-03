### New Features

#### Tabs
- Pin tabs: pinned tabs stay grouped at the front, show a pin badge, and survive "Close Others" / "Close All"

#### Themes
- New **Graphite** theme, wired through the editor and diagram themes

#### Licensing
- New in-app license page: "Activate Pro" now opens a dedicated tab with key entry, plan status, what Pro unlocks, and a purchase link — confetti included on activation
- License entry in Settings with a live plan badge (Pro / Trial / Free)

#### SQL Editor
- Column sorting on query results — numbers sort numerically, NULLs last, and the sorted order carries into the JSON view, charts, and CSV/JSON exports

### Bug Fixes

#### Data Table
- Pinned columns now freeze flush to the left edge — no more empty gutter-wide gap after scrolling
- Query results grid is read-only: removed actions that can't apply to ad-hoc results (Filter/Exclude by value, Edit, Set NULL, Duplicate/Delete row, INSERT copy)
- Column stats no longer error with "Invalid identifier" on SQL editor results
- Sidebar rows no longer shift as row counts load in

#### Window
- Double-clicking the titlebar now maximizes reliably (a duplicate handler was maximizing and instantly restoring)

### Changes

#### Performance
- Reconnect feels instant: the overlay drops as soon as the connection is live, and schemas/tables stream into the sidebar instead of blocking the screen
- Table row counts load lazily — the sidebar renders immediately with placeholders and exact counts fill in from a background pass; schema switches get the same speedup
- Faster Postgres connect: one fewer round trip per pooled connection, and the reachability check runs concurrently with the real handshake
- Sidebar stays virtualized while table rows are expanded (no more hitch when expanding columns on large schemas)
- AI streaming responses parse markdown at most once per frame instead of once per token

#### Settings
- Settings dialog redesigned: grouped sections (Appearance / Behavior / More), clearer hierarchy, keyboard-shortcut chips

#### Release pipeline
- Releases now publish to the public `stroke` repository — auto-update, Homebrew, and Scoop keep working with the private source repo
