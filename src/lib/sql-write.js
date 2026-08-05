/**
 * Does this SQL modify anything?
 *
 * Read-only mode has to let people browse - running SELECTs in the console is
 * most of what read-only mode is *for* - so the gate can't simply refuse all
 * SQL. This is the one place that decides, so the console, the structure editor,
 * the AI tool calls and the API layer all draw the line identically.
 *
 * Bias: when a statement is ambiguous, call it a write. A false positive shows a
 * "read-only" toast the user can act on; a false negative writes to a database
 * they asked us not to touch.
 */

/**
 * Statements whose leading keyword is enough to condemn them. `vacuum`,
 * `reindex` and `cluster` write nothing a user typed but do rewrite storage, so
 * they belong on a read-only connection's blocklist too.
 */
const WRITE_HEADS = new Set([
  'insert', 'update', 'delete', 'merge', 'upsert', 'replace', 'truncate',
  'drop', 'alter', 'create', 'rename', 'comment',
  'grant', 'revoke',
  'reindex', 'vacuum', 'cluster', 'refresh', 'analyze',
  'call', 'do', 'execute',
  'attach', 'detach', 'load', 'import', 'restore',
  // Redis speaks its own verbs through the same execute path as SQL, so its
  // mutating commands belong in the same list.
  'del', 'unlink', 'hdel', 'hset', 'hmset', 'setex', 'setnx', 'psetex', 'mset',
  'msetnx', 'getset', 'getdel', 'append', 'incr', 'incrby', 'incrbyfloat',
  'decr', 'decrby', 'hincrby', 'hincrbyfloat', 'lpush', 'lpushx', 'rpush',
  'rpushx', 'lpop', 'rpop', 'lset', 'lrem', 'ltrim', 'rpoplpush', 'sadd',
  'srem', 'spop', 'smove', 'zadd', 'zrem', 'zincrby', 'zremrangebyrank',
  'zremrangebyscore', 'expire', 'expireat', 'pexpire', 'pexpireat', 'persist',
  'move', 'flushdb', 'flushall', 'xadd', 'xdel', 'xtrim',
])

/**
 * Remove `--` line comments and `/* *​/` block comments so the leading keyword is
 * the real one. A comment is the easiest way to hide `DROP` behind a `SELECT`.
 * @param {string} sql
 */
export function stripSqlComments(sql) {
  let out = ''
  let i = 0
  const n = sql.length
  while (i < n) {
    const c = sql[i]
    const next = sql[i + 1]
    // Quoted literals pass through untouched - a `--` inside a string is data.
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      out += c
      i++
      while (i < n) {
        out += sql[i]
        if (sql[i] === quote) {
          // Doubled quote is an escaped quote, not the end.
          if (sql[i + 1] === quote) { out += sql[i + 1]; i += 2; continue }
          i++
          break
        }
        i++
      }
      continue
    }
    if (c === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++
      continue
    }
    if (c === '/' && next === '*') {
      i += 2
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++
      i += 2
      out += ' '
      continue
    }
    out += c
    i++
  }
  return out
}

/**
 * Split a script into statements on top-level semicolons, ignoring the ones
 * inside string literals.
 * @param {string} sql
 */
function splitStatements(sql) {
  /** @type {string[]} */
  const parts = []
  let buf = ''
  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      buf += c
      i++
      while (i < sql.length) {
        buf += sql[i]
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { buf += sql[i + 1]; i += 2; continue }
          i++
          break
        }
        i++
      }
      continue
    }
    if (c === ';') { parts.push(buf); buf = ''; i++; continue }
    buf += c
    i++
  }
  parts.push(buf)
  return parts
}

/**
 * PRAGMAs that only report. The app introspects SQLite schemas with these, so
 * treating every PRAGMA as a write would break schema browsing on a read-only
 * SQLite file - the exact case read-only mode exists for.
 */
const MUTATING_PRAGMAS = new Set([
  'optimize', 'shrink_memory', 'incremental_vacuum', 'wal_checkpoint', 'vacuum',
])

/**
 * True when any statement in `sql` would modify data, schema or storage.
 * @param {string} sql
 */
export function isWriteSql(sql) {
  const clean = stripSqlComments(String(sql ?? ''))
  if (!clean.trim()) return false

  for (const raw of splitStatements(clean)) {
    // Leading parens wrap `(SELECT …) UNION …`, and a CTE can be parenthesised.
    const stmt = raw.trim().replace(/^[(\s]+/, '')
    if (!stmt) continue
    const head = (stmt.match(/^[a-z_]+/i)?.[0] ?? '').toLowerCase()

    if (WRITE_HEADS.has(head)) return true

    // A CTE hides the real verb behind the WITH list: `WITH x AS (…) DELETE …`.
    if (head === 'with' && /\b(insert\s+into|update\s+[\w"`.]|delete\s+from|merge\s+into)\b/i.test(stmt))
      return true

    // `SELECT … INTO t FROM …` creates a table, and MySQL's INTO OUTFILE writes a
    // file. Only the clause before FROM counts, so a `LIKE '%into%'` in a WHERE
    // can't be mistaken for one.
    if (head === 'select') {
      const beforeFrom = stmt.split(/\bfrom\b/i)[0]
      if (/\binto\s+(?:outfile\s+|dumpfile\s+)?["`\w]/i.test(beforeFrom)) return true
    }

    // `PRAGMA x = y` sets; `PRAGMA table_info(t)` reads.
    if (head === 'pragma') {
      const name = (stmt.match(/^pragma\s+(?:[\w"'`.]+\s*\.\s*)?([\w]+)/i)?.[1] ?? '').toLowerCase()
      if (/=/.test(stmt) || MUTATING_PRAGMAS.has(name)) return true
      continue
    }

    // COPY reads (`COPY … TO`) or writes (`COPY … FROM`).
    if (head === 'copy' && /\bfrom\b/i.test(stmt)) return true

    // `SET` is session state, except when it isn't: SET ROLE / SET SESSION
    // AUTHORIZATION change who you are for everything after it - and Redis's
    // `SET key value` is a plain write. SQL's form always has `=` or `TO`, so the
    // absence of both marks the Redis one.
    if (head === 'set') {
      if (/^set\s+(role|session\s+authorization)\b/i.test(stmt)) return true
      if (!/[=]|\bto\b/i.test(stmt)) return true
    }
  }
  return false
}
