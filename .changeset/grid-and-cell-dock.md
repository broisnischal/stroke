### Bug Fixes

#### Canvas Table
- Escaping the cell dock puts focus back on the cell it came from. Closing it left focus on the element it was about to remove, so focus fell through to the page body and the grid stopped answering arrow keys until a cell was clicked again. The close button and staging a change land focus in the same place.
- Space previews the focused cell instead of typing a space into it. Space is a printable character, so it fell through to type-to-edit and opened the editor with a space already in it, which is the one keystroke on the grid that destroyed the cell it was aimed at.
- Soft wrap no longer freezes the app on a long line. A jsonb cell holding a file is one line of half a million characters, and CodeMirror lays a single line out whole however little of it is on screen, so wrapping that one measured every character at once. Past a longest-line cap the toggle is disabled rather than quietly off, and says why. Syntax highlighting stops at the same kind of boundary.
- The in-cell Load button updates the dock. It only re-read the dock when the dock already happened to be on that cell, which is not where it usually is, so the value loaded and the panel went on saying "not loaded" over a different row.
- A value past the 8 MB inline cap opens in the dock, which reads it in pages, instead of showing a message explaining that it was too big and which key to press.

#### Cell Editor
- Line numbers toggle on and off (Alt+L), and the choice is remembered. Soft wrap already hides them while it is on, so the button is disabled there and says why.
- Soft wrap is remembered. It was decided per cell from the text, so turning it on meant turning it on again at the next cell, and the next.
- Confirm dialogs show what is focused. They parked focus on the dialog box so Enter would not hit Cancel, which left nothing on screen looking focused. Focus goes to the confirm button, which is the default action and already says so with its ↵.
- The oversize cell notice had two Load buttons for one action.

#### Related Rows
- The related-rows sub-view draws in the table style that is actually selected. It read three booleans off the grid, so dotted, dashed, hairline, double, bordered, ledger, graph and bands all came out as plain solid lines, directly under a grid drawing something else.

#### Startup
- The window can no longer be stuck on a black screen. The page boots hidden and JavaScript reveals it, but the window is shown on a separate timer, so anything that stopped the bundle first left a black rectangle with no way out but killing the app. The reveal failsafe now runs before anything that can throw, and the page carries a second one that needs no JavaScript at all.

#### Find in Database
- Ctrl+F focuses the search box. It did nothing there before.
- The search bar lines up with the sidebar header beside it. It stood about 52px against the header's 36px.

### Changes

#### Canvas Table
- Shift+Space previews the cell and steps into the editor, with the caret at the end of a short value and the top of a long one. Alt+Space steps into a dock that is already open. Plain Space leaves the cursor on the grid so the arrows keep walking the table and the dock follows along.
- Alt+A opens the filter on the column the cursor is already on, with an operator chosen from that column's type, instead of on whichever column happens to be first.
- The table view shortcuts lost a key: filter, sort, columns and reset are Alt+A, Alt+S, Alt+C and Alt+R, matching the Alt+N the toolbar already used.

#### Find in Database
- Searching happens as you type, 400ms after it stops, so the Search button is gone. One search is a query per table, so a pause is what makes this affordable. Enter skips the wait, Escape clears the box and the results.
