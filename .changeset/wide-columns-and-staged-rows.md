### New Features

#### Editing

- **Stage as many new rows as you want.** Add and Duplicate append, so pressing either three times gives three rows stacked under the header, each editable, each with its own tick and its own discard. The first row's tick inserts the batch, as do Apply and ⌘↵, under one confirm - three inserts is one list of three statements, not three dialogs. A row that fails stays staged with everything still typed into it. Right-click a staged cell to generate a UUID or CUID, drop in now/today, copy, paste, clear back to the column's default, or fill that column in every staged row. `Alt+N` stages a row, `Alt+D` copies the focused row into one, `Mod+Escape` discards them all, and the band now belongs to the table it was opened on rather than following you between tabs.

- **Duplicate no longer writes on the click.** It fills the insert draft instead, so nothing reaches the database until it is submitted, and the key and any generated column take their defaults rather than the source row's values.

### Bug Fixes

#### The data grid

- **The staged rows sit on their columns at any scroll offset.** The insert band worked out its own geometry instead of reading the canvas's: it summed the gutters by hand and left the row-number one out, and its horizontal pin was a sticky box whose behaviour depends on how wide it is, so how well it held varied with the table. Dragging a wide table sideways slid the band against the grid under it. Every x and width now comes from the same `geom` the canvas draws from, and the band shares the canvas's sticky anchor, so the two measure the viewport's left edge from one box. Tab inside the band scrolls the column into view, which a pinned band cannot ask the browser to do for it.

- **A field inside the grid gets the keys a field gets.** The grid's undo/redo/copy listener is bound on `window`, so it ran before every other capture handler in the app - including the one that gives inputs their undo stack and their word deletion. ⌘Z with the caret in a staged row undid a cell edit somewhere else in the table and took the field's own ⌘Z with it. It now stands down for anything you type into, and Alt+Backspace deletes a word on Linux and Windows as well as macOS, which also stops the global "discard staged changes" binding from throwing the row away mid-sentence.

- **A large value loads into the cell it belongs to.** The in-cell load stopped at 1MB on the grounds that a cell's value is what the canvas formats and the search walks - but the canvas cuts the drawn text to 400 characters and caches it, the highlighter matches that same cut string, and the row search runs in SQL. A 1.2MB resume was being refused for a cost nobody was paying. The ceiling is now the dock's 8MB, and past 1MB a JSON value stays the text it arrived as rather than being parsed and re-serialized to show forty characters of itself.

- **The search highlight follows how the search matched.** It ran `indexOf` over a lowercased copy of the text, so with match-case on it highlighted `Aarav` for a search that returned nothing containing it, and a regex search marked the pattern's literal characters.

- **`F5` refreshes the table, not the app.** It was bound to nothing, so the webview reloaded the document - tearing down the session, redialling the connection and re-reading the catalog.

- **The Add button names its shortcut.** Its tooltip read "Insert row (Add)", which is the label, not a chord. It says `Alt+N` now, and `Alt+N` works from inside the staged band too - "again for another" is exactly where you are already typing.

#### Connections

- **A dropped pool reads as a dropped pool.** `attempted to acquire a connection on a closed pool` matched none of the connectivity patterns, so it read as a SQL error: no reconnect fired, and the banner sat there. Failed table loads now state themselves where the grid would be, with Reconnect for a dropped pool and Retry for everything else.

- **Disconnect survives a restart.** Auto-reconnect read the last-connection id as "resume this", so quitting while disconnected came back connected.

- Saving a connection that points at a database already on file asks first, the paste bar fills itself from the clipboard, and `⌘M` no longer deals out the hidden theme.

#### Keyboard and focus

- **The focus ring was invisible app-wide.** Tailwind v4 compiles every `outline-*` utility to `outline-style: var(--tw-outline-style)`, and `outline-none` sets that variable to `none` on the element - so the `outline-none` + `focus-visible:outline-2` pattern this app uses in about forty places applied a 2px-wide outline whose style was still `none`.

- Keyboard reaches the rest of the app: the connection rail is one tab stop with arrows walking it, relationship columns join the cell cursor (Enter previews, `⇧↵` opens in a new tab, `⌘↵` in place), `Alt+F` / `Alt+E` filter by or exclude the focused value, `Alt+X` clears the table search, `Alt+C/R/W` toggle match case, regex and whole word wherever there is a search, and the hand-rolled dialogs trap focus, restore it and inert the page behind them.

### Performance

#### Tables with very large values

- **A table of half-megabyte cells opens in about a second instead of eleven.** A `jsonb` column holding an uploaded file averaged 601KB a row, and `SELECT *` over a page moved roughly 100MB of it out of TOAST, through sqlx, across the IPC bridge and into a webview parse, for a grid that can draw forty characters of it. Wide columns are now fetched as their size: the page asks for `pg_column_size`, which reads the varlena header and touches no TOAST chunk, and the value itself loads per cell on demand. Which columns are wide is measured rather than assumed, and deliberately not taken from `pg_stats.avg_width` - ANALYZE measures the datum in the tuple, so a column whose values all live in TOAST reports the width of the 18-byte pointer; the column above measures 601KB and `pg_stats` says 18. One sampling query settles it in 0.67ms over 37 buffers, cached per table, and skipped entirely unless the table has TOAST worth searching. The size check also runs against the value's text length, not its compressed size: these payloads compress 2x or better, so rows comfortably under the cap on disk were still shipping megabytes each. Settings → Load large values on demand turns the whole thing off and restores the old behaviour.

- **A capped cell says what it holds and loads on request.** The grid draws `361 KB jsonb` with a download button beside the copy one; it turns into a spinner and fills that cell, and only that cell. The dock's own Load button fetches up to 8MB - a `<textarea>` handed more renders nothing at all in this webview - and past 2MB the panel stops doing whole-value work: the JSON tree waits until asked for, Find stops walking the string twice per keystroke, the highlight layer stands down, and wrapping is off, because one 18MB line laid out across the pane is the most expensive thing that panel can be asked to do. Values that large are read through a paged window rather than a textarea, editable when the whole value is present and read-only when it is not, since staging a value that was cut at the ceiling would write what loaded over what did not.
