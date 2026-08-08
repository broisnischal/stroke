<script>
  import { onMount } from 'svelte'
  import { cn } from '$lib/utils.js'
  import EChartPanel from './EChartPanel.svelte'
  import SearchableMenu from './SearchableMenu.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { toast } from '$lib/components/ui/sonner/toast.svelte.js'
  import { readOnlyMode, READ_ONLY_HINT } from '$lib/stores/read-only.js'
  import { appThemeId } from '$lib/stores/settings.js'
  import { resolveCssColor } from '$lib/chart-utils.js'
  import {
    instanceVersion, instanceActivity, instanceState, instanceConfig, instanceReplication,
    instanceSetConfig,
  } from '$lib/api.js'
  import Database from '@lucide/svelte/icons/database'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import Gauge from '@lucide/svelte/icons/gauge'
  import Activity from '@lucide/svelte/icons/activity'
  import Settings from '@lucide/svelte/icons/settings-2'
  import GitBranch from '@lucide/svelte/icons/git-branch'
  import Search from '@lucide/svelte/icons/search'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import Check from '@lucide/svelte/icons/check'
  import X from '@lucide/svelte/icons/x'
  import Lock from '@lucide/svelte/icons/lock'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import PowerOff from '@lucide/svelte/icons/power-off'

  let { active = false, connectionName = '', dbType = '' } = $props()

  const SUBTABS = [
    { id: 'activity', label: 'Activity', icon: Gauge },
    { id: 'state', label: 'State', icon: Activity },
    { id: 'config', label: 'Config', icon: Settings },
    { id: 'replication', label: 'Replication', icon: GitBranch },
  ]
  let subtab = $state('activity')
  let autoRefresh = $state(false)
  let refreshing = $state(false)
  let lastUpdated = $state(/** @type {number | null} */ (null))
  let version = $state(/** @type {any} */ (null))
  let activity = $state(/** @type {any} */ (null))
  let stateData = $state(/** @type {any} */ (null))
  let config = $state(/** @type {any[]} */ ([]))
  let replication = $state(/** @type {any} */ (null))
  let configSearch = $state('')
  let error = $state('')
  /** @type {{ t: number, sessions: any, counters: any }[]} */
  let samples = $state([])
  const MAX_SAMPLES = 40
  const REFRESH_MS = 5000

  const supported = $derived(dbType === 'postgres' || dbType === 'mysql')
  const isPg = $derived((version?.engine ?? dbType) === 'postgres')

  onMount(() => { if (active && supported) void refreshAll() })

  // First-open fetch when the tab becomes active.
  let _everActive = false
  $effect(() => {
    if (active && supported && !_everActive) { _everActive = true; void refreshAll() }
  })

  // Auto-refresh loop while enabled + visible.
  $effect(() => {
    if (!autoRefresh || !active || !supported) return
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void refreshCurrent()
    }, REFRESH_MS)
    return () => clearInterval(id)
  })

  // Re-kick once when the window becomes visible again.
  $effect(() => {
    if (!autoRefresh || !active || !supported) return
    if (typeof document === 'undefined') return
    const onVisible = () => { if (!document.hidden) void refreshCurrent() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  })

  // 1s heartbeat so the "updated Ns ago" label stays honest without a re-fetch.
  let tick = $state(0)
  $effect(() => {
    if (!active) return
    const id = setInterval(() => {
      // Skip while backgrounded - the label resyncs on the next visible tick.
      if (typeof document !== 'undefined' && document.hidden) return
      tick++
    }, 1000)
    return () => clearInterval(id)
  })
  const agoLabel = $derived.by(() => {
    void tick
    if (!lastUpdated) return ''
    const s = Math.max(0, Math.round((Date.now() - lastUpdated) / 1000))
    if (s < 5) return 'just now'
    if (s < 60) return `${s}s ago`
    const m = Math.floor(s / 60)
    return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`
  })

  async function loadVersion() { try { version = await instanceVersion() } catch {} }
  async function refreshActivity() {
    try {
      const a = await instanceActivity(); activity = a
      samples = [...samples, { t: Date.now(), sessions: a.sessions, counters: a.counters }].slice(-MAX_SAMPLES)
    } catch (e) { error = String(e) }
  }
  async function refreshState() { try { stateData = await instanceState() } catch (e) { error = String(e) } }
  async function refreshConfig() { try { config = await instanceConfig() } catch (e) { error = String(e) } }
  async function refreshReplication() { try { replication = await instanceReplication() } catch (e) { error = String(e) } }

  async function refreshAll() {
    if (refreshing) return
    refreshing = true
    error = ''
    try {
      await Promise.all([loadVersion(), refreshActivity(), refreshState(), refreshConfig(), refreshReplication()])
      lastUpdated = Date.now()
      // Per-second rates (TPS, tuples, block I/O) are deltas between two samples,
      // so a single fetch leaves every rate stuck at 0.00 until the next tick.
      // Take a quick second activity sample on first open so the rate cards and
      // timelines populate immediately.
      if (active && samples.length < 2) {
        await new Promise((r) => setTimeout(r, 1000))
        if (active) { await refreshActivity(); lastUpdated = Date.now() }
      }
    } finally { refreshing = false }
  }
  async function refreshCurrent() {
    await refreshActivity() // always - keeps the charts flowing regardless of the visible tab
    if (subtab === 'state') await refreshState()
    else if (subtab === 'config') await refreshConfig()
    else if (subtab === 'replication') await refreshReplication()
    lastUpdated = Date.now()
  }
  /** @param {() => Promise<void>} fn */
  async function withSpinner(fn) {
    if (refreshing) return
    refreshing = true
    try { await fn(); lastUpdated = Date.now() } finally { refreshing = false }
  }

  /** Roving-tabindex arrow navigation across the sub-tabs. @param {KeyboardEvent} e */
  function onTabKeydown(e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = SUBTABS.findIndex((t) => t.id === subtab)
    const next = SUBTABS[(i + (e.key === 'ArrowRight' ? 1 : -1) + SUBTABS.length) % SUBTABS.length]
    subtab = next.id
    const list = /** @type {HTMLElement} */ (e.currentTarget).closest('[role="tablist"]')
    requestAnimationFrame(() => /** @type {HTMLElement | null} */ (list?.querySelector(`[data-tab="${next.id}"]`))?.focus())
  }

  // ── Per-second rates from the cumulative counters ──────────────────────────
  const rateHistory = $derived.by(() => {
    const out = []
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i]
      const dt = Math.max(0.001, (b.t - a.t) / 1000)
      const d = (/** @type {string} */ k) => Math.max(0, ((b.counters[k] ?? 0) - (a.counters[k] ?? 0)) / dt)
      const reads = d('blksRead'), hits = d('blksHit')
      out.push({
        t: b.t, commits: d('commits'), rollbacks: d('rollbacks'), tps: d('commits') + d('rollbacks'),
        tupUpdated: d('tupUpdated'), tupDeleted: d('tupDeleted'),
        reads, hits, hitRatio: (hits + reads) > 0 ? (hits / (hits + reads)) * 100 : 100,
      })
    }
    return out
  })
  const cur = $derived(rateHistory[rateHistory.length - 1] ?? null)
  const hasSeries = $derived(rateHistory.length > 1)
  /** Short 24h clock — 12h "03:42:11 PM" ticks collide on a 40-sample axis. */
  const clock = (/** @type {number} */ t) => new Date(t).toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const timeLabels = $derived(rateHistory.map((r) => clock(r.t)))

  const num = (/** @type {number} */ n, /** @type {number} */ dp = 2) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
  const big = (/** @type {number} */ n) => (n ?? 0).toLocaleString('en-US')
  /** Cumulative counters run to the billions — 1.2B reads far more easily. */
  const compact = (/** @type {number} */ n) => (n ?? 0).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })

  // ── Theme-resolved chart palette ───────────────────────────────────────────
  // The tokens are authored in oklch; echarts needs a concrete colour it can both
  // paint and parse. Resolve once per theme so charts follow the app instead of
  // the hardcoded hexes this page used to ship.
  const FALLBACK = { accent: '#6366f1', ok: '#22c55e', warn: '#f59e0b', bad: '#ef4444', axis: 'rgba(148,163,184,0.75)', grid: 'rgba(148,163,184,0.16)', panel: '#0f1115', border: 'rgba(148,163,184,0.28)', fg: '#e5e7eb' }
  let palette = $state({ ...FALLBACK, font: 'inherit' })
  $effect(() => {
    void $appThemeId // re-resolve whenever the user switches theme
    if (!active) return
    const c = (/** @type {string} */ v, /** @type {string} */ fb) => resolveCssColor(v) || fb
    palette = {
      accent: c('--primary', FALLBACK.accent),
      ok: c('--success', FALLBACK.ok),
      warn: c('--warning', FALLBACK.warn),
      bad: c('--destructive', FALLBACK.bad),
      axis: c('--muted-foreground', FALLBACK.axis),
      grid: c('--border', FALLBACK.grid),
      panel: c('--popover', FALLBACK.panel),
      border: c('--border', FALLBACK.border),
      fg: c('--foreground', FALLBACK.fg),
      font: typeof document !== 'undefined' ? getComputedStyle(document.body).fontFamily : 'inherit',
    }
  })

  // ── Chart options ──────────────────────────────────────────────────────────
  // Legends are rendered as HTML in each card header instead of by echarts: it
  // keeps chart labels on the app's type scale and hands the plot back its space.
  const axisStyle = $derived({
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: palette.axis, fontSize: 10, fontFamily: palette.font, hideOverlap: true, margin: 8 },
    splitLine: { lineStyle: { color: palette.grid, width: 1 } },
  })
  const baseChart = $derived({
    animationDuration: 240,
    animationDurationUpdate: 240,
    animationEasing: /** @type {const} */ ('cubicOut'),
    legend: { show: false },
    grid: { left: 6, right: 6, top: 10, bottom: 2, containLabel: true },
    tooltip: {
      trigger: /** @type {const} */ ('axis'),
      backgroundColor: palette.panel,
      borderColor: palette.border,
      borderWidth: 1,
      padding: [7, 10],
      textStyle: { color: palette.fg, fontSize: 11, fontFamily: palette.font },
      axisPointer: { type: /** @type {const} */ ('line'), lineStyle: { color: palette.axis, width: 1, opacity: 0.35 } },
      extraCssText: 'border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.22);',
    },
  })
  const line = (/** @type {string} */ name, /** @type {number[]} */ data, /** @type {string} */ color, /** @type {any} */ extra = {}) => ({
    name, type: 'line', smooth: 0.35, showSymbol: false, symbolSize: 5, data,
    lineStyle: { color, width: 1.75 }, itemStyle: { color }, ...extra,
  })
  const bar = (/** @type {string} */ name, /** @type {number[]} */ data, /** @type {string} */ color) => ({
    name, type: 'bar', data, itemStyle: { color, opacity: 0.72, borderRadius: [2, 2, 0, 0] }, barMaxWidth: 14,
  })

  const sessionsChart = $derived({
    ...baseChart,
    xAxis: { type: 'category', boundaryGap: false, data: samples.map((s) => clock(s.t)), ...axisStyle },
    yAxis: { type: 'value', minInterval: 1, ...axisStyle },
    series: [
      line('Total', samples.map((s) => s.sessions.total), palette.accent, {
        areaStyle: { color: palette.accent, opacity: 0.1 },
      }),
      line('Active', samples.map((s) => s.sessions.active), palette.ok),
      line('Idle', samples.map((s) => s.sessions.idle), palette.warn),
    ],
  })
  const txChart = $derived({
    ...baseChart,
    xAxis: { type: 'category', data: timeLabels, ...axisStyle },
    yAxis: { type: 'value', ...axisStyle },
    series: [
      bar('Commits/s', rateHistory.map((r) => +r.commits.toFixed(2)), palette.ok),
      bar('Rollbacks/s', rateHistory.map((r) => +r.rollbacks.toFixed(2)), palette.bad),
      line('TPS', rateHistory.map((r) => +r.tps.toFixed(2)), palette.accent),
    ],
  })
  const ioChart = $derived({
    ...baseChart,
    xAxis: { type: 'category', data: timeLabels, ...axisStyle },
    yAxis: [
      { type: 'value', ...axisStyle },
      { type: 'value', min: 0, max: 100, axisLabel: { ...axisStyle.axisLabel, formatter: '{value}%' }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } },
    ],
    series: [
      bar('Disk reads/s', rateHistory.map((r) => +r.reads.toFixed(1)), palette.bad),
      bar('Cache hits/s', rateHistory.map((r) => +r.hits.toFixed(1)), palette.ok),
      line('Hit ratio', rateHistory.map((r) => +r.hitRatio.toFixed(1)), palette.accent, { yAxisIndex: 1 }),
    ],
  })

  // ── Health thresholds ──────────────────────────────────────────────────────
  const TONE = /** @type {Record<string, string>} */ ({
    ok: 'text-success', warn: 'text-warning', bad: 'text-destructive',
    muted: 'text-muted-foreground', plain: 'text-foreground',
  })
  const toneClass = (/** @type {string} */ t) => TONE[t] ?? TONE.muted
  /** Connection pool pressure: past 75% you start planning, past 90% you act. */
  const connTone = $derived(!activity ? 'muted' : activity.sessions.usagePct >= 90 ? 'bad' : activity.sessions.usagePct >= 75 ? 'warn' : 'ok')
  /** A healthy buffer cache serves ~99% of reads from memory. */
  const cacheTone = $derived.by(() => {
    const pct = (activity?.bufferHitRatio ?? 0) * 100
    if (!activity) return 'muted'
    return pct >= 99 ? 'ok' : pct >= 90 ? 'warn' : 'bad'
  })
  /** Rollbacks as a share of transactions — a rising ratio means failing writes. */
  const rollbackPct = $derived(cur && cur.tps > 0 ? (cur.rollbacks / cur.tps) * 100 : 0)

  // ── Config browsing + editing ──────────────────────────────────────────────
  // pg_settings categories read like "Write-Ahead Log / Archiving" - the part
  // before the slash is the group people actually think in (WAL, Memory, …).
  /** @param {any} c */
  const groupOf = (c) => (c.category || '').split('/')[0].trim()

  /** A value the server is not running with yet, or one the user has moved off the default. */
  /** @param {any} c */
  const isModified = (c) => !!c.source && c.source !== 'default' && c.source !== 'client'

  let configGroup = $state('all')
  let configStatus = $state(/** @type {'all' | 'modified' | 'restart'} */ ('all'))

  const configGroups = $derived.by(() => {
    /** @type {Map<string, number>} */
    const counts = new Map()
    for (const c of config) {
      const g = groupOf(c)
      if (g) counts.set(g, (counts.get(g) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([id, n]) => ({ id, n }))
  })

  const modifiedCount = $derived(config.filter(isModified).length)
  const pendingRestartCount = $derived(config.filter((c) => c.pendingRestart).length)
  /** One mutually-exclusive status filter. "Restart pending" only exists when it does. */
  const statusOptions = $derived([
    { id: 'all', label: 'All', n: config.length },
    ...(isPg ? [{ id: 'modified', label: 'Modified', n: modifiedCount }] : []),
    ...(pendingRestartCount ? [{ id: 'restart', label: 'Restart pending', n: pendingRestartCount }] : []),
  ])
  // The "restart pending" option disappears once the server is restarted; don't
  // strand the list on a filter that no longer exists.
  $effect(() => { if (!statusOptions.some((o) => o.id === configStatus)) configStatus = 'all' })

  const configFiltered = $derived.by(() => {
    const q = configSearch.trim().toLowerCase()
    return config.filter((c) => {
      if (configGroup !== 'all' && groupOf(c) !== configGroup) return false
      if (configStatus === 'modified' && !isModified(c)) return false
      if (configStatus === 'restart' && !c.pendingRestart) return false
      if (!q) return true
      return (c.name + ' ' + c.category + ' ' + c.description).toLowerCase().includes(q)
    })
  })
  const configFiltering = $derived(configGroup !== 'all' || configStatus !== 'all' || !!configSearch.trim())

  /** Browsing the unfiltered list means 350+ rows; break it into labelled
   *  category sections so it can be scanned. Filtered results stay flat — the
   *  query is already the organising principle. */
  const configSections = $derived.by(() => {
    if (configGroup !== 'all' || configSearch.trim()) return [{ group: '', rows: configFiltered }]
    /** @type {Map<string, any[]>} */
    const map = new Map()
    for (const r of configFiltered) {
      const g = groupOf(r) || 'Other'
      const bucket = map.get(g)
      if (bucket) bucket.push(r)
      else map.set(g, [r])
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([group, rows]) => ({ group, rows }))
  })

  function clearConfigFilters() {
    configGroup = 'all'; configStatus = 'all'; configSearch = ''
  }

  // ── Editing one setting ────────────────────────────────────────────────────
  let openSetting = $state('')
  let draft = $state('')
  let savingSetting = $state('')

  /** @param {any} row */
  function toggleSetting(row) {
    if (openSetting === row.name) { openSetting = ''; return }
    openSetting = row.name
    draft = row.value ?? ''
  }

  /** Display value: pg reports an empty string for "unset", which reads as a bug. */
  /** @param {any} row */
  const shownValue = (row) => (row.value === '' || row.value == null ? '—' : row.value)

  /** When the setting takes effect, in words. pg's `context` is jargon. */
  const CONTEXT_HELP = /** @type {Record<string, string>} */ ({
    internal: 'Fixed when the server was built',
    postmaster: 'Applies after a server restart',
    sighup: 'Applies on the next config reload',
    'superuser-backend': 'Set by a superuser at connection time',
    backend: 'Set at connection time',
    superuser: 'A superuser can change it live',
    user: 'Any session can change it live',
  })

  /**
   * Write the setting, or reset it to the server default.
   * @param {any} row
   * @param {boolean} [toDefault]
   */
  async function applySetting(row, toDefault = false) {
    if (savingSetting) return
    savingSetting = row.name
    try {
      const res = await instanceSetConfig(row.name, toDefault ? null : draft)
      if (res.requiresRestart) toast.warning('Restart required', { description: res.message, duration: 7000 })
      else toast.success(res.message)
      openSetting = ''
      await refreshConfig()
    } catch (e) {
      toast.error('Could not change setting', { description: String(e), duration: 8000 })
    } finally {
      savingSetting = ''
    }
  }

  // ── Raw result tables (State / Replication) ────────────────────────────────
  /** @param {any[]} rows */
  function keysOf(rows) { return rows?.length ? Object.keys(rows[0]) : [] }
  /** @param {any} v */
  function cell(v) { return v === null || v === undefined ? '–' : Array.isArray(v) ? (v.length ? v.join(', ') : '–') : String(v) }

  const ACRONYMS = new Set(['id', 'ids', 'pid', 'pids', 'db', 'ip', 'addr', 'xid', 'lsn', 'wal', 'gid', 'sql', 'os', 'tcp', 'io'])
  /** `blocking_pids` → `Blocking PIDs`. Raw catalog column names are not labels. */
  const humanize = (/** @type {string} */ k) => String(k).replace(/[_-]+/g, ' ').trim().split(' ')
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')

  /** Session state is the one column worth reading at a glance. */
  const stateTone = (/** @type {any} */ v) => {
    const s = String(v ?? '').toLowerCase()
    if (s === 'active' || s === 'query') return 'bg-success/12 text-success'
    if (s.includes('idle in transaction')) return 'bg-warning/12 text-warning'
    if (s === 'idle' || s === 'sleep') return 'bg-muted/50 text-muted-foreground'
    return 'bg-muted/40 text-foreground/70'
  }
  /** A session waiting on someone else's lock is the thing you opened this tab for. */
  const isBlocked = (/** @type {any} */ row) => Array.isArray(row?.blocking_pids) && row.blocking_pids.length > 0

  const blockedCount = $derived((stateData?.sessions ?? []).filter(isBlocked).length)
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
  <!-- ── Header ──────────────────────────────────────────────────────────── -->
  <div class="flex shrink-0 items-center gap-4 border-b border-border/50 px-5 py-3">
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <div class="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/25">
        <Database class="size-4 text-muted-foreground" />
      </div>
      <div class="min-w-0">
        <h1 class="truncate text-ui-lg font-semibold leading-tight text-foreground">Instance Insights</h1>
        <p class="mt-0.5 flex min-w-0 items-center gap-1.5 text-ui-2xs text-muted-foreground">
          <span class="truncate font-mono text-foreground/70">{connectionName || '—'}</span>
          {#if version}
            <span class="text-muted-foreground/40">·</span>
            <span class="shrink-0 truncate">{isPg ? 'PostgreSQL' : 'MySQL'} {version.version}</span>
          {/if}
        </p>
      </div>
    </div>

    {#if supported}
      <div class="flex shrink-0 items-center gap-2">
        {#if lastUpdated}
          <span class="hidden text-ui-2xs tabular-nums text-muted-foreground/70 sm:inline">Updated {agoLabel}</span>
        {/if}
        <button
          type="button"
          role="switch"
          aria-checked={autoRefresh}
          title={autoRefresh ? `Refreshing every ${REFRESH_MS / 1000}s` : 'Poll the server automatically'}
          class={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-ui-xs transition-colors',
            'focus-visible:border-ring/55 focus-visible:ring-2 focus-visible:ring-ring/18 focus-visible:outline-none',
            autoRefresh ? 'border-success/45 bg-success/10 text-success' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
          onclick={() => (autoRefresh = !autoRefresh)}
        >
          <span class="relative flex size-1.5 shrink-0">
            {#if autoRefresh}
              <span class="live-ping absolute inline-flex size-full rounded-full bg-success opacity-70"></span>
            {/if}
            <span class={cn('relative inline-flex size-1.5 rounded-full', autoRefresh ? 'bg-success' : 'bg-muted-foreground/50')}></span>
          </span>
          Live
          {#if autoRefresh}<span class="tabular-nums opacity-70">{REFRESH_MS / 1000}s</span>{/if}
        </button>
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-ui-xs text-foreground/85 transition-colors hover:bg-accent hover:text-foreground focus-visible:border-ring/55 focus-visible:ring-2 focus-visible:ring-ring/18 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
          disabled={refreshing}
          onclick={() => void refreshAll()}
        >
          <RefreshCw class={cn('size-3.5 shrink-0', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>
    {/if}
  </div>

  {#if !supported}
    <div class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <Database class="size-5 text-muted-foreground/40" />
      <p class="text-ui-sm text-muted-foreground">Instance Insights needs a server-based engine</p>
      <p class="max-w-sm text-ui-xs text-muted-foreground/60">
        Live sessions, transaction rates and server configuration come from PostgreSQL and MySQL catalogs.
        Embedded engines don't expose them.
      </p>
    </div>
  {:else}
    <!-- ── Sub-tabs ──────────────────────────────────────────────────────── -->
    <div class="shrink-0 border-b border-border/40 px-5 py-2">
      <div
        role="tablist"
        aria-label="Instance sections"
        class="inline-flex items-center gap-0.5 rounded-lg border border-border/50 bg-muted/20 p-0.5"
      >
        {#each SUBTABS as t (t.id)}
          <button
            type="button"
            role="tab"
            data-tab={t.id}
            aria-selected={subtab === t.id}
            tabindex={subtab === t.id ? 0 : -1}
            class={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-ui-xs font-medium transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring/18 focus-visible:outline-none',
              subtab === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
            onclick={() => (subtab = t.id)}
            onkeydown={onTabKeydown}
          >
            <t.icon class="size-3.5 shrink-0" />
            {t.label}
            {#if t.id === 'state' && blockedCount}
              <span class="ml-0.5 rounded bg-destructive/15 px-1 text-ui-3xs tabular-nums text-destructive">{blockedCount}</span>
            {:else if t.id === 'config' && pendingRestartCount}
              <span class="ml-0.5 rounded bg-warning/15 px-1 text-ui-3xs tabular-nums text-warning">{pendingRestartCount}</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <div class={cn('app-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5', subtab !== 'config' && 'pt-5')}>
      {#if error}
        <div class={cn('mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-ui-xs text-destructive', subtab === 'config' && 'mt-5')}>{error}</div>
      {/if}

      <!-- ══ ACTIVITY ══════════════════════════════════════════════════════ -->
      {#if subtab === 'activity'}
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {@render stat({
            label: 'Connections',
            help: 'Client sessions open on the server right now, against max_connections.',
            value: activity ? big(activity.sessions.total) : '—',
            unit: activity?.sessions.max ? `/ ${big(activity.sessions.max)}` : '',
            hint: activity ? `${num(activity.sessions.usagePct, 1)}% used` : '',
            tone: connTone,
            series: samples.map((s) => s.sessions.total),
            rows: [
              { k: 'Active', v: activity ? big(activity.sessions.active) : '—' },
              { k: 'Idle', v: activity ? big(activity.sessions.idle) : '—' },
            ],
            meter: activity?.sessions.max ? Math.min(100, activity.sessions.usagePct) : null,
          })}
          {@render stat({
            label: 'Transactions',
            help: 'Commits plus rollbacks per second, measured between the last two samples.',
            value: cur ? num(cur.tps) : '—',
            unit: '/s',
            hint: cur && cur.tps > 0 ? `${num(rollbackPct, 1)}% rolled back` : '',
            tone: rollbackPct >= 10 ? 'bad' : rollbackPct >= 2 ? 'warn' : 'ok',
            series: rateHistory.map((r) => r.tps),
            rows: [
              { k: 'Commits/s', v: cur ? num(cur.commits) : '—' },
              { k: 'Rollbacks/s', v: cur ? num(cur.rollbacks) : '—' },
              { k: 'Commits total', v: activity ? compact(activity.counters.commits) : '—' },
              { k: 'Rollbacks total', v: activity ? compact(activity.counters.rollbacks) : '—' },
            ],
          })}
          {@render stat({
            label: 'Row writes',
            help: 'Rows updated and deleted per second across every database on this instance.',
            value: cur ? num(cur.tupUpdated + cur.tupDeleted) : '—',
            unit: '/s',
            hint: '',
            tone: 'plain',
            series: rateHistory.map((r) => r.tupUpdated + r.tupDeleted),
            rows: [
              { k: 'Updates/s', v: cur ? num(cur.tupUpdated) : '—' },
              { k: 'Deletes/s', v: cur ? num(cur.tupDeleted) : '—' },
              { k: 'Fetched total', v: activity ? compact(activity.counters.tupFetched) : '—' },
              { k: 'Returned total', v: activity ? compact(activity.counters.tupReturned) : '—' },
            ],
          })}
          {@render stat({
            label: 'Cache hit ratio',
            help: 'Share of block reads served from memory. Below ~99% means the server is going to disk.',
            value: activity ? num(activity.bufferHitRatio * 100, 1) : '—',
            unit: '%',
            hint: cacheTone === 'ok' ? 'healthy' : cacheTone === 'warn' ? 'watch' : activity ? 'reading from disk' : '',
            tone: cacheTone,
            series: rateHistory.map((r) => r.hitRatio),
            rows: [
              { k: 'Cache hits/s', v: cur ? num(cur.hits, 1) : '—' },
              { k: 'Disk reads/s', v: cur ? num(cur.reads, 1) : '—' },
              { k: 'Hits total', v: activity ? compact(activity.counters.blksHit) : '—' },
              { k: 'Reads total', v: activity ? compact(activity.counters.blksRead) : '—' },
            ],
            meter: activity ? activity.bufferHitRatio * 100 : null,
          })}
        </div>

        {#if !autoRefresh}
          <p class="mt-3 flex items-center gap-1.5 text-ui-2xs text-muted-foreground/70">
            Rates are sampled per refresh — turn on <span class="font-medium text-foreground/80">Live</span> to watch them move.
          </p>
        {/if}

        <div class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {@render chartCard({
            title: 'Sessions',
            caption: 'How many clients are connected, and how many are doing work.',
            legend: [{ label: 'Total', color: palette.accent }, { label: 'Active', color: palette.ok }, { label: 'Idle', color: palette.warn }],
            option: sessionsChart,
            ready: samples.length > 1,
          })}
          {@render chartCard({
            title: 'Transactions',
            caption: 'Throughput per second. Rollback bars rising is the signal to look at.',
            legend: [{ label: 'Commits/s', color: palette.ok }, { label: 'Rollbacks/s', color: palette.bad }, { label: 'TPS', color: palette.accent }],
            option: txChart,
            ready: hasSeries,
          })}
        </div>
        <div class="mt-4">
          {@render chartCard({
            title: 'Block I/O',
            caption: 'Cache hits versus disk reads, with the resulting hit ratio on the right axis.',
            legend: [{ label: 'Cache hits/s', color: palette.ok }, { label: 'Disk reads/s', color: palette.bad }, { label: 'Hit ratio', color: palette.accent }],
            option: ioChart,
            ready: hasSeries,
          })}
        </div>

      <!-- ══ STATE ═════════════════════════════════════════════════════════ -->
      {:else if subtab === 'state'}
        {#if blockedCount}
          <div class="mb-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-ui-xs text-destructive">
            <Lock class="size-3.5 shrink-0" />
            {blockedCount} {blockedCount === 1 ? 'session is' : 'sessions are'} waiting on a lock held by another session.
          </div>
        {/if}
        {@render dataSection({
          title: 'Sessions',
          caption: 'Every client connection the server currently holds.',
          rows: stateData?.sessions ?? [],
          empty: 'No sessions reported.',
          onRefresh: () => void withSpinner(refreshState),
        })}
        <div class="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div>
            {@render dataSection({
              title: 'Locks',
              caption: 'Locks currently held or awaited, capped at 200 rows.',
              rows: stateData?.locks ?? [],
              empty: 'Nothing is locked right now.',
            })}
          </div>
          <div>
            {@render dataSection({
              title: 'Prepared transactions',
              caption: 'Two-phase commits left open — these hold locks until resolved.',
              rows: stateData?.preparedTransactions ?? [],
              empty: 'No prepared transactions.',
            })}
          </div>
        </div>

      <!-- ══ CONFIG ════════════════════════════════════════════════════════ -->
      {:else if subtab === 'config'}
        <!-- Sticky toolbar: search and filters stay reachable through a 350-row
             list. The fill is fully opaque on purpose — a translucent header with
             `backdrop-blur` ghosts the rows scrolling beneath it straight through
             the search field on WebKitGTK, and blurring a full-width strip over a
             379-row list costs a compositing layer for nothing.

             No negative *vertical* margin here: sticky offsets resolve against the
             margin box, so a `-mt-5` pins the border box 20px below the scrollport
             top and list rows scroll visibly through the gap above it. The scroll
             container drops its top padding for this tab and the toolbar supplies
             it via `pt-5` instead. `-mx-5` is fine — horizontal margins don't
             affect a `top` offset. -->
        <div class="sticky top-0 z-20 -mx-5 mb-4 border-b border-border/40 bg-panel px-5 pb-3 pt-5">
          <div class="mb-2.5 flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-baseline gap-2">
              <h2 class="text-ui font-semibold text-foreground">Configuration</h2>
              <span class="shrink-0 text-ui-2xs tabular-nums text-muted-foreground">
                {#if configFiltering}
                  {big(configFiltered.length)} of {big(config.length)}
                {:else}
                  {big(config.length)} settings
                {/if}
              </span>
            </div>
            <button
              type="button"
              class="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-ui-xs text-foreground/85 transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              disabled={refreshing}
              onclick={() => void withSpinner(refreshConfig)}
            >
              <RefreshCw class={cn('size-3.5 shrink-0', refreshing && 'animate-spin')} /> Refresh
            </button>
          </div>

          <!-- Search, then two bounded filters. The old design put ~14 category
               chips in a horizontally scrolling strip: the overflow was invisible,
               scrolling it needed a trackpad gesture, and it mixed two different
               filter dimensions in one row. A menu holds any number of categories
               at a fixed size, and status stays a real segmented control. -->
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div class="relative min-w-0 flex-1">
              <Search class="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
              <input
                bind:value={configSearch}
                placeholder="Search settings by name, category, or description…"
                class="h-9 w-full rounded-lg border-2 border-border bg-muted/30 pl-9 pr-9 text-ui-sm text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground/50 focus:border-ring/55 focus:ring-2 focus:ring-ring/15"
              />
              {#if configSearch}
                <button
                  type="button"
                  aria-label="Clear search"
                  class="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onclick={() => (configSearch = '')}
                >
                  <X class="size-3.5" />
                </button>
              {/if}
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <SearchableMenu
                items={[{ value: 'all', label: 'All categories' }, ...configGroups.map((g) => ({ value: g.id, label: g.id }))]}
                placeholder="Filter categories…"
                empty="No matching category"
                contentClass="min-w-[260px]"
                onselect={(it) => (configGroup = it.value)}
              >
                {#snippet trigger(props)}
                  <button
                    {...props}
                    type="button"
                    class={cn(
                      'flex h-9 min-w-[11rem] items-center gap-2 rounded-lg border-2 px-3 text-left text-ui-sm transition-[border-color,box-shadow]',
                      'focus:border-ring/55 focus:ring-2 focus:ring-ring/15 focus:outline-none data-[state=open]:border-ring/55',
                      configGroup === 'all' ? 'border-border bg-muted/30 text-foreground/80' : 'border-primary/40 bg-primary/10 text-foreground',
                    )}
                  >
                    <span class="min-w-0 flex-1 truncate">{configGroup === 'all' ? 'All categories' : configGroup}</span>
                    <ChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                {/snippet}
                {#snippet item(it)}
                  <span class="min-w-0 flex-1 truncate">{it.label}</span>
                  <span class="shrink-0 text-ui-2xs tabular-nums text-muted-foreground/60">
                    {it.value === 'all' ? config.length : (configGroups.find((g) => g.id === it.value)?.n ?? 0)}
                  </span>
                  {#if it.value === configGroup}<Check class="size-3.5 shrink-0 text-primary" />{/if}
                {/snippet}
              </SearchableMenu>

              <div class="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-lg border-2 border-border bg-muted/30 p-0.5">
                {#each statusOptions as o (o.id)}
                  <button
                    type="button"
                    aria-pressed={configStatus === o.id}
                    class={cn(
                      'inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-ui-xs font-medium transition-colors',
                      'focus-visible:ring-2 focus-visible:ring-ring/18 focus-visible:outline-none',
                      configStatus === o.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                    onclick={() => (configStatus = /** @type {any} */ (o.id))}
                  >
                    {#if o.id === 'restart'}<PowerOff class="size-3 shrink-0 text-warning" />{/if}
                    {o.label}
                    <span class="tabular-nums opacity-60">{o.n}</span>
                  </button>
                {/each}
              </div>

              {#if configFiltering}
                <button
                  type="button"
                  class="inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-ui-xs text-muted-foreground transition-colors hover:text-foreground"
                  onclick={clearConfigFilters}
                >
                  <X class="size-3.5" /> Clear
                </button>
              {/if}
            </div>
          </div>
        </div>

        {#if !configFiltered.length}
          <div class="rounded-lg border border-border/40 bg-muted/[0.04] py-12 text-center">
            <p class="text-ui-sm text-muted-foreground">No settings match these filters</p>
            {#if configFiltering}
              <button type="button" class="mt-2 text-ui-xs text-primary hover:underline" onclick={clearConfigFilters}>Clear filters</button>
            {/if}
          </div>
        {:else}
          <div class="flex flex-col gap-5">
            {#each configSections as sec (sec.group || '_flat')}
              <section>
                {#if sec.group}
                  <div class="mb-1.5 flex items-baseline gap-2">
                    <h3 class="text-ui-3xs font-semibold uppercase tracking-[0.06em] text-muted-foreground/55">{sec.group}</h3>
                    <span class="text-ui-3xs tabular-nums text-muted-foreground/40">{sec.rows.length}</span>
                  </div>
                {/if}
                <!-- One row per setting; content-visibility keeps the ~350-row list
                     smooth by skipping layout/paint for rows that are off-screen. -->
                <div class="overflow-hidden rounded-lg border border-border/50 bg-muted/[0.04]">
                  {#each sec.rows as row (row.name)}
                    {@const open = openSetting === row.name}
                    {@const editable = row.editable !== false && !$readOnlyMode}
                    {@const modified = isModified(row)}
                    <div class={cn('cfg-row border-b border-border/25 last:border-b-0', open && 'bg-muted/20')}>
                      <button
                        type="button"
                        aria-expanded={open}
                        class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
                        onclick={() => toggleSetting(row)}
                      >
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-1.5">
                            <span class="truncate font-mono text-ui-xs font-medium text-foreground">{row.name}</span>
                            {#if modified}
                              <span class="shrink-0 rounded bg-primary/12 px-1 py-px text-ui-3xs text-primary" title="Not the built-in default — set by {row.source}">modified</span>
                            {/if}
                            {#if row.pendingRestart}
                              <span class="inline-flex shrink-0 items-center gap-1 rounded bg-warning/12 px-1 py-px text-ui-3xs text-warning">
                                <PowerOff class="size-2.5" /> restart pending
                              </span>
                            {/if}
                            {#if row.editable === false}
                              <Lock class="size-3 shrink-0 text-muted-foreground/50" aria-label="Read-only setting" />
                            {/if}
                          </div>
                          {#if row.description}
                            <p class="mt-0.5 truncate text-ui-2xs text-muted-foreground">{row.description}</p>
                          {/if}
                        </div>

                        <span class="flex shrink-0 items-baseline gap-1.5">
                          <span class="max-w-[14rem] truncate rounded-md bg-muted/50 px-1.5 py-0.5 font-mono text-ui-2xs tabular-nums text-foreground">{shownValue(row)}</span>
                          {#if row.unit}<span class="font-mono text-ui-3xs text-muted-foreground/70">{row.unit}</span>{/if}
                        </span>
                        <ChevronRight class={cn('size-3.5 shrink-0 self-center text-muted-foreground/50 transition-transform duration-150', open && 'rotate-90')} />
                      </button>

                      {#if open}
                        <div class="border-t border-border/30 px-3 pb-3 pt-3">
                          <div class="flex flex-wrap items-end gap-2">
                            <div class="min-w-[13rem] flex-1">
                              <div class="mb-1 flex items-baseline justify-between gap-2">
                                <span class="text-ui-3xs font-semibold uppercase tracking-[0.06em] text-muted-foreground/55">New value</span>
                                <span class="truncate font-mono text-ui-3xs text-muted-foreground/60">
                                  current: {shownValue(row)}{row.unit ? ` ${row.unit}` : ''}
                                </span>
                              </div>
                              {#if row.vartype === 'bool'}
                                <div class="inline-flex h-9 items-center gap-0.5 rounded-lg border-2 border-border bg-muted/30 p-0.5">
                                  {#each ['on', 'off'] as v (v)}
                                    <button
                                      type="button"
                                      disabled={!editable}
                                      onclick={() => (draft = v)}
                                      class={cn('h-full rounded-md px-4 font-mono text-ui-xs transition-colors disabled:opacity-40', draft === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                                    >{v}</button>
                                  {/each}
                                </div>
                              {:else if row.vartype === 'enum' && row.enumVals?.length}
                                <select
                                  bind:value={draft}
                                  disabled={!editable}
                                  class="h-9 w-full rounded-lg border-2 border-border bg-muted/30 px-2.5 font-mono text-ui-sm text-foreground transition-[border-color,box-shadow] outline-none focus:border-ring/55 focus:ring-2 focus:ring-ring/15 disabled:opacity-40"
                                >
                                  {#each row.enumVals as v (v)}<option value={v}>{v}</option>{/each}
                                </select>
                              {:else}
                                <input
                                  bind:value={draft}
                                  disabled={!editable}
                                  type={row.vartype === 'integer' || row.vartype === 'real' ? 'number' : 'text'}
                                  placeholder={row.bootVal || 'value'}
                                  onkeydown={(e) => {
                                    if (e.key === 'Enter' && editable && draft !== row.value) { e.preventDefault(); void applySetting(row) }
                                    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); openSetting = '' }
                                  }}
                                  class="h-9 w-full rounded-lg border-2 border-border bg-muted/30 px-3 font-mono text-ui-sm tabular-nums text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground/40 focus:border-ring/55 focus:ring-2 focus:ring-ring/15 disabled:opacity-40"
                                />
                              {/if}
                            </div>

                            <div class="flex items-center gap-1.5">
                              <Button
                                size="lg"
                                disabled={!editable || savingSetting === row.name || draft === row.value}
                                title={$readOnlyMode ? READ_ONLY_HINT : undefined}
                                onclick={() => void applySetting(row)}
                              >
                                {savingSetting === row.name ? 'Applying…' : 'Apply'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="lg"
                                class="text-muted-foreground hover:text-foreground"
                                disabled={!editable || savingSetting === row.name || !modified}
                                title={modified ? `Reset to the server default${row.bootVal ? ` (${row.bootVal})` : ''}` : 'Already at the server default'}
                                onclick={() => void applySetting(row, true)}
                              >
                                <RotateCcw /> Reset
                              </Button>
                            </div>
                          </div>

                          <!-- Everything the server knows about this setting, as a
                               readable grid rather than one run-on mono line. -->
                          <dl class="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
                            {#each [['Category', row.category], ['Type', row.vartype], ['Unit', row.unit], ['Default', row.bootVal], ['Range', (row.minVal || row.maxVal) ? `${row.minVal || '−∞'} … ${row.maxVal || '∞'}` : ''], ['Source', row.source]] as [k, v] (k)}
                              {#if v}
                                <div class="flex min-w-0 items-baseline gap-2">
                                  <dt class="w-[4.5rem] shrink-0 text-ui-3xs uppercase tracking-[0.06em] text-muted-foreground/55">{k}</dt>
                                  <dd class="min-w-0 flex-1 truncate font-mono text-ui-2xs text-foreground/85" title={String(v)}>{v}</dd>
                                </div>
                              {/if}
                            {/each}
                          </dl>

                          {#if row.editable === false}
                            <p class="mt-3 rounded-md bg-muted/40 px-2.5 py-1.5 text-ui-2xs text-muted-foreground">
                              Compiled into the server — it can only change by rebuilding or re-initialising the cluster.
                            </p>
                          {:else if $readOnlyMode}
                            <p class="mt-3 rounded-md bg-muted/40 px-2.5 py-1.5 text-ui-2xs text-muted-foreground">{READ_ONLY_HINT}</p>
                          {:else if row.requiresRestart}
                            <p class="mt-3 rounded-md bg-warning/10 px-2.5 py-1.5 text-ui-2xs text-warning">
                              Applying writes the value now, but the server has to restart before it takes effect.
                            </p>
                          {:else if isPg}
                            <p class="mt-3 text-ui-2xs text-muted-foreground/70">
                              Written with <span class="font-mono">ALTER SYSTEM</span> and reloaded — persists across restarts. Needs a superuser role.{row.context && CONTEXT_HELP[row.context] ? ` ${CONTEXT_HELP[row.context]}.` : ''}
                            </p>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </section>
            {/each}
          </div>
        {/if}

      <!-- ══ REPLICATION ═══════════════════════════════════════════════════ -->
      {:else if subtab === 'replication'}
        {@render dataSection({
          title: 'Replicas',
          caption: 'Standbys currently streaming from this instance.',
          rows: replication?.stats ?? [],
          empty: 'No replicas are streaming from this instance.',
          onRefresh: () => void withSpinner(refreshReplication),
        })}
        <div class="mt-5">
          {@render dataSection({
            title: 'Replication slots',
            caption: 'Slots reserve WAL for a consumer — an inactive slot grows disk usage until it is dropped.',
            rows: replication?.slots ?? [],
            empty: 'No replication slots exist.',
          })}
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- ── Snippets ────────────────────────────────────────────────────────────── -->

{#snippet sparkline(/** @type {number[]} */ values, /** @type {string} */ toneClass)}
  <div class="h-7 w-full">
    {#if values.length > 1}
      {@const max = Math.max(...values)}
      {@const min = Math.min(...values)}
      {@const span = max - min || 1}
      {@const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${25 - ((v - min) / span) * 22}`).join(' ')}
      <svg viewBox="0 0 100 28" preserveAspectRatio="none" class={cn('size-full', toneClass)} aria-hidden="true">
        <polyline
          points={pts}
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
          opacity="0.85"
        />
      </svg>
    {:else}
      <!-- Placeholder keeps every card the same height while samples accumulate. -->
      <svg viewBox="0 0 100 28" preserveAspectRatio="none" class="size-full text-muted-foreground/25" aria-hidden="true">
        <line x1="0" y1="14" x2="100" y2="14" stroke="currentColor" stroke-width="1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke" />
      </svg>
    {/if}
  </div>
{/snippet}

{#snippet stat(/** @type {any} */ s)}
  <div class="flex flex-col rounded-lg border border-border/60 bg-muted/[0.04] p-3">
    <!-- Row 1: label + status hint. Every card shares this grid so the four
         cards line up line-for-line across the row (DESIGN_SYSTEM §9). -->
    <div class="flex items-baseline justify-between gap-2">
      <span class="truncate text-ui-3xs font-semibold uppercase tracking-[0.06em] text-muted-foreground/60" title={s.help}>{s.label}</span>
      {#if s.hint}
        <span class={cn('shrink-0 text-ui-3xs tabular-nums', toneClass(s.tone))}>{s.hint}</span>
      {/if}
    </div>

    <!-- Row 2: the headline number -->
    <div class="mt-1.5 flex items-baseline gap-1">
      <span class="font-mono text-ui-lg font-semibold leading-none tabular-nums text-foreground">{s.value}</span>
      {#if s.unit}<span class="text-ui-xs text-muted-foreground">{s.unit}</span>{/if}
    </div>

    <!-- Row 3: trend -->
    <div class="mt-2">{@render sparkline(s.series ?? [], toneClass(s.tone))}</div>

    <!-- Row 4: optional 0–100 meter, on cards where the number has a ceiling -->
    {#if s.meter != null}
      <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-muted/60">
        <div
          class={cn('h-full rounded-full transition-[width] duration-300 ease-out', s.tone === 'bad' ? 'bg-destructive' : s.tone === 'warn' ? 'bg-warning' : 'bg-success')}
          style="width: {Math.max(0, Math.min(100, s.meter))}%"
        ></div>
      </div>
    {/if}

    <!-- Row 5: aligned detail pairs -->
    <dl class="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border/40 pt-2">
      {#each s.rows as r (r.k)}
        <div class="flex min-w-0 items-baseline gap-1.5">
          <dt class="truncate text-ui-3xs text-muted-foreground">{r.k}</dt>
          <dd class="ml-auto shrink-0 font-mono text-ui-2xs tabular-nums text-foreground/85">{r.v}</dd>
        </div>
      {/each}
    </dl>
  </div>
{/snippet}

{#snippet chartCard(/** @type {any} */ c)}
  <div class="rounded-lg border border-border/60 bg-muted/[0.04] p-3">
    <div class="mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div class="min-w-0">
        <h3 class="text-ui-sm font-semibold text-foreground">{c.title}</h3>
        <p class="mt-0.5 text-ui-2xs text-muted-foreground">{c.caption}</p>
      </div>
      <div class="flex shrink-0 items-center gap-3 pt-0.5">
        {#each c.legend as l (l.label)}
          <span class="inline-flex items-center gap-1.5 text-ui-2xs text-muted-foreground">
            <span class="size-1.5 shrink-0 rounded-full" style="background: {l.color}"></span>
            {l.label}
          </span>
        {/each}
      </div>
    </div>
    {#if c.ready}
      <div class="h-52"><EChartPanel option={c.option} /></div>
    {:else}
      <div class="flex h-52 flex-col items-center justify-center gap-1 rounded-md bg-muted/20 text-center">
        <p class="text-ui-xs text-muted-foreground">Collecting samples…</p>
        <p class="max-w-[18rem] text-ui-2xs text-muted-foreground/60">
          Rates need two readings. {autoRefresh ? 'The next one lands in a few seconds.' : 'Turn on Live, or hit Refresh again.'}
        </p>
      </div>
    {/if}
  </div>
{/snippet}

{#snippet dataSection(/** @type {any} */ s)}
  <div class="mb-2 flex items-end justify-between gap-3">
    <div class="min-w-0">
      <div class="flex items-baseline gap-2">
        <h2 class="text-ui-sm font-semibold text-foreground">{s.title}</h2>
        {#if s.rows?.length}
          <span class="text-ui-2xs tabular-nums text-muted-foreground">{big(s.rows.length)}</span>
        {/if}
      </div>
      {#if s.caption}<p class="mt-0.5 text-ui-2xs text-muted-foreground">{s.caption}</p>{/if}
    </div>
    {#if s.onRefresh}
      <button
        type="button"
        class="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-ui-xs text-foreground/85 transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        disabled={refreshing}
        onclick={s.onRefresh}
      >
        <RefreshCw class={cn('size-3.5 shrink-0', refreshing && 'animate-spin')} /> Refresh
      </button>
    {/if}
  </div>
  {@render dataGrid(s.rows ?? [], s.empty ?? 'No data.')}
{/snippet}

{#snippet dataGrid(/** @type {any[]} */ rows, /** @type {string} */ empty)}
  {#if !rows || rows.length === 0}
    <div class="rounded-lg border border-border/40 bg-muted/[0.04] py-10 text-center text-ui-xs text-muted-foreground/70">{empty}</div>
  {:else}
    <div class="app-scroll max-h-96 overflow-auto rounded-lg border border-border/50">
      <table class="w-full border-collapse text-ui-2xs">
        <thead>
          <tr>
            <th class="sticky top-0 z-10 w-8 whitespace-nowrap border-b border-border/50 bg-panel px-2 py-1.5 text-right font-medium text-muted-foreground/60">#</th>
            {#each keysOf(rows) as k (k)}
              <th class="sticky top-0 z-10 whitespace-nowrap border-b border-border/50 bg-panel px-2.5 py-1.5 text-left font-medium text-muted-foreground">{humanize(k)}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as row, i (i)}
            <tr class={cn('transition-colors hover:bg-accent/30', isBlocked(row) && 'bg-destructive/[0.06]')}>
              <td class="border-b border-border/20 px-2 py-1 text-right tabular-nums text-muted-foreground/50">{i + 1}</td>
              {#each keysOf(rows) as k (k)}
                <td class="max-w-[280px] truncate border-b border-border/20 px-2.5 py-1 font-mono text-foreground/85" title={cell(row[k])}>
                  {#if k === 'state' || k === 'command'}
                    {#if row[k]}
                      <span class={cn('inline-flex items-center rounded px-1.5 py-px font-sans text-ui-3xs', stateTone(row[k]))}>{row[k]}</span>
                    {:else}
                      <span class="text-muted-foreground/40">–</span>
                    {/if}
                  {:else}
                    {cell(row[k])}
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/snippet}

<style>
  /* Config list perf: content-visibility lets the engine skip layout/paint for
     off-screen rows, so scrolling the full ~350-row pg_settings list stays smooth.
     The intrinsic size is the collapsed row height - `auto` lets the engine
     remember the real height of an expanded row once it has measured it. */
  .cfg-row {
    content-visibility: auto;
    contain-intrinsic-size: auto 48px;
  }

  /* Live indicator: a slow, low-contrast pulse that reads as "polling" without
     pulling the eye away from the data. Held to one ring so it stays quiet. */
  .live-ping {
    animation: live-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
  }
  @keyframes live-ping {
    0%   { transform: scale(1);   opacity: 0.7; }
    70%  { transform: scale(2.4); opacity: 0; }
    100% { transform: scale(2.4); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .live-ping { animation: none; }
  }
</style>
