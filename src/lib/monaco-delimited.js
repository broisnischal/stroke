/**
 * Tiny Monarch tokenizers for delimited text (CSV / TSV) so the table's text
 * view gets colored values through Monaco's incremental, viewport-lazy
 * tokenizer instead of any custom rendering. Token names map onto the existing
 * Stroke Monaco themes ('string', 'number', 'keyword', 'delimiter').
 */
import * as monaco from '$lib/monaco.js'

let registered = false

export const CSV_LANG = 'stroke-csv'
export const TSV_LANG = 'stroke-tsv'

export function registerDelimitedLanguages() {
  if (registered) return
  registered = true

  /** @param {string} id @param {RegExp} delim @param {RegExp} plain */
  const define = (id, delim, plain) => {
    monaco.languages.register({ id })
    monaco.languages.setMonarchTokensProvider(id, {
      defaultToken: '',
      tokenizer: {
        root: [
          [/"(?:[^"]|"")*"/, 'string'],
          [delim, 'delimiter'],
          // Numbers only when the whole cell chunk is numeric (guarded by lookahead).
          [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?![^,\t\n])/, 'number'],
          [/\b(?:true|false|NULL|null)\b/, 'keyword'],
          [plain, ''],
        ],
      },
    })
  }

  define(CSV_LANG, /,/, /[^,"\n]+/)
  define(TSV_LANG, /\t/, /[^\t\n]+/)
}
