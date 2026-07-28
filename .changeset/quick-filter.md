### New Features

#### Canvas Table
- **Quick Filter** — Right-click a cell and open "Quick filter" for one-click filters shaped by the column's type: date/timestamp columns get date-range presets (Today, Last 7/30 days, This month/year) plus before/after this value; boolean and enum columns list their values; low-cardinality text columns surface the distinct values present in the loaded rows; number and text columns get the comparison operators seeded with the cell's value; JSON/JSONB columns offer "has key" filters for the object's top-level keys. Applying one drops a normal filter into the filter bar so it composes with everything else.
