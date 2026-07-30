### Changes

#### Fixed
- **Fixed the window going pure white while the OS keychain prompt is up** — the secret-vault commands (AI keys, Cloudflare/provider OAuth tokens) were declared without `async`, so Tauri ran them on the main thread. A keychain read blocks until the user answers the system "wants to use your confidential information" prompt, which stalled the event loop and left the window unable to composite — a white rectangle behind the modal. All keychain access now runs on the blocking pool, so the UI keeps painting while the prompt is up.
- **The first vault read no longer races the first frame** — it was fired during module evaluation, before the app was mounted, so the keychain prompt could appear over a window that had never painted. It now runs after the first paint.
- **No more white flash on launch** — the window and webview had no background colour, so any uncomposited frame (cold start, reload) showed the default white against the dark themes. The surface now matches the light/dark base background and follows the OS appearance.
