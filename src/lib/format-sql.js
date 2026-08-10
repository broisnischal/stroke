import { format } from 'sql-formatter'
import { normalizeSqlFormat, sqlFormatOptions } from '$lib/sql-format-options.js'

/**
 * SQL formatting. The preferences themselves live in `sql-format-options.js`,
 * which is free of this module's `sql-formatter` import so the settings store can
 * validate and hold them without putting the library on the startup path.
 */

/** @typedef {import('$lib/sql-format-options.js').SqlFormatOptions} SqlFormatOptions */

/** @param {string} sql @param {Partial<SqlFormatOptions>} [overrides] */
export function formatSql(sql, overrides) {
  const trimmed = sql.trim()
  if (!trimmed) return sql
  const o = overrides ? normalizeSqlFormat({ ...sqlFormatOptions(), ...overrides }) : sqlFormatOptions()
  try {
    return format(trimmed, {
      language: 'postgresql',
      tabWidth: o.tabWidth,
      useTabs: o.useTabs,
      keywordCase: o.keywordCase,
      dataTypeCase: o.dataTypeCase,
      functionCase: o.functionCase,
      identifierCase: o.identifierCase,
      logicalOperatorNewline: o.logicalOperatorNewline,
      expressionWidth: o.expressionWidth,
      linesBetweenQueries: o.linesBetweenQueries,
    })
  } catch {
    return sql
  }
}

/** @param {typeof import('monaco-editor')} monaco */
export function registerMonacoSqlFormatter(monaco) {
  if (registerMonacoSqlFormatter.done) return
  registerMonacoSqlFormatter.done = true

  /** @param {import('monaco-editor').editor.ITextModel} model */
  /** @param {import('monaco-editor').Range} [range] */
  function editsFor(model, range) {
    const text = range ? model.getValueInRange(range) : model.getValue()
    const formatted = formatSql(text)
    if (formatted === text) return []
    const target = range ?? model.getFullModelRange()
    return [{ range: target, text: formatted }]
  }

  monaco.languages.registerDocumentFormattingEditProvider('sql', {
    provideDocumentFormattingEdits: (model) => editsFor(model),
  })

  monaco.languages.registerDocumentRangeFormattingEditProvider('sql', {
    provideDocumentRangeFormattingEdits: (model, range) => editsFor(model, range),
  })
}

registerMonacoSqlFormatter.done = false
