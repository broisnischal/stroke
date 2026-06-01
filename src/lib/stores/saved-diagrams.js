import { writable } from 'svelte/store'

/** @typedef {{ id: string, name: string, code: string, group: string, createdAt: number, updatedAt: number }} SavedDiagram */

const KEY = (id) => id ? `db-studio:saved-diagrams:${id}` : 'db-studio:saved-diagrams'

function load(connId) {
  if (!connId) return []
  try { const r = localStorage.getItem(KEY(connId)); return r ? JSON.parse(r) : [] } catch { return [] }
}

function persist(v, connId) {
  if (!connId) return
  try { localStorage.setItem(KEY(connId), JSON.stringify(v)) } catch {}
}

function uid() {
  return `diag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

let _connId = ''

export const savedDiagrams = writable(/** @type {SavedDiagram[]} */ ([]))

savedDiagrams.subscribe((v) => { persist(v, _connId) })

/** Switch active connection. Loads diagrams for the given connection. */
export function switchDiagramsConnection(connectionId) {
  _connId = connectionId ?? ''
  savedDiagrams.set(load(_connId))
}

export function saveDiagram(name, code, group = 'AI Generated') {
  const d = { id: uid(), name, code, group, createdAt: Date.now(), updatedAt: Date.now() }
  savedDiagrams.update((all) => [d, ...all])
  return d
}

export function updateDiagram(id, patch) {
  savedDiagrams.update((all) =>
    all.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d))
  )
}

export function deleteDiagram(id) {
  savedDiagrams.update((all) => all.filter((d) => d.id !== id))
}

export function getDiagramGroups(diagrams) {
  return ['Default', ...new Set(diagrams.filter((d) => d.group !== 'Default').map((d) => d.group))]
}
