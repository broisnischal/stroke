<script>
  import Settings2 from '@lucide/svelte/icons/settings-2'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js"
  import { cn } from '$lib/utils.js'
  import { aiProfiles, activeProfileId, setActiveProfile } from '$lib/stores/ai-settings.js'

  let {
    /** @type {() => void} */
    onopenSettings = () => {},
  } = $props()

  const activeProfile = $derived(
    $aiProfiles.find((p) => p.id === $activeProfileId) ?? $aiProfiles[0]
  )

  const displayName = $derived(activeProfile ? activeProfile.name : 'No model')

  /** @param {string} id */
  async function pick(id) {
    await setActiveProfile(id)
  }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    class="mb-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground select-none data-[state=open]:bg-accent data-[state=open]:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
    title="Switch model"
  >
    <span class="max-w-40 truncate">{displayName}</span>
    <ChevronDown class="size-3 opacity-60" />
  </DropdownMenu.Trigger>

  <DropdownMenu.Content side="top" align="start" class="w-56 p-1">
    <DropdownMenu.RadioGroup value={$activeProfileId} onValueChange={(v) => pick(v)}>
      {#each $aiProfiles as profile (profile.id)}
        <DropdownMenu.RadioItem
          value={profile.id}
          class="flex items-center gap-2 px-2.5 py-1.5"
        >
          <div class="flex flex-col min-w-0">
            <span class="truncate text-[11px] font-medium text-foreground leading-tight">{profile.name}</span>
            <span class="truncate font-mono text-[9px] text-muted-foreground/60 leading-tight">{profile.model}</span>
          </div>
        </DropdownMenu.RadioItem>
      {/each}
    </DropdownMenu.RadioGroup>

    <DropdownMenu.Separator />

    <DropdownMenu.Item
      class="flex items-center gap-2 px-2.5 py-1.5 text-[11px]"
      onclick={onopenSettings}
    >
      <Settings2 class="size-3" />
      <span>Manage models…</span>
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>

