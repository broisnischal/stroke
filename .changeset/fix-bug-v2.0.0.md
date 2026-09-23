### Bug Fixes

#### Canvas Table
- **No more flicker opening related rows** - opening or resizing the related-rows panel no longer shows the grid stretched for a frame
- **Switching tables lands as one swap** - the grid keeps the last table on screen for a quick load instead of blanking, and loading spinners fade in rather than flashing for a frame
- **Quieter toolbar during fetches** - controls only dim when a fetch takes longer than 200ms

#### App
- **Smoother startup** - the window fades in once, on its first finished screen, instead of fading in empty and then popping in the app

#### Connections
- **No surprise clipboard prompts** - the connect dialog reads the clipboard only when you click the paste bar, not on open or every time the window gets focus

### Changes
- The new tab no longer repeats the connection details (database, engine, schema, host, user) already shown in the title and status bar
- Build the release installers on your own machine with `npm run tauri:build:mac` and `npm run tauri:build:win`, with Windows cross-compiled from macOS or Linux
