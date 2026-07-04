/**
 * Convert columns + rows to a CSV string.
 * Values are quoted when they contain commas, quotes, or newlines.
 * @param {Array<{ name: string }>} columns
 * @param {unknown[][]} rows
 * @returns {string}
 */
const csvEscape = (/** @type {unknown} */ v) => {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function rowsToCsv(columns, rows) {
  const header = columns.map((c) => csvEscape(c.name)).join(',')
  const body = rows.map((row) => row.map(csvEscape).join(',')).join('\n')
  return header + '\n' + body
}

/** A macrotask yield so the UI can paint between chunks of a big export. */
const yieldToUi = () => new Promise((res) => setTimeout(res, 0))

/**
 * Chunked, cooperative CSV builder for large exports — yields to the event loop
 * every `chunkSize` rows so the main thread stays responsive and a progress
 * indicator can animate instead of the app appearing frozen.
 * @param {Array<{ name: string }>} columns
 * @param {unknown[][]} rows
 * @param {{ chunkSize?: number, onProgress?: (done: number, total: number) => void }} [opts]
 * @returns {Promise<string>}
 */
export async function rowsToCsvAsync(columns, rows, opts = {}) {
  const { chunkSize = 5000, onProgress } = opts
  const total = rows.length
  const blocks = [columns.map((c) => csvEscape(c.name)).join(',')]
  for (let i = 0; i < total; i += chunkSize) {
    const end = Math.min(i + chunkSize, total)
    let block = ''
    for (let r = i; r < end; r++) block += (r === i ? '' : '\n') + rows[r].map(csvEscape).join(',')
    blocks.push(block)
    onProgress?.(end, total)
    await yieldToUi()
  }
  return blocks.join('\n')
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
 * Chunked, cooperative JSON builder for large exports (see rowsToCsvAsync).
 * @param {Array<{ name: string }>} columns
 * @param {unknown[][]} rows
 * @param {{ chunkSize?: number, onProgress?: (done: number, total: number) => void }} [opts]
 * @returns {Promise<string>}
 */
export async function rowsToJsonAsync(columns, rows, opts = {}) {
  const { chunkSize = 5000, onProgress } = opts
  const total = rows.length
  if (total === 0) return '[]'
  const parts = ['[']
  for (let i = 0; i < total; i += chunkSize) {
    const end = Math.min(i + chunkSize, total)
    let block = ''
    for (let r = i; r < end; r++) {
      /** @type {Record<string, unknown>} */
      const obj = {}
      columns.forEach((col, ci) => { obj[col.name] = rows[r][ci] ?? null })
      block += (r === 0 ? '' : ',') + '\n  ' + JSON.stringify(obj)
    }
    parts.push(block)
    onProgress?.(end, total)
    await yieldToUi()
  }
  parts.push('\n]')
  return parts.join('')
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
