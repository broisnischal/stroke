import { describe, it, expect } from 'vitest'
import {
  COLS, ROWS, TARGETS, ROTATE_EVERY, START_TICK_MS, MIN_TICK_MS,
  createGame, turn, step, makeGrid, GRACE_CELLS, MIN_TARGETS,
} from './vacuum.js'
import { isMagic, GAME_WORD, CRASH_WORD, CLEAR_WORD } from './easter-eggs.js'

/** Deterministic PRNG so every assertion below is reproducible. */
function seeded(seed = 1) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

/** Put one tuple of `status` directly ahead of the head and nothing else. */
function stage(g, status) {
  g.grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ''))
  const h = g.snake[0]
  g.grid[h.y + g.dir.y][h.x + g.dir.x] = status
  return g
}

describe('createGame', () => {
  it('starts with a clear runway under the worker', () => {
    const g = createGame(seeded())
    for (const c of g.snake) expect(g.grid[c.y][c.x]).toBe('')
  })
  it('picks a target that is never "dead"', () => {
    for (let i = 1; i < 30; i++) expect(TARGETS).toContain(createGame(seeded(i)).target)
  })
})

describe('turn', () => {
  it('refuses a straight reversal', () => {
    const g = createGame(seeded())     // heading right
    turn(g, { x: -1, y: 0 })
    expect(g.pendingDir).toEqual({ x: 1, y: 0 })
  })
  it('queues rather than applying immediately', () => {
    // Two turns inside one frame must not fold you into your own neck.
    const g = createGame(seeded())
    turn(g, { x: 0, y: 1 })
    turn(g, { x: -1, y: 0 })  // reversal of the QUEUED dir is still legal to queue
    expect(g.dir).toEqual({ x: 1, y: 0 })
  })
})

describe('step', () => {
  it('eating the target grows, scores and speeds up', () => {
    const g = stage(createGame(seeded()), 'active')
    g.target = 'active'
    const len = g.snake.length
    step(g, seeded(9))
    expect(g.over).toBeNull()
    expect(g.snake.length).toBe(len + 1)
    expect(g.score).toBe(10)
    expect(g.tickMs).toBeLessThan(START_TICK_MS)
  })

  it('eating a still-visible tuple aborts the pass', () => {
    const g = stage(createGame(seeded()), 'locked')
    g.target = 'active'
    step(g, seeded(9))
    expect(g.over?.reason).toMatch(/still visible/)
  })

  it('dead tuples are safe, worthless and consumed', () => {
    const g = stage(createGame(seeded()), 'dead')
    g.target = 'active'
    const len = g.snake.length
    const h = g.snake[0]
    const ahead = { x: h.x + g.dir.x, y: h.y + g.dir.y }
    step(g, seeded(9))
    expect(g.over).toBeNull()
    expect(g.score).toBe(0)
    expect(g.snake.length).toBe(len)
    expect(g.grid[ahead.y][ahead.x]).toBe('')
  })

  it('running off the page ends the run', () => {
    const g = createGame(seeded())
    g.grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ''))
    for (let i = 0; i < COLS + 2 && !g.over; i++) step(g, seeded(3))
    expect(g.over?.reason).toMatch(/out of range/)
  })

  it('biting yourself is a deadlock, not a wall', () => {
    const g = createGame(seeded())
    g.grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ''))
    // Grow enough to be able to reach our own body, then turn in a tight square.
    g.snake = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 4, y: 4 }, { x: 5, y: 4 }]
    g.dir = { x: 0, y: -1 }
    g.pendingDir = { x: 0, y: -1 }
    step(g, seeded(3))
    expect(g.over?.reason).toMatch(/deadlock/)
  })

  it('rotates the target every ROTATE_EVERY pickups, and never to "dead"', () => {
    const g = createGame(seeded())
    const first = g.target
    for (let i = 0; i < ROTATE_EVERY; i++) {
      stage(g, g.target)
      step(g, seeded(i + 2))
    }
    expect(g.eaten).toBe(ROTATE_EVERY)
    expect(g.target).not.toBe(first)
    expect(TARGETS).toContain(g.target)
  })

  it('never ticks faster than the floor', () => {
    const g = createGame(seeded())
    for (let i = 0; i < 200; i++) { stage(g, g.target); step(g, seeded(i + 1)) }
    expect(g.tickMs).toBeGreaterThanOrEqual(MIN_TICK_MS)
  })

  it('does nothing once the run is over', () => {
    const g = stage(createGame(seeded()), 'locked')
    g.target = 'active'
    step(g, seeded(9))
    const snapshot = JSON.stringify(g.snake)
    step(g, seeded(9))
    expect(JSON.stringify(g.snake)).toBe(snapshot)
  })
})

describe('makeGrid', () => {
  it('is the right shape and mostly empty', () => {
    // Every cell used to be filled, which is what made the game unplayable.
    const grid = makeGrid(seeded())
    expect(grid).toHaveLength(ROWS)
    for (const row of grid) expect(row).toHaveLength(COLS)
    const occupied = grid.flat().filter(Boolean).length
    expect(occupied).toBeLessThan(COLS * ROWS * 0.25)
  })
})

describe('magic words', () => {
  it('match the whole value, case-insensitively', () => {
    expect(isMagic('  BroisNees ', GAME_WORD)).toBe(true)
    expect(isMagic('CRASH', CRASH_WORD)).toBe(true)
    expect(isMagic('clear', CLEAR_WORD)).toBe(true)
  })
  it('never fire on a substring', () => {
    // Real searches must survive: these are all plausible things to look for.
    expect(isMagic('crash_logs', CRASH_WORD)).toBe(false)
    expect(isMagic('app crashed', CRASH_WORD)).toBe(false)
    expect(isMagic('cleared_at', CLEAR_WORD)).toBe(false)
    expect(isMagic('broisnee', GAME_WORD)).toBe(false)
  })
})

describe('target rotation is never a death sentence', () => {
  it('sweeps the cells you are already committed to', () => {
    // The exact shape of the bug: lined up on a tuple that was legal when you
    // committed to it, and the rotation makes it fatal.
    const g = createGame(seeded())
    g.grid = Array.from({ length: g.rows }, () => Array.from({ length: g.cols }, () => ''))
    g.target = 'stale'
    const h = g.snake[0]
    g.grid[h.y][h.x + 1] = 'stale'       // the pickup that triggers the rotation
    g.grid[h.y][h.x + 2] = 'stale'       // committed to, and about to become fatal
    g.grid[h.y][h.x + 3] = 'stale'
    g.eaten = ROTATE_EVERY - 1           // next pickup rotates

    step(g, seeded(5))                   // eats, rotates away from 'stale'
    expect(g.over).toBeNull()
    expect(g.target).not.toBe('stale')

    // The cells ahead were swept, so the next moves cannot kill us.
    step(g, seeded(5))
    step(g, seeded(5))
    expect(g.over).toBeNull()
  })

  it('leaves tuples beyond the grace window alone', () => {
    const g = createGame(seeded())
    g.grid = Array.from({ length: g.rows }, () => Array.from({ length: g.cols }, () => ''))
    g.target = 'stale'
    const h = g.snake[0]
    g.grid[h.y][h.x + 1] = 'stale'
    g.grid[h.y][h.x + 6] = 'locked'      // well outside the sweep
    g.eaten = ROTATE_EVERY - 1
    step(g, seeded(5))
    expect(g.grid[h.y][h.x + 6]).toBe('locked')
  })

  it('counts rotations so the banner can announce one', () => {
    const g = createGame(seeded())
    expect(g.rotations).toBe(0)
    for (let i = 0; i < ROTATE_EVERY; i++) { stage(g, g.target); step(g, seeded(i + 2)) }
    expect(g.rotations).toBe(1)
  })
})

describe('the board is playable', () => {
  it('is mostly empty floor, not wall-to-wall tuples', () => {
    // The bug this guards: a full board means almost any move lands on a
    // wrong-status tuple and the run ends on the first keypress.
    const g = createGame(seeded(), 40, 18)
    const total = g.cols * g.rows
    const occupied = g.grid.flat().filter(Boolean).length
    expect(occupied / total).toBeLessThan(0.25)
    expect(occupied).toBeGreaterThan(0)
  })

  it('always has something edible on it', () => {
    for (let i = 1; i < 12; i++) {
      const g = createGame(seeded(i), 30, 14)
      const targets = g.grid.flat().filter((c) => c === g.target).length
      expect(targets).toBeGreaterThanOrEqual(MIN_TARGETS)
    }
  })

  it('gives the worker a clear runway to start in', () => {
    const g = createGame(seeded(), 30, 14)
    const h = g.snake[0]
    for (let i = 1; i <= 4; i++) {
      if (h.x + i < g.cols) expect(g.grid[h.y][h.x + i]).toBe('')
    }
  })

  it('tops the board back up after a rotation', () => {
    const g = createGame(seeded(), 30, 14)
    g.grid = Array.from({ length: g.rows }, () => Array.from({ length: g.cols }, () => ''))
    const h = g.snake[0]
    g.grid[h.y][h.x + 1] = g.target
    g.eaten = ROTATE_EVERY - 1
    step(g, seeded(7))             // eats, rotates, and must restock
    const targets = g.grid.flat().filter((c) => c === g.target).length
    expect(targets).toBeGreaterThanOrEqual(MIN_TARGETS)
  })
})
