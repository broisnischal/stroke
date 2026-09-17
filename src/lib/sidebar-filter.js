/**
 * What the sidebar's filter box is looking at, and what Enter should do with it.
 *
 * Pulled out of `Sidebar.svelte` so the rule has a test rather than a reading:
 * the component can only be checked by driving the real app, and "does Enter
 * open the one match" is exactly the sort of thing that is easy to get right in
 * the markup and wrong in the list it counts.
 *
 * @typedef {'tables' | 'views' | 'recent' | 'databases'} SidebarTab
 *
 * Every list here is already filtered by the search term - this module counts
 * and picks, it never filters.
 * @typedef {object} FilterLists
 * @property {{ name: string }[]} tables        filtered, un-pinned regular tables
 * @property {number} tablesTotal               un-pinned regular tables before the search
 * @property {string[]} pins                    filtered pinned tables - they render at the
 *                                              TOP of the Tables tab, so they are Tables rows
 * @property {number} pinsTotal                 pinned tables before the search
 * @property {{ name: string }[]} views
 * @property {{ name: string }[]} matViews
 * @property {number} viewsTotal                views + materialized views before the search
 * @property {{ schema: string, table: string }[]} recent
 * @property {number} recentTotal
 * @property {{ key: string, label: string }[]} databases
 * @property {number} databasesTotal
 * @property {string} activeDbKey               the database already open
 *
 * @typedef {{ kind: 'table', name: string }
 *         | { kind: 'recent', name: string, schema: string }
 *         | { kind: 'database', name: string, entry: { key: string, label: string } }} SoleMatch
 */

/** The recents list never draws more than five rows, so it never counts more. */
const RECENT_CAP = 5

/**
 * How many rows the open tab is drawing, and how many it would draw unfiltered.
 * @param {SidebarTab | string} tab
 * @param {FilterLists} lists
 * @returns {{ shown: number, total: number }}
 */
export function visibleRowCount(tab, lists) {
  switch (tab) {
    case 'tables':
      // Pinned rows are drawn by this tab, above the table list, so the tab's
      // count is both lists. Counting only the un-pinned half made the header
      // say 0 on a schema whose every table was pinned.
      return {
        shown: lists.pins.length + lists.tables.length,
        total: lists.pinsTotal + lists.tablesTotal,
      }
    case 'views':
      // Materialized views ride in the Views tab, so both lists count as one.
      return { shown: lists.views.length + lists.matViews.length, total: lists.viewsTotal }
    case 'recent':
      return {
        shown: Math.min(lists.recent.length, RECENT_CAP),
        total: Math.min(lists.recentTotal, RECENT_CAP),
      }
    case 'databases':
      return { shown: lists.databases.length, total: lists.databasesTotal }
    default:
      return { shown: 0, total: 0 }
  }
}

/**
 * The single row Enter should open, or null.
 *
 * Null whenever there is not exactly one row to act on. A key that guesses which
 * of several rows was meant is worse than a key that does nothing, and a key
 * that reports success on a row which does nothing when clicked - the database
 * already open - is worse still.
 *
 * @param {SidebarTab | string} tab
 * @param {FilterLists} lists
 * @returns {SoleMatch | null}
 */
export function soleMatch(tab, lists) {
  if (visibleRowCount(tab, lists).shown !== 1) return null
  switch (tab) {
    case 'tables': {
      // Exactly one row across both lists, so whichever holds it is the match.
      const name = lists.pins[0] ?? lists.tables[0]?.name
      return name ? { kind: 'table', name } : null
    }
    case 'views': {
      // Either list can hold the single match; views render first.
      const v = lists.views[0] ?? lists.matViews[0]
      return v ? { kind: 'table', name: v.name } : null
    }
    case 'recent': {
      const r = lists.recent[0]
      return r ? { kind: 'recent', name: r.table, schema: r.schema } : null
    }
    case 'databases': {
      const db = lists.databases[0]
      if (!db || db.key === lists.activeDbKey) return null
      return { kind: 'database', name: db.label, entry: db }
    }
    default:
      return null
  }
}
