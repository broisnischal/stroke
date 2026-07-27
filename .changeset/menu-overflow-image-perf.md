### Bug Fixes

- **Menus no longer clip long labels.** Context-menu and dropdown panels used fixed widths, so a label that did not fit painted straight through the rounded border — most visibly `Count chars / words / bytes` in the cell **Transform** submenu. Panels now size to their longest label, are capped at a shared maximum, and clip inside the border rather than over it. Labels that do exceed the cap now end in an ellipsis instead of a mid-glyph cut.
- **Chart axis dropdowns are readable again.** The axis pickers in the chart view opened from the SQL editor are native `<select>` elements whose options inherited a transparent background and near-white text, leaving the popup unreadable against the system menu surface. Options are now pinned to the popover colors, which fixes every native dropdown in the app.
- **Image columns no longer stall the grid.** Applying the avatar / image-thumbnail transform to a column started a full-resolution decode for every visible cell at once; on multi-megapixel sources that meant gigabytes of decoded image data. Decodes are now limited to a few at a time, restricted to rows actually on screen, downscaled once and released, and cached with an eviction policy that keeps visible thumbnails. Thumbnails are also freed when a table closes.
- **Fixed a memory leak when exporting CSV from a notebook cell**, which held the entire exported file in memory until the window was reloaded.
</content>
</invoke>
