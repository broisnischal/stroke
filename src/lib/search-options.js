/**
 * VS Code-style search options (match case / whole word / regex) translated
 * onto the backend's search knobs, per engine.
 *
 * Backend contract: `{ search, searchIsRegex, searchCaseSensitive }`.
 *   - searchIsRegex     → the engine matches with its regex operator (`~*`/`~`
 *                         for Postgres, `REGEXP` for MySQL) instead of substring.
 *   - searchCaseSensitive → drop the case-folding the substring path applies by
 *                         default (SQLite `instr` on lowered text; MySQL `LIKE`;
 *                         Postgres bakes case into the pattern so it never sets
 *                         this flag).
 *
 * Support differs by engine (see `supportedSearchOptions`):
 *   - Postgres / MySQL: all three (Postgres via ARE `~*`, MySQL via ICU REGEXP).
 *   - SQLite / D1 / LibSQL: match-case only - there is no built-in REGEXP
 *     function (D1 ships none), so regex/whole-word can't be honored.
 *   - Everything else: none (the toggles stay hidden; plain substring search).
 */

/** @typedef {{ matchCase?: boolean, wholeWord?: boolean, regex?: boolean }} SearchOptions */

/** @param {string} s */
export const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Which options a given engine can honor.
 * @param {string} dialect
 * @returns {{ matchCase: boolean, wholeWord: boolean, regex: boolean }}
 */
export function supportedSearchOptions(dialect) {
  switch (dialect) {
    case 'postgres':
    case 'mysql':
      return { matchCase: true, wholeWord: true, regex: true }
    case 'sqlite':
    case 'd1':
    case 'libsql':
      return { matchCase: true, wholeWord: false, regex: false }
    default:
      return { matchCase: false, wholeWord: false, regex: false }
  }
}

/** True when the engine supports at least one option (gates the toggle UI). */
export function searchOptionsSupported(dialect) {
  const s = supportedSearchOptions(dialect)
  return s.matchCase || s.wholeWord || s.regex
}

/** @param {SearchOptions | null | undefined} opts */
export function hasActiveSearchOptions(opts) {
  return !!(opts && (opts.matchCase || opts.wholeWord || opts.regex))
}

/**
 * @param {string} term
 * @param {SearchOptions | null | undefined} opts
 * @param {string} dialect the connection's engine family
 * @returns {{ search: string, searchIsRegex: boolean, searchCaseSensitive: boolean }}
 */
export function buildSearchQuery(term, opts, dialect) {
  const t = term ?? ''
  const sup = supportedSearchOptions(dialect)
  // Mask the requested options down to what the engine can actually honor.
  const matchCase = !!(opts?.matchCase && sup.matchCase)
  const wholeWord = !!(opts?.wholeWord && sup.wholeWord)
  const regex = !!(opts?.regex && sup.regex)

  if (!t.trim() || (!matchCase && !wholeWord && !regex)) {
    return { search: t, searchIsRegex: false, searchCaseSensitive: matchCase }
  }

  // Postgres: one ARE pattern via `~*`. `(?c)` forces case-sensitivity and
  // `\m … \M` anchor word boundaries, so all three fold into the pattern and
  // the separate case flag stays off.
  if (dialect === 'postgres') {
    let pattern = regex ? t : escapeRegExp(t)
    if (wholeWord) pattern = `\\m(?:${pattern})\\M`
    if (matchCase) pattern = `(?c)${pattern}`
    return { search: pattern, searchIsRegex: true, searchCaseSensitive: false }
  }

  // MySQL: ICU `REGEXP`. Word boundary is `\b`; case-sensitivity is applied by
  // the backend (BINARY cast) rather than an inline flag.
  if (dialect === 'mysql') {
    if (regex || wholeWord) {
      let pattern = regex ? t : escapeRegExp(t)
      if (wholeWord) pattern = `\\b(?:${pattern})\\b`
      return { search: pattern, searchIsRegex: true, searchCaseSensitive: matchCase }
    }
    // match-case only → plain substring, case-sensitive.
    return { search: t, searchIsRegex: false, searchCaseSensitive: true }
  }

  // SQLite / D1 / LibSQL: only match-case reaches here.
  return { search: t, searchIsRegex: false, searchCaseSensitive: matchCase }
}
