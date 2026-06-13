// ID Generators — insert modern identifiers into editable cells.
// Surfaced in the cell context menu ("Insert generated value").

function uuidv4() {
  return crypto.randomUUID()
}

// UUIDv7: 48-bit Unix-ms timestamp prefix + random tail, with version/variant
// bits set. Time-ordered, so it indexes far better than v4 as a key.
function uuidv7() {
  const ts = Date.now()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[0] = (ts / 2 ** 40) & 0xff
  bytes[1] = (ts / 2 ** 32) & 0xff
  bytes[2] = (ts / 2 ** 24) & 0xff
  bytes[3] = (ts / 2 ** 16) & 0xff
  bytes[4] = (ts / 2 ** 8) & 0xff
  bytes[5] = ts & 0xff
  bytes[6] = (bytes[6] & 0x0f) | 0x70 // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}

// URL-safe nanoid (default 21 chars).
const NANO_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict'
function nanoid(size = 21) {
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  let id = ''
  for (let i = 0; i < size; i++) id += NANO_ALPHABET[bytes[i] & 63]
  return id
}

// ULID: 48-bit time + 80-bit randomness, Crockford base32, lexicographically
// sortable. 26 chars.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
function ulid() {
  let ts = Date.now()
  let time = ''
  for (let i = 0; i < 10; i++) { time = CROCKFORD[ts % 32] + time; ts = Math.floor(ts / 32) }
  const rnd = crypto.getRandomValues(new Uint8Array(16))
  let rand = ''
  for (let i = 0; i < 16; i++) rand += CROCKFORD[rnd[i] & 31]
  return time + rand
}

// CUID-style: a letter prefix + base36 timestamp + random tail. Collision-
// resistant, lowercase, URL-safe — handy for human-readable keys.
function cuid() {
  const b = crypto.getRandomValues(new Uint8Array(12))
  const first = String.fromCharCode(97 + (b[0] % 26))
  const time = Date.now().toString(36)
  let rand = ''
  for (let i = 1; i < b.length; i++) rand += b[i].toString(36)
  return ('c' + first + time + rand).slice(0, 24)
}

// Random lowercase-hex token.
function hex(bytes = 16) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((x) => x.toString(16).padStart(2, '0')).join('')
}

export const idGenerators = {
  id: 'id-generators',
  name: 'ID Generators',
  description: 'UUID v7 / v4, ULID, CUID, nanoid, hex tokens & timestamps.',
  kind: 'generators',
  generators: [
    { id: 'uuidv7', label: 'UUID v7', hint: 'Time-ordered, index-friendly', generate: uuidv7 },
    { id: 'uuidv4', label: 'UUID v4', hint: 'Fully random', generate: uuidv4 },
    { id: 'ulid', label: 'ULID', hint: 'Sortable, 26 chars', generate: ulid },
    { id: 'cuid', label: 'CUID', hint: 'Short, collision-resistant', generate: cuid },
    { id: 'nanoid', label: 'nanoid', hint: '21-char URL-safe', generate: () => nanoid() },
    { id: 'nanoid-short', label: 'Short ID', hint: '8-char nanoid', generate: () => nanoid(8) },
    { id: 'hex-token', label: 'Hex token', hint: '32 hex chars', generate: () => hex(16) },
    { id: 'now-iso', label: 'Now · ISO 8601', hint: 'Current timestamp', generate: () => new Date().toISOString() },
    { id: 'now-epoch', label: 'Now · epoch ms', hint: 'Milliseconds since 1970', generate: () => String(Date.now()) },
  ],
}
