import { describe, it, expect } from 'vitest'
import { visibleRowCount, soleMatch } from './sidebar-filter.js'

/** @param {Partial<import('./sidebar-filter.js').FilterLists>} over */
const lists = (over = {}) => ({
  tables: [], tablesTotal: 0,
  views: [], matViews: [], viewsTotal: 0,
  recent: [], recentTotal: 0,
  pins: [], pinsTotal: 0,
  databases: [], databasesTotal: 0,
  activeDbKey: '',
  ...over,
})

describe('visibleRowCount', () => {
  it('counts pinned rows as Tables rows - they render in that tab', () => {
    const l = lists({ tables: [{ name: 'a' }], tablesTotal: 14, pins: ['orders'], pinsTotal: 3 })
    expect(visibleRowCount('tables', l)).toEqual({ shown: 2, total: 17 })
  })

  it('counts the open tab only', () => {
    const l = lists({
      tables: [{ name: 'a' }], tablesTotal: 14,
      views: [{ name: 'v1' }, { name: 'v2' }], viewsTotal: 9,
    })
    expect(visibleRowCount('tables', l)).toEqual({ shown: 1, total: 14 })
    expect(visibleRowCount('views', l)).toEqual({ shown: 2, total: 9 })
  })

  it('counts materialized views alongside views', () => {
    const l = lists({ views: [{ name: 'v' }], matViews: [{ name: 'mv' }], viewsTotal: 4 })
    expect(visibleRowCount('views', l)).toEqual({ shown: 2, total: 4 })
  })

  it('caps recents at the five rows it draws', () => {
    const recent = Array.from({ length: 8 }, (_, i) => ({ schema: 'public', table: `t${i}` }))
    expect(visibleRowCount('recent', lists({ recent, recentTotal: 8 }))).toEqual({ shown: 5, total: 5 })
  })

  it('is empty for an unknown tab', () => {
    expect(visibleRowCount('nope', lists())).toEqual({ shown: 0, total: 0 })
  })
})

describe('soleMatch', () => {
  it('picks the one table left by the filter', () => {
    const l = lists({ tables: [{ name: 'ingest_jobs' }], tablesTotal: 14 })
    expect(soleMatch('tables', l)).toEqual({ kind: 'table', name: 'ingest_jobs' })
  })

  it('is null with several matches', () => {
    const l = lists({ tables: [{ name: 'a' }, { name: 'b' }], tablesTotal: 14 })
    expect(soleMatch('tables', l)).toBeNull()
  })

  it('is null with no matches', () => {
    expect(soleMatch('tables', lists({ tablesTotal: 14 }))).toBeNull()
  })

  it('finds the single match whether it is a view or a materialized view', () => {
    expect(soleMatch('views', lists({ views: [{ name: 'v' }], viewsTotal: 3 })))
      .toEqual({ kind: 'table', name: 'v' })
    expect(soleMatch('views', lists({ matViews: [{ name: 'mv' }], viewsTotal: 3 })))
      .toEqual({ kind: 'table', name: 'mv' })
  })

  it('carries the schema for a recent row, which needs both to open', () => {
    const l = lists({ recent: [{ schema: 'analytics', table: 'events' }], recentTotal: 6 })
    expect(soleMatch('recent', l)).toEqual({ kind: 'recent', name: 'events', schema: 'analytics' })
  })

  it('picks a pinned table, which the Tables tab draws above its own list', () => {
    expect(soleMatch('tables', lists({ pins: ['orders'], pinsTotal: 3, tablesTotal: 14 })))
      .toEqual({ kind: 'table', name: 'orders' })
  })

  it('refuses when one pin and one table both match - two rows, not one', () => {
    const l = lists({ pins: ['orders'], pinsTotal: 3, tables: [{ name: 'order_items' }], tablesTotal: 14 })
    expect(soleMatch('tables', l)).toBeNull()
  })

  it('picks a database and hands back the entry the switch needs', () => {
    const db = { key: 'chatbot_test', label: 'chatbot_test' }
    const l = lists({ databases: [db], databasesTotal: 3, activeDbKey: 'chatbot' })
    expect(soleMatch('databases', l)).toEqual({ kind: 'database', name: 'chatbot_test', entry: db })
  })

  it('refuses the database already open, which does nothing when clicked', () => {
    const db = { key: 'chatbot', label: 'chatbot' }
    const l = lists({ databases: [db], databasesTotal: 3, activeDbKey: 'chatbot' })
    expect(soleMatch('databases', l)).toBeNull()
  })

  it('does not pick a sixth recent row that the list never drew', () => {
    // Six matches, five drawn: there is no single row on screen to open.
    const recent = Array.from({ length: 6 }, (_, i) => ({ schema: 'public', table: `t${i}` }))
    expect(soleMatch('recent', lists({ recent, recentTotal: 9 }))).toBeNull()
  })
})
