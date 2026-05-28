<script>
  import Check from '@lucide/svelte/icons/check'
  import Settings2 from '@lucide/svelte/icons/settings-2'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import { cn } from '$lib/utils.js'
  import { aiProfiles, activeProfileId, setActiveProfile } from '$lib/stores/ai-settings.js'

  let {
    /** @type {() => void} */
    onopenSettings = () => {},
  } = $props()

  let pickerOpen = $state(false)
  /** @type {HTMLDivElement | null} */
  let container = $state(null)

  const activeProfile = $derived(
    $aiProfiles.find((p) => p.id === $activeProfileId) ?? $aiProfiles[0]
  )

  const displayName = $derived(activeProfile ? activeProfile.name : 'No model')

  /** @param {string} id */
  async function pick(id) {
    pickerOpen = false
    await setActiveProfile(id)
  }

  /** @param {MouseEvent} e */
  function handleDocClick(e) {
    if (container && !container.contains(/** @type {Node} */ (e.target))) {
      pickerOpen = false
    }
  }

  $effect(() => {
    if (pickerOpen) {
      document.addEventListener('mousedown', handleDocClick)
      return () => document.removeEventListener('mousedown', handleDocClick)
    }
  })
</script>

<div bind:this={container} class="relative">
  <button
    type="button"
    class="mb-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground select-none"
    onclick={() => (pickerOpen = !pickerOpen)}
    title="Switch model"
  >
    <span class="max-w-[10rem] truncate">{displayName}</span>
    <ChevronDown class="size-3 opacity-60" />
  </button>

  {#if pickerOpen}
    <div
      class="absolute bottom-full left-0 z-50 mb-1.5 w-56 rounded-lg border border-border bg-popover p-1 shadow-lg"
    >
      <div class="flex flex-col gap-0.5">
        {#each $aiProfiles as profile (profile.id)}
          {@const isActive = profile.id === $activeProfileId}
          <button
            type="button"
            class={cn(
              'flex items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
              isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
            onclick={() => void pick(profile.id)}
          >
            <Check class={cn('size-3 shrink-0', isActive ? 'opacity-100' : 'opacity-0')} />
            <div class="min-w-0">
              <p class="truncate text-[11px] font-medium text-foreground">{profile.name}</p>
              <p class="truncate font-mono text-[9px] text-muted-foreground/60">{profile.model}</p>
            </div>
          </button>
        {/each}

        <div class="mt-1 border-t border-border/60 pt-1">
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            onclick={() => { pickerOpen = false; onopenSettings() }}
          >
            <Settings2 class="size-3" />
            Manage models…
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
