<script>
  // VSCode-style vertical activity rail: a thin icon column pinned to the far
  // edge that switches primary views. Purely presentational — all navigation is
  // delegated to the shell via callback props.
  import Icon from './Icon.svelte'
  import * as Tooltip from '$lib/components/ui/tooltip/index.js'
  import { cn } from '$lib/utils.js'

  let {
    aiMode = false,
    sidebarOpen = false,
    activePanel = '',
    activeKind = '',
    dbType = '',
    side = 'left',
    ontoggletables = () => {},
    onopenconnections = () => {},
    onopensearch = () => {},
    onopenschema = () => {},
    onopenerd = () => {},
    onopensecurity = () => {},
    onopeninsights = () => {},
    onopenextensions = () => {},
    onopenlogs = () => {},
    onopenaimode = () => {},
    onopensettings = () => {},
  } = $props()

  const ALL_ITEMS = [
    { id: 'tables', icon: 'table-2', label: 'Tables', on: () => ontoggletables() },
    { id: 'connections', icon: 'server', label: 'Connections', on: () => onopenconnections() },
    { id: 'search', icon: 'search', label: 'Search', on: () => onopensearch() },
    { id: 'schema', icon: 'database', label: 'Schema', on: () => onopenschema() },
    { id: 'erd', icon: 'git-branch', label: 'ERD', on: () => onopenerd() },
    { id: 'security', icon: 'shield-check', label: 'Roles & RLS', on: () => onopensecurity() },
    { id: 'insights', icon: 'bar-chart-2', label: 'Insights', on: () => onopeninsights() },
    { id: 'extensions', icon: 'blocks', label: 'Extensions', on: () => onopenextensions() },
    { id: 'ai', icon: 'sparkles', label: 'AI chat', on: () => onopenaimode() },
  ]

  // Dialect gating — hide surfaces the engine can't support so we don't offer dead icons.
  const SUPPORTED = /** @type {Record<string, (t: string) => boolean>} */ ({
    security: (t) => t === 'postgres' || t === 'cockroachdb',
    insights: (t) => t === 'postgres' || t === 'mysql' || t === 'mariadb',
  })
  const items = $derived(ALL_ITEMS.filter((it) => !SUPPORTED[it.id] || SUPPORTED[it.id](dbType)))

  // Exactly one active item: the active main tab wins; Tables only reflects the
  // sidebar when no other rail-mapped surface is the active tab.
  const activeId = $derived.by(() => {
    if (aiMode) return 'ai'
    if (activeKind === 'erd' || activeKind === 'reltree') return 'erd'
    if (activeKind === 'security') return 'security'
    if (activeKind === 'insights') return 'insights'
    if (activeKind === 'search') return 'search'
    if (activeKind === 'schema') return 'schema'
    // No rail-mapped surface is the active tab: reflect whichever sidebar panel
    // is showing (tables / connections / extensions) when the sidebar is open.
    return sidebarOpen ? activePanel : ''
  })
</script>

<nav
  aria-label="Activity bar"
  class={cn(
    'flex h-full w-11 shrink-0 flex-col bg-sidebar',
    side === 'left' ? 'border-r border-border' : 'border-l border-border',
  )}
>
  <Tooltip.Provider delayDuration={600} skipDelayDuration={0} disableHoverableContent>
    {#each items as item (item.id)}
      {@const active = activeId === item.id}
      <div class="relative">
        {#if active}
          <span
            class={cn(
              'absolute inset-y-1.5 w-0.5 rounded-full bg-primary',
              side === 'left' ? 'left-0' : 'right-0',
            )}
          ></span>
        {/if}
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                onclick={item.on}
                class={cn(
                  'flex h-11 w-11 items-center justify-center transition-colors',
                  active ? 'text-foreground' : 'text-muted-foreground/60 hover:text-foreground',
                )}
              >
                <Icon name={item.icon} class="size-[18px]" />
              </button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side={side === 'left' ? 'right' : 'left'} sideOffset={8}>
            {item.label}
          </Tooltip.Content>
        </Tooltip.Root>
      </div>
    {/each}

    <div class="relative mt-auto">
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              type="button"
              aria-label="Settings"
              onclick={() => onopensettings()}
              class="flex h-11 w-11 items-center justify-center text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              <Icon name="sliders-horizontal" class="size-[18px]" />
            </button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side={side === 'left' ? 'right' : 'left'} sideOffset={8}>
          Settings
        </Tooltip.Content>
      </Tooltip.Root>
    </div>
  </Tooltip.Provider>
</nav>
