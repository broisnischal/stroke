import { writable } from 'svelte/store'

/**
 * Magic words, one per input.
 *
 * Search boxes are the channel because they are the only inputs in the app you
 * can type anything into without it meaning something - a filter that matches
 * nothing is a no-op, so a word that matches nothing is free to mean something
 * else. Each word belongs to ONE box: the game to the table's data search, the
 * crash to the sidebar's table filter. Matching is exact and case-insensitive on
 * the whole value; a substring match would fire while you were still typing a
 * real search.
 */
export const GAME_WORD = 'broisnees'
export const CRASH_WORD = 'crash'
/** The shell reflex. Typing `clear` into a search box empties it, like a terminal. */
export const CLEAR_WORD = 'clear'

/** @param {string} value @param {string} word */
export function isMagic(value, word) {
  return value.trim().toLowerCase() === word
}

/**
 * Set to arm the fake crash.
 *
 * Deliberately a module store and NOT component state: `<svelte:boundary>` only
 * catches throws from render and effects, so the throw has to come from a
 * component that mounts - and "Try to recover" re-renders that same subtree. If
 * the flag lived inside the boundary it would throw again immediately and the
 * app would be stuck in its own joke. The thrower clears this before throwing,
 * so recovery lands on a false flag and nothing is persisted: a reload is always
 * a clean app.
 */
export const crashArmed = writable(false)

export function armCrash() {
  crashArmed.set(true)
}
