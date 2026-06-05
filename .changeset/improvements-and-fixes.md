### New Features

#### Release Pipeline

- **In-app release notes** — the update dialog now shows a structured release notes page with ✨ New Features, 🐛 Bug Fixes, and 🔧 Improvements sections parsed from the changelog
- **Code signing** — builds are now signed on macOS (Developer ID + notarization) and Windows (certificate thumbprint via cert store) in CI

### Bug Fixes
- Fixed rel columns remaining visible in the canvas after being hidden from the columns panel — the toolbar was capped at showing 5 rel entries, so hiding all 5 caused DataTable to promote the next batch of FK tables into view with no way to hide them
- Fixed the `rel` badge not dimming visually when a relationship column is toggled to hidden in the columns panel
- Fixed the "Hide all" button in the columns panel not including relationship columns — clicking Hide now hides both regular and rel columns together

### Changes
- Renamed app references from **DB Studio** to **Stroke** across all files, workflows, and documentation
- Updated domain from `dbstudio.app` to `stroke.app` in license gate and about dialog
- Updated GitHub repo references from `broisnischal/studio` to `broisnischal/stroke` in updater endpoint, release workflow, and README
- Updated macOS bundle artifact name from `db-studio.app` to `Stroke.app` and all installer filenames from `db-studio_*` to `stroke_*` to match the `productName` in tauri config
