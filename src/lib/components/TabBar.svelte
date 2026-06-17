<script>
  import { onMount } from 'svelte'
  import Table2 from '@lucide/svelte/icons/table-2'
  import Terminal from '@lucide/svelte/icons/terminal'
  import FileText from '@lucide/svelte/icons/file-text'
  import Bot from '@lucide/svelte/icons/bot'
  import LayoutTemplate from '@lucide/svelte/icons/layout-template'
  import Code2 from '@lucide/svelte/icons/code-2'
  import ShieldCheck from '@lucide/svelte/icons/shield-check'
  import Eye from '@lucide/svelte/icons/eye'
  import Layers from '@lucide/svelte/icons/layers'
  import Search from '@lucide/svelte/icons/search'
  import Blocks from '@lucide/svelte/icons/blocks'
  import X from '@lucide/svelte/icons/x'
  import Plus from '@lucide/svelte/icons/plus'
  import Clock from '@lucide/svelte/icons/clock'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import { cn } from '$lib/utils.js'
  import { tabDisplayTitle } from '$lib/studio-tabs.js'
  import * as ContextMenu from '$lib/components/ui/context-menu/index.js'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js'

  let isTauri = $state(false)

  onMount(() => {
    isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  })

  /** @param {MouseEvent} e */
  function handleDragAreaDblClick(e) {
    if (!isTauri) return
    if (/** @type {Element} */ (e.target).closest('button')) return
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().toggleMaximize()).catch(() => {})
  }

  /** @typedef {import('$lib/studio-tabs.js').StudioTab} StudioTab */

  let {
    tabs = [],
    activeTabId = null,
    onselect = () => {},
    onclose = () => {},
    oncloseothers = /** @param {string} _id */ (_id) => {},
    oncloseall = () => {},
    onnew = () => {},
    /** @type {import('$lib/stores/recent-tabs.js').RecentTab[]} */
    recentTabs = [],
    onrecentselect = /** @type {(schema: string, table: string) => void} */ (() => {}),
  } = $props()

  /** @type {HTMLElement | null} */
  let scrollEl = $state(null)

  $effect(() => {
    const _id = activeTabId
    let raf = requestAnimationFrame(() => {
      const active = scrollEl?.querySelector('[aria-selected="true"]')
      active?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(raf)
  })

  /** @param {StudioTab} tab */
  function tabIcon(tab) {
    if (tab.kind === 'sql') return Terminal
    if (tab.kind === 'table') {
      const entityKind = /** @type {any} */ (tab.state)?.tableKind
      if (entityKind === 'view' || entityKind === 'materialized_view') return Eye
      return Table2
    }
    if (tab.kind === 'ai') return Bot
    if (tab.kind === 'schema') return LayoutTemplate
    if (tab.kind === 'orm') return Code2
    if (tab.kind === 'security') return ShieldCheck
    if (tab.kind === 'extensions') return Blocks
    if (tab.kind === 'search') return Search
    return FileText
  }
</script>

<header
  class="studio-chrome flex h-9 shrink-0 items-stretch border-b border-border bg-background"
  data-studio-chrome
  data-tauri-drag-region
  role="tablist"
  tabindex="0"
  aria-label="Open editors"
  ondblclick={handleDragAreaDblClick}
>
  <div
    bind:this={scrollEl}
    class="app-scroll flex min-w-0 flex-1 items-stretch overflow-x-auto"
  >
    {#each tabs as tab, i (tab.id)}
      {@const Icon = tabIcon(tab)}
      {@const active = tab.id === activeTabId}
      {@const nextActive = i + 1 < tabs.length && tabs[i + 1].id === activeTabId}

      <ContextMenu.Root>
        <ContextMenu.Trigger>
          {#snippet child({ props: ctxProps })}
            <div
              {...ctxProps}
              class={cn(
                'group/tab relative flex min-w-0 max-w-[200px] shrink-0 items-stretch transition-colors duration-100',
                active ? 'bg-panel' : 'hover:bg-muted/20',
              )}
              style={active
                ? 'box-shadow: 0 1px 0 0 var(--color-panel), inset 0 -2px 0 0 color-mix(in oklch, var(--foreground) 55%, transparent)'
                : ''}
            >
              <!-- Tab button — font-medium on ALL states to prevent layout shift on activation -->
              <button
                type="button"
                role="tab"
                aria-selected={active}
                title={tabDisplayTitle(tab)}
                class={cn(
                  'flex min-w-0 flex-1 items-center gap-1.5 pl-3 pr-1 text-left text-xs font-medium leading-none transition-colors duration-100',
                  active ? 'text-foreground' : 'text-muted-foreground/50 hover:text-muted-foreground/80',
                )}
                onclick={() => onselect(tab.id)}
              >
                <Icon class={cn('size-3 shrink-0', active ? 'opacity-70' : 'opacity-35')} />
                <span class="truncate">{tabDisplayTitle(tab)}</span>
              </button>

              <!-- Close button -->
              <button
                type="button"
                class={cn(
                  'mr-1.5 inline-flex size-[18px] shrink-0 self-center items-center justify-center rounded transition-all duration-100',
                  'text-muted-foreground/50 hover:bg-muted hover:text-foreground',
                  active
                    ? 'opacity-50 hover:opacity-100'
                    : 'opacity-0 group-hover/tab:opacity-50 group-hover/tab:hover:opacity-100',
                )}
                title="Close tab"
                aria-label="Close tab"
                onclick={(e) => { e.stopPropagation(); onclose(tab.id) }}
              >
                <X class="size-2.5" />
              </button>

              <!-- Separator: hidden adjacent to any active tab -->
              {#if !active && !nextActive}
                <span class="pointer-events-none absolute inset-y-[25%] right-0 w-px bg-border/30"></span>
              {/if}
            </div>
          {/snippet}
        </ContextMenu.Trigger>

        <ContextMenu.Content class="w-44">
          <ContextMenu.Item onSelect={() => onclose(tab.id)}>Close</ContextMenu.Item>
          <ContextMenu.Item disabled={tabs.length <= 1} onSelect={() => oncloseothers(tab.id)}>
            Close Others
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item onSelect={oncloseall}>Close All</ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    {/each}
  </div>

  <!-- Recent tables dropdown -->
  {#if recentTabs.length > 0}
    <div class="flex shrink-0 items-center border-l border-border/40 px-0.5">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          class="inline-flex h-6 items-center gap-0.5 rounded-md px-1.5 text-muted-foreground/40 transition-colors hover:bg-muted/60 hover:text-foreground"
          title="Recent tables"
        >
          <Clock class="size-3" />
          <ChevronDown class="size-2.5" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="w-52 p-1 text-ui-xs">
          <DropdownMenu.Label class="px-2 py-1 text-ui-2xs font-medium uppercase tracking-wide text-muted-foreground/50">
            Recent tables
          </DropdownMenu.Label>
          {#each recentTabs.slice(0, 8) as item (item.schema + '.' + item.table)}
            <DropdownMenu.Item
              class="gap-2 font-mono text-ui-xs"
              onSelect={() => onrecentselect(item.schema, item.table)}
            >
              {#if item.tableKind === 'view'}
                <Eye class="size-3 shrink-0 text-muted-foreground/60" />
              {:else if item.tableKind === 'materialized_view'}
                <Layers class="size-3 shrink-0 text-muted-foreground/60" />
              {:else}
                <Table2 class="size-3 shrink-0 text-muted-foreground/60" />
              {/if}
              <span class="truncate">{item.table}</span>
              {#if item.schema && item.schema !== 'public'}
                <span class="ml-auto shrink-0 text-muted-foreground/40">{item.schema}</span>
              {/if}
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  {/if}

  <!-- New tab -->
  <div class="flex shrink-0 items-center border-l border-border/40 px-1">
    <button
      type="button"
      class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-muted/60 hover:text-foreground"
      title="New tab"
      aria-label="New tab"
      onclick={onnew}
    >
      <Plus class="size-3.5" />
    </button>
  </div>
</header>
