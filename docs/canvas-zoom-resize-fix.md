# Fix: Canvas table magnifies/blurs on macOS resize-handle hover

**Status:** Resolved
**Platform:** macOS (WKWebView) — Windows/Linux unaffected
**Area:** `DataTable.svelte` canvas grid, app zoom, Tauri webview

## Symptom

Hovering or dragging a column resize handle made the **table alone** look huge
and blurry, while the sidebar and the rest of the UI stayed at normal size.

The mismatch was the key tell:

- The sidebar/UI scale via CSS (`--app-font-size`, derived from `--app-zoom`).
- The table is a `<canvas>`. When it ballooned independently and looked
  **blurry** (not crisp), a bitmap was being scaled by a layer *above* the app,
  not the app's own renderer.

## Root cause

It was **WebKit page-zoom**, not the app's canvas zoom and not pinch
magnification. The diagnostic (`window.__zoomDiag()` while the table looked
wrong) confirmed it:

- `visualViewport.scale` stayed at **1** (so not pinch magnification)
- `devicePixelRatio` **jumped** (the signature of page-zoom)
- macOS Accessibility → Zoom was **off** (so not a system setting)

Two contributing paths fed it:

1. **Tauri's injected zoom polyfill.** When `zoom_hotkeys_enabled` is on, Tauri
   injects a script that listens on the **legacy `mousewheel` event** (not the
   standard `wheel` event) and calls `set_webview_zoom` whenever the scroll has
   `ctrlKey` set. On macOS a trackpad **pinch arrives as `ctrl`+wheel**, so a
   stray finger movement near a resize handle page-zoomed the whole webview.
   Earlier fixes only blocked `wheel`, which this polyfill never uses.

2. **A separate, persisted canvas zoom.** `db-studio:canvas-zoom` in
   `localStorage` could drift independently of the app's `settings.zoom`, so the
   grid could stay "zoomed" across sessions while the sidebar did not.

Because the resize hit-test lived **on the canvas header**, the pinch landed on
the canvas and triggered page-zoom before any JS guard could intervene.

## The fix

### 1. Column resize moved off the canvas to a DOM overlay
`src/lib/components/DataTable.svelte`

- Resize handles are now absolutely-positioned `<div>`s (a sticky overlay at
  `z-index: 2`) sitting on each column's right edge, derived from `geom`.
- The canvas no longer hit-tests or handles header resize pointer events.
- Each handle has `pointer-events: auto`, `touch-none`, shows `col-resize`, and
  swallows `wheel` / `mousewheel` / `gesture*` while resetting webview zoom.

### 2. Wheel/pinch zoom disabled app-wide — zoom is keyboard-only
`src/lib/stores/settings.js`

- Global **capture-phase** listeners on `wheel`, `mousewheel`, and the WebKit
  `gesturestart`/`gesturechange`/`gestureend` events call
  `preventDefault()` + `stopImmediatePropagation()` (beats Tauri's polyfill),
  then `resetWebviewZoom()`.
- Zoom is now driven **only** by `Cmd/Ctrl + = / - / 0`.
- `resetWebviewZoom()` snaps the native page-zoom back to `1` via
  `getCurrentWebview().setZoom(1)`.

### 3. App zoom is the single source of truth
`src/lib/stores/canvas-zoom.svelte.js`, `src/lib/stores/settings.js`

- Removed the independent `db-studio:canvas-zoom` persistence. `zoomState` is
  now a plain mirror of `settings.zoom`; `applySettings()` is the only writer.
- `applySettings()` clears the legacy `db-studio:canvas-zoom` key and calls
  `resetWebviewZoom()` on every apply.

### 4. devicePixelRatio watchdog
`src/main.js`

- On launch and on every `visualViewport`/`window` resize, if
  `visualViewport.scale !== 1` **or** `devicePixelRatio` drifts from baseline,
  call `resetWebviewZoom()` and re-baseline (so a genuine monitor/DPI change
  isn't fought). `window.__zoomDiag()` remains as a console probe.

### 5. Native webview zoom disabled at the source
`src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`

- `.zoom_hotkeys_enabled(false)` — stops Tauri from injecting the `mousewheel`
  zoom polyfill at all.
- macOS `with_webview`: `setAllowsMagnification(false)`, `setMagnification(1.0)`,
  `setPageZoom(1.0)` via `objc2-web-kit`.

## Files touched

- `src/lib/components/DataTable.svelte` — DOM resize handles, canvas no longer
  resizes columns, dpr re-sync of the backing store.
- `src/lib/stores/settings.js` — keyboard-only zoom, global wheel/pinch blockers,
  `resetWebviewZoom()`.
- `src/lib/stores/canvas-zoom.svelte.js` — `zoomState` mirrors app zoom only.
- `src/main.js` — launch reset + dpr watchdog + `__zoomDiag()`.
- `src-tauri/src/lib.rs` — `zoom_hotkeys_enabled(false)`, WKWebView zoom off.
- `src-tauri/Cargo.toml` — `objc2-web-kit` dependency.

## How to verify

A **full restart** is required (`npm run tauri`) because Rust changes don't hot-reload.

1. If the table is still large from a previous session, press **Cmd+0**.
2. Hover/drag a column resize edge — cursor shows `col-resize`, table size does
   **not** change, no blur.
3. Pinch near a resize handle — nothing balloons.
4. **Cmd + =** / **Cmd + -** zoom the **whole app** (sidebar + table together).
5. Optional: run `__zoomDiag()` in DevTools — `devicePixelRatio` should stay put.

## Notes

- Tauri page-zoom listens on `mousewheel`, **not** `wheel`. Blocking only `wheel`
  is insufficient on macOS.
- Page-zoom raises `devicePixelRatio` with `visualViewport.scale === 1`; pinch
  magnification raises `visualViewport.scale`. They are distinct and need
  different handling.
