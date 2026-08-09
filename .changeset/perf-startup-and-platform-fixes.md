### Changes

- **The app starts in a fraction of the time it used to.** Stroke was compiling **6.8 MB** of JavaScript and CSS before it could paint a single pixel, and about 3.9 MB of that was the Monaco editor — loaded at boot whether or not you ever opened a SQL tab. The cause was one static import four components deep: the split-pane snapshot imported the JSON view, which imported the Monaco text view, which imported Monaco. Being in a separate chunk file does not make code lazy; only being unreachable from a plain `import` does. Monaco, Shiki and the confetti library are now off that path entirely, along with eight tab pages that were shipped to every user at boot despite being behind "only if opened" guards. **The startup payload is 2.6 MB, down 61%.** Every one of those chunks is still warmed during idle time, so opening a tab is no slower than before — the work simply no longer happens between launching the app and seeing it.

- **Required columns are marked in the grid header.** A `NOT NULL` column carries a red asterisk before its name, the same mark a required form field carries. The constraint used to be discoverable only by trying — clearing a cell and being told "Cannot set NULL" — which is late to find out.

### Bug Fixes

#### Instance Insights
- **The Config tab no longer stalls when it opens.** Postgres reports 350-odd settings and MySQL over 600, and every one of them was built into the page at once. Rows are now constructed a screenful at a time and the rest fill in during idle, so the tab opens immediately and ⌘F still finds every setting a moment later.
- **The session and lock tables stopped rebuilding their column list once per row.** A 200-session table allocated 200 throwaway arrays on every render of the page, and read each cell twice over.
- **The server payloads stopped being deep-proxied.** The settings list, session list and replication stats are replaced whole every refresh and only ever read, so wrapping every row and every field in a reactive proxy cost more than the render it fed.
- **`pg_stat_activity` and `pg_prepared_xacts` are bounded.** They had no `LIMIT` while the lock query beside them had one, so a busy server could hand back an unbounded result — and the session query calls `pg_blocking_pids` once per row.
- **Live charts update instead of rebuilding.** Every five-second refresh tore down all three charts and built them again from nothing; they now merge the new numbers while the shape of the data holds, and rebuild only when it actually changes.

#### OmniRoute
- **Installing it works on macOS and Linux.** It installed with `npm install -g`, which writes to a prefix owned by root on a default nodejs.org or distribution install — so it failed with a permissions error for exactly the people who followed Stroke's own advice to install Node from nodejs.org, and all the app could do was tell them to go run npm themselves. Stroke now keeps its own copy under its data directory, which needs no elevation anywhere and leaves your global npm prefix alone.
- **No more console window on Windows.** Checking for Node, installing the package and starting the gateway each went through `cmd.exe`, and a windowed app on Windows gets a visible console for any console program it starts. Every process Stroke runs — npm, Docker, ssh tunnels, the local port scan, the licence check — is now started without one. The gateway itself is launched directly through Node, so on Windows there is no console to suppress in the first place, and stopping it actually stops it: under `cmd.exe` the Node process outlived the shell that was killed.
- **The install shows progress.** It pulls roughly 1200 packages and takes minutes, and npm prints nothing at all until it finishes, so the panel sat on "resolving package…" long enough to look hung.

#### Keyboard
- **⌘B toggles the sidebar again.** The binding went through a listener on the document in the bubble phase, so anything between the focused element and the document that stopped the event swallowed it first — which is every Monaco editor, the grid canvas, and the dialog overlays. It is now bound in the capture phase, ahead of all of them, and matches ⌘ on macOS and Ctrl elsewhere rather than accepting either (Ctrl+B still moves the caret in a text field on a Mac, as it should).
- **Shortcuts are written down in one place.** `src/lib/shortcuts.js` holds every binding as a single combo string; the macOS and Windows spellings are derived from it rather than typed out twice, which is what let the help dialog drift from what the app actually bound. Adding a shortcut now gets both platforms for free.

#### Connections
- **The saved-connections filter is always there once you have more than one.** It only appeared past five connections, so it materialised out of nowhere as the list grew and the people most likely to want it had never seen it. It also gained Enter to take the top match, arrow keys into the list, and a clear button big enough to hit.
- **Filtering no longer replays the list's entrance animation on every keystroke.** Rows carried a staggered rise of up to half a second, which is a nice first impression and reads as lag when it fires on each character typed. Both the connections rail and the database picker opposite it were affected.
- **The engine blurb is gone from the connection form header.** "Local file-based database" under a heading that says SQLite is describing a decision you have already made.

#### SQL editor
- **A running query survives leaving its tab.** Two Query Editor tabs share one editor component, and switching between them swapped its state out from under an in-flight query — the spinner stopped, the results pane showed the other tab's, and whatever came back landed in whichever tab happened to be in front. The query itself never stopped; only the app lost track of which tab had asked. A run now belongs to the tab that started it.
- **The JSON view no longer freezes on a large result.** It built one object per row, flattened all of them to a single string, then parsed that string straight back into objects — three passes over the whole result and two copies of it in memory, with no limit. `SELECT *` over a million rows spent its time assembling text far too large to read. It now renders the first thousand rows, says so, and Export still carries everything.

#### Codegen
- **A SQL target, beside Prisma and Drizzle.** The schema as the statements that would rebuild it: enum types, `CREATE TABLE` with nullability, defaults and keys, the indexes, and the foreign keys as `ALTER TABLE` after every table exists — inline `REFERENCES` only works if the parent is created first, which no ordering can promise once the schema has a cycle. It covers every engine, because it is the engine's own language.
- **The whole database in one script.** A scope switch on the SQL target emits every schema at once, schema-qualified, so two schemas owning a `users` table produce two statements rather than a collision. Read only when you ask for it.
- **The Prisma/Drizzle switch is reachable from the keyboard.** It was two plain buttons — no tablist, no arrow keys, invisible to a screen reader — for the primary control on the page. Its pills were also 24px next to 28px buttons; they match now.

#### Interface
- **Dropdown menus were rebuilt to fit their own panel.** Item corners were rounder than the space they sat in, leaving a crescent of gap at each one; rows were small enough to mis-click; the highlight jumped from row to row with no transition, so running the pointer down a list strobed; and the selected value was marked only by a tick at the far right edge, away from the label you were reading. Fixed in the shared component, so every menu in the app gets it.

#### Ask AI
- **You can select and copy an answer.** The command palette is rendered outside the app's DOM root, so the rule that makes dialog text selectable never applied to it — and a quick answer you cannot quote is most of the point of asking.
- **The panel stops moving while you type.** It had a maximum height but no height, so the box grew as the answer streamed and as query results appeared, shifting everything already on screen out from under the cursor. A transcript wants a window that scrolls, not one that resizes.
- **It follows the answer to the end.** Auto-scroll measured the page the instant new text arrived, but the markdown renders a moment later — so it scrolled to a bottom that did not exist yet, fell further behind with each token, and gave up entirely once it had drifted far enough, which is exactly when there was most left to read. It now waits for the text to actually land, and scrolling up to re-read something no longer fights the stream.
- **Typing during an answer is smoother.** Every token re-ran a walk up the DOM asking the browser to recompute styles, for the whole length of the answer.
