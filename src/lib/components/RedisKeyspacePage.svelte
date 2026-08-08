<script>
  import { executeSql } from '$lib/api.js'
  import { engineFamily } from '$lib/stores/connections.js'
  import { cn } from '$lib/utils.js'
  import { tick } from 'svelte'
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
  import Clock from '@lucide/svelte/icons/clock'
  import Eraser from '@lucide/svelte/icons/eraser'
  import Type from '@lucide/svelte/icons/type'
  import Hash from '@lucide/svelte/icons/hash'
  import List from '@lucide/svelte/icons/list'
  import Braces from '@lucide/svelte/icons/braces'
  import ListOrdered from '@lucide/svelte/icons/list-ordered'
  import Radio from '@lucide/svelte/icons/radio'

  /** @type {{ active?: boolean, connection?: import('$lib/stores/connections.js').SavedConnection | null }} */
  let { active = false, connection = null } = $props()

  const isRedisConn = $derived(engineFamily(connection?.type) === 'redis')

  // ── Type styling ────────────────────────────────────────────────────────────
  // Per Redis value type: a lucide glyph + accent color for the tree, and a
  // faint pill fill for the value-panel badge. Type colors are a deliberate,
  // semantic exception to the token palette (like syntax highlighting).
  /**
   * @typedef {{ short: string, label: string, icon: any, color: string, pill: string }} TypeMeta
   * @type {Record<string, TypeMeta>}
   */
  const TYPE_META = {
    string: { short: 'STR',    label: 'string', icon: Type,        color: 'text-blue-500 dark:text-blue-400',     pill: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    hash:   { short: 'HASH',   label: 'hash',   icon: Hash,        color: 'text-violet-500 dark:text-violet-400', pill: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
    list:   { short: 'LIST',   label: 'list',   icon: List,        color: 'text-amber-500 dark:text-amber-400',   pill: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
    set:    { short: 'SET',    label: 'set',    icon: Braces,      color: 'text-emerald-500 dark:text-emerald-400', pill: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    zset:   { short: 'ZSET',   label: 'zset',   icon: ListOrdered, color: 'text-pink-500 dark:text-pink-400',     pill: 'bg-pink-500/10 text-pink-600 dark:text-pink-400' },
    stream: { short: 'STREAM', label: 'stream', icon: Radio,       color: 'text-cyan-500 dark:text-cyan-400',     pill: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' },
  }

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

  async function loadKeys() {
    if (!active || !isRedisConn) return
    keysLoading = true
    keysError = ''
    try {
      const res = await executeSql('KEYS *')
      keys = replyValues(res).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    } catch (e) {
      keysError = String(e)
      keys = []
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
      const entries = await Promise.all(
        subset.map(async (k) => {
          try {
            const t = String(replyValues(await executeSql(`TYPE ${quoteArg(k)}`))[0] ?? '')
            return /** @type {[string, string]} */ ([k, t])
          } catch {
            return /** @type {[string, string]} */ ([k, ''])
          }
        }),
      )
      typeMap = new Map(entries)
    } finally {
      typesLoading = false
    }
  }

  // Load once per connection when this page first becomes active.
  $effect(() => {
    const cid = connection?.id ?? null
    if (!active || !isRedisConn) return
    if (loadedConnId === cid) return
    loadedConnId = cid
    selectedKey = null
    valueData = null
    valueError = ''
    typeMap = new Map()
    typesTruncated = false
    confirmingDelete = false
    void loadKeys()
  })

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
    jsonView = true
    const q = quoteArg(key)
    try {
      const t = String(replyValues(await executeSql(`TYPE ${q}`))[0] ?? '')
      selectedType = t
      try {
        const ttl = Number(replyValues(await executeSql(`TTL ${q}`))[0])
        selectedTtl = Number.isFinite(ttl) ? ttl : null
      } catch {
        selectedTtl = null
      }
      if (t === 'string') {
        const v = replyValues(await executeSql(`GET ${q}`))[0] ?? ''
        valueData = { kind: 'string', value: v }
      } else if (t === 'hash') {
        valueData = { kind: 'hash', pairs: toPairs(replyValues(await executeSql(`HGETALL ${q}`))) }
      } else if (t === 'list') {
        valueData = { kind: 'list', items: replyValues(await executeSql(`LRANGE ${q} 0 -1`)) }
      } else if (t === 'set') {
        valueData = { kind: 'set', items: replyValues(await executeSql(`SMEMBERS ${q}`)) }
      } else if (t === 'zset') {
        valueData = { kind: 'zset', pairs: toPairs(replyValues(await executeSql(`ZRANGE ${q} 0 -1 WITHSCORES`))) }
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
    } catch (e) {
      valueError = String(e)
    } finally {
      deleting = false
    }
  }

  // ── Copy feedback ─────────────────────────────────────────────────────────
  let copiedId = $state('')
  /** @type {ReturnType<typeof setTimeout> | null} */
  let copiedTimer = null
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

  /** Humanize a positive TTL into a compact "1d 2h" / "5m" label. */
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
    // Push a pending entry, then replace it IMMUTABLY once the reply lands —
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
      lines = [`(error) ${String(e).replace(/^Error:\s*/, '')}`]
    }
    scrollback = scrollback.map((e, k) => (k === idx ? { cmd: e.cmd, lines, isError, pending: false } : e))
    await scrollConsoleToBottom()
    // A mutating command may have changed the keyspace / current value — refresh.
    const verb = cmd.split(/\s+/)[0]?.toLowerCase() ?? ''
    if (WRITE_VERBS.has(verb)) {
      void loadKeys()
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
  <div class="flex min-h-0 flex-1 overflow-hidden">
    <!-- ── Key list ─────────────────────────────────────────────────────── -->
    <div class="flex w-[280px] shrink-0 flex-col border-r border-border bg-panel">
      <!-- Header -->
      <div class="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3">
        <KeyRound class="size-4 shrink-0 text-muted-foreground" />
        <span class="text-ui-sm font-medium text-foreground">Keys</span>
        <span class="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-ui-2xs tabular-nums text-muted-foreground">
          {#if keysLoading}…{:else}{totalKeys}{/if}
        </span>
        <button
          type="button"
          class={cn(iconBtn, 'ml-auto size-7')}
          title="Refresh keys"
          aria-label="Refresh keys"
          onclick={() => void loadKeys()}
        >
          <RefreshCw class={cn('size-3.5', keysLoading && 'animate-spin')} />
        </button>
      </div>

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
            class="h-7 w-full rounded-md border border-input bg-input/30 pl-7 pr-7 text-ui-sm text-foreground placeholder:text-muted-foreground/45 outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring"
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
                class="flex w-full items-center gap-1.5 px-2 py-1 text-left transition-colors hover:bg-muted/50"
                onclick={() => toggleGroup(group.name)}
              >
                <ChevronRight class={cn('size-3.5 shrink-0 text-muted-foreground/45 transition-transform', !isCollapsed && 'rotate-90')} />
                <span class="min-w-0 flex-1 truncate font-mono text-ui-xs font-medium text-foreground/70">{group.name}</span>
                <span class="shrink-0 font-mono text-ui-3xs tabular-nums text-muted-foreground/45">{group.items.length}</span>
              </button>
              {#if !isCollapsed}
                {#each group.items as key (key)}
                  {@const meta = TYPE_META[typeMap.get(key) ?? '']}
                  <button
                    type="button"
                    class={cn(
                      'group/key flex w-full items-center gap-2 py-1 pl-7 pr-2 text-left transition-colors',
                      selectedKey === key
                        ? 'bg-primary/10 text-foreground ring-1 ring-inset ring-primary/20'
                        : 'text-foreground/80 hover:bg-muted/50',
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
                    {#if selectedKey === key}
                      <Check class="size-3 shrink-0 text-primary" />
                    {/if}
                  </button>
                {/each}
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <!-- ── Value panel ──────────────────────────────────────────────────── -->
    <div class="flex min-w-0 flex-1 flex-col overflow-hidden bg-panel">
      {#if !selectedKey}
        <div class="flex h-full flex-col items-center justify-center gap-3 text-center">
          <Database class="size-10 text-muted-foreground/20" />
          <p class="text-ui-sm text-muted-foreground">Select a key to inspect</p>
        </div>
      {:else}
        <!-- Header -->
        <div class="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-panel px-3">
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
              <Check class="size-3.5 text-emerald-500" />
            {:else}
              <Copy class="size-3.5" />
            {/if}
          </button>

          {#if selectedType}
            <span class={cn('shrink-0 rounded px-1.5 py-0.5 font-mono text-ui-3xs font-semibold uppercase tracking-wide', TYPE_META[selectedType]?.pill ?? 'bg-muted/60 text-muted-foreground')}>
              {selectedType}
            </span>
          {/if}
          {#if sizeLabel}
            <span class="shrink-0 font-mono text-ui-2xs tabular-nums text-muted-foreground/70">{sizeLabel}</span>
          {/if}
          {#if ttlLabel}
            <span
              class={cn(
                'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-mono text-ui-2xs',
                hasExpiry ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-muted/60 text-muted-foreground',
              )}
              title="Time to live"
            >
              {#if hasExpiry}<Clock class="size-3 shrink-0" />{/if}{ttlLabel}
            </span>
          {/if}

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
              title="Delete key"
              aria-label="Delete key"
              onclick={() => (confirmingDelete = true)}
            >
              <Trash2 class="size-3.5" />
            </button>
          {/if}
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
                      class={cn('h-6 px-2 text-ui-2xs font-medium transition-colors', jsonView ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
                      onclick={() => (jsonView = true)}
                    >JSON</button>
                    <button
                      type="button"
                      class={cn('h-6 border-l border-border px-2 text-ui-2xs font-medium transition-colors', !jsonView ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
                      onclick={() => (jsonView = false)}
                    >Raw</button>
                  </div>
                  <span class="font-mono text-ui-3xs text-muted-foreground/50">valid JSON</span>
                {/if}
                <button
                  type="button"
                  class={cn(iconBtn, 'ml-auto h-6 gap-1 px-2 text-ui-2xs')}
                  title="Copy value"
                  onclick={() => copyText(valueData.value, 'val')}
                >
                  {#if copiedId === 'val'}
                    <Check class="size-3 text-emerald-500" />Copied
                  {:else}
                    <Copy class="size-3" />Copy
                  {/if}
                </button>
              </div>
              <pre class="app-scroll min-h-0 flex-1 select-text overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-md border border-border/50 bg-background/50 p-3 font-mono text-ui-sm leading-relaxed text-foreground/90">{stringDisplay}</pre>
            </div>
          {:else if valueData?.kind === 'hash' || valueData?.kind === 'zset'}
            {@const isZset = valueData.kind === 'zset'}
            <div class="app-scroll h-full overflow-auto">
              <table class="w-full border-collapse text-ui-sm">
                <thead>
                  <tr class="sticky top-0 z-10 bg-panel">
                    <th class="border-b border-border/50 px-3 py-1.5 text-left font-mono text-ui-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">{isZset ? 'member' : 'field'}</th>
                    <th class="border-b border-border/50 px-3 py-1.5 text-left font-mono text-ui-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">{isZset ? 'score' : 'value'}</th>
                    <th class="w-9 border-b border-border/50"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each valueData.pairs as pair, i (i)}
                    <tr class="group/row border-b border-border/50 last:border-0 hover:bg-muted/40">
                      <td class="max-w-[20rem] truncate px-3 py-1.5 align-top font-mono font-medium text-foreground" title={pair[0]}>{pair[0]}</td>
                      <td class={cn('px-3 py-1.5 align-top font-mono [overflow-wrap:anywhere] text-foreground/80', isZset && 'tabular-nums')} title={pair[1]}>{pair[1]}</td>
                      <td class="w-9 px-1 align-top">
                        <button
                          type="button"
                          class={cn(iconBtn, 'size-6 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100')}
                          title={isZset ? 'Copy member' : 'Copy value'}
                          aria-label="Copy"
                          onclick={() => copyText(isZset ? pair[0] : pair[1], `row-${i}`)}
                        >
                          {#if copiedId === `row-${i}`}<Check class="size-3 text-emerald-500" />{:else}<Copy class="size-3" />{/if}
                        </button>
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
                    <th class="w-9 border-b border-border/50"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each valueData.items as item, i (i)}
                    <tr class="group/row border-b border-border/50 last:border-0 hover:bg-muted/40">
                      {#if isList}
                        <td class="w-14 px-3 py-1.5 text-right align-top font-mono text-ui-xs tabular-nums text-muted-foreground/45">{i}</td>
                      {/if}
                      <td class="px-3 py-1.5 align-top font-mono [overflow-wrap:anywhere] text-foreground/85" title={item}>{item}</td>
                      <td class="w-9 px-1 align-top">
                        <button
                          type="button"
                          class={cn(iconBtn, 'size-6 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100')}
                          title="Copy value"
                          aria-label="Copy value"
                          onclick={() => copyText(item, `row-${i}`)}
                        >
                          {#if copiedId === `row-${i}`}<Check class="size-3 text-emerald-500" />{:else}<Copy class="size-3" />{/if}
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else if valueData?.kind === 'other'}
            <div class="p-3">
              <p class="text-ui-sm text-muted-foreground">
                Preview for <span class="font-mono text-foreground/80">{valueData.type}</span> values isn't supported yet — use the console below.
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
              <span class="rounded bg-muted/60 px-1 py-0.5 text-foreground/70">Enter</span> — e.g.
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
