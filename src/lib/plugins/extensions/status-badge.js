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

const PALETTE = {
  green: { bg: 'rgba(34,197,94,0.16)', fg: 'rgb(74,222,128)' },
  red: { bg: 'rgba(239,68,68,0.16)', fg: 'rgb(248,113,113)' },
  amber: { bg: 'rgba(245,158,11,0.17)', fg: 'rgb(251,191,36)' },
  blue: { bg: 'rgba(59,130,246,0.16)', fg: 'rgb(96,165,250)' },
  gray: { bg: 'rgba(148,163,184,0.16)', fg: 'rgb(148,163,184)' },
}

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
    const palette = PALETTE[MAP[key] ?? 'gray']
    return { display: value, badge: palette }
  },
}
