### New Features
- Space previews the focused cell, Shift+Space opens it with the caret already in the editor
- Line numbers in the cell editor toggle with Alt+L
- Stroke's mark and name show while the app starts

### Bug Fixes
- Soft wrap no longer freezes the app on a cell held on one very long line
- Space no longer types a space into the cell it was meant to preview
- Escape from the cell editor puts focus back on the cell it came from
- The window no longer starts on a black screen
- Confirm dialogs show which button is focused
- Related rows follow the cursor sideways across foreign key columns
- Related rows draw in the table style you selected
- The Load button on a cell updates the preview below it
- A value past the size cap opens in the preview instead of a message about it
- Ctrl+F focuses the search box in Find in database
- The cell editor bar keeps its buttons on screen at any width

### Changes
- Filter, sort, columns and reset move to Alt+A, Alt+S, Alt+C and Alt+R
- Alt+A opens the filter on the column the cursor is already on
- Find in database searches as you type, and Escape clears it
- Soft wrap and line numbers are remembered from one cell to the next
- Opening and scrolling related rows is faster
