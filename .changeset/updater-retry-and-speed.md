### Bug Fixes
- The update dialog offers a Retry button when a check or a download fails, instead of leaving the error on screen with nothing to do about it.
- A failed check no longer says "Checking for updates…" in its header while showing the error underneath, and a long endpoint URL wraps inside the dialog rather than running past its edge.

### Changes
- Update checks give up after 15 seconds. Without a bound they inherited the HTTP stack's default and could sit on "Checking for updates…" long after the request was dead.
- Downloading an update no longer redraws the dialog on every network chunk. Progress is published once a frame, which takes the redraw count for a 100MB build from thousands down to about one per 16ms.
