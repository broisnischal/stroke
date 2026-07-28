### Bug Fixes

#### Data Table
- Dropped the per-cell "JSON" badge on JSON/JSONB columns — it cluttered the grid and was the main cause of scroll lag. Clicking a cell still opens the JSON viewer.
- Much smoother scrolling on tables large and small: plain vertical scroll runs on the compositor again instead of being blocked by the wheel handler on every tick. Ctrl+wheel zoom and Shift+wheel horizontal scroll still work.
- Expanded inline-JSON rows no longer black out or leave the bottom unreachable on very large (millions of rows) tables — their reserved height stays stable while scrolling.

#### Onboarding & Window
- The window can be dragged, minimized, maximized, and closed during onboarding — the tour no longer sits on top of the titlebar.
- The app opens at the full usable size on every platform without sliding under the taskbar; on Windows and macOS it now keeps its maximized state across minimize/restore.
- The date/time picker in the insert/edit form is selectable again.

#### Connections
- Connecting auto-retries transient failures (timeouts, network blips) a few times with fast backoff, but surfaces auth/config errors (e.g. 401 Unauthorized) immediately instead of spinning.

#### Update Dialog
- The "update available" dialog is centered on top of the connection screen instead of hidden behind it, with cleaner buttons.

### Changes

#### Design
- New installs follow the system light/dark theme on first launch, and default to 125% zoom on Windows.
- Refined the light-theme primary accent to a deeper, higher-contrast blue.
- Redesigned the filter bar: consistent control heights and radii, subtle fills, and a neutral AND/OR toggle.
- Slimmer 3-step onboarding with an inline license-activation row.
- Smaller tab labels and removed the blue active-tab underline.
- Removed em dashes from UI copy throughout the app.
