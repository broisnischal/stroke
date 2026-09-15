/** @typedef {'light' | 'dark'} ThemeGroup */

/** @typedef {'matte' | 'light' | 'parchment' | 'clay' | 'claude-light' | 'moss-light' | 'orchid-light' | 'ice' | 'github-light' | 'light-high-contrast' | 'dark' | 'obsidian' | 'claude' | 'moss' | 'orchid' | 'graphite' | 'midnight' | 'vitesse' | 'slate' | 'forest' | 'mono' | 'rose-pine' | 'catppuccin' | 'solarized' | 'dark-high-contrast' | 'hotdog'} ThemeId */

/**
 * `hidden` keeps a theme out of the picker until it is found. Only the easter
 * egg uses it; everything else is listed normally.
 * @typedef {{ id: ThemeId, name: string, description: string, isDark: boolean, group: ThemeGroup, hidden?: boolean, preview: { bg: string, fg: string, accent: string } }} ThemeDefinition
 */

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
    id: 'clay',
    name: 'Clay',
    description: 'Warm paper, terracotta accent',
    isDark: false,
    group: 'light',
    preview: { bg: '#f7f3ec', fg: '#2b2119', accent: '#a85631' },
  },
  {
    id: 'claude-light',
    name: 'Claude',
    description: "Anthropic's cream and coral",
    isDark: false,
    group: 'light',
    preview: { bg: '#f0eee7', fg: '#1b1915', accent: '#af5629' },
  },
  {
    id: 'moss-light',
    name: 'Moss',
    description: 'Pale linen, jade accent',
    isDark: false,
    group: 'light',
    preview: { bg: '#f4f6f1', fg: '#151c13', accent: '#116d45' },
  },
  {
    id: 'orchid-light',
    name: 'Orchid',
    description: 'Blush white, magenta accent',
    isDark: false,
    group: 'light',
    preview: { bg: '#f9f4f8', fg: '#221620', accent: '#953585' },
  },
  {
    id: 'ice',
    name: 'Ice',
    description: 'Cool blue-steel',
    isDark: false,
    group: 'light',
    preview: { bg: '#f2f5fc', fg: '#0e1a30', accent: '#2f5fcc' },
  },
  {
    id: 'github-light',
    name: 'GitHub',
    description: 'Crisp high-contrast light',
    isDark: false,
    group: 'light',
    preview: { bg: '#ffffff', fg: '#1f2328', accent: '#0969da' },
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
    id: 'obsidian',
    name: 'Obsidian',
    description: 'Cool near-black, teal accent',
    isDark: true,
    group: 'dark',
    preview: { bg: '#131419', fg: '#eeeff4', accent: '#67cfd8' },
  },
  {
    id: 'matte',
    name: 'Matte',
    description: 'Flat matte black, no accent hue',
    isDark: true,
    group: 'dark',
    preview: { bg: '#121212', fg: '#d9d9d9', accent: '#dcdcdc' },
  },
  {
    id: 'claude',
    name: 'Claude',
    description: 'Warm charcoal, coral accent',
    isDark: true,
    group: 'dark',
    preview: { bg: '#131210', fg: '#f1f0ec', accent: '#e18b6a' },
  },
  {
    id: 'moss',
    name: 'Moss',
    description: 'Deep moss, jade accent',
    isDark: true,
    group: 'dark',
    preview: { bg: '#090d09', fg: '#e8ede6', accent: '#78c594' },
  },
  {
    id: 'orchid',
    name: 'Orchid',
    description: 'Aubergine black, orchid accent',
    isDark: true,
    group: 'dark',
    preview: { bg: '#0e090e', fg: '#efe9f0', accent: '#e492c9' },
  },
  {
    // Hidden until unlocked - see EASTER_EGG_THEME_ID below.
    id: 'hotdog',
    name: 'Hotdog Stand',
    description: 'You found it. Sorry.',
    isDark: true,
    group: 'dark',
    hidden: true,
    preview: { bg: '#2b0707', fg: '#ffd83d', accent: '#d41710' },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'Cool graphite, blue accent',
    isDark: true,
    group: 'dark',
    preview: { bg: '#1e1f22', fg: '#dfe1e5', accent: '#3574f0' },
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
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    description: 'Muted rose & pine',
    isDark: true,
    group: 'dark',
    preview: { bg: '#191724', fg: '#e0def4', accent: '#c4a7e7' },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    description: 'Soft pastel mocha',
    isDark: true,
    group: 'dark',
    preview: { bg: '#1e1e2e', fg: '#cdd6f4', accent: '#cba6f7' },
  },
  {
    id: 'solarized',
    name: 'Solarized',
    description: 'Classic teal & blue',
    isDark: true,
    group: 'dark',
    preview: { bg: '#002b36', fg: '#93a1a1', accent: '#268bd2' },
  },
  {
    id: 'light-high-contrast',
    name: 'High Contrast',
    description: 'Maximum contrast, for low vision',
    isDark: false,
    group: 'light',
    preview: { bg: '#ffffff', fg: '#000000', accent: '#1a3fd0' },
  },
  {
    id: 'dark-high-contrast',
    name: 'High Contrast',
    description: 'Maximum contrast, for low vision',
    isDark: true,
    group: 'dark',
    preview: { bg: '#000000', fg: '#ffffff', accent: '#ffe000' },
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
    graphite: {
      bg: '#1e1f22',
      fg: '#dfe1e5',
      muted: '#9da1a8',
      line: '#37393e',
      accent: '#3574f0',
      border: '#37393e',
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
    'github-light': {
      bg: '#ffffff',
      fg: '#1f2328',
      muted: '#59636e',
      line: '#d1d9e0',
      accent: '#0969da',
      border: '#d1d9e0',
    },
    'rose-pine': {
      bg: '#191724',
      fg: '#e0def4',
      muted: '#908caa',
      line: '#403d52',
      accent: '#c4a7e7',
      border: '#403d52',
    },
    catppuccin: {
      bg: '#1e1e2e',
      fg: '#cdd6f4',
      muted: '#a6adc8',
      line: '#45475a',
      accent: '#cba6f7',
      border: '#45475a',
    },
    solarized: {
      bg: '#002b36',
      fg: '#93a1a1',
      muted: '#839496',
      line: '#0f3d49',
      accent: '#268bd2',
      border: '#0f3d49',
    },
    'moss-light': {
      bg: '#f4f6f1',
      fg: '#151c13',
      muted: '#50584e',
      line: '#cbd1c5',
      accent: '#116d45',
      border: '#cad0c4',
    },
    'moss': {
      bg: '#090d09',
      fg: '#e8ede6',
      muted: '#a3aaa1',
      line: '#2c312a',
      accent: '#78c594',
      border: '#2a2f28',
    },
    'orchid-light': {
      bg: '#f9f4f8',
      fg: '#221620',
      muted: '#5e515c',
      line: '#d8ccd7',
      accent: '#953585',
      border: '#d7cbd5',
    },
    'orchid': {
      bg: '#0e090e',
      fg: '#efe9f0',
      muted: '#aea4ae',
      line: '#342c34',
      accent: '#e492c9',
      border: '#322a32',
    },
    'claude-light': {
      bg: '#f0eee7',
      fg: '#1b1915',
      muted: '#59554e',
      line: '#cdc9be',
      accent: '#af5629',
      border: '#ccc8bd',
    },
    'matte': {
      bg: '#121212',
      fg: '#d9d9d9',
      muted: '#a0a0a0',
      line: '#373737',
      accent: '#dcdcdc',
      border: '#343434',
    },
    'claude': {
      bg: '#131210',
      fg: '#f1f0ec',
      muted: '#aba9a4',
      line: '#363531',
      accent: '#e18b6a',
      border: '#34332f',
    },
    'light-high-contrast': {
      bg: '#ffffff', fg: '#000000', muted: '#3a3a3a', line: '#5a5a5a', accent: '#1a3fd0', border: '#5a5a5a',
    },
    'dark-high-contrast': {
      bg: '#000000', fg: '#ffffff', muted: '#c8c8c8', line: '#8a8a8a', accent: '#ffe000', border: '#8a8a8a',
    },
  }
  return map[id]
}

/** @returns {readonly { id: ThemeGroup, label: string, themes: ThemeDefinition[] }[]} */
export function themesByGroup() {
  return THEME_GROUP_ORDER.map((id) => ({
    id,
    label: THEME_GROUP_LABELS[id],
    // visibleThemes(), not APP_THEMES: the easter egg stays out of the picker
    // until it has been found.
    themes: visibleThemes().filter((t) => t.group === id),
  })).filter((g) => g.themes.length > 0)
}

export { MONACO_THEME_SPECS as MONACO_THEMES } from './monaco-presets.js'

/**
 * The easter egg, and how it is found: click the version number in the status
 * bar seven times. Kept out of the picker until then so nobody lands on it by
 * scrolling a list, and stored so it stays found once found.
 */
export const EASTER_EGG_THEME_ID = /** @type {const} */ ('hotdog')
export const EASTER_EGG_KEY = 'stroke:egg-found'
export const EASTER_EGG_CLICKS = 7

/** @returns {boolean} */
export function easterEggFound() {
  try {
    return localStorage.getItem(EASTER_EGG_KEY) === '1'
  } catch {
    return false
  }
}

export function markEasterEggFound() {
  try {
    localStorage.setItem(EASTER_EGG_KEY, '1')
  } catch {
    // Private mode or a full quota: the theme still applies for this session.
  }
}

/**
 * Themes to offer in the picker. The egg is filtered out until found, and stays
 * listed afterwards so it can be selected again - and, more to the point, so it
 * can be escaped from.
 * @returns {readonly ThemeDefinition[]}
 */
export function visibleThemes() {
  const found = easterEggFound()
  return APP_THEMES.filter((t) => !t.hidden || found)
}
