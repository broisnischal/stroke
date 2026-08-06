// Credits hidden in the app's loading states: the table loader mixes them into
// its joke rotation, the reconnect screen shows one under the title. Kept here
// so the same lines are never restated in two components.

export const EASTER_EGGS = [
  'Sundar is a great guy.',
  'Prabesh came up with the name Stroke.',
  'Follow @broisnees.',
  'AI will take your job 💀',
]

/** One credit, picked fresh per load so it varies between launches. */
export function randomEasterEgg() {
  return EASTER_EGGS[Math.floor(Math.random() * EASTER_EGGS.length)]
}
