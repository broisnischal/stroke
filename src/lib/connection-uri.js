/** @typedef {{ host: string, port: string, database: string, user: string, password: string, ssl: boolean }} ParsedPostgresUri */
/** @typedef {{ filePath: string }} ParsedSqliteUri */

/**
 * @param {string} uri
 * @returns {ParsedPostgresUri | { error: string } | null}
 */
export function parsePostgresUri(uri) {
  const trimmed = uri.trim()
  if (!trimmed) return null

  let normalized = trimmed
  if (/^postgres:\/\//i.test(normalized)) {
    normalized = `postgresql://${normalized.slice(11)}`
  } else if (!/^postgresql:\/\//i.test(normalized)) {
    if (trimmed.includes('@') || /^[^/]+:\d+\//.test(trimmed)) {
      normalized = `postgresql://${trimmed}`
    } else {
      return { error: 'Expected a postgresql:// connection URI' }
    }
  }

  try {
    const url = new URL(normalized)
    const sslmode = url.searchParams.get('sslmode')?.toLowerCase()
    const ssl =
      sslmode === 'require' ||
      sslmode === 'verify-ca' ||
      sslmode === 'verify-full' ||
      url.searchParams.get('ssl') === 'true'

    return {
      host: url.hostname || '127.0.0.1',
      port: url.port || '5432',
      database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      ssl,
    }
  } catch {
    return { error: 'Could not parse connection URI' }
  }
}

/**
 * MySQL / MariaDB connection URI, e.g. `mysql://user:pass@host:3306/db`.
 * @param {string} uri
 * @returns {ParsedPostgresUri | { error: string } | null}
 */
export function parseMysqlUri(uri) {
  const trimmed = uri.trim()
  if (!trimmed) return null

  let normalized = trimmed
  if (/^(mysql|mariadb):\/\//i.test(normalized)) {
    // Normalize any recognized scheme to mysql:// so the URL parser is happy.
    normalized = `mysql://${normalized.replace(/^[a-z]+:\/\//i, '')}`
  } else if (trimmed.includes('@') || /^[^/]+:\d+\//.test(trimmed)) {
    normalized = `mysql://${trimmed}`
  } else {
    return { error: 'Expected a mysql:// connection URI' }
  }

  try {
    const url = new URL(normalized)
    const sslMode = url.searchParams.get('ssl-mode')?.toLowerCase()
    const ssl =
      sslMode === 'required' ||
      sslMode === 'verify_ca' ||
      sslMode === 'verify_identity' ||
      url.searchParams.get('ssl') === 'true'

    return {
      host: url.hostname || '127.0.0.1',
      port: url.port || '3306',
      database: decodeURIComponent(url.pathname.replace(/^\//, '')),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      ssl,
    }
  } catch {
    return { error: 'Could not parse connection URI' }
  }
}

/**
 * SQL Server URI, e.g. `sqlserver://sa:pass@host:1433/db?encrypt=true`.
 * @param {string} uri
 * @returns {{ host: string, port: string, database: string, user: string, password: string, encrypt: boolean, trustCert: boolean } | { error: string } | null}
 */
export function parseMssqlUri(uri) {
  const trimmed = uri.trim()
  if (!trimmed) return null

  // Prisma (and JDBC) write SQL Server as `sqlserver://host:1433;database=x;user=y`
  // — semicolon parameters, not a URL query string. `new URL` reads that as a
  // malformed port and throws, so it is parsed on its own terms.
  const semi = trimmed.match(/^(?:sqlserver|mssql):\/\/([^;]+);(.*)$/i)
  if (semi) {
    const [hostPart, rest] = [semi[1], semi[2]]
    const [host, port] = hostPart.split(':')
    /** @type {Record<string, string>} */
    const params = {}
    for (const pair of rest.split(';')) {
      const at = pair.indexOf('=')
      if (at <= 0) continue
      params[pair.slice(0, at).trim().toLowerCase()] = pair.slice(at + 1).trim()
    }
    const yes = (v) => v === 'true' || v === '1' || v === 'yes'
    const trustRaw = params.trustservercertificate
    return {
      host: host || '127.0.0.1',
      port: port || '1433',
      database: params.database ?? params.initialcatalog ?? '',
      user: params.user ?? params.username ?? params.userid ?? '',
      password: params.password ?? '',
      encrypt: params.encrypt == null ? true : yes(params.encrypt.toLowerCase()),
      trustCert: trustRaw == null ? true : yes(trustRaw.toLowerCase()),
    }
  }

  let normalized = trimmed
  if (/^(sqlserver|mssql):\/\//i.test(normalized)) {
    normalized = `mssql://${normalized.replace(/^[a-z]+:\/\//i, '')}`
  } else if (trimmed.includes('@') || /^[^/]+:\d+\//.test(trimmed)) {
    normalized = `mssql://${trimmed}`
  } else {
    return { error: 'Expected a sqlserver:// connection URI' }
  }

  const truthy = (v) => v === 'true' || v === '1' || v === 'yes'
  try {
    const url = new URL(normalized)
    const trust = url.searchParams.get('trustservercertificate')?.toLowerCase()
    return {
      host: url.hostname || '127.0.0.1',
      port: url.port || '1433',
      database: decodeURIComponent(url.pathname.replace(/^\//, '')),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      encrypt: truthy(url.searchParams.get('encrypt')?.toLowerCase() ?? ''),
      // Default to trusting the cert (matches the form default; most local/dev
      // SQL Servers use a self-signed cert), unless the URI explicitly says false.
      trustCert: trust == null ? true : truthy(trust),
    }
  } catch {
    return { error: 'Could not parse connection URI' }
  }
}

/**
 * ClickHouse URI: `clickhouse://user:pass@host:8123/db` or an http(s):// URL.
 * @param {string} uri
 * @returns {{ host: string, port: string, database: string, user: string, password: string, secure: boolean } | { error: string } | null}
 */
export function parseClickhouseUri(uri) {
  const trimmed = uri.trim()
  if (!trimmed) return null

  const m = trimmed.match(/^(clickhouse|https?):\/\//i)
  const scheme = m?.[1]?.toLowerCase() ?? null
  let normalized
  if (scheme === 'clickhouse') {
    normalized = `http://${trimmed.replace(/^clickhouse:\/\//i, '')}`
  } else if (scheme) {
    normalized = trimmed
  } else if (trimmed.includes('@') || /^[^/]+:\d+\//.test(trimmed)) {
    normalized = `http://${trimmed}`
  } else {
    return { error: 'Expected a clickhouse:// or http(s):// URI' }
  }

  try {
    const url = new URL(normalized)
    const secure = scheme === 'https' || url.port === '8443'
    return {
      host: url.hostname || '127.0.0.1',
      port: url.port || (secure ? '8443' : '8123'),
      database:
        decodeURIComponent(url.pathname.replace(/^\//, '')) || url.searchParams.get('database') || '',
      user: decodeURIComponent(url.username) || url.searchParams.get('user') || '',
      password: decodeURIComponent(url.password) || url.searchParams.get('password') || '',
      secure,
    }
  } catch {
    return { error: 'Could not parse connection URI' }
  }
}

/**
 * @param {string} uri
 * @returns {ParsedSqliteUri | { error: string } | null}
 */
export function parseSqliteUri(uri) {
  const trimmed = uri.trim()
  if (!trimmed) return null
  if (trimmed === ':memory:') return { filePath: ':memory:' }

  if (/^sqlite:/i.test(trimmed)) {
    let path = trimmed.replace(/^sqlite:\/\/?/i, '').replace(/^sqlite:/i, '')
    path = decodeURIComponent(path)
    if (!path) return { error: 'SQLite URI is missing a file path' }
    return { filePath: path }
  }

  if (/^file:\/\//i.test(trimmed)) {
    return { filePath: decodeURIComponent(trimmed.slice(7)) }
  }

  return null
}

/**
 * @param {'postgres'|'sqlite'|'mysql'|'mssql'|'clickhouse'} type
 * @param {string} uri
 * @returns {ParsedPostgresUri | ParsedSqliteUri | { error: string } | null}
 */
export function parseConnectionUri(type, uri) {
  if (type === 'sqlite') return parseSqliteUri(uri)
  if (type === 'mysql') return parseMysqlUri(uri)
  if (type === 'mssql') return parseMssqlUri(uri)
  if (type === 'clickhouse') return parseClickhouseUri(uri)
  return parsePostgresUri(uri)
}
