use super::connection::RedisConfig;
use super::query::{ColumnInfo, RowFilter, SqlResult, TableRows};
use super::schema::{ColumnStructureRow, IndexInfo, TableInfo};
use serde_json::Value as JsonValue;
use std::time::Instant;

// ── Crate-name collision note ────────────────────────────────────────────────
// This module is `crate::db::redis`, but the driver crate is *also* named
// `redis`. Inside this file the bare path `redis::…` would resolve to *this*
// module, so the external crate is always referenced through the leading-colon
// path `::redis::…`.

// ── Connection ────────────────────────────────────────────────────────────────

/// Open a multiplexed async connection from a Redis config. Builds a
/// `redis://[:password@]host:port/db` URL (`rediss://` when TLS is enabled) and
/// hands back a pooled multiplexed connection.
async fn open(cfg: &RedisConfig) -> Result<::redis::aio::MultiplexedConnection, String> {
    let scheme = if cfg.tls { "rediss" } else { "redis" };
    let auth = match cfg.password.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        Some(pw) => format!(":{}@", urlencoding::encode(pw)),
        None => String::new(),
    };
    let url = format!("{scheme}://{auth}{}:{}/{}", cfg.host, cfg.port, cfg.db);

    let client = ::redis::Client::open(url).map_err(|e| format!("Redis connection failed: {e}"))?;
    client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| format!("Redis connection failed: {e}"))
}

/// Connectivity/credential check — issues a `PING`.
pub async fn ping(cfg: &RedisConfig) -> Result<(), String> {
    let mut conn = open(cfg).await?;
    ::redis::cmd("PING")
        .query_async::<::redis::Value>(&mut conn)
        .await
        .map(|_| ())
        .map_err(|e| format!("Redis PING failed: {e}"))
}

// ── Raw command execution ─────────────────────────────────────────────────────

/// Run a raw Redis command string (e.g. `GET foo`, `KEYS *`, `INFO`) and return
/// the reply as a single-column result set. The reply is expanded so that array
/// replies produce one row per element; scalar replies produce a single row.
pub async fn query(cfg: &RedisConfig, command: &str) -> Result<SqlResult, String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("Empty Redis command".into());
    }

    // Phase 1: plain whitespace split (no quote handling yet).
    let mut parts = trimmed.split_whitespace();
    let cmd_name = parts.next().ok_or("Empty Redis command")?;

    let t0 = Instant::now();
    let mut conn = open(cfg).await?;
    let mut cmd = ::redis::cmd(cmd_name);
    for arg in parts {
        cmd.arg(arg);
    }

    let reply: ::redis::Value = cmd
        .query_async(&mut conn)
        .await
        .map_err(|e| format!("Redis command failed: {e}"))?;
    let elapsed = t0.elapsed().as_millis() as u64;

    let rows = value_to_rows(&reply);
    let row_count = Some(rows.len() as i64);
    Ok(SqlResult {
        columns: vec![ColumnInfo::new("result", "string")],
        rows,
        row_count,
        message: None,
        query_ms: elapsed,
        sql: command.to_string(),
    })
}

/// Expand a top-level reply into rows for the single "result" column:
/// `Nil` → no rows; array/set → one row per element; anything else → one row.
fn value_to_rows(v: &::redis::Value) -> Vec<Vec<JsonValue>> {
    match v {
        ::redis::Value::Nil => Vec::new(),
        ::redis::Value::Array(items) | ::redis::Value::Set(items) => items
            .iter()
            .map(|item| vec![JsonValue::String(value_to_string(item))])
            .collect(),
        other => vec![vec![JsonValue::String(value_to_string(other))]],
    }
}

/// Stringify a single Redis reply value (recursing into nested containers).
fn value_to_string(v: &::redis::Value) -> String {
    match v {
        ::redis::Value::Nil => String::new(),
        ::redis::Value::Int(i) => i.to_string(),
        ::redis::Value::BulkString(bytes) => String::from_utf8_lossy(bytes).into_owned(),
        ::redis::Value::SimpleString(s) => s.clone(),
        ::redis::Value::Okay => "OK".to_string(),
        ::redis::Value::Double(d) => d.to_string(),
        ::redis::Value::Boolean(b) => b.to_string(),
        ::redis::Value::VerbatimString { text, .. } => text.clone(),
        ::redis::Value::Array(items) | ::redis::Value::Set(items) => {
            let inner: Vec<String> = items.iter().map(value_to_string).collect();
            format!("[{}]", inner.join(", "))
        }
        ::redis::Value::Map(pairs) => {
            let inner: Vec<String> = pairs
                .iter()
                .map(|(k, val)| format!("{}: {}", value_to_string(k), value_to_string(val)))
                .collect();
            format!("{{{}}}", inner.join(", "))
        }
        // Push, Attribute, BigNumber, ServerError, and any future (non_exhaustive)
        // variants fall back to the crate's Debug rendering.
        other => format!("{other:?}"),
    }
}

// ── SQL-shaped stubs (not supported on Redis in phase 1) ──────────────────────
// Redis is a key/value store, not a relational engine. These satisfy the shared
// data contract by returning empty/not-supported results so the dispatch enums
// compile. Keyspace browsing is intentionally deferred to a later phase.

pub async fn list_tables(_cfg: &RedisConfig) -> Result<Vec<TableInfo>, String> {
    Ok(vec![])
}

pub async fn list_indexes(_cfg: &RedisConfig) -> Result<Vec<IndexInfo>, String> {
    Ok(vec![])
}

pub async fn get_column_structure(
    _cfg: &RedisConfig,
    _table: &str,
) -> Result<Vec<ColumnStructureRow>, String> {
    Ok(vec![])
}

pub async fn get_ddl(_cfg: &RedisConfig, _table: &str) -> Result<String, String> {
    Ok(String::new())
}

#[allow(clippy::too_many_arguments)]
pub async fn get_table_rows(
    _cfg: &RedisConfig,
    _table: &str,
    _limit: i64,
    _offset: i64,
    _search: Option<String>,
    _sort_column: Option<String>,
    _sort_direction: Option<String>,
    _filters: Option<Vec<RowFilter>>,
    _include_meta: bool,
) -> Result<TableRows, String> {
    Err("Row browsing is not supported on Redis yet".into())
}
