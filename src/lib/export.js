/**
 * Convert columns + rows to a CSV string.
 * Values are quoted when they contain commas, quotes, or newlines.
 * @param {Array<{ name: string }>} columns
 * @param {unknown[][]} rows
 * @returns {string}
 */
export function rowsToCsv(columns, rows) {
  const escape = (/** @type {unknown} */ v) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map((c) => escape(c.name)).join(',')
  const body = rows.map((row) => row.map(escape).join(',')).join('\n')
  return header + '\n' + body
}

/**
 * Convert columns + rows to a JSON array of objects.
 * @param {Array<{ name: string }>} columns
 * @param {unknown[][]} rows
 * @returns {string}
 */
export function rowsToJson(columns, rows) {
  const records = rows.map((row) => {
    /** @type {Record<string, unknown>} */
    const obj = {}
    columns.forEach((col, i) => { obj[col.name] = row[i] ?? null })
    return obj
  })
  return JSON.stringify(records, null, 2)
}

/**
 * Build a default filename like "users_2025-05-24.csv"
 * @param {string | null} tableName
 * @param {'csv' | 'json'} format
 */
export function buildExportFilename(tableName, format) {
  const base = tableName ?? 'export'
  const date = new Date().toISOString().slice(0, 10)
  return `${base}_${date}.${format}`
}

/**
 * Show a native "Save As" dialog and write content to the chosen path.
 * Falls back to a browser blob download when running outside Tauri.
 * @param {string} content
 * @param {string} defaultFilename  e.g. "users_2025-05-24.csv"
 * @param {'csv' | 'json' | 'sql'} format
 * @returns {Promise<boolean>} true if the file was saved, false if cancelled
 */
export async function saveExportFile(content, defaultFilename, format) {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

  if (isTauri) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { invoke } = await import('@tauri-apps/api/core')

    const filterName = format === 'csv' ? 'CSV files' : format === 'json' ? 'JSON files' : 'SQL files'
    const path = await save({
      defaultPath: defaultFilename,
      filters: [{ name: filterName, extensions: [format] }],
    })

    if (!path) return false
    await invoke('save_file', { path, content })
    return true
  }

  // Browser fallback
  const mime = format === 'csv' ? 'text/csv;charset=utf-8;' : format === 'json' ? 'application/json' : 'text/plain'
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = defaultFilename
  a.click()
  URL.revokeObjectURL(url)
  return true
}
