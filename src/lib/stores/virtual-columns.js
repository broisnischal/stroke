import { writable } from 'svelte/store'

const KEY = 'stroke:vcols-v1'

/** @typedef {{ id: string, name: string, expression: string, enabled: boolean }} VColDef */
/** @typedef {Record<string, VColDef[]>} VColMap */

function load() {
  try { return /** @type {VColMap} */ (JSON.parse(localStorage.getItem(KEY) ?? '{}')) }
  catch { return {} }
}

function persist(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)) } catch {}
}

function create() {
  const { subscribe, update } = writable(/** @type {VColMap} */ (load()))

  return {
    subscribe,
    /** @param {string} tk - "schema.table" @param {Omit<VColDef,'id'>} def */
    add(tk, def) {
      update(d => {
        const next = { ...d, [tk]: [...(d[tk] ?? []), { ...def, id: crypto.randomUUID() }] }
        persist(next); return next
      })
    },
    /** @param {string} tk @param {string} id @param {Partial<VColDef>} patch */
    patch(tk, id, patch) {
      update(d => {
        const next = { ...d, [tk]: (d[tk] ?? []).map(c => c.id === id ? { ...c, ...patch } : c) }
        persist(next); return next
      })
    },
    /** @param {string} tk @param {string} id */
    remove(tk, id) {
      update(d => {
        const next = { ...d, [tk]: (d[tk] ?? []).filter(c => c.id !== id) }
        persist(next); return next
      })
    },
  }
}

export const virtualColumnsStore = create()
