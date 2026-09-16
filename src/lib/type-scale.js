/**
 * The UI type scale, resolved to whole pixels.
 *
 * Kept apart from the settings store so it stays a pure function of the root
 * size - the store pulls in browser-only deps, and this is the piece worth
 * testing.
 */

/**
 * Root font size at 100%, on every platform.
 *
 * It used to be per-OS - 14px on macOS, 18px elsewhere - which shipped the same
 * screen at two different sizes. 14px was also too small to hold the scale
 * together: below 100% the ten steps could not stay distinct on a whole-pixel
 * grid, so captions and labels collapsed onto one size. 16px keeps the smallest
 * step above 9px at the lowest rung, and is the web's own default reading size.
 */
export const ROOT_BASE_PX = 16

/**
 * UI zoom scale (font + layout). 1 = 100%.
 *
 * Rungs are spaced so each one lands on its own whole-pixel root at that base.
 * 5% rungs could not: 5% of 16px is 0.8px, so half of them rounded onto the rung
 * next door and rendered identically. The old code worked around that by
 * stepping one pixel per rung INDEX, which made every label but 100% a lie -
 * "150%" rendered at 136%. Coarser rungs that each mean what they say are worth
 * more than ten rungs where only some of them move.
 */
export const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]

/** Root size for a zoom rung. Whole pixels: WebKit rasterises fractional text soft. */
export const rootPxFor = (zoom) => Math.max(1, Math.round(ROOT_BASE_PX * zoom))

/** `[step, nominal px at a 14px root, optional line-height]`. */
export const UI_TYPE_SCALE = [
  ['3xl', 24, 30],
  ['2xl', 20, 28],
  ['xl', 18, 26],
  ['lg', 16, 24],
  ['base', 14],
  ['15', 15],
  ['sm', 13],
  ['xs', 12],
  ['2xs', 11],
  ['3xs', 10],
]

/** The scale's own reference root - every nominal size above is quoted at 14px. */
export const TYPE_SCALE_REF = 14

/** Steps ordered small -> large, so the separation walk below has a direction. */
const TYPE_SCALE_ASC = [...UI_TYPE_SCALE].sort((a, b) => a[1] - b[1])
const TYPE_SCALE_BASE_I = TYPE_SCALE_ASC.findIndex(([step]) => step === 'base')

/**
 * Resolve the UI type scale to whole pixels for a given root size.
 *
 * Rounding each step on its own collapses neighbours at small roots - at a 12px
 * root both `3xs` (10) and `2xs` (11) round to 9px, and two tokens that render
 * identically cannot express the hierarchy the scale exists for. So round first,
 * then walk outward from `base` forcing at least a pixel between neighbours.
 *
 * `base` is pinned to the root itself rather than rounded, because the canvas
 * grid sizes its text from `--app-font-size`; letting the two drift by a pixel
 * would show up as the grid and the DOM disagreeing about the same type step.
 *
 * @param {number} rootPx
 * @returns {Array<[string, number]>} `[step, px]`, ordered small -> large.
 */
export function buildTypeScale(rootPx) {
  const px = TYPE_SCALE_ASC.map(([, size]) =>
    Math.max(1, Math.round((size * rootPx) / TYPE_SCALE_REF)),
  )
  px[TYPE_SCALE_BASE_I] = rootPx
  for (let i = TYPE_SCALE_BASE_I + 1; i < px.length; i++) {
    px[i] = Math.max(px[i], px[i - 1] + 1)
  }
  for (let i = TYPE_SCALE_BASE_I - 1; i >= 0; i--) {
    px[i] = Math.max(1, Math.min(px[i], px[i + 1] - 1))
  }
  return TYPE_SCALE_ASC.map(([step], i) => [step, px[i]])
}
