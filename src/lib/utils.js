import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** @param {...import('clsx').ClassValue} inputs */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/**
 * Like `cn` but skips `tailwind-merge`'s conflict resolution. Use ONLY for hot
 * render paths (per-row / per-cell) whose class lists are authored to have no
 * conflicting utilities — it just joins, which is much cheaper at scale.
 * @param {...import('clsx').ClassValue} inputs
 */
export function cx(...inputs) {
  return clsx(inputs)
}
