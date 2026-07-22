<script>
  import PanelLeft      from '@lucide/svelte/icons/panel-left'
  import PanelTop       from '@lucide/svelte/icons/panel-top'
  import PanelBottom    from '@lucide/svelte/icons/panel-bottom'
  import Rows3          from '@lucide/svelte/icons/rows-3'
  import Check          from '@lucide/svelte/icons/check'
  import LayoutTemplate from '@lucide/svelte/icons/layout-template'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js'
  import { detectOs } from '$lib/platform.js'

  const isMac = typeof navigator !== 'undefined' && detectOs() === 'macos'
  const mod   = isMac ? '⌘' : 'Ctrl'

  let {
    sidebarVisible        = true,
    tabBarVisible         = true,
    tableToolbarVisible   = true,
    statusBarVisible      = true,
    ontoggleSidebar       = () => {},
    ontoggletabbar        = () => {},
    ontoggletabletoolbar  = () => {},
    ontogglestatusbar     = () => {},
    class: extraClass      = '',
  } = $props()

  let open = $state(false)
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger
    class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground data-[state=open]:bg-muted/50 data-[state=open]:text-foreground {extraClass}"
    title="Appearance"
    aria-label="Appearance"
  >
    <LayoutTemplate class="size-3.5" />
  </DropdownMenu.Trigger>

  <DropdownMenu.Content class="z-[200] w-64" align="end" sideOffset={6}>
    <DropdownMenu.Label>Appearance</DropdownMenu.Label>

    <DropdownMenu.Item onclick={ontoggleSidebar}>
      <PanelLeft class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate whitespace-nowrap">Sidebar</span>
      <span class="ml-auto flex shrink-0 items-center gap-2">
        {#if sidebarVisible}<Check class="size-3 shrink-0 text-muted-foreground/70" />{:else}<span class="size-3 shrink-0"></span>{/if}
        <span class="flex items-center gap-[3px]"><kbd>{mod}</kbd><kbd>B</kbd></span>
      </span>
    </DropdownMenu.Item>

    <DropdownMenu.Item onclick={ontoggletabbar}>
      <PanelTop class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate whitespace-nowrap">Tab Bar</span>
      <span class="ml-auto flex shrink-0 items-center gap-2">
        {#if tabBarVisible}<Check class="size-3 shrink-0 text-muted-foreground/70" />{:else}<span class="size-3 shrink-0"></span>{/if}
        <span class="flex items-center gap-[3px]"><kbd>{mod}</kbd><kbd>⇧</kbd><kbd>T</kbd></span>
      </span>
    </DropdownMenu.Item>

    <DropdownMenu.Item onclick={ontoggletabletoolbar}>
      <Rows3 class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate whitespace-nowrap">Table Toolbar</span>
      <span class="ml-auto flex shrink-0 items-center">
        {#if tableToolbarVisible}<Check class="size-3 shrink-0 text-muted-foreground/70" />{:else}<span class="size-3 shrink-0"></span>{/if}
      </span>
    </DropdownMenu.Item>

    <DropdownMenu.Separator />

    <DropdownMenu.Item onclick={ontogglestatusbar}>
      <PanelBottom class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate whitespace-nowrap">Status Bar</span>
      <span class="ml-auto flex shrink-0 items-center gap-2">
        {#if statusBarVisible}<Check class="size-3 shrink-0 text-muted-foreground/70" />{:else}<span class="size-3 shrink-0"></span>{/if}
        <span class="flex items-center gap-[3px]"><kbd>{mod}</kbd><kbd>⇧</kbd><kbd>B</kbd></span>
      </span>
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
