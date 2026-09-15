/**
 * VACUUM - the hidden game.
 *
 * You are an autovacuum worker crawling a page of tuples. A banner names the
 * status being reclaimed this pass; eat those tuples and you grow. Eat a tuple
 * that is still visible and the pass aborts.
 *
 * Snake is the skeleton because snake is instantly playable - nobody needs to be
 * told what arrow keys do. The database part is the part that changes how you
 * play: the target rotates every few pickups, so you cannot run on muscle memory
 * down a line of cells. You have to READ the grid, which is the one thing this
 * app is actually for.
 *
 * All logic here is pure and synchronous so it can be tested without a canvas.
 */

/**
 * Fallback board size. The real one comes from the viewport - the page fills the
 * tab the way a table does, so the number of columns is whatever fits, not a
 * number chosen here.
 */
export const COLS = 22
export const ROWS = 13

/** Tuple states. `dead` is never a target - it is the one that is always safe. */
export const STATUSES = /** @type {const} */ (['active', 'stale', 'locked', 'dead'])

/** Targets rotate through these; `dead` is excluded so there is always a wrong answer to avoid. */
export const TARGETS = /** @type {const} */ (['active', 'stale', 'locked'])

/** Pickups between target rotations. Low enough that you never stop reading. */
export const ROTATE_EVERY = 4

export const START_TICK_MS = 190
export const MIN_TICK_MS = 80
/** Each pickup shaves this off the tick, so the ramp is felt rather than announced. */
export const SPEEDUP_MS = 4

export const HIGH_SCORE_KEY = 'stroke:vacuum-best'

/** @typedef {{ x: number, y: number }} Cell */
/**
 * @typedef {{
 *   cols: number,
 *   rows: number,
 *   snake: Cell[],
 *   dir: Cell,
 *   pendingDir: Cell,
 *   grid: string[][],
 *   target: string,
 *   score: number,
 *   eaten: number,
 *   rotations: number,
 *   tickMs: number,
 *   over: null | { reason: string, detail: string },
 * }} GameState
 */

/** @param {() => number} rnd */
function randomStatus(rnd) {
  return STATUSES[Math.floor(rnd() * STATUSES.length)]
}

/**
 * Share of cells holding a tuple. Everything else is empty floor you move through.
 *
 * The first version filled EVERY cell, which made the game unplayable rather than
 * hard: with no empty floor, almost any move landed on a wrong-status tuple and
 * the run ended on the first or second keypress. A board is mostly floor - the
 * tuples are what you steer between.
 */
export const DENSITY = 0.09
/** Targets guaranteed on the board, so there is always something to go for. */
export const MIN_TARGETS = 5

/**
 * A mostly-empty grid with a sparse scatter of tuples.
 * @param {() => number} rnd @param {number} [cols] @param {number} [rows]
 */
export function makeGrid(rnd, cols = COLS, rows = ROWS) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (rnd() < DENSITY ? randomStatus(rnd) : '')),
  )
}

/**
 * Top the board up to MIN_TARGETS of the current target.
 *
 * Called after every rotation and every pickup: without it a rotation can leave
 * you on a board with nothing edible on it, which is a dead end rather than a
 * challenge.
 * @param {GameState} s @param {() => number} rnd
 */
export function ensureTargets(s, rnd) {
  let have = 0
  const free = []
  for (let y = 0; y < s.rows; y++) {
    for (let x = 0; x < s.cols; x++) {
      if (s.grid[y][x] === s.target) have += 1
      else if (!s.grid[y][x] && !s.snake.some((c) => c.x === x && c.y === y)) free.push({ x, y })
    }
  }
  for (let i = have; i < MIN_TARGETS && free.length > 0; i++) {
    const k = Math.floor(rnd() * free.length)
    const spot = free.splice(k, 1)[0]
    s.grid[spot.y][spot.x] = s.target
  }
}

/** @param {() => number} [rnd] @param {number} [cols] @param {number} [rows] */
export function createGame(rnd = Math.random, cols = COLS, rows = ROWS) {
  const mid = { x: Math.floor(cols / 2), y: Math.floor(rows / 2) }
  const snake = [mid, { x: mid.x - 1, y: mid.y }, { x: mid.x - 2, y: mid.y }]
  const grid = makeGrid(rnd, cols, rows)
  // The worker's own cells start empty, and so does the runway in front of it:
  // spawning nose-to-nose with a tuple you are about to be told not to eat is not
  // a fair first move.
  for (const c of snake) grid[c.y][c.x] = ''
  for (let i = 1; i <= 4; i++) {
    const x = snake[0].x + i
    if (x < cols) grid[snake[0].y][x] = ''
  }
  const state = /** @type {GameState} */ ({
    cols,
    rows,
    snake,
    dir: { x: 1, y: 0 },
    pendingDir: { x: 1, y: 0 },
    grid,
    target: TARGETS[Math.floor(rnd() * TARGETS.length)],
    score: 0,
    eaten: 0,
    rotations: 0,
    tickMs: START_TICK_MS,
    over: null,
  })
  ensureTargets(state, rnd)
  return state
}

/**
 * Queue a direction change.
 *
 * Applied on the next tick, not immediately: two keys inside one frame could
 * otherwise turn you 180° into your own neck, which reads as the game cheating
 * rather than as a mistake you made. A straight reversal is rejected outright.
 * @param {GameState} s @param {Cell} dir
 */
export function turn(s, dir) {
  if (s.over) return
  const cur = s.dir
  if (dir.x === -cur.x && dir.y === -cur.y) return
  if (dir.x === cur.x && dir.y === cur.y) return
  s.pendingDir = dir
}

/** @param {GameState} s @param {() => number} [rnd] */
export function step(s, rnd = Math.random) {
  if (s.over) return s
  s.dir = s.pendingDir
  const head = s.snake[0]
  const next = { x: head.x + s.dir.x, y: head.y + s.dir.y }

  if (next.x < 0 || next.x >= s.cols || next.y < 0 || next.y >= s.rows) {
    s.over = { reason: 'ERROR: cursor out of range', detail: 'You ran off the end of the page.' }
    return s
  }
  if (s.snake.some((c) => c.x === next.x && c.y === next.y)) {
    s.over = { reason: 'ERROR: deadlock detected', detail: 'You waited on yourself.' }
    return s
  }

  const cell = s.grid[next.y][next.x]
  if (cell && cell !== s.target && cell !== 'dead') {
    s.over = {
      reason: 'ERROR: tuple still visible',
      detail: `You reclaimed a '${cell}' tuple while vacuuming '${s.target}'.`,
    }
    return s
  }

  s.snake.unshift(next)

  if (cell === s.target) {
    s.grid[next.y][next.x] = ''
    s.score += 10
    s.eaten += 1
    s.tickMs = Math.max(MIN_TICK_MS, s.tickMs - SPEEDUP_MS)
    // Put a fresh tuple somewhere else so the page never empties out.
    respawn(s, rnd)
    if (s.eaten % ROTATE_EVERY === 0) rotateTarget(s, rnd)
    ensureTargets(s, rnd)
  } else {
    // Only grow on a pickup; otherwise the tail follows the head.
    s.snake.pop()
    // Crawling over a dead tuple clears it. No points - it is not what you were
    // sent for - but it keeps the page from silting up with safe clutter.
    if (cell === 'dead') s.grid[next.y][next.x] = ''
  }
  return s
}

/** @param {GameState} s @param {() => number} rnd */
function respawn(s, rnd) {
  const free = []
  for (let y = 0; y < s.rows; y++) {
    for (let x = 0; x < s.cols; x++) {
      if (s.grid[y][x]) continue
      if (s.snake.some((c) => c.x === x && c.y === y)) continue
      free.push({ x, y })
    }
  }
  if (free.length === 0) return
  const spot = free[Math.floor(rnd() * free.length)]
  s.grid[spot.y][spot.x] = randomStatus(rnd)
}

/** How far ahead a rotation clears. Two cells is one full tick of reaction time. */
export const GRACE_CELLS = 2

/**
 * Rotate the target, then clear anything newly lethal in the cells the worker is
 * already committed to.
 *
 * Without this the rotation can kill you for a move that was correct when you
 * made it: you line up on a 'stale' tuple while vacuuming 'stale', the fourth
 * pickup rotates the target to 'locked', and the dot you were already heading
 * for is now fatal. Nothing you could have done. The two cells directly ahead
 * are swept of anything that is not the new target, which is one full tick of
 * reaction time - enough to read the banner and turn.
 *
 * @param {GameState} s @param {() => number} rnd
 */
export function rotateTarget(s, rnd) {
  const others = TARGETS.filter((t) => t !== s.target)
  s.target = others[Math.floor(rnd() * others.length)]
  s.rotations += 1

  const head = s.snake[0]
  for (let i = 1; i <= GRACE_CELLS; i++) {
    const x = head.x + s.dir.x * i
    const y = head.y + s.dir.y * i
    if (x < 0 || x >= s.cols || y < 0 || y >= s.rows) break
    const cell = s.grid[y][x]
    if (cell && cell !== s.target && cell !== 'dead') s.grid[y][x] = ''
  }
}

/** @returns {number} */
export function loadHighScore() {
  try {
    return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0
  } catch {
    return 0
  }
}

/** @param {number} score @returns {number} */
export function saveHighScore(score) {
  const best = Math.max(loadHighScore(), score)
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(best))
  } catch {
    // Private mode: the run still counts on screen.
  }
  return best
}
