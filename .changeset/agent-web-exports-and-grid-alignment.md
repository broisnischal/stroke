### New Features

#### AI agent
- **The agent reads real rows before it writes SQL** — a few rows from each table a question is actually about now go into its context alongside the column list. Types say a column is `text`; they don't say it holds `active` rather than `ACTIVE`, that a date is an epoch string rather than ISO, or that a nullable column is null for every row that matters. Queries written from the type alone got those wrong.
- **Web search** — the agent can search the web and read pages for what your database can't answer: an error code, the syntax of an unfamiliar function, current documentation. Off by default in Settings → Agent; everything else the agent does stays between the app and your database, and searching sends your question to a third party.
- **Show query cards** setting, for hiding the SQL the agent ran and the rows it returned. Failed queries stay visible either way.

#### Editor & grid
- **View DDL opens a read-only editor** instead of a full SQL console — no Run button, no query toolbar, no empty results pane around a statement you can't execute against the table it already describes. Word wrap on, DDL formatted, with Copy and Save.
- **Cell alignment** setting — Left, Numbers right, or Right. "Numbers right" lines digits up by place value so magnitudes are comparable down a column, and leaves prose on the left.
- **ERD is selectable as the default data view.** It was already a per-tab view; it just never reached the setting.

### Bug Fixes

#### Exports — every one of these silently did nothing
`<a download>` is ignored inside the desktop webview, so eight export buttons across the app looked like they worked and produced no file. All of them now open a save dialog and name the path they wrote to.
- **Database backup** was the worst: it reported "Backup file downloaded" every time, whether or not anything had been written.
- Also fixed: query result CSV/JSON, chart PNGs, AI chart and diagram exports, notebook cell CSV, and the ERD's PNG/SVG/Mermaid exports.
- **Exported diagrams are no longer blurry** — they were rasterized at 1× and scaled up, which resampled the 10px label text.
- **Exported diagrams follow your theme.** The sheet was a hardcoded dark palette, so a diagram exported from a light theme came back as somebody else's dark diagram.

#### AI agent
- **The agent no longer invents reasons for failures.** A wrong column name was being reported as "there is an access restriction preventing me from querying this table" — the harness had asked the model to explain a failure it had no information about, and hid the real error from you. Failed queries now show the SQL and the actual message.
- **Driver errors are readable.** A D1 error filled the screen with its whole HTTP envelope to say five words; the cause is shown, with the raw text one click away.
- A fresh install starts with a working model. The free-tier profile was written but never actually created, so the picker said "No model" until you configured one yourself.
- The result card no longer shouts — one neutral card per outcome instead of a red-on-red block for a typo the model fixes on its next turn. Embedded result tables are sized for a chat bubble.
- Conversation list: the rename and delete buttons no longer sit on top of the title and timestamp.

#### Connections
- **Cloudflare D1 sessions survive token expiry.** The access token was captured when you connected and never updated, so after a while every query answered `401 Unauthorized` until you reconnected. It now refreshes once and retries; if that fails you get the real error.
- **Opening the first table is faster** — the connection pool is filled during connect, where a progress indicator is already showing, instead of paying for four TLS handshakes at once on your first query.

#### Interface
- **Editor themes are consistent.** Opening any editor re-tinted every other editor in the app onto a stale palette — most visible in the JSON view, which sat a shade lighter than everything around it.
- Dropdown menus always show their search field instead of growing one past five items.
- JSON gutter line numbers are evenly padded rather than flush against the edge.

### Changes

- **The ER diagram loads in one request.** It was fetching every table's columns one table at a time — two catalog queries and a round trip each — so on a large schema most of the load time was latency, not work.
