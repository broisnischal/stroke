### New Features

#### Navigation
- **Back / forward now restores your cursor, not just the tab** — like an editor's Go Back. Focus a cell, go somewhere else, press `Alt+←` and you land back on the same row and column, scrolled into view; `Alt+→` goes forward. Works across tabs and within a single table (jump far down a table and come straight back).
- **The mouse's back / forward buttons** drive the same two actions, alongside the arrows in the title bar.

### Bug Fixes

#### Navigation
- **`Alt+←` / `Alt+→` reach the history at all** — the grid claimed modified arrows for its own cell cursor, so the shortcut nudged the cursor sideways instead of navigating.
- **Positions inside a single table are recorded** — an entry was only kept once the cursor crossed twelve rows, so clicking between two nearby cells left nothing to go back to and back / forward looked like a cross-tab-only feature. Clicking a cell is aimed, so it now counts however short the move; arrow-key roaming still does not fill the history.
- **Back / forward now works for freshly opened tables** — opening a table from the sidebar bypassed the history entirely, so the back arrow did nothing.
- The focused column is kept in each tab's state, so switching tabs no longer loses which column you were on.

#### Data grid
- **Focused row highlight** — the row your cursor is on now carries a visible tint that runs edge to edge, across pinned columns and the row gutter, instead of stopping at the frozen edge.
