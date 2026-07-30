### Changes

#### Fixed
- **Editing a date cell crashed the view** — a `created_at`-style column that stores Unix millis opened the calendar picker, which then threw `null is not an object`. Committing an edit clears the cell while the picker is still mounted, and its lazily-read props dereferenced the cleared value.
- **Editing a date no longer destroys the stored timestamp** — the calendar could not parse epoch numbers, so it showed "Pick a date…" for a row that plainly held a timestamp, and picking a date wrote an ISO string into a column storing epoch millis. The picker now detects the stored format (epoch millis, epoch seconds, or ISO) and writes back in that same format, keeping the seconds and millis it never shows.
- **Buttons and labels were invisible on the dark themes** — `cn()` discarded any text colour passed alongside a `text-ui-*` size, so elements fell back to inheriting the ambient colour. The "Add connection" button was the visible case: white text on a white button.
- **Editors matched the app's background** — the JSON view, SQL editors and data-diff panes painted a slightly different shade than the app around them. The data-diff page also pinned itself to VS Code's dark theme, which re-tinted every other editor in the app whenever that page was opened.
- **Switching light/dark keeps your chosen theme** — toggling away from a hand-picked theme and back could land on plain Dark Studio instead of the theme you were using.
- **Back/forward navigation** — `Alt+←`/`Alt+→` moved the cell cursor sideways instead of navigating, and positions inside a single table were only recorded after a 12-row jump, so going back within one table usually did nothing. Clicking a cell now records a position however short the move.
- **Searching a menu by what it shows** — typing a database name in the Cloudflare D1 picker matched nothing, because rows were scored against their internal id. Also fixes the Cloudflare account picker and the connection switcher.

#### Changed
- **The D1 database picker is a dropdown**, matching the engine and account pickers next to it, and a saved D1 connection picked from the sidebar now shows its account and database already selected.
- **The table context menu is shorter and opens instantly** — Copy and Filter variants moved into submenus (17 top-level rows down to 13), and building the quick-filter list no longer scans every loaded row on every right-click. Menus across the app are a touch denser.
- **The conversation tab strip is gone from full-window AI mode**, where the sidebar already lists every chat and carries its own New-chat button.
