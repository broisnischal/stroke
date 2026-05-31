use serde::{Deserialize, Serialize};
use sqlx::mysql::MySqlPoolOptions;
use sqlx::postgres::PgPoolOptions;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::{MySqlPool, PgPool, SqlitePool};
use std::sync::{Arc, Mutex};
use tauri::State;

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

// ── Active connection ─────────────────────────────────────────────────────────

#[derive(Clone)]
pub enum ActiveConnection {
    Postgres(PgPool),
    Sqlite(SqlitePool),
    Mysql(MySqlPool),
    D1(D1Config),
}

impl ActiveConnection {
    pub fn driver(&self) -> &'static str {
        match self {
            Self::Postgres(_) => "postgres",
            Self::Sqlite(_) => "sqlite",
            Self::Mysql(_) => "mysql",
            Self::D1(_) => "d1",
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

async fn open_pg(config: &PgConfig) -> Result<PgPool, String> {
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
        .acquire_timeout(std::time::Duration::from_secs(10))
        // Release idle connections after 30 s (was 60 s). Logs showed the app
        // goes fully idle within 30 s of the user stopping interaction, so
        // halving this cuts FD and memory hold-time without affecting responsiveness.
        .idle_timeout(std::time::Duration::from_secs(30))
        .max_lifetime(std::time::Duration::from_secs(300))
        // Kill runaway queries automatically so they don't pin connections forever.
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                sqlx::query("SET statement_timeout = '30s'")
                    .execute(&mut *conn)
                    .await?;
                Ok(())
            })
        })
        .connect(&config.connection_url())
        .await
        .map_err(|e| format!("Connection failed: {e}"))
}

pub async fn test_connection(config: PgConfig) -> Result<(), String> {
    let pool = open_pg(&config).await?;
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .map_err(|e| format!("Query failed: {e}"))?;
    pool.close().await;
    Ok(())
}

pub async fn connect(state: State<'_, DbState>, config: PgConfig) -> Result<(), String> {
    let pool = open_pg(&config).await?;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::Postgres(pool)))
}

// ── SQLite connect / test ─────────────────────────────────────────────────────

fn sqlite_url(path: &str) -> String {
    if path == ":memory:" {
        "sqlite::memory:".to_string()
    } else {
        format!("sqlite:{path}")
    }
}

async fn open_sqlite(config: &SqliteConfig) -> Result<SqlitePool, String> {
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&sqlite_url(&config.file_path))
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

async fn open_mysql(config: &MysqlConfig) -> Result<MySqlPool, String> {
    MySqlPoolOptions::new()
        // Same rationale as PG: 4 is the real-world ceiling for a desktop app.
        .max_connections(4)
        .acquire_timeout(std::time::Duration::from_secs(10))
        .idle_timeout(std::time::Duration::from_secs(30))
        .max_lifetime(std::time::Duration::from_secs(300))
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
        .connect(&config.connection_url())
        .await
        .map_err(|e| format!("Connection failed: {e}"))
}

pub async fn test_mysql_connection(config: MysqlConfig) -> Result<(), String> {
    let pool = open_mysql(&config).await?;
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .map_err(|e| format!("Query failed: {e}"))?;
    pool.close().await;
    Ok(())
}

pub async fn connect_mysql(state: State<'_, DbState>, config: MysqlConfig) -> Result<(), String> {
    let pool = open_mysql(&config).await?;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::Mysql(pool)))
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

// ── Disconnect ────────────────────────────────────────────────────────────────

pub async fn disconnect(state: State<'_, DbState>) -> Result<(), String> {
    close_existing(&state).await;
    set_conn(&state, None)
}
