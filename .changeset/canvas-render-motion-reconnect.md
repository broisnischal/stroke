### Bug Fixes

#### Data Table
- **Grid no longer renders blank** — on macOS WebKit the canvas colour reader returned a stale computed colour, collapsing every theme token to one value so cell text and grid lines vanished (only badges/icons showed). Each colour is now resolved on its own node.
- **Grid no longer blacks out when switching tabs** — the cached 2D context could keep pointing at a canvas WebKit had recreated, so draws landed on an off-screen element. The context now always tracks the live canvas and repaints on mount/tab switch.

#### Schema Visualizer
- **Opens readable instead of a tiny sliver** — a deep schema no longer shrinks to an unreadable horizontal band; it lands at a legible zoom at the top-left of the graph (pan to explore), with roomier, larger table cards and more spacing.

#### Interface
- **Spinners and loaders animate at normal speed** — a global reduced-motion rule was forcing every animation to 0.12s, so spinners/pulses ran frantically fast when macOS "Reduce Motion" was on. Removed the global motion overrides.

### New Features

#### Connection
- **Silent auto-reconnect** — a dropped database connection (network blip, sleep/wake, idle timeout) now reconnects automatically when the network returns, the window refocuses, or you switch tables / refresh, showing only a subtle status-bar indicator instead of a "Connection lost" popup.

### Changes

#### Performance
- **Smoother scrolling and lower memory on large tables** — removed per-frame allocations in the grid render loop, decoupled selection/hover repaints from canvas resizing, and avoid allocating a per-page row-offset array on million-row tables.
