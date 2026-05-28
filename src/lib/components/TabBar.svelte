<script>
  import { tick } from 'svelte'
  import Table2 from '@lucide/svelte/icons/table-2'
  import Terminal from '@lucide/svelte/icons/terminal'
  import FileText from '@lucide/svelte/icons/file-text'
  import Bot from '@lucide/svelte/icons/bot'
  import LayoutTemplate from '@lucide/svelte/icons/layout-template'
  import Code2 from '@lucide/svelte/icons/code-2'
  import Eye from '@lucide/svelte/icons/eye'
  import X from '@lucide/svelte/icons/x'
  import Plus from '@lucide/svelte/icons/plus'
  import { cn } from '$lib/utils.js'
  import { tabDisplayTitle } from '$lib/studio-tabs.js'
  import * as ContextMenu from '$lib/components/ui/context-menu/index.js'

  /** @typedef {import('$lib/studio-tabs.js').StudioTab} StudioTab */

  let {
    tabs = [],
    activeTabId = null,
    onselect = () => {},
    onclose = () => {},
    oncloseothers = /** @param {string} _id */ (_id) => {},
    oncloseall = () => {},
    onnew = () => {},
  } = $props()

  /** @type {HTMLElement | null} */
  let scrollEl = $state(null)

  $effect(() => {
    const _id = activeTabId
    tick().then(() => {
      const active = scrollEl?.querySelector('[aria-selected="true"]')
      active?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    })
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
    return FileText
  }
</script>

<header
  class="studio-chrome flex h-9 shrink-0 items-stretch border-b border-border bg-panel"
  data-studio-chrome
  role="tablist"
  aria-label="Open editors"
>
  <div bind:this={scrollEl} class="app-scroll flex min-w-0 flex-1 items-stretch overflow-x-auto">
    {#each tabs as tab (tab.id)}
      {@const Icon = tabIcon(tab)}
      {@const active = tab.id === activeTabId}
      <ContextMenu.Root>
        <ContextMenu.Trigger>
          {#snippet child({ props: ctxProps })}
            <div
              {...ctxProps}
              class={cn(
                'group/tab relative flex max-w-[200px] min-w-0 shrink-0 items-stretch transition-colors',
                active
                  ? 'bg-card [box-shadow:0_1px_0_0_var(--color-card),inset_0_1px_0_0_var(--color-border)]'
                  : 'hover:bg-muted/30',
              )}
            >
              <!-- top active indicator line -->
              {#if active}
                <span class="pointer-events-none absolute inset-x-0 top-0 h-px bg-foreground/20"></span>
              {/if}

              <button
                type="button"
                role="tab"
                aria-selected={active}
                title={tabDisplayTitle(tab)}
                class={cn(
                  'flex min-w-0 flex-1 items-center gap-1.5 pl-3 pr-1 text-left text-ui-sm transition-colors',
                  active ? 'text-foreground' : 'text-muted-foreground/80 hover:text-muted-foreground',
                )}
                onclick={() => onselect(tab.id)}
              >
                <Icon class={cn('size-3 shrink-0', active ? 'opacity-60' : 'opacity-40')} />
                <span class="truncate font-mono leading-none">{tabDisplayTitle(tab)}</span>
              </button>

              <button
                type="button"
                class={cn(
                  'mr-1.5 inline-flex size-4 shrink-0 self-center items-center justify-center rounded-sm transition-all',
                  'text-muted-foreground hover:bg-muted hover:text-foreground',
                  active
                    ? 'opacity-40 hover:opacity-100'
                    : 'opacity-0 group-hover/tab:opacity-40 group-hover/tab:hover:opacity-100',
                )}
                title="Close tab"
                aria-label="Close tab"
                onclick={(e) => {
                  e.stopPropagation()
                  onclose(tab.id)
                }}
              >
                <X class="size-2.5" />
              </button>

              <!-- right divider — hidden when this or the next tab is active -->
              {#if !active}
                <span class="pointer-events-none absolute inset-y-[20%] right-0 w-px bg-border/60"></span>
              {/if}
            </div>
          {/snippet}
        </ContextMenu.Trigger>
        <ContextMenu.Content class="w-44">
          <ContextMenu.Item onSelect={() => onclose(tab.id)}>
            Close
          </ContextMenu.Item>
          <ContextMenu.Item
            disabled={tabs.length <= 1}
            onSelect={() => oncloseothers(tab.id)}
          >
            Close Others
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item onSelect={oncloseall}>
            Close All
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    {/each}
  </div>

  <div class="flex shrink-0 items-center border-l border-border pl-1 pr-0.5">
    <button
      type="button"
      class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
      title="New tab"
      aria-label="New tab"
      onclick={onnew}
    >
      <Plus class="size-3.5" />
    </button>
  </div>
</header>
