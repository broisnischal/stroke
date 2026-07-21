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

  /** @type {{ active?: boolean, connection?: import('$lib/stores/connections.js').SavedConnection | null }} */
  let { active = false, connection = null } = $props()

  const isRedisConn = $derived(engineFamily(connection?.type) === 'redis')

  // ── Type styling ────────────────────────────────────────────────────────────
  /** Chip + dot colors per Redis value type. */
  const TYPE_STYLES = /** @type {Record<string, string>} */ ({
    string: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    hash: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
    list: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
    set: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
    zset: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
    stream: 'bg-cyan-500/12 text-cyan-600 dark:text-cyan-400',
  })

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

  async function loadKeys() {
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

  /** @param {string} key */
  async function selectKey(key) {
    selectedKey = key
    await loadValue(key)
  }

  /** @param {string} key */
  async function loadValue(key) {
    valueLoading = true
    valueError = ''
    valueData = null
    selectedType = ''
    selectedTtl = null
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

  /** Pretty-print a string value as JSON when it parses, otherwise return as-is. */
  function prettyValue(/** @type {string} */ v) {
    const t = v.trim()
    if (!t || (t[0] !== '{' && t[0] !== '[')) return v
    try {
      return JSON.stringify(JSON.parse(t), null, 2)
    } catch {
      return v
    }
  }

  const ttlLabel = $derived(
    selectedTtl == null
      ? ''
      : selectedTtl === -1
        ? 'no expiry'
        : selectedTtl === -2
          ? 'missing'
          : `${selectedTtl}s`,
  )

  // ── Command console ─────────────────────────────────────────────────────────
  let consoleOpen = $state(true)
  let consoleInput = $state('')
  /** @type {{ cmd: string, lines: string[], isError: boolean }[]} */
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

  async function runCommand() {
    const cmd = consoleInput.trim()
    if (!cmd) return
    history.push(cmd)
    historyIdx = history.length
    consoleInput = ''
    const entry = /** @type {{ cmd: string, lines: string[], isError: boolean }} */ ({
      cmd,
      lines: [],
      isError: false,
    })
    scrollback = [...scrollback, entry]
    await scrollConsoleToBottom()
    try {
      const values = replyValues(await executeSql(cmd))
      entry.lines = values.length ? values.map((v, i) => `${i + 1}) ${v}`) : ['(nil)']
    } catch (e) {
      entry.isError = true
      entry.lines = [String(e)]
    }
    scrollback = [...scrollback]
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
      <!-- Search + refresh -->
      <div class="flex shrink-0 items-center gap-1.5 border-b border-border/50 px-2 py-2">
        <div class="relative flex h-7 min-w-0 flex-1 items-center">
          <Search class="pointer-events-none absolute left-2.5 size-3.5 shrink-0 text-muted-foreground/50" />
          <input
            type="text"
            bind:value={filter}
            placeholder="Filter keys…"
            class="h-7 w-full rounded-md border border-transparent bg-accent/40 pl-8 pr-7 text-ui-sm text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-border focus:bg-input/30 focus:outline-none"
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
        <button
          type="button"
          class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground"
          title="Refresh keys"
          aria-label="Refresh keys"
          onclick={() => void loadKeys()}
        >
          <RefreshCw class={cn('size-3.5', keysLoading && 'animate-spin')} />
        </button>
      </div>

      <!-- Count strip -->
      <div class="flex shrink-0 items-center gap-1.5 border-b border-border/40 px-3 py-1.5">
        <KeyRound class="size-3 shrink-0 text-muted-foreground/40" />
        <span class="font-mono text-ui-2xs text-muted-foreground">
          {#if keysLoading}
            Loading…
          {:else if filter.trim()}
            {filteredKeys.length} of {totalKeys} keys
          {:else}
            {totalKeys} {totalKeys === 1 ? 'key' : 'keys'}
          {/if}
        </span>
      </div>

      <!-- Groups -->
      <div class="app-scroll min-h-0 flex-1 overflow-auto">
        {#if keysError}
          <div class="px-3 py-8 text-center">
            <p class="font-mono text-ui-xs text-destructive">{keysError}</p>
            <button
              type="button"
              class="mt-2 font-mono text-ui-xs text-muted-foreground underline"
              onclick={() => void loadKeys()}>Retry</button
            >
          </div>
        {:else if !keysLoading && filteredKeys.length === 0}
          <div class="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
            <KeyRound class="size-8 text-muted-foreground/20" />
            <p class="font-mono text-ui-xs text-muted-foreground">
              {filter.trim() ? 'No matching keys' : 'No keys in this database'}
            </p>
          </div>
        {:else}
          {#each groups as group (group.name)}
            {@const isCollapsed = collapsed.has(group.name)}
            <div class="border-b border-border/25">
              <button
                type="button"
                class="flex w-full items-center gap-1.5 px-2 py-1.5 text-left transition-colors hover:bg-accent/25"
                onclick={() => toggleGroup(group.name)}
              >
                <ChevronRight class={cn('size-3.5 shrink-0 text-muted-foreground/40 transition-transform', !isCollapsed && 'rotate-90')} />
                <span class="min-w-0 flex-1 truncate font-mono text-ui-xs font-medium text-foreground/80">{group.name}</span>
                <span class="shrink-0 font-mono text-ui-3xs tabular-nums text-muted-foreground/40">{group.items.length}</span>
              </button>
              {#if !isCollapsed}
                {#each group.items as key (key)}
                  <button
                    type="button"
                    class={cn(
                      'flex w-full items-center gap-2 py-1 pl-7 pr-2 text-left transition-colors',
                      selectedKey === key ? 'bg-accent/60 text-foreground' : 'text-foreground/75 hover:bg-accent/25',
                    )}
                    onclick={() => void selectKey(key)}
                    title={key}
                  >
                    <span class="size-1.5 shrink-0 rounded-full bg-muted-foreground/30"></span>
                    <span class="min-w-0 flex-1 truncate font-mono text-ui-xs">{key}</span>
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
          <p class="font-mono text-ui text-muted-foreground">Select a key</p>
        </div>
      {:else}
        <!-- Header -->
        <div class="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-panel px-3">
          <KeyRound class="size-3.5 shrink-0 text-muted-foreground/50" />
          <span class="min-w-0 flex-1 truncate font-mono text-ui-sm font-medium text-foreground" title={selectedKey}>{selectedKey}</span>
          {#if selectedType}
            <span class={cn('shrink-0 rounded px-1.5 py-0.5 font-mono text-ui-2xs font-medium uppercase tracking-wide', TYPE_STYLES[selectedType] ?? 'bg-muted/60 text-muted-foreground')}>
              {selectedType}
            </span>
          {/if}
          {#if ttlLabel}
            <span class="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-ui-2xs text-muted-foreground" title="Time to live">{ttlLabel}</span>
          {/if}
          <button
            type="button"
            class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground"
            title="Reload value"
            aria-label="Reload value"
            onclick={() => selectedKey && void loadValue(selectedKey)}
          >
            <RefreshCw class={cn('size-3.5', valueLoading && 'animate-spin')} />
          </button>
        </div>

        <!-- Body -->
        <div class="app-scroll min-h-0 flex-1 overflow-auto p-3">
          {#if valueLoading}
            <div class="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <RefreshCw class="size-4 animate-spin" /><span class="font-mono text-ui-sm">Loading…</span>
            </div>
          {:else if valueError}
            <p class="font-mono text-ui-xs text-destructive">{valueError}</p>
          {:else if valueData?.kind === 'string'}
            <pre class="select-text whitespace-pre-wrap [overflow-wrap:anywhere] rounded-md border border-border/50 bg-background/60 p-3 font-mono text-ui-xs leading-relaxed text-foreground/85">{prettyValue(valueData.value)}</pre>
          {:else if valueData?.kind === 'hash' || valueData?.kind === 'zset'}
            {@const isZset = valueData.kind === 'zset'}
            <table class="w-full text-ui-xs">
              <thead class="text-left">
                <tr class="border-b border-border/50">
                  <th class="px-3 py-1.5 font-mono font-normal text-muted-foreground">{isZset ? 'member' : 'field'}</th>
                  <th class="px-3 py-1.5 font-mono font-normal text-muted-foreground">{isZset ? 'score' : 'value'}</th>
                </tr>
              </thead>
              <tbody>
                {#each valueData.pairs as pair, i (i)}
                  <tr class="border-b border-border/30 hover:bg-accent/25">
                    <td class="max-w-[18rem] truncate px-3 py-1.5 font-mono font-medium text-foreground" title={pair[0]}>{pair[0]}</td>
                    <td class="px-3 py-1.5 font-mono text-foreground/80" class:tabular-nums={isZset} title={pair[1]}>{pair[1]}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else if valueData?.kind === 'list' || valueData?.kind === 'set'}
            {@const isList = valueData.kind === 'list'}
            <table class="w-full text-ui-xs">
              <thead class="text-left">
                <tr class="border-b border-border/50">
                  <th class="w-12 px-3 py-1.5 font-mono font-normal text-muted-foreground/50">{isList ? '#' : ''}</th>
                  <th class="px-3 py-1.5 font-mono font-normal text-muted-foreground">value</th>
                </tr>
              </thead>
              <tbody>
                {#each valueData.items as item, i (i)}
                  <tr class="border-b border-border/30 hover:bg-accent/25">
                    <td class="px-3 py-1.5 font-mono tabular-nums text-muted-foreground/40">{isList ? i : '•'}</td>
                    <td class="px-3 py-1.5 font-mono text-foreground/85" title={item}>{item}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else if valueData?.kind === 'other'}
            <p class="font-mono text-ui-xs text-muted-foreground">
              Preview for <span class="text-foreground/80">{valueData.type}</span> values isn't supported yet — use the console below.
            </p>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- ── Command console ────────────────────────────────────────────────── -->
  <div class={cn('flex shrink-0 flex-col border-t border-border bg-panel', consoleOpen && 'h-[200px]')}>
    <button
      type="button"
      class="flex h-8 shrink-0 items-center gap-1.5 border-b border-border/50 px-3 text-left transition-colors hover:bg-accent/20"
      onclick={() => (consoleOpen = !consoleOpen)}
    >
      <TerminalIcon class="size-3.5 shrink-0 text-muted-foreground/60" />
      <span class="text-ui-xs font-medium text-foreground/80">Console</span>
      <span class="font-mono text-ui-3xs text-muted-foreground/40">redis-cli</span>
      <ChevronRight class={cn('ml-auto size-3.5 shrink-0 text-muted-foreground/40 transition-transform', consoleOpen ? '-rotate-90' : 'rotate-90')} />
    </button>

    {#if consoleOpen}
      <div bind:this={scrollbackEl} class="app-scroll min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-ui-xs" data-studio-selectable="text">
        {#if scrollback.length === 0}
          <p class="text-muted-foreground/40">Type a Redis command and press Enter — e.g. <span class="text-foreground/70">KEYS *</span>, <span class="text-foreground/70">GET app:name</span>, <span class="text-foreground/70">HGETALL user:1</span></p>
        {:else}
          {#each scrollback as entry, i (i)}
            <div class="mb-1.5">
              <div class="flex items-start gap-1.5">
                <span class="shrink-0 select-none text-primary">&gt;</span>
                <span class="min-w-0 flex-1 [overflow-wrap:anywhere] text-foreground/90">{entry.cmd}</span>
              </div>
              {#each entry.lines as line, j (j)}
                <div class={cn('select-text whitespace-pre-wrap [overflow-wrap:anywhere] pl-3.5', entry.isError ? 'text-destructive' : 'text-muted-foreground')}>{line}</div>
              {/each}
            </div>
          {/each}
        {/if}
      </div>

      <div class="flex h-9 shrink-0 items-center gap-1.5 border-t border-border/50 px-3">
        <span class="shrink-0 select-none font-mono text-ui-sm text-primary">&gt;</span>
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
          class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-40"
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
