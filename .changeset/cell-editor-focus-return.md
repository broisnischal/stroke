### Bug Fixes
- Escaping the cell editor dock puts focus back on the cell it came from. Closing the dock left focus on the element it was about to remove, so it fell through to the page body and the grid stopped answering arrow keys until I clicked a cell again. The close button and staging a change land focus in the same place.
