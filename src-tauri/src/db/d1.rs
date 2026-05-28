use super::connection::D1Config;
use super::query::{ColumnInfo, SqlResult};
use serde::Deserialize;
use serde_json::Value;
use std::sync::OnceLock;
use std::time::Instant;

// ── Shared HTTP client ─────────────────────────────────────────────────────────
// One client for the whole process lifetime. reqwest maintains an internal
// connection pool, so subsequent requests to the same host reuse the TLS
// session and avoid the ~300–700 ms TLS handshake on every call.

static D1_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn client() -> &'static reqwest::Client {
    D1_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .tcp_keepalive(std::time::Duration::from_secs(60))
            .pool_max_idle_per_host(10)
            .pool_idle_timeout(std::time::Duration::from_secs(90))
            .build()
            .expect("failed to build D1 HTTP client")
    })
}

// ── Response types ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct D1Response {
    result: Vec<D1QueryResult>,
    success: bool,
    errors: Vec<Value>,
}

#[derive(Deserialize)]
struct D1QueryResult {
    #[serde(default)]
    results: Vec<serde_json::Map<String, Value>>,
    success: bool,
    meta: D1Meta,
}

#[derive(Deserialize)]
struct D1Meta {
    #[serde(default)]
    #[allow(dead_code)]
    duration: f64,
    #[serde(default)]
    changes: i64,
    #[serde(default)]
    rows_read: i64,
    #[serde(default)]
    rows_written: i64,
}

fn result_to_sql(result: D1QueryResult, elapsed: u64) -> Result<SqlResult, String> {
    if !result.success {
        return Err("D1 query returned success=false".to_string());
    }
    let columns: Vec<ColumnInfo> = result
        .results
        .first()
        .map(|row| {
            row.keys()
                .map(|k| ColumnInfo::new(k.clone(), "text"))
                .collect()
        })
        .unwrap_or_default();

    let rows: Vec<Vec<Value>> = result
        .results
        .iter()
        .map(|row| {
            columns
                .iter()
                .map(|c| row.get(&c.name).cloned().unwrap_or(Value::Null))
                .collect()
        })
        .collect();

    let row_count = if result.meta.rows_written > 0 || result.meta.changes > 0 {
        Some(result.meta.changes)
    } else if !rows.is_empty() {
        Some(result.meta.rows_read)
    } else {
        Some(0)
    };

    let message = if result.meta.changes > 0 {
        Some(format!("{} row(s) affected", result.meta.changes))
    } else {
        None
    };

    Ok(SqlResult { columns, rows, row_count, message, query_ms: elapsed })
}

// ── Public API ─────────────────────────────────────────────────────────────────

/// Execute a single SQL statement. Reuses the shared HTTP client so subsequent
/// calls skip the TLS handshake and use a pooled connection.
pub async fn query(config: &D1Config, sql: &str, params: Vec<Value>) -> Result<SqlResult, String> {
    let url = format!(
        "https://api.cloudflare.com/client/v4/accounts/{}/d1/database/{}/query",
        config.account_id, config.database_id
    );

    let t0 = Instant::now();
    let res = client()
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "sql": sql, "params": params }))
        .send()
        .await
        .map_err(|e| format!("D1 request failed: {e}"))?;

    let status = res.status();
    let elapsed = t0.elapsed().as_millis() as u64;

    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("D1 API error {status}: {}", body.chars().take(400).collect::<String>()));
    }

    let d1: D1Response = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse D1 response: {e}"))?;

    if !d1.success {
        let errs: Vec<String> = d1.errors.iter().map(|e| e.to_string()).collect();
        return Err(format!("D1 error: {}", errs.join("; ")));
    }

    let result = d1.result.into_iter().next().ok_or("Empty D1 result")?;
    result_to_sql(result, elapsed)
}

