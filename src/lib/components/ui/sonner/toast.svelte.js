/**
 * Self-contained toast store (replaces svelte-sonner).
 *
 * svelte-sonner tracks per-toast heights in a parallel array that diverges from
 * the toast list, which crashes / infinite-loops (`effect_update_depth_exceeded`)
 * when several toasts dismiss at once. This implementation keeps a single plain
 * reactive list and lets Svelte transitions handle enter/exit animation, so there
 * is no height bookkeeping and no way to form a read-write reactive cycle.
 *
 * API surface mirrors the parts of svelte-sonner the app uses:
 *   toast.success/error/info/warning/message(title, { description?, duration? })
 *   toast.dismiss(id?)        — dismiss one, or all when id is omitted
 *   toast.getActiveToasts()   — current toasts (reactive read)
 */

let counter = 0
const DEFAULT_DURATION = 4500

/**
 * @typedef {'success' | 'error' | 'info' | 'warning' | 'message'} ToastType
 * @typedef {{ id: number, type: ToastType, title: string, description: string }} Toast
 * @typedef {{ description?: string, duration?: number }} ToastOptions
 */

class ToastStore {
  /** @type {Toast[]} */
  toasts = $state([])

  /** @type {Map<number, { remaining: number, start: number, handle: ReturnType<typeof setTimeout> }>} */
  #timers = new Map()

  /**
   * @param {number} id
   * @param {number} duration
   */
  #schedule(id, duration) {
    if (!Number.isFinite(duration) || duration <= 0) return
    const handle = setTimeout(() => this.dismiss(id), duration)
    this.#timers.set(id, { remaining: duration, start: Date.now(), handle })
  }

  /**
   * @param {ToastType} type
   * @param {unknown} title
   * @param {ToastOptions} [opts]
   */
  #add(type, title, opts = {}) {
    const id = ++counter
    const duration = opts.duration ?? DEFAULT_DURATION
    // newest first; immutable reassignment keeps the read-side reactive
    this.toasts = [
      { id, type, title: String(title ?? ''), description: opts.description ?? '' },
      ...this.toasts,
    ]
    this.#schedule(id, duration)
    return id
  }

  /** @param {unknown} title @param {ToastOptions} [opts] */
  success = (title, opts) => this.#add('success', title, opts)
  /** @param {unknown} title @param {ToastOptions} [opts] */
  error = (title, opts) => this.#add('error', title, opts)
  /** @param {unknown} title @param {ToastOptions} [opts] */
  info = (title, opts) => this.#add('info', title, opts)
  /** @param {unknown} title @param {ToastOptions} [opts] */
  warning = (title, opts) => this.#add('warning', title, opts)
  /** @param {unknown} title @param {ToastOptions} [opts] */
  message = (title, opts) => this.#add('message', title, opts)

  /** @param {number} [id] */
  dismiss = (id) => {
    if (id === undefined) {
      for (const t of this.#timers.values()) clearTimeout(t.handle)
      this.#timers.clear()
      this.toasts = []
      return
    }
    const t = this.#timers.get(id)
    if (t) {
      clearTimeout(t.handle)
      this.#timers.delete(id)
    }
    this.toasts = this.toasts.filter((x) => x.id !== id)
  }

  getActiveToasts = () => this.toasts

  /** Pause every auto-dismiss timer (e.g. while the pointer is over the stack). */
  pauseAll = () => {
    for (const t of this.#timers.values()) {
      clearTimeout(t.handle)
      t.remaining -= Date.now() - t.start
    }
  }

  /** Resume previously-paused auto-dismiss timers. */
  resumeAll = () => {
    for (const [id, t] of this.#timers) {
      t.start = Date.now()
      t.handle = setTimeout(() => this.dismiss(id), Math.max(0, t.remaining))
    }
  }
}

export const toast = new ToastStore()
