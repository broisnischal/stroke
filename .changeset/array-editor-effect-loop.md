### New Features
- Alt+J previews the whole row as JSON in the bottom dock, and follows the cursor from row to row

### Bug Fixes
- Opening an array cell no longer takes the view down with "This view hit an error"
- Scrolling no longer tears, leaving a band of repeated rows above a seam
- A cell holding multi-line text reads on one line instead of showing gaps where the line breaks were
- Control characters show what they are instead of an empty box
- The switch keeps its thumb inside its track at every zoom level

### Changes
- Array columns read as JSON, the same form the editor and the jsonb column beside them already used
- The array editor reads as one list instead of a stack of separate fields, and its row controls stay put instead of appearing under the pointer
- The expanded row and its JSON tree sit on one type scale, and a key's colon sits against the key
