import { invoke } from '@tauri-apps/api/core'

/** @typedef {{ name: string, host: string, port: number, database: string, user: string, password: string, ssl: boolean }} PgConnectionConfig */
/** @typedef {{ name: string, filePath: string }} SqliteConnectionConfig */
/** @typedef {{ name: string, accountId: string, databaseId: string, apiToken: string }} D1ConnectionConfig */
/** @typedef {PgConnectionConfig} ConnectionConfig */

/** @param {Record<string, unknown>} raw */
export function normalizeConnectionConfig(raw) {
  return {
    name: String(raw.name ?? '').trim() || 'Connection',
    host: String(raw.host ?? '127.0.0.1').trim(),
    port: Math.min(65535, Math.max(1, Number(raw.port) || 5432)),
    database: String(raw.database ?? 'postgres').trim(),
    user: String(raw.user ?? 'postgres').trim(),
    password: String(raw.password ?? ''),
    ssl: Boolean(raw.ssl),
  }
}

/** @param {unknown} err */
function formatInvokeError(err) {
  const msg = String(err)
  if (msg.includes('invoke') || msg.includes('Tauri')) {
    return 'Database API unavailable. Run the app with: npm run tauri dev'
  }
  return msg
}

async function inv(command, args = {}) {
  try {
    return await invoke(command, args)
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

// ── PostgreSQL ────────────────────────────────────────────────────────────────

export async function testPostgresConnection(config) {
  return inv('test_postgres_connection', { config: normalizeConnectionConfig(config) })
}

export async function connectPostgres(config) {
  return inv('connect_postgres', { config: normalizeConnectionConfig(config) })
}

/** Toggle the WebView DevTools (no-op in release builds). */
export async function toggleDevtools() {
  return inv('toggle_devtools')
}

// ── SQLite ────────────────────────────────────────────────────────────────────

/** @param {{ name: string, filePath: string }} config */
export async function testSqliteConnection(config) {
  return inv('test_sqlite', { config: { name: String(config.name || 'SQLite'), filePath: String(config.filePath || '') } })
}

/** @param {{ name: string, filePath: string }} config */
export async function connectSqlite(config) {
  return inv('connect_sqlite_db', { config: { name: String(config.name || 'SQLite'), filePath: String(config.filePath || '') } })
}

/**
 * Creates the sample SQLite database in the app data directory if it doesn't
 * exist yet, then returns its absolute file path.
 * @returns {Promise<string>}
 */
export async function initSampleDb() {
  return inv('init_sample_db')
}

// ── MySQL ─────────────────────────────────────────────────────────────────────

/** @param {{ name: string, host: string, port: number, database: string, user: string, password: string, ssl: boolean }} config */
export async function testMysqlConnection(config) {
  return inv('test_mysql', {
    config: {
      name: String(config.name || 'MySQL'),
      host: String(config.host || '127.0.0.1'),
      port: Math.min(65535, Math.max(1, Number(config.port) || 3306)),
      database: String(config.database || ''),
      user: String(config.user || 'root'),
      password: String(config.password || ''),
      ssl: Boolean(config.ssl),
    },
  })
}

/** @param {{ name: string, host: string, port: number, database: string, user: string, password: string, ssl: boolean }} config */
export async function connectMysql(config) {
  return inv('connect_mysql_db', {
    config: {
      name: String(config.name || 'MySQL'),
      host: String(config.host || '127.0.0.1'),
      port: Math.min(65535, Math.max(1, Number(config.port) || 3306)),
      database: String(config.database || ''),
      user: String(config.user || 'root'),
      password: String(config.password || ''),
      ssl: Boolean(config.ssl),
    },
  })
}

// ── Cloudflare D1 ─────────────────────────────────────────────────────────────

/** @param {{ name: string, accountId: string, databaseId: string, apiToken: string }} config */
export async function testD1Connection(config) {
  return inv('test_d1', { config })
}

/** @param {{ name: string, accountId: string, databaseId: string, apiToken: string }} config */
export async function connectD1(config) {
  return inv('connect_d1_db', { config })
}

/** @param {{ name: string, url: string, authToken?: string }} config */
export async function testLibSqlConnection(config) {
  return inv('test_libsql', { config })
}

/** @param {{ name: string, url: string, authToken?: string }} config */
export async function connectLibSql(config) {
  return inv('connect_libsql_db', { config })
}

// ── Docker ────────────────────────────────────────────────────────────────────

/** Returns Docker server version string, or throws a user-facing error. */
export async function dockerCheck() {
  return inv('docker_check')
}

/**
 * Pull + run a database container. Streams log events as `docker-log:{eventId}`.
 * @param {'postgres'|'mysql'} dbType
 * @param {string} eventId
 */
export async function dockerRunDb(dbType, eventId) {
  return inv('docker_run_db', { dbType, eventId })
}

// ── Shared disconnect ─────────────────────────────────────────────────────────

export async function disconnectPostgres() {
  return inv('disconnect_postgres')
}

export async function listSchemas() {
  try {
    return await invoke('pg_list_schemas')
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/** @param {string} schema */
export async function listTables(schema) {
  try {
    return await invoke('pg_list_tables', { schema })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/** @param {string} schema */
export async function listIndexes(schema) {
  try {
    return await invoke('pg_list_indexes', { schema })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/**
 * @param {string} schema
 * @param {string} table
 */
export async function getTableColumnStructure(schema, table) {
  try {
    return await invoke('pg_get_table_column_structure', { schema, table })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/** @param {string} schema */
export async function listEnums(schema) {
  try {
    return await invoke('pg_list_enums', { schema })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/** @param {string} schema */
export async function listTriggers(schema) {
  try {
    return await invoke('pg_list_triggers', { schema })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/** @param {string} schema */
export async function listSequences(schema) {
  try {
    return await invoke('pg_list_sequences', { schema })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/**
 * @param {string} schema
 * @param {string} table
 */
export async function truncateTable(schema, table) {
  try {
    return await invoke('pg_truncate_table', { schema, table })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/**
 * @param {string} schema
 * @param {string} table
 * @param {boolean} [cascade]
 */
export async function dropTable(schema, table, cascade = false) {
  try {
    return await invoke('pg_drop_table', { schema, table, cascade })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/**
 * @param {string} schema
 * @param {string} table
 * @param {number} limit
 * @param {number} offset
 * @param {{
 *   search?: string
 *   sortColumn?: string
 *   sortDirection?: 'asc' | 'desc'
 *   filters?: { column: string, op: string, value?: string }[]
 * }} [query]
 */
export async function getTableRows(schema, table, limit, offset, query = {}) {
  try {
    return await invoke('pg_get_table_rows', {
      schema,
      table,
      limit,
      offset,
      search: query.search?.trim() || null,
      sortColumn: query.sortColumn || null,
      sortDirection: query.sortDirection || null,
      filters: query.filters?.length ? query.filters : null,
    })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/** @param {string} sql */
export async function executeSql(sql) {
  try {
    return await invoke('pg_execute_sql', { sql })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/** Execute one or more SQL statements and return each result as a separate entry. */
export async function executeSqlMulti(sql) {
  return await inv('pg_execute_sql_multi', { sql })
}

/** Execute a DDL statement outside a transaction (CREATE/DROP DATABASE, etc.). */
export async function executeDdl(sql) {
  try {
    return await invoke('pg_execute_ddl', { sql })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/**
 * @param {string} schema
 * @param {string} table
 * @param {Record<string, unknown>} primaryKey
 * @param {string} column
 * @param {unknown} value
 */
export async function updateTableCell(schema, table, primaryKey, column, value) {
  try {
    return await invoke('pg_update_table_cell', {
      schema,
      table,
      primaryKey,
      column,
      value,
    })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/**
 * @param {string} schema
 * @param {string} table
 * @param {Record<string, unknown>} primaryKey
 */
export async function deleteTableRow(schema, table, primaryKey) {
  try {
    return await invoke('pg_delete_table_row', {
      schema,
      table,
      primaryKey,
    })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/**
 * @param {string} schema
 * @param {string} table
 * @param {Record<string, unknown>[]} primaryKeys
 */
export async function deleteTableRows(schema, table, primaryKeys) {
  try {
    return await invoke('pg_delete_table_rows', {
      schema,
      table,
      primaryKeys,
    })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/**
 * @param {string} schema
 * @param {string} table
 * @param {Record<string, unknown>} values
 * @returns {Promise<{ row: unknown[] }>}
 */
export async function insertTableRow(schema, table, values) {
  try {
    return await invoke('pg_insert_table_row', {
      schema,
      table,
      values,
    })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

// ── MCP Server ────────────────────────────────────────────────────────────────

/** @returns {Promise<{ running: boolean, port: number, url: string, token: string }>} */
export async function mcpStart() {
  return inv('mcp_start')
}

/**
 * Sync credential-free connection metadata to the MCP layer so AI tools can
 * call list_databases / current_database.
 * Strip passwords/tokens before calling — this data flows into the MCP server.
 * @param {import('$lib/stores/connections.js').SavedConnection[]} connections
 * @param {string | null} activeId
 */
export async function mcpUpdateConnections(connections, activeId) {
  const safe = connections.map(({ id, name, type: t, host, port, database, filePath }) => ({
    id,
    name,
    type: t ?? 'postgres',
    ...(host ? { host } : {}),
    ...(port ? { port } : {}),
    ...(database ? { database } : {}),
    ...(filePath ? { file_path: filePath } : {}),
  }))
  return inv('mcp_update_connections', { connections: safe, activeId: activeId ?? null })
}

export async function mcpStop() {
  return inv('mcp_stop')
}

/** @returns {Promise<{ running: boolean, port: number, url: string, token: string }>} */
export async function mcpStatus() {
  return inv('mcp_status')
}

// ── AI Secrets (secure key storage in app data dir, not localStorage) ────────

/** @param {string} profileId @param {string} apiKey */
export async function aiStoreKey(profileId, apiKey) {
  return inv('ai_store_key', { profileId, apiKey })
}

/** @param {string} profileId @returns {Promise<string>} */
export async function aiLoadKey(profileId) {
  return inv('ai_load_key', { profileId })
}

/** @param {string} profileId */
export async function aiDeleteKey(profileId) {
  return inv('ai_delete_key', { profileId })
}


// ── Backup / Restore ──────────────────────────────────────────────────────────

/**
 * Export the connected database as a SQL dump string.
 * @param {string | null} schema - Filter to one schema (PostgreSQL/MySQL only)
 * @returns {Promise<{ sql: string, tableCount: number, rowCount: number }>}
 */
/**
 * @param {string | null} schema
 * @param {string[] | null} tables
 * @param {{ includeSchema?: boolean, includeData?: boolean, includeSequences?: boolean, includeEnums?: boolean, includeFunctions?: boolean, includeTriggers?: boolean, includeViews?: boolean } | null} options
 */
export async function backupExport(schema = null, tables = null, options = null) {
  return inv('backup_export', { schema, tables, options })
}

/**
 * Execute a SQL restore script against the connected database.
 * @param {string} sql
 * @returns {Promise<{ statementsOk: number, statementsErr: number, errors: string[] }>}
 */
export async function backupImport(sql) {
  return inv('backup_import', { sql })
}

/**
 * @typedef {{ pid: number, rssBytes: number, virtualBytes: number, cpuPercent: number, processName: string }} AppMetrics
 */

/** Sample this process's PID, memory (RSS + virtual), and CPU usage. */
export async function getAppMetrics() {
  return /** @type {Promise<AppMetrics>} */ (invoke('get_app_metrics'))
}

/** Rename the OS process so it appears as `name` in htop / ps / Activity Monitor. */
export async function setProcessTitle(name) {
  return invoke('set_process_title', { name })
}
