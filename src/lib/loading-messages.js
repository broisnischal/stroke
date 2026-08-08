// The loading-line rotation and the draw that picks one.
//
// Two rules the loaders rely on:
//   • easter eggs count double, so the credits actually surface;
//   • nothing repeats until 10 other lines have been shown, so a session never
//     looks stuck on one message.
// The history is module-level, which is what makes the second rule hold ACROSS
// loader mounts - each spinner is a fresh component instance, so per-instance
// state would forget everything the moment the previous one unmounted.

import { EASTER_EGGS } from '$lib/easter-eggs.js'

export const LOADING_MESSAGES = [
  'Fetching rows…',
  'Querying the database…',
  'Loading table data…',
  'Running your query…',
  'Scanning indexes…',
  'Joining tables…',
  'Crunching the numbers…',
  'Executing the plan…',
  'Reading from storage…',
  'Almost there…',
  'Talking to Postgres…',
  'Traversing the B-tree…',
  'ugh, i hate Prisma…',
  'Drizzle is mid, tbh…',
  'vibe coding my way through this…',
  'SELECT * FROM skill_issue…',
  'have you tried turning the database off and on again?',
  'your ORM is crying somewhere…',
  'this would be faster with raw SQL, just saying…',
  'touching grass while waiting…',
  'blame the N+1 queries, not me…',
  'migrating 47 times and counting…',
  'raw SQL supremacy loading…',
  'who wrote this schema? 💀',
  'connection pooling is a lifestyle…',
  'null is not your friend…',
  'no more ORMs.',
  'just use SQL.',
  'schema? never heard of her.',
  'indexes go brrr…',
  'touching the void…',
  'cursed query incoming…',
  'type safety? lol.',
  'migrations are pain.',
  'foreign key jumpscare…',
  'skill issue detected.',
  'no cap, almost done.',
  'WHERE did my data go…',
  'vibing with the buffer…',
  'npm install brain…',
  'deadlock speedrun…',
  'YOLO commit incoming…',
  'ChatGPT wrote this query.',
  'pray to the query planner…',
  'it works on my machine.',
  ...EASTER_EGGS,
]

/** How many other lines must pass before one may come round again. */
const NO_REPEAT_WITHIN = 10

/** How many entries an easter egg gets in the draw; everything else gets one. */
const EGG_WEIGHT = 2

/** @type {string[]} most-recent-last, capped at NO_REPEAT_WITHIN */
let recent = []

/**
 * Next line to show. Excludes the last `NO_REPEAT_WITHIN` picks, then draws
 * from what is left with easter eggs weighted double.
 * @param {string[]} [pool] defaults to the full rotation; pass a subset (e.g.
 *   just the credits) for loaders that only show those.
 */
export function nextLoadingMessage(pool = LOADING_MESSAGES) {
  const unique = [...new Set(pool)]
  if (unique.length === 0) return ''
  // A pool smaller than the window would ban every candidate - shrink the
  // exclusion to whatever still leaves something to pick.
  const window = Math.min(NO_REPEAT_WITHIN, unique.length - 1)
  const banned = new Set(window > 0 ? recent.slice(-window) : [])
  const eligible = unique.filter((m) => !banned.has(m))
  const candidates = eligible.length ? eligible : unique

  const weighted = candidates.flatMap((m) => (EASTER_EGGS.includes(m) ? Array(EGG_WEIGHT).fill(m) : [m]))
  const pick = weighted[Math.floor(Math.random() * weighted.length)]

  recent = [...recent, pick].slice(-NO_REPEAT_WITHIN)
  return pick
}

/** Test seam - drops the history so a run starts from a known state. */
export function resetLoadingHistory() {
  recent = []
}
