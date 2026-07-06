// Status / enum badges — colored pills for status/role/state columns.
// Only applies to columns whose name signals a categorical state, so ordinary
// text columns are never badged.
const NAME_RE = /(^|_)(status|state|role|kind|stage|phase|level|priority|tier|plan|severity|visibility|mode|result|outcome|health)($|_)/i

/** value (normalized) -> palette key */
const MAP = {
  active: 'green', enabled: 'green', success: 'green', succeeded: 'green', completed: 'green',
  complete: 'green', done: 'green', approved: 'green', paid: 'green', live: 'green', online: 'green',
  open: 'green', verified: 'green', passed: 'green', healthy: 'green', ready: 'green', confirmed: 'green',
  yes: 'green', granted: 'green',
  failed: 'red', failure: 'red', error: 'red', errored: 'red', rejected: 'red', denied: 'red',
  cancelled: 'red', canceled: 'red', expired: 'red', disabled: 'red', inactive: 'red', banned: 'red',
  blocked: 'red', offline: 'red', deleted: 'red', unpaid: 'red', overdue: 'red', critical: 'red',
  closed: 'red', declined: 'red', no: 'red', revoked: 'red',
  pending: 'amber', processing: 'amber', in_progress: 'amber', inprogress: 'amber', waiting: 'amber',
  queued: 'amber', draft: 'amber', review: 'amber', reviewing: 'amber', warning: 'amber', warn: 'amber',
  paused: 'amber', trial: 'amber', trialing: 'amber', scheduled: 'amber', partial: 'amber', high: 'amber',
  new: 'blue', created: 'blue', info: 'blue', running: 'blue', started: 'blue', medium: 'blue', normal: 'blue',
}

import { isCurrentThemeDark } from '$lib/stores/settings.js'

// Dark mode: light-400 text on a translucent tint (glows on a dark grid).
const DARK = {
  green: { bg: 'rgba(34,197,94,0.16)', fg: 'rgb(74,222,128)' },
  red: { bg: 'rgba(239,68,68,0.16)', fg: 'rgb(248,113,113)' },
  amber: { bg: 'rgba(245,158,11,0.17)', fg: 'rgb(251,191,36)' },
  blue: { bg: 'rgba(59,130,246,0.16)', fg: 'rgb(96,165,250)' },
  gray: { bg: 'rgba(148,163,184,0.16)', fg: 'rgb(148,163,184)' },
}
// Light mode: saturated ~700-shade text on a pale tint — dark-on-light pills
// that stay legible on a cream background (the old palette used the dark-mode
// light-400 text, which washed out to near-invisible in light mode).
const LIGHT = {
  green: { bg: 'rgba(34,197,94,0.15)', fg: 'rgb(21,128,61)' },
  red: { bg: 'rgba(239,68,68,0.13)', fg: 'rgb(185,28,28)' },
  amber: { bg: 'rgba(245,158,11,0.18)', fg: 'rgb(180,83,9)' },
  blue: { bg: 'rgba(59,130,246,0.13)', fg: 'rgb(29,78,216)' },
  gray: { bg: 'rgba(100,116,139,0.16)', fg: 'rgb(51,65,85)' },
}

// One long-lived subscription keeps a plain boolean in sync, so format() — a
// per-cell hot path — never touches the store on each call.
let _dark = true
isCurrentThemeDark.subscribe((v) => { _dark = v })

export const statusBadge = {
  id: 'status-badge',
  name: 'Status Badges',
  description: 'Colored pills for status, role, and state columns.',
  kind: 'formatter',

  /** @param {string} _type @param {string} name */
  appliesTo(_type, name) {
    return NAME_RE.test(name)
  },

  /** @param {unknown} value */
  format(value) {
    if (typeof value !== 'string' || !value.trim()) return null
    const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
    const palette = (_dark ? DARK : LIGHT)[MAP[key] ?? 'gray']
    return { display: value, badge: palette }
  },
}
