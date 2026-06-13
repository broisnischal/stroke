// Extension registry. Built-in extensions register here; the hook contract is
// serializable-friendly so sandboxed third-party plugins could feed the same
// hooks later without changing any call sites.
//
// Hooks:
//  - formatter:  { appliesTo(type, name, value), format(value, type, config, name, ctx)
//                  -> render-directive | null }
//  - linkify:    { linkify(value, type, name, config) -> href | null }
//  - generators: [{ id, label, generate() -> string }]
//  - transforms: [{ id, label, appliesTo(value, type, name), run(value, type, name) -> string }]
//  - annotator:  toggle only (rendering lives in the table)
//
// A render-directive is a plain object; fields are merged across formatters
// (first writer wins per field) so e.g. money `display` and heatmap `bgTint`
// stack on one cell. Recognized fields:
//   display, title, badge{bg,fg}, swatch, dot, fg, bgTint, mask, reveal, link, warn
import { isPluginEnabled, getPluginConfig } from '$lib/stores/plugins.js'
import { betterTime } from './extensions/better-time.js'
import { numberFormat } from './extensions/number-format.js'
import { moneyFormat } from './extensions/money-format.js'
import { durationFormat } from './extensions/duration-format.js'
import { statusBadge } from './extensions/status-badge.js'
import { booleanGlyph } from './extensions/boolean-glyph.js'
import { colorSwatch } from './extensions/color-swatch.js'
import { maskSensitive } from './extensions/mask-sensitive.js'
import { smartText } from './extensions/smart-text.js'
import { heatmap } from './extensions/heatmap.js'
import { validators } from './extensions/validators.js'
import { linkify } from './extensions/linkify.js'
import { columnAnnotator } from './extensions/column-annotator.js'
import { idGenerators } from './extensions/id-generators.js'
import { cellTransforms } from './extensions/cell-transforms.js'

// Display order also = merge precedence for formatters (earlier wins per field).
export const EXTENSIONS = [
  betterTime,
  moneyFormat,
  numberFormat,
  durationFormat,
  statusBadge,
  booleanGlyph,
  colorSwatch,
  maskSensitive,
  smartText,
  heatmap,
  validators,
  linkify,
  columnAnnotator,
  idGenerators,
  cellTransforms,
]

const FORMATTERS = EXTENSIONS.filter((e) => e.kind === 'formatter')
const LINKIFIERS = EXTENSIONS.filter((e) => e.kind === 'linkify')

/** IDs of formatter extensions that require per-column stats (heatmap, etc.). */
export const STATS_EXTENSION_IDS = EXTENSIONS.filter((e) => e.needsStats).map((e) => e.id)

/** @param {Record<string, unknown>} out @param {Record<string, unknown>} d */
function mergeDirective(out, d) {
  if (!d) return out
  if (!out) out = {}
  for (const k in d) {
    if (out[k] === undefined && d[k] !== undefined) out[k] = d[k]
  }
  return out
}

/**
 * Resolve a render directive for a scalar cell via enabled formatters + linkifiers.
 * Hot path: called per visible cell on every canvas repaint — allocation only
 * happens for cells that actually match an enabled extension.
 * @param {unknown} value
 * @param {string} type
 * @param {string} name
 * @param {{ stats?: object } | undefined} [ctx]
 * @returns {Record<string, unknown> | null}
 */
export function formatCellValue(value, type, name, ctx) {
  /** @type {Record<string, unknown> | null} */
  let out = null
  for (const ext of FORMATTERS) {
    if (!isPluginEnabled(ext.id)) continue
    if (ext.appliesTo && !ext.appliesTo(type, name, value)) continue
    const d = ext.format(value, type, getPluginConfig(ext.id), name, ctx)
    if (d) out = mergeDirective(out, d)
  }
  for (const ext of LINKIFIERS) {
    if (!isPluginEnabled(ext.id)) continue
    const href = ext.linkify(value, type, name, getPluginConfig(ext.id))
    if (href) { out = mergeDirective(out, { link: href }); break }
  }
  return out
}

/**
 * Compute a linkifier href for a cell (used by the click handler).
 * @param {unknown} value @param {string} type @param {string} name
 * @returns {string | null}
 */
export function linkifyValue(value, type, name) {
  for (const ext of LINKIFIERS) {
    if (!isPluginEnabled(ext.id)) continue
    const href = ext.linkify(value, type, name, getPluginConfig(ext.id))
    if (href) return href
  }
  return null
}

/** Whether any stats-dependent extension is enabled (gates stats computation). */
export function statsNeeded() {
  return STATS_EXTENSION_IDS.some((id) => isPluginEnabled(id))
}

/** Whether the column annotator strip should render. */
export function annotatorEnabled() {
  return isPluginEnabled('column-annotator')
}

/**
 * Transforms applicable to a given cell value, from enabled transform extensions.
 * @param {unknown} value @param {string} type @param {string} name
 */
export function transformsFor(value, type, name) {
  /** @type {{ id: string, label: string, run: (v: unknown) => string }[]} */
  const out = []
  for (const ext of EXTENSIONS) {
    if (ext.kind !== 'transforms' || !isPluginEnabled(ext.id)) continue
    for (const t of ext.transforms) {
      try {
        if (t.appliesTo(value, type, name)) {
          out.push({ id: t.id, label: t.label, run: (v) => t.run(v, type, name) })
        }
      } catch {}
    }
  }
  return out
}

/** Generators from all enabled generator extensions. */
export function enabledGenerators() {
  /** @type {{ id: string, label: string, generate: () => string }[]} */
  const out = []
  for (const ext of EXTENSIONS) {
    if (ext.kind !== 'generators' || !isPluginEnabled(ext.id)) continue
    out.push(...ext.generators)
  }
  return out
}
