### New Features

#### Data Table
- Search highlighting: the toolbar search now shows exactly where each match falls — matched text is highlighted inside the visible cells, across every column
- JSON tree view in expanded rows: fold and unfold any nested object or array with proper chevrons, type-colored values, and item/key counts — plus per-field **Copy value** and **Open in JSON viewer** actions that jump straight into the full Monaco viewer. A Tree/Raw toggle is remembered across sessions

### Bug Fixes

#### Stability
- Fixed the app freezing when opening tables with very large cells — multi-MB file buffers stored in `jsonb`/`text`/blob columns could lock up the whole app. Cells above 256 KB now load as a truncated preview with the real size shown; the grid, JSON viewer, copy, and export all mark the truncation clearly, and editing or filtering on a truncated cell is blocked so a preview can never be saved back over real data. Applies to PostgreSQL, MySQL, SQLite, and the built-in MCP server
- A crash inside one table view can no longer take down the whole app: rendering and interaction errors are contained to that tab, which shows a "Reload this view" card while every other tab, the sidebar, and the status bar keep working
- SQLite: large blobs no longer render as unbounded hex text (the worst case doubled the data size on screen)

#### Database Switcher
- The search box is now always there and focused the moment the switcher opens — start typing immediately, with any number of databases
- New shortcuts: **⌘D** opens the database switcher, **⇧⌘C** the connection switcher; arrows, Tab, and Enter drive the list right from the search box

#### Sidebar
- Restored smooth scrolling to the bottom of large table lists: removed the inline column-expansion rows that broke the virtualized list
- "View data structure" is now "View structure"

#### Licensing
- Active trials always keep Pro access: only a definitive "trial expired" verdict locks Pro features — a transient license-check failure can no longer lock out trial or paid users

### Changes

#### AI Chat
- The conversation column now matches the composer width for a comfortable reading measure, with more breathing room between messages

#### Performance
- Sorting SQL results by JSON columns no longer re-stringifies every cell on every comparison
- Copy and export of object cells reuse one serialization path and stay fast on large result sets
