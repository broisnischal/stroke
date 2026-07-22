<script>
  import { onMount } from 'svelte'
  import Icon from './Icon.svelte'
  import { cn } from '$lib/utils.js'
  import { t } from '$lib/i18n.js'
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
    // Direct double-clicks on the header are already handled by Tauri's
    // injected drag-region script (data-tauri-drag-region) — toggling here
    // too made the window maximize and instantly restore. This handler only
    // covers double-clicks on non-interactive children the built-in ignores.
    if (e.target === e.currentTarget) return
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
    /** Close a batch of tabs (Close Tabs to Left/Right). anchorId is the tab whose menu was used. */
    onclosemany = /** @type {(ids: string[], anchorId: string) => void} */ (() => {}),
    onduplicate = /** @param {string} _id */ (_id) => {},
    /** Reset a table tab's view state — search, filters, sort, hidden columns, view mode. */
    onresettable = /** @param {string} _id */ (_id) => {},
    onreopenclosed = () => {},
    /** Whether the closed-tab stack has anything to reopen. */
    canreopenclosed = false,
    onpintoggle = /** @param {string} _id */ (_id) => {},
    onnew = () => {},
    /** @type {import('$lib/stores/recent-tabs.js').RecentTab[]} */
    recentTabs = [],
    onrecentselect = /** @type {(schema: string, table: string) => void} */ (() => {}),
    /** Pointer-based tab drag → split panes. Start/move/end drive the drop hints. */
    ondragtabstart = /** @param {string} _id */ (_id) => {},
    ondragtabmove = /** @type {(clientX: number, clientY: number) => void} */ (() => {}),
    ondragtabend = () => {},
  } = $props()

  // ── Pointer-based tab drag (HTML5 DnD is unreliable in Tauri's WebKit) ──────
  /** @type {{ id: string, startX: number, startY: number, active: boolean } | null} */
  let _tabDrag = null
  /** Set true when a drag occurred, so the ensuing click doesn't also select the tab. */
  let _suppressTabClick = false

  /** @param {PointerEvent} e @param {string} id */
  function tabPointerDown(e, id) {
    if (e.button !== 0) return
    _tabDrag = { id, startX: e.clientX, startY: e.clientY, active: false }
    window.addEventListener('pointermove', tabPointerMove)
    window.addEventListener('pointerup', tabPointerUp)
  }
  /** @param {PointerEvent} e */
  function tabPointerMove(e) {
    if (!_tabDrag) return
    if (!_tabDrag.active) {
      if (Math.abs(e.clientX - _tabDrag.startX) <= 5 && Math.abs(e.clientY - _tabDrag.startY) <= 5) return
      _tabDrag.active = true
      ondragtabstart(_tabDrag.id)
    }
    ondragtabmove(e.clientX, e.clientY)
  }
  function tabPointerUp() {
    window.removeEventListener('pointermove', tabPointerMove)
    window.removeEventListener('pointerup', tabPointerUp)
    if (_tabDrag?.active) { _suppressTabClick = true; ondragtabend() }
    _tabDrag = null
  }

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
    if (tab.kind === 'sql') return 'terminal'
    if (tab.kind === 'table') {
      const entityKind = /** @type {any} */ (tab.state)?.tableKind
      if (entityKind === 'view' || entityKind === 'materialized_view') return 'eye'
      return 'table-2'
    }
    if (tab.kind === 'ai') return 'bot'
    if (tab.kind === 'schema') return 'layout-template'
    if (tab.kind === 'orm') return 'code-2'
    if (tab.kind === 'security') return 'shield-check'
    if (tab.kind === 'extensions') return 'blocks'
    if (tab.kind === 'search') return 'search'
    if (tab.kind === 'license') return 'key-round'
    return 'file-text'
  }
</script>

<header
  class="studio-chrome flex h-9 shrink-0 items-stretch border-b border-border bg-background"
  data-studio-chrome
  data-tauri-drag-region
  role="tablist"
  tabindex="0"
  aria-label={$t('tabs.openEditors')}
  ondblclick={handleDragAreaDblClick}
>
  <div
    bind:this={scrollEl}
    class="app-scroll flex min-w-0 flex-1 items-stretch overflow-x-auto"
  >
    {#each tabs as tab, i (tab.id)}
      {@const tabIconName = tabIcon(tab)}
      {@const active = tab.id === activeTabId}
      {@const nextActive = i + 1 < tabs.length && tabs[i + 1].id === activeTabId}

      <ContextMenu.Root>
        <ContextMenu.Trigger>
          {#snippet child({ props: ctxProps })}
            <div
              {...ctxProps}
              onpointerdown={(e) => tabPointerDown(e, tab.id)}
              onpointerup={(e) => {
                // Middle-click closes (pinned tabs stay protected, like the ✕ button)
                if (e.button === 1 && !tab.pinned) { e.preventDefault(); onclose(tab.id) }
              }}
              class={cn(
                'group/tab relative flex min-w-0 max-w-[200px] shrink-0 items-stretch transition-colors duration-100',
                active ? 'bg-panel' : 'hover:bg-muted/20',
              )}
              style={active
                ? 'box-shadow: 0 1px 0 0 var(--color-panel), inset 0 -2px 0 0 var(--primary)'
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
                onclick={() => { if (_suppressTabClick) { _suppressTabClick = false; return } onselect(tab.id) }}
              >
                <Icon name={tabIconName} class={cn('size-3 shrink-0', active ? 'opacity-70' : 'opacity-35')} />
                <span class="truncate">{tabDisplayTitle(tab)}</span>
              </button>

              {#if tab.pinned}
                <!-- Pinned: pin badge replaces close — click to unpin -->
                <button
                  type="button"
                  class={cn(
                    'mr-1.5 inline-flex size-[18px] shrink-0 self-center items-center justify-center rounded transition-all duration-100',
                    'text-muted-foreground/60 hover:bg-muted hover:text-foreground',
                    active ? 'opacity-70 hover:opacity-100' : 'opacity-40 group-hover/tab:opacity-70',
                  )}
                  title={$t('tabs.unpin')}
                  aria-label={$t('tabs.unpin')}
                  onclick={(e) => { e.stopPropagation(); onpintoggle(tab.id) }}
                >
                  <Icon name="pin" class="size-2.5 rotate-45" />
                </button>
              {:else}
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
                  title={$t('tabs.close')}
                  aria-label={$t('tabs.close')}
                  onclick={(e) => { e.stopPropagation(); onclose(tab.id) }}
                >
                  <Icon name="x" class="size-2.5" />
                </button>
              {/if}

              <!-- Separator: hidden adjacent to any active tab -->
              {#if !active && !nextActive}
                <span class="pointer-events-none absolute inset-y-[25%] right-0 w-px bg-border/30"></span>
              {/if}
            </div>
          {/snippet}
        </ContextMenu.Trigger>

        {@const hasOtherClosable = tabs.some((t) => t.id !== tab.id && !t.pinned)}
        {@const leftClosable = tabs.slice(0, i).filter((t) => !t.pinned)}
        {@const rightClosable = tabs.slice(i + 1).filter((t) => !t.pinned)}
        <ContextMenu.Content class="w-52">
          <ContextMenu.Item onSelect={() => onpintoggle(tab.id)}>
            {#if tab.pinned}
              <Icon name="pin-off" class="size-3.5" />
              Unpin Tab
            {:else}
              <Icon name="pin" class="size-3.5" />
              Pin Tab
            {/if}
          </ContextMenu.Item>
          {#if tab.kind === 'table' || tab.kind === 'sql'}
            <ContextMenu.Item onSelect={() => onduplicate(tab.id)}>
              <Icon name="copy" class="size-3.5" />
              Duplicate Tab
            </ContextMenu.Item>
          {/if}
          {#if tab.kind === 'table'}
            <ContextMenu.Item onSelect={() => onresettable(tab.id)}>
              <Icon name="rotate-ccw" class="size-3.5" />
              Reset Table View
            </ContextMenu.Item>
          {/if}
          <ContextMenu.Separator />
          <ContextMenu.Item onSelect={() => onclose(tab.id)}>
            <Icon name="x" class="size-3.5" />
            Close Tab
          </ContextMenu.Item>
          <ContextMenu.Item disabled={!hasOtherClosable} onSelect={() => oncloseothers(tab.id)}>
            <Icon name="circle-slash" class="size-3.5" />
            Close Other Tabs
          </ContextMenu.Item>
          <ContextMenu.Item
            disabled={leftClosable.length === 0}
            onSelect={() => onclosemany(leftClosable.map((t) => t.id), tab.id)}
          >
            <Icon name="arrow-left-to-line" class="size-3.5" />
            Close Tabs to Left
          </ContextMenu.Item>
          <ContextMenu.Item
            disabled={rightClosable.length === 0}
            onSelect={() => onclosemany(rightClosable.map((t) => t.id), tab.id)}
          >
            <Icon name="arrow-right-to-line" class="size-3.5" />
            Close Tabs to Right
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item disabled={!canreopenclosed} onSelect={onreopenclosed}>
            <Icon name="history" class="size-3.5" />
            Reopen last tab
            <ContextMenu.Shortcut>⌘⇧T</ContextMenu.Shortcut>
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item variant="destructive" onSelect={oncloseall}>
            <Icon name="trash-2" class="size-3.5" />
            Close All Tabs
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    {/each}
  </div>
</header>
