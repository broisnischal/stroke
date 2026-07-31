### Bug Fixes

#### Editing
- **Editing a date cell no longer crashes the view** — a `created_at`-style column that stores Unix millis opened the calendar picker, which then threw `null is not an object`. Committing an edit clears the cell while the picker is still mounted, and the picker's lazily-read props dereferenced the cleared value.
- **Editing a date no longer destroys the stored timestamp** — the calendar could not parse epoch numbers, so it showed *"Pick a date…"* for a row that plainly held a timestamp, and picking a date then wrote an ISO string into a column storing epoch millis. The picker now detects the stored format (epoch millis, epoch seconds, or ISO) and writes back in that same format, keeping the seconds and milliseconds it never displays.

#### Theming
- **Text colours are no longer dropped on the dark themes** — any element given a colour alongside a `text-ui-*` size lost the colour and inherited the ambient one. The "Add connection" button was the visible case: white text and icon on a white button, so it read as a blank slab.
- **Editors match the app's background** — the JSON view, SQL editors and data-diff panes painted a slightly different shade than the app around them, most visibly in the dark Studio theme. Editor surfaces are now taken from the live theme, so every theme matches.
- **Opening the data-diff page no longer re-tints every other editor** — it pinned itself to VS Code's dark theme, and an editor theme is applied globally.
- **Switching light / dark keeps the theme you chose** — toggling away from a hand-picked theme and back could land on plain Dark Studio instead of the one you were using.

#### Menus
- **Menus can be searched by what they show** — typing a database name in the Cloudflare D1 picker matched nothing, because rows were scored against their internal id rather than their label. Also fixes the Cloudflare account picker and the connection switcher.

### Changes

#### Data grid
- **The cell context menu is shorter and opens instantly** — the Copy and Filter variants moved into submenus (seventeen top-level rows down to thirteen), and building the quick-filter list no longer scans every loaded row on every right-click. Menus across the app are a touch denser, and submenus open without the scale animation that made them feel late.

#### Connections
- **The Cloudflare D1 database picker is a dropdown**, matching the engine and account pickers beside it, and a saved D1 connection opened from the sidebar now shows its account and database already selected instead of restarting on the first account.

#### AI
- **The conversation tab strip is gone from full-window AI mode**, where the sidebar already lists every chat and carries its own New-chat button. The docked panel keeps it.
