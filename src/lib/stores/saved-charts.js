/**
 * Persistent store for saved charts, backed by localStorage.
 * Uses Svelte writable stores — subscribe with $ prefix in .svelte files.
 */
import { writable } from 'svelte/store'

/**
 * @typedef {{
 *   id: string
 *   name: string
 *   group: string
 *   createdAt: number
 *   connectionId: string
 *   sql: string
 *   config: {
 *     type: string
 *     xCol: string
 *     yCol: string
 *     zCol?: string
 *     groupCol?: string
 *     title?: string
 *   }
 *   previewOption?: any
 * }} SavedChart
 */

const CHARTS_KEY = 'db-studio:saved-charts'
const GROUPS_KEY = 'db-studio:chart-groups'

/** @returns {SavedChart[]} */
function loadCharts() {
  try { return JSON.parse(localStorage.getItem(CHARTS_KEY) ?? '[]') } catch { return [] }
}

/** @returns {string[]} */
function loadGroups() {
  try {
    const v = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '[]')
    return Array.isArray(v) && v.length > 0 ? v : ['Default']
  } catch { return ['Default'] }
}

/** @param {any} v @param {string} key */
function persist(v, key) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch {}
}

export const savedCharts = writable(loadCharts())
export const chartGroups = writable(loadGroups())

savedCharts.subscribe(v => persist(v, CHARTS_KEY))
chartGroups.subscribe(v => persist(v, GROUPS_KEY))

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Save a new chart. Returns the generated id.
 * @param {Omit<SavedChart, 'id' | 'createdAt'>} chart
 * @returns {string}
 */
export function saveChart(chart) {
  const id = `chart-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const entry = /** @type {SavedChart} */ ({ ...chart, id, createdAt: Date.now() })
  savedCharts.update(cs => [...cs, entry])
  chartGroups.update(gs => gs.includes(entry.group) ? gs : [...gs, entry.group])
  return id
}

/** @param {string} id */
export function deleteChart(id) {
  savedCharts.update(cs => cs.filter(c => c.id !== id))
}

/** @param {string} id @param {Partial<SavedChart>} patch */
export function updateChart(id, patch) {
  savedCharts.update(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c))
}

/** @param {string} name */
export function addGroup(name) {
  const t = name.trim()
  if (!t) return
  chartGroups.update(gs => gs.includes(t) ? gs : [...gs, t])
}

/** @param {string} name */
export function deleteGroup(name) {
  if (name === 'Default') return
  chartGroups.update(gs => gs.filter(g => g !== name))
  savedCharts.update(cs => cs.map(c => c.group === name ? { ...c, group: 'Default' } : c))
}

/** @param {string} oldName @param {string} newName */
export function renameGroup(oldName, newName) {
  const t = newName.trim()
  if (!t) return
  chartGroups.update(gs => gs.map(g => g === oldName ? t : g))
  savedCharts.update(cs => cs.map(c => c.group === oldName ? { ...c, group: t } : c))
}
