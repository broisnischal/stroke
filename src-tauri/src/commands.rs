use std::sync::OnceLock;
use tauri::Emitter;

// ── Shared HTTP client for AI requests ────────────────────────────────────────
// One client for the whole process lifetime. reqwest maintains an internal
// connection pool, so subsequent requests to the same host reuse the TLS
// session and avoid the ~300–700 ms handshake on every call.
static AI_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn ai_http_client() -> &'static reqwest::Client {
    AI_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .tcp_keepalive(std::time::Duration::from_secs(60))
            .pool_max_idle_per_host(4)
            .pool_idle_timeout(std::time::Duration::from_secs(90))
            .build()
            .expect("failed to build AI HTTP client")
    })
}

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
    extra_headers: Option<std::collections::HashMap<String, String>>,
) -> Result<Option<serde_json::Value>, String> {
    let client = ai_http_client();
    let mut builder = client
        .post(&url)
        .header("Content-Type", "application/json");

    if let Some(key) = &api_key {
        if !key.is_empty() {
            builder = builder.header("Authorization", format!("Bearer {}", key));
        }
    }

    if let Some(headers) = extra_headers {
        for (k, v) in headers {
            builder = builder.header(k, v);
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
/// Uses async I/O so large export files don't block the Tokio executor thread.
#[tauri::command]
pub async fn save_file(path: String, content: String) -> Result<(), String> {
    tokio::fs::write(&path, content).await.map_err(|e| e.to_string())
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
    delete_table_row, delete_table_rows, execute_ddl, execute_sql, execute_sql_multi, get_table_rows, insert_table_row,
    list_schemas, list_tables, list_indexes, list_enums, list_triggers, list_sequences,
    truncate_table, drop_table, get_table_column_structure,
    test_connection, test_d1_connection, test_mysql_connection, test_sqlite_connection,
    update_table_cell, ConnectionConfig, D1Config, DbState, EnumInfo, IndexInfo, TriggerInfo, SequenceInfo,
    InsertRowResult, MysqlConfig, SqlResult, SqliteConfig, TableInfo, TableRows, ColumnStructureRow,
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
pub async fn pg_get_table_column_structure(
    state: State<'_, DbState>,
    schema: String,
    table: String,
) -> Result<Vec<ColumnStructureRow>, String> {
    get_table_column_structure(state, schema, table).await
}

#[tauri::command]
pub async fn pg_list_enums(
    state: State<'_, DbState>,
    schema: String,
) -> Result<Vec<EnumInfo>, String> {
    list_enums(state, schema).await
}

#[tauri::command]
pub async fn pg_list_triggers(
    state: State<'_, DbState>,
    schema: String,
) -> Result<Vec<TriggerInfo>, String> {
    list_triggers(state, schema).await
}

#[tauri::command]
pub async fn pg_list_sequences(
    state: State<'_, DbState>,
    schema: String,
) -> Result<Vec<SequenceInfo>, String> {
    list_sequences(state, schema).await
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
pub async fn pg_execute_sql_multi(state: State<'_, DbState>, sql: String) -> Result<Vec<SqlResult>, String> {
    execute_sql_multi(state, sql).await
}

/// Run a DDL statement outside a transaction (required for CREATE/DROP DATABASE etc.).
#[tauri::command]
pub async fn pg_execute_ddl(state: State<'_, DbState>, sql: String) -> Result<(), String> {
    execute_ddl(state, sql).await
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

// ── Sample database ────────────────────────────────────────────────────────────

/// Ensures the bundled sample SQLite database exists in the app data directory.
/// Creates and seeds it on first call; subsequent calls are a no-op.
/// Returns the absolute path to the database file.
#[tauri::command]
pub async fn init_sample_db(app: tauri::AppHandle) -> Result<String, String> {
    use sqlx::sqlite::SqlitePoolOptions;
    use tauri::Manager;

    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let db_path = data_dir.join("sample.db");
    let db_path_str = db_path.to_string_lossy().to_string();

    if db_path.exists() {
        return Ok(db_path_str);
    }

    let url = format!("sqlite:{}", db_path_str);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .map_err(|e| e.to_string())?;

    seed_sample_database(&pool).await?;
    pool.close().await;

    Ok(db_path_str)
}

async fn seed_sample_database(pool: &sqlx::SqlitePool) -> Result<(), String> {
    let stmts: &[&str] = &[
        // ── Schema ───────────────────────────────────────────────────────────
        "PRAGMA foreign_keys = ON",
        "CREATE TABLE IF NOT EXISTS users (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT    NOT NULL,
            email      TEXT    UNIQUE NOT NULL,
            country    TEXT,
            created_at TEXT    DEFAULT (datetime('now'))
        )",
        "CREATE TABLE IF NOT EXISTS categories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            description TEXT
        )",
        "CREATE TABLE IF NOT EXISTS products (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER REFERENCES categories(id),
            name        TEXT    NOT NULL,
            price       REAL    NOT NULL,
            stock       INTEGER NOT NULL DEFAULT 0,
            description TEXT
        )",
        "CREATE TABLE IF NOT EXISTS orders (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER REFERENCES users(id),
            status     TEXT NOT NULL DEFAULT 'pending',
            total      REAL NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )",
        "CREATE TABLE IF NOT EXISTS order_items (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id   INTEGER REFERENCES orders(id),
            product_id INTEGER REFERENCES products(id),
            quantity   INTEGER NOT NULL,
            unit_price REAL    NOT NULL
        )",
        // ── Seed: categories ─────────────────────────────────────────────────
        "INSERT INTO categories (name, description) VALUES
            ('Electronics',   'Gadgets, devices, and accessories'),
            ('Clothing',       'Apparel for all seasons'),
            ('Books',          'Fiction, non-fiction, and technical titles'),
            ('Home & Garden',  'Everything for your living space'),
            ('Sports',         'Gear and equipment for active lifestyles')",
        // ── Seed: users ───────────────────────────────────────────────────────
        "INSERT INTO users (name, email, country, created_at) VALUES
            ('Alice Martin',    'alice@example.com',   'US', '2024-01-10 08:00:00'),
            ('Bob Chen',        'bob@example.com',     'CN', '2024-01-15 09:30:00'),
            ('Clara Smith',     'clara@example.com',   'GB', '2024-02-01 10:00:00'),
            ('David Nguyen',    'david@example.com',   'VN', '2024-02-14 11:00:00'),
            ('Eva Rossi',       'eva@example.com',     'IT', '2024-03-01 12:00:00'),
            ('Frank Müller',    'frank@example.com',   'DE', '2024-03-20 13:00:00'),
            ('Grace Kim',       'grace@example.com',   'KR', '2024-04-05 14:00:00'),
            ('Hiro Tanaka',     'hiro@example.com',    'JP', '2024-04-18 15:00:00'),
            ('Isabel Ferreira', 'isabel@example.com',  'BR', '2024-05-02 16:00:00'),
            ('James Okafor',    'james@example.com',   'NG', '2024-05-19 17:00:00'),
            ('Karen Lee',       'karen@example.com',   'US', '2024-06-01 08:00:00'),
            ('Luca Bianchi',    'luca@example.com',    'IT', '2024-06-15 09:00:00'),
            ('Maria Garcia',    'maria@example.com',   'ES', '2024-07-01 10:00:00'),
            ('Noah Wilson',     'noah@example.com',    'AU', '2024-07-20 11:00:00'),
            ('Olivia Patel',    'olivia@example.com',  'IN', '2024-08-05 12:00:00')",
        // ── Seed: products ───────────────────────────────────────────────────
        "INSERT INTO products (category_id, name, price, stock, description) VALUES
            (1, 'Wireless Headphones',     89.99,  42, 'Over-ear noise-cancelling headphones'),
            (1, 'USB-C Hub 7-in-1',        34.99, 120, 'Expand your laptop ports'),
            (1, 'Mechanical Keyboard',    109.00,  55, 'Tactile switches, RGB backlight'),
            (1, 'Webcam 1080p',            49.99,  88, 'Crystal-clear video calls'),
            (1, 'Portable SSD 1TB',        79.99,  30, 'Fast NVMe external storage'),
            (2, 'Classic T-Shirt',         19.99, 200, 'Comfortable everyday cotton tee'),
            (2, 'Slim-Fit Jeans',          49.99,  75, 'Modern cut, stretch denim'),
            (2, 'Hoodie – Charcoal',       39.99,  60, 'Warm fleece-lined pullover'),
            (2, 'Running Shorts',          24.99, 110, 'Lightweight moisture-wicking'),
            (3, 'Clean Code',              35.00,  40, 'Robert C. Martin — software craftsmanship'),
            (3, 'The Pragmatic Programmer',33.00,  38, 'Hunt & Thomas — timeless dev advice'),
            (3, 'Designing Data-Intensive', 55.00,  25, 'Martin Kleppmann — distributed systems'),
            (4, 'Succulent Plant Set',     22.00,  90, 'Set of 4 low-maintenance succulents'),
            (4, 'Ceramic Pour-Over Kit',   45.00,  35, 'Elegant coffee brewing set'),
            (4, 'LED Desk Lamp',           38.50,  68, 'Adjustable colour temperature'),
            (5, 'Yoga Mat Pro',            28.00,  50, 'Non-slip 6mm thickness'),
            (5, 'Resistance Bands Set',    18.00,  95, 'Five resistance levels'),
            (5, 'Water Bottle 1L',         15.99, 140, 'BPA-free insulated stainless'),
            (5, 'Jump Rope Speed',         12.00,  80, 'Ball-bearing handles'),
            (1, 'Smart LED Strip 5m',      25.99,  65, 'Wi-Fi, 16M colours, app-controlled')",
        // ── Seed: orders ─────────────────────────────────────────────────────
        "INSERT INTO orders (user_id, status, total, created_at) VALUES
            ( 1, 'delivered',  124.98, '2024-03-05 10:00:00'),
            ( 2, 'delivered',   34.99, '2024-03-12 11:30:00'),
            ( 3, 'shipped',    188.99, '2024-04-01 09:00:00'),
            ( 4, 'delivered',   19.99, '2024-04-10 14:00:00'),
            ( 5, 'processing',  68.00, '2024-05-02 16:00:00'),
            ( 6, 'pending',     55.00, '2024-05-20 08:00:00'),
            ( 7, 'delivered',  149.98, '2024-06-01 12:00:00'),
            ( 8, 'cancelled',   35.00, '2024-06-15 10:00:00'),
            ( 9, 'shipped',     84.99, '2024-07-01 11:00:00'),
            (10, 'delivered',   46.00, '2024-07-18 15:00:00'),
            (11, 'delivered',   63.98, '2024-08-01 09:00:00'),
            (12, 'processing', 109.00, '2024-08-10 14:00:00'),
            (13, 'pending',     22.00, '2024-08-20 10:00:00'),
            (14, 'shipped',    118.49, '2024-08-25 13:00:00'),
            (15, 'delivered',   43.99, '2024-09-01 08:00:00')",
        // ── Seed: order_items ────────────────────────────────────────────────
        "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
            ( 1,  1, 1,  89.99),
            ( 1,  2, 1,  34.99),
            ( 2,  2, 1,  34.99),
            ( 3,  3, 1, 109.00),
            ( 3,  4, 1,  49.99),
            ( 3,  5, 1,  79.99),
            ( 4,  6, 1,  19.99),
            ( 5, 10, 1,  35.00),
            ( 5, 16, 1,  28.00),
            ( 6, 12, 1,  55.00),
            ( 7,  1, 1,  89.99),
            ( 7,  9, 1,  24.99),
            ( 7, 18, 2,  15.99),
            ( 8, 10, 1,  35.00),
            ( 9,  1, 1,  89.99),
            (10, 13, 1,  22.00),
            (10, 17, 1,  18.00),
            (10, 19, 1,   6.00),
            (11,  6, 1,  19.99),
            (11,  9, 1,  24.99),
            (11, 18, 1,  18.00),
            (12,  3, 1, 109.00),
            (13, 13, 1,  22.00),
            (14,  1, 1,  89.99),
            (14,  4, 1,  49.99),
            (15,  7, 1,  49.99),
            (15, 19, 2,  12.00)",
    ];

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    for stmt in stmts {
        sqlx::query(stmt)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Seed error: {e}"))?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
