### New Features
- Cell values open in a code editor with line numbers, folding, and find and replace
- ER diagram: Ctrl+scroll zooms, scroll pans, Shift+scroll pans sideways
- Build release installers locally with `npm run tauri:build:mac` and `npm run tauri:build:win`

### Bug Fixes
- Window no longer flickers on startup
- A quick reconnect on startup opens straight onto your tables
- Closing the window quits Stroke instead of leaving it running in the tray
- No clipboard permission prompt on Windows when opening the connect dialog
- Grid no longer flickers when switching tables or opening related rows
- Related rows stay on screen while the next lookup loads
- Hide all in the columns menu stays available after relationship columns load
- Shift+Tab moves up the sidebar, database and connection lists on Linux
- Clicking a saved connection no longer leaves a focus outline on it
- License activation no longer stutters or drops confetti over the app

### Changes
- The new tab no longer repeats connection details already shown in the title and status bar
