import { describe, it, expect } from 'vitest'
import {
  createNavStack,
  navCurrent,
  navCanGoBack,
  navCanGoForward,
  isNavJump,
  navTransition,
  pushNav,
  navStepBack,
  navStepForward,
  resetNav,
  NAV_MAX,
  NAV_ROW_GAP,
  NAV_PUSH,
  NAV_PUSH_TAB,
  NAV_REFRESH,
  NAV_FORGET_CELL,
  NAV_IGNORE,
} from './nav-history.js'

/** @param {string} tabId @param {number | null} row @param {number | null} col @param {number | null} page */
const at = (tabId, row = null, col = null, page = 1) => ({ tabId, row, col, page })

/** Every tab id is live unless the test says otherwise. */
const alive = () => true

describe('isNavJump', () => {
  it('treats a different tab as a jump even with no cell position', () => {
    expect(isNavJump(at('a', 5), { tabId: 'b', row: null })).toBe(true)
  })

  it('treats a page change as a jump', () => {
    expect(isNavJump(at('a', 5, 0, 1), { tabId: 'a', row: 5, page: 2 })).toBe(true)
  })

  it('needs NAV_ROW_GAP rows within a page', () => {
    expect(isNavJump(at('a', 10), { tabId: 'a', row: 10 + NAV_ROW_GAP - 1, page: 1 })).toBe(false)
    expect(isNavJump(at('a', 10), { tabId: 'a', row: 10 + NAV_ROW_GAP, page: 1 })).toBe(true)
  })

  it('is direction-agnostic', () => {
    expect(isNavJump(at('a', 100), { tabId: 'a', row: 100 - NAV_ROW_GAP, page: 1 })).toBe(true)
  })

  it('never fires when either side has no row - a reload must not push an entry', () => {
    expect(isNavJump(at('a', null), { tabId: 'a', row: 900, page: 1 })).toBe(false)
    expect(isNavJump(at('a', 900), { tabId: 'a', row: null, page: 1 })).toBe(false)
  })
})

describe('navTransition', () => {
  it('records the first position it ever sees', () => {
    expect(navTransition(null, at('a', 3, 1))).toBe(NAV_PUSH)
  })

  it('records arrival in another tab without a cell', () => {
    expect(navTransition(at('a', 3, 1), at('b', 3, 1))).toBe(NAV_PUSH_TAB)
  })

  it('refreshes while roaming and pushes on a jump', () => {
    const cur = at('a', 10, 0)
    expect(navTransition(cur, at('a', 11, 0))).toBe(NAV_REFRESH)
    expect(navTransition(cur, at('a', 10 + NAV_ROW_GAP, 0))).toBe(NAV_PUSH)
  })

  it('refreshes on a column-only move - moving along a row is not a jump', () => {
    expect(navTransition(at('a', 10, 0), at('a', 10, 7))).toBe(NAV_REFRESH)
  })

  it('keeps the remembered cell when a reload clears the cursor', () => {
    expect(navTransition(at('a', 42, 2, 1), at('a', null, null, 1))).toBe(NAV_IGNORE)
  })

  it('drops the remembered cell when the page moved out from under it', () => {
    expect(navTransition(at('a', 42, 2, 1), at('a', null, null, 2))).toBe(NAV_FORGET_CELL)
  })

  it('does not drop a cell over a page it never recorded', () => {
    expect(navTransition(at('a', 42, 2, null), at('a', null, null, 3))).toBe(NAV_IGNORE)
  })

  it('records a cell landing on a fresh tab entry rather than treating it as a jump', () => {
    // The cross-tab push leaves row/col null; the arriving snapshot fills them in.
    expect(navTransition(at('b', null, null, null), at('b', 800, 3, 1))).toBe(NAV_REFRESH)
  })
})

describe('pushNav', () => {
  it('advances the cursor to each new entry', () => {
    const s = createNavStack()
    expect(navCurrent(s)).toBeNull()
    pushNav(s, at('a', 1))
    pushNav(s, at('b', 2))
    expect(s.index).toBe(1)
    expect(navCurrent(s)?.tabId).toBe('b')
  })

  it('drops the forward branch when a new jump diverges from it', () => {
    const s = createNavStack()
    pushNav(s, at('a'))
    pushNav(s, at('b'))
    pushNav(s, at('c'))
    navStepBack(s, alive) // now on b, with c ahead
    pushNav(s, at('d'))
    expect(s.entries.map((e) => e.tabId)).toEqual(['a', 'b', 'd'])
    expect(navCanGoForward(s)).toBe(false)
  })

  it('caps the stack and keeps the cursor on the newest entry', () => {
    const s = createNavStack()
    for (let i = 0; i < NAV_MAX + 20; i += 1) pushNav(s, at(`t${i}`))
    expect(s.entries.length).toBe(NAV_MAX)
    expect(s.index).toBe(NAV_MAX - 1)
    expect(navCurrent(s)?.tabId).toBe(`t${NAV_MAX + 19}`)
    // Oldest entries are the ones evicted.
    expect(s.entries[0].tabId).toBe('t20')
  })
})

describe('back / forward', () => {
  it('walks the history and back again', () => {
    const s = createNavStack()
    pushNav(s, at('a', 1, 1))
    pushNav(s, at('a', 500, 3))
    pushNav(s, at('b', 7, 0))

    expect(navStepBack(s, alive)).toMatchObject({ tabId: 'a', row: 500, col: 3 })
    expect(navStepBack(s, alive)).toMatchObject({ tabId: 'a', row: 1, col: 1 })
    expect(navCanGoBack(s)).toBe(false)
    expect(navStepBack(s, alive)).toBeNull()

    expect(navStepForward(s, alive)).toMatchObject({ row: 500 })
    expect(navStepForward(s, alive)).toMatchObject({ tabId: 'b', row: 7 })
    expect(navCanGoForward(s)).toBe(false)
    expect(navStepForward(s, alive)).toBeNull()
  })

  it('has nowhere to go with a single entry', () => {
    const s = createNavStack()
    pushNav(s, at('a', 2, 2))
    expect(navCanGoBack(s)).toBe(false)
    expect(navCanGoForward(s)).toBe(false)
  })
})

describe('closed tabs', () => {
  it('skips and drops entries for tabs that no longer exist, going back', () => {
    const s = createNavStack()
    pushNav(s, at('a', 1))
    pushNav(s, at('dead', 2))
    pushNav(s, at('gone', 3))
    pushNav(s, at('c', 4))
    const live = (id) => id === 'a' || id === 'c'

    expect(navStepBack(s, live)).toMatchObject({ tabId: 'a', row: 1 })
    expect(s.entries.map((e) => e.tabId)).toEqual(['a', 'c'])
    expect(s.index).toBe(0)
    // The surviving forward entry is still reachable.
    expect(navStepForward(s, live)).toMatchObject({ tabId: 'c' })
  })

  it('skips and drops entries for closed tabs, going forward', () => {
    const s = createNavStack()
    pushNav(s, at('a', 1))
    pushNav(s, at('dead', 2))
    pushNav(s, at('c', 3))
    navStepBack(s, () => true) // sit on 'dead'
    navStepBack(s, () => true) // sit on 'a'
    const live = (id) => id !== 'dead'

    expect(navStepForward(s, live)).toMatchObject({ tabId: 'c', row: 3 })
    expect(s.entries.map((e) => e.tabId)).toEqual(['a', 'c'])
    expect(s.index).toBe(1)
  })

  it('leaves the cursor on a real entry when every candidate is dead', () => {
    const s = createNavStack()
    pushNav(s, at('dead1'))
    pushNav(s, at('dead2'))
    pushNav(s, at('c'))
    const live = (id) => id === 'c'

    expect(navStepBack(s, live)).toBeNull()
    expect(s.entries.map((e) => e.tabId)).toEqual(['c'])
    expect(s.index).toBe(0)
    expect(navCurrent(s)?.tabId).toBe('c')
    expect(navCanGoBack(s)).toBe(false)
  })
})

describe('in-place refresh', () => {
  it('keeps the current entry level with the cursor without touching the array', () => {
    const s = createNavStack()
    pushNav(s, at('a', 1, 0))
    pushNav(s, at('b', 4, 0))
    const before = s.entries
    const cur = navCurrent(s)
    if (cur) {
      cur.row = 9
      cur.col = 2
    }
    expect(s.entries).toBe(before) // same array identity - no reallocation
    expect(navStepBack(s, alive)).toMatchObject({ tabId: 'a' })
    expect(navStepForward(s, alive)).toMatchObject({ tabId: 'b', row: 9, col: 2 })
  })
})

describe('resetNav', () => {
  it('empties the stack in place', () => {
    const s = createNavStack()
    pushNav(s, at('a'))
    pushNav(s, at('b'))
    resetNav(s)
    expect(s.entries).toEqual([])
    expect(s.index).toBe(-1)
    expect(navCurrent(s)).toBeNull()
    expect(navCanGoBack(s)).toBe(false)
    expect(navCanGoForward(s)).toBe(false)
  })
})
