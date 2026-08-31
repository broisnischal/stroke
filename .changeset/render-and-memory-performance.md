### Performance

#### The data grid

- **Text-heavy tables hold 60fps.** The grid was recomputing the identical truncation for every visible cell on every frame: 113 `measureText` calls shaping 16,014 characters through the text engine, 3.08ms of an 11.7ms draw, to arrive at the same answer as the frame before. Truncation is now memoised by font, column width and string. On a 10k-row table of embeddings and prose that is 113 to 31 calls per frame, 16,014 to 1,521 characters, 3.08ms to 0.46ms, and a draw of 11.7ms to 8.7ms. Frame times went from p50 18ms / p95 22ms / max 30ms to p50 17ms / p95 17ms / max 20ms, so 1-3 of 118 frames now miss the 16.6ms budget instead of most of them.

- **Per-column work happens once per column, not once per cell.** Whether a column is boolean, an array, a vector, a geometry or right-aligned is a pure function of its declared type, but each test was re-running per cell per frame: four regexes and about six throwaway strings each, roughly 40,000 regex executions a second while scrolling. They are computed once and cached against the column.

- **Drawing a cell no longer walks the reactive graph.** `drawCell` read about 20 values straight off the reactive graph per cell, and a derived read is not a property access, it re-checks against every dependency's write version. A 150-cell viewport paid roughly 3,000 graph reads a frame for values that cannot change mid-frame. They are snapshotted once per frame instead. The row loop also stopped re-entering the geometry derived once per column per row, and the pinned-column pass is skipped entirely when nothing is pinned rather than scanning every column of every row.

- **A scroll repaints the strip it uncovered, not the whole grid.** When a frame differs from the one before it only by a vertical scroll, the still-valid band is moved with a single image copy and only the newly exposed rows are painted. A one-row step paints one row instead of every visible one. The path is gated hard: no animating skeletons, no insert draft, no expanded rows, integer offsets landing on whole device pixels, and any content, hover, focus, selection, theme or geometry change forces a full repaint through the existing draw scheduler. The copy runs with the canvas transform reset so it is an exact 1:1 move of device pixels and cannot resample. Scrolling to a stop forces a full repaint, so nothing this path could produce can persist in a resting grid. The arithmetic is verified across 2,280 combinations of device pixel ratio, header height, viewport height and scroll delta: every body pixel is either copied from exactly the right source row or falls inside the repainted strip.

- **Changing pages reuses the row count.** Paging re-counted the table each time, which on a large table is the slowest part of the request.

#### Memory

- **The app gives memory back when you move on from a big table.** Opening one 1M-row table took the process from a 45MB/48MB idle baseline to 587MB Rust and 891MB WebKit, and closing every tab released none of it. On the Rust side `smaps` showed the cause: four roughly 50MB allocator arenas, one per worker thread, retained for the rest of the session. Switching the global allocator to mimalloc takes retained growth over the same open-scroll-seek workload from **527MB to 27MB**.

#### Startup and bundle

- **The editor bundle carries the six languages the app has, not eighty.** `monaco-editor`'s default entry ships 80-odd basic languages plus the CSS, HTML, JSON and TypeScript services, each service pulling its own worker. The app displays six languages: SQL, JSON, JavaScript, TypeScript, Rust and Markdown. The entry is now composed by hand from the same pieces the full one uses. Over the built assets that is **34,821,807 to 32,585,794 bytes, -2.24MB (-6.4%)** and 81 chunks gone, `css.worker` (1.05MB) and `html.worker` (719KB) among them, both of which were being emitted for grammars nothing in the app can open. The TypeScript worker stays, because the ORM runner really does use it for IntelliSense.

- **The startup prefetch only warms pages this connection can open.** A warmed chunk is never freed, and on a Redis connection every relational page is unreachable UI, the SQL editor and its editor bundle included. About 4.3MB of the 6.01MB warm set was being pinned for tabs that cannot exist. The list is now gated per entry on the same engine flags the tab affordances use, waits for a connection before it runs, and warms the Redis keyspace page only on Redis, where it goes first. The rest of the tail stays warm deliberately: measured against the static import graph, 22 pages cost 0.66MB between them, so trimming them buys almost nothing and would regress first-open latency on all of them.

- **The wheel path stopped querying the style system.** Smooth scrolling resolved the reduced-motion media query on every wheel tick, about 5us of style resolution each time, on the one path that must not touch the style system. It is resolved once and kept current by the query itself.

### Bug Fixes

- **Restoring a session no longer fires one foreign-key query per tab at once.** The reverse foreign-key loader checked its cache before awaiting but only filled it after, so every restored tab missed and issued its own query. Measured against D1, where each call is several HTTP round trips to Cloudflare, that was nine concurrent calls totalling 37.7s of backend time, and everything the user was actually waiting for queued behind them. In-flight requests are now shared, and a generation counter discards a reply that arrives after a connection change instead of writing another database's foreign keys into the cache under the same key.

- **Catalog replies from a previous connection are discarded.** Switching connections while a catalog request was in flight could let the old database's answer land in the new connection's state.

### Changes

- Serialisation crates build optimised in the dev profile. Every command result is serialised to JSON for the webview and a browse is megabytes of it, so an unoptimised build spent most of a row fetch inside serialisation rather than in the database. These are dependencies, so it costs nothing on incremental rebuilds.

- `canvas-confetti` is declared to the dev server's dependency pre-bundler. It is only reachable through a lazy import on the license pages, so the initial scan missed it and discovering it mid-session rehashed every pre-bundled chunk, after which the running app 404'd on the paths it already held.
