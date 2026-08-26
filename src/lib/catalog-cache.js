// One cache for everything the app reads out of a database's catalog.
//
// Each lookup used to bring its own policy: the table list had a 3 second TTL,
// the schema-level catalog (indexes, enums, triggers, sequences) had a single
// "which schema was loaded last" string, incoming foreign keys had an unbounded
// map, and column lists had an LRU. The string was the worst of them: switching
// schema A to B and back refetched all four lookups every time, because the flag
// only ever remembered the last schema visited.
//
// The policy is the same for all of them, so it lives here: keyed entries, a
// per-read freshness window, prefix invalidation for "this connection changed",
// and a bound on how much is kept. Nothing in here touches the network or knows
// what a schema is; callers own their keys.

/**
 * @template T
 * @typedef {{ value: T, at: number }} Entry
 */

export class CatalogCache {
  /**
   * @param {{ max?: number, now?: () => number }} [opts]
   *   `max` bounds the entry count (one per connection, schema and object kind
   *   visited in a session). `now` exists so tests can control expiry.
   */
  constructor(opts = {}) {
    this.max = opts.max ?? 96
    this.now = opts.now ?? (() => Date.now())
    /** @type {Map<string, Entry<any>>} */
    this.entries = new Map()
  }

  /**
   * Fresh value for this key, or undefined when absent or too old.
   * @template T
   * @param {string} key
   * @param {number} ttlMs how recent the entry has to be to count
   * @returns {T | undefined}
   */
  get(key, ttlMs) {
    const hit = this.entries.get(key)
    if (!hit) return undefined
    if (this.now() - hit.at >= ttlMs) {
      this.entries.delete(key)
      return undefined
    }
    // Re-insert so eviction drops the least recently *used*, not the oldest.
    this.entries.delete(key)
    this.entries.set(key, hit)
    return hit.value
  }

  /** @template T @param {string} key @param {T} value @returns {T} */
  set(key, value) {
    this.entries.delete(key)
    this.entries.set(key, { value, at: this.now() })
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
    return value
  }

  /** @param {string} key */
  has(key) {
    return this.entries.has(key)
  }

  /**
   * Read through: return the fresh entry, or run `load` and store what it
   * resolves to. A failing loader stores nothing, so the next call retries.
   * @template T
   * @param {string} key
   * @param {number} ttlMs
   * @param {() => Promise<T>} load
   * @returns {Promise<T>}
   */
  async through(key, ttlMs, load) {
    const hit = /** @type {T | undefined} */ (this.get(key, ttlMs))
    if (hit !== undefined) return hit
    return this.set(key, await load())
  }

  /**
   * Drop every entry whose key starts with `prefix`. Callers namespace their
   * keys by connection, so `invalidate(connId)` is "this database changed".
   * @param {string} prefix
   */
  invalidate(prefix) {
    if (!prefix) return this.clear()
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) this.entries.delete(key)
    }
  }

  clear() {
    this.entries.clear()
  }

  get size() {
    return this.entries.size
  }
}

/**
 * Key for a catalog lookup. Connection first so a whole connection can be
 * invalidated by prefix, then the object kind, then the schema.
 * @param {string | null | undefined} connectionId
 * @param {string} kind
 * @param {string} [schema]
 */
export function catalogKey(connectionId, kind, schema = '') {
  return `${connectionId ?? ''}|${kind}|${schema}`
}

/** Prefix matching every entry belonging to one connection.
 *  @param {string | null | undefined} connectionId */
export function connectionPrefix(connectionId) {
  return `${connectionId ?? ''}|`
}
