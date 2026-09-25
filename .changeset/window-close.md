### Bug Fixes
- Closing the window quits Stroke again. 2.1.0 dropped the tray and the hide-on-close handler that went with it, which let close run through to `destroy` for the first time. `destroy` was never in the capability file, so the ACL refused it and the window stayed put. With no tray and no window decorations, that left no way to quit the app at all.
- Second windows (`Ctrl/Cmd+Shift+N`) respond to their title bar again. The capability only covered the window labelled `main`, so every control on a second window (close, minimize, maximize, and dragging the bar) was denied.
