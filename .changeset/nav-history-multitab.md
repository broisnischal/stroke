### Changes

#### Navigation
- **Back / forward now works with more than a few tables open** — a tab whose rows had been evicted refetches when you return to it, and the restore was placing the cursor before those rows arrived. The grid won't focus a cell in a table it holds no rows for, so the jump was silently dropped and the tab opened at the top. Travel now waits for that fetch.
- **Holding `Alt+←` no longer crawls or overshoots** — a burst of presses walks the history and travels once, to wherever it lands, instead of activating (and possibly refetching) every tab it passes through. A newer press supersedes an older one outright rather than racing it for the cursor.
- Rows arriving mid-restore are no longer mistaken for a new jump, which used to wipe the forward branch.

#### Performance
- **First click into a prefetched table is no longer sticky** — background fetches kept their rows only inside tab state, which hands them back through Svelte's `$state` proxy. The grid indexes `rows[row][col]` per visible cell per frame, so every one of those reads went through a proxy trap. Background fetches now keep the raw array, as switching away from a tab already did.
- Switching tabs no longer rebuilds the tab array when nothing needs evicting — that write invalidated the tab strip, the panes and `tabsById` on every switch for no change at all.
