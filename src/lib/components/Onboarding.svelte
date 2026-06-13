<script>
  import { fly } from 'svelte/transition'
  import { fade } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import Database      from '@lucide/svelte/icons/database'
  import Logo          from './Logo.svelte'
  import Table2        from '@lucide/svelte/icons/table-2'
  import Bot           from '@lucide/svelte/icons/bot'
  import Terminal      from '@lucide/svelte/icons/terminal'
  import ArrowRight    from '@lucide/svelte/icons/arrow-right'
  import ArrowLeft     from '@lucide/svelte/icons/arrow-left'
  import Plus          from '@lucide/svelte/icons/plus'
  import Sparkles      from '@lucide/svelte/icons/sparkles'
  import FlaskConical  from '@lucide/svelte/icons/flask-conical'

  let { open = $bindable(false), onconnect = () => {}, onsample = () => {} } = $props()

  let step = $state(1)
  let prev = $state(0)
  let activeFeature = $state(0)
  const TOTAL = 3
  const KEY = 'stroke:onboarded'

  const forward = $derived(step >= prev)

  const FEATURES = [
    { icon: Database, title: 'Connect any database', desc: 'PostgreSQL, MySQL, SQLite, and Cloudflare D1 — all from one window.', preview: 'connect' },
    { icon: Table2,   title: 'Browse & edit rows',   desc: 'Filter, sort, paginate, and edit data with a fast spreadsheet feel.',   preview: 'table'   },
    { icon: Terminal, title: 'Full SQL editor',      desc: 'A multi-tab Monaco editor with history, saved queries, and AI fixes.', preview: 'sql'     },
    { icon: Bot,      title: 'AI assistance',        desc: 'Generate SQL, fix errors, and ask questions with any AI model.',        preview: 'ai'      },
  ]

  const TIPS = [
    'Press ⌘K anytime to open the command palette and jump anywhere.',
    'Ask the AI to write or fix SQL — it already knows your schema.',
    'Edit cells inline, then review every change before you commit.',
    'Save queries and revisit your full run history whenever you need.',
  ]

  const HEADINGS = [
    { title: 'Welcome to Stroke',   desc: "The developer's database client — connect, explore, and query with AI." },
    { title: 'Get productive fast', desc: 'A few things worth knowing before you dive in.' },
    { title: "You're all set",      desc: 'Connect a real database, or explore with sample data first.' },
  ]

  const heading = $derived(HEADINGS[step - 1])
  const previewType = $derived(FEATURES[activeFeature].preview)

  function next() { prev = step; step = Math.min(step + 1, TOTAL) }
  function back() { prev = step; step = Math.max(step - 1, 1) }

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
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
  <div
    class="fixed inset-0 z-[200] flex flex-col bg-background"
    transition:fade={{ duration: 160 }}
  >
    <!-- Ambient glow at the top of the screen -->
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-[55%]"
      style="background: radial-gradient(ellipse 55% 50% at 50% -8%, color-mix(in oklch, var(--primary) 8%, transparent), transparent 70%);"
    ></div>

    <!-- ── Header ── -->
    <header class="relative flex h-14 shrink-0 items-center justify-between border-b border-border/50 px-8">
      <div class="flex items-center gap-2.5">
        <Logo class="size-5" />
        <span class="text-sm font-semibold text-foreground">Stroke</span>
      </div>

      <!-- Step indicator (cult-ui dots) -->
      <div class="flex items-center justify-center gap-2" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={TOTAL}>
        {#each Array(TOTAL) as _, i}
          <span class="rounded-full transition-all duration-200 {
            i + 1 === step ? 'size-2.5 bg-primary' :
            i + 1 < step   ? 'size-2 bg-primary/60' :
                             'size-2 bg-muted-foreground/30'
          }"></span>
        {/each}
      </div>

      {#if step < TOTAL}
        <button
          type="button"
          class="text-sm text-muted-foreground transition-colors hover:text-foreground"
          onclick={() => done(false)}
        >Skip</button>
      {:else}
        <div class="w-8"></div>
      {/if}
    </header>

    <!-- ── Slide area ── -->
    <div class="relative min-h-0 flex-1 overflow-hidden">
      {#key step}
        <div
          class="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto px-6 py-10"
          in:fly={{ x: forward ? 50 : -50, duration: 280, easing: cubicOut }}
          out:fly={{ x: forward ? -50 : 50, duration: 220, easing: cubicOut }}
        >
          <div class="flex w-full max-w-3xl flex-col items-center gap-9">

            <!-- Step heading -->
            <div class="flex flex-col items-center gap-2.5 text-center">
              <h1 class="text-3xl font-bold tracking-tight text-foreground">{heading.title}</h1>
              <p class="max-w-md text-base leading-relaxed text-muted-foreground">{heading.desc}</p>
            </div>

            <!-- ── Step 1: Feature carousel ── -->
            {#if step === 1}
              <div class="grid w-full grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
                <!-- Feature list — descriptions always shown so selection never shifts layout -->
                <div
                  class="flex flex-col gap-1.5"
                  role="tablist"
                  aria-label="Features"
                  tabindex="0"
                  onkeydown={onFeatureKeydown}
                >
                  {#each FEATURES as f, i}
                    {@const active = i === activeFeature}
                    <button
                      type="button"
                      role="tab"
                      aria-selected={active}
                      class="group flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors duration-200 {
                        active
                          ? 'border-primary/25 bg-primary/[0.07]'
                          : 'border-transparent hover:border-border hover:bg-muted/40'
                      }"
                      onclick={() => selectFeature(i)}
                    >
                      <span class="flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors {
                        active ? 'border-primary/20 bg-primary/10 text-primary' : 'border-border bg-muted/50 text-muted-foreground'
                      }">
                        <f.icon class="size-[18px]" />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block text-sm font-semibold text-foreground">{f.title}</span>
                        <span class="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{f.desc}</span>
                      </span>
                    </button>
                  {/each}
                </div>

                <!-- Preview -->
                <div class="relative hidden overflow-hidden rounded-xl border border-border bg-muted/25 sm:block">
                  <div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent"></div>
                  {#key activeFeature}
                    <div class="absolute inset-0 p-4" in:fade={{ duration: 200 }}>
                      {#if previewType === 'connect'}
                        <div class="flex h-full flex-col gap-2">
                          {#each [['PostgreSQL', true], ['MySQL', false], ['SQLite', false], ['Cloudflare D1', false]] as [name, on]}
                            <div class="flex items-center gap-2.5 rounded-lg border border-border bg-card/60 px-3 py-2">
                              <span class="size-2 rounded-full {on ? 'bg-emerald-500' : 'bg-muted-foreground/30'}"></span>
                              <span class="text-xs font-medium text-foreground">{name}</span>
                              {#if on}<span class="ml-auto text-[10px] font-medium text-emerald-500">Connected</span>{/if}
                            </div>
                          {/each}
                        </div>

                      {:else if previewType === 'table'}
                        <div class="flex h-full flex-col overflow-hidden rounded-lg border border-border">
                          <div class="grid grid-cols-3 border-b border-border bg-muted/60 text-[10px] font-medium text-muted-foreground">
                            {#each ['id', 'name', 'status'] as h}<div class="border-r border-border px-2.5 py-1.5 last:border-r-0">{h}</div>{/each}
                          </div>
                          {#each [['1', 'Ada Lovelace', 'active'], ['2', 'Alan Turing', 'active'], ['3', 'Grace Hopper', 'idle'], ['4', 'Edsger D.', 'active']] as row, ri}
                            <div class="grid grid-cols-3 text-[10px] text-foreground {ri % 2 ? 'bg-card/40' : ''}">
                              {#each row as cell}<div class="truncate border-r border-border px-2.5 py-1.5 last:border-r-0">{cell}</div>{/each}
                            </div>
                          {/each}
                        </div>

                      {:else if previewType === 'sql'}
                        <div class="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card/60 font-mono text-[10px] leading-relaxed">
                          <div class="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
                            <span class="size-2 rounded-full bg-muted-foreground/30"></span>
                            <span class="size-2 rounded-full bg-muted-foreground/30"></span>
                            <span class="size-2 rounded-full bg-muted-foreground/30"></span>
                            <span class="ml-1.5 text-[9px] text-muted-foreground">query.sql</span>
                          </div>
                          <div class="flex-1 space-y-1 p-3">
                            <div><span class="text-primary">SELECT</span> <span class="text-foreground">id, name, email</span></div>
                            <div><span class="text-primary">FROM</span> <span class="text-foreground">users</span></div>
                            <div><span class="text-primary">WHERE</span> <span class="text-foreground">status =</span> <span class="text-emerald-500">'active'</span></div>
                            <div><span class="text-primary">ORDER BY</span> <span class="text-foreground">created_at</span> <span class="text-primary">DESC</span></div>
                            <div><span class="text-primary">LIMIT</span> <span class="text-foreground">50</span><span class="text-muted-foreground">;</span></div>
                          </div>
                        </div>

                      {:else}
                        <div class="flex h-full flex-col justify-center gap-2.5">
                          <div class="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-[10px] font-medium text-primary-foreground">
                            Show me the 10 newest signups
                          </div>
                          <div class="mr-auto max-w-[88%] rounded-2xl rounded-bl-sm border border-border bg-card/60 px-3 py-2 text-[10px] text-foreground">
                            <div class="mb-1.5 flex items-center gap-1.5 text-muted-foreground">
                              <Sparkles class="size-3 text-primary" /> Generated SQL
                            </div>
                            <code class="font-mono text-[9px] text-foreground">SELECT * FROM users ORDER BY created_at DESC LIMIT 10;</code>
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/key}
                </div>
              </div>

            <!-- ── Step 2: Tips ── -->
            {:else if step === 2}
              <ol class="flex w-full max-w-md flex-col gap-2.5">
                {#each TIPS as tip, i}
                  <li class="flex items-start gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
                    <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                    <span class="pt-0.5 text-sm leading-relaxed text-foreground">{tip}</span>
                  </li>
                {/each}
              </ol>

            <!-- ── Step 3: Connect ── -->
            {:else}
              <div class="flex w-full max-w-md flex-col gap-3">
                <button
                  type="button"
                  class="group flex w-full items-center gap-3.5 rounded-xl bg-primary px-5 py-4 text-left transition-all hover:opacity-90 active:scale-[0.99]"
                  onclick={() => done(true)}
                >
                  <span class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/15 text-primary-foreground">
                    <Plus class="size-5" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-semibold text-primary-foreground">Add a connection</span>
                    <span class="block text-xs text-primary-foreground/70">Connect to your own database now.</span>
                  </span>
                  <ArrowRight class="size-5 shrink-0 text-primary-foreground transition-transform duration-200 group-hover:translate-x-1" />
                </button>

                <button
                  type="button"
                  class="group flex w-full items-center gap-3.5 rounded-xl border border-border bg-muted/30 px-5 py-4 text-left transition-all hover:bg-muted/60 active:scale-[0.99]"
                  onclick={trySample}
                >
                  <span class="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                    <FlaskConical class="size-5" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-semibold text-foreground">Try a sample database</span>
                    <span class="block text-xs text-muted-foreground">Explore a ready-made SQLite dataset first.</span>
                  </span>
                  <ArrowRight class="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1" />
                </button>
              </div>
            {/if}

          </div>
        </div>
      {/key}
    </div>

    <!-- ── Footer nav ── -->
    <footer class="relative flex h-16 shrink-0 items-center justify-between border-t border-border/50 px-8">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-0"
        disabled={step === 1}
        onclick={back}
      >
        <ArrowLeft class="size-4" />
        Back
      </button>

      <span class="text-sm text-muted-foreground">Step {step} of {TOTAL}</span>

      {#if step < TOTAL}
        <button
          type="button"
          class="group flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98]"
          onclick={next}
        >
          Next
          <ArrowRight class="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
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
