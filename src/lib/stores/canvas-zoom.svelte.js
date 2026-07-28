// Shared canvas-table zoom - mirrors app settings zoom only. Do NOT persist a
// separate localStorage key; that caused the table to balloon independently of
// the sidebar (stale stroke:canvas-zoom from accidental pinch near resize handles).

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 2.5

/** Reactive mirror of app zoom - applySettings() is the single writer. */
export const zoomState = $state({ value: 1.0 })
