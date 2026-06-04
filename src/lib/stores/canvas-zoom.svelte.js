// Shared canvas-table zoom — module-level reactive object so ALL open DataTable
// tabs zoom together in real time and the level persists across sessions.
export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 2.5
export const ZOOM_STEP = 0.1

function load() {
  try {
    const v = parseFloat(localStorage.getItem('db-studio:canvas-zoom') ?? '1')
    return Number.isFinite(v) ? Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v)) : 1.0
  } catch { return 1.0 }
}

function save(v) {
  try { localStorage.setItem('db-studio:canvas-zoom', String(v)) } catch {}
}

// Export an object — mutating .value is allowed; reassigning the binding is not.
export const zoomState = $state({ value: load() })

export function adjustZoom(delta) {
  zoomState.value = Math.round(
    Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomState.value + delta)) * 10
  ) / 10
  save(zoomState.value)
}

export function resetZoom() {
  zoomState.value = 1.0
  save(1.0)
}
