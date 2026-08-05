<script>
  import Settings2 from '@lucide/svelte/icons/settings-2'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js"
  import BrandIcon from '$lib/components/BrandIcon.svelte'
  import { hasBrand } from '$lib/brand-icons.js'
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
  <!-- Carries the provider's mark, so the model in play is recognisable at a
       glance instead of having to be read. -->
  <DropdownMenu.Trigger
    class="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-ui-2xs text-muted-foreground/70 transition-colors hover:bg-accent/60 hover:text-foreground select-none data-[state=open]:bg-accent data-[state=open]:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
    title="Switch model"
  >
    {#if activeProfile && hasBrand(activeProfile.provider)}
      <BrandIcon name={activeProfile.provider} class="size-3 shrink-0" />
    {:else}
      <Sparkles class="size-3 shrink-0 opacity-70" />
    {/if}
    <span class="max-w-40 truncate">{displayName}</span>
    <ChevronDown class="size-3 shrink-0 opacity-40" />
  </DropdownMenu.Trigger>

  <DropdownMenu.Content side="top" align="start" class="min-w-56 p-1">
    <DropdownMenu.RadioGroup value={$activeProfileId} onValueChange={(v) => pick(v)}>
      {#each $aiProfiles as profile (profile.id)}
        <DropdownMenu.RadioItem
          value={profile.id}
          class="flex items-center gap-2 px-2.5 py-1.5"
        >
          {#if hasBrand(profile.provider)}
            <BrandIcon name={profile.provider} class="size-3.5 shrink-0 text-muted-foreground" />
          {:else}
            <Sparkles class="size-3.5 shrink-0 text-muted-foreground/60" />
          {/if}
          <div class="flex flex-col min-w-0">
            <span class="truncate text-ui-xs font-medium text-foreground leading-tight">{profile.name}</span>
            <span class="truncate font-mono text-ui-3xs text-muted-foreground/60 leading-tight">{profile.model}</span>
          </div>
        </DropdownMenu.RadioItem>
      {/each}
    </DropdownMenu.RadioGroup>

    <DropdownMenu.Separator />

    <DropdownMenu.Item
      class="flex items-center gap-2 px-2.5 py-1.5 text-ui-2xs"
      onclick={onopenSettings}
    >
      <Settings2 class="size-3" />
      <span>Manage models…</span>
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>

