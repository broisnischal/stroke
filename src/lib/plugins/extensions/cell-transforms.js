// Cell Transforms — on-demand conversions surfaced in the cell context menu.
// Each transform returns a string (shown + copied to clipboard); it never
// mutates the underlying data.

/** @param {unknown} value */
function asEpoch(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^\d{10,13}$/.test(value.trim())) return Number(value.trim())
  return null
}

/** @param {unknown} value */
function isEpochLike(value) {
  const n = asEpoch(value)
  if (n === null) return false
  // Plausible ~2001–2100 in seconds (1e9–4e9) or milliseconds (1e12–4e12).
  return (n > 1e9 && n < 4e9) || (n > 1e12 && n < 4e12)
}

/** @param {string} s */
function b64urlDecode(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
}

/** @param {unknown} value */
function isJwtLike(value) {
  return typeof value === 'string' && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(value.trim())
}

export const cellTransforms = {
  id: 'cell-transforms',
  name: 'Cell Transforms',
  description: 'Epoch → date, decode JWT, and other one-click conversions.',
  kind: 'transforms',
  transforms: [
    {
      id: 'epoch-to-iso',
      label: 'Epoch → ISO date',
      /** @param {unknown} v */
      appliesTo: (v) => isEpochLike(v),
      /** @param {unknown} v */
      run: (v) => {
        const n = /** @type {number} */ (asEpoch(v))
        const ms = n < 1e12 ? n * 1000 : n
        return new Date(ms).toISOString()
      },
    },
    {
      id: 'decode-jwt',
      label: 'Decode JWT',
      /** @param {unknown} v */
      appliesTo: (v) => isJwtLike(v),
      /** @param {unknown} v */
      run: (v) => {
        const [h, p] = String(v).split('.')
        const header = JSON.parse(b64urlDecode(h))
        const payload = JSON.parse(b64urlDecode(p))
        return JSON.stringify({ header, payload }, null, 2)
      },
    },
    {
      id: 'json-pretty',
      label: 'Pretty-print JSON',
      /** @param {unknown} v */
      appliesTo: (v) => {
        if (typeof v === 'object' && v !== null) return true
        if (typeof v !== 'string') return false
        const t = v.trim()
        return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))
      },
      /** @param {unknown} v */
      run: (v) => JSON.stringify(typeof v === 'string' ? JSON.parse(v) : v, null, 2),
    },
    {
      id: 'base64-decode',
      label: 'Decode Base64',
      /** @param {unknown} v */
      appliesTo: (v) => typeof v === 'string' && /^[A-Za-z0-9+/]{8,}={0,2}$/.test(v.trim()) && v.trim().length % 4 === 0,
      /** @param {unknown} v */
      run: (v) => atob(String(v).trim()),
    },
  ],
}
