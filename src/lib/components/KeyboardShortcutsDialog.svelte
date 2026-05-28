<script>
  import Keyboard from '@lucide/svelte/icons/keyboard'
  import * as Dialog from '$lib/components/ui/dialog/index.js'

  let { open = $bindable(false) } = $props()

  const isMac =
    typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')
  const mod = isMac ? '⌘' : 'Ctrl'
  const shift = '⇧'

  /** @type {{ label: string; shortcuts: { keys: string[]; desc: string }[] }[]} */
  const groups = [
    {
      label: 'Navigation',
      shortcuts: [
        { keys: [mod, 'K'], desc: 'Command menu' },
        { keys: [mod, 'T'], desc: 'New tab' },
        { keys: [mod, 'W'], desc: 'Close tab' },
        { keys: [mod, 'Tab'], desc: 'Next tab' },
        { keys: [mod, shift, 'Tab'], desc: 'Previous tab' },
        { keys: [mod, 'B'], desc: 'Toggle sidebar' },
        { keys: [mod, shift, 'L'], desc: 'Toggle activity log' },
        { keys: [mod, shift, 'F'], desc: 'Focus table filter' },
      ],
    },
    {
      label: 'Views',
      shortcuts: [
        { keys: [mod, shift, 'D'], desc: 'Data view' },
        { keys: [mod, shift, 'S'], desc: 'SQL editor' },
        { keys: [mod, shift, 'O'], desc: 'ORM Runner' },
        { keys: [mod, shift, 'E'], desc: 'AI panel' },
        { keys: [mod, 'I'], desc: 'AI sidebar' },
      ],
    },
    {
      label: 'SQL Editor',
      shortcuts: [
        { keys: [mod, '↵'], desc: 'Run query' },
        { keys: [mod, 'S'], desc: 'Format SQL' },
        { keys: [mod, 'R'], desc: 'Refresh / re-run' },
        { keys: [mod, 'K'], desc: 'Search query history' },
      ],
    },
    {
      label: 'ORM Runner',
      shortcuts: [
        { keys: [mod, '↵'], desc: 'Run query' },
        { keys: [mod, 'S'], desc: 'Format code' },
      ],
    },
    {
      label: 'Data Table',
      shortcuts: [
        { keys: [mod, 'F'], desc: 'Search rows' },
        { keys: [mod, 'R'], desc: 'Refresh table' },
        { keys: ['↵'], desc: 'Edit cell' },
        { keys: [mod, 'C'], desc: 'Copy cell value' },
        { keys: [mod, '↵'], desc: 'Navigate to FK row' },
        { keys: [mod, '⌫'], desc: 'Delete selected rows' },
        { keys: [mod, '←'], desc: 'Previous page' },
        { keys: [mod, '→'], desc: 'Next page' },
        { keys: [mod, shift, '←'], desc: 'First page' },
        { keys: [mod, shift, '→'], desc: 'Last page' },
      ],
    },
    {
      label: 'AI Chat',
      shortcuts: [
        { keys: ['↵'], desc: 'Send message' },
        { keys: [shift, '↵'], desc: 'New line in message' },
        { keys: [mod, shift, 'B'], desc: 'Toggle conversation list' },
        { keys: [mod, shift, 'T'], desc: 'New chat' },
      ],
    },
    {
      label: 'Appearance',
      shortcuts: [
        { keys: [mod, 'M'], desc: 'Cycle theme' },
        { keys: [mod, shift, 'M'], desc: 'Previous theme' },
        { keys: [mod, '+'], desc: 'Zoom in' },
        { keys: [mod, '−'], desc: 'Zoom out' },
        { keys: [mod, '0'], desc: 'Reset zoom' },
      ],
    },
    {
      label: 'General',
      shortcuts: [
        { keys: ['?'], desc: 'Show keyboard shortcuts' },
        { keys: [mod, ','], desc: 'Open settings' },
        { keys: ['Esc'], desc: 'Dismiss / close' },
        { keys: [mod, 'R'], desc: 'Refresh current view' },
        { keys: ['F11'], desc: 'Toggle fullscreen' },
      ],
    },
  ]
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[80vh] max-w-md flex-col gap-0 overflow-hidden p-0">
    <Dialog.Header class="shrink-0 border-b border-border px-5 py-4">
      <div class="flex items-center gap-3">
        <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Keyboard class="size-3.5 text-muted-foreground" />
        </div>
        <div class="flex flex-col gap-0.5">
          <Dialog.Title class="text-sm font-semibold">Keyboard Shortcuts</Dialog.Title>
          <Dialog.Description class="text-xs text-muted-foreground">
            Press <kbd class="rounded border border-border bg-muted px-1 font-mono text-[10px]">?</kbd> anywhere to open this.
          </Dialog.Description>
        </div>
      </div>
    </Dialog.Header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="flex flex-col divide-y divide-border">
        {#each groups as group (group.label)}
          <div class="px-5 py-4">
            <p class="mb-3 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              {group.label}
            </p>
            <ul class="flex flex-col gap-1.5">
              {#each group.shortcuts as shortcut (shortcut.desc)}
                <li class="flex items-center justify-between gap-6">
                  <span class="text-sm text-foreground/80">{shortcut.desc}</span>
                  <span class="flex shrink-0 items-center gap-0.5">
                    {#each shortcut.keys as key, i (i)}
                      <kbd
                        class="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-foreground/70 shadow-[0_1px_0_0_var(--border)]"
                      >{key}</kbd>
                    {/each}
                  </span>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
