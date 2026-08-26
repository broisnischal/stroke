### New Features

#### Sidebar
- **Manage databases, not just switch between them.** Right-click any row in the sidebar's Databases section for the server-level operations: rename, duplicate, drop, close other sessions, copy the name, and a Database info panel with owner, encoding, collation, size on disk and how many sessions are connected. A `+` in the section header creates one. PostgreSQL and MySQL, with each item enabled only where the engine can actually do it: MySQL has no `RENAME DATABASE` and no single-statement copy, and Postgres cannot rename, copy or drop the database the session is attached to, so those items say why rather than failing at the server. Every one of them shows the exact statement before it runs, dropping asks for the name typed back, and the drop dialog offers `WITH (FORCE)` since a single idle connection is enough to make Postgres refuse.

### Changes
- **The relationship column's chip stops changing shape under the cursor.** It was a fully rounded capsule with no border at rest, so hovering conjured a lozenge out of what read as plain text, and a long table name inside a full-radius pill read as a balloon. The chip now keeps one shape and one radius that matches the rest of the app, and hover moves its surface and border rather than its geometry.
- **No more em dashes anywhere in the app.** Every dash in the interface, in the settings copy and in the messages the backend sends up is now ordinary punctuation.
