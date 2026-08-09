### Changes

- **The app starts in a fraction of the time it used to.** Stroke was compiling **6.8 MB** of JavaScript and CSS before it could paint a single pixel, and about 3.9 MB of that was the Monaco editor — loaded at boot whether or not you ever opened a SQL tab. The cause was one static import four components deep: the split-pane snapshot imported the JSON view, which imported the Monaco text view, which imported Monaco. Being in a separate chunk file does not make code lazy; only being unreachable from a plain `import` does. Monaco, Shiki and the confetti library are now off that path entirely, along with eight tab pages that were shipped to every user at boot despite being behind "only if opened" guards. **The startup payload is 2.6 MB, down 61%.** Every one of those chunks is still warmed during idle time, so opening a tab is no slower than before — the work simply no longer happens between launching the app and seeing it.

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
