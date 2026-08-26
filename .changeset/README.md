# Changesets

Add a `.md` file here in any PR that has user-visible changes.
Name it anything - `my-feature.md`, `fix-datatable.md`, etc.

When the PR is merged with a `release:*` label, `auto-release.yml`
folds all changeset files into `CHANGELOG.md` under the new version
and deletes the files.

## Format

Use the same headings as CHANGELOG.md:

```markdown
### New Features

#### Canvas Table
- **Feature name** - What it does and why it's useful

#### SQL Editor
- **Another feature** - Description

### Bug Fixes
- Fixed something that was broken

### Changes
- Removed or changed behaviour
```

Supported top-level headings (case-insensitive):
- `### New Features`  - shows as ✨ New Features in the app
- `### Bug Fixes`     - shows as 🐛 Bug Fixes
- `### Changes`       - shows as 🔧 Improvements

Sub-sections (`####`) are optional but group items nicely in the release notes page.

If a PR has no user-visible changes (docs, CI, refactors), skip the changeset file.
