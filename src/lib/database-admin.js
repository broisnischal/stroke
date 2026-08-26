// Server-level database operations: create, rename, duplicate, drop, and the
// read-only "what is this database" lookup behind Database info.
//
// The SQL lives here rather than in the shell because every statement has an
// engine-specific spelling and an engine-specific set of things it cannot do
// (MySQL has no RENAME DATABASE at all), and those rules have to be the same in
// the sidebar menu that enables the item and in the handler that runs it. One
// place, one answer.

import { engineFamily } from '$lib/stores/connections.js'

/** @typedef {import('$lib/stores/connections.js').SavedConnection} Conn */
/** @typedef {'postgres' | 'mysql'} AdminKind */
/** @typedef {'create' | 'rename' | 'duplicate' | 'drop' | 'terminate' | 'info'} AdminAction */

/**
 * Which dialect to write the DDL in, or null when this connection has no
 * server-level databases to administer at all.
 *
 * Provider connections (Neon, Supabase, PlanetScale) are ruled out on purpose:
 * their sibling "databases" are projects and branches addressed by an API ref,
 * not names in a catalog, so a `DROP DATABASE "<ref>"` would either miss or hit
 * the wrong thing. SQLite and D1 are files and Cloudflare-managed resources;
 * Redis addresses numbered logical DBs.
 * @param {Conn | null | undefined} conn
 * @returns {AdminKind | null}
 */
export function dbAdminKind(conn) {
  if (!conn || conn.provider) return null
  const family = engineFamily(conn.type)
  if (family === 'postgres') return 'postgres'
  if (family === 'mysql') return 'mysql'
  return null
}

/**
 * Why an action is unavailable, or '' when it can run.
 *
 * Two separate reasons to say no: the engine cannot express the statement, or
 * it can but not against the database this session is attached to. Postgres
 * refuses to rename, drop or use as a template the database you are connected
 * to, so those are offered on the other rows only.
 * @param {AdminAction} action
 * @param {Conn | null | undefined} conn
 * @param {{ isCurrent?: boolean }} [opts]
 */
export function dbActionBlocker(action, conn, opts = {}) {
  const kind = dbAdminKind(conn)
  if (!kind) return 'This connection has no server-level databases to manage.'
  if (kind === 'mysql') {
    if (action === 'rename') return 'MySQL has no RENAME DATABASE. Dump the schema and reload it under the new name.'
    if (action === 'duplicate') return 'MySQL cannot copy a database in one statement. Export it and import under a new name.'
    if (action === 'terminate') return 'Not needed on MySQL: DROP DATABASE does not wait for other sessions.'
  }
  if (!opts.isCurrent) return ''
  if (action === 'rename') return 'Cannot rename the database you are connected to. Switch to another one first.'
  if (action === 'drop') return 'Cannot drop the database you are connected to. Switch to another one first.'
  if (action === 'duplicate' && kind === 'postgres') return 'Postgres cannot copy a database while a session is connected to it. Switch away first.'
  return ''
}

/** @param {AdminAction} action @param {Conn | null | undefined} conn @param {{ isCurrent?: boolean }} [opts] */
export function canDbAction(action, conn, opts = {}) {
  return dbActionBlocker(action, conn, opts) === ''
}

/** Quote a database name for the dialect. @param {AdminKind} kind @param {string} name */
export function quoteDb(kind, name) {
  return kind === 'mysql' ? `\`${String(name).replace(/`/g, '``')}\`` : `"${String(name).replace(/"/g, '""')}"`
}

/** Single-quote a string literal - these statements have no parameter binding. @param {string} v */
function lit(v) {
  return `'${String(v).replace(/'/g, "''")}'`
}

/**
 * The name rules both engines agree on, kept deliberately tighter than what the
 * server would accept: no quote characters, nothing that needs escaping to
 * survive a round trip through a DDL string.
 * @param {string} name
 * @param {string[]} [existing] names already on the server, to catch collisions early
 * @returns {string} the problem, or '' when the name is usable
 */
export function validateDbName(name, existing = []) {
  const n = name.trim()
  if (!n) return 'Name is required'
  if (n.length > 63) return 'Name must be 63 characters or fewer'
  if (/["'`\\\0\n\r]/.test(n)) return 'Name cannot contain quotes, backslashes or line breaks'
  if (existing.some((e) => e.toLowerCase() === n.toLowerCase())) return 'A database with that name already exists'
  return ''
}

/** @typedef {{ name: string, owner?: string, encoding?: string, lcCollate?: string, lcCtype?: string, template?: string, connectionLimit?: number }} CreateDbOptions */

/** @param {AdminKind} kind @param {CreateDbOptions} opts */
export function createDatabaseSql(kind, opts) {
  const { name, owner = '', encoding = '', lcCollate = '', lcCtype = '', template = '', connectionLimit = -1 } = opts
  if (kind === 'mysql') {
    let sql = `CREATE DATABASE ${quoteDb(kind, name)}`
    if (encoding) sql += ` CHARACTER SET ${encoding}`
    if (lcCollate) sql += ` COLLATE ${lcCollate}`
    return sql
  }
  let sql = `CREATE DATABASE ${quoteDb(kind, name)}`
  if (encoding) sql += `\n  ENCODING ${lit(encoding)}`
  if (template) sql += `\n  TEMPLATE ${template}`
  if (lcCollate) sql += `\n  LC_COLLATE ${lit(lcCollate)}`
  if (lcCtype) sql += `\n  LC_CTYPE ${lit(lcCtype)}`
  if (owner) sql += `\n  OWNER ${quoteDb(kind, owner)}`
  if (connectionLimit != null && connectionLimit !== -1) sql += `\n  CONNECTION LIMIT ${connectionLimit}`
  return sql
}

/** @param {AdminKind} kind @param {string} from @param {string} to */
export function renameDatabaseSql(kind, from, to) {
  if (kind === 'mysql') throw new Error('MySQL cannot rename a database')
  return `ALTER DATABASE ${quoteDb(kind, from)} RENAME TO ${quoteDb(kind, to)}`
}

/**
 * Copy an existing database, structure and rows, under a new name. Postgres
 * does it by using the source as a template, which is why the source has to be
 * session-free.
 * @param {AdminKind} kind @param {string} from @param {string} to
 */
export function duplicateDatabaseSql(kind, from, to) {
  if (kind === 'mysql') throw new Error('MySQL cannot copy a database in one statement')
  return `CREATE DATABASE ${quoteDb(kind, to)} WITH TEMPLATE ${quoteDb(kind, from)}`
}

/**
 * @param {AdminKind} kind @param {string} name
 * @param {{ force?: boolean }} [opts] Postgres 13+ FORCE closes other sessions
 *   instead of refusing; without it a single idle connection blocks the drop.
 */
export function dropDatabaseSql(kind, name, opts = {}) {
  if (kind === 'mysql') return `DROP DATABASE ${quoteDb(kind, name)}`
  return `DROP DATABASE ${quoteDb(kind, name)}${opts.force ? ' WITH (FORCE)' : ''}`
}

/** Close every other session on a database, so a rename or copy can proceed.
 *  @param {AdminKind} kind @param {string} name */
export function terminateSessionsSql(kind, name) {
  if (kind === 'mysql') throw new Error('Not supported on MySQL')
  return `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${lit(name)} AND pid <> pg_backend_pid()`
}

/** @typedef {{ label: string, value: string }} DbInfoRow */

/** Catalog read behind Database info. @param {AdminKind} kind @param {string} name */
export function databaseInfoSql(kind, name) {
  if (kind === 'mysql') {
    return `SELECT s.SCHEMA_NAME,
       s.DEFAULT_CHARACTER_SET_NAME,
       s.DEFAULT_COLLATION_NAME,
       (SELECT COUNT(*) FROM information_schema.TABLES t WHERE t.TABLE_SCHEMA = s.SCHEMA_NAME) AS table_count,
       (SELECT IFNULL(SUM(t.DATA_LENGTH + t.INDEX_LENGTH), 0) FROM information_schema.TABLES t WHERE t.TABLE_SCHEMA = s.SCHEMA_NAME) AS size_bytes
FROM information_schema.SCHEMATA s
WHERE s.SCHEMA_NAME = ${lit(name)}`
  }
  return `SELECT d.datname,
       pg_get_userbyid(d.datdba) AS owner,
       pg_encoding_to_char(d.encoding) AS encoding,
       d.datcollate,
       d.datctype,
       d.datconnlimit,
       d.datallowconn,
       pg_size_pretty(pg_database_size(d.datname)) AS size,
       (SELECT count(*) FROM pg_stat_activity a WHERE a.datname = d.datname) AS sessions,
       shobj_description(d.oid, 'pg_database') AS comment
FROM pg_database d
WHERE d.datname = ${lit(name)}`
}

/** @param {number} bytes */
function prettyBytes(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n)) return '-'
  const units = ['B', 'kB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  // One decimal below 10, and never a trailing ".0" - "5 MB", not "5.0 MB".
  const shown = i === 0 ? String(v) : v.toFixed(v < 10 ? 1 : 0).replace(/\.0$/, '')
  return `${shown} ${units[i]}`
}

/**
 * Shape the info query's single row into label/value pairs for display. Kept
 * next to the query so a changed column list can only break in one file.
 * @param {AdminKind} kind
 * @param {{ rows?: unknown[][] } | null | undefined} result
 * @returns {DbInfoRow[]}
 */
export function databaseInfoRows(kind, result) {
  const row = result?.rows?.[0]
  if (!row) return []
  const str = (/** @type {unknown} */ v) => (v == null || v === '' ? '-' : String(v))
  if (kind === 'mysql') {
    return [
      { label: 'Name', value: str(row[0]) },
      { label: 'Character set', value: str(row[1]) },
      { label: 'Collation', value: str(row[2]) },
      { label: 'Tables', value: str(row[3]) },
      { label: 'Size', value: prettyBytes(Number(row[4])) },
    ]
  }
  return [
    { label: 'Name', value: str(row[0]) },
    { label: 'Owner', value: str(row[1]) },
    { label: 'Encoding', value: str(row[2]) },
    { label: 'Collation', value: str(row[3]) },
    { label: 'Character type', value: str(row[4]) },
    { label: 'Connection limit', value: Number(row[5]) === -1 ? 'Unlimited' : str(row[5]) },
    { label: 'Accepts connections', value: row[6] === false || row[6] === 'false' || row[6] === 0 ? 'No' : 'Yes' },
    { label: 'Size on disk', value: str(row[7]) },
    { label: 'Active sessions', value: str(row[8]) },
    { label: 'Comment', value: str(row[9]) },
  ]
}
