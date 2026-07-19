<script>
  // VSCode-style vertical activity rail: a thin icon column pinned to the far
  // edge that switches primary views. Purely presentational — all navigation is
  // delegated to the shell via callback props.
  import Icon from './Icon.svelte'
  import { cn } from '$lib/utils.js'

  let {
    aiMode = false,
    sidebarOpen = false,
    activeKind = '',
    side = 'left',
    ontoggletables = () => {},
    onopensearch = () => {},
    onopenschema = () => {},
    onopenerd = () => {},
    onopensecurity = () => {},
    onopeninsights = () => {},
    onopenlogs = () => {},
    onopenaimode = () => {},
    onopensettings = () => {},
  } = $props()

  const ITEMS = [
    { id: 'tables', icon: 'table-2', label: 'Tables', on: () => ontoggletables() },
    { id: 'search', icon: 'search', label: 'Search', on: () => onopensearch() },
    { id: 'schema', icon: 'database', label: 'Schema', on: () => onopenschema() },
    { id: 'erd', icon: 'git-branch', label: 'ERD', on: () => onopenerd() },
    { id: 'security', icon: 'shield-check', label: 'Roles & RLS', on: () => onopensecurity() },
    { id: 'insights', icon: 'bar-chart-2', label: 'Insights', on: () => onopeninsights() },
    { id: 'ai', icon: 'sparkles', label: 'AI chat', on: () => onopenaimode() },
  ]

  /** @param {string} id */
  function isActive(id) {
    if (id === 'ai') return aiMode
    if (aiMode) return false
    if (id === 'tables') return sidebarOpen
    if (id === 'erd') return activeKind === 'erd' || activeKind === 'reltree'
    return activeKind === id
  }
</script>

<nav
  aria-label="Activity bar"
  class={cn(
    'flex h-full w-11 shrink-0 flex-col bg-sidebar',
    side === 'left' ? 'border-r border-border' : 'border-l border-border',
  )}
>
  {#each ITEMS as item (item.id)}
    {@const active = isActive(item.id)}
    <div class="relative">
      {#if active}
        <span
          class={cn(
            'absolute inset-y-1.5 w-0.5 rounded-full bg-primary',
            side === 'left' ? 'left-0' : 'right-0',
          )}
        ></span>
      {/if}
      <button
        type="button"
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        title={item.label}
        onclick={item.on}
        class={cn(
          'flex h-11 w-11 items-center justify-center transition-colors',
          active ? 'text-foreground' : 'text-muted-foreground/60 hover:text-foreground',
        )}
      >
        <Icon name={item.icon} class="size-[18px]" />
      </button>
    </div>
  {/each}

  <div class="relative mt-auto">
    <button
      type="button"
      aria-label="Settings"
      title="Settings"
      onclick={() => onopensettings()}
      class="flex h-11 w-11 items-center justify-center text-muted-foreground/60 transition-colors hover:text-foreground"
    >
      <Icon name="sliders-horizontal" class="size-[18px]" />
    </button>
  </div>
</nav>
