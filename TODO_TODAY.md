# TODO today: performance pass

Working notes so I can pick this up on another machine. Branch:
`perf/render-and-memory`, based on `feat/advisor-and-large-table-performance`
(not on `master`, because these changes build on the advisor/windowing work
already on that branch).

## Why I started

The app felt laggy and low-framerate across the board, the data table worst of
all. I profiled it instead of guessing, using a temporary in-page probe that
POSTed frame times and canvas call counts to a local sink, plus a remote-eval
channel so I could drive the running app from the shell. All of that
instrumentation is removed again; nothing in this branch ships it.

Test data: local Postgres on `127.0.0.1:5441` (`stroke_vec`), tables `events`
(1M rows), `articles` (100k), `openai_docs` (10k, pgvector embeddings).
Display is 60Hz, so the frame budget is 16.6ms.

## What the numbers actually said

The canvas render path was already well optimised for wide-but-plain tables.
`events` held a clean 60fps before I touched anything (p95 17ms, draw ~6.5ms).
So the general "everything is slow" feeling was not the row count.

Two things were real and measured:

1. **Text-heavy tables dropped frames.** `openai_docs` ran at p50 18ms /
   p95 22ms / max 30ms, i.e. 45-55fps. `measureText` was being called 113 times
   per frame, shaping 16,014 characters through HarfBuzz, costing 3.08ms of an
   11.7ms draw. It was recomputing the identical truncation every single frame.

2. **Memory was never given back.** Opening one 1M-row table took the app from
   45MB/48MB (idle baseline, measured against a second dev instance) to 587MB
   Rust / 891MB WebKit. Closing every tab released nothing. A full webview
   reload released nothing. On the Rust side the cause was visible in
   `/proc/PID/smaps`: four ~50MB glibc malloc arenas, one per worker thread,
   retained for the rest of the session.

## Done (in this branch)

- **Vite dep-optimizer crash.** `canvas-confetti` is only reachable through a
  lazy `await import()` on the license pages, so Vite's initial scan missed it.
  Discovering it mid-session re-ran the optimizer, rehashed every pre-bundled
  chunk, and the webview then 404'd on the old `runtime-*` / `index-client-*` /
  `Icon-*` paths. Losing the Svelte runtime chunk killed every page at once.
  Declared it in `optimizeDeps.include`. `vite.config.js`.

- **Truncation cache.** `truncText` now memoises by (font, column width,
  string) in `_truncCache`. Measured on `openai_docs`: `measureText` 113 -> 31
  calls/frame, 16,014 -> 1,521 chars/frame, 3.08ms -> 0.46ms; draw 11.7ms ->
  8.7ms; frames p50 18ms -> 17ms, p95 22ms -> 17ms, max 30ms -> 20ms, and only
  1-3 of 118 frames now exceed 18ms. This is the single biggest win here.
  Deliberately survives a `rows` swap (that is what keeps windowed scrolling on
  cache hits) and is dropped on a column change. `DataTable.svelte`.

- **Per-column type predicates moved into `_colCache`.** `isBooleanType`,
  `isSqlArrayType`, `isVectorType`, `isGeometryType` and the right-alignment
  test were each running per cell per frame: four regexes and roughly six
  throwaway strings per cell, about 40,000 regex executions a second while
  scrolling, all of it a pure function of the column's declared type.
  `DataTable.svelte`.

- **Frame-constant draw context.** `drawCell` was reading about 20 values
  straight off the reactive graph per cell. A `$derived` read is not a property
  access, it re-checks the derived against every dependency's write version, so
  a 150-cell viewport paid roughly 3,000 graph reads a frame for values that
  cannot change mid-frame. They are now snapshotted once per frame into the
  existing `bodyC` object. `DataTable.svelte`.

- **Row loop invariants.** `geom.cols.length` was in the loop condition, so the
  `geom` derived was re-entered once per column per row. The pinned-column pass
  also scanned every column of every row even with nothing pinned; pinned
  columns are now collected once per frame and the loop is skipped entirely when
  the list is empty. `DataTable.svelte`.

- **mimalloc as global allocator.** `src-tauri/src/lib.rs` +
  `src-tauri/Cargo.toml`. Same open-scroll-seek workload as before, measured:
  Rust retained growth **527MB -> 27MB**. This is the fix for the process never
  shrinking after you move on from a big table.

- **Dev-profile optimisation for the IPC path.** `serde_json`, `serde`, `itoa`,
  `ryu`, the four `sqlx` crates, `rust_decimal`, `chrono`, `uuid`, `base64` now
  build at `opt-level = 3` in the dev profile. Every command result is
  serialised to JSON for the webview and a browse is megabytes of it; at
  opt-level 0 that generated code is roughly 20x slower than release, so a dev
  build spent most of a row fetch inside serialisation rather than in the
  database. These are dependencies, so it costs nothing on incremental rebuilds
  of our own code. Follows the existing crypto block in the same file.

- **Reverse-FK request storm.** `loadIncomingForeignKeys` checked the cache
  before awaiting but only populated it after, so restoring a session fired one
  query per restored tab at the same instant. Measured nine concurrent calls
  totalling 37.7s of backend time against D1, where each call is several HTTP
  round trips to Cloudflare; everything the user was actually waiting for queued
  behind them. Added in-flight dedup plus a generation counter so a reply from
  before a connection change is discarded instead of writing another database's
  FKs into the cache under the same `schema.table` key. `StudioShell.svelte`.

- **`matchMedia` off the wheel path.** `createSmoothScroll` called
  `matchMedia('(prefers-reduced-motion: reduce)')` on every wheel tick, about
  5us of style resolution each time, on the one path that must not touch the
  style system. Resolved once and kept live by the MediaQueryList.
  `smooth-scroll.js`.

Verification so far: `npx vitest run` is 467/467 green, `npx vite build`
is clean, and the app runs with all of this in place.

## Remaining

Ordered by expected payoff.

1. **Finish the Rust verification.** I stopped a `cargo check` partway to write
   this up. `cargo check --no-default-features` and a `tauri:build` still need to
   pass, and mimalloc needs a look on macOS and Windows before this merges. It
   is a one-line global allocator swap so I expect it to be fine, but I have
   only exercised it on Linux.

2. **Scroll blitting, the big remaining render lever.** After the truncation
   cache, `fillText` is what is left: 167 calls and 6,243 characters per frame,
   4.8ms of an 8.7ms draw, about 29us per call. That is Cairo rasterising glyphs
   on the CPU and no amount of JS tuning touches it. The real fix is to stop
   redrawing text that has not moved: on a vertical scroll of one or two rows,
   `ctx.drawImage(canvas, 0, dy)` to blit the unchanged band and repaint only
   the newly exposed strip. That should cut `fillText` from ~167/frame to ~10
   during a smooth scroll, i.e. most of the remaining draw cost. It needs
   careful dirty-rect bookkeeping for hover highlights, the focused-cell ring
   and sub-pixel offsets, which is why I did not start it under time pressure.

3. **WebKit's idle memory, unexplained.** A fresh process with no table open and
   the chunk prefetch disabled still sat at 370MB Rust / 836-1038MB WebKit, with
   only 505 DOM nodes and 246 modules loaded. `smaps` shows it is all allocator
   memory (234MB `[heap]` plus 346MB across 6,215 anonymous mappings), not
   DOM/JS I can point at. I could not attribute this from outside the process
   and I could not rule out my own probe contaminating it. Next step is a clean
   run with no instrumentation at all, and a release build for comparison, since
   a lot of it may just be dev-mode module overhead.

4. **The 24-chunk startup prefetch** (`StudioShell.svelte`, the `warmers`
   array). It unconditionally pulls Monaco, ECharts twice, marked+shiki twice,
   mermaid, cytoscape, katex and 20-odd page components into memory whether or
   not they are ever opened, and a warmed chunk can never be freed. That sits
   oddly next to the idle-teardown code right above it, which unmounts views
   after 3 minutes hidden specifically to reclaim memory. My attempt to measure
   the cost was too noisy to be worth acting on, so I left it alone rather than
   regress first-open latency on a guess. Worth doing properly: measure on a
   release build, then make it engine-aware (no `RedisKeyspacePage` on a
   Postgres connection) and trim the tail.

5. **Monaco is importing far more than it uses.** `import * as monaco from
   'monaco-editor'` pulls every language contribution, which is why the bundle
   carries `ts.worker` at 6.7MB, `css.worker` at 1MB, `html.worker` at 703KB and
   a 2.5MB main chunk, plus 3.7MB of `monaco-themes`. The app only ever uses
   sql, pgsql, json, javascript/typescript and rust. Importing
   `monaco-editor/esm/vs/editor/editor.api` with an explicit language list would
   cut this substantially. I skipped it because `MonacoTextView` takes its
   language as a prop and I could not prove the full set of values it receives,
   so getting it wrong silently breaks syntax highlighting somewhere.

6. **Eased scrolling is the default** (`nativeScroll: false`). It puts a
   non-passive wheel listener in front of every tick and animates `scrollTop`
   from JS across roughly 20 frames per notch, reading `scrollHeight` each frame
   (a forced layout, measured at 15us). The repo's own notes already flag this
   mechanism as a stutter source. It measured small here, and it is a deliberate
   product choice with a setting behind it, so I did not touch the default. It
   is worth an A/B on a slower machine.

7. **`[will-change:transform]` on nine DOM scroll containers.** The repo's own
   DataTable notes say that promoting a scroller like this created a heavy
   compositing layer that lagged vertical scroll, and it is the reason
   `RowExpandViewer` has to portal its context menu out. No promoted layers were
   live at idle when I checked, so I could not measure a cost and left it. Needs
   a real before/after on a long list.

## Things I ruled out, so nobody re-checks them

- No CSS animations run at idle. `document.getAnimations()` returned 0 running,
  so there is no continuous compositor churn from a stray spinner or shimmer.
- Only one element carries `will-change` at idle (the sidebar,
  `scroll-position`), so the app is not drowning in composited layers.
- Byte-aware row windowing works. `events` fetched in 9 windows over a
  scroll-and-seek workload rather than one giant response.
- The per-frame canvas call counts are fine outside text: 35 `fillRect` and 70
  `stroke` per frame. Rects and lines are not the problem, glyphs are.

## How to reproduce the measurements

The probe is gone, but it was small: a module imported first from `src/main.js`
that `fetch`-POSTed frame-time percentiles and canvas call counts to a local
python sink on 127.0.0.1:9911, and polled the same server for a JS snippet to
`new Function`-eval inside the page. That eval channel is what let me open
tables, dispatch synthetic `WheelEvent`s and read results back without touching
the GUI, which mattered because `hyprctl dispatch` is broken on this machine by
a lua plugin and no input tool could drive the window.

To count canvas work, patch `CanvasRenderingContext2D.prototype` from the eval
channel (`measureText`, `fillText`, `fillRect`, `stroke`, and the `font`
setter), reset the counters, dispatch ~100 wheel events one per animation frame,
then divide by the draw count. Per-frame counts are the useful unit, not totals.
