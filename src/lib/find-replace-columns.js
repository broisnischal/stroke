/**
 * Which columns find & replace is allowed to rewrite.
 *
 * Type used to be the only test, so a key column of a text-ish type was offered
 * like any other - and replacing inside one is not a replacement, it is a
 * rewrite of the relationship. A substring swap inside a uuid foreign key came
 * back from D1 as `FOREIGN KEY constraint failed: SQLITE_CONSTRAINT`, after the
 * user had already read a preview saying it would work: the new value pointed at
 * a parent row that does not exist, and nothing rewrites the parent to match.
 *
 * Engine-independent on purpose. Every engine with foreign keys fails the same
 * way, only with different words for it, and SQLite/D1 fail it at a point where
 * part of a batch may already have been written.
 */
import { isEditableType } from './cell-value.js'

/** @typedef {{ name: string, dataType?: string }} Col */
/** @typedef {{ columns?: string[] }} ForeignKey */
/** @typedef {'' | 'primary key' | 'foreign key' | 'binary'} BlockedReason */

/**
 * Why a column cannot be replaced in, or `''` when it can.
 *
 * A primary key is refused from the other side of the same problem - anything
 * referencing it breaks - and because the statement that applies the edit is
 * keyed by that very column, so it would be reading and writing one value at
 * once.
 *
 * @param {Col} col
 * @param {{ primaryKey?: string[], foreignKeys?: ForeignKey[] }} keys
 * @returns {BlockedReason}
 */
export function blockedReason(col, { primaryKey = [], foreignKeys = [] } = {}) {
  const name = col?.name
  if (primaryKey.includes(name)) return 'primary key'
  if (foreignKeys.some((fk) => (fk?.columns ?? []).includes(name))) return 'foreign key'
  // `bytea` and friends: a string replace over bytes is not a replacement.
  // Non-string cells are skipped at match time regardless of their column type,
  // so a numeric column costs nothing by being searchable - it simply never
  // matches.
  if (!isEditableType(col?.dataType ?? '')) return 'binary'
  return ''
}

/**
 * Every column with its verdict attached, in result-set order. Blocked ones are
 * kept rather than filtered out: dropping them silently left the one column
 * someone came here to change simply absent, with nothing to say why.
 *
 * @param {Col[]} columns
 * @param {{ primaryKey?: string[], foreignKeys?: ForeignKey[] }} keys
 */
export function annotateColumns(columns, keys) {
  return (columns ?? []).map((c, idx) => ({ ...c, idx, blocked: blockedReason(c, keys) }))
}

/**
 * True when every searchable column is blocked and at least one of them is
 * blocked because it is a key - a different message from "nothing here is
 * searchable".
 * @param {ReturnType<typeof annotateColumns>} annotated
 */
export function allTextColumnsAreKeys(annotated) {
  const searchable = annotated.filter((c) => !c.blocked)
  if (searchable.length > 0) return false
  return annotated.some((c) => c.blocked === 'primary key' || c.blocked === 'foreign key')
}
