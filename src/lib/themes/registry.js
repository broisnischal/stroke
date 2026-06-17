/** @typedef {'light' | 'dark'} ThemeGroup */

/** @typedef {'light' | 'parchment' | 'ice' | 'dark' | 'midnight' | 'vitesse' | 'slate' | 'forest' | 'mono'} ThemeId */

/** @typedef {{ id: ThemeId, name: string, description: string, isDark: boolean, group: ThemeGroup, preview: { bg: string, fg: string, accent: string } }} ThemeDefinition */

export const DEFAULT_THEME_ID = /** @type {const} */ ('dark')

/** @type {Record<ThemeGroup, string>} */
export const THEME_GROUP_LABELS = {
  light: 'Light',
  dark: 'Dark',
}

/** @type {readonly ThemeGroup[]} */
export const THEME_GROUP_ORDER = ['light', 'dark']

/** @type {readonly ThemeDefinition[]} */
export const APP_THEMES = [
  // ── Light ────────────────────────────────────────────────────────────────
  {
    id: 'light',
    name: 'Studio',
    description: 'Clean neutral white',
    isDark: false,
    group: 'light',
    preview: { bg: '#fafafa', fg: '#1a1a1a', accent: '#1a1a1a' },
  },
  {
    id: 'parchment',
    name: 'Parchment',
    description: 'Warm amber cream',
    isDark: false,
    group: 'light',
    preview: { bg: '#faf7f0', fg: '#2a1c10', accent: '#3a50c4' },
  },
  {
    id: 'ice',
    name: 'Ice',
    description: 'Cool blue-steel',
    isDark: false,
    group: 'light',
    preview: { bg: '#f2f5fc', fg: '#0e1a30', accent: '#2f5fcc' },
  },
  // ── Dark ─────────────────────────────────────────────────────────────────
  {
    id: 'dark',
    name: 'Studio',
    description: 'Neutral near-black',
    isDark: true,
    group: 'dark',
    preview: { bg: '#1c1c1c', fg: '#f0f0f0', accent: '#f0f0f0' },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep ocean navy',
    isDark: true,
    group: 'dark',
    preview: { bg: '#0f1520', fg: '#dde8ff', accent: '#5b9bff' },
  },
  {
    id: 'vitesse',
    name: 'Dusk',
    description: 'Warm amber charcoal',
    isDark: true,
    group: 'dark',
    preview: { bg: '#1d1813', fg: '#eee4d0', accent: '#d4973a' },
  },
  {
    id: 'slate',
    name: 'Iris',
    description: 'Deep violet-purple',
    isDark: true,
    group: 'dark',
    preview: { bg: '#191422', fg: '#e8e0ff', accent: '#a668ff' },
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Dark emerald green',
    isDark: true,
    group: 'dark',
    preview: { bg: '#141a14', fg: '#d8edd6', accent: '#4fcf80' },
  },
  {
    id: 'mono',
    name: 'Mono',
    description: 'Pure black, crisp white',
    isDark: true,
    group: 'dark',
    preview: { bg: '#000000', fg: '#fafafa', accent: '#fafafa' },
  },
]

/** Sync with index.html boot script when adding themes. */
export const THEME_IDS = /** @type {readonly ThemeId[]} */ (APP_THEMES.map((t) => t.id))

/** @param {unknown} value */
export function normalizeThemeId(value) {
  if (typeof value === 'string' && THEME_IDS.includes(/** @type {ThemeId} */ (value))) {
    return /** @type {ThemeId} */ (value)
  }
  return DEFAULT_THEME_ID
}

/** @param {ThemeId} id */
export function getThemeDefinition(id) {
  return APP_THEMES.find((t) => t.id === id) ?? APP_THEMES.find((t) => t.id === DEFAULT_THEME_ID)
}

/** @param {ThemeId} id */
export function isDarkTheme(id) {
  return getThemeDefinition(id)?.isDark ?? true
}

/** @param {ThemeId} id */
export function nextThemeId(id) {
  const idx = THEME_IDS.indexOf(id)
  return THEME_IDS[(idx + 1) % THEME_IDS.length]
}

/** @param {ThemeId} id */
export function shikiThemeId(id) {
  return isDarkTheme(id) ? 'vitesse-dark' : 'vitesse-light'
}

/** @param {ThemeId} id */
export function monacoThemeName(id) {
  return `stroke-${id}`
}

/** @param {ThemeId} id */
export function mermaidThemeFor(id) {
  /** @type {Record<ThemeId, { bg: string, fg: string, muted: string, line: string, accent: string, border: string }>} */
  const map = {
    light: {
      bg: '#fafafa',
      fg: '#1a1a1a',
      muted: '#737373',
      line: '#d4d4d4',
      accent: '#1a1a1a',
      border: '#c8c8c8',
    },
    parchment: {
      bg: '#faf7f0',
      fg: '#2a1c10',
      muted: '#7a6e5a',
      line: '#d6cec0',
      accent: '#3a50c4',
      border: '#c8bfae',
    },
    ice: {
      bg: '#f2f5fc',
      fg: '#0e1a30',
      muted: '#6a7a9a',
      line: '#ccd5ea',
      accent: '#2f5fcc',
      border: '#bcc8e0',
    },
    dark: {
      bg: '#1c1c1c',
      fg: '#f0f0f0',
      muted: '#737373',
      line: '#404040',
      accent: '#f0f0f0',
      border: '#333333',
    },
    midnight: {
      bg: '#0f1520',
      fg: '#dde8ff',
      muted: '#6a80aa',
      line: '#1e2d48',
      accent: '#5b9bff',
      border: '#253554',
    },
    vitesse: {
      bg: '#1d1813',
      fg: '#eee4d0',
      muted: '#7a6a50',
      line: '#332a1e',
      accent: '#d4973a',
      border: '#3a3028',
    },
    slate: {
      bg: '#191422',
      fg: '#e8e0ff',
      muted: '#7060a0',
      line: '#2a2040',
      accent: '#a668ff',
      border: '#352850',
    },
    forest: {
      bg: '#141a14',
      fg: '#d8edd6',
      muted: '#5a7a58',
      line: '#1e2e1e',
      accent: '#4fcf80',
      border: '#243824',
    },
    mono: {
      bg: '#000000',
      fg: '#fafafa',
      muted: '#666666',
      line: '#1a1a1a',
      accent: '#fafafa',
      border: '#2a2a2a',
    },
  }
  return map[id]
}

/** @returns {readonly { id: ThemeGroup, label: string, themes: ThemeDefinition[] }[]} */
export function themesByGroup() {
  return THEME_GROUP_ORDER.map((id) => ({
    id,
    label: THEME_GROUP_LABELS[id],
    themes: APP_THEMES.filter((t) => t.group === id),
  })).filter((g) => g.themes.length > 0)
}

export { MONACO_THEME_SPECS as MONACO_THEMES } from './monaco-presets.js'
