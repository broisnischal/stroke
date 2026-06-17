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

// ── Live mode ───────────────────────────────────────────────────────────────

/**
 * Start live updates for a table on the active connection (Postgres / SQLite).
 * The backend emits a `live-change` event when the table changes.
 * @param {string} schema @param {string} table
 */
export async function liveStart(schema, table) {
  return await inv('live_start', { schema, table })
}

/** Stop live updates and clean up any installed triggers. */
export async function liveStop() {
  return await inv('live_stop', {})
}

// ── PostgreSQL ────────────────────────────────────────────────────────────────

/** @param {{ host: string, port?: number, username: string, privateKeyPath?: string }} ssh */
function normalizeSshConfig(ssh) {
  return {
    host: String(ssh.host || '').trim(),
    port: Math.min(65535, Math.max(1, Number(ssh.port) || 22)),
    username: String(ssh.username || '').trim(),
    privateKeyPath: String(ssh.privateKeyPath || '').trim(),
  }
}

/** Attach SSH config to a connection payload when the user has configured a tunnel. */
function withSsh(payload, config) {
  if (config.ssh && config.ssh.host && config.ssh.username) {
    return { ...payload, ssh: normalizeSshConfig(config.ssh) }
  }
  return payload
}

export async function testPostgresConnection(config) {
  return inv('test_postgres_connection', { config: withSsh(normalizeConnectionConfig(config), config) })
}

export async function connectPostgres(config) {
  return inv('connect_postgres', { config: withSsh(normalizeConnectionConfig(config), config) })
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

/** @param {{ name: string, host: string, port: number, database: string, user: string, password: string, ssl: boolean, ssh?: object }} config */
export async function testMysqlConnection(config) {
  const base = {
    name: String(config.name || 'MySQL'),
    host: String(config.host || '127.0.0.1'),
    port: Math.min(65535, Math.max(1, Number(config.port) || 3306)),
    database: String(config.database || ''),
    user: String(config.user || 'root'),
    password: String(config.password || ''),
    ssl: Boolean(config.ssl),
  }
  return inv('test_mysql', { config: withSsh(base, config) })
}

/** @param {{ name: string, host: string, port: number, database: string, user: string, password: string, ssl: boolean, ssh?: object }} config */
export async function connectMysql(config) {
  const base = {
    name: String(config.name || 'MySQL'),
    host: String(config.host || '127.0.0.1'),
    port: Math.min(65535, Math.max(1, Number(config.port) || 3306)),
    database: String(config.database || ''),
    user: String(config.user || 'root'),
    password: String(config.password || ''),
    ssl: Boolean(config.ssl),
  }
  return inv('connect_mysql_db', { config: withSsh(base, config) })
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

/**
 * List all Cloudflare accounts accessible with the given API token.
 * @param {string} apiToken
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function cloudflareListAccounts(apiToken) {
  return inv('cloudflare_list_accounts', { apiToken })
}

/**
 * List all D1 databases for a given Cloudflare account.
 * @param {string} apiToken
 * @param {string} accountId
 * @returns {Promise<Array<{uuid: string, name: string, created_at?: string, num_tables?: number}>>}
 */
export async function cloudflareListD1Databases(apiToken, accountId) {
  return inv('cloudflare_list_d1_databases', { apiToken, accountId })
}

/** @param {{ name: string, url: string, authToken?: string }} config */
export async function testLibSqlConnection(config) {
  return inv('test_libsql', { config })
}

/** @param {{ name: string, url: string, authToken?: string }} config */
export async function connectLibSql(config) {
  return inv('connect_libsql_db', { config })
}

// ── ClickHouse ────────────────────────────────────────────────────────────────

/** @param {{ name: string, host: string, port: number|string, database: string, user: string, password: string, secure?: boolean }} config */
function normalizeClickhouse(config) {
  return {
    name: String(config.name || 'ClickHouse'),
    host: String(config.host || '127.0.0.1'),
    port: Math.min(65535, Math.max(1, Number(config.port) || 8123)),
    database: String(config.database || 'default'),
    user: String(config.user || 'default'),
    password: String(config.password || ''),
    secure: Boolean(config.secure),
  }
}

/** @param {{ name: string, host: string, port: number|string, database: string, user: string, password: string, secure?: boolean }} config */
export async function testClickhouseConnection(config) {
  return inv('test_clickhouse', { config: normalizeClickhouse(config) })
}

/** @param {{ name: string, host: string, port: number|string, database: string, user: string, password: string, secure?: boolean }} config */
export async function connectClickhouse(config) {
  return inv('connect_clickhouse_db', { config: normalizeClickhouse(config) })
}

// ── DuckDB ──────────────────────────────────────────────────────────────────────

/** @param {{ name: string, filePath: string }} config */
function normalizeDuckdb(config) {
  return {
    name: String(config.name || 'DuckDB'),
    filePath: String(config.filePath || ':memory:'),
  }
}

/** @param {{ name: string, filePath: string }} config */
export async function testDuckdbConnection(config) {
  return inv('test_duckdb', { config: normalizeDuckdb(config) })
}

/** @param {{ name: string, filePath: string }} config */
export async function connectDuckdb(config) {
  return inv('connect_duckdb_db', { config: normalizeDuckdb(config) })
}

// ── MS SQL Server ─────────────────────────────────────────────────────────────

/** @param {{ name: string, host: string, port: number|string, database: string, user: string, password: string, encrypt?: boolean, trustCert?: boolean }} config */
function normalizeMssql(config) {
  return {
    name: String(config.name || 'SQL Server'),
    host: String(config.host || '127.0.0.1'),
    port: Math.min(65535, Math.max(1, Number(config.port) || 1433)),
    database: String(config.database || 'master'),
    user: String(config.user || 'sa'),
    password: String(config.password || ''),
    encrypt: Boolean(config.encrypt),
    trustCert: Boolean(config.trustCert),
  }
}

/** @param {{ name: string, host: string, port: number|string, database: string, user: string, password: string, encrypt?: boolean, trustCert?: boolean }} config */
export async function testMssqlConnection(config) {
  return inv('test_mssql', { config: normalizeMssql(config) })
}

/** @param {{ name: string, host: string, port: number|string, database: string, user: string, password: string, encrypt?: boolean, trustCert?: boolean }} config */
export async function connectMssql(config) {
  return inv('connect_mssql_db', { config: normalizeMssql(config) })
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

/**
 * Returns tables that have a FK pointing TO the given table (reverse/incoming relationships).
 * @param {string} schema @param {string} table
 * @returns {Promise<Array<{ fromSchema:string, fromTable:string, fromColumns:string[], toColumns:string[], constraintName:string }>>}
 */
export async function getIncomingForeignKeys(schema, table) {
  try {
    return await invoke('pg_get_incoming_foreign_keys', { schema, table })
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
 * @returns {Promise<string>}
 */
export async function getTableDdl(schema, table) {
  return /** @type {string} */ (await inv('get_table_ddl', { schema, table }))
}

/**
 * @param {import('$lib/stores/connections.js').SavedConnection} connectionConfig
 * @param {string} schema
 * @param {string} table
 * @returns {Promise<string>}
 */
export async function getTableDdlOnConnection(connectionConfig, schema, table) {
  return /** @type {string} */ (await inv('get_table_ddl_on_connection', { config: connectionConfig, schema, table }))
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
 *   searchIsRegex?: boolean
 *   sortColumn?: string
 *   sortDirection?: 'asc' | 'desc'
 *   filters?: { column: string, op: string, value?: string }[]
 *   includeMeta?: boolean
 * }} [query]
 *
 * `includeMeta` (default true): fetch column enums/nullability, primary key and
 * foreign keys. Pass false on repeat fetches of a table already loaded
 * (pagination, sort, filter, live refresh) to skip those catalog round-trips —
 * the caller keeps the metadata it already has.
 */
export async function getTableRows(schema, table, limit, offset, query = {}) {
  try {
    return await invoke('pg_get_table_rows', {
      schema,
      table,
      limit,
      offset,
      search: query.search?.trim() || null,
      searchIsRegex: query.searchIsRegex ?? false,
      sortColumn: query.sortColumn || null,
      sortDirection: query.sortDirection || null,
      filters: query.filters?.length ? query.filters : null,
      includeMeta: query.includeMeta !== false,
    })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/**
 * @param {string} schema
 * @param {string} table
 * @param {string} column
 */
export async function getColumnStats(schema, table, column) {
  try {
    return await invoke('pg_get_column_stats', { schema, table, column })
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

/**
 * Run EXPLAIN ANALYZE on `sql` and return the parsed plan tree.
 * Works for PostgreSQL (JSON plan), MySQL (FORMAT=JSON), and SQLite (QUERY PLAN).
 * @param {string} sql
 * @returns {Promise<{ plan: object, planningTime: number, executionTime: number, driver: string }>}
 */
export async function explainSql(sql) {
  return inv('pg_explain_sql', { sql })
}

/**
 * Execute SQL against a specific saved connection without switching the active connection.
 * @param {import('$lib/stores/connections.js').SavedConnection} connectionConfig
 * @param {string} sql
 */
export async function executeSqlOnConnection(connectionConfig, sql) {
  try {
    return await invoke('execute_sql_on_connection', { config: connectionConfig, sql })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/** @param {import('$lib/stores/connections.js').SavedConnection} connectionConfig */
export async function listSchemasOnConnection(connectionConfig) {
  try {
    return /** @type {string[]} */ (await invoke('list_schemas_on_connection', { config: connectionConfig }))
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/**
 * @param {import('$lib/stores/connections.js').SavedConnection} connectionConfig
 * @param {string} schema
 */
export async function listTablesOnConnection(connectionConfig, schema) {
  try {
    return /** @type {string[]} */ (await invoke('list_tables_on_connection', { config: connectionConfig, schema }))
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
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

/** @param {boolean} readonly */
export async function mcpSetReadonly(readonly) {
  return inv('mcp_set_readonly', { readonly })
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

// ── Autostart ─────────────────────────────────────────────────────────────────

export async function enableAutostart() {
  return inv('enable_autostart')
}

export async function disableAutostart() {
  return inv('disable_autostart')
}

export async function getAutostartStatus() {
  return /** @type {Promise<boolean>} */ (inv('get_autostart_status'))
}

// ── File I/O ──────────────────────────────────────────────────────────────────

/** @param {string} path @returns {Promise<string>} */
export async function readFile(path) {
  return inv('read_file', { path })
}

/**
 * Show an open dialog filtered to .sqlnb files, then read the selected file.
 * @returns {Promise<{ path: string, content: string } | null>}
 */
export async function openNotebookFile() {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const path = await open({
    filters: [{ name: 'SQL Notebook', extensions: ['sqlnb'] }],
    multiple: false,
  })
  if (!path || typeof path !== 'string') return null
  const content = await readFile(path)
  return { path, content }
}

/**
 * Show a save dialog for .sqlnb files, then write the content.
 * @param {string} content
 * @param {string} [defaultName]
 * @returns {Promise<string | null>} saved path or null if cancelled
 */
export async function saveNotebookAs(content, defaultName = 'notebook.sqlnb') {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const path = await save({
    filters: [{ name: 'SQL Notebook', extensions: ['sqlnb'] }],
    defaultPath: defaultName,
  })
  if (!path) return null
  await inv('save_file', { path, content })
  return path
}

/**
 * Write notebook content to a known path (no dialog).
 * @param {string} path
 * @param {string} content
 */
export async function saveNotebook(path, content) {
  return inv('save_file', { path, content })
}
