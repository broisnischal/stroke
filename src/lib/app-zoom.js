/** @returns {number} App UI zoom from settings (1 = 100%). */
export function getAppZoom() {
  if (typeof document === 'undefined') return 1

  const fromVar = Number(
    getComputedStyle(document.documentElement).getPropertyValue('--app-zoom'),
  )
  if (Number.isFinite(fromVar) && fromVar > 0) return fromVar

  return 1
}

/**
 * The ratio the UI actually renders at (1 = 100%).
 *
 * Distinct from `getAppZoom()`, which is the zoom rung's nominal label. Panel
 * widths are persisted as px at 100%, so a drag delta - which arrives in real
 * screen px - has to be divided by this to land back in stored units.
 * @returns {number}
 */
export function getAppScale() {
  if (typeof document === 'undefined') return 1
  const v = Number(
    getComputedStyle(document.documentElement).getPropertyValue('--app-scale'),
  )
  return Number.isFinite(v) && v > 0 ? v : 1
}

/**
 * Viewport position for body-portaled overlays (context menus, etc.).
 * Use raw clientX/Y - scaling is via root font-size, not CSS zoom.
 * @param {number} clientX
 * @param {number} clientY
 */
export function overlayPointerPosition(clientX, clientY) {
  return { x: clientX, y: clientY }
}
