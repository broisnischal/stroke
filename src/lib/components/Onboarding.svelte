<script>
  import { fly, fade } from 'svelte/transition'
  import { cubicOut, quintOut } from 'svelte/easing'
  import Database      from '@lucide/svelte/icons/database'
  import Table2        from '@lucide/svelte/icons/table-2'
  import Bot           from '@lucide/svelte/icons/bot'
  import Terminal      from '@lucide/svelte/icons/terminal'
  import ArrowRight    from '@lucide/svelte/icons/arrow-right'
  import Plus          from '@lucide/svelte/icons/plus'
  import Zap           from '@lucide/svelte/icons/zap'
  import FlaskConical  from '@lucide/svelte/icons/flask-conical'

  let { open = $bindable(false), onconnect = () => {}, onsample = () => {} } = $props()

  let step = $state(1)
  let prev = $state(0)
  const TOTAL = 3
  const KEY = 'db-studio:onboarded'

  const forward = $derived(step >= prev)

  const FEATURES = [
    { icon: Database, title: 'Connect any database',  desc: 'PostgreSQL, MySQL, SQLite, and Cloudflare D1 — all in one place.' },
    { icon: Table2,   title: 'Browse & edit rows',    desc: 'Filter, sort, paginate, and modify data with a spreadsheet feel.' },
    { icon: Terminal, title: 'Full SQL editor',       desc: 'Multi-tab Monaco editor with history, saved queries, and AI fixes.' },
    { icon: Bot,      title: 'AI assistance',         desc: 'Generate SQL, fix errors, and ask questions with any AI model.' },
  ]

  function next() { prev = step; step = Math.min(step + 1, TOTAL) }
  function back() { prev = step; step-- }

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
</script>

{#if open}
  <div
    class="fixed inset-0 z-[200] flex flex-col bg-background"
    transition:fade={{ duration: 160 }}
  >
    <!-- Ambient glow behind step 1 icon, sits at top of page -->
    <div class="pointer-events-none absolute inset-x-0 top-0 h-[55%]" style="background: radial-gradient(ellipse 60% 50% at 50% -10%, hsl(var(--primary)/0.08), transparent);"></div>

    <!-- ── Header ── -->
    <header class="relative flex h-14 shrink-0 items-center justify-between border-b border-border/50 px-8">
      <!-- App name / logo slot -->
      <div class="flex items-center gap-2.5">
        <!-- Logo placeholder: swap Database icon for <img src="/logo.svg" class="h-6" /> -->
        <Database class="size-5 text-primary" />
        <span class="text-sm font-semibold text-foreground">DB Studio</span>
      </div>

      <!-- Step dots -->
      <div class="flex items-center gap-2">
        {#each Array(TOTAL) as _, i}
          <div class="rounded-full transition-all duration-300 {
            i + 1 === step ? 'w-5 h-1.5 bg-primary' :
            i + 1 < step   ? 'w-1.5 h-1.5 bg-primary/40' :
                             'w-1.5 h-1.5 bg-muted-foreground/20'
          }"></div>
        {/each}
      </div>

      <!-- Skip -->
      {#if step < TOTAL}
        <button
          type="button"
          class="text-sm text-muted-foreground transition-colors hover:text-foreground"
          onclick={() => done(false)}
        >Skip</button>
      {:else}
        <div class="w-10"></div>
      {/if}
    </header>

    <!-- ── Slide area ── -->
    <div class="relative min-h-0 flex-1 overflow-hidden">
      {#key step}
        <div
          class="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto px-6 py-10"
          in:fly={{ x: forward ? 60 : -60, duration: 280, easing: cubicOut }}
          out:fly={{ x: forward ? -60 : 60, duration: 280, easing: cubicOut }}
        >

          <!-- ── Step 1: Welcome ── -->
          {#if step === 1}
            <div class="flex w-full max-w-lg flex-col items-center gap-10 text-center">

              <!-- Logo / icon area — replace inner content with your logo image -->
              <div class="logo-icon relative flex items-center justify-center">
                <div class="absolute size-40 rounded-full" style="background: radial-gradient(circle, hsl(var(--primary)/0.15) 0%, transparent 70%); filter: blur(24px);"></div>
                <div class="relative flex size-20 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                  <!-- Swap for: <img src="/logo.svg" alt="DB Studio" class="size-12" /> -->
                  <Database class="size-9 text-primary" />
                </div>
              </div>

              <div class="flex flex-col gap-4">
                <h1 class="text-4xl font-bold tracking-tight text-foreground">
                  Welcome to DB Studio
                </h1>
                <p class="text-base leading-relaxed text-muted-foreground">
                  The developer's database client. Connect to any database,<br />
                  explore your schema, write SQL, and get AI assistance.
                </p>
              </div>

              <div class="flex flex-wrap items-center justify-center gap-2">
                {#each ['PostgreSQL', 'MySQL', 'SQLite', 'Cloudflare D1'] as db, i}
                  <span
                    class="db-tag rounded-full border border-border bg-muted/50 px-4 py-1.5 text-sm text-muted-foreground"
                    style="animation-delay: {100 + i * 75}ms"
                  >{db}</span>
                {/each}
              </div>
            </div>

          <!-- ── Step 2: Features ── -->
          {:else if step === 2}
            <div class="flex w-full max-w-2xl flex-col gap-8">
              <div class="text-center">
                <h2 class="text-3xl font-bold tracking-tight text-foreground">Built for every workflow</h2>
                <p class="mt-2 text-base text-muted-foreground">Everything you need in one desktop app.</p>
              </div>

              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {#each FEATURES as f, i}
                  <div
                    class="feat-card flex items-start gap-4 rounded-xl border border-border bg-muted/20 p-5"
                    style="animation-delay: {i * 60}ms"
                  >
                    <div class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10">
                      <f.icon class="size-5 text-primary" />
                    </div>
                    <div>
                      <p class="font-semibold text-foreground">{f.title}</p>
                      <p class="mt-0.5 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                    </div>
                  </div>
                {/each}
              </div>
            </div>

          <!-- ── Step 3: Connect ── -->
          {:else}
            <div class="flex w-full max-w-sm flex-col items-center gap-10 text-center">

              <div class="relative flex items-center justify-center">
                <div class="absolute size-40 rounded-full" style="background: radial-gradient(circle, hsl(var(--primary)/0.15) 0%, transparent 70%); filter: blur(28px);"></div>
                <div class="relative flex size-20 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                  <Zap class="size-9 text-primary" />
                </div>
              </div>

              <div class="flex flex-col gap-3">
                <h2 class="text-3xl font-bold tracking-tight text-foreground">You're all set</h2>
                <p class="text-base leading-relaxed text-muted-foreground">
                  Connect a real database, or explore with sample data first.
                </p>
              </div>

              <div class="flex w-full flex-col gap-3">
                <button
                  type="button"
                  class="group flex w-full items-center justify-center gap-2.5 rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98]"
                  onclick={() => done(true)}
                >
                  <Plus class="size-5 shrink-0" />
                  Add Connection
                  <ArrowRight class="size-5 shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                </button>

                <button
                  type="button"
                  class="group flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-muted/40 px-6 py-3.5 text-base font-semibold text-foreground transition-all hover:bg-muted active:scale-[0.98]"
                  onclick={trySample}
                >
                  <FlaskConical class="size-5 shrink-0 text-primary" />
                  Try Sample Database
                </button>

                <button
                  type="button"
                  class="py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  onclick={() => done(false)}
                >
                  Skip for now
                </button>
              </div>
            </div>
          {/if}

        </div>
      {/key}
    </div>

    <!-- ── Footer nav ── -->
    <footer class="relative flex h-16 shrink-0 items-center justify-between border-t border-border/50 px-8">
      {#if step > 1}
        <button
          type="button"
          class="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          onclick={back}
        >
          <ArrowRight class="size-4 rotate-180" />
          Back
        </button>
      {:else}
        <div></div>
      {/if}

      <span class="text-sm text-muted-foreground">Step {step} of {TOTAL}</span>

      {#if step < TOTAL}
        <button
          type="button"
          class="group flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98]"
          onclick={next}
        >
          {step === TOTAL - 1 ? 'Almost there' : 'Continue'}
          <ArrowRight class="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      {:else}
        <div></div>
      {/if}
    </footer>
  </div>
{/if}

<style>
  .logo-icon {
    animation: float 3.5s ease-in-out infinite;
  }
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50%       { transform: translateY(-7px); }
  }

  .db-tag {
    opacity: 0;
    animation: tag-in 0.35s ease forwards;
  }
  @keyframes tag-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .feat-card {
    opacity: 0;
    animation: card-in 0.32s ease forwards;
  }
  @keyframes card-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
