import { writable } from 'svelte/store'

/**
 * @typedef {{
 *   id: string,
 *   chartId: string | null,
 *   span: 1 | 2 | 3,
 * }} DashItem
 *
 * @typedef {{
 *   id: string,
 *   name: string,
 *   columns: 2 | 3,
 *   items: DashItem[],
 *   createdAt: number,
 * }} Dashboard
 */

const KEY = 'db-studio:dashboards'
const ACTIVE_KEY = 'db-studio:active-dashboard'

/** @returns {Dashboard[]} */
function load() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

/** @returns {string | null} */
function loadActiveId() {
  try { return localStorage.getItem(ACTIVE_KEY) } catch { return null }
}

export const dashboards = writable(load())
export const activeDashboardId = writable(loadActiveId())

dashboards.subscribe(v => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch {} })
activeDashboardId.subscribe(v => { try { if (v) localStorage.setItem(ACTIVE_KEY, v); else localStorage.removeItem(ACTIVE_KEY) } catch {} })

/** @param {string} name @returns {Dashboard} */
export function createDashboard(name) {
  const id = `dash-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const dash = /** @type {Dashboard} */ ({ id, name, columns: 3, items: [], createdAt: Date.now() })
  dashboards.update(ds => [...ds, dash])
  activeDashboardId.set(id)
  return dash
}

/** @param {string} id */
export function deleteDashboard(id) {
  dashboards.update(ds => ds.filter(d => d.id !== id))
  activeDashboardId.update(cur => cur === id ? null : cur)
}

/** @param {string} id @param {Partial<Dashboard>} patch */
export function updateDashboard(id, patch) {
  dashboards.update(ds => ds.map(d => d.id === id ? { ...d, ...patch } : d))
}

/**
 * @param {string} dashId
 * @param {string} chartId
 */
export function addChartToDashboard(dashId, chartId) {
  const itemId = `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  dashboards.update(ds => ds.map(d =>
    d.id === dashId
      ? { ...d, items: [...d.items, { id: itemId, chartId, span: 1 }] }
      : d
  ))
}

/** @param {string} dashId @param {string} itemId */
export function removeChartFromDashboard(dashId, itemId) {
  dashboards.update(ds => ds.map(d =>
    d.id === dashId
      ? { ...d, items: d.items.filter(i => i.id !== itemId) }
      : d
  ))
}

/** @param {string} dashId @param {string} itemId @param {1|2|3} span */
export function setItemSpan(dashId, itemId, span) {
  dashboards.update(ds => ds.map(d =>
    d.id === dashId
      ? { ...d, items: d.items.map(i => i.id === itemId ? { ...i, span } : i) }
      : d
  ))
}

/** @param {string} dashId @param {string[]} newOrder new array of item ids in desired order */
export function reorderItems(dashId, newOrder) {
  dashboards.update(ds => ds.map(d => {
    if (d.id !== dashId) return d
    const itemMap = Object.fromEntries(d.items.map(i => [i.id, i]))
    const reordered = newOrder.map(id => itemMap[id]).filter(Boolean)
    const rest = d.items.filter(i => !newOrder.includes(i.id))
    return { ...d, items: [...reordered, ...rest] }
  }))
}
