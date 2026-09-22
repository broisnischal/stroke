<script>
  import Kbd from './Kbd.svelte'
  import PanelLeft      from '@lucide/svelte/icons/panel-left'
  import PanelTop       from '@lucide/svelte/icons/panel-top'
  import PanelBottom    from '@lucide/svelte/icons/panel-bottom'
  import Rows3          from '@lucide/svelte/icons/rows-3'
  import Check          from '@lucide/svelte/icons/check'
  import LayoutTemplate from '@lucide/svelte/icons/layout-template'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js'


  let {
    sidebarVisible = true,
    tabBarVisible = true,
    tableToolbarVisible = true,
    statusBarVisible = true,
    ontoggleSidebar = () => {},
    ontoggletabbar = () => {},
    ontoggletabletoolbar = () => {},
    ontogglestatusbar = () => {},
    class: extraClass = '',
  } = $props()
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground data-[state=open]:bg-muted/50 data-[state=open]:text-foreground {extraClass}"
    title="Appearance"
    aria-label="Appearance"
  >
    <LayoutTemplate class="size-3.5" />
  </DropdownMenu.Trigger>

  <DropdownMenu.Content class="z-[200] min-w-64" align="end" sideOffset={6}>
    <DropdownMenu.Label>Appearance</DropdownMenu.Label>

    <DropdownMenu.Item onclick={ontoggleSidebar}>
      <PanelLeft class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate whitespace-nowrap">Sidebar</span>
      <span class="ml-auto flex shrink-0 items-center gap-2">
        {#if sidebarVisible}<Check class="size-3 shrink-0 text-muted-foreground" />{:else}<span class="size-3 shrink-0"></span>{/if}
        <Kbd combo="Mod+B" />
      </span>
    </DropdownMenu.Item>

    <DropdownMenu.Item onclick={ontoggletabbar}>
      <PanelTop class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate whitespace-nowrap">Tab Bar</span>
      <span class="ml-auto flex shrink-0 items-center gap-2">
        {#if tabBarVisible}<Check class="size-3 shrink-0 text-muted-foreground" />{:else}<span class="size-3 shrink-0"></span>{/if}
        <Kbd combo="Mod+Shift+T" />
      </span>
    </DropdownMenu.Item>

    <DropdownMenu.Item onclick={ontoggletabletoolbar}>
      <Rows3 class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate whitespace-nowrap">Table Toolbar</span>
      <span class="ml-auto flex shrink-0 items-center">
        {#if tableToolbarVisible}<Check class="size-3 shrink-0 text-muted-foreground" />{:else}<span class="size-3 shrink-0"></span>{/if}
      </span>
    </DropdownMenu.Item>

    <DropdownMenu.Separator />

    <DropdownMenu.Item onclick={ontogglestatusbar}>
      <PanelBottom class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="min-w-0 flex-1 truncate whitespace-nowrap">Status Bar</span>
      <span class="ml-auto flex shrink-0 items-center gap-2">
        {#if statusBarVisible}<Check class="size-3 shrink-0 text-muted-foreground" />{:else}<span class="size-3 shrink-0"></span>{/if}
        <Kbd combo="Mod+Shift+B" />
      </span>
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
