use tauri::Emitter;

/// Proxy an OpenAI-compatible chat completions request through the Rust backend,
/// bypassing WebView CORS restrictions for local AI models (Ollama, LM Studio, etc.).
///
/// For streaming requests, response chunks are emitted as Tauri events:
///   `ai-stream-{request_id}`       — text chunk payload
///   `ai-stream-done-{request_id}`  — stream finished
///   `ai-stream-error-{request_id}` — error message payload
#[tauri::command]
pub async fn ai_fetch(
    app: tauri::AppHandle,
    url: String,
    api_key: Option<String>,
    body: serde_json::Value,
    stream: bool,
    request_id: String,
) -> Result<Option<serde_json::Value>, String> {
    let client = reqwest::Client::new();
    let mut builder = client
        .post(&url)
        .header("Content-Type", "application/json");

    if let Some(key) = &api_key {
        if !key.is_empty() {
            builder = builder.header("Authorization", format!("Bearer {}", key));
        }
    }

    let response = builder.json(&body).send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        let detail: String = text.chars().take(400).collect();
        return Err(format!("AI API {}: {}", status, detail));
    }

    if stream {
        use futures::StreamExt;
        let mut byte_stream = response.bytes_stream();
        while let Some(chunk) = byte_stream.next().await {
            match chunk {
                Ok(bytes) => {
                    let text = String::from_utf8_lossy(&bytes).into_owned();
                    app.emit(&format!("ai-stream-{}", request_id), text).ok();
                }
                Err(e) => {
                    app.emit(&format!("ai-stream-error-{}", request_id), e.to_string()).ok();
                    return Ok(None);
                }
            }
        }
        app.emit(&format!("ai-stream-done-{}", request_id), true).ok();
        Ok(None)
    } else {
        let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        Ok(Some(json))
    }
}

/// Write text content to a path chosen by the user via a native save dialog.
#[tauri::command]
pub async fn save_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Restart the application — called after an update is installed.
#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

/// Toggle the WebView developer tools. Only functional in debug builds;
/// in release builds this is a no-op so the command stays safe to expose.
#[tauri::command]
pub fn toggle_devtools(window: tauri::WebviewWindow) {
    #[cfg(debug_assertions)]
    {
        if window.is_devtools_open() {
            window.close_devtools();
        } else {
            window.open_devtools();
        }
    }
    #[cfg(not(debug_assertions))]
    let _ = window;
}

use crate::db::{
    connect, connect_d1, connect_mysql, connect_sqlite, disconnect,
    delete_table_row, delete_table_rows, execute_sql, get_table_rows, insert_table_row,
    list_schemas, list_tables, list_indexes, list_enums, truncate_table, drop_table,
    test_connection, test_d1_connection, test_mysql_connection, test_sqlite_connection,
    update_table_cell, ConnectionConfig, D1Config, DbState, EnumInfo, IndexInfo, InsertRowResult,
    MysqlConfig, SqlResult, SqliteConfig, TableInfo, TableRows,
};
use serde_json::Value;
use std::collections::HashMap;
use tauri::{Manager, State};

// ── PostgreSQL ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn test_postgres_connection(config: ConnectionConfig) -> Result<(), String> {
    test_connection(config).await
}

#[tauri::command]
pub async fn connect_postgres(
    state: State<'_, DbState>,
    config: ConnectionConfig,
) -> Result<(), String> {
    connect(state, config).await
}

// ── SQLite ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn test_sqlite(config: SqliteConfig) -> Result<(), String> {
    test_sqlite_connection(config).await
}

#[tauri::command]
pub async fn connect_sqlite_db(
    state: State<'_, DbState>,
    config: SqliteConfig,
) -> Result<(), String> {
    connect_sqlite(state, config).await
}

// ── MySQL ─────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn test_mysql(config: MysqlConfig) -> Result<(), String> {
    test_mysql_connection(config).await
}

#[tauri::command]
pub async fn connect_mysql_db(
    state: State<'_, DbState>,
    config: MysqlConfig,
) -> Result<(), String> {
    connect_mysql(state, config).await
}

// ── Cloudflare D1 ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn test_d1(config: D1Config) -> Result<(), String> {
    test_d1_connection(config).await
}

#[tauri::command]
pub async fn connect_d1_db(
    state: State<'_, DbState>,
    config: D1Config,
) -> Result<(), String> {
    connect_d1(state, config).await
}

// ── Shared disconnect ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn disconnect_postgres(state: State<'_, DbState>) -> Result<(), String> {
    disconnect(state).await
}

// ── DB-agnostic query commands ────────────────────────────────────────────────

#[tauri::command]
pub async fn pg_list_schemas(state: State<'_, DbState>) -> Result<Vec<String>, String> {
    list_schemas(state).await
}

#[tauri::command]
pub async fn pg_list_tables(
    state: State<'_, DbState>,
    schema: String,
) -> Result<Vec<TableInfo>, String> {
    list_tables(state, schema).await
}

#[tauri::command]
pub async fn pg_list_indexes(
    state: State<'_, DbState>,
    schema: String,
) -> Result<Vec<IndexInfo>, String> {
    list_indexes(state, schema).await
}

#[tauri::command]
pub async fn pg_list_enums(
    state: State<'_, DbState>,
    schema: String,
) -> Result<Vec<EnumInfo>, String> {
    list_enums(state, schema).await
}

#[tauri::command]
pub async fn pg_truncate_table(
    state: State<'_, DbState>,
    schema: String,
    table: String,
) -> Result<(), String> {
    truncate_table(state, schema, table).await
}

#[tauri::command]
pub async fn pg_drop_table(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    cascade: bool,
) -> Result<(), String> {
    drop_table(state, schema, table, cascade).await
}

#[tauri::command]
pub async fn pg_get_table_rows(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    limit: i64,
    offset: i64,
    search: Option<String>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    filters: Option<Vec<crate::db::RowFilter>>,
) -> Result<TableRows, String> {
    get_table_rows(
        state,
        schema,
        table,
        limit,
        offset,
        search,
        sort_column,
        sort_direction,
        filters,
    )
    .await
}

#[tauri::command]
pub async fn pg_execute_sql(state: State<'_, DbState>, sql: String) -> Result<SqlResult, String> {
    execute_sql(state, sql).await
}

#[tauri::command]
pub async fn pg_update_table_cell(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    primary_key: HashMap<String, Value>,
    column: String,
    value: Value,
) -> Result<(), String> {
    update_table_cell(state, schema, table, primary_key, column, value).await
}

#[tauri::command]
pub async fn pg_delete_table_row(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    primary_key: HashMap<String, Value>,
) -> Result<(), String> {
    delete_table_row(state, schema, table, primary_key).await
}

#[tauri::command]
pub async fn pg_delete_table_rows(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    primary_keys: Vec<HashMap<String, Value>>,
) -> Result<u64, String> {
    delete_table_rows(state, schema, table, primary_keys).await
}

#[tauri::command]
pub async fn pg_insert_table_row(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    values: HashMap<String, Value>,
) -> Result<InsertRowResult, String> {
    insert_table_row(state, schema, table, values).await
}

// ── License ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn check_license_status(app: tauri::AppHandle) -> crate::license::LicenseStatus {
    match app.path().app_data_dir() {
        Ok(dir) => crate::license::check_status(&dir),
        Err(e) => crate::license::LicenseStatus::Error {
            message: e.to_string(),
        },
    }
}

#[tauri::command]
pub fn activate_license(app: tauri::AppHandle, key: String) -> Result<serde_json::Value, String> {
    let parsed = crate::license::verify_key(&key)?;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let lic = crate::license::LicenseFile {
        version: 1,
        key,
        email: parsed.email.clone(),
        plan: parsed.plan.clone(),
        issued_at: parsed.issued_at,
        expires_at: parsed.expires_at,
        device_id: crate::license::device_id(),
        activated_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    };
    crate::license::save_license(&dir, &lic)?;
    Ok(serde_json::json!({
        "email": parsed.email,
        "plan": parsed.plan,
        "issued_at": parsed.issued_at,
        "expires_at": parsed.expires_at,
    }))
}

#[tauri::command]
pub fn deactivate_license(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    crate::license::delete_license(&dir)
}

// ── License debug helpers (debug builds only) ─────────────────────────────────

/// Backdate the trial file so the UI shows it as expired (or N days elapsed).
/// Only compiled in debug mode — stripped from release builds entirely.
#[cfg(debug_assertions)]
#[tauri::command]
pub fn debug_set_trial_days_ago(app: tauri::AppHandle, days_ago: u64) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    crate::license::debug_set_trial_days_ago(&dir, days_ago)
}

#[cfg(debug_assertions)]
#[tauri::command]
pub fn debug_reset_trial(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    crate::license::debug_reset_trial(&dir)
}
