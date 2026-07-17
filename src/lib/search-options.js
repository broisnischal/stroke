/**
 * VS Code-style search options (match case / whole word / regex) translated
 * onto the backend's two search knobs: plain substring or regex.
 *
 * Postgres is the only engine with a regex search path (`~*` over every
 * column), and its ARE syntax can express the other two options inside the
 * pattern itself: an embedded `(?c)` prefix forces case-sensitive matching
 * (overriding the `~*` operator) and `\m … \M` anchor word boundaries. So all
 * three toggles compile to a single pattern + searchIsRegex=true.
 *
 * Other engines only implement plain case-insensitive substring search —
 * callers should hide the toggles via searchOptionsSupported() instead of
 * silently sending patterns that would be matched literally.
 */

/** @typedef {{ matchCase?: boolean, wholeWord?: boolean, regex?: boolean }} SearchOptions */

/** @param {string} s */
export const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** @param {string} dialect */
export function searchOptionsSupported(dialect) {
  return dialect === 'postgres'
}

/** @param {SearchOptions | null | undefined} opts */
export function hasActiveSearchOptions(opts) {
  return !!(opts && (opts.matchCase || opts.wholeWord || opts.regex))
}

/**
 * @param {string} term
 * @param {SearchOptions | null | undefined} opts
 * @param {boolean} [supported] whether the connection's engine supports options
 * @returns {{ search: string, searchIsRegex: boolean }}
 */
export function buildSearchQuery(term, opts, supported = true) {
  const t = term ?? ''
  if (!t.trim() || !supported || !hasActiveSearchOptions(opts)) {
    return { search: t, searchIsRegex: false }
  }
  let pattern = opts?.regex ? t : escapeRegExp(t)
  if (opts?.wholeWord) pattern = `\\m(?:${pattern})\\M`
  if (opts?.matchCase) pattern = `(?c)${pattern}`
  return { search: pattern, searchIsRegex: true }
}
