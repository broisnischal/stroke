/** @typedef {'sql' | 'markdown'} CellType */

/**
 * @typedef {object} CellResult
 * @property {Array<{ name: string, dataType?: string }>} columns
 * @property {unknown[][]} rows
 * @property {number} queryMs
 * @property {string} error
 * @property {string} message
 */

/**
 * @typedef {object} NotebookCell
 * @property {string} id
 * @property {CellType} type
 * @property {string} content
 * @property {CellResult | null} result
 * @property {boolean} collapsed
 */

/**
 * @typedef {object} Notebook
 * @property {string} version
 * @property {string} title
 * @property {NotebookCell[]} cells
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/** @returns {NotebookCell} */
export function createSqlCell(content = '') {
  return { id: crypto.randomUUID(), type: 'sql', content, result: null, collapsed: false }
}

/** @returns {NotebookCell} */
export function createMarkdownCell(content = '') {
  return { id: crypto.randomUUID(), type: 'markdown', content, result: null, collapsed: false }
}

/** @param {string} [title] @returns {Notebook} */
export function createNotebook(title = 'Untitled Notebook') {
  const now = new Date().toISOString()
  return { version: '1', title, cells: [createSqlCell()], createdAt: now, updatedAt: now }
}

/** @param {Notebook} notebook @returns {string} */
export function serializeNotebook(notebook) {
  return JSON.stringify({ ...notebook, updatedAt: new Date().toISOString() }, null, 2)
}

/** @param {string} json @returns {Notebook} */
export function deserializeNotebook(json) {
  const nb = JSON.parse(json)
  if (!nb.version || !Array.isArray(nb.cells)) throw new Error('Invalid .sqlnb format')
  nb.cells = nb.cells.map((c) => ({
    id: c.id ?? crypto.randomUUID(),
    type: c.type ?? 'sql',
    content: c.content ?? '',
    result: c.result ?? null,
    collapsed: c.collapsed ?? false,
  }))
  return nb
}

/** Derive a display title from the filename path. @param {string} path @returns {string} */
export function titleFromPath(path) {
  const base = path.split(/[/\\]/).pop() ?? path
  return base.replace(/\.sqlnb$/i, '')
}
