/**
 * The one place a keyboard shortcut is written down.
 *
 * Every shortcut is a single combo string in the grammar `createHotkey` already
 * parses — `Mod+Shift+T`, `Alt+1–5`, `F11`. Both platforms come out of that one
 * string: `Mod` prints as ⌘ on macOS and Ctrl everywhere else, `Alt` as ⌥ or
 * Alt. The two spellings used to be written out separately in the help dialog,
 * which is exactly what let them drift from what the app actually binds — so now
 * there is only one of them, and adding a shortcut gets both platforms for free.
 *
 * Keys that print as a symbol (`Enter` → ↵, `Plus` → +) are named here rather
 * than typed as the symbol, so a combo can always be split on '+' without
 * `Mod++` turning into nonsense.
 */

import { detectOs } from './platform.js'

export const IS_MAC = detectOs() === 'macos'

/** Modifier → the keycap this platform prints. */
const GLYPH = IS_MAC
  ? { Mod: '⌘', Meta: '⌘', Alt: '⌥', Ctrl: '⌃', Shift: '⇧' }
  : { Mod: 'Ctrl', Meta: 'Win', Alt: 'Alt', Ctrl: 'Ctrl', Shift: '⇧' }

/** Keys written by name, printed as a glyph. Platform-independent. */
const KEYCAP = {
  Enter: '↵',
  Backspace: '⌫',
  Escape: 'Esc',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Plus: '+',
  Minus: '−',
}

/**
 * The keycaps to render for a combo. Anything that is neither a modifier nor a
 * named key passes through as written, so `F11` and `1–9` need no entry.
 * @param {string} combo
 * @returns {string[]}
 */
export function keycaps(combo) {
  return combo.split('+').map((part) => GLYPH[part] ?? KEYCAP[part] ?? part)
}

/**
 * A combo as flat text, for searching. Includes both the printed keycaps and
 * the written names, so "cmd b", "⌘ b" and "mod b" all find the same row.
 * @param {string} combo
 */
export function comboText(combo) {
  return `${keycaps(combo).join(' ')} ${combo.replace(/\+/g, ' ')}`.toLowerCase()
}

/**
 * @typedef {{ combo: string, desc: string }} Shortcut
 * @typedef {{ label: string, icon: string, shortcuts: Shortcut[] }} ShortcutGroup
 */

/**
 * Grouped for the help dialog, in the order it shows them. `icon` is a name the
 * dialog maps to a component — this module stays plain data so it can be read
 * from anywhere without dragging Svelte in.
 * @type {ShortcutGroup[]}
 */
export const SHORTCUT_GROUPS = [
  {
    label: 'Navigation',
    icon: 'navigation',
    shortcuts: [
      { combo: 'Mod+K', desc: 'Command menu' },
      { combo: 'Mod+Shift+P', desc: 'Command menu' },
      { combo: 'Mod+Alt+1–9', desc: 'Switch to saved connection' },
      { combo: 'Mod+T', desc: 'Search tables' },
      { combo: 'Mod+N', desc: 'New tab' },
      { combo: 'Mod+W', desc: 'Close tab' },
      { combo: 'Mod+Tab', desc: 'Next tab' },
      { combo: 'Mod+Shift+Tab', desc: 'Previous tab' },
      { combo: 'Mod+Shift+T', desc: 'Reopen closed tab' },
      { combo: 'Mod+1–9', desc: 'Go to tab (9 = last)' },
      { combo: 'Alt+Shift+T', desc: 'Toggle tab bar' },
      { combo: 'Mod+B', desc: 'Toggle sidebar' },
      { combo: 'Mod+Shift+F', desc: 'Focus table filter' },
      { combo: 'Mod+D', desc: 'Switch database' },
      { combo: 'Mod+Shift+C', desc: 'Switch connection' },
      { combo: 'Mod+Alt+D', desc: 'Data view' },
      { combo: 'Mod+/', desc: 'Keyboard shortcuts' },
      { combo: 'F11', desc: 'Toggle fullscreen' },
    ],
  },
  {
    label: 'Views',
    icon: 'monitor',
    shortcuts: [
      { combo: 'Mod+Shift+D', desc: 'Disconnect' },
      { combo: 'Mod+Shift+S', desc: 'SQL editor' },
      { combo: 'Mod+Shift+O', desc: 'ORM Runner' },
      { combo: 'Mod+Shift+X', desc: 'Extensions' },
      { combo: 'Mod+Shift+E', desc: 'Toggle AI panel' },
      { combo: 'Mod+I', desc: 'Toggle AI sidebar' },
      { combo: 'Mod+Shift+L', desc: 'Activity log' },
      { combo: 'Mod+R', desc: 'Refresh current view' },
      { combo: 'Mod+Shift+V', desc: 'Cycle table data view' },
      { combo: 'Alt+1–5', desc: 'Table / JSON / Record / Text / Chart view' },
      { combo: 'Mod+Alt+F', desc: 'Find & replace in table' },
    ],
  },
  {
    label: 'SQL Editor',
    icon: 'terminal',
    shortcuts: [
      { combo: 'Mod+Enter', desc: 'Run all statements' },
      { combo: 'Mod+R', desc: 'Run statement at cursor' },
      { combo: 'Mod+L', desc: 'Select current statement' },
      { combo: 'Mod+S', desc: 'Save query' },
      { combo: 'Mod+J', desc: 'Toggle output panel' },
      { combo: 'Mod+Shift+B', desc: 'Query history' },
    ],
  },
  {
    label: 'ORM Runner',
    icon: 'code-2',
    shortcuts: [
      { combo: 'Mod+Enter', desc: 'Run query' },
      { combo: 'Mod+S', desc: 'Format code' },
    ],
  },
  {
    label: 'Data Table',
    icon: 'table-2',
    shortcuts: [
      { combo: 'Mod+F', desc: 'Search rows' },
      { combo: 'Alt+Shift+F', desc: 'Open filter menu' },
      { combo: 'Alt+Shift+S', desc: 'Open sort menu' },
      { combo: 'Alt+Shift+C', desc: 'Open columns menu' },
      { combo: 'Alt+Shift+R', desc: 'Reset table view (clear filters/sort/search)' },
      { combo: 'Enter', desc: 'Edit cell' },
      { combo: 'F2', desc: 'Edit cell' },
      { combo: 'Escape', desc: 'Cancel edit' },
      { combo: 'Mod+Enter', desc: 'Navigate to FK row' },
      { combo: 'Mod+C', desc: 'Copy cell value' },
      { combo: 'Mod+Backspace', desc: 'Delete selected rows' },
      { combo: 'Mod+A', desc: 'Select all rows' },
      { combo: 'Mod+Z', desc: 'Undo cell edit' },
      { combo: 'Mod+Shift+Z', desc: 'Redo cell edit' },
      { combo: 'Mod+Up', desc: 'Scroll to top' },
      { combo: 'Mod+Down', desc: 'Scroll to bottom' },
      { combo: 'Mod+Left', desc: 'Previous page' },
      { combo: 'Mod+Right', desc: 'Next page' },
      { combo: 'Mod+Shift+Left', desc: 'First page' },
      { combo: 'Mod+Shift+Right', desc: 'Last page' },
      { combo: 'Alt+Shift+1–5', desc: 'Jump to pinned table' },
    ],
  },
  {
    label: 'AI Chat',
    icon: 'bot',
    shortcuts: [
      { combo: 'Enter', desc: 'Send message' },
      { combo: 'Shift+Enter', desc: 'New line' },
      { combo: 'Mod+Shift+B', desc: 'Toggle conversation list' },
      { combo: 'Mod+Shift+T', desc: 'New conversation' },
    ],
  },
  {
    label: 'Appearance',
    icon: 'palette',
    shortcuts: [
      { combo: 'Mod+B', desc: 'Toggle sidebar' },
      { combo: 'Mod+Shift+T', desc: 'Toggle tab bar' },
      { combo: 'Mod+Shift+B', desc: 'Toggle status bar' },
      { combo: 'Mod+M', desc: 'Cycle theme' },
      { combo: 'Mod+Shift+M', desc: 'Previous theme' },
      { combo: 'Mod+Plus', desc: 'Zoom in' },
      { combo: 'Mod+Minus', desc: 'Zoom out' },
      { combo: 'Mod+0', desc: 'Reset zoom' },
    ],
  },
  {
    label: 'General',
    icon: 'settings',
    shortcuts: [
      { combo: 'Mod+?', desc: 'Keyboard shortcuts' },
      { combo: '?', desc: 'Keyboard shortcuts' },
      { combo: 'Mod+,', desc: 'Settings' },
      { combo: 'Escape', desc: 'Dismiss / close' },
    ],
  },
]
