### Bug Fixes

#### Window
- **The window no longer turns white while macOS asks for keychain access** — the *"Stroke wants to use your confidential information"* prompt ran on the main thread, stalling the event loop so the window could not repaint until the prompt was answered. Secret-store reads now happen off the main thread, the first read is deferred until after the app has painted, and the window's own surface matches the theme instead of defaulting to white.
- **No white flash on launch** — the window and webview had no background colour, so any frame before the UI painted showed white against the dark themes.
