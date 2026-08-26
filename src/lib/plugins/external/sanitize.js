// What a plugin is allowed to put on screen.
//
// This is the boundary between "some code a stranger wrote" and the canvas, so
// it is a whitelist in both directions: only the directive fields the grid
// renders survive, and each one is coerced to a shape the renderer cannot be
// hurt by. A plugin returning `{ link: 'javascript:...' }` would otherwise be
// scripting the host through the cell click handler; a plugin returning a
// megabyte of text would otherwise be measured and drawn.
//
// It lives outside the Worker so it can be tested directly - a sanitizer with
// no tests is a sanitizer nobody has checked.

/** Fields a directive may carry. Anything else the plugin returns is dropped. */
const DIRECTIVE_FIELDS = [
  'display', 'title', 'badge', 'swatch', 'dot', 'fg', 'bgTint', 'mask', 'reveal', 'link', 'warn',
]
/** Longest string a plugin can put on screen through one field. */
const MAX_STRING = 512
/** Only these schemes may come back as a link. `javascript:` in a cell would be
 *  a plugin scripting the host through the click handler. */
const LINK_SCHEME = /^(https?|mailto|tel):/i

/** Trim a plugin's string to something that cannot blow up a canvas or a title. */
export function safeString(v, max = MAX_STRING) {
  if (typeof v !== 'string') return undefined
  // Control characters would corrupt the canvas text run and the DOM title.
  const clean = v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max)
  return clean.length > 0 ? clean : undefined
}

/** A colour a plugin may paint with: a hex triple/quad or an rgb()/rgba() call. */
export function safeColor(v) {
  if (typeof v !== 'string') return undefined
  const s = v.trim().slice(0, 64)
  return /^#[0-9a-f]{3,8}$/i.test(s) || /^rgba?\(\s*[\d.\s,%/]+\)$/i.test(s) ? s : undefined
}

/**
 * Keep only the directive fields the host renders, each coerced to something it
 * can render safely. A plugin returning junk gets its junk dropped rather than
 * reaching the grid.
 */
export function sanitizeDirective(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const key of DIRECTIVE_FIELDS) {
    const v = /** @type {any} */ (d)[key]
    if (v === undefined || v === null) continue
    switch (key) {
      case 'display':
      case 'title':
      case 'mask':
      case 'warn': {
        const s = safeString(v)
        if (s !== undefined) out[key] = s
        break
      }
      case 'reveal':
        out[key] = !!v
        break
      case 'link': {
        const s = safeString(v, 2048)
        if (s !== undefined && LINK_SCHEME.test(s)) out[key] = s
        break
      }
      case 'fg':
      case 'bgTint':
      case 'swatch':
      case 'dot': {
        const c = safeColor(v)
        if (c !== undefined) out[key] = c
        break
      }
      case 'badge': {
        if (!v || typeof v !== 'object') break
        const bg = safeColor(/** @type {any} */ (v).bg)
        const fg = safeColor(/** @type {any} */ (v).fg)
        if (bg && fg) out.badge = { bg, fg }
        break
      }
      default:
        break
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

