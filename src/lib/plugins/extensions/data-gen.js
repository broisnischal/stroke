// Data Gen - insert realistic sample values into editable cells: timestamps,
// random numbers, fake names/emails/text, and web/network values. Kept separate
// from the ID Generators extension (which only mints identifiers). Every
// generator returns a string and carries a `group` used to section the menu.

// ── helpers ─────────────────────────────────────────────────────────────────
/** @param {readonly string[]} a */
const rnd = (a) => a[Math.floor(Math.random() * a.length)]
/** @param {number} min @param {number} max */
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
/** @param {number} n */
const pad2 = (n) => String(n).padStart(2, '0')
/** @param {number} n bytes */
const hexN = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => x.toString(16).padStart(2, '0')).join('')
/** @param {string} s */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const FIRST = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn', 'Nina', 'Leo', 'Maya', 'Kai', 'Zoe', 'Omar', 'Lena', 'Ivan', 'Sara', 'Noah', 'Priya', 'Diego', 'Mila', 'Hana']
const LAST = ['Smith', 'Johnson', 'Lee', 'Patel', 'Garcia', 'Kim', 'Brown', 'Nguyen', 'Martin', 'Rossi', 'Hansen', 'Silva', 'Khan', 'Cohen', 'Dubois', 'Novak', 'Costa', 'Weber', 'Adams', 'Reed', 'Haas', 'Ito', 'Mensah', 'Larsen']
const WORDS = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'eiusmod', 'tempor', 'incididunt', 'labore', 'magna', 'aliqua', 'enim', 'minim', 'veniam', 'quis', 'nostrud', 'aliquip', 'commodo', 'aute', 'irure']
const NOUNS = ['Nimbus', 'Vertex', 'Quanta', 'Lumen', 'Orbit', 'Cinder', 'Pixel', 'Cobalt', 'Harbor', 'Summit', 'Delta', 'Nova', 'Atlas', 'Forge', 'Aster']
const CO_SUFFIX = ['Labs', 'Systems', 'Technologies', 'Group', 'Solutions', 'Works', 'Digital', 'Cloud', 'Analytics', 'Networks']
const TITLE_LEVEL = ['Senior', 'Junior', 'Lead', 'Staff', 'Principal', '']
const TITLE_ROLE = ['Engineer', 'Designer', 'Manager', 'Analyst', 'Developer', 'Consultant', 'Architect', 'Specialist', 'Scientist']
const CITIES = ['London', 'Paris', 'Tokyo', 'Berlin', 'Austin', 'Toronto', 'Sydney', 'Madrid', 'Oslo', 'Delhi', 'Cairo', 'Lima', 'Seoul', 'Dublin', 'Porto']
const COUNTRIES = ['United States', 'Canada', 'United Kingdom', 'Germany', 'France', 'Japan', 'India', 'Brazil', 'Australia', 'Spain', 'Norway', 'Egypt', 'Kenya', 'Mexico', 'Italy']
const TLDS = ['com', 'io', 'dev', 'app', 'net', 'org', 'co']
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'CAD', 'AUD', 'CHF', 'CNY', 'BRL']

const firstName = () => rnd(FIRST)
const lastName = () => rnd(LAST)
const fullName = () => `${firstName()} ${lastName()}`
const word = () => rnd(WORDS)
const words = (n) => Array.from({ length: n }, word)
const sentence = () => cap(words(randInt(6, 12)).join(' ')) + '.'
const slug = () => words(randInt(2, 4)).join('-')
const domainWord = () => (rnd(NOUNS) + rnd(['', 'ly', 'io', 'hq', 'app'])).toLowerCase()
const domain = () => `${domainWord()}.${rnd(TLDS)}`
const username = () => `${firstName()}${lastName()}`.toLowerCase() + randInt(1, 99)
const email = () => `${firstName()}.${lastName()}`.toLowerCase() + `@${domain()}`
const company = () => `${rnd(NOUNS)} ${rnd(CO_SUFFIX)}`
const jobTitle = () => `${rnd(TITLE_LEVEL)} ${rnd(TITLE_ROLE)}`.trim()
const phone = () => `+1 (${randInt(200, 999)}) ${randInt(200, 999)}-${pad2(randInt(0, 99))}${pad2(randInt(0, 99))}`
const ipv4 = () => Array.from({ length: 4 }, () => randInt(0, 255)).join('.')
const ipv6 = () => Array.from({ length: 8 }, () => hexN(2)).join(':')
const mac = () => Array.from({ length: 6 }, () => hexN(1)).join(':')

/** @param {Date} d */
const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
/** @param {Date} d */
const isoTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
const DAY = 86400000

export const dataGen = {
  id: 'data-gen',
  name: 'Data Gen',
  description: 'Sample data: timestamps, random numbers, fake names/emails/text, and web/network values.',
  kind: 'generators',
  generators: [
    // ── Time ─────────────────────────────────────────────────────────────────
    { id: 'now-iso', label: 'Now · ISO 8601', hint: 'Current UTC timestamp', group: 'Time', generate: () => new Date().toISOString() },
    { id: 'now-datetime', label: 'Now · date time', hint: 'YYYY-MM-DD HH:MM:SS', group: 'Time', generate: () => { const d = new Date(); return `${isoDate(d)} ${isoTime(d)}` } },
    { id: 'now-date', label: 'Now · date', hint: 'YYYY-MM-DD', group: 'Time', generate: () => isoDate(new Date()) },
    { id: 'now-time', label: 'Now · time', hint: 'HH:MM:SS', group: 'Time', generate: () => isoTime(new Date()) },
    { id: 'now-epoch-ms', label: 'Now · epoch ms', hint: 'Milliseconds since 1970', group: 'Time', generate: () => String(Date.now()) },
    { id: 'now-epoch-s', label: 'Now · epoch s', hint: 'Seconds since 1970', group: 'Time', generate: () => String(Math.floor(Date.now() / 1000)) },
    { id: 'date-past', label: 'Random past date', hint: 'Within the last 5 years', group: 'Time', generate: () => new Date(Date.now() - randInt(1, 5 * 365) * DAY).toISOString() },
    { id: 'date-future', label: 'Random future date', hint: 'Within the next 2 years', group: 'Time', generate: () => new Date(Date.now() + randInt(1, 2 * 365) * DAY).toISOString() },

    // ── Numbers ──────────────────────────────────────────────────────────────
    { id: 'int-100', label: 'Random int · 0–100', group: 'Numbers', generate: () => String(randInt(0, 100)) },
    { id: 'int-1k', label: 'Random int · 0–1,000', group: 'Numbers', generate: () => String(randInt(0, 1000)) },
    { id: 'int-1m', label: 'Random int · 0–1,000,000', group: 'Numbers', generate: () => String(randInt(0, 1_000_000)) },
    { id: 'float', label: 'Random float · 0–1', group: 'Numbers', generate: () => Math.random().toFixed(6) },
    { id: 'price', label: 'Random price', hint: '0.00 – 999.99', group: 'Numbers', generate: () => (randInt(0, 99999) / 100).toFixed(2) },
    { id: 'percent', label: 'Random percent', group: 'Numbers', generate: () => (Math.random() * 100).toFixed(2) },
    { id: 'bool', label: 'Random boolean', group: 'Numbers', generate: () => (Math.random() < 0.5 ? 'true' : 'false') },
    { id: 'bit', label: 'Random bit · 0/1', group: 'Numbers', generate: () => String(randInt(0, 1)) },

    // ── Text / people ────────────────────────────────────────────────────────
    { id: 'first-name', label: 'First name', group: 'Text', generate: firstName },
    { id: 'last-name', label: 'Last name', group: 'Text', generate: lastName },
    { id: 'full-name', label: 'Full name', group: 'Text', generate: fullName },
    { id: 'username', label: 'Username', group: 'Text', generate: username },
    { id: 'email', label: 'Email', group: 'Text', generate: email },
    { id: 'phone', label: 'Phone number', group: 'Text', generate: phone },
    { id: 'company', label: 'Company', group: 'Text', generate: company },
    { id: 'job-title', label: 'Job title', group: 'Text', generate: jobTitle },
    { id: 'city', label: 'City', group: 'Text', generate: () => rnd(CITIES) },
    { id: 'country', label: 'Country', group: 'Text', generate: () => rnd(COUNTRIES) },
    { id: 'currency', label: 'Currency code', group: 'Text', generate: () => rnd(CURRENCIES) },
    { id: 'word', label: 'Word', group: 'Text', generate: word },
    { id: 'slug', label: 'Slug', group: 'Text', generate: slug },
    { id: 'sentence', label: 'Sentence', group: 'Text', generate: sentence },
    { id: 'paragraph', label: 'Paragraph', group: 'Text', generate: () => Array.from({ length: randInt(3, 5) }, sentence).join(' ') },

    // ── Web / network ────────────────────────────────────────────────────────
    { id: 'domain', label: 'Domain', group: 'Web', generate: domain },
    { id: 'url', label: 'URL', group: 'Web', generate: () => `https://${domain()}/${slug()}` },
    { id: 'ipv4', label: 'IPv4 address', group: 'Web', generate: ipv4 },
    { id: 'ipv6', label: 'IPv6 address', group: 'Web', generate: ipv6 },
    { id: 'mac', label: 'MAC address', group: 'Web', generate: mac },
    { id: 'hex-color', label: 'Hex color', group: 'Web', generate: () => '#' + hexN(3) },
    { id: 'rgb-color', label: 'RGB color', group: 'Web', generate: () => `rgb(${randInt(0, 255)}, ${randInt(0, 255)}, ${randInt(0, 255)})` },
  ],
}
