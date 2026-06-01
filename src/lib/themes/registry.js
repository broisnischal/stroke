/** @typedef {'light' | 'studio' | 'product' | 'editor' | 'classic' | 'mono'} ThemeGroup */

/** @typedef {'light' | 'parchment' | 'ice' | 'rose' | 'catppuccin-latte' | 'rosepine-dawn' | 'notion' | 'github-light' | 'vscode-light' | 'linear-light' | 'broisnees-light' | 'linear' | 'cursor' | 'raycast' | 'vercel' | 'vscode' | 'github' | 'onedark' | 'catppuccin' | 'rosepine' | 'tokyonight' | 'gruvbox' | 'monokai' | 'ayu' | 'kanagawa' | 'dark' | 'vitesse' | 'midnight' | 'slate' | 'obsidian' | 'espresso' | 'nord' | 'dracula' | 'forest' | 'solarized' | 'broisnees'} ThemeId */

/** @typedef {{ id: ThemeId, name: string, description: string, isDark: boolean, group: ThemeGroup, preview: { bg: string, fg: string, accent: string } }} ThemeDefinition */

export const DEFAULT_THEME_ID = /** @type {const} */ ('dark')

/** @type {Record<ThemeGroup, string>} */
export const THEME_GROUP_LABELS = {
  light: 'Light',
  mono: 'Mono',
  product: 'Product',
  editor: 'Code editors',
  studio: 'Studio',
  classic: 'Classic',
}

/** @type {readonly ThemeGroup[]} */
export const THEME_GROUP_ORDER = ['mono', 'light', 'product', 'editor', 'studio', 'classic']

/** @type {readonly ThemeDefinition[]} */
export const APP_THEMES = [
  {
    id: 'broisnees',
    name: 'Broisnees',
    description: 'Pure black',
    isDark: true,
    group: 'mono',
    preview: { bg: '#1c1c1c', fg: '#fafafa', accent: '#fafafa' },
  },
  {
    id: 'broisnees-light',
    name: 'Broisnees Light',
    description: 'Pure white',
    isDark: false,
    group: 'mono',
    preview: { bg: '#ffffff', fg: '#0a0a0a', accent: '#0a0a0a' },
  },
  {
    id: 'light',
    name: 'Light',
    description: 'Warm paper',
    isDark: false,
    group: 'light',
    preview: { bg: '#f7f5ef', fg: '#393a34', accent: '#1e754f' },
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Warm white',
    isDark: false,
    group: 'light',
    preview: { bg: '#ffffff', fg: '#37352f', accent: '#2383e2' },
  },
  {
    id: 'github-light',
    name: 'GitHub Light',
    description: 'Primer light',
    isDark: false,
    group: 'light',
    preview: { bg: '#ffffff', fg: '#1f2328', accent: '#0969da' },
  },
  {
    id: 'vscode-light',
    name: 'VS Code Light',
    description: 'Default light+',
    isDark: false,
    group: 'light',
    preview: { bg: '#ffffff', fg: '#333333', accent: '#007acc' },
  },
  {
    id: 'linear-light',
    name: 'Linear Light',
    description: 'Clean indigo',
    isDark: false,
    group: 'light',
    preview: { bg: '#ffffff', fg: '#3f3f46', accent: '#5e6ad2' },
  },
  {
    id: 'parchment',
    name: 'Parchment',
    description: 'Warm cream paper',
    isDark: false,
    group: 'light',
    preview: { bg: '#faf7f0', fg: '#2d2416', accent: '#4a3d8f' },
  },
  {
    id: 'ice',
    name: 'Ice',
    description: 'Cool pale blue',
    isDark: false,
    group: 'light',
    preview: { bg: '#f2f5fc', fg: '#0f1a2e', accent: '#3b6fd4' },
  },
  {
    id: 'rose',
    name: 'Rosé',
    description: 'Soft blush pink',
    isDark: false,
    group: 'light',
    preview: { bg: '#fff4f4', fg: '#2a1518', accent: '#c0375c' },
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    description: 'Pastel light',
    isDark: false,
    group: 'light',
    preview: { bg: '#eff1f5', fg: '#4c4f69', accent: '#8839ef' },
  },
  {
    id: 'rosepine-dawn',
    name: 'Rose Pine Dawn',
    description: 'Warm rose light',
    isDark: false,
    group: 'light',
    preview: { bg: '#faf4ed', fg: '#575279', accent: '#907aa9' },
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Dark indigo UI',
    isDark: true,
    group: 'product',
    preview: { bg: '#0d0d0f', fg: '#ededed', accent: '#5e6ad2' },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    description: 'IDE neutral',
    isDark: true,
    group: 'product',
    preview: { bg: '#141414', fg: '#e4e4e4', accent: '#528bff' },
  },
  {
    id: 'raycast',
    name: 'Raycast',
    description: 'Command red',
    isDark: true,
    group: 'product',
    preview: { bg: '#0a0a0a', fg: '#ededed', accent: '#ff6363' },
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'True black',
    isDark: true,
    group: 'product',
    preview: { bg: '#000000', fg: '#ededed', accent: '#0070f3' },
  },
  {
    id: 'vscode',
    name: 'VS Code',
    description: 'Dark+ default',
    isDark: true,
    group: 'editor',
    preview: { bg: '#1e1e1e', fg: '#cccccc', accent: '#007acc' },
  },
  {
    id: 'github',
    name: 'GitHub Dark',
    description: 'Primer dimmed',
    isDark: true,
    group: 'editor',
    preview: { bg: '#0d1117', fg: '#e6edf3', accent: '#58a6ff' },
  },
  {
    id: 'onedark',
    name: 'One Dark',
    description: 'Atom classic',
    isDark: true,
    group: 'editor',
    preview: { bg: '#282c34', fg: '#abb2bf', accent: '#61afef' },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    description: 'Mocha pastel',
    isDark: true,
    group: 'editor',
    preview: { bg: '#1e1e2e', fg: '#cdd6f4', accent: '#cba6f7' },
  },
  {
    id: 'rosepine',
    name: 'Rose Pine',
    description: 'Moon dusk',
    isDark: true,
    group: 'editor',
    preview: { bg: '#232136', fg: '#e0def4', accent: '#c4a7e7' },
  },
  {
    id: 'tokyonight',
    name: 'Tokyo Night',
    description: 'Blue-purple night',
    isDark: true,
    group: 'editor',
    preview: { bg: '#1a1b26', fg: '#a9b1d6', accent: '#7aa2f7' },
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    description: 'Warm retro dark',
    isDark: true,
    group: 'editor',
    preview: { bg: '#282828', fg: '#ebdbb2', accent: '#fabd2f' },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    description: 'Classic vibrant',
    isDark: true,
    group: 'editor',
    preview: { bg: '#272822', fg: '#f8f8f2', accent: '#a6e22e' },
  },
  {
    id: 'ayu',
    name: 'Ayu Mirage',
    description: 'Cool blue-gray',
    isDark: true,
    group: 'editor',
    preview: { bg: '#1f2430', fg: '#cbccc6', accent: '#ffcc66' },
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Neutral graphite',
    isDark: true,
    group: 'studio',
    preview: { bg: '#1c1c1c', fg: '#ebebeb', accent: '#79c0ff' },
  },
  {
    id: 'vitesse',
    name: 'Vitesse',
    description: 'Warm charcoal',
    isDark: true,
    group: 'studio',
    preview: { bg: '#121212', fg: '#dbd7ca', accent: '#4d9375' },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep blue',
    isDark: true,
    group: 'studio',
    preview: { bg: '#0f1419', fg: '#e6edf3', accent: '#79b8ff' },
  },
  {
    id: 'slate',
    name: 'Slate',
    description: 'Cool zinc',
    isDark: true,
    group: 'studio',
    preview: { bg: '#1a1a1f', fg: '#e4e4e7', accent: '#a78bfa' },
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    description: 'Black + emerald',
    isDark: true,
    group: 'studio',
    preview: { bg: '#181818', fg: '#e8e8e8', accent: '#4ade80' },
  },
  {
    id: 'espresso',
    name: 'Espresso',
    description: 'Warm dark brown',
    isDark: true,
    group: 'studio',
    preview: { bg: '#1d1710', fg: '#e8dcc8', accent: '#d4973a' },
  },
  {
    id: 'kanagawa',
    name: 'Kanagawa',
    description: 'Neovim Wave',
    isDark: true,
    group: 'editor',
    preview: { bg: '#1f1f28', fg: '#dcd7ba', accent: '#7e9cd8' },
  },
  {
    id: 'nord',
    name: 'Nord',
    description: 'Arctic frost',
    isDark: true,
    group: 'classic',
    preview: { bg: '#2e3440', fg: '#eceff4', accent: '#88c0d0' },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    description: 'Purple night',
    isDark: true,
    group: 'classic',
    preview: { bg: '#282a36', fg: '#f8f8f2', accent: '#bd93f9' },
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Deep green',
    isDark: true,
    group: 'classic',
    preview: { bg: '#141a14', fg: '#e2ebe0', accent: '#7dd3a0' },
  },
  {
    id: 'solarized',
    name: 'Solarized',
    description: 'Teal dusk',
    isDark: true,
    group: 'classic',
    preview: { bg: '#002b36', fg: '#93a1a1', accent: '#2aa198' },
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
  return `db-studio-${id}`
}

/** @param {ThemeId} id */
export function mermaidThemeFor(id) {
  /** @type {Record<ThemeId, { bg: string, fg: string, muted: string, line: string, accent: string, border: string }>} */
  const map = {
    light: {
      bg: '#f7f5ef',
      fg: '#393a34',
      muted: '#71717a',
      line: '#a1a1aa',
      accent: '#52525b',
      border: '#d4d4d8',
    },
    notion: {
      bg: '#ffffff',
      fg: '#37352f',
      muted: '#787774',
      line: '#e0ded8',
      accent: '#2383e2',
      border: '#e9e9e7',
    },
    'github-light': {
      bg: '#ffffff',
      fg: '#1f2328',
      muted: '#656d76',
      line: '#d0d7de',
      accent: '#0969da',
      border: '#d0d7de',
    },
    'vscode-light': {
      bg: '#ffffff',
      fg: '#333333',
      muted: '#6e6e6e',
      line: '#e5e5e5',
      accent: '#007acc',
      border: '#e5e5e5',
    },
    'linear-light': {
      bg: '#ffffff',
      fg: '#3f3f46',
      muted: '#71717a',
      line: '#e4e4e7',
      accent: '#5e6ad2',
      border: '#ececee',
    },
    linear: {
      bg: '#0d0d0f',
      fg: '#ededed',
      muted: '#8b8b90',
      line: '#232326',
      accent: '#5e6ad2',
      border: '#1f1f22',
    },
    cursor: {
      bg: '#141414',
      fg: '#e4e4e4',
      muted: '#8a8a8a',
      line: '#262626',
      accent: '#528bff',
      border: '#252525',
    },
    raycast: {
      bg: '#0a0a0a',
      fg: '#ededed',
      muted: '#888888',
      line: '#222222',
      accent: '#ff6363',
      border: '#1f1f1f',
    },
    vercel: {
      bg: '#000000',
      fg: '#ededed',
      muted: '#888888',
      line: '#1a1a1a',
      accent: '#0070f3',
      border: '#171717',
    },
    vscode: {
      bg: '#1e1e1e',
      fg: '#cccccc',
      muted: '#858585',
      line: '#333333',
      accent: '#007acc',
      border: '#3c3c3c',
    },
    github: {
      bg: '#0d1117',
      fg: '#e6edf3',
      muted: '#8b949e',
      line: '#30363d',
      accent: '#58a6ff',
      border: '#30363d',
    },
    onedark: {
      bg: '#282c34',
      fg: '#abb2bf',
      muted: '#7f848e',
      line: '#353b45',
      accent: '#61afef',
      border: '#353b45',
    },
    catppuccin: {
      bg: '#1e1e2e',
      fg: '#cdd6f4',
      muted: '#a6adc8',
      line: '#45475a',
      accent: '#cba6f7',
      border: '#45475a',
    },
    rosepine: {
      bg: '#232136',
      fg: '#e0def4',
      muted: '#6e6a86',
      line: '#393552',
      accent: '#c4a7e7',
      border: '#393552',
    },
    tokyonight: {
      bg: '#1a1b26',
      fg: '#a9b1d6',
      muted: '#545c7e',
      line: '#292e42',
      accent: '#7aa2f7',
      border: '#1f2335',
    },
    gruvbox: {
      bg: '#282828',
      fg: '#ebdbb2',
      muted: '#928374',
      line: '#504945',
      accent: '#fabd2f',
      border: '#3c3836',
    },
    monokai: {
      bg: '#272822',
      fg: '#f8f8f2',
      muted: '#8f908a',
      line: '#49483e',
      accent: '#a6e22e',
      border: '#3e3d32',
    },
    ayu: {
      bg: '#1f2430',
      fg: '#cbccc6',
      muted: '#5c6270',
      line: '#2d3447',
      accent: '#ffcc66',
      border: '#252a38',
    },
    dark: {
      bg: '#1c1c1c',
      fg: '#ebebeb',
      muted: '#9ca3af',
      line: '#6b7280',
      accent: '#d1d5db',
      border: '#404040',
    },
    vitesse: {
      bg: '#1a1916',
      fg: '#dbd7ca',
      muted: '#758575',
      line: '#4a4844',
      accent: '#4d9375',
      border: '#363430',
    },
    midnight: {
      bg: '#161b22',
      fg: '#e6edf3',
      muted: '#8b949e',
      line: '#484f58',
      accent: '#79b8ff',
      border: '#30363d',
    },
    slate: {
      bg: '#1e1e24',
      fg: '#e4e4e7',
      muted: '#a1a1aa',
      line: '#52525b',
      accent: '#a78bfa',
      border: '#3f3f46',
    },
    nord: {
      bg: '#2e3440',
      fg: '#eceff4',
      muted: '#a0a8b6',
      line: '#4c566a',
      accent: '#88c0d0',
      border: '#434c5e',
    },
    dracula: {
      bg: '#282a36',
      fg: '#f8f8f2',
      muted: '#6272a4',
      line: '#44475a',
      accent: '#bd93f9',
      border: '#383a4a',
    },
    forest: {
      bg: '#141a14',
      fg: '#e2ebe0',
      muted: '#8a9a86',
      line: '#2a362a',
      accent: '#7dd3a0',
      border: '#243024',
    },
    solarized: {
      bg: '#002b36',
      fg: '#93a1a1',
      muted: '#657b83',
      line: '#094552',
      accent: '#2aa198',
      border: '#073642',
    },
    broisnees: {
      bg: '#1c1c1c',
      fg: '#fafafa',
      muted: '#737373',
      line: '#404040',
      accent: '#fafafa',
      border: '#2e2e2e',
    },
    'broisnees-light': {
      bg: '#ffffff',
      fg: '#0a0a0a',
      muted: '#737373',
      line: '#e5e5e5',
      accent: '#0a0a0a',
      border: '#e5e5e5',
    },
    parchment: {
      bg: '#faf7f0',
      fg: '#2d2416',
      muted: '#7a6e5a',
      line: '#d6cec0',
      accent: '#4a3d8f',
      border: '#c8bfae',
    },
    ice: {
      bg: '#f2f5fc',
      fg: '#0f1a2e',
      muted: '#6a7a9a',
      line: '#ccd5ea',
      accent: '#3b6fd4',
      border: '#bcc8e0',
    },
    rose: {
      bg: '#fff4f4',
      fg: '#2a1518',
      muted: '#8a6070',
      line: '#f0ccd0',
      accent: '#c0375c',
      border: '#e8b8c0',
    },
    'catppuccin-latte': {
      bg: '#eff1f5',
      fg: '#4c4f69',
      muted: '#9ca0b0',
      line: '#ccd0da',
      accent: '#8839ef',
      border: '#bcc0cc',
    },
    'rosepine-dawn': {
      bg: '#faf4ed',
      fg: '#575279',
      muted: '#9893a5',
      line: '#dfdad9',
      accent: '#907aa9',
      border: '#d4d0cc',
    },
    obsidian: {
      bg: '#181818',
      fg: '#e8e8e8',
      muted: '#666666',
      line: '#282828',
      accent: '#4ade80',
      border: '#2a2a2a',
    },
    espresso: {
      bg: '#1d1710',
      fg: '#e8dcc8',
      muted: '#8a7a60',
      line: '#3a2e20',
      accent: '#d4973a',
      border: '#302518',
    },
    kanagawa: {
      bg: '#1f1f28',
      fg: '#dcd7ba',
      muted: '#727169',
      line: '#363646',
      accent: '#7e9cd8',
      border: '#2a2a37',
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
