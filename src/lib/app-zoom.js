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
 * Viewport position for body-portaled overlays (context menus, etc.).
 * Use raw clientX/Y - scaling is via root font-size, not CSS zoom.
 * @param {number} clientX
 * @param {number} clientY
 */
export function overlayPointerPosition(clientX, clientY) {
  return { x: clientX, y: clientY }
}
