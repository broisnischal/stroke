import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

const NETWORK_ERROR_PATTERNS = [
  'failed to lookup address',
  'nodename nor servname',
  'error communicating with database',
  'connection refused',
  'connection reset',
  'connection timed out',
  'connect timeout',
  'broken pipe',
  'network is unreachable',
  'no route to host',
  'network error',
  'socket error',
  'tcp connect error',
  'failed to connect',
  'unable to connect',
  'os error 61',   // ECONNREFUSED macOS
  'os error 111',  // ECONNREFUSED Linux
  'os error 110',  // ETIMEDOUT
  'os error 113',  // EHOSTUNREACH
]

/**
 * Returns true when the error message indicates a network / connectivity problem
 * rather than a SQL or application error.
 * @param {string} msg
 */
export function isNetworkError(msg) {
  const lower = msg.toLowerCase()
  return NETWORK_ERROR_PATTERNS.some((p) => lower.includes(p))
}

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

/**
 * Returns a debounced wrapper around `fn`. Trailing-edge: only the final call
 * within `wait` ms runs. Use to coalesce high-frequency work (localStorage
 * writes on keystroke/drag, etc.). Exposes `.cancel()` and `.flush()`.
 * @template {(...args: any[]) => void} F
 * @param {F} fn
 * @param {number} wait
 */
export function debounce(fn, wait) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null
  /** @type {any[] | null} */
  let lastArgs = null
  const debounced = /** @type {F & { cancel(): void, flush(): void }} */ (
    (...args) => {
      lastArgs = args
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        const a = lastArgs
        lastArgs = null
        if (a) fn(...a)
      }, wait)
    }
  )
  debounced.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
    lastArgs = null
  }
  debounced.flush = () => {
    if (timer) clearTimeout(timer)
    timer = null
    if (lastArgs) { const a = lastArgs; lastArgs = null; fn(...a) }
  }
  return debounced
}
