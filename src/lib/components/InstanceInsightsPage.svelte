<script>
  import { onMount } from 'svelte'
  import { cn } from '$lib/utils.js'
  import EChartPanel from './EChartPanel.svelte'
  import {
    instanceVersion, instanceActivity, instanceState, instanceConfig, instanceReplication,
  } from '$lib/api.js'
  import Database from '@lucide/svelte/icons/database'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import Shield from '@lucide/svelte/icons/shield'
  import Settings from '@lucide/svelte/icons/settings-2'
  import Search from '@lucide/svelte/icons/search'

  let { active = false, connectionName = '', dbType = '' } = $props()

  const SUBTABS = [
    { id: 'activity', label: 'Activity', icon: Sparkles },
    { id: 'state', label: 'State', icon: Shield },
    { id: 'config', label: 'Config', icon: Settings },
    { id: 'replication', label: 'Replication', icon: Database },
  ]
  let subtab = $state('activity')
  let autoRefresh = $state(false)
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

  const supported = $derived(dbType === 'postgres' || dbType === 'mysql')
  const isPg = $derived((version?.engine ?? dbType) === 'postgres')

  onMount(() => { if (active && supported) void refreshAll() })

  // First-open fetch when the tab becomes active.
  let _everActive = false
  $effect(() => {
    if (active && supported && !_everActive) { _everActive = true; void refreshAll() }
  })

  // Auto-refresh loop (5s) while enabled + visible.
  $effect(() => {
    if (!autoRefresh || !active || !supported) return
    const id = setInterval(() => { void refreshCurrent() }, 5000)
    return () => clearInterval(id)
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
    error = ''
    await Promise.all([loadVersion(), refreshActivity(), refreshState(), refreshConfig(), refreshReplication()])
    lastUpdated = Date.now()
    // Per-second rates (TPS, tuples, block I/O) are deltas between two samples,
    // so a single fetch leaves every rate stuck at 0.00 until the 5s auto-refresh
    // ticks. Take a quick second activity sample on first open so the rate cards
    // and timelines populate immediately.
    if (active && samples.length < 2) {
      await new Promise((r) => setTimeout(r, 1000))
      if (active) { await refreshActivity(); lastUpdated = Date.now() }
    }
  }
  async function refreshCurrent() {
    await refreshActivity() // always — keeps the charts flowing regardless of the visible tab
    if (subtab === 'state') await refreshState()
    else if (subtab === 'config') await refreshConfig()
    else if (subtab === 'replication') await refreshReplication()
    lastUpdated = Date.now()
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
  const timeLabels = $derived(samples.slice(1).map((s) => new Date(s.t).toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })))

  const num = (/** @type {number} */ n, /** @type {number} */ dp = 2) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
  const big = (/** @type {number} */ n) => (n ?? 0).toLocaleString('en-US')

  // ── Chart options ──────────────────────────────────────────────────────────
  const AXIS = { axisLine: { lineStyle: { color: 'rgba(148,163,184,0.25)' } }, axisLabel: { color: 'rgba(148,163,184,0.7)', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } } }
  const sessionsChart = $derived.by(() => ({
    tooltip: { trigger: 'axis' },
    legend: { data: ['Total', 'Active', 'Idle'], textStyle: { color: 'rgba(148,163,184,0.8)', fontSize: 10 }, top: 0 },
    grid: { left: 34, right: 12, top: 28, bottom: 22 },
    xAxis: { type: 'category', data: samples.map((s) => new Date(s.t).toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })), ...AXIS },
    yAxis: { type: 'value', ...AXIS },
    series: [
      { name: 'Total', type: 'line', smooth: true, symbolSize: 4, data: samples.map((s) => s.sessions.total), lineStyle: { color: '#5b8def' }, itemStyle: { color: '#5b8def' } },
      { name: 'Active', type: 'line', smooth: true, symbolSize: 4, data: samples.map((s) => s.sessions.active), lineStyle: { color: '#68c48c' }, itemStyle: { color: '#68c48c' } },
      { name: 'Idle', type: 'line', smooth: true, symbolSize: 4, data: samples.map((s) => s.sessions.idle), lineStyle: { color: '#e0b063' }, itemStyle: { color: '#e0b063' } },
    ],
  }))
  const txChart = $derived.by(() => ({
    tooltip: { trigger: 'axis' },
    legend: { data: ['TPS', 'Commits/s', 'Rollbacks/s'], textStyle: { color: 'rgba(148,163,184,0.8)', fontSize: 10 }, top: 0 },
    grid: { left: 34, right: 12, top: 28, bottom: 22 },
    xAxis: { type: 'category', data: timeLabels, ...AXIS },
    yAxis: { type: 'value', ...AXIS },
    series: [
      { name: 'Commits/s', type: 'bar', data: rateHistory.map((r) => +r.commits.toFixed(2)), itemStyle: { color: 'rgba(104,196,140,0.7)' } },
      { name: 'Rollbacks/s', type: 'bar', data: rateHistory.map((r) => +r.rollbacks.toFixed(2)), itemStyle: { color: 'rgba(224,176,99,0.7)' } },
      { name: 'TPS', type: 'line', smooth: true, symbolSize: 4, data: rateHistory.map((r) => +r.tps.toFixed(2)), lineStyle: { color: '#5b8def' }, itemStyle: { color: '#5b8def' } },
    ],
  }))
  const ioChart = $derived.by(() => ({
    tooltip: { trigger: 'axis' },
    legend: { data: ['Reads/s', 'Hits/s', 'Buffer Hit %'], textStyle: { color: 'rgba(148,163,184,0.8)', fontSize: 10 }, top: 0 },
    grid: { left: 40, right: 40, top: 28, bottom: 22 },
    xAxis: { type: 'category', data: timeLabels, ...AXIS },
    yAxis: [{ type: 'value', name: 'Blocks/s', ...AXIS }, { type: 'value', name: 'Hit %', min: 0, max: 100, ...AXIS }],
    series: [
      { name: 'Reads/s', type: 'bar', data: rateHistory.map((r) => +r.reads.toFixed(1)), itemStyle: { color: 'rgba(91,141,239,0.7)' } },
      { name: 'Hits/s', type: 'bar', data: rateHistory.map((r) => +r.hits.toFixed(1)), itemStyle: { color: 'rgba(104,196,140,0.7)' } },
      { name: 'Buffer Hit %', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 4, data: rateHistory.map((r) => +r.hitRatio.toFixed(1)), lineStyle: { color: '#e0b063' }, itemStyle: { color: '#e0b063' } },
    ],
  }))

  // ── Generic tables for State / Config / Replication ────────────────────────
  const configFiltered = $derived.by(() => {
    const q = configSearch.trim().toLowerCase()
    if (!q) return config
    return config.filter((c) => (c.name + ' ' + c.category + ' ' + c.description).toLowerCase().includes(q))
  })
  /** @param {any[]} rows */
  function keysOf(rows) { return rows?.length ? Object.keys(rows[0]) : [] }
  /** @param {any} v */
  function cell(v) { return v === null || v === undefined ? '–' : Array.isArray(v) ? (v.length ? v.join(', ') : '–') : String(v) }
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
  <!-- Header -->
  <div class="shrink-0 border-b border-border/50 px-5 py-4">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <Database class="size-4 shrink-0 text-muted-foreground/60" />
          <h1 class="text-base font-semibold text-foreground">Instance Insights</h1>
        </div>
        <div class="mt-1 flex items-center gap-2 text-ui-xs text-muted-foreground/60">
          <span>connection:</span>
          <span class="font-medium text-foreground/80">{connectionName || '—'}</span>
        </div>
        {#if version}
          <span class="mt-1.5 inline-flex items-center rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 font-mono text-ui-2xs text-foreground/70">{isPg ? 'PostgreSQL' : 'MySQL'} {version.version}</span>
        {/if}
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <button type="button" class={cn('inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-ui-xs transition-colors', autoRefresh ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border/60 text-muted-foreground/70 hover:bg-muted/40')} onclick={() => (autoRefresh = !autoRefresh)}>
          <span class={cn('size-3 rounded-full border transition-colors', autoRefresh ? 'border-primary bg-primary' : 'border-muted-foreground/40')}></span>
          Auto refresh
        </button>
        <button type="button" class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/60 px-2.5 text-ui-xs text-foreground/80 transition-colors hover:bg-muted/40" onclick={() => void refreshAll()}>
          <RefreshCw class="size-3" /> Refresh All
        </button>
      </div>
    </div>
  </div>

  {#if !supported}
    <div class="flex flex-1 items-center justify-center p-8 text-center text-ui-sm text-muted-foreground/50">
      Instance Insights is available for PostgreSQL and MySQL connections.
    </div>
  {:else}
    <!-- Sub-tabs -->
    <div class="flex shrink-0 items-center justify-between gap-3 border-b border-border/40 px-5 py-2">
      <div class="inline-flex items-center gap-0.5 rounded-lg border border-border/50 bg-muted/20 p-0.5">
        {#each SUBTABS as t (t.id)}
          <button type="button" class={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-ui-xs font-medium transition-colors', subtab === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground/60 hover:text-foreground')} onclick={() => (subtab = t.id)}>
            <t.icon class="size-3.5" /> {t.label}
          </button>
        {/each}
      </div>
      {#if lastUpdated}
        <span class="text-ui-2xs text-muted-foreground/45">Last updated: {new Date(lastUpdated).toLocaleString()}</span>
      {/if}
    </div>

    <div class="app-scroll min-h-0 flex-1 overflow-y-auto p-5">
      {#if error}
        <div class="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-ui-xs text-destructive">{error}</div>
      {/if}

      <!-- ── ACTIVITY ── -->
      {#if subtab === 'activity'}
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div class="rounded-xl border border-border/50 bg-card/40 p-3">
            <p class="text-ui-2xs uppercase tracking-wide text-muted-foreground/50">Sessions: <span class="text-base font-bold text-foreground">{activity?.sessions.total ?? '—'}</span></p>
            <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-ui-2xs text-muted-foreground/60">
              <span>Active: <b class="text-foreground/80">{activity?.sessions.active ?? '—'}</b></span>
              <span>Idle: <b class="text-foreground/80">{activity?.sessions.idle ?? '—'}</b></span>
              <span>Max: <b class="text-foreground/80">{activity?.sessions.max ?? '—'}</b></span>
              <span>Usage: <b class="text-foreground/80">{num(activity?.sessions.usagePct)}%</b></span>
            </div>
          </div>
          <div class="rounded-xl border border-border/50 bg-card/40 p-3">
            <p class="text-ui-2xs uppercase tracking-wide text-muted-foreground/50">TPS: <span class="text-base font-bold text-foreground">{num(cur?.tps ?? 0)}/s</span></p>
            <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-ui-2xs text-muted-foreground/60">
              <span>Commits/s: <b class="text-foreground/80">{num(cur?.commits ?? 0)}</b></span>
              <span>Rollbacks/s: <b class="text-foreground/80">{num(cur?.rollbacks ?? 0)}</b></span>
              <span>Commits: <b class="text-foreground/80">{big(activity?.counters.commits ?? 0)}</b></span>
              <span>Rollbacks: <b class="text-foreground/80">{big(activity?.counters.rollbacks ?? 0)}</b></span>
            </div>
          </div>
          <div class="rounded-xl border border-border/50 bg-card/40 p-3">
            <p class="text-ui-2xs uppercase tracking-wide text-muted-foreground/50">Tuples: <span class="text-base font-bold text-foreground">{num((cur?.tupUpdated ?? 0) + (cur?.tupDeleted ?? 0))}/s</span></p>
            <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-ui-2xs text-muted-foreground/60">
              <span>Updates/s: <b class="text-foreground/80">{num(cur?.tupUpdated ?? 0)}</b></span>
              <span>Deletes/s: <b class="text-foreground/80">{num(cur?.tupDeleted ?? 0)}</b></span>
              <span>Fetched: <b class="text-foreground/80">{big(activity?.counters.tupFetched ?? 0)}</b></span>
              <span>Returned: <b class="text-foreground/80">{big(activity?.counters.tupReturned ?? 0)}</b></span>
            </div>
          </div>
          <div class="rounded-xl border border-border/50 bg-card/40 p-3">
            <p class="text-ui-2xs uppercase tracking-wide text-muted-foreground/50">Block I/O: <span class="text-base font-bold text-foreground">{num((activity?.bufferHitRatio ?? 0) * 100)}%</span></p>
            <div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-ui-2xs text-muted-foreground/60">
              <span>Reads/s: <b class="text-foreground/80">{num(cur?.reads ?? 0)}</b></span>
              <span>Hits/s: <b class="text-foreground/80">{num(cur?.hits ?? 0)}</b></span>
              <span>Total Reads: <b class="text-foreground/80">{big(activity?.counters.blksRead ?? 0)}</b></span>
              <span>Total Hits: <b class="text-foreground/80">{big(activity?.counters.blksHit ?? 0)}</b></span>
            </div>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div class="rounded-xl border border-border/50 bg-card/30 p-3">
            <p class="mb-1 text-ui-sm font-semibold text-foreground">Sessions Timeline</p>
            <div class="h-56"><EChartPanel option={sessionsChart} /></div>
          </div>
          <div class="rounded-xl border border-border/50 bg-card/30 p-3">
            <p class="mb-1 text-ui-sm font-semibold text-foreground">Transactions Timeline</p>
            <div class="h-56"><EChartPanel option={txChart} /></div>
          </div>
        </div>
        <div class="mt-4 rounded-xl border border-border/50 bg-card/30 p-3">
          <p class="mb-1 text-ui-sm font-semibold text-foreground">Block I/O Timeline</p>
          <div class="h-56"><EChartPanel option={ioChart} /></div>
        </div>

      <!-- ── STATE ── -->
      {:else if subtab === 'state'}
        {@render section('Active Sessions', stateData?.sessions ?? [], refreshState)}
        <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>{@render tableCard('Locks', stateData?.locks ?? [])}</div>
          <div>{@render tableCard('Prepared Transactions', stateData?.preparedTransactions ?? [])}</div>
        </div>

      <!-- ── CONFIG ── -->
      {:else if subtab === 'config'}
        <div class="mb-3 flex items-center justify-between gap-3">
          <div>
            <p class="text-ui-sm font-semibold text-foreground">Configuration</p>
            <p class="text-ui-2xs text-muted-foreground/50">{isPg ? 'Searchable pg_settings' : 'Server variables'}</p>
          </div>
          <button type="button" class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/60 px-2.5 text-ui-xs text-foreground/80 hover:bg-muted/40" onclick={() => void refreshConfig()}><RefreshCw class="size-3" /> Refresh</button>
        </div>
        <div class="relative mb-2">
          <Search class="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/40" />
          <input bind:value={configSearch} placeholder="Search setting name, category, or description…" class="h-8 w-full rounded-lg border border-border/60 bg-background pl-8 pr-3 text-ui-xs text-foreground outline-none focus:border-ring" />
        </div>
        {#if !configFiltered.length}
          <div class="rounded-lg border border-border/40 bg-card/20 py-8 text-center text-ui-xs text-muted-foreground/40">No settings found</div>
        {:else}
          <!-- Fixed-layout + content-visibility keeps scrolling smooth across the ~350 pg_settings rows:
               fixed layout skips per-cell column measurement; content-visibility skips off-screen row paint. -->
          <div class="overflow-x-auto overflow-y-hidden rounded-lg border border-border/40">
            <table class="cfg-table w-full border-collapse text-ui-2xs">
              <colgroup>
                <col style="width:3rem" />
                <col style="width:17rem" />
                <col style="width:16rem" />
                <col style="width:9rem" />
                <col style="width:4rem" />
                <col style="width:7rem" />
                <col />
              </colgroup>
              <thead>
                <tr class="bg-muted/25">
                  {#each ['#','name','category','value','unit','requiresRestart','description'] as h (h)}
                    <th class="whitespace-nowrap border-b border-border/40 px-2.5 py-1.5 text-left font-medium text-muted-foreground/50">{h}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each configFiltered as row, i (row.name ?? i)}
                  <tr class="cfg-row">
                    <td class="truncate border-b border-border/15 px-2 py-1 text-muted-foreground/40">{i + 1}</td>
                    <td class="truncate border-b border-border/15 px-2.5 py-1 font-mono text-foreground/80" title={cell(row.name)}>{cell(row.name)}</td>
                    <td class="truncate border-b border-border/15 px-2.5 py-1 text-foreground/70" title={cell(row.category)}>{cell(row.category)}</td>
                    <td class="truncate border-b border-border/15 px-2.5 py-1 font-mono text-foreground/80" title={cell(row.value)}>{cell(row.value)}</td>
                    <td class="truncate border-b border-border/15 px-2.5 py-1 font-mono text-muted-foreground/60">{cell(row.unit)}</td>
                    <td class="truncate border-b border-border/15 px-2.5 py-1 text-muted-foreground/60">{cell(row.requiresRestart)}</td>
                    <td class="truncate border-b border-border/15 px-2.5 py-1 text-muted-foreground/60" title={cell(row.description)}>{cell(row.description)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}

      <!-- ── REPLICATION ── -->
      {:else if subtab === 'replication'}
        {@render section('Replication Stats', replication?.stats ?? [], refreshReplication)}
        <div class="mt-4">{@render tableCard('Replication Slots', replication?.slots ?? [])}</div>
      {/if}
    </div>
  {/if}
</div>

{#snippet section(/** @type {string} */ title, /** @type {any[]} */ rows, /** @type {() => void} */ onRefresh)}
  <div class="mb-2 flex items-center justify-between">
    <p class="text-ui-sm font-semibold text-foreground">{title}</p>
    <button type="button" class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/60 px-2.5 text-ui-xs text-foreground/80 hover:bg-muted/40" onclick={onRefresh}><RefreshCw class="size-3" /> Refresh</button>
  </div>
  {@render grid(rows)}
{/snippet}

{#snippet tableCard(/** @type {string} */ title, /** @type {any[]} */ rows)}
  <p class="mb-2 text-ui-sm font-semibold text-foreground">{title}</p>
  {@render grid(rows)}
{/snippet}

{#snippet grid(/** @type {any[]} */ rows)}
  {#if !rows || rows.length === 0}
    <div class="rounded-lg border border-border/40 bg-card/20 py-8 text-center text-ui-xs text-muted-foreground/40">No data found</div>
  {:else}
    <div class="overflow-x-auto overflow-y-hidden rounded-lg border border-border/40">
      <table class="w-full border-collapse text-ui-2xs">
        <thead>
          <tr class="bg-muted/25">
            <th class="whitespace-nowrap border-b border-border/40 px-2 py-1.5 text-left font-medium text-muted-foreground/50">#</th>
            {#each keysOf(rows) as k}
              <th class="whitespace-nowrap border-b border-border/40 px-2.5 py-1.5 text-left font-medium text-muted-foreground/50">{k}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as row, i (i)}
            <tr class="transition-colors hover:bg-muted/15">
              <td class="border-b border-border/15 px-2 py-1 text-muted-foreground/40">{i + 1}</td>
              {#each keysOf(rows) as k}
                <td class="max-w-[280px] truncate border-b border-border/15 px-2.5 py-1 font-mono text-foreground/80">{cell(row[k])}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/snippet}

<style>
  /* Config table perf: fixed layout avoids O(rows×cols) column re-measurement on every
     reflow; content-visibility lets the engine skip layout/paint of off-screen rows so
     scrolling the full ~350-row pg_settings list stays smooth. */
  .cfg-table {
    table-layout: fixed;
  }
  .cfg-row {
    content-visibility: auto;
    contain-intrinsic-size: auto 25px;
  }
</style>
