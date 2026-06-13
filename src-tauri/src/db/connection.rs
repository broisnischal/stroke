use log::LevelFilter;
use serde::{Deserialize, Serialize};
use sqlx::mysql::{MySqlConnectOptions, MySqlPoolOptions};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{ConnectOptions, MySqlPool, PgPool, SqlitePool};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::State;

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
}

// ── Active connection ─────────────────────────────────────────────────────────

#[derive(Clone)]
pub enum ActiveConnection {
    Postgres(PgPool),
    Sqlite(SqlitePool),
    Mysql(MySqlPool),
    D1(D1Config),
    LibSql(LibSqlConfig),
}

impl ActiveConnection {
    pub fn driver(&self) -> &'static str {
        match self {
            Self::Postgres(_) => "postgres",
            Self::Sqlite(_) => "sqlite",
            Self::Mysql(_) => "mysql",
            Self::D1(_) => "d1",
            Self::LibSql(_) => "libsql",
        }
    }
}

// ── DbState ───────────────────────────────────────────────────────────────────

pub struct DbState {
    pub conn: Arc<Mutex<Option<ActiveConnection>>>,
}

impl Default for DbState {
    fn default() -> Self {
        Self { conn: Arc::new(Mutex::new(None)) }
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

// ── PostgreSQL connect / test ─────────────────────────────────────────────────

pub(crate) async fn open_pg(config: &PgConfig) -> Result<PgPool, String> {
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
        .acquire_timeout(Duration::from_secs(10))
        // Release idle connections after 30 s (was 60 s). Logs showed the app
        // goes fully idle within 30 s of the user stopping interaction, so
        // halving this cuts FD and memory hold-time without affecting responsiveness.
        .idle_timeout(Duration::from_secs(30))
        .max_lifetime(Duration::from_secs(300))
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
    let opts: MySqlConnectOptions = config
        .connection_url()
        .parse()
        .map_err(|e| format!("Connection failed: {e}"))?;
    let opts = opts.log_slow_statements(LevelFilter::Debug, Duration::from_secs(5));

    MySqlPoolOptions::new()
        // Same rationale as PG: 4 is the real-world ceiling for a desktop app.
        .max_connections(4)
        .acquire_timeout(Duration::from_secs(10))
        .idle_timeout(Duration::from_secs(30))
        .max_lifetime(Duration::from_secs(300))
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
