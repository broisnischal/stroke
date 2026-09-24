### New Features

#### Cell Editor
- **A real code editor for cell values** - JSON, HTML and long text open in CodeMirror, with line numbers, folding and its own find and replace (Mod+F, Mod+H). The caret always lands on the character you clicked

#### ER Diagram
- **Ctrl+scroll to zoom, scroll to pan** - Ctrl/Cmd + wheel (or a trackpad pinch) zooms at the cursor, the wheel scrolls the diagram, and Shift+wheel scrolls sideways

### Bug Fixes

#### App
- **No startup flicker** - the window stays hidden until its first screen is ready, so Windows no longer flashes between two blacks before the app appears
- **Reconnecting opens straight onto your tables** - a fast reconnect skips the "Reconnecting" screen and the empty sidebar; a slow one still shows the overlay after 700ms
- **Closing Stroke quits it** - there is no tray icon anymore, and closing the last window ends the process instead of leaving a hidden copy running on every close

#### Canvas Table
- **No more flicker opening related rows** - opening or resizing the related-rows panel no longer shows the grid stretched for a frame
- **Switching tables lands as one swap** - the grid keeps the last table on screen for a quick load instead of blanking, and loading spinners fade in rather than flashing for a frame
- **Quieter toolbar during fetches** - controls only dim when a fetch takes longer than 200ms
- **Related rows stay up between lookups** - clicking another row's key keeps the current result on screen until the next one arrives
- **Hide all is always reachable** - the columns menu offers Hide all and Show all whenever each applies, including after relationship columns load

#### Keyboard
- **Shift+Tab works on Linux** - the sidebar table list, the database picker and the saved-connection list move up with Shift+Tab instead of jumping out of the list
- **Sidebar arrows after a click** - keyboard navigation in the table list keeps working after clicking near a row's icon
- **Focus ring only for the keyboard** - clicking a saved connection no longer leaves a focus outline on it

#### License
- **Smooth activation** - the trial screen stays up through the celebration, turns into a welcome, and fades into the app; the confetti no longer falls across the workspace, and the form stops flickering between attempts

#### Connections
- **No clipboard permission dialog** - the connect dialog reads the clipboard through the OS rather than the permission-gated web API, so Windows no longer interrupts with a "wants to see text and images copied to the clipboard" prompt. It still only reads when you click the paste bar, never on open or on window focus

### Changes
- The new tab no longer repeats the connection details (database, engine, schema, host, user) already shown in the title and status bar, and its Quick access label now sits with its tiles
- Build the release installers on your own machine with `npm run tauri:build:mac` and `npm run tauri:build:win`, with Windows cross-compiled from macOS or Linux
