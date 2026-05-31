/**
 * Persistent store for saved charts, backed by localStorage.
 * Charts are scoped per database connection — switching connections loads
 * that connection's charts. An empty connectionId shows nothing.
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

const CHARTS_KEY = (id) => id ? `db-studio:saved-charts:${id}` : 'db-studio:saved-charts'
const GROUPS_KEY = (id) => id ? `db-studio:chart-groups:${id}` : 'db-studio:chart-groups'

// Tracks the currently active connection scope
let _connId = ''

/**
 * Load charts for a connection. If the connection-specific key is empty,
 * migrates charts from the legacy global key that match this connectionId.
 * @param {string} connectionId
 * @returns {SavedChart[]}
 */
function loadCharts(connectionId) {
  if (!connectionId) return []
  try {
    const specific = JSON.parse(localStorage.getItem(CHARTS_KEY(connectionId)) ?? 'null')
    if (Array.isArray(specific)) return specific
    // One-time migration: filter matching charts from the legacy global key
    const global_ = JSON.parse(localStorage.getItem('db-studio:saved-charts') ?? '[]')
    return Array.isArray(global_) ? global_.filter(c => c.connectionId === connectionId) : []
  } catch { return [] }
}

/** @param {string} connectionId @returns {string[]} */
function loadGroups(connectionId) {
  if (!connectionId) return ['Default']
  try {
    const specific = JSON.parse(localStorage.getItem(GROUPS_KEY(connectionId)) ?? 'null')
    if (Array.isArray(specific) && specific.length > 0) return specific
    // One-time migration: build groups from migrated charts
    const charts = loadCharts(connectionId)
    const groups = [...new Set(charts.map(c => c.group).filter(Boolean))]
    return groups.length > 0 ? groups : ['Default']
  } catch { return ['Default'] }
}

/** @param {any} v @param {string} key */
function persist(v, key) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch {}
}

export const savedCharts = writable(/** @type {SavedChart[]} */ ([]))
export const chartGroups = writable(/** @type {string[]} */ (['Default']))

savedCharts.subscribe(v => { if (_connId) persist(v, CHARTS_KEY(_connId)) })
chartGroups.subscribe(v => { if (_connId) persist(v, GROUPS_KEY(_connId)) })

/**
 * Switch the active connection. Reloads charts and groups from the
 * connection-specific localStorage key. Call whenever the active DB changes.
 * @param {string} connectionId
 */
export function switchChartsConnection(connectionId) {
  _connId = connectionId
  savedCharts.set(loadCharts(_connId))
  chartGroups.set(loadGroups(_connId))
}

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
