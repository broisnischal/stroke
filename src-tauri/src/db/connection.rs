use log::LevelFilter;
use serde::{Deserialize, Serialize};
use sqlx::mysql::{MySqlConnectOptions, MySqlPoolOptions};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{ConnectOptions, MySqlPool, PgPool, SqlitePool};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::State;
use tokio::sync::oneshot;

use super::ssh_tunnel::{SshConfig, SshTunnel, TunnelState};

// ── PostgreSQL ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PgConfig {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    pub ssl: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssh: Option<SshConfig>,
}

impl PgConfig {
    pub fn connection_url(&self) -> String {
        let ssl = if self.ssl { "?sslmode=require" } else { "" };
        format!(
            "postgres://{}:{}@{}:{}/{}{}",
            urlencoding::encode(&self.user),
            urlencoding::encode(&self.password),
            self.host,
            self.port,
            self.database,
            ssl
        )
    }
}

/// Kept for backward-compat with all existing code that uses `ConnectionConfig`.
pub type ConnectionConfig = PgConfig;

// ── SQLite ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqliteConfig {
    pub name: String,
    /// Absolute file path, or `:memory:` for an in-memory database.
    pub file_path: String,
}

// ── MySQL ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MysqlConfig {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    pub ssl: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssh: Option<SshConfig>,
}

impl MysqlConfig {
    pub fn connection_url(&self) -> String {
        let ssl_mode = if self.ssl { "ssl-mode=required" } else { "ssl-mode=disabled" };
        format!(
            "mysql://{}:{}@{}:{}/{}?{}",
            urlencoding::encode(&self.user),
            urlencoding::encode(&self.password),
            self.host,
            self.port,
            self.database,
            ssl_mode
        )
    }
}

// ── Cloudflare D1 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct D1Config {
    pub name: String,
    pub account_id: String,
    pub database_id: String,
    pub api_token: String,
}

// ── LibSQL / Turso ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibSqlConfig {
    pub name: String,
    /// Database URL: libsql://*.turso.io, https://*.turso.io, or http://localhost:PORT
    pub url: String,
    /// Auth token (Turso). Leave None/empty for local unauthenticated libsql-server.
    pub auth_token: Option<String>,
}

// ── ClickHouse ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickhouseConfig {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    /// Use HTTPS (port 8443) instead of plain HTTP (port 8123).
    #[serde(default)]
    pub secure: bool,
}

impl ClickhouseConfig {
    /// Base HTTP(S) URL for the ClickHouse HTTP interface, no trailing slash.
    pub fn base_url(&self) -> String {
        let scheme = if self.secure { "https" } else { "http" };
        format!("{scheme}://{}:{}", self.host, self.port)
    }
}

// ── DuckDB ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuckdbConfig {
    pub name: String,
    /// Absolute file path, or `:memory:` for an in-memory database.
    pub file_path: String,
}

/// DuckDB's `Connection` is synchronous and not clonable, so we wrap it in an
/// `Arc<Mutex<…>>`. All access happens inside `spawn_blocking` to keep the async
/// runtime free; the lock is held only for the duration of a single statement.
pub type DuckdbHandle = Arc<Mutex<duckdb::Connection>>;

// ── MS SQL Server ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MssqlConfig {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    /// Negotiate TLS encryption for the connection.
    #[serde(default)]
    pub encrypt: bool,
    /// Skip TLS certificate validation (self-signed dev servers).
    #[serde(default)]
    pub trust_cert: bool,
}

/// tiberius `Client` is async and not clonable; share it behind an async mutex.
/// Only one desktop connection is ever live, so lock contention is a non-issue.
pub type MssqlHandle = Arc<tokio::sync::Mutex<crate::db::mssql::MssqlClient>>;

// ── Any-connection config for cross-connection queries ────────────────────────

/// Accepts the full saved-connection JSON from the frontend and routes to the
/// correct backend without touching the global active-connection state.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "type")]
pub enum AnyConnectionConfig {
    #[serde(rename = "postgres")]
    Postgres(PgConfig),
    #[serde(rename = "sqlite")]
    Sqlite(SqliteConfig),
    #[serde(rename = "d1")]
    D1(D1Config),
    #[serde(rename = "mysql")]
    Mysql(MysqlConfig),
    #[serde(rename = "libsql")]
    Libsql(LibSqlConfig),
    #[serde(rename = "clickhouse")]
    Clickhouse(ClickhouseConfig),
    #[serde(rename = "duckdb")]
    Duckdb(DuckdbConfig),
    #[serde(rename = "mssql")]
    Mssql(MssqlConfig),
}

// ── Active connection ─────────────────────────────────────────────────────────

#[derive(Clone)]
pub enum ActiveConnection {
    Postgres(PgPool),
    Sqlite(SqlitePool),
    Mysql(MySqlPool),
    D1(D1Config),
    LibSql(LibSqlConfig),
    Clickhouse(ClickhouseConfig),
    Duckdb(DuckdbHandle),
    Mssql(MssqlHandle),
}

impl ActiveConnection {
    pub fn driver(&self) -> &'static str {
        match self {
            Self::Postgres(_) => "postgres",
            Self::Sqlite(_) => "sqlite",
            Self::Mysql(_) => "mysql",
            Self::D1(_) => "d1",
            Self::LibSql(_) => "libsql",
            Self::Clickhouse(_) => "clickhouse",
            Self::Duckdb(_) => "duckdb",
            Self::Mssql(_) => "mssql",
        }
    }
}

// ── DbState ───────────────────────────────────────────────────────────────────

pub struct DbState {
    pub conn: Arc<Mutex<Option<ActiveConnection>>>,
    pub cancel_tx: Arc<Mutex<Option<oneshot::Sender<()>>>>,
}

impl Default for DbState {
    fn default() -> Self {
        Self {
            conn: Arc::new(Mutex::new(None)),
            cancel_tx: Arc::new(Mutex::new(None)),
        }
    }
}

/// Returns a clone of the active connection, or an error if disconnected.
pub fn require_conn(state: &State<'_, DbState>) -> Result<ActiveConnection, String> {
    state
        .conn
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "Not connected to a database".to_string())
}

/// Convenience helper kept for all existing PostgreSQL-specific code.
pub fn require_pool(state: &State<'_, DbState>) -> Result<PgPool, String> {
    match require_conn(state)? {
        ActiveConnection::Postgres(pool) => Ok(pool),
        other => Err(format!(
            "Expected a PostgreSQL connection, got {}",
            other.driver()
        )),
    }
}

fn set_conn(state: &State<'_, DbState>, conn: Option<ActiveConnection>) -> Result<(), String> {
    *state.conn.lock().map_err(|e| e.to_string())? = conn;
    Ok(())
}

async fn close_existing(state: &State<'_, DbState>) {
    let old = state.conn.lock().ok().and_then(|mut g| g.take());
    let timeout = std::time::Duration::from_secs(3);
    match old {
        // PgPool::close() waits for every connection to be returned to the pool.
        // A stalled or long-running query would block forever, crashing the UI.
        // Cap it: after 3 s we move on and let the OS clean up the sockets.
        Some(ActiveConnection::Postgres(p)) => {
            let _ = tokio::time::timeout(timeout, p.close()).await;
        }
        Some(ActiveConnection::Sqlite(p)) => {
            let _ = tokio::time::timeout(timeout, p.close()).await;
        }
        Some(ActiveConnection::Mysql(p)) => {
            let _ = tokio::time::timeout(timeout, p.close()).await;
        }
        _ => {}
    }
}

// ── Fast reachability preflight ───────────────────────────────────────────────

/// Confirm the host:port is reachable before building a pool. Unreachable hosts,
/// wrong ports, and empty values fail here in a few seconds instead of stalling
/// on the pool's much longer acquire timeout ("pool timed out…").
async fn tcp_preflight(host: &str, port: u16) -> Result<(), String> {
    if host.trim().is_empty() {
        return Err("Host is empty".to_string());
    }
    let addr = format!("{host}:{port}");
    match tokio::time::timeout(Duration::from_secs(4), tokio::net::TcpStream::connect(&addr)).await {
        Ok(Ok(_)) => Ok(()),
        Ok(Err(e)) => Err(format!("Can't reach {addr}: {e}")),
        Err(_) => Err(format!("Can't reach {addr} (timed out after 4s)")),
    }
}

// ── PostgreSQL connect / test ─────────────────────────────────────────────────

pub(crate) async fn open_pg(config: &PgConfig) -> Result<PgPool, String> {
    tcp_preflight(&config.host, config.port).await?;
    let opts: PgConnectOptions = config
        .connection_url()
        .parse()
        .map_err(|e| format!("Connection failed: {e}"))?;
    let opts = opts.log_slow_statements(LevelFilter::Debug, Duration::from_secs(5));

    PgPoolOptions::new()
        // Desktop app: at most 2-3 tabs open simultaneously, each running 1-2
        // queries. 4 connections is the real-world ceiling; monitored logs showed
        // only 4 connections actually opened even under active use. Keeping 10
        // was wasting ~25-40 MB of Rust-side recv/send buffers + 8 OS FDs for
        // sockets that stayed idle 95% of the time.
        .max_connections(4)
        // No min_connections: keeping idle connections alive causes ping failures
        // after network changes or laptop sleep/wake (os error 60), then a 27 s
        // stall while the pool replaces the dead connection.
        // Preflight already filtered unreachable hosts, so a short acquire timeout
        // keeps auth/handshake failures snappy instead of hanging ~10 s.
        .acquire_timeout(Duration::from_secs(6))
        // Keep connections warm for the whole active session. A short idle_timeout
        // (was 30 s) meant any pause longer than that forced a full TCP+TLS+auth
        // re-handshake on the next query — on a remote/SSL host that's seconds of
        // latency per connection, and a single table open opens several. 10 min
        // keeps the pool warm between interactions so repeat fetches stay fast;
        // test_before_acquire (sqlx default) still drops connections killed by
        // sleep/wake. max_lifetime caps server-side staleness.
        .idle_timeout(Duration::from_secs(600))
        .max_lifetime(Duration::from_secs(1800))
        // Kill truly runaway queries. 10 min covers bulk inserts / migrations while
        // still bounding accidental full-table scans that would pin a connection.
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                sqlx::query("SET statement_timeout = '10min'")
                    .execute(&mut *conn)
                    .await?;
                Ok(())
            })
        })
        .connect_with(opts)
        .await
        .map_err(|e| format!("Connection failed: {e}"))
}

pub async fn test_connection(config: PgConfig) -> Result<(), String> {
    let (effective, _tunnel) = resolve_pg_ssh(config).await?;
    let pool = open_pg(&effective).await?;
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .map_err(|e| format!("Query failed: {e}"))?;
    pool.close().await;
    Ok(())
}

pub async fn connect(
    state: State<'_, DbState>,
    tunnel_state: State<'_, TunnelState>,
    config: PgConfig,
) -> Result<(), String> {
    tunnel_state.clear();
    let (effective, tunnel) = resolve_pg_ssh(config).await?;
    let pool = open_pg(&effective).await?;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::Postgres(pool)))?;
    tunnel_state.set(tunnel);
    Ok(())
}

/// Establish an SSH tunnel if `config.ssh` is set, return a direct config pointing
/// at the local forwarded port. The tunnel's lifetime must outlive the connection.
async fn resolve_pg_ssh(config: PgConfig) -> Result<(PgConfig, Option<SshTunnel>), String> {
    if let Some(ref ssh_cfg) = config.ssh {
        let tunnel = SshTunnel::establish(ssh_cfg, &config.host, config.port).await?;
        let local_port = tunnel.local_port;
        let mut direct = config.clone();
        direct.host = "127.0.0.1".to_string();
        direct.port = local_port;
        direct.ssh = None;
        Ok((direct, Some(tunnel)))
    } else {
        Ok((config, None))
    }
}

// ── SQLite connect / test ─────────────────────────────────────────────────────

fn sqlite_url(path: &str) -> String {
    if path == ":memory:" {
        "sqlite::memory:".to_string()
    } else {
        format!("sqlite:{path}")
    }
}

pub(crate) async fn open_sqlite(config: &SqliteConfig) -> Result<SqlitePool, String> {
    let opts: SqliteConnectOptions = sqlite_url(&config.file_path)
        .parse()
        .map_err(|e| format!("SQLite connection failed: {e}"))?;
    let opts = opts.log_slow_statements(LevelFilter::Debug, Duration::from_secs(5));

    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .map_err(|e| format!("SQLite connection failed: {e}"))
}

pub async fn test_sqlite_connection(config: SqliteConfig) -> Result<(), String> {
    let pool = open_sqlite(&config).await?;
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .map_err(|e| format!("Query failed: {e}"))?;
    pool.close().await;
    Ok(())
}

pub async fn connect_sqlite(state: State<'_, DbState>, config: SqliteConfig) -> Result<(), String> {
    let pool = open_sqlite(&config).await?;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::Sqlite(pool)))
}

// ── MySQL connect / test ──────────────────────────────────────────────────────

pub(crate) async fn open_mysql(config: &MysqlConfig) -> Result<MySqlPool, String> {
    tcp_preflight(&config.host, config.port).await?;
    let opts: MySqlConnectOptions = config
        .connection_url()
        .parse()
        .map_err(|e| format!("Connection failed: {e}"))?;
    let opts = opts.log_slow_statements(LevelFilter::Debug, Duration::from_secs(5));

    MySqlPoolOptions::new()
        // Same rationale as PG: 4 is the real-world ceiling for a desktop app.
        .max_connections(4)
        .acquire_timeout(Duration::from_secs(6))
        // Keep connections warm for the session (see open_pg for the full rationale)
        // so repeat fetches don't pay a fresh TCP+TLS+auth handshake.
        .idle_timeout(Duration::from_secs(600))
        .max_lifetime(Duration::from_secs(1800))
        // Enable ANSI_QUOTES on every connection so double-quoted identifiers
        // ("col") work the same as backtick identifiers (`col`). This makes
        // standard SQL and AI-generated queries work without rewriting syntax.
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                sqlx::query("SET sql_mode = CONCAT(@@sql_mode, ',ANSI_QUOTES')")
                    .execute(conn)
                    .await
                    .map(|_| ())
            })
        })
        .connect_with(opts)
        .await
        .map_err(|e| format!("Connection failed: {e}"))
}

pub async fn test_mysql_connection(config: MysqlConfig) -> Result<(), String> {
    let (effective, _tunnel) = resolve_mysql_ssh(config).await?;
    let pool = open_mysql(&effective).await?;
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .map_err(|e| format!("Query failed: {e}"))?;
    pool.close().await;
    Ok(())
}

pub async fn connect_mysql(
    state: State<'_, DbState>,
    tunnel_state: State<'_, TunnelState>,
    config: MysqlConfig,
) -> Result<(), String> {
    tunnel_state.clear();
    let (effective, tunnel) = resolve_mysql_ssh(config).await?;
    let pool = open_mysql(&effective).await?;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::Mysql(pool)))?;
    tunnel_state.set(tunnel);
    Ok(())
}

async fn resolve_mysql_ssh(config: MysqlConfig) -> Result<(MysqlConfig, Option<SshTunnel>), String> {
    if let Some(ref ssh_cfg) = config.ssh {
        let tunnel = SshTunnel::establish(ssh_cfg, &config.host, config.port).await?;
        let local_port = tunnel.local_port;
        let mut direct = config.clone();
        direct.host = "127.0.0.1".to_string();
        direct.port = local_port;
        direct.ssh = None;
        Ok((direct, Some(tunnel)))
    } else {
        Ok((config, None))
    }
}

// ── D1 connect / test ─────────────────────────────────────────────────────────

pub async fn test_d1_connection(config: D1Config) -> Result<(), String> {
    crate::db::d1::query(&config, "SELECT 1", vec![]).await?;
    Ok(())
}

pub async fn connect_d1(state: State<'_, DbState>, config: D1Config) -> Result<(), String> {
    // Validate credentials before storing
    test_d1_connection(config.clone()).await?;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::D1(config)))
}

// ── LibSQL / Turso connect / test ─────────────────────────────────────────────

pub async fn test_libsql_connection(config: LibSqlConfig) -> Result<(), String> {
    crate::db::libsql::query(&config, "SELECT 1", vec![]).await?;
    Ok(())
}

pub async fn connect_libsql(state: State<'_, DbState>, config: LibSqlConfig) -> Result<(), String> {
    test_libsql_connection(config.clone()).await?;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::LibSql(config)))
}

// ── ClickHouse connect / test ─────────────────────────────────────────────────

pub async fn test_clickhouse_connection(config: ClickhouseConfig) -> Result<(), String> {
    tcp_preflight(&config.host, config.port).await?;
    crate::db::clickhouse::query(&config, "SELECT 1").await?;
    Ok(())
}

pub async fn connect_clickhouse(state: State<'_, DbState>, config: ClickhouseConfig) -> Result<(), String> {
    // Validate credentials/reachability before storing.
    test_clickhouse_connection(config.clone()).await?;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::Clickhouse(config)))
}

// ── DuckDB connect / test ──────────────────────────────────────────────────────

/// Open a DuckDB connection on a blocking thread (the driver is synchronous).
pub(crate) async fn open_duckdb(config: &DuckdbConfig) -> Result<DuckdbHandle, String> {
    let path = config.file_path.clone();
    tokio::task::spawn_blocking(move || {
        let conn = if path == ":memory:" || path.is_empty() {
            duckdb::Connection::open_in_memory()
        } else {
            duckdb::Connection::open(&path)
        }
        .map_err(|e| format!("DuckDB connection failed: {e}"))?;
        Ok::<DuckdbHandle, String>(Arc::new(Mutex::new(conn)))
    })
    .await
    .map_err(|e| format!("DuckDB open task failed: {e}"))?
}

pub async fn test_duckdb_connection(config: DuckdbConfig) -> Result<(), String> {
    let handle = open_duckdb(&config).await?;
    crate::db::duckdb::ping(&handle).await
}

pub async fn connect_duckdb(state: State<'_, DbState>, config: DuckdbConfig) -> Result<(), String> {
    let handle = open_duckdb(&config).await?;
    crate::db::duckdb::ping(&handle).await?;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::Duckdb(handle)))
}

// ── MS SQL Server connect / test ────────────────────────────────────────────────

pub(crate) async fn open_mssql(config: &MssqlConfig) -> Result<MssqlHandle, String> {
    tcp_preflight(&config.host, config.port).await?;
    let client = crate::db::mssql::connect(config).await?;
    Ok(Arc::new(tokio::sync::Mutex::new(client)))
}

pub async fn test_mssql_connection(config: MssqlConfig) -> Result<(), String> {
    let handle = open_mssql(&config).await?;
    crate::db::mssql::ping(&handle).await
}

pub async fn connect_mssql(state: State<'_, DbState>, config: MssqlConfig) -> Result<(), String> {
    let handle = open_mssql(&config).await?;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::Mssql(handle)))
}

// ── Disconnect ────────────────────────────────────────────────────────────────

pub async fn disconnect(
    state: State<'_, DbState>,
    tunnel_state: State<'_, TunnelState>,
) -> Result<(), String> {
    // close_existing already sets state to None atomically via take() before
    // starting the (potentially slow) pool close. Calling set_conn(None) again
    // after the async close would race with any concurrent connect_* call that
    // set a new connection while the pool was draining, wiping it out.
    close_existing(&state).await;
    // Kill the SSH tunnel (if any) after the pool is closed.
    tunnel_state.clear();
    Ok(())
}
