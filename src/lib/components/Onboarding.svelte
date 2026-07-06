<script>
  import { fade, fly } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import Logo from './Logo.svelte'
  import Icon from './Icon.svelte'
  import DbIcon from './DbIcon.svelte'
  import LicenseActivation from './LicenseActivation.svelte'

  let { open = $bindable(false), onconnect = () => {}, onsample = () => {} } = $props()

  let step = $state(1)
  let activeFeature = $state(0)
  const TOTAL = 4
  const LICENSE_STEP = 3
  const KEY = 'stroke:onboarded'

  // Short labels for the header stepper.
  const STEP_LABELS = ['Welcome', 'Toolkit', 'Activate', 'Connect']

  // License-step perks, shown under the activation form.
  const LICENSE_PERKS = [
    { icon: 'zap', label: 'All features' },
    { icon: 'refresh-cw', label: 'Future updates' },
    { icon: 'shield-check', label: 'Unlimited connections' },
  ]

  // Database brand marks shown on the welcome + connect steps.
  const BRANDS = ['postgres', 'mysql', 'sqlite', 'mssql', 'clickhouse', 'd1', 'supabase', 'neon', 'planetscale', 'prisma']

  const FEATURES = [
    { icon: 'database', title: 'Connect any database', desc: 'Postgres, MySQL, SQLite, ClickHouse, Cloudflare D1 and more — all from one window.', preview: 'connect' },
    { icon: 'table-2',  title: 'Browse & edit rows',   desc: 'Filter, sort, paginate, and edit data with a fast spreadsheet feel.',   preview: 'table'   },
    { icon: 'terminal', title: 'Full SQL editor',      desc: 'A multi-tab Monaco editor with history, saved queries, and AI fixes.', preview: 'sql'     },
    { icon: 'bot',      title: 'AI assistance',        desc: 'Generate SQL, fix errors, and ask questions with any AI model.',        preview: 'ai'      },
  ]

  // Everything beyond the core four — shown as a minimal capability grid.
  const CAPABILITIES = [
    { icon: 'layout-template', title: 'Schema explorer',    desc: 'Browse schemas, tables, indexes, enums & views.' },
    { icon: 'workflow',        title: 'Visual ERD',          desc: 'See table relationships as a live diagram.' },
    { icon: 'share-2',         title: 'Diagrams',            desc: 'Author & render Mermaid diagrams from your DB.' },
    { icon: 'bar-chart-3',     title: 'Charts & dashboards', desc: 'Turn query results into charts and pin them.' },
    { icon: 'git-compare',     title: 'Data diff',           desc: 'Compare two tables or result sets row by row.' },
    { icon: 'history',         title: 'Schema timeline',     desc: 'Track how your schema changed via snapshots.' },
    { icon: 'notebook-pen',    title: 'SQL notebooks',       desc: 'Mix SQL cells and notes in one document.' },
    { icon: 'blocks',          title: 'Extensions',          desc: 'Cell formatters, ID generators & transforms.' },
    { icon: 'search',          title: 'Global search',       desc: 'Find rows across every table at once.' },
    { icon: 'shield-check',    title: 'Security',            desc: 'Inspect roles, users & row-level policies.' },
    { icon: 'archive',         title: 'Backup & restore',    desc: 'Export and import your data in a click.' },
    { icon: 'plug',            title: 'MCP server',          desc: 'Expose your DB to external AI tools.' },
  ]

  const HEADINGS = [
    { title: 'Welcome to Stroke',    desc: "The developer's database client — connect, explore, and query with AI." },
    { title: 'A complete toolkit',   desc: 'Everything for working with your data, in one window.' },
    { title: 'Activate Stroke',      desc: 'Enter your license key, or start a free trial — you can always activate later.' },
    { title: "You're all set",       desc: 'Connect a real database, or explore with sample data first.' },
  ]

  const heading = $derived(HEADINGS[step - 1])
  const previewType = $derived(FEATURES[activeFeature].preview)

  function next() { step = Math.min(step + 1, TOTAL) }
  function back() { step = Math.max(step - 1, 1) }

  // "Skip" on the license step means "skip for now" → continue to the connection
  // screen (still in trial), not abandon onboarding. Elsewhere it exits the tour.
  function headerSkip() {
    if (step === LICENSE_STEP) next()
    else done(false)
  }

  function selectFeature(i) {
    activeFeature = Math.max(0, Math.min(i, FEATURES.length - 1))
  }

  function onFeatureKeydown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); selectFeature(activeFeature + 1) }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); selectFeature(activeFeature - 1) }
  }

  function done(connect = false) {
    try { localStorage.setItem(KEY, '1') } catch {}
    open = false
    if (connect) onconnect()
  }

  function trySample() {
    try { localStorage.setItem(KEY, '1') } catch {}
    open = false
    onsample()
  }

  function onWindowKeydown(e) {
    if (!open) return
    if (e.key === 'Escape') { e.preventDefault(); done(false) }
    else if (e.key === 'Enter' && step < TOTAL) { e.preventDefault(); next() }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
  <div class="onboarding fixed inset-0 z-[200] flex flex-col bg-background" transition:fade={{ duration: 180 }}>
    <!-- Ambient: soft top glow + faint dot grid, kept restrained -->
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-[62%]"
      style="background: radial-gradient(ellipse 60% 55% at 50% -10%, color-mix(in oklch, var(--primary) 10%, transparent), transparent 72%);"
    ></div>
    <div
      class="pointer-events-none absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,black,transparent_75%)]"
      style="background-image: radial-gradient(color-mix(in oklch, var(--foreground) 6%, transparent) 1px, transparent 1px); background-size: 22px 22px;"
    ></div>

    <!-- ── Header ── -->
    <header class="relative z-10 flex h-14 shrink-0 items-center justify-between border-b border-border/40 px-6">
      <div class="flex items-center gap-2.5">
        <Logo class="size-[18px]" />
        <span class="text-[13px] font-semibold tracking-tight text-foreground">Stroke</span>
      </div>

      <!-- Segmented stepper -->
      <nav class="absolute left-1/2 flex -translate-x-1/2 items-center gap-2" aria-label="Progress">
        {#each STEP_LABELS as label, i}
          {@const n = i + 1}
          {@const state = n === step ? 'current' : n < step ? 'done' : 'todo'}
          <div class="flex items-center gap-2">
            <span class={
              'flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium transition-colors duration-200 ' +
              (state === 'current' ? 'bg-primary/12 text-foreground'
               : state === 'done'  ? 'text-muted-foreground/70'
               : 'text-muted-foreground/35')
            }>
              <span class={
                'grid size-4 place-items-center rounded-full text-[9px] font-semibold transition-colors duration-200 ' +
                (state === 'current' ? 'bg-primary text-primary-foreground'
                 : state === 'done'  ? 'bg-primary/25 text-foreground'
                 : 'bg-muted text-muted-foreground/50')
              }>
                {#if state === 'done'}<Icon name="check" class="size-2.5" strokeWidth={2.5} />{:else}{n}{/if}
              </span>
              <span class="hidden sm:inline">{label}</span>
            </span>
            {#if n < TOTAL}
              <span class="h-px w-4 rounded-full {n < step ? 'bg-primary/30' : 'bg-border'}"></span>
            {/if}
          </div>
        {/each}
      </nav>

      {#if step < TOTAL}
        <button type="button" class="text-[13px] text-muted-foreground/70 transition-colors hover:text-foreground" onclick={headerSkip}>
          {step === LICENSE_STEP ? 'Skip for now' : 'Skip'}
        </button>
      {:else}
        <div class="w-10"></div>
      {/if}
    </header>

    <!-- ── Slide area ── -->
    <div class="relative z-10 min-h-0 flex-1 overflow-hidden">
      {#key step}
        <div
          class="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto px-6 py-10"
          in:fade={{ duration: 150, easing: cubicOut }}
          out:fade={{ duration: 90 }}
        >
          <div class="flex w-full max-w-4xl flex-col items-center gap-8">

            <!-- Step heading -->
            <div class="flex flex-col items-center gap-2.5 text-center">
              {#if step === 1}
                <div class="mb-1 grid size-14 place-items-center rounded-2xl border border-border/50 bg-card/40 shadow-sm" in:fly={{ y: 8, duration: 300, easing: cubicOut }}>
                  <Logo class="size-7" />
                </div>
              {/if}
              <h1 class="text-[26px] font-semibold tracking-tight text-foreground text-balance">{heading.title}</h1>
              <p class="max-w-md text-[15px] leading-relaxed text-muted-foreground text-balance">{heading.desc}</p>
            </div>

            <!-- ── Step 1: Feature carousel ── -->
            {#if step === 1}
              <div class="grid w-full grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
                <!-- Feature list -->
                <div class="flex flex-col gap-1.5" role="tablist" aria-label="Features" tabindex="0" onkeydown={onFeatureKeydown}>
                  {#each FEATURES as f, i}
                    {@const active = i === activeFeature}
                    <button
                      type="button" role="tab" aria-selected={active}
                      class={
                        'group flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-200 ' +
                        (active ? 'border-primary/25 bg-primary/[0.06] shadow-sm' : 'border-transparent hover:border-border/60 hover:bg-muted/40')
                      }
                      onclick={() => selectFeature(i)}
                    >
                      <span class={
                        'grid size-9 shrink-0 place-items-center rounded-lg border transition-colors ' +
                        (active ? 'border-primary/25 bg-primary/12 text-primary' : 'border-border/60 bg-muted/50 text-muted-foreground group-hover:text-foreground')
                      }>
                        <Icon name={f.icon} class="size-[18px]" />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block text-[13.5px] font-semibold text-foreground">{f.title}</span>
                        <span class="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{f.desc}</span>
                      </span>
                    </button>
                  {/each}
                </div>

                <!-- Preview — a little app window -->
                <div class="relative hidden overflow-hidden rounded-xl border border-border/60 bg-muted/20 sm:block">
                  <div class="flex items-center gap-1.5 border-b border-border/50 bg-card/40 px-3 py-2">
                    <span class="size-2 rounded-full bg-muted-foreground/25"></span>
                    <span class="size-2 rounded-full bg-muted-foreground/25"></span>
                    <span class="size-2 rounded-full bg-muted-foreground/25"></span>
                    <span class="ml-1.5 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground/70">
                      <Icon name={FEATURES[activeFeature].icon} class="size-3" />
                      {FEATURES[activeFeature].title}
                    </span>
                  </div>
                  <div class="relative h-[236px]">
                    {#key activeFeature}
                      <div class="absolute inset-0 flex items-center p-4" in:fade={{ duration: 180 }}>
                        {#if previewType === 'connect'}
                          <div class="flex w-full flex-col gap-2">
                            {#each [['postgres', 'PostgreSQL', true], ['mysql', 'MySQL', false], ['sqlite', 'SQLite', false], ['d1', 'Cloudflare D1', false]] as [id, name, on]}
                              <div class="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card/60 px-3 py-2">
                                <DbIcon {id} class="size-4 text-muted-foreground" />
                                <span class="text-xs font-medium text-foreground">{name}</span>
                                {#if on}
                                  <span class="ml-auto flex items-center gap-1 text-[10px] font-medium text-emerald-500">
                                    <span class="size-1.5 rounded-full bg-emerald-500"></span>Connected
                                  </span>
                                {:else}
                                  <span class="ml-auto text-[10px] text-muted-foreground/40">Connect</span>
                                {/if}
                              </div>
                            {/each}
                          </div>

                        {:else if previewType === 'table'}
                          <div class="flex w-full flex-col overflow-hidden rounded-lg border border-border/60">
                            <div class="grid grid-cols-3 border-b border-border/60 bg-muted/60 text-[10px] font-medium text-muted-foreground">
                              {#each ['id', 'name', 'status'] as h}<div class="border-r border-border/60 px-2.5 py-1.5 last:border-r-0">{h}</div>{/each}
                            </div>
                            {#each [['1', 'Ada Lovelace', 'active'], ['2', 'Alan Turing', 'active'], ['3', 'Grace Hopper', 'idle'], ['4', 'Edsger D.', 'active']] as row, ri}
                              <div class="grid grid-cols-3 text-[10px] text-foreground {ri % 2 ? 'bg-card/40' : ''}">
                                {#each row as cell}<div class="truncate border-r border-border/60 px-2.5 py-1.5 last:border-r-0">{cell}</div>{/each}
                              </div>
                            {/each}
                          </div>

                        {:else if previewType === 'sql'}
                          <div class="flex w-full flex-col overflow-hidden rounded-lg border border-border/60 bg-card/60 font-mono text-[10px] leading-relaxed">
                            <div class="flex-1 space-y-1 p-3.5">
                              <div><span class="text-primary">SELECT</span> <span class="text-foreground">id, name, email</span></div>
                              <div><span class="text-primary">FROM</span> <span class="text-foreground">users</span></div>
                              <div><span class="text-primary">WHERE</span> <span class="text-foreground">status =</span> <span class="text-emerald-500">'active'</span></div>
                              <div><span class="text-primary">ORDER BY</span> <span class="text-foreground">created_at</span> <span class="text-primary">DESC</span></div>
                              <div><span class="text-primary">LIMIT</span> <span class="text-foreground">50</span><span class="text-muted-foreground">;</span></div>
                            </div>
                          </div>

                        {:else}
                          <div class="flex w-full flex-col justify-center gap-2.5">
                            <div class="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-[10px] font-medium text-primary-foreground">
                              Show me the 10 newest signups
                            </div>
                            <div class="mr-auto max-w-[88%] rounded-2xl rounded-bl-sm border border-border/60 bg-card/60 px-3 py-2 text-[10px] text-foreground">
                              <div class="mb-1.5 flex items-center gap-1.5 text-muted-foreground">
                                <Icon name="sparkles" class="size-3 text-primary" /> Generated SQL
                              </div>
                              <code class="font-mono text-[9px] text-foreground">SELECT * FROM users ORDER BY created_at DESC LIMIT 10;</code>
                            </div>
                          </div>
                        {/if}
                      </div>
                    {/key}
                  </div>
                </div>
              </div>

              <!-- Supported brands strip -->
              <div class="flex flex-col items-center gap-2.5">
                <span class="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/45">Works with</span>
                <div class="flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5">
                  {#each BRANDS as id}
                    <DbIcon {id} class="size-[18px] text-muted-foreground/45 transition-colors hover:text-foreground" />
                  {/each}
                </div>
              </div>

            <!-- ── Step 2: Toolkit grid ── -->
            {:else if step === 2}
              <div class="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {#each CAPABILITIES as c, i}
                  <div
                    class="group flex flex-col gap-2 rounded-xl border border-border/50 bg-card/30 p-3.5 transition-all duration-150 hover:-translate-y-0.5 hover:border-border hover:bg-muted/30 hover:shadow-sm"
                    in:fly={{ y: 8, duration: 260, delay: i * 22, easing: cubicOut }}
                  >
                    <span class="grid size-8 place-items-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground transition-colors group-hover:border-primary/20 group-hover:bg-primary/10 group-hover:text-primary">
                      <Icon name={c.icon} class="size-4" />
                    </span>
                    <div class="min-w-0">
                      <p class="text-[13px] font-semibold text-foreground">{c.title}</p>
                      <p class="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{c.desc}</p>
                    </div>
                  </div>
                {/each}
              </div>
              <p class="-mt-3 flex items-center gap-1.5 text-xs text-muted-foreground/70">
                <Icon name="sparkles" class="size-3.5 text-primary/70" /> Press
                <kbd class="rounded border border-border/60 bg-muted/50 px-1.5 py-px font-mono text-[10px] text-foreground">⌘K</kbd>
                anytime to jump to any of these.
              </p>

            <!-- ── Step 3: Activate license ── -->
            {:else if step === LICENSE_STEP}
              <div class="flex w-full max-w-sm flex-col gap-5">
                <div class="overflow-hidden rounded-2xl border border-border/50 bg-card/30 shadow-sm">
                  <LicenseActivation compact onactivated={next} />
                </div>

                <div class="flex items-center justify-center gap-5">
                  {#each LICENSE_PERKS as perk (perk.label)}
                    <span class="flex items-center gap-1.5 text-[11.5px] text-muted-foreground/55">
                      <Icon name={perk.icon} class="size-3 shrink-0" />
                      {perk.label}
                    </span>
                  {/each}
                </div>

                <p class="text-center text-xs text-muted-foreground/60">
                  No license yet?
                  <a href="https://stroke.click" target="_blank" rel="noopener noreferrer"
                    class="font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline">stroke.click →</a>
                </p>
              </div>

            <!-- ── Step 4: Connect ── -->
            {:else}
              <div class="flex w-full max-w-md flex-col gap-3">
                <button
                  type="button"
                  class="group flex w-full items-center gap-3.5 rounded-2xl bg-primary px-5 py-4 text-left shadow-sm transition-all hover:opacity-95 active:scale-[0.99]"
                  onclick={() => done(true)}
                >
                  <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-foreground/15 text-primary-foreground">
                    <Icon name="plus" class="size-5" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-semibold text-primary-foreground">Add a connection</span>
                    <span class="block text-xs text-primary-foreground/70">Connect to your own database now.</span>
                  </span>
                  <Icon name="arrow-right" class="size-5 shrink-0 text-primary-foreground transition-transform duration-200 group-hover:translate-x-1" />
                </button>

                <button
                  type="button"
                  class="group flex w-full items-center gap-3.5 rounded-2xl border border-border/60 bg-card/40 px-5 py-4 text-left transition-all hover:border-border hover:bg-muted/50 active:scale-[0.99]"
                  onclick={trySample}
                >
                  <span class="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <Icon name="flask-conical" class="size-5" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-semibold text-foreground">Try a sample database</span>
                    <span class="block text-xs text-muted-foreground">Explore a ready-made SQLite dataset first.</span>
                  </span>
                  <Icon name="arrow-right" class="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1" />
                </button>
              </div>
            {/if}

          </div>
        </div>
      {/key}
    </div>

    <!-- ── Footer nav ── -->
    <footer class="relative z-10 flex h-16 shrink-0 items-center justify-between border-t border-border/40 px-6">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-0"
        disabled={step === 1}
        onclick={back}
      >
        <Icon name="arrow-left" class="size-4" />
        Back
      </button>

      <span class="text-[13px] text-muted-foreground/70 tabular-nums">Step {step} of {TOTAL}</span>

      {#if step === LICENSE_STEP}
        <button
          type="button"
          class="group flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-6 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-muted/60 active:scale-[0.98]"
          onclick={next}
        >
          Start free trial
          <Icon name="arrow-right" class="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      {:else if step < TOTAL}
        <button
          type="button"
          class="group flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
          onclick={next}
        >
          Next
          <Icon name="arrow-right" class="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      {:else}
        <button
          type="button"
          class="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          onclick={() => done(false)}
        >
          Skip for now
        </button>
      {/if}
    </footer>
  </div>
{/if}
