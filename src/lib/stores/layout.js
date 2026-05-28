const STORAGE_KEY = 'db-studio:layout'

/** @typedef {'normal' | 'json'} InspectorView */

/** @typedef {{ navSidebarWidth: number, navSidebarOpen: boolean, inspectorWidth: number, inspectorView: InspectorView, sqlEditorHeight: number, logPanelWidth: number, logPanelOpen: boolean, aiSidebarWidth: number, aiSidebarOpen: boolean }} PanelLayout */

export const DEFAULT_LAYOUT = {
  navSidebarWidth: 220,
  navSidebarOpen: true,
  inspectorWidth: 300,
  inspectorView: 'normal',
  sqlEditorHeight: 320,
  logPanelWidth: 300,
  logPanelOpen: false,
  aiSidebarWidth: 400,
  aiSidebarOpen: false,
}

export const NAV_SIDEBAR_MIN = 180
export const NAV_SIDEBAR_MAX = 420
export const INSPECTOR_MIN = 220
export const INSPECTOR_MAX = 640
export const SQL_EDITOR_MIN = 120
export const SQL_EDITOR_RESULTS_MIN = 120
export const LOG_PANEL_MIN = 220
export const LOG_PANEL_MAX = 600
export const AI_SIDEBAR_MIN = 320
export const AI_SIDEBAR_MAX = 720

/** @param {number} width */
export function clampNavSidebarWidth(width) {
  return Math.round(Math.min(NAV_SIDEBAR_MAX, Math.max(NAV_SIDEBAR_MIN, width)))
}

/** @param {number} width */
export function clampInspectorWidth(width) {
  return Math.round(Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, width)))
}

/** @param {number} width */
export function clampLogPanelWidth(width) {
  return Math.round(Math.min(LOG_PANEL_MAX, Math.max(LOG_PANEL_MIN, width)))
}

/** @param {number} width */
export function clampAiSidebarWidth(width) {
  return Math.round(Math.min(AI_SIDEBAR_MAX, Math.max(AI_SIDEBAR_MIN, width)))
}

/** @param {number} height @param {number} [containerHeight] */
export function clampSqlEditorHeight(height, containerHeight = 0) {
  const max =
    containerHeight > 0
      ? Math.max(SQL_EDITOR_MIN, containerHeight - SQL_EDITOR_RESULTS_MIN)
      : 720
  return Math.round(Math.min(max, Math.max(SQL_EDITOR_MIN, height)))
}

/** @returns {PanelLayout} */
export function loadLayout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LAYOUT }
    const parsed = JSON.parse(raw)
    let navSidebarWidth = Number(parsed.navSidebarWidth)
    let inspectorWidth = Number(parsed.inspectorWidth)
    let sqlEditorHeight = Number(parsed.sqlEditorHeight)
    let logPanelWidth = Number(parsed.logPanelWidth)
    let aiSidebarWidth = Number(parsed.aiSidebarWidth)
    if (!Number.isFinite(navSidebarWidth)) navSidebarWidth = DEFAULT_LAYOUT.navSidebarWidth
    if (!Number.isFinite(inspectorWidth)) inspectorWidth = DEFAULT_LAYOUT.inspectorWidth
    if (!Number.isFinite(sqlEditorHeight)) sqlEditorHeight = DEFAULT_LAYOUT.sqlEditorHeight
    if (!Number.isFinite(logPanelWidth)) logPanelWidth = DEFAULT_LAYOUT.logPanelWidth
    if (!Number.isFinite(aiSidebarWidth)) aiSidebarWidth = DEFAULT_LAYOUT.aiSidebarWidth
    const inspectorView = parsed.inspectorView === 'json' ? 'json' : 'normal'
    const navSidebarOpen = parsed.navSidebarOpen !== false
    const logPanelOpen = parsed.logPanelOpen === true
    const aiSidebarOpen = parsed.aiSidebarOpen === true
    return {
      navSidebarWidth: clampNavSidebarWidth(navSidebarWidth),
      navSidebarOpen,
      inspectorWidth: clampInspectorWidth(inspectorWidth),
      inspectorView,
      sqlEditorHeight: clampSqlEditorHeight(sqlEditorHeight),
      logPanelWidth: clampLogPanelWidth(logPanelWidth),
      logPanelOpen,
      aiSidebarWidth: clampAiSidebarWidth(aiSidebarWidth),
      aiSidebarOpen,
    }
  } catch {
    return { ...DEFAULT_LAYOUT }
  }
}

/** @param {Partial<PanelLayout>} patch */
export function saveLayout(patch) {
  const next = { ...loadLayout(), ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
