<script>
  import FieldSelect from './FieldSelect.svelte';
  import { executeSql, connectRedis, redisScan } from '$lib/api.js'
  import { engineFamily } from '$lib/stores/connections.js'
  import { cn } from '$lib/utils.js'
  import { readOnlyMode, guardWrite, READ_ONLY_HINT } from '$lib/stores/read-only.js'
  import { tick, onDestroy } from 'svelte'
  import ResizeHandle from './ResizeHandle.svelte'
  import Search from '@lucide/svelte/icons/search'
  import X from '@lucide/svelte/icons/x'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import KeyRound from '@lucide/svelte/icons/key-round'
  import Database from '@lucide/svelte/icons/database'
  import TerminalIcon from '@lucide/svelte/icons/terminal'
  import CornerDownLeft from '@lucide/svelte/icons/corner-down-left'
  import Copy from '@lucide/svelte/icons/copy'
  import Check from '@lucide/svelte/icons/check'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import Timer from '@lucide/svelte/icons/timer'
  import Eraser from '@lucide/svelte/icons/eraser'
  import Type from '@lucide/svelte/icons/type'
  import Hash from '@lucide/svelte/icons/hash'
  import List from '@lucide/svelte/icons/list'
  import Braces from '@lucide/svelte/icons/braces'
  import ListOrdered from '@lucide/svelte/icons/list-ordered'
  import Radio from '@lucide/svelte/icons/radio'
  import Server from '@lucide/svelte/icons/server'
  import HardDrive from '@lucide/svelte/icons/hard-drive'
  import Users from '@lucide/svelte/icons/users'
  import Activity from '@lucide/svelte/icons/activity'
  import Gauge from '@lucide/svelte/icons/gauge'
  import Plus from '@lucide/svelte/icons/plus'
  import Pencil from '@lucide/svelte/icons/pencil'

  /** @type {{ active?: boolean, connection?: import('$lib/stores/connections.js').SavedConnection | null }} */
  let { active = false, connection = null } = $props()

  const isRedisConn = $derived(engineFamily(connection?.type) === 'redis')

  // ── Type styling ────────────────────────────────────────────────────────────
  // Per Redis value type: a lucide glyph + accent color for the tree glyph and
  // the type tag. Type colors are a deliberate, semantic exception to the token
  // palette (like syntax highlighting) - kept restrained: color lives on the
  // glyph and a small tag only, never as loud filled chips.
  /**
   * @typedef {{ short: string, label: string, icon: any, color: string }} TypeMeta
   * @type {Record<string, TypeMeta>}
   */
  const TYPE_META = {
    string: { short: 'STR',    label: 'string', icon: Type,        color: 'text-sky-600 dark:text-sky-400' },
    hash:   { short: 'HASH',   label: 'hash',   icon: Hash,        color: 'text-violet-600 dark:text-violet-400' },
    list:   { short: 'LIST',   label: 'list',   icon: List,        color: 'text-amber-600 dark:text-amber-400' },
    set:    { short: 'SET',    label: 'set',    icon: Braces,      color: 'text-emerald-600 dark:text-emerald-400' },
    zset:   { short: 'ZSET',   label: 'zset',   icon: ListOrdered, color: 'text-rose-600 dark:text-rose-400' },
    stream: { short: 'STREAM', label: 'stream', icon: Radio,       color: 'text-cyan-600 dark:text-cyan-400' },
  }
  const CREATABLE = ['string', 'hash', 'list', 'set', 'zset']

  // Canonical icon-button recipe (§6). Add a `size-*` per call site.
  const iconBtn =
    'inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40'

  // ── Reply parsing ─────────────────────────────────────────────────────────
  // Every Redis reply comes back as a SqlResult with one column named `result`
  // and one row per reply element. Flatten to the first column's values.
  /** @param {{ rows?: unknown[][] } | null} res */
  function replyValues(res) {
    if (!res?.rows) return /** @type {string[]} */ ([])
    return res.rows.map((r) => {
      const v = Array.isArray(r) ? r[0] : r
      return v == null ? '' : String(v)
    })
  }

  /** Fold a flat [a, b, c, d] reply into [[a, b], [c, d]] pairs (HGETALL, ZRANGE WITHSCORES). */
  function toPairs(/** @type {string[]} */ values) {
    const out = /** @type {[string, string][]} */ ([])
    for (let i = 0; i + 1 < values.length; i += 2) out.push([values[i], values[i + 1]])
    return out
  }

  /** Quote a key/arg for the command line when it isn't a bare token. */
  function quoteArg(/** @type {string} */ s) {
    if (/^[A-Za-z0-9:_\-.\/@]+$/.test(s)) return s
    return '"' + s.replace(/(["\\])/g, '\\$1') + '"'
  }

  /** Humanize a byte count into "1.2 MB". */
  function humanBytes(/** @type {number | null} */ n) {
    if (n == null || !Number.isFinite(n)) return ''
    if (n < 1024) return `${n} B`
    const units = ['KB', 'MB', 'GB', 'TB']
    let v = n / 1024
    let i = 0
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024
      i++
    }
    return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
  }

  // ── Resizable key list ────────────────────────────────────────────────────
  const KEYS_WIDTH_KEY = 'stroke:redis:keysWidth'
  const KEYS_MIN = 220
  const KEYS_MAX = 520
  /** @param {number} w */
  const clampKeysWidth = (w) => Math.round(Math.min(KEYS_MAX, Math.max(KEYS_MIN, w)))
  function loadKeysWidth() {
    try {
      const n = Number(localStorage.getItem(KEYS_WIDTH_KEY))
      return Number.isFinite(n) && n > 0 ? clampKeysWidth(n) : 280
    } catch {
      return 280
    }
  }
  let keysWidth = $state(loadKeysWidth())
  let resizeStartWidth = 0

  // ── Key list state ──────────────────────────────────────────────────────────
  let keys = $state(/** @type {string[]} */ ([]))
  let keysLoading = $state(false)
  let keysError = $state('')
  let filter = $state('')
  let loadedConnId = $state(/** @type {string | null} */ (null))
  let collapsed = $state(/** @type {Set<string>} */ (new Set()))

  // Per-key type cache, filled concurrently after the key names load.
  const TYPE_CAP = 500
  let typeMap = $state(/** @type {Map<string, string>} */ (new Map()))
  let typesLoading = $state(false)
  let typesTruncated = $state(false)

  /** Fully iterate the keyspace via non-blocking SCAN, deduped + sorted. */
  async function scanAllKeys() {
    const seen = new Set()
    let cursor = '0'
    let iterations = 0
    do {
      const r = await redisScan(cursor, '*', 1000)
      cursor = r.cursor
      for (const k of r.keys) seen.add(k)
      iterations++
    } while (cursor !== '0' && seen.size < 100000 && iterations < 5000)
    return [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }

  async function loadKeys() {
    if (!active || !isRedisConn) return
    keysLoading = true
    keysError = ''
    try {
      keys = await scanAllKeys()
    } catch {
      // SCAN unavailable/failed - fall back to the (blocking) KEYS *.
      try {
        const res = await executeSql('KEYS *')
        keys = replyValues(res).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      } catch (e2) {
        keysError = String(e2).replace(/^Error:\s*/, '')
        keys = []
      }
    } finally {
      keysLoading = false
    }
    void loadTypes(keys)
  }

  /** Resolve each key's TYPE concurrently (capped) so the tree can badge it. */
  async function loadTypes(/** @type {string[]} */ keyList) {
    if (!active || !isRedisConn) return
    typesTruncated = keyList.length > TYPE_CAP
    const subset = keyList.slice(0, TYPE_CAP)
    if (subset.length === 0) {
      typeMap = new Map()
      return
    }
    typesLoading = true
    try {
      // Bounded worker pool - firing all 500 TYPE commands at once floods the
      // IPC bridge with simultaneous invokes (each opens a Redis command).
      const CONCURRENCY = 8
      /** @type {[string, string][]} */
      const entries = []
      let i = 0
      async function worker() {
        while (i < subset.length) {
          const k = subset[i++]
          try {
            const t = String(replyValues(await executeSql(`TYPE ${quoteArg(k)}`))[0] ?? '')
            entries.push([k, t])
          } catch {
            entries.push([k, ''])
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, subset.length) }, worker))
      typeMap = new Map(entries)
    } finally {
      typesLoading = false
    }
  }

  // ── Server info (Redis Insight-style overview strip) ──────────────────────
  let serverInfo = $state(/** @type {Record<string, string> | null} */ (null))
  let infoLoading = $state(false)

  /** Parse the flat `field:value` lines of an INFO reply into a map. */
  function parseInfo(/** @type {string} */ text) {
    /** @type {Record<string, string>} */
    const map = {}
    for (const line of text.split(/\r?\n/)) {
      if (!line || line[0] === '#') continue
      const idx = line.indexOf(':')
      if (idx < 0) continue
      map[line.slice(0, idx)] = line.slice(idx + 1)
    }
    return map
  }

  async function loadInfo() {
    if (!active || !isRedisConn) return
    infoLoading = true
    try {
      serverInfo = parseInfo(replyValues(await executeSql('INFO'))[0] ?? '')
    } catch {
      serverInfo = null
    } finally {
      infoLoading = false
    }
  }

  const stats = $derived.by(() => {
    const i = serverInfo
    if (!i) return null
    const hits = Number(i.keyspace_hits ?? 0)
    const misses = Number(i.keyspace_misses ?? 0)
    const total = hits + misses
    return {
      version: i.redis_version ?? '',
      mode: i.redis_mode ?? 'standalone',
      memory: i.used_memory_human?.trim() ?? '',
      memoryPeak: i.used_memory_peak_human?.trim() ?? '',
      clients: i.connected_clients ?? '',
      ops: i.instantaneous_ops_per_sec ?? '',
      uptime: Number(i.uptime_in_seconds ?? 0),
      hitRate: total > 0 ? Math.round((hits / total) * 100) : null,
    }
  })

  // Load once per connection when this page first becomes active.
  $effect(() => {
    const cid = connection?.id ?? null
    if (!active || !isRedisConn) return
    if (loadedConnId === cid) return
    loadedConnId = cid
    currentDb = Number(connection?.db) || 0
    selectedKey = null
    valueData = null
    valueError = ''
    typeMap = new Map()
    typesTruncated = false
    confirmingDelete = false
    serverInfo = null
    newKeyOpen = false
    void loadKeys()
    void loadInfo()
  })

  // ── Logical DB switching (0-15) ─────────────────────────────────────────────
  // Redis exposes 16 numbered logical DBs. The backend opens a fresh connection
  // per command at cfg.db, so switching = reconnect the active connection at the
  // new db (reusing connect_redis_db), then reload the keyspace.
  let currentDb = $state(0)
  let switchingDb = $state(false)
  const DB_OPTIONS = Array.from({ length: 16 }, (_, n) => n)

  /** @param {number} n */
  async function switchDb(n) {
    if (n === currentDb || switchingDb || !connection) return
    switchingDb = true
    try {
      await connectRedis({ ...connection, db: n })
      currentDb = n
      selectedKey = null
      valueData = null
      valueError = ''
      typeMap = new Map()
      typesTruncated = false
      await loadKeys()
      void loadInfo()
    } catch (e) {
      keysError = String(e).replace(/^Error:\s*/, '')
    } finally {
      switchingDb = false
    }
  }

  const filteredKeys = $derived.by(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return keys
    return keys.filter((k) => k.toLowerCase().includes(q))
  })

  /** Group keys by their first ":"-delimited segment; unprefixed keys go under "keys". */
  const groups = $derived.by(() => {
    /** @type {Map<string, string[]>} */
    const map = new Map()
    for (const k of filteredKeys) {
      const idx = k.indexOf(':')
      const g = idx > 0 ? k.slice(0, idx) : 'keys'
      const arr = map.get(g)
      if (arr) arr.push(k)
      else map.set(g, [k])
    }
    return [...map.entries()]
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) => a.name.localeCompare(b.name))
  })

  /** @param {string} g */
  function toggleGroup(g) {
    const next = new Set(collapsed)
    if (next.has(g)) next.delete(g)
    else next.add(g)
    collapsed = next
  }

  // ── Value panel state ───────────────────────────────────────────────────────
  let selectedKey = $state(/** @type {string | null} */ (null))
  let selectedType = $state('')
  let selectedTtl = $state(/** @type {number | null} */ (null))
  let keyMemory = $state(/** @type {number | null} */ (null))
  let keyEncoding = $state('')
  let valueData = $state(/** @type {any} */ (null))
  let valueLoading = $state(false)
  let valueError = $state('')
  let jsonView = $state(true)
  let confirmingDelete = $state(false)
  let deleting = $state(false)

  /** @param {string} key */
  async function selectKey(key) {
    selectedKey = key
    confirmingDelete = false
    editingTtl = false
    await loadValue(key)
  }

  /** @param {string} key */
  async function loadValue(key) {
    if (!active || !isRedisConn) return
    valueLoading = true
    valueError = ''
    valueData = null
    selectedType = ''
    selectedTtl = null
    keyMemory = null
    keyEncoding = ''
    jsonView = true
    editingString = false
    addOpen = false
    valueCapped = false
    const q = quoteArg(key)
    try {
      const t = String(replyValues(await executeSql(`TYPE ${q}`))[0] ?? '')
      selectedType = t
      // Metadata in parallel - none of these block the value render meaningfully.
      const [ttlRes, memRes, encRes] = await Promise.all([
        executeSql(`TTL ${q}`).catch(() => null),
        executeSql(`MEMORY USAGE ${q}`).catch(() => null),
        executeSql(`OBJECT ENCODING ${q}`).catch(() => null),
      ])
      const ttl = Number(replyValues(ttlRes)[0])
      selectedTtl = Number.isFinite(ttl) ? ttl : null
      const mem = Number(replyValues(memRes)[0])
      keyMemory = Number.isFinite(mem) ? mem : null
      keyEncoding = replyValues(encRes)[0] ?? ''

      if (t === 'string') {
        const v = replyValues(await executeSql(`GET ${q}`))[0] ?? ''
        valueData = { kind: 'string', value: v }
      } else if (t === 'hash') {
        const pairs = toPairs(replyValues(await executeSql(`HGETALL ${q}`)))
        valueCapped = pairs.length > VALUE_CAP
        valueData = { kind: 'hash', pairs: pairs.slice(0, VALUE_CAP) }
      } else if (t === 'list') {
        const items = replyValues(await executeSql(`LRANGE ${q} 0 ${VALUE_CAP - 1}`))
        valueCapped = items.length >= VALUE_CAP
        valueData = { kind: 'list', items }
      } else if (t === 'set') {
        const items = replyValues(await executeSql(`SMEMBERS ${q}`))
        valueCapped = items.length > VALUE_CAP
        valueData = { kind: 'set', items: items.slice(0, VALUE_CAP) }
      } else if (t === 'zset') {
        const pairs = toPairs(replyValues(await executeSql(`ZRANGE ${q} 0 ${VALUE_CAP - 1} WITHSCORES`)))
        valueCapped = pairs.length >= VALUE_CAP
        valueData = { kind: 'zset', pairs }
      } else if (t === 'stream') {
        valueData = { kind: 'stream', entries: replyValues(await executeSql(`XRANGE ${q} - + COUNT 100`)) }
      } else if (t === 'none' || t === '') {
        valueError = 'Key does not exist'
      } else {
        valueData = { kind: 'other', type: t }
      }
    } catch (e) {
      valueError = String(e)
    } finally {
      valueLoading = false
    }
  }

  async function deleteSelectedKey() {
    if (!selectedKey || deleting) return
    const key = selectedKey
    deleting = true
    try {
      await executeSql(`DEL ${quoteArg(key)}`)
      confirmingDelete = false
      selectedKey = null
      valueData = null
      selectedType = ''
      selectedTtl = null
      valueError = ''
      await loadKeys()
      void loadInfo()
    } catch (e) {
      valueError = String(e)
    } finally {
      deleting = false
    }
  }

  // ── TTL editing ─────────────────────────────────────────────────────────────
  let editingTtl = $state(false)
  let ttlInput = $state('')
  let savingTtl = $state(false)

  function openTtlEditor() {
    ttlInput = selectedTtl != null && selectedTtl > 0 ? String(selectedTtl) : ''
    editingTtl = true
  }

  /** @param {boolean} persist */
  async function applyTtl(persist) {
    if (!selectedKey || savingTtl) return
    const key = selectedKey
    savingTtl = true
    try {
      if (persist) {
        await executeSql(`PERSIST ${quoteArg(key)}`)
      } else {
        const n = parseInt(ttlInput, 10)
        if (!Number.isFinite(n) || n <= 0) {
          savingTtl = false
          return
        }
        await executeSql(`EXPIRE ${quoteArg(key)} ${n}`)
      }
      editingTtl = false
      await loadValue(key)
    } catch (e) {
      valueError = String(e)
    } finally {
      savingTtl = false
    }
  }

  // ── New key ───────────────────────────────────────────────────────────────
  let newKeyOpen = $state(false)
  let nkName = $state('')
  let nkType = $state('string')
  let nkValue = $state('')
  let nkField = $state('')
  let nkScore = $state('')
  let creatingKey = $state(false)
  let newKeyError = $state('')

  function resetNewKey() {
    nkName = ''
    nkValue = ''
    nkField = ''
    nkScore = ''
    newKeyError = ''
  }

  async function createKey() {
    const name = nkName.trim()
    if (!name || creatingKey) return
    creatingKey = true
    newKeyError = ''
    const q = quoteArg(name)
    const v = quoteArg(nkValue)
    try {
      if (nkType === 'string') await executeSql(`SET ${q} ${v}`)
      else if (nkType === 'list') await executeSql(`RPUSH ${q} ${v}`)
      else if (nkType === 'set') await executeSql(`SADD ${q} ${v}`)
      else if (nkType === 'hash') await executeSql(`HSET ${q} ${quoteArg(nkField.trim() || 'field')} ${v}`)
      else if (nkType === 'zset') await executeSql(`ZADD ${q} ${quoteArg((nkScore.trim() || '0'))} ${v}`)
      newKeyOpen = false
      resetNewKey()
      await loadKeys()
      void loadInfo()
      await selectKey(name)
    } catch (e) {
      newKeyError = String(e).replace(/^Error:\s*/, '')
    } finally {
      creatingKey = false
    }
  }

  // ── Value editing (CRUD) ────────────────────────────────────────────────────
  let editingString = $state(false)
  let stringEdit = $state('')
  let savingValue = $state(false)
  let addOpen = $state(false)
  let addField = $state('')
  let addScore = $state('')
  let addValue = $state('')
  let rowBusy = $state('')
  const VALUE_CAP = 2000
  let valueCapped = $state(false)

  function startStringEdit() {
    if (valueData?.kind !== 'string') return
    stringEdit = valueData.value
    editingString = true
  }

  async function saveString() {
    if (!selectedKey || savingValue) return
    const key = selectedKey
    savingValue = true
    try {
      await executeSql(`SET ${quoteArg(key)} ${quoteArg(stringEdit)}`)
      editingString = false
      await loadValue(key)
      void loadKeys()
    } catch (e) {
      valueError = String(e).replace(/^Error:\s*/, '')
    } finally {
      savingValue = false
    }
  }

  /** Remove one field/member/element from the selected collection key. */
  async function deleteEntry(/** @type {string} */ kind, /** @type {string} */ member) {
    if (!selectedKey || rowBusy) return
    if (!guardWrite('delete entries from this key')) return
    const key = selectedKey
    const q = quoteArg(key)
    rowBusy = member
    try {
      if (kind === 'hash') await executeSql(`HDEL ${q} ${quoteArg(member)}`)
      else if (kind === 'set') await executeSql(`SREM ${q} ${quoteArg(member)}`)
      else if (kind === 'zset') await executeSql(`ZREM ${q} ${quoteArg(member)}`)
      else if (kind === 'list') await executeSql(`LREM ${q} 1 ${quoteArg(member)}`)
      await loadValue(key)
      void loadKeys()
    } catch (e) {
      valueError = String(e).replace(/^Error:\s*/, '')
    } finally {
      rowBusy = ''
    }
  }

  /** Add a field/member/element to the selected collection key. */
  async function addEntry() {
    if (!selectedKey || savingValue) return
    const key = selectedKey
    const kind = valueData?.kind
    const q = quoteArg(key)
    const v = quoteArg(addValue)
    savingValue = true
    try {
      if (kind === 'hash') await executeSql(`HSET ${q} ${quoteArg(addField.trim() || 'field')} ${v}`)
      else if (kind === 'set') await executeSql(`SADD ${q} ${v}`)
      else if (kind === 'zset') await executeSql(`ZADD ${q} ${quoteArg(addScore.trim() || '0')} ${v}`)
      else if (kind === 'list') await executeSql(`RPUSH ${q} ${v}`)
      addField = ''
      addScore = ''
      addValue = ''
      addOpen = false
      await loadValue(key)
      void loadKeys()
    } catch (e) {
      valueError = String(e).replace(/^Error:\s*/, '')
    } finally {
      savingValue = false
    }
  }

  // ── Copy feedback ─────────────────────────────────────────────────────────
  let copiedId = $state('')
  /** @type {ReturnType<typeof setTimeout> | null} */
  let copiedTimer = null
  onDestroy(() => { if (copiedTimer) clearTimeout(copiedTimer) })
  /** @param {string} text @param {string} id */
  function copyText(text, id) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        copiedId = id
        if (copiedTimer) clearTimeout(copiedTimer)
        copiedTimer = setTimeout(() => (copiedId = ''), 1400)
      })
      .catch(() => {})
  }

  /** Parse a string value as JSON when it looks like an object/array, else null. */
  function tryParseJson(/** @type {string} */ v) {
    const t = (v ?? '').trim()
    if (!t || (t[0] !== '{' && t[0] !== '[')) return null
    try {
      return JSON.parse(t)
    } catch {
      return null
    }
  }

  const stringJson = $derived(valueData?.kind === 'string' ? tryParseJson(valueData.value) : null)
  const stringDisplay = $derived.by(() => {
    if (valueData?.kind !== 'string') return ''
    if (stringJson !== null && jsonView) return JSON.stringify(stringJson, null, 2)
    return valueData.value
  })

  /** Humanize a positive duration (seconds) into a compact "1d 2h" / "5m" label. */
  function humanDuration(/** @type {number} */ s) {
    if (s < 60) return `${s}s`
    const d = Math.floor(s / 86400)
    let r = s % 86400
    const h = Math.floor(r / 3600)
    r %= 3600
    const m = Math.floor(r / 60)
    const sec = r % 60
    const parts = []
    if (d) parts.push(`${d}d`)
    if (h) parts.push(`${h}h`)
    if (m) parts.push(`${m}m`)
    if (sec && !d && !h) parts.push(`${sec}s`)
    return parts.slice(0, 2).join(' ') || `${s}s`
  }

  const hasExpiry = $derived(selectedTtl != null && selectedTtl > 0)
  const ttlLabel = $derived(
    selectedTtl == null
      ? ''
      : selectedTtl === -1
        ? 'no expiry'
        : selectedTtl === -2
          ? 'expired'
          : humanDuration(selectedTtl),
  )

  // Live TTL countdown - tick the remaining seconds down while a key with an
  // expiry is selected, so the label decays without a manual reload.
  $effect(() => {
    if (!hasExpiry || editingTtl) return
    const id = setInterval(() => {
      // Skip while the window is backgrounded so we don't churn reactivity
      // every second when nothing is visible; the label resyncs on reload.
      if (typeof document !== 'undefined' && document.hidden) return
      if (selectedTtl != null && selectedTtl > 0) selectedTtl -= 1
    }, 1000)
    return () => clearInterval(id)
  })

  const sizeLabel = $derived.by(() => {
    const d = valueData
    if (!d) return ''
    if (d.kind === 'string') return `${d.value.length} ${d.value.length === 1 ? 'char' : 'chars'}`
    if (d.kind === 'hash') return `${d.pairs.length} ${d.pairs.length === 1 ? 'field' : 'fields'}`
    if (d.kind === 'zset') return `${d.pairs.length} ${d.pairs.length === 1 ? 'member' : 'members'}`
    if (d.kind === 'list') return `${d.items.length} ${d.items.length === 1 ? 'item' : 'items'}`
    if (d.kind === 'set') return `${d.items.length} ${d.items.length === 1 ? 'member' : 'members'}`
    return ''
  })

  // ── Command console ─────────────────────────────────────────────────────────
  let consoleOpen = $state(true)
  let consoleInput = $state('')
  /** @type {{ cmd: string, lines: string[], isError: boolean, pending?: boolean }[]} */
  let scrollback = $state([])
  /** @type {string[]} */
  let history = []
  let historyIdx = $state(0)
  /** @type {HTMLElement | null} */
  let scrollbackEl = $state(null)

  const WRITE_VERBS = new Set([
    'set', 'setex', 'setnx', 'getset', 'append', 'del', 'unlink', 'expire', 'pexpire',
    'expireat', 'persist', 'rename', 'renamenx', 'hset', 'hmset', 'hsetnx', 'hdel',
    'lpush', 'rpush', 'lpop', 'rpop', 'lset', 'lrem', 'ltrim', 'sadd', 'srem', 'spop',
    'zadd', 'zrem', 'zincrby', 'incr', 'decr', 'incrby', 'decrby', 'incrbyfloat',
    'flushdb', 'flushall', 'move', 'copy', 'restore',
  ])

  /** The idiomatic read command for each Redis value type. */
  const TYPE_READ = /** @type {Record<string, (k: string) => string>} */ ({
    string: (k) => `GET ${k}`,
    hash: (k) => `HGETALL ${k}`,
    list: (k) => `LRANGE ${k} 0 -1`,
    set: (k) => `SMEMBERS ${k}`,
    zset: (k) => `ZRANGE ${k} 0 -1 WITHSCORES`,
    stream: (k) => `XRANGE ${k} - +`,
  })

  /** On a WRONGTYPE error, resolve the key's real type and suggest the right
   * command (e.g. `get` on a hash → "try HGETALL"). Returns '' if unavailable. */
  async function wrongTypeHint(/** @type {string} */ cmd) {
    const key = cmd.split(/\s+/)[1]
    if (!key) return ''
    const bare = key.replace(/^["']|["']$/g, '')
    try {
      const t = String(replyValues(await executeSql(`TYPE ${quoteArg(bare)}`))[0] ?? '')
      if (!t || t === 'none') return ''
      const suggest = TYPE_READ[t]?.(key)
      return `→ ${key} holds a ${t}${suggest ? `, try: ${suggest}` : ''}`
    } catch {
      return ''
    }
  }

  /** Format a flattened reply the way redis-cli prints it. */
  function formatReply(/** @type {string[]} */ values) {
    if (values.length === 0) return ['(nil)']
    if (values.length === 1) {
      const v = values[0]
      if (v === 'OK' || v === 'PONG' || v === 'QUEUED') return [v]
      if (/^-?\d+$/.test(v)) return [`(integer) ${v}`]
      return [`"${v}"`]
    }
    const width = String(values.length).length
    return values.map((v, i) => `${String(i + 1).padStart(width)}) "${v}"`)
  }

  async function runCommand() {
    const cmd = consoleInput.trim()
    if (!cmd) return
    history.push(cmd)
    historyIdx = history.length
    consoleInput = ''
    // `clear` clears the console, like a terminal (not sent to Redis).
    if (/^clear$/i.test(cmd)) { scrollback = []; return }
    // Push a pending entry, then replace it IMMUTABLY once the reply lands -
    // mutating the pushed object in place bypasses the $state proxy so the reply
    // never renders.
    const idx = scrollback.length
    scrollback = [...scrollback, { cmd, lines: [], isError: false, pending: true }]
    await scrollConsoleToBottom()
    let lines /** @type {string[]} */
    let isError = false
    try {
      lines = formatReply(replyValues(await executeSql(cmd)))
    } catch (e) {
      isError = true
      const msg = String(e).replace(/^Error:\s*/, '')
      lines = [`(error) ${msg}`]
      if (/WRONGTYPE/i.test(msg)) {
        const hint = await wrongTypeHint(cmd)
        if (hint) lines.push(hint)
      }
    }
    scrollback = scrollback.map((e, k) => (k === idx ? { cmd: e.cmd, lines, isError, pending: false } : e))
    await scrollConsoleToBottom()
    // A mutating command may have changed the keyspace / current value - refresh.
    const verb = cmd.split(/\s+/)[0]?.toLowerCase() ?? ''
    if (WRITE_VERBS.has(verb)) {
      void loadKeys()
      void loadInfo()
      if (selectedKey) void loadValue(selectedKey)
    }
  }

  async function scrollConsoleToBottom() {
    await tick()
    if (scrollbackEl) scrollbackEl.scrollTop = scrollbackEl.scrollHeight
  }

  /** @param {KeyboardEvent} e */
  function onConsoleKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void runCommand()
    } else if (e.key === 'ArrowUp') {
      if (history.length === 0) return
      e.preventDefault()
      historyIdx = Math.max(0, historyIdx - 1)
      consoleInput = history[historyIdx] ?? ''
    } else if (e.key === 'ArrowDown') {
      if (history.length === 0) return
      e.preventDefault()
      historyIdx = Math.min(history.length, historyIdx + 1)
      consoleInput = history[historyIdx] ?? ''
    }
  }

  const totalKeys = $derived(keys.length)
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
  <!-- ── Server overview strip ─────────────────────────────────────────────── -->
  {#if stats}
    <div class="flex h-8 shrink-0 items-center gap-3 overflow-x-auto border-b border-border px-3 text-ui-2xs text-muted-foreground">
      <span class="flex shrink-0 items-center gap-1.5 font-medium text-foreground/80">
        <Server class="size-3.5 shrink-0 text-muted-foreground" />
        Redis {stats.version}
      </span>
      {#if stats.mode && stats.mode !== 'standalone'}
        <span class="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 font-mono uppercase tracking-wide">{stats.mode}</span>
      {/if}
      <span class="shrink-0 tabular-nums">
        <KeyRound class="mr-1 inline size-3 shrink-0 align-[-2px] text-muted-foreground/70" />{totalKeys} keys
      </span>
      {#if stats.memory}
        <span class="shrink-0 font-mono tabular-nums" title={stats.memoryPeak ? `peak ${stats.memoryPeak}` : undefined}>
          <HardDrive class="mr-1 inline size-3 shrink-0 align-[-2px] text-muted-foreground/70" />{stats.memory}
        </span>
      {/if}
      <span class="shrink-0 font-mono tabular-nums">
        <Users class="mr-1 inline size-3 shrink-0 align-[-2px] text-muted-foreground/70" />{stats.clients}
      </span>
      <span class="shrink-0 font-mono tabular-nums">
        <Activity class="mr-1 inline size-3 shrink-0 align-[-2px] text-muted-foreground/70" />{stats.ops}/s
      </span>
      {#if stats.hitRate != null}
        <span class="shrink-0 font-mono tabular-nums" title="Keyspace hit rate">
          <Gauge class="mr-1 inline size-3 shrink-0 align-[-2px] text-muted-foreground/70" />{stats.hitRate}%
        </span>
      {/if}
      {#if stats.uptime}
        <span class="hidden shrink-0 font-mono tabular-nums sm:inline">up {humanDuration(stats.uptime)}</span>
      {/if}
      <button
        type="button"
        class={cn(iconBtn, 'ml-auto size-6 shrink-0')}
        title="Refresh server info"
        aria-label="Refresh server info"
        onclick={() => void loadInfo()}
      >
        <RefreshCw class={cn('size-3.5', infoLoading && 'animate-spin')} />
      </button>
    </div>
  {/if}

  <div class="flex min-h-0 flex-1 overflow-hidden">
    <!-- ── Key list ─────────────────────────────────────────────────────── -->
    <div class="flex shrink-0 flex-col border-r border-border bg-panel" style:width="{keysWidth}px">
      <!-- Header -->
      <div class="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3">
        <KeyRound class="size-4 shrink-0 text-muted-foreground" />
        <span class="text-ui-sm font-medium text-foreground">Keys</span>
        <span class="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-ui-2xs tabular-nums text-muted-foreground">
          {#if keysLoading}…{:else}{totalKeys}{/if}
        </span>
        <FieldSelect
          size="sm"
          class="h-6 shrink-0 bg-input/30 px-1 text-ui-2xs"
          value={String(currentDb)}
          disabled={switchingDb}
          onchange={(v) => void switchDb(Number(v))}
          title="Switch logical database"
          aria-label="Logical database"
          options={DB_OPTIONS.map((n) => ({ value: String(n), label: `db ${n}` }))}
        />
        <button
          type="button"
          class={cn(iconBtn, 'ml-auto size-7', newKeyOpen && 'bg-accent text-foreground')}
          title="New key"
          aria-label="New key"
          onclick={() => {
            newKeyOpen = !newKeyOpen
            if (!newKeyOpen) resetNewKey()
          }}
        >
          <Plus class="size-3.5" />
        </button>
        <button
          type="button"
          class={cn(iconBtn, 'size-7')}
          title="Refresh keys"
          aria-label="Refresh keys"
          onclick={() => void loadKeys()}
        >
          <RefreshCw class={cn('size-3.5', keysLoading && 'animate-spin')} />
        </button>
      </div>

      <!-- New key form -->
      {#if newKeyOpen}
        <div class="shrink-0 space-y-2 border-b border-border bg-muted/20 p-2.5">
          <input
            type="text"
            bind:value={nkName}
            placeholder="key name (e.g. user:1)"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            class="h-7 w-full rounded-lg border-2 border-border bg-input/30 px-2 font-mono text-ui-sm text-foreground placeholder:text-muted-foreground/45 outline-none transition-colors focus:border-ring/55 focus:ring-2 focus:ring-ring/15"
          />
          <div class="flex flex-wrap gap-1">
            {#each CREATABLE as t (t)}
              {@const m = TYPE_META[t]}
              {@const Glyph = m.icon}
              <button
                type="button"
                class={cn(
                  'inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-ui-2xs font-medium transition-colors',
                  nkType === t
                    ? 'border-border bg-accent text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
                onclick={() => (nkType = t)}
              >
                <Glyph class={cn('size-3 shrink-0', nkType === t ? m.color : '')} />{m.label}
              </button>
            {/each}
          </div>
          {#if nkType === 'hash'}
            <input
              type="text"
              bind:value={nkField}
              placeholder="field"
              spellcheck="false"
              autocomplete="off"
              class="h-7 w-full rounded-lg border-2 border-border bg-input/30 px-2 font-mono text-ui-sm text-foreground placeholder:text-muted-foreground/45 outline-none transition-colors focus:border-ring/55 focus:ring-2 focus:ring-ring/15"
            />
          {:else if nkType === 'zset'}
            <input
              type="text"
              bind:value={nkScore}
              placeholder="score (e.g. 1)"
              spellcheck="false"
              autocomplete="off"
              class="h-7 w-full rounded-lg border-2 border-border bg-input/30 px-2 font-mono text-ui-sm text-foreground placeholder:text-muted-foreground/45 outline-none transition-colors focus:border-ring/55 focus:ring-2 focus:ring-ring/15"
            />
          {/if}
          <input
            type="text"
            bind:value={nkValue}
            placeholder={nkType === 'hash' || nkType === 'zset' ? 'value' : nkType === 'list' || nkType === 'set' ? 'first element' : 'value'}
            spellcheck="false"
            autocomplete="off"
            onkeydown={(e) => e.key === 'Enter' && void createKey()}
            class="h-7 w-full rounded-lg border-2 border-border bg-input/30 px-2 font-mono text-ui-sm text-foreground placeholder:text-muted-foreground/45 outline-none transition-colors focus:border-ring/55 focus:ring-2 focus:ring-ring/15"
          />
          {#if newKeyError}
            <p class="font-mono text-ui-3xs text-destructive">{newKeyError}</p>
          {/if}
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2 text-ui-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              disabled={!nkName.trim() || creatingKey}
              onclick={() => void createKey()}
            >
              {creatingKey ? 'Creating…' : 'Create key'}
            </button>
            <button
              type="button"
              class="inline-flex h-7 items-center rounded-md px-2 text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onclick={() => {
                newKeyOpen = false
                resetNewKey()
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      {/if}

      <!-- Filter -->
      <div class="shrink-0 border-b border-border/50 p-2">
        <div class="relative flex h-7 items-center">
          <Search class="pointer-events-none absolute left-2 size-3.5 shrink-0 text-muted-foreground/50" />
          <input
            type="text"
            bind:value={filter}
            placeholder="Filter keys…"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            class="h-7 w-full rounded-lg border-2 border-border bg-input/30 pl-7 pr-7 text-ui-sm text-foreground placeholder:text-muted-foreground/45 outline-none transition-colors focus:border-ring/55 focus:ring-2 focus:ring-ring/15"
          />
          {#if filter}
            <button
              type="button"
              class="absolute right-1 inline-flex size-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted/70 hover:text-foreground"
              aria-label="Clear filter"
              onclick={() => (filter = '')}
            >
              <X class="size-3.5" />
            </button>
          {/if}
        </div>
        {#if (filter.trim() && !keysLoading) || typesTruncated}
          <p class="mt-1.5 px-0.5 font-mono text-ui-3xs text-muted-foreground/60">
            {#if filter.trim() && !keysLoading}{filteredKeys.length} of {totalKeys} match{/if}
            {#if typesTruncated}{filter.trim() && !keysLoading ? ' · ' : ''}types shown for first {TYPE_CAP}{/if}
          </p>
        {/if}
      </div>

      <!-- Groups -->
      <div class="app-scroll min-h-0 flex-1 overflow-auto py-1">
        {#if keysError}
          <div class="px-3 py-8 text-center">
            <p class="font-mono text-ui-xs text-destructive">{keysError}</p>
            <button
              type="button"
              class="mt-2 font-mono text-ui-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onclick={() => void loadKeys()}>Retry</button
            >
          </div>
        {:else if !keysLoading && filteredKeys.length === 0}
          <div class="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
            <KeyRound class="size-10 text-muted-foreground/20" />
            <p class="text-ui-xs text-muted-foreground">
              {filter.trim() ? 'No matching keys' : 'No keys in this database'}
            </p>
          </div>
        {:else}
          {#each groups as group (group.name)}
            {@const isCollapsed = collapsed.has(group.name)}
            <div>
              <button
                type="button"
                class="flex w-full items-center gap-1.5 px-2 py-1 text-left transition-colors hover:bg-accent/50"
                onclick={() => toggleGroup(group.name)}
              >
                <ChevronRight class={cn('size-3.5 shrink-0 text-muted-foreground/45 transition-transform', !isCollapsed && 'rotate-90')} />
                <span class="min-w-0 flex-1 truncate font-mono text-ui-xs font-medium text-muted-foreground">{group.name}</span>
                <span class="shrink-0 font-mono text-ui-3xs tabular-nums text-muted-foreground/45">{group.items.length}</span>
              </button>
              {#if !isCollapsed}
                {#each group.items as key (key)}
                  {@const meta = TYPE_META[typeMap.get(key) ?? '']}
                  <!-- content-visibility keeps huge keyspaces (up to 100k rows) cheap
                       to paint - offscreen rows skip layout entirely. -->
                  <button
                    type="button"
                    class={cn(
                      'group/key flex w-full items-center gap-2 py-1 pl-7 pr-2 text-left transition-colors',
                      '[contain-intrinsic-size:auto_26px] [content-visibility:auto]',
                      selectedKey === key
                        ? 'bg-accent text-foreground'
                        : 'text-foreground/80 hover:bg-accent/50',
                    )}
                    onclick={() => void selectKey(key)}
                    title={key}
                  >
                    {#if meta}
                      {@const Glyph = meta.icon}
                      <Glyph class={cn('size-3.5 shrink-0', meta.color)} />
                    {:else}
                      <span class="flex size-3.5 shrink-0 items-center justify-center">
                        <span class={cn('size-1.5 rounded-full bg-muted-foreground/30', typesLoading && 'animate-pulse')}></span>
                      </span>
                    {/if}
                    <span class="min-w-0 flex-1 truncate font-mono text-ui-xs">{key}</span>
                    {#if meta}
                      <span class={cn('shrink-0 font-mono text-ui-3xs font-medium tracking-wide opacity-0 transition-opacity group-hover/key:opacity-60', selectedKey === key && 'opacity-60')}>{meta.short}</span>
                    {/if}
                  </button>
                {/each}
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <ResizeHandle
      axis="x"
      edge="end"
      onresizestart={() => (resizeStartWidth = keysWidth)}
      onresize={(dx) => (keysWidth = clampKeysWidth(resizeStartWidth + dx))}
      onresizeend={() => {
        resizeStartWidth = keysWidth
        try {
          localStorage.setItem(KEYS_WIDTH_KEY, String(keysWidth))
        } catch {}
      }}
    />

    <!-- ── Value panel ──────────────────────────────────────────────────── -->
    <div class="flex min-w-0 flex-1 flex-col overflow-hidden bg-panel">
      {#if !selectedKey}
        <div class="flex h-full flex-col items-center justify-center gap-3 text-center">
          <Database class="size-10 text-muted-foreground/20" />
          <p class="text-ui-sm text-muted-foreground">Select a key to inspect</p>
        </div>
      {:else}
        <!-- Header -->
        <div class="flex h-9 shrink-0 items-center gap-2 border-b border-border/60 bg-panel px-3">
          {#if selectedType && TYPE_META[selectedType]}
            {@const Glyph = TYPE_META[selectedType].icon}
            <Glyph class={cn('size-4 shrink-0', TYPE_META[selectedType].color)} />
          {:else}
            <KeyRound class="size-4 shrink-0 text-muted-foreground/50" />
          {/if}
          <span class="min-w-0 flex-1 truncate font-mono text-ui-sm font-medium text-foreground" title={selectedKey}>{selectedKey}</span>

          <button
            type="button"
            class={cn(iconBtn, 'size-7')}
            title="Copy key name"
            aria-label="Copy key name"
            onclick={() => selectedKey && copyText(selectedKey, 'key')}
          >
            {#if copiedId === 'key'}
              <Check class="size-3.5 text-success" />
            {:else}
              <Copy class="size-3.5" />
            {/if}
          </button>

          <button
            type="button"
            class={cn(iconBtn, 'size-7')}
            title="Reload value"
            aria-label="Reload value"
            onclick={() => selectedKey && void loadValue(selectedKey)}
          >
            <RefreshCw class={cn('size-3.5', valueLoading && 'animate-spin')} />
          </button>

          {#if confirmingDelete}
            <div class="flex shrink-0 items-center gap-1">
              <button
                type="button"
                class="inline-flex h-6 items-center gap-1 rounded-md bg-destructive px-2 text-ui-2xs font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                disabled={deleting}
                onclick={() => void deleteSelectedKey()}
              >
                <Trash2 class="size-3 shrink-0" />{deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button
                type="button"
                class="inline-flex h-6 items-center rounded-md px-2 text-ui-2xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onclick={() => (confirmingDelete = false)}
              >
                Cancel
              </button>
            </div>
          {:else}
            <button
              type="button"
              class={cn(iconBtn, 'size-7 hover:bg-destructive/10 hover:text-destructive')}
              title={$readOnlyMode ? READ_ONLY_HINT : 'Delete key'}
              aria-label="Delete key"
              disabled={$readOnlyMode}
              onclick={() => (confirmingDelete = true)}
            >
              <Trash2 class="size-3.5" />
            </button>
          {/if}
        </div>

        <!-- Metadata row -->
        <div class="flex h-7 shrink-0 items-center gap-x-3 gap-y-0 overflow-x-auto border-b border-border/50 px-3 font-mono text-ui-2xs text-muted-foreground">
          {#if selectedType}
            <span class={cn('shrink-0 font-semibold uppercase tracking-wide', TYPE_META[selectedType]?.color ?? 'text-muted-foreground')}>{selectedType}</span>
          {/if}
          {#if sizeLabel}
            <span class="shrink-0 tabular-nums">{sizeLabel}</span>
          {/if}
          {#if valueCapped}
            <span class="shrink-0 rounded bg-warning/10 px-1 text-warning" title="Large value, showing the first {VALUE_CAP} entries">first {VALUE_CAP}</span>
          {/if}
          {#if keyMemory != null}
            <span class="shrink-0 tabular-nums" title="Memory used by this key">
              <HardDrive class="mr-1 inline size-3 shrink-0 align-[-2px] text-muted-foreground/60" />{humanBytes(keyMemory)}
            </span>
          {/if}
          {#if keyEncoding}
            <span class="shrink-0" title="Internal encoding">{keyEncoding}</span>
          {/if}

          <!-- TTL (editable) -->
          <div class="ml-auto flex shrink-0 items-center">
            {#if editingTtl}
              <div class="flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  bind:value={ttlInput}
                  placeholder="seconds"
                  onkeydown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void applyTtl(false) }
                    else if (e.key === 'Escape') editingTtl = false
                  }}
                  class="h-6 w-24 rounded-lg border-2 border-border bg-input/30 px-1.5 text-ui-2xs tabular-nums text-foreground placeholder:text-muted-foreground/45 outline-none focus:border-ring/55 focus:ring-2 focus:ring-ring/15"
                />
                <button
                  type="button"
                  class="inline-flex h-6 items-center rounded-md bg-primary px-1.5 text-ui-2xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  disabled={savingTtl || !ttlInput}
                  onclick={() => void applyTtl(false)}
                >
                  Set
                </button>
                {#if hasExpiry}
                  <button
                    type="button"
                    class={cn(iconBtn, 'h-6 px-1.5 text-ui-2xs')}
                    disabled={savingTtl}
                    onclick={() => void applyTtl(true)}
                  >
                    Persist
                  </button>
                {/if}
                <button
                  type="button"
                  class={cn(iconBtn, 'size-6')}
                  aria-label="Cancel"
                  onclick={() => (editingTtl = false)}
                >
                  <X class="size-3.5" />
                </button>
              </div>
            {:else}
              <button
                type="button"
                class={cn(
                  'group/ttl inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-accent',
                  hasExpiry ? 'text-warning' : 'text-muted-foreground',
                )}
                title={$readOnlyMode ? READ_ONLY_HINT : 'Edit TTL'}
                disabled={$readOnlyMode}
                onclick={openTtlEditor}
              >
                <Timer class="size-3 shrink-0" />
                <span class="tabular-nums">{ttlLabel || 'no expiry'}</span>
                <Pencil class="size-2.5 shrink-0 opacity-0 transition-opacity group-hover/ttl:opacity-70" />
              </button>
            {/if}
          </div>
        </div>

        <!-- Body -->
        <div class="min-h-0 flex-1 overflow-hidden">
          {#if valueLoading}
            <div class="flex h-full items-center justify-center gap-2 text-muted-foreground">
              <RefreshCw class="size-4 animate-spin" /><span class="text-ui-sm">Loading…</span>
            </div>
          {:else if valueError}
            <div class="p-3">
              <p class="font-mono text-ui-xs text-destructive">{valueError}</p>
            </div>
          {:else if valueData?.kind === 'string'}
            <div class="flex h-full flex-col p-3">
              <div class="mb-2 flex shrink-0 items-center gap-2">
                {#if stringJson !== null}
                  <div class="inline-flex overflow-hidden rounded-md border border-border">
                    <button
                      type="button"
                      class={cn('h-6 px-2 text-ui-2xs font-medium transition-colors', jsonView ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}
                      onclick={() => (jsonView = true)}
                    >JSON</button>
                    <button
                      type="button"
                      class={cn('h-6 border-l border-border px-2 text-ui-2xs font-medium transition-colors', !jsonView ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}
                      onclick={() => (jsonView = false)}
                    >Raw</button>
                  </div>
                  <span class="font-mono text-ui-3xs text-muted-foreground/50">valid JSON</span>
                {/if}
                {#if !editingString}
                  <button
                    type="button"
                    class={cn(iconBtn, 'ml-auto h-6 gap-1 px-2 text-ui-2xs')}
                    title={$readOnlyMode ? READ_ONLY_HINT : 'Edit value'}
                    disabled={$readOnlyMode}
                    onclick={startStringEdit}
                  >
                    <Pencil class="size-3" />Edit
                  </button>
                {/if}
                <button
                  type="button"
                  class={cn(iconBtn, 'h-6 gap-1 px-2 text-ui-2xs', editingString && 'ml-auto')}
                  title="Copy value"
                  onclick={() => copyText(valueData.value, 'val')}
                >
                  {#if copiedId === 'val'}
                    <Check class="size-3 text-success" />Copied
                  {:else}
                    <Copy class="size-3" />Copy
                  {/if}
                </button>
              </div>
              {#if editingString}
                <textarea
                  bind:value={stringEdit}
                  spellcheck="false"
                  class="no-focus-ring app-scroll min-h-0 flex-1 resize-none rounded-lg border-2 border-border bg-input/30 p-3 font-mono text-ui-sm leading-relaxed text-foreground outline-none focus:border-ring/55 focus:ring-2 focus:ring-ring/15"
                ></textarea>
                <div class="mt-2 flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    class="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-ui-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                    disabled={savingValue}
                    onclick={() => void saveString()}
                  >{savingValue ? 'Saving…' : 'Save'}</button>
                  <button
                    type="button"
                    class="inline-flex h-7 items-center rounded-md px-2.5 text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onclick={() => (editingString = false)}
                  >Cancel</button>
                </div>
              {:else}
                <pre class="app-scroll min-h-0 flex-1 select-text overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-md border border-border/50 bg-background/50 p-3 font-mono text-ui-sm leading-relaxed text-foreground/90">{stringDisplay}</pre>
              {/if}
            </div>
          {:else if valueData?.kind === 'hash' || valueData?.kind === 'zset'}
            {@const isZset = valueData.kind === 'zset'}
            <div class="app-scroll h-full overflow-auto">
              <table class="w-full border-collapse text-ui-sm">
                <thead>
                  <tr class="sticky top-0 z-10 bg-panel">
                    <th class="border-b border-border/50 px-3 py-1.5 text-left font-mono text-ui-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">{isZset ? 'member' : 'field'}</th>
                    <th class="border-b border-border/50 px-3 py-1.5 text-left font-mono text-ui-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">{isZset ? 'score' : 'value'}</th>
                    <th class="w-16 border-b border-border/50"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each valueData.pairs as pair, i (i)}
                    <tr class="group/row border-b border-border/50 last:border-0 hover:bg-accent/40">
                      <td class="max-w-[20rem] truncate px-3 py-1.5 align-top font-mono font-medium text-foreground" title={pair[0]}>{pair[0]}</td>
                      <td class={cn('px-3 py-1.5 align-top font-mono [overflow-wrap:anywhere] text-foreground/80', isZset && 'tabular-nums')} title={pair[1]}>{pair[1]}</td>
                      <td class="w-16 px-1 align-top">
                        <div class="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            class={cn(iconBtn, 'size-6 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100')}
                            title={isZset ? 'Copy member' : 'Copy value'}
                            aria-label="Copy"
                            onclick={() => copyText(isZset ? pair[0] : pair[1], `row-${i}`)}
                          >
                            {#if copiedId === `row-${i}`}<Check class="size-3 text-success" />{:else}<Copy class="size-3" />{/if}
                          </button>
                          <button
                            type="button"
                            class={cn(iconBtn, 'size-6 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 hover:bg-destructive/10 hover:text-destructive')}
                            title={isZset ? 'Remove member' : 'Remove field'}
                            aria-label="Remove"
                            disabled={rowBusy === pair[0]}
                            onclick={() => void deleteEntry(valueData.kind, pair[0])}
                          >
                            <Trash2 class="size-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else if valueData?.kind === 'list' || valueData?.kind === 'set'}
            {@const isList = valueData.kind === 'list'}
            <div class="app-scroll h-full overflow-auto">
              <table class="w-full border-collapse text-ui-sm">
                <thead>
                  <tr class="sticky top-0 z-10 bg-panel">
                    {#if isList}
                      <th class="w-14 border-b border-border/50 px-3 py-1.5 text-right font-mono text-ui-2xs font-semibold uppercase tracking-wide text-muted-foreground/60">#</th>
                    {/if}
                    <th class="border-b border-border/50 px-3 py-1.5 text-left font-mono text-ui-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">{isList ? 'value' : 'member'}</th>
                    <th class="w-16 border-b border-border/50"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each valueData.items as item, i (i)}
                    <tr class="group/row border-b border-border/50 last:border-0 hover:bg-accent/40">
                      {#if isList}
                        <td class="w-14 px-3 py-1.5 text-right align-top font-mono text-ui-xs tabular-nums text-muted-foreground/45">{i}</td>
                      {/if}
                      <td class="px-3 py-1.5 align-top font-mono [overflow-wrap:anywhere] text-foreground/85" title={item}>{item}</td>
                      <td class="w-16 px-1 align-top">
                        <div class="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            class={cn(iconBtn, 'size-6 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100')}
                            title="Copy value"
                            aria-label="Copy value"
                            onclick={() => copyText(item, `row-${i}`)}
                          >
                            {#if copiedId === `row-${i}`}<Check class="size-3 text-success" />{:else}<Copy class="size-3" />{/if}
                          </button>
                          <button
                            type="button"
                            class={cn(iconBtn, 'size-6 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 hover:bg-destructive/10 hover:text-destructive')}
                            title={isList ? 'Remove first occurrence' : 'Remove member'}
                            aria-label="Remove"
                            disabled={rowBusy === item}
                            onclick={() => void deleteEntry(valueData.kind, item)}
                          >
                            <Trash2 class="size-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else if valueData?.kind === 'stream'}
            <div class="app-scroll h-full overflow-auto">
              <table class="w-full border-collapse text-ui-sm">
                <thead>
                  <tr class="sticky top-0 z-10 bg-panel">
                    <th class="w-14 border-b border-border/50 px-3 py-1.5 text-right font-mono text-ui-2xs font-semibold uppercase tracking-wide text-muted-foreground/60">#</th>
                    <th class="border-b border-border/50 px-3 py-1.5 text-left font-mono text-ui-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">entry (id · fields)</th>
                    <th class="w-9 border-b border-border/50"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each valueData.entries as entry, i (i)}
                    <tr class="group/row border-b border-border/50 last:border-0 hover:bg-accent/40">
                      <td class="w-14 px-3 py-1.5 text-right align-top font-mono text-ui-xs tabular-nums text-muted-foreground/45">{i + 1}</td>
                      <td class="px-3 py-1.5 align-top font-mono [overflow-wrap:anywhere] text-foreground/85" title={entry}>{entry}</td>
                      <td class="w-9 px-1 align-top">
                        <button type="button" class={cn(iconBtn, 'size-6 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100')} title="Copy entry" aria-label="Copy entry" onclick={() => copyText(entry, `row-${i}`)}>
                          {#if copiedId === `row-${i}`}<Check class="size-3 text-success" />{:else}<Copy class="size-3" />{/if}
                        </button>
                      </td>
                    </tr>
                  {/each}
                  {#if valueData.entries.length === 0}
                    <tr><td colspan="3" class="px-3 py-6 text-center text-ui-xs text-muted-foreground/50">Empty stream</td></tr>
                  {/if}
                </tbody>
              </table>
            </div>
          {:else if valueData?.kind === 'other'}
            <div class="p-3">
              <p class="text-ui-sm text-muted-foreground">
                Preview for <span class="font-mono text-foreground/80">{valueData.type}</span> values isn't supported yet, use the console below.
              </p>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- ── Command console ────────────────────────────────────────────────── -->
  <div class={cn('flex shrink-0 flex-col border-t border-border bg-panel', consoleOpen && 'h-[200px]')}>
    <div class="flex h-8 shrink-0 items-center gap-1.5 border-b border-border/50 px-3">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        onclick={() => (consoleOpen = !consoleOpen)}
      >
        <TerminalIcon class="size-3.5 shrink-0 text-muted-foreground/70" />
        <span class="text-ui-xs font-medium text-foreground/80">Console</span>
        <span class="font-mono text-ui-3xs text-muted-foreground/45">redis-cli</span>
      </button>
      {#if consoleOpen && scrollback.length > 0}
        <button
          type="button"
          class={cn(iconBtn, 'size-6')}
          title="Clear console"
          aria-label="Clear console"
          onclick={() => (scrollback = [])}
        >
          <Eraser class="size-3.5" />
        </button>
      {/if}
      <button
        type="button"
        class={cn(iconBtn, 'size-6')}
        aria-label={consoleOpen ? 'Collapse console' : 'Expand console'}
        onclick={() => (consoleOpen = !consoleOpen)}
      >
        <ChevronRight class={cn('size-3.5 transition-transform', consoleOpen ? '-rotate-90' : 'rotate-90')} />
      </button>
    </div>

    {#if consoleOpen}
      <div bind:this={scrollbackEl} class="app-scroll min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-ui-xs leading-relaxed" data-studio-selectable="text">
        {#if scrollback.length === 0}
          <div class="space-y-1 text-muted-foreground/50">
            <p>
              Type a Redis command and press
              <span class="rounded bg-muted/60 px-1 py-0.5 text-foreground/70">Enter</span>, e.g.
              <span class="text-foreground/70">KEYS *</span>,
              <span class="text-foreground/70">GET app:name</span>,
              <span class="text-foreground/70">HGETALL user:1</span>
            </p>
            <p>
              <span class="text-foreground/70">clear</span> resets the console · <span class="text-foreground/70">↑</span>/<span class="text-foreground/70">↓</span> browse history
            </p>
          </div>
        {:else}
          {#each scrollback as entry, i (i)}
            <div class="mb-1.5">
              <div class="flex items-start gap-1.5">
                <span class="shrink-0 select-none text-muted-foreground/40">&gt;</span>
                <span class="min-w-0 flex-1 [overflow-wrap:anywhere] text-foreground/90">{entry.cmd}</span>
              </div>
              {#if entry.pending}
                <div class="pl-3.5 text-muted-foreground/40">…</div>
              {:else}
                {#each entry.lines as line, j (j)}
                  <div class={cn('select-text whitespace-pre-wrap [overflow-wrap:anywhere] pl-3.5', entry.isError ? 'text-destructive' : 'text-muted-foreground')}>{line}</div>
                {/each}
              {/if}
            </div>
          {/each}
        {/if}
      </div>

      <div class="flex h-9 shrink-0 items-center gap-1.5 border-t border-border/50 bg-background/40 px-3">
        <span class="shrink-0 select-none font-mono text-ui-sm text-muted-foreground/50">&gt;</span>
        <input
          type="text"
          bind:value={consoleInput}
          onkeydown={onConsoleKeydown}
          placeholder="Enter Redis command…"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          class="h-7 min-w-0 flex-1 bg-transparent font-mono text-ui-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
        />
        <button
          type="button"
          class={cn(iconBtn, 'size-6')}
          disabled={!consoleInput.trim()}
          title="Run command (Enter)"
          aria-label="Run command"
          onclick={() => void runCommand()}
        >
          <CornerDownLeft class="size-3.5" />
        </button>
      </div>
    {/if}
  </div>
</div>
