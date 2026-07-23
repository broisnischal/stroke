use super::connection::{require_conn, ActiveConnection, AnyConnectionConfig, DbState};
use serde::Serialize;
use sqlx::{MySqlPool, PgPool, Row};
use tauri::State;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    pub name: String,
    pub row_count: i64,
    /// "table" | "view" | "materialized_view" | "foreign_table"
    pub kind: String,
    /// Row-level security enabled (PostgreSQL only; None for other backends)
    pub rls_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexInfo {
    pub name: String,
    pub table_name: String,
    /// Comma-separated column names (empty for SQLite/D1)
    pub columns: String,
    /// "btree", "hash", "gist", "gin", "brin", etc.
    pub index_type: String,
    pub is_unique: bool,
    pub is_primary: bool,
    /// Partial index WHERE clause expression, if any
    pub condition: Option<String>,
    /// Index comment
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnStructureRow {
    pub ordinal_position: i32,
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub column_default: Option<String>,
    pub foreign_key: Option<String>,
    pub fk_constraint_name: Option<String>,
    pub comment: Option<String>,
}

pub(crate) fn validate_ident(name: &str) -> Result<(), String> {
    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
    {
        return Err(format!("Invalid identifier: {name}"));
    }
    Ok(())
}

// ── PostgreSQL ────────────────────────────────────────────────────────────────

const LIST_TABLES_SQL: &str = r#"
    SELECT
        c.relname::text AS name,
        CASE c.relkind
            WHEN 'r' THEN 'table'
            WHEN 'p' THEN 'table'
            WHEN 'v' THEN 'view'
            WHEN 'm' THEN 'materialized_view'
            WHEN 'f' THEN 'foreign_table'
            ELSE 'table'
        END AS kind,
        CASE
            WHEN c.relkind IN ('v', 'f') THEN -1
            -- Trust the stats/planner estimate ONLY for large tables, where an
            -- exact COUNT(*) would be a slow sequential scan. For everything
            -- else we return -1 (unknown) and resolve it with an exact COUNT(*)
            -- below, because estimates are unreliable in both directions for
            -- small tables: a stale reltuples reports rows for a table that was
            -- emptied (n_live_tup catches up slowly after a bulk DELETE), and a
            -- freshly created / bulk-loaded / restored table reports 0 before
            -- autovacuum or the stats collector has run. The 100k threshold
            -- mirrors ESTIMATE_THRESHOLD in query.rs::get_table_rows, where an
            -- exact count below it is sub-millisecond.
            WHEN GREATEST(COALESCE(s.n_live_tup, 0), c.reltuples::bigint) >= 100000
                THEN GREATEST(COALESCE(s.n_live_tup, 0), c.reltuples::bigint)
            ELSE -1
        END AS row_count,
        CASE WHEN c.relkind IN ('r', 'p') THEN c.relrowsecurity ELSE false END AS rls_enabled
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s
        ON s.schemaname = n.nspname
        AND s.relname = c.relname
    WHERE n.nspname = $1
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      -- `IS NOT TRUE` (not `NOT x`) so partition-less tables survive on engines
      -- like CockroachDB where pg_class.relispartition is NULL rather than false.
      AND c.relispartition IS NOT TRUE
    ORDER BY c.relkind, c.relname
    "#;

const LIST_INDEXES_SQL: &str = r#"
    SELECT
        i.relname::text AS name,
        t.relname::text AS table_name,
        COALESCE(string_agg(a.attname, ', ' ORDER BY x.ordinality) FILTER (WHERE x.attnum > 0), '') AS columns,
        am.amname::text AS index_type,
        ix.indisunique AS is_unique,
        ix.indisprimary AS is_primary,
        MAX(pg_get_expr(ix.indpred, ix.indrelid)) AS condition,
        MAX(obj_description(i.oid, 'pg_class')) AS comment
    FROM pg_catalog.pg_index ix
    JOIN pg_catalog.pg_class i ON i.oid = ix.indexrelid
    JOIN pg_catalog.pg_class t ON t.oid = ix.indrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_catalog.pg_am am ON am.oid = i.relam
    LEFT JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, ordinality) ON TRUE
    LEFT JOIN pg_catalog.pg_attribute a
        ON a.attrelid = t.oid AND a.attnum = x.attnum AND x.attnum > 0
    WHERE n.nspname = $1
      AND t.relkind IN ('r', 'p', 'm')
    GROUP BY i.relname, i.oid, t.relname, am.amname, ix.indisunique, ix.indisprimary
    ORDER BY t.relname, ix.indisprimary DESC, i.relname
    "#;

async fn exact_row_count(pool: &PgPool, schema: &str, table: &str) -> Result<i64, String> {
    // Names arrive from the frontend in the lazy-count pass — escape embedded
    // quotes so an unusual (or hostile) identifier can't break out of the quoting.
    let q = |id: &str| format!("\"{}\"", id.replace('"', "\"\""));
    let sql = format!("SELECT COUNT(*)::bigint FROM {}.{}", q(schema), q(table));
    sqlx::query_scalar(&sql)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to count rows for {table}: {e}"))
}

/// Bound on concurrent COUNT(*) queries in the lazy-count pass. Firing all of
/// them at once (join_all) on a large schema swamps the small desktop pool —
/// 70+ acquires against max_connections=4 queue for seconds each ("time to
/// acquire exceeded slow threshold") and starve interactive queries. Matches
/// the pool's max_connections (see open_pg).
const COUNT_CONCURRENCY: usize = 4;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableRowCount {
    pub name: String,
    pub row_count: i64,
}

/// Exact COUNT(*) for the given tables of the active connection.
///
/// `list_tables` returns immediately with estimates (-1 = unknown) so the
/// sidebar renders without waiting on counts; the UI then calls this in a
/// background pass and patches the counts in as they resolve. Engines whose
/// `list_tables` already returns exact counts inline (SQLite/D1/libSQL/…)
/// never report -1, so they return an empty list here.
pub async fn table_row_counts(
    state: State<'_, DbState>,
    schema: String,
    tables: Vec<String>,
) -> Result<Vec<TableRowCount>, String> {
    use futures::stream::StreamExt;
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => {
            let counts: Vec<TableRowCount> =
                futures::stream::iter(tables.into_iter().map(|name| {
                    let pool = pool.clone();
                    let schema = schema.clone();
                    async move {
                        // -1 (not 0) on failure: 0 is a real "empty" count and must
                        // not be faked when the COUNT actually errored, or a view
                        // whose count can't be resolved reads as genuinely empty.
                        let row_count = match exact_row_count(&pool, &schema, &name).await {
                            Ok(n) => n,
                            Err(e) => {
                                eprintln!("[row count] {schema}.{name}: {e}");
                                -1
                            }
                        };
                        TableRowCount { name, row_count }
                    }
                }))
                .buffer_unordered(COUNT_CONCURRENCY)
                .collect()
                .await;
            Ok(counts)
        }
        ActiveConnection::Mysql(pool) => {
            let counts: Vec<TableRowCount> =
                futures::stream::iter(tables.into_iter().map(|name| {
                    let pool = pool.clone();
                    let schema = schema.clone();
                    async move {
                        let row_count = match mysql_exact_row_count(&pool, &schema, &name).await {
                            Ok(n) => n,
                            Err(e) => {
                                eprintln!("[row count] {schema}.{name}: {e}");
                                -1
                            }
                        };
                        TableRowCount { name, row_count }
                    }
                }))
                .buffer_unordered(COUNT_CONCURRENCY)
                .collect()
                .await;
            Ok(counts)
        }
        _ => Ok(Vec::new()),
    }
}

async fn list_schemas_pg(pool: &PgPool) -> Result<Vec<String>, String> {
    let rows = sqlx::query(
        r#"SELECT n.nspname::text FROM pg_catalog.pg_namespace n
           WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
             AND n.nspname NOT LIKE 'pg_temp_%'
             AND n.nspname NOT LIKE 'pg_toast_%'
           ORDER BY n.nspname"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list schemas: {e}"))?;

    Ok(rows.iter().filter_map(|r| r.try_get::<String, _>(0).ok()).collect())
}

async fn list_tables_pg(pool: &PgPool, schema: &str) -> Result<Vec<TableInfo>, String> {
    let rows = sqlx::query(LIST_TABLES_SQL)
        .bind(schema)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to list tables: {e}"))?;

    let mut tables: Vec<TableInfo> = rows
        .iter()
        .filter_map(|r| {
            Some(TableInfo {
                name: r.try_get(0).ok()?,
                kind: r.try_get::<String, _>(1).unwrap_or_else(|_| "table".to_string()),
                row_count: r.try_get::<i64, _>(2).unwrap_or(-1),
                rls_enabled: r.try_get::<bool, _>(3).ok(),
            })
        })
        .collect();

    // Views and foreign tables never get a COUNT(*) — report 0 immediately.
    // Real tables keep -1 (unknown): returning right away lets the sidebar
    // render instantly, and the UI resolves exact counts in a background
    // `table_row_counts` pass instead of blocking the list on N COUNT(*)s.
    for t in tables.iter_mut() {
        if t.row_count < 0 && (t.kind == "view" || t.kind == "foreign_table") {
            t.row_count = 0;
        }
    }
    Ok(tables)
}

async fn list_indexes_pg(pool: &PgPool, schema: &str) -> Result<Vec<IndexInfo>, String> {
    let rows = sqlx::query(LIST_INDEXES_SQL)
        .bind(schema)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to list indexes: {e}"))?;

    Ok(rows
        .iter()
        .filter_map(|r| {
            Some(IndexInfo {
                name: r.try_get(0).ok()?,
                table_name: r.try_get(1).ok()?,
                columns: r.try_get::<String, _>(2).unwrap_or_default(),
                index_type: r.try_get::<String, _>(3).unwrap_or_else(|_| "btree".to_string()),
                is_unique: r.try_get::<bool, _>(4).unwrap_or(false),
                is_primary: r.try_get::<bool, _>(5).unwrap_or(false),
                condition: r.try_get::<Option<String>, _>(6).ok().flatten(),
                comment: r.try_get::<Option<String>, _>(7).ok().flatten(),
            })
        })
        .collect())
}

// ── SQLite / D1 ───────────────────────────────────────────────────────────────

async fn list_tables_sqlite(pool: &sqlx::SqlitePool) -> Result<Vec<TableInfo>, String> {
    let rows = sqlx::query(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list tables: {e}"))?;

    let mut tables: Vec<TableInfo> = rows
        .iter()
        .filter_map(|r| {
            let name = r.try_get::<Option<String>, _>(0).ok().flatten()?;
            let ty = r.try_get::<Option<String>, _>(1).ok().flatten().unwrap_or_default();
            let kind = if ty == "view" { "view".to_string() } else { "table".to_string() };
            Some(TableInfo { name, kind, row_count: -1, rls_enabled: None })
        })
        .collect();

    // Views are always reported as 0; only base tables need a COUNT(*).
    let count_idx: Vec<usize> = tables
        .iter()
        .enumerate()
        .filter(|(_, t)| t.kind != "view")
        .map(|(i, _)| i)
        .collect();
    // Batch the COUNT(*)s into a single UNION ALL round-trip per chunk instead of
    // one query per table. SQLite pools use a single connection, so this is the
    // only way to avoid N serialized statements on sidebar open.
    for chunk in count_idx.chunks(SQLITE_COUNT_BATCH) {
        let sql = chunk
            .iter()
            .map(|&i| format!("SELECT COUNT(*) FROM \"{}\"", tables[i].name.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" UNION ALL ");
        match sqlx::query(&sql).fetch_all(pool).await {
            Ok(rows) => {
                for (&i, row) in chunk.iter().zip(rows.iter()) {
                    tables[i].row_count =
                        row.try_get::<Option<i64>, _>(0).ok().flatten().unwrap_or(0);
                }
            }
            // A single bad table (e.g. a virtual table) fails the whole batch;
            // fall back to per-table counts for this chunk so the rest still work.
            Err(_) => {
                for &i in chunk {
                    let one = format!("SELECT COUNT(*) FROM \"{}\"", tables[i].name.replace('"', "\"\""));
                    if let Ok(row) = sqlx::query(&one).fetch_one(pool).await {
                        tables[i].row_count =
                            row.try_get::<Option<i64>, _>(0).ok().flatten().unwrap_or(0);
                    }
                }
            }
        }
    }
    for t in tables.iter_mut() {
        if t.row_count < 0 {
            t.row_count = 0;
        }
    }
    Ok(tables)
}

/// Max number of COUNT(*) subqueries per batched UNION ALL round-trip. Kept well
/// under SQLite's default SQLITE_MAX_COMPOUND_SELECT (500) with headroom.
const SQLITE_COUNT_BATCH: usize = 200;

async fn list_indexes_sqlite(pool: &sqlx::SqlitePool) -> Result<Vec<IndexInfo>, String> {
    let rows = sqlx::query(
        "SELECT name, tbl_name, COALESCE(sql, '') FROM sqlite_master WHERE type = 'index' ORDER BY tbl_name, name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list indexes: {e}"))?;

    Ok(rows
        .iter()
        .filter_map(|r| {
            let name = r.try_get::<Option<String>, _>(0).ok().flatten()?;
            let table_name = r.try_get::<Option<String>, _>(1).ok().flatten()?;
            let sql = r.try_get::<String, _>(2).unwrap_or_default().to_uppercase();
            let is_unique = sql.contains("UNIQUE");
            let is_primary = name.starts_with("sqlite_autoindex_");
            Some(IndexInfo {
                name,
                table_name,
                columns: String::new(),
                index_type: "btree".to_string(),
                is_unique,
                is_primary,
                condition: None,
                comment: None,
            })
        })
        .collect())
}

async fn list_tables_d1(cfg: &super::connection::D1Config) -> Result<Vec<TableInfo>, String> {
    let result = super::d1::query(
        cfg,
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name",
        vec![],
    )
    .await?;

    let name_idx = result.columns.iter().position(|c| c.name == "name").unwrap_or(0);
    let type_idx = result.columns.iter().position(|c| c.name == "type").unwrap_or(1);

    let mut tables: Vec<TableInfo> = result
        .rows
        .iter()
        .filter_map(|r| {
            let name = r.get(name_idx)?.as_str()?.to_string();
            // Cloudflare D1 blocks access to its internal `_cf_*` tables with a
            // SQLITE_AUTH error, so hide them (can't be browsed or backed up).
            if name.starts_with("_cf_") {
                return None;
            }
            let ty = r.get(type_idx).and_then(|v| v.as_str()).unwrap_or("table");
            let kind = if ty == "view" { "view".to_string() } else { "table".to_string() };
            Some(TableInfo { name, kind, row_count: -1, rls_enabled: None })
        })
        .collect();

    // Each D1 count is a full HTTPS round-trip to Cloudflare, so N tables used to
    // mean N sequential requests on sidebar open. Batch them into one UNION ALL
    // request per chunk; fall back to per-table only if a batch fails.
    let count_idx: Vec<usize> = tables
        .iter()
        .enumerate()
        .filter(|(_, t)| t.kind != "view")
        .map(|(i, _)| i)
        .collect();
    for chunk in count_idx.chunks(SQLITE_COUNT_BATCH) {
        let sql = chunk
            .iter()
            .map(|&i| format!("SELECT COUNT(*) FROM \"{}\"", tables[i].name.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" UNION ALL ");
        match super::d1::query(cfg, &sql, vec![]).await {
            Ok(res) if res.rows.len() == chunk.len() => {
                for (&i, row) in chunk.iter().zip(res.rows.iter()) {
                    tables[i].row_count = row.first().and_then(|v| v.as_i64()).unwrap_or(0);
                }
            }
            _ => {
                for &i in chunk {
                    let one = format!("SELECT COUNT(*) FROM \"{}\"", tables[i].name.replace('"', "\"\""));
                    if let Ok(res) = super::d1::query(cfg, &one, vec![]).await {
                        if let Some(row) = res.rows.first() {
                            tables[i].row_count = row.first().and_then(|v| v.as_i64()).unwrap_or(0);
                        }
                    }
                }
            }
        }
    }
    for t in tables.iter_mut() {
        if t.row_count < 0 {
            t.row_count = 0;
        }
    }
    Ok(tables)
}

async fn list_indexes_d1(cfg: &super::connection::D1Config) -> Result<Vec<IndexInfo>, String> {
    let result = super::d1::query(
        cfg,
        "SELECT name, tbl_name, COALESCE(sql, '') FROM sqlite_master WHERE type = 'index' ORDER BY tbl_name, name",
        vec![],
    )
    .await?;

    let name_idx = result.columns.iter().position(|c| c.name == "name").unwrap_or(0);
    let tbl_idx = result.columns.iter().position(|c| c.name == "tbl_name").unwrap_or(1);
    let sql_idx = result.columns.iter().position(|c| c.name == "sql").unwrap_or(2);

    Ok(result
        .rows
        .iter()
        .filter_map(|r| {
            let name = r.get(name_idx)?.as_str()?.to_string();
            let table_name = r.get(tbl_idx)?.as_str()?.to_string();
            let sql = r.get(sql_idx).and_then(|v| v.as_str()).unwrap_or("").to_uppercase();
            let is_unique = sql.contains("UNIQUE");
            let is_primary = name.starts_with("sqlite_autoindex_");
            Some(IndexInfo {
                name,
                table_name,
                columns: String::new(),
                index_type: "btree".to_string(),
                is_unique,
                is_primary,
                condition: None,
                comment: None,
            })
        })
        .collect())
}

// ── LibSQL / Turso ────────────────────────────────────────────────────────────

async fn list_tables_libsql(cfg: &super::connection::LibSqlConfig) -> Result<Vec<TableInfo>, String> {
    let result = super::libsql::query(
        cfg,
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
        vec![],
    ).await?;
    let name_idx = result.columns.iter().position(|c| c.name == "name").unwrap_or(0);
    let type_idx = result.columns.iter().position(|c| c.name == "type").unwrap_or(1);
    let mut tables: Vec<TableInfo> = result.rows.iter().filter_map(|r| {
        let name = r.get(name_idx)?.as_str()?.to_string();
        let ty = r.get(type_idx).and_then(|v| v.as_str()).unwrap_or("table");
        let kind = if ty == "view" { "view".to_string() } else { "table".to_string() };
        Some(TableInfo { name, kind, row_count: -1, rls_enabled: None })
    }).collect();

    // Batch counts into one round-trip per chunk (each libsql query is a remote
    // HTTP request), with a per-table fallback if a batch fails.
    let count_idx: Vec<usize> = tables
        .iter()
        .enumerate()
        .filter(|(_, t)| t.kind != "view")
        .map(|(i, _)| i)
        .collect();
    for chunk in count_idx.chunks(SQLITE_COUNT_BATCH) {
        let sql = chunk
            .iter()
            .map(|&i| format!("SELECT COUNT(*) FROM \"{}\"", tables[i].name.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" UNION ALL ");
        match super::libsql::query(cfg, &sql, vec![]).await {
            Ok(res) if res.rows.len() == chunk.len() => {
                for (&i, row) in chunk.iter().zip(res.rows.iter()) {
                    tables[i].row_count = row.first().and_then(|v| v.as_i64()).unwrap_or(0);
                }
            }
            _ => {
                for &i in chunk {
                    let one = format!("SELECT COUNT(*) FROM \"{}\"", tables[i].name.replace('"', "\"\""));
                    if let Ok(res) = super::libsql::query(cfg, &one, vec![]).await {
                        if let Some(row) = res.rows.first() {
                            tables[i].row_count = row.first().and_then(|v| v.as_i64()).unwrap_or(0);
                        }
                    }
                }
            }
        }
    }
    for t in tables.iter_mut() {
        if t.row_count < 0 {
            t.row_count = 0;
        }
    }
    Ok(tables)
}

async fn list_indexes_libsql(cfg: &super::connection::LibSqlConfig) -> Result<Vec<IndexInfo>, String> {
    let result = super::libsql::query(
        cfg,
        "SELECT name, tbl_name, COALESCE(sql,'') FROM sqlite_master WHERE type='index' ORDER BY tbl_name, name",
        vec![],
    ).await?;
    let name_idx = result.columns.iter().position(|c| c.name == "name").unwrap_or(0);
    let tbl_idx  = result.columns.iter().position(|c| c.name == "tbl_name").unwrap_or(1);
    let sql_idx  = result.columns.iter().position(|c| c.name == "sql").unwrap_or(2);
    Ok(result.rows.iter().filter_map(|r| {
        let name = r.get(name_idx)?.as_str()?.to_string();
        let table_name = r.get(tbl_idx)?.as_str()?.to_string();
        let sql = r.get(sql_idx).and_then(|v| v.as_str()).unwrap_or("").to_uppercase();
        let is_unique = sql.contains("UNIQUE");
        let is_primary = name.starts_with("sqlite_autoindex_");
        Some(IndexInfo { name, table_name, columns: String::new(), index_type: "btree".to_string(), is_unique, is_primary, condition: None, comment: None })
    }).collect())
}

// ── MySQL ─────────────────────────────────────────────────────────────────────

async fn list_schemas_mysql(pool: &MySqlPool) -> Result<Vec<String>, String> {
    let row = sqlx::query("SELECT DATABASE()")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to get database: {e}"))?;
    let db: Option<String> = row.try_get(0).unwrap_or(None);
    Ok(vec![db.unwrap_or_else(|| "default".to_string())])
}

async fn mysql_exact_row_count(pool: &MySqlPool, schema: &str, table: &str) -> Result<i64, String> {
    let q = |id: &str| format!("`{}`", id.replace('`', "``"));
    let sql = format!("SELECT COUNT(*) FROM {}.{}", q(schema), q(table));
    sqlx::query_scalar::<_, i64>(&sql)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to count rows for {table}: {e}"))
}

async fn list_tables_mysql(pool: &MySqlPool, schema: &str) -> Result<Vec<TableInfo>, String> {
    let rows = sqlx::query(
        "SELECT TABLE_NAME, TABLE_TYPE, COALESCE(TABLE_ROWS, 0) \
         FROM information_schema.TABLES \
         WHERE TABLE_SCHEMA = ? \
         ORDER BY TABLE_NAME",
    )
    .bind(schema)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list tables: {e}"))?;

    let mut tables: Vec<TableInfo> = rows
        .iter()
        .filter_map(|r| {
            let name: String = r.try_get(0).ok()?;
            let ty: String = r.try_get(1).unwrap_or_else(|_| "BASE TABLE".to_string());
            // TABLE_ROWS is BIGINT UNSIGNED. COALESCE makes it non-nullable so
            // decode as u64 directly; Option<u64> can silently fail on non-null columns.
            // For InnoDB this is only an estimate and is frequently 0 (or far off)
            // until ANALYZE TABLE runs — so a 0 estimate is treated as unknown (-1)
            // and resolved with an exact COUNT(*) below.
            let est: i64 = r.try_get::<u64, _>(2).unwrap_or(0) as i64;
            let kind = if ty == "VIEW" { "view" } else { "table" }.to_string();
            let row_count = if est > 0 { est } else { -1 };
            Some(TableInfo { name, kind, row_count, rls_enabled: None })
        })
        .collect();

    // Views report 0 immediately; base tables with no usable estimate keep -1
    // (unknown) and are resolved lazily via `table_row_counts` — see the
    // PostgreSQL path above.
    for t in tables.iter_mut() {
        if t.row_count < 0 && t.kind == "view" {
            t.row_count = 0;
        }
    }
    Ok(tables)
}

async fn list_indexes_mysql(pool: &MySqlPool, schema: &str) -> Result<Vec<IndexInfo>, String> {
    let rows = sqlx::query(
        "SELECT INDEX_NAME, TABLE_NAME, \
                GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ', ') AS columns, \
                MIN(INDEX_TYPE) AS index_type, \
                MIN(NON_UNIQUE) AS non_unique, \
                MAX(IF(INDEX_NAME = 'PRIMARY', 1, 0)) AS is_primary \
         FROM information_schema.STATISTICS \
         WHERE TABLE_SCHEMA = ? \
         GROUP BY INDEX_NAME, TABLE_NAME \
         ORDER BY TABLE_NAME, MAX(IF(INDEX_NAME = 'PRIMARY', 1, 0)) DESC, INDEX_NAME",
    )
    .bind(schema)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list indexes: {e}"))?;

    Ok(rows
        .iter()
        .filter_map(|r| {
            let name: String = r.try_get(0).ok()?;
            let table_name: String = r.try_get(1).ok()?;
            let columns: String = r.try_get::<Option<String>, _>(2).ok().flatten().unwrap_or_default();
            let index_type: String = r.try_get::<Option<String>, _>(3).ok().flatten().unwrap_or_else(|| "BTREE".to_string());
            let non_unique: i64 = r.try_get::<Option<i64>, _>(4).ok().flatten().unwrap_or(1);
            let is_primary_i: i64 = r.try_get::<Option<i64>, _>(5).ok().flatten().unwrap_or(0);
            Some(IndexInfo {
                name,
                table_name,
                columns,
                index_type: index_type.to_lowercase(),
                is_unique: non_unique == 0,
                is_primary: is_primary_i != 0,
                condition: None,
                comment: None,
            })
        })
        .collect())
}

// ── Enums (PostgreSQL only) ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnumInfo {
    pub name: String,
    pub values: Vec<String>,
    /// Tables in the same schema that have a column using this enum type.
    pub used_in_tables: Vec<String>,
}

// ── Triggers (PostgreSQL only) ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerInfo {
    pub name: String,
    pub table_name: String,
    /// "BEFORE" | "AFTER" | "INSTEAD OF"
    pub timing: String,
    /// e.g. "INSERT, UPDATE"
    pub events: String,
    pub function_name: String,
    pub enabled: bool,
}

// ── Functions / Procedures (PostgreSQL only) ─────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionInfo {
    pub name: String,
    /// Full call signature e.g. "fn(arg1 text, arg2 int)"
    pub signature: String,
    pub return_type: String,
    /// "function" | "procedure" | "aggregate"
    pub kind: String,
}

// ── Sequences (PostgreSQL only) ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SequenceInfo {
    pub name: String,
    pub data_type: String,
    pub start_value: i64,
    pub min_value: i64,
    pub max_value: i64,
    pub increment: i64,
    pub cycle: bool,
    /// "table.column" when owned by a serial/identity column, None otherwise
    pub owned_by: Option<String>,
}

async fn list_enums_pg(pool: &PgPool, schema: &str) -> Result<Vec<EnumInfo>, String> {
    let rows = sqlx::query(
        r#"
        -- Values and used-in-tables are computed as independent subqueries so the
        -- column join can't fan out (multiply) the enum labels. A previous version
        -- joined information_schema.columns and array_agg'd labels without DISTINCT,
        -- so an enum used in N columns produced each label N times.
        SELECT t.typname::text AS name,
               (
                 SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
                 FROM pg_catalog.pg_enum e
                 WHERE e.enumtypid = t.oid
               ) AS values,
               COALESCE(
                 (
                   SELECT array_agg(DISTINCT c.table_name::text)
                   FROM information_schema.columns c
                   WHERE c.udt_schema = n.nspname
                     AND c.udt_name   = t.typname
                     AND c.table_schema = n.nspname
                     AND c.table_name IS NOT NULL
                 ),
                 ARRAY[]::text[]
               ) AS used_in_tables
        FROM pg_catalog.pg_type t
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = $1
          AND t.typtype = 'e'
        ORDER BY t.typname
        "#,
    )
    .bind(schema)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list enums: {e}"))?;

    rows.iter()
        .map(|row| {
            let name: String = row.try_get("name").map_err(|e| e.to_string())?;
            let values: Vec<String> = row.try_get("values").map_err(|e| e.to_string())?;
            let used_in_tables: Vec<String> = row.try_get("used_in_tables").map_err(|e| e.to_string())?;
            Ok(EnumInfo { name, values, used_in_tables })
        })
        .collect()
}

async fn list_triggers_pg(pool: &PgPool, schema: &str) -> Result<Vec<TriggerInfo>, String> {
    let rows = sqlx::query(r#"
        SELECT
            t.tgname::text,
            c.relname::text,
            CASE
                WHEN (t.tgtype::integer & 64) = 64 THEN 'INSTEAD OF'
                WHEN (t.tgtype::integer & 2)  = 2  THEN 'BEFORE'
                ELSE 'AFTER'
            END,
            array_to_string(
                array_remove(ARRAY[
                    CASE WHEN (t.tgtype::integer & 4)  = 4  THEN 'INSERT'   ELSE NULL END,
                    CASE WHEN (t.tgtype::integer & 8)  = 8  THEN 'DELETE'   ELSE NULL END,
                    CASE WHEN (t.tgtype::integer & 16) = 16 THEN 'UPDATE'   ELSE NULL END,
                    CASE WHEN (t.tgtype::integer & 32) = 32 THEN 'TRUNCATE' ELSE NULL END
                ], NULL),
                ', '
            ),
            p.proname::text,
            (t.tgenabled::text != 'D')
        FROM pg_catalog.pg_trigger t
        JOIN pg_catalog.pg_class c     ON c.oid = t.tgrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_catalog.pg_proc p      ON p.oid = t.tgfoid
        WHERE n.nspname = $1
          AND NOT t.tgisinternal
        ORDER BY c.relname, t.tgname
    "#)
    .bind(schema)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list triggers: {e}"))?;

    Ok(rows
        .iter()
        .filter_map(|r| {
            Some(TriggerInfo {
                name:          r.try_get::<String, _>(0).ok()?,
                table_name:    r.try_get::<String, _>(1).ok()?,
                timing:        r.try_get::<String, _>(2).unwrap_or_else(|_| "AFTER".to_string()),
                events:        r.try_get::<String, _>(3).unwrap_or_default(),
                function_name: r.try_get::<String, _>(4).unwrap_or_default(),
                enabled:       r.try_get::<bool, _>(5).unwrap_or(true),
            })
        })
        .collect())
}

async fn list_triggers_mysql(pool: &sqlx::MySqlPool, schema: &str) -> Result<Vec<TriggerInfo>, String> {
    // MySQL triggers are single-event and single-timing; the action body is
    // inline (no named function) and there is no per-trigger enable flag.
    let rows = sqlx::query(
        r#"SELECT TRIGGER_NAME       AS name,
                  EVENT_OBJECT_TABLE AS table_name,
                  ACTION_TIMING      AS timing,
                  EVENT_MANIPULATION AS events
           FROM information_schema.TRIGGERS
           WHERE TRIGGER_SCHEMA = ?
           ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME"#,
    )
    .bind(schema)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list triggers: {e}"))?;

    Ok(rows
        .iter()
        .filter_map(|r| {
            Some(TriggerInfo {
                name:          r.try_get::<String, _>("name").ok()?,
                table_name:    r.try_get::<String, _>("table_name").unwrap_or_default(),
                timing:        r.try_get::<String, _>("timing").unwrap_or_else(|_| "AFTER".to_string()),
                events:        r.try_get::<String, _>("events").unwrap_or_default(),
                function_name: String::new(),
                enabled:       true,
            })
        })
        .collect())
}

async fn list_triggers_sqlite(pool: &sqlx::SqlitePool) -> Result<Vec<TriggerInfo>, String> {
    // SQLite keeps triggers in sqlite_master; timing/event aren't broken out into
    // columns, so parse them out of the stored `CREATE TRIGGER` DDL.
    let rows = sqlx::query(
        r#"SELECT name, tbl_name, COALESCE(sql, '') AS sql
           FROM sqlite_master
           WHERE type = 'trigger'
           ORDER BY tbl_name, name"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list triggers: {e}"))?;

    Ok(rows
        .iter()
        .filter_map(|r| {
            let name: String = r.try_get("name").ok()?;
            let table_name: String = r.try_get("tbl_name").unwrap_or_default();
            let ddl: String = r.try_get::<String, _>("sql").unwrap_or_default().to_uppercase();
            let timing = if ddl.contains("INSTEAD OF") {
                "INSTEAD OF"
            } else if ddl.contains("BEFORE") {
                "BEFORE"
            } else {
                "AFTER"
            };
            let events = ["INSERT", "UPDATE", "DELETE"]
                .iter()
                .filter(|ev| ddl.contains(**ev))
                .copied()
                .collect::<Vec<_>>()
                .join(", ");
            Some(TriggerInfo {
                name,
                table_name,
                timing: timing.to_string(),
                events,
                function_name: String::new(),
                enabled: true,
            })
        })
        .collect())
}

async fn list_sequences_pg(pool: &PgPool, schema: &str) -> Result<Vec<SequenceInfo>, String> {
    let rows = sqlx::query(r#"
        SELECT
            s.sequence_name::text,
            s.data_type::text,
            s.start_value::bigint,
            s.minimum_value::bigint,
            s.maximum_value::bigint,
            s.increment::bigint,
            (s.cycle_option = 'YES')::boolean,
            (
                SELECT dep_rel.relname::text || '.' || dep_att.attname::text
                FROM pg_catalog.pg_class seq_cls
                JOIN pg_catalog.pg_depend d
                    ON d.objid = seq_cls.oid AND d.deptype = 'a'
                JOIN pg_catalog.pg_class dep_rel
                    ON dep_rel.oid = d.refobjid
                JOIN pg_catalog.pg_attribute dep_att
                    ON dep_att.attrelid = d.refobjid AND dep_att.attnum = d.refobjsubid
                WHERE seq_cls.relname = s.sequence_name
                  AND seq_cls.relkind = 'S'
                  AND seq_cls.relnamespace = (
                      SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = $1
                  )
                LIMIT 1
            )
        FROM information_schema.sequences s
        WHERE s.sequence_schema = $1
        ORDER BY s.sequence_name
    "#)
    .bind(schema)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list sequences: {e}"))?;

    Ok(rows
        .iter()
        .filter_map(|r| {
            Some(SequenceInfo {
                name:        r.try_get::<String, _>(0).ok()?,
                data_type:   r.try_get::<String, _>(1).unwrap_or_else(|_| "bigint".to_string()),
                start_value: r.try_get::<i64, _>(2).unwrap_or(1),
                min_value:   r.try_get::<i64, _>(3).unwrap_or(1),
                max_value:   r.try_get::<i64, _>(4).unwrap_or(i64::MAX),
                increment:   r.try_get::<i64, _>(5).unwrap_or(1),
                cycle:       r.try_get::<bool, _>(6).unwrap_or(false),
                owned_by:    r.try_get::<Option<String>, _>(7).ok().flatten(),
            })
        })
        .collect())
}

// ── Public dispatch ───────────────────────────────────────────────────────────

pub async fn list_schemas(state: State<'_, DbState>) -> Result<Vec<String>, String> {
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => list_schemas_pg(&pool).await,
        ActiveConnection::Mysql(pool) => list_schemas_mysql(&pool).await,
        ActiveConnection::Clickhouse(cfg) => Ok(vec![cfg.database.clone()]),
        ActiveConnection::Redis(_) => Ok(vec![]),
        ActiveConnection::Mssql(h) => super::mssql::list_schemas(&h).await,
        ActiveConnection::Sqlite(_) | ActiveConnection::D1(_) | ActiveConnection::LibSql(_) | ActiveConnection::Duckdb(_) => Ok(vec!["main".to_string()]),
    }
}

pub async fn list_tables(state: State<'_, DbState>, schema: String) -> Result<Vec<TableInfo>, String> {
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => {
            validate_ident(&schema)?;
            list_tables_pg(&pool, &schema).await
        }
        ActiveConnection::Mysql(pool) => list_tables_mysql(&pool, &schema).await,
        ActiveConnection::Sqlite(pool) => list_tables_sqlite(&pool).await,
        ActiveConnection::D1(cfg) => list_tables_d1(&cfg).await,
        ActiveConnection::LibSql(cfg) => list_tables_libsql(&cfg).await,
        ActiveConnection::Clickhouse(cfg) => super::clickhouse::list_tables(&cfg).await,
        ActiveConnection::Redis(cfg) => super::redis::list_tables(&cfg).await,
        ActiveConnection::Duckdb(h) => super::duckdb::list_tables(&h).await,
        ActiveConnection::Mssql(h) => super::mssql::list_tables(&h, &schema).await,
    }
}

pub async fn list_indexes(state: State<'_, DbState>, schema: String) -> Result<Vec<IndexInfo>, String> {
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => {
            validate_ident(&schema)?;
            list_indexes_pg(&pool, &schema).await
        }
        ActiveConnection::Mysql(pool) => list_indexes_mysql(&pool, &schema).await,
        ActiveConnection::Sqlite(pool) => list_indexes_sqlite(&pool).await,
        ActiveConnection::D1(cfg) => list_indexes_d1(&cfg).await,
        ActiveConnection::LibSql(cfg) => list_indexes_libsql(&cfg).await,
        ActiveConnection::Clickhouse(cfg) => super::clickhouse::list_indexes(&cfg).await,
        ActiveConnection::Redis(cfg) => super::redis::list_indexes(&cfg).await,
        ActiveConnection::Duckdb(h) => super::duckdb::list_indexes(&h).await,
        ActiveConnection::Mssql(h) => super::mssql::list_indexes(&h, &schema).await,
    }
}

async fn list_functions_pg(pool: &PgPool, schema: &str) -> Result<Vec<FunctionInfo>, String> {
    let rows = sqlx::query(
        r#"
        SELECT DISTINCT ON (p.proname)
               p.proname::text AS name,
               pg_get_function_arguments(p.oid) AS arg_types,
               COALESCE(pg_get_function_result(p.oid), 'void') AS return_type,
               CASE p.prokind
                   WHEN 'f' THEN 'function'
                   WHEN 'p' THEN 'procedure'
                   WHEN 'a' THEN 'aggregate'
                   ELSE 'function'
               END AS kind
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = $1
          AND p.prokind IN ('f', 'p', 'a')
        ORDER BY p.proname
        "#,
    )
    .bind(schema)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list functions: {e}"))?;

    rows.iter()
        .map(|row| {
            let name: String = row.try_get("name").map_err(|e| e.to_string())?;
            let arg_types: String = row.try_get("arg_types").map_err(|e| e.to_string())?;
            let return_type: String = row.try_get("return_type").map_err(|e| e.to_string())?;
            let kind: String = row.try_get("kind").map_err(|e| e.to_string())?;
            Ok(FunctionInfo {
                signature: format!("{}({})", name, arg_types),
                name,
                return_type,
                kind,
            })
        })
        .collect()
}

async fn list_functions_mysql(pool: &sqlx::MySqlPool, schema: &str) -> Result<Vec<FunctionInfo>, String> {
    let rows = sqlx::query(
        r#"SELECT ROUTINE_NAME AS name, DTD_IDENTIFIER AS return_type, ROUTINE_TYPE AS routine_type
           FROM information_schema.ROUTINES
           WHERE ROUTINE_SCHEMA = ?
           ORDER BY ROUTINE_NAME"#,
    )
    .bind(schema)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list functions: {e}"))?;

    rows.iter()
        .map(|row| {
            let name: String = row.try_get("name").map_err(|e| e.to_string())?;
            let return_type: Option<String> = row.try_get("return_type").map_err(|e| e.to_string())?;
            let routine_type: String = row.try_get("routine_type").map_err(|e| e.to_string())?;
            Ok(FunctionInfo {
                signature: format!("{name}()"),
                name,
                return_type: return_type.unwrap_or_default(),
                kind: routine_type.to_lowercase(),
            })
        })
        .collect()
}

pub async fn list_functions(state: State<'_, DbState>, schema: String) -> Result<Vec<FunctionInfo>, String> {
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => {
            validate_ident(&schema)?;
            list_functions_pg(&pool, &schema).await
        }
        ActiveConnection::Mysql(pool) => {
            validate_ident(&schema)?;
            list_functions_mysql(&pool, &schema).await
        }
        _ => Ok(vec![]),
    }
}

pub async fn list_enums(state: State<'_, DbState>, schema: String) -> Result<Vec<EnumInfo>, String> {
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => {
            validate_ident(&schema)?;
            list_enums_pg(&pool, &schema).await
        }
        _ => Ok(vec![]),
    }
}

pub async fn list_triggers(state: State<'_, DbState>, schema: String) -> Result<Vec<TriggerInfo>, String> {
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => {
            validate_ident(&schema)?;
            list_triggers_pg(&pool, &schema).await
        }
        ActiveConnection::Mysql(pool) => {
            validate_ident(&schema)?;
            list_triggers_mysql(&pool, &schema).await
        }
        ActiveConnection::Sqlite(pool) => list_triggers_sqlite(&pool).await,
        _ => Ok(vec![]),
    }
}

pub async fn list_sequences(state: State<'_, DbState>, schema: String) -> Result<Vec<SequenceInfo>, String> {
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => {
            validate_ident(&schema)?;
            list_sequences_pg(&pool, &schema).await
        }
        // Sequences are a PostgreSQL concept. MySQL uses AUTO_INCREMENT and SQLite
        // uses sqlite_sequence rowids — neither exposes first-class sequence objects,
        // so there is nothing to list for those engines (documented N/A per todo P2.12).
        _ => Ok(vec![]),
    }
}

pub async fn truncate_table(state: State<'_, DbState>, schema: String, table: String) -> Result<(), String> {
    validate_ident(&schema)?;
    validate_ident(&table)?;
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => {
            let sql = format!(r#"TRUNCATE TABLE "{schema}"."{table}""#);
            sqlx::query(&sql).execute(&pool).await
                .map_err(|e| format!("Failed to truncate table: {e}"))?;
        }
        ActiveConnection::Sqlite(pool) => {
            let sql = format!(r#"DELETE FROM "{table}""#);
            sqlx::query(&sql).execute(&pool).await
                .map_err(|e| format!("Failed to truncate table: {e}"))?;
        }
        _ => return Err("TRUNCATE not supported for this database type".to_string()),
    }
    Ok(())
}

pub async fn drop_table(state: State<'_, DbState>, schema: String, table: String, cascade: bool) -> Result<(), String> {
    validate_ident(&schema)?;
    validate_ident(&table)?;
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => {
            let cascade_clause = if cascade { " CASCADE" } else { "" };
            let sql = format!(r#"DROP TABLE "{schema}"."{table}"{cascade_clause}"#);
            sqlx::query(&sql).execute(&pool).await
                .map_err(|e| format!("Failed to drop table: {e}"))?;
        }
        ActiveConnection::Sqlite(pool) => {
            let sql = format!(r#"DROP TABLE "{table}""#);
            sqlx::query(&sql).execute(&pool).await
                .map_err(|e| format!("Failed to drop table: {e}"))?;
        }
        _ => return Err("DROP TABLE not supported for this database type".to_string()),
    }
    Ok(())
}

pub async fn get_table_column_structure(
    state: State<'_, DbState>,
    schema: String,
    table: String,
) -> Result<Vec<ColumnStructureRow>, String> {
    validate_ident(&schema)?;
    validate_ident(&table)?;
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => {
            get_column_structure_pg(&pool, &schema, &table).await
        }
        ActiveConnection::Mysql(pool) => {
            get_column_structure_mysql(&pool, &schema, &table).await
        }
        ActiveConnection::Sqlite(pool) => {
            get_column_structure_sqlite(&pool, &table).await
        }
        ActiveConnection::D1(cfg) => {
            get_column_structure_d1(&cfg, &table).await
        }
        ActiveConnection::LibSql(cfg) => {
            get_column_structure_libsql(&cfg, &table).await
        }
        ActiveConnection::Clickhouse(cfg) => {
            super::clickhouse::get_column_structure(&cfg, &table).await
        }
        ActiveConnection::Redis(cfg) => {
            super::redis::get_column_structure(&cfg, &table).await
        }
        ActiveConnection::Duckdb(h) => {
            super::duckdb::get_column_structure(&h, &table).await
        }
        ActiveConnection::Mssql(h) => {
            super::mssql::get_column_structure(&h, &schema, &table).await
        }
    }
}

async fn get_column_structure_sqlite(
    pool: &sqlx::SqlitePool,
    table: &str,
) -> Result<Vec<ColumnStructureRow>, String> {
    use std::collections::HashMap;
    let tq = format!("\"{}\"", table.replace('"', "\"\""));

    // cid, name, type, notnull, dflt_value, pk
    let info_rows = sqlx::query(&format!("PRAGMA table_info({tq})"))
        .fetch_all(pool)
        .await
        .map_err(|e| format!("PRAGMA table_info failed: {e}"))?;

    // id, seq, table, from, to, on_update, on_delete, match
    let fk_rows = sqlx::query(&format!("PRAGMA foreign_key_list({tq})"))
        .fetch_all(pool)
        .await
        .unwrap_or_default();

    let mut fk_map: HashMap<String, String> = Default::default();
    for r in &fk_rows {
        let from_col: String = r.try_get::<Option<String>, _>(3).ok().flatten().unwrap_or_default();
        let ref_table: String = r.try_get::<Option<String>, _>(2).ok().flatten().unwrap_or_default();
        let to_col: String = r.try_get::<Option<String>, _>(4).ok().flatten().unwrap_or_default();
        if !from_col.is_empty() {
            fk_map.insert(from_col, format!("main.{ref_table}.{to_col}"));
        }
    }

    Ok(info_rows.iter().filter_map(|r| {
        let cid: i64 = r.try_get::<Option<i64>, _>(0).ok().flatten().unwrap_or(0);
        let name: String = r.try_get::<Option<String>, _>(1).ok().flatten()?;
        let data_type = r.try_get::<Option<String>, _>(2).ok().flatten().unwrap_or_default().to_lowercase();
        let notnull: i64 = r.try_get::<Option<i64>, _>(3).ok().flatten().unwrap_or(0);
        let column_default: Option<String> = r.try_get::<Option<String>, _>(4).ok().flatten();
        let foreign_key = fk_map.get(&name).cloned();
        Some(ColumnStructureRow {
            ordinal_position: (cid + 1) as i32,
            name: name.clone(),
            data_type,
            is_nullable: notnull == 0,
            column_default,
            foreign_key,
            fk_constraint_name: None,
            comment: None,
        })
    }).collect())
}

async fn get_column_structure_mysql(
    pool: &MySqlPool,
    schema: &str,
    table: &str,
) -> Result<Vec<ColumnStructureRow>, String> {
    use std::collections::HashMap;

    let col_rows = sqlx::query(
        "SELECT ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT \
         FROM information_schema.COLUMNS \
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? \
         ORDER BY ORDINAL_POSITION",
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to get column info: {e}"))?;

    let fk_rows = sqlx::query(
        "SELECT kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_SCHEMA, \
                kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME, kcu.CONSTRAINT_NAME \
         FROM information_schema.KEY_COLUMN_USAGE kcu \
         JOIN information_schema.REFERENTIAL_CONSTRAINTS rc \
           ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME \
          AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA \
         WHERE kcu.TABLE_SCHEMA = ? AND kcu.TABLE_NAME = ? \
           AND kcu.REFERENCED_TABLE_NAME IS NOT NULL \
         ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION",
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let mut fk_map: HashMap<String, (String, String)> = Default::default();
    for row in &fk_rows {
        let col: String = row.try_get(0).unwrap_or_default();
        let ref_schema: String = row.try_get(1).unwrap_or_default();
        let ref_table: String = row.try_get(2).unwrap_or_default();
        let ref_col: String = row.try_get(3).unwrap_or_default();
        let constraint: String = row.try_get(4).unwrap_or_default();
        fk_map.insert(col, (format!("{ref_schema}.{ref_table}.{ref_col}"), constraint));
    }

    Ok(col_rows.iter().filter_map(|r| {
        let ordinal: i32 = r.try_get::<u32, _>(0).unwrap_or(0) as i32;
        let name: String = r.try_get(1).ok()?;
        let data_type: String = r.try_get::<String, _>(2).unwrap_or_default().to_lowercase();
        let is_nullable_str: String = r.try_get(3).unwrap_or_else(|_| "YES".to_string());
        let column_default: Option<String> = r.try_get::<Option<String>, _>(4).ok().flatten();
        let (foreign_key, fk_constraint_name) = fk_map
            .get(&name)
            .map(|(fk, cn)| (Some(fk.clone()), Some(cn.clone())))
            .unwrap_or((None, None));
        Some(ColumnStructureRow {
            ordinal_position: ordinal,
            name: name.clone(),
            data_type,
            is_nullable: is_nullable_str.eq_ignore_ascii_case("YES"),
            column_default,
            foreign_key,
            fk_constraint_name,
            comment: None,
        })
    }).collect())
}

/// Shared SQLite-pragma-based column structure for D1 and LibSQL (both SQLite-compatible).
/// `fk_prefix` is the schema name to use in the "schema.table.col" FK string (e.g. "main").
fn parse_column_structure_from_pragma_results(
    info_rows: Vec<Vec<serde_json::Value>>,
    fk_rows: Vec<Vec<serde_json::Value>>,
    fk_prefix: &str,
) -> Vec<ColumnStructureRow> {
    use std::collections::HashMap;
    let mut fk_map: HashMap<String, String> = Default::default();
    for r in &fk_rows {
        // PRAGMA foreign_key_list: id(0), seq(1), table(2), from(3), to(4)
        let from_col = r.get(3).and_then(|v| v.as_str()).unwrap_or("").to_string();
        let ref_table = r.get(2).and_then(|v| v.as_str()).unwrap_or("").to_string();
        let to_col = r.get(4).and_then(|v| v.as_str()).unwrap_or("").to_string();
        if !from_col.is_empty() {
            fk_map.insert(from_col, format!("{fk_prefix}.{ref_table}.{to_col}"));
        }
    }

    info_rows.iter().filter_map(|r| {
        // PRAGMA table_info: cid(0), name(1), type(2), notnull(3), dflt_value(4), pk(5)
        let cid = r.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
        let name = r.get(1)?.as_str()?.to_string();
        let data_type = r.get(2).and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
        let notnull = r.get(3).and_then(|v| v.as_i64()).unwrap_or(0);
        let column_default = r.get(4).and_then(|v| v.as_str()).map(|s| s.to_string());
        let foreign_key = fk_map.get(&name).cloned();
        Some(ColumnStructureRow {
            ordinal_position: (cid + 1) as i32,
            name: name.clone(),
            data_type,
            is_nullable: notnull == 0,
            column_default,
            foreign_key,
            fk_constraint_name: None,
            comment: None,
        })
    }).collect()
}

async fn get_column_structure_d1(
    cfg: &super::connection::D1Config,
    table: &str,
) -> Result<Vec<ColumnStructureRow>, String> {
    let tq = format!("\"{}\"", table.replace('"', "\"\""));

    let info_rows = super::d1::query(cfg, &format!("PRAGMA table_info({tq})"), vec![])
        .await
        .map(|r| r.rows)
        .map_err(|e| format!("PRAGMA table_info failed: {e}"))?;
    let fk_rows = super::d1::query(cfg, &format!("PRAGMA foreign_key_list({tq})"), vec![])
        .await
        .map(|r| r.rows)
        .unwrap_or_default();

    Ok(parse_column_structure_from_pragma_results(info_rows, fk_rows, "main"))
}

async fn get_column_structure_libsql(
    cfg: &super::connection::LibSqlConfig,
    table: &str,
) -> Result<Vec<ColumnStructureRow>, String> {
    let tq = format!("\"{}\"", table.replace('"', "\"\""));

    let info_rows = super::libsql::query(cfg, &format!("PRAGMA table_info({tq})"), vec![])
        .await
        .map(|r| r.rows)
        .map_err(|e| format!("PRAGMA table_info failed: {e}"))?;
    let fk_rows = super::libsql::query(cfg, &format!("PRAGMA foreign_key_list({tq})"), vec![])
        .await
        .map(|r| r.rows)
        .unwrap_or_default();

    Ok(parse_column_structure_from_pragma_results(info_rows, fk_rows, "main"))
}

async fn get_column_structure_pg(
    pool: &PgPool,
    schema: &str,
    table: &str,
) -> Result<Vec<ColumnStructureRow>, String> {
    // pg_catalog.pg_attribute is 10-100x faster than information_schema.columns on hosted
    // PostgreSQL (Supabase, RDS, etc.). FK lookups use OID-based matching; comments use
    // the built-in col_description() index function.
    let rows = sqlx::query(r#"
        SELECT
            a.attnum::int,
            a.attname::text,
            CASE
                WHEN t.typtype = 'b' AND t.typelem <> 0 AND t.typname LIKE '\_%'
                    THEN (SELECT bt.typname FROM pg_catalog.pg_type bt WHERE bt.oid = t.typelem) || '[]'
                WHEN a.atttypmod > 0 AND t.typname IN ('varchar','bpchar')
                    THEN t.typname || '(' || (a.atttypmod - 4)::text || ')'
                WHEN a.atttypmod > 0 AND t.typname = 'numeric' AND a.atttypmod <> -1
                    THEN 'numeric(' || (((a.atttypmod - 4) >> 16) & 65535)::text
                        || ',' || ((a.atttypmod - 4) & 65535)::text || ')'
                WHEN a.atttypmod > 0 AND t.typname IN ('bit','varbit')
                    THEN t.typname || '(' || a.atttypmod::text || ')'
                ELSE t.typname
            END,
            NOT a.attnotnull,
            pg_get_expr(ad.adbin, ad.adrelid),
            (
                SELECT rns.nspname || '.' || rt.relname || '.' || ra.attname
                FROM pg_catalog.pg_constraint pc
                JOIN pg_catalog.pg_class rt ON rt.oid = pc.confrelid
                JOIN pg_catalog.pg_namespace rns ON rns.oid = rt.relnamespace
                JOIN pg_catalog.pg_attribute ra ON ra.attrelid = rt.oid AND ra.attnum = pc.confkey[1]
                WHERE pc.contype = 'f'
                  AND pc.conrelid = a.attrelid
                  AND pc.conkey[1] = a.attnum
                LIMIT 1
            ),
            (
                SELECT pc.conname
                FROM pg_catalog.pg_constraint pc
                WHERE pc.contype = 'f'
                  AND pc.conrelid = a.attrelid
                  AND pc.conkey[1] = a.attnum
                LIMIT 1
            ),
            col_description(a.attrelid, a.attnum)
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
        LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
        WHERE n.nspname = $1 AND c.relname = $2
          AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum
    "#)
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Column structure query failed: {e}"))?;

    let result = rows
        .iter()
        .map(|r| {
            let ordinal: i32 = r.try_get(0).unwrap_or(0);
            let name: String = r.try_get(1).unwrap_or_default();
            let data_type: String = r.try_get(2).unwrap_or_default();
            let is_nullable: bool = r.try_get(3).unwrap_or(true);
            let column_default: Option<String> = r.try_get(4).ok().flatten();
            let foreign_key: Option<String> = r.try_get(5).ok().flatten();
            let fk_constraint_name: Option<String> = r.try_get(6).ok().flatten();
            let comment: Option<String> = r.try_get(7).ok().flatten();
            ColumnStructureRow { ordinal_position: ordinal, name, data_type, is_nullable, column_default, foreign_key, fk_constraint_name, comment }
        })
        .collect();

    Ok(result)
}

// ── Incoming foreign keys (reverse / one-to-many relationships) ───────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingForeignKey {
    pub from_schema: String,
    pub from_table: String,
    pub from_columns: Vec<String>,
    pub to_columns: Vec<String>,
    pub constraint_name: String,
}

async fn get_incoming_fks_pg(pool: &PgPool, schema: &str, table: &str) -> Result<Vec<IncomingForeignKey>, String> {
    let rows = sqlx::query(r#"
        SELECT
            fn.nspname::text,
            fc.relname::text,
            ARRAY(SELECT a.attname::text FROM pg_catalog.pg_attribute a
                  WHERE a.attrelid = pc.conrelid AND a.attnum = ANY(pc.conkey)
                  ORDER BY array_position(pc.conkey, a.attnum))::text[],
            ARRAY(SELECT a.attname::text FROM pg_catalog.pg_attribute a
                  WHERE a.attrelid = pc.confrelid AND a.attnum = ANY(pc.confkey)
                  ORDER BY array_position(pc.confkey, a.attnum))::text[],
            pc.conname::text
        FROM pg_catalog.pg_constraint pc
        JOIN pg_catalog.pg_class       fc  ON fc.oid = pc.conrelid
        JOIN pg_catalog.pg_namespace   fn  ON fn.oid = fc.relnamespace
        JOIN pg_catalog.pg_class       tc  ON tc.oid = pc.confrelid
        JOIN pg_catalog.pg_namespace   tn  ON tn.oid = tc.relnamespace
        WHERE pc.contype = 'f'
          AND tn.nspname = $1
          AND tc.relname = $2
        ORDER BY fn.nspname, fc.relname, pc.conname
    "#)
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Incoming FK query failed: {e}"))?;

    Ok(rows.iter().filter_map(|r| Some(IncomingForeignKey {
        from_schema:     r.try_get(0).ok()?,
        from_table:      r.try_get(1).ok()?,
        from_columns:    r.try_get(2).unwrap_or_default(),
        to_columns:      r.try_get(3).unwrap_or_default(),
        constraint_name: r.try_get(4).unwrap_or_default(),
    })).collect())
}

async fn get_incoming_fks_mysql(pool: &MySqlPool, schema: &str, table: &str) -> Result<Vec<IncomingForeignKey>, String> {
    let rows = sqlx::query(r#"
        SELECT kcu.table_schema, kcu.table_name, kcu.column_name,
               kcu.referenced_column_name, kcu.constraint_name
        FROM information_schema.key_column_usage kcu
        JOIN information_schema.table_constraints tc
            ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema    = kcu.table_schema
           AND tc.table_name      = kcu.table_name
        WHERE tc.constraint_type          = 'FOREIGN KEY'
          AND kcu.referenced_table_schema = ?
          AND kcu.referenced_table_name   = ?
        ORDER BY kcu.table_name, kcu.constraint_name, kcu.ordinal_position
    "#)
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Incoming FK query failed: {e}"))?;

    let mut map: std::collections::BTreeMap<(String, String, String), (Vec<String>, Vec<String>)> = Default::default();
    for r in &rows {
        let fs: String = r.try_get(0).unwrap_or_default();
        let ft: String = r.try_get(1).unwrap_or_default();
        let fc: String = r.try_get(2).unwrap_or_default();
        let tc: String = r.try_get(3).unwrap_or_default();
        let cn: String = r.try_get(4).unwrap_or_default();
        let e = map.entry((fs, ft, cn)).or_default();
        e.0.push(fc); e.1.push(tc);
    }
    Ok(map.into_iter().map(|((fs, ft, cn), (fc, tc))| IncomingForeignKey {
        from_schema: fs, from_table: ft, from_columns: fc, to_columns: tc, constraint_name: cn,
    }).collect())
}

async fn get_incoming_fks_sqlite(pool: &sqlx::SqlitePool, table: &str) -> Result<Vec<IncomingForeignKey>, String> {
    let tables: Vec<String> = sqlx::query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetch_all(pool).await.unwrap_or_default()
     .iter().filter_map(|r| r.try_get::<String, _>(0).ok()).collect();

    let mut result = Vec::new();
    for from_table in tables {
        let tq = format!("\"{}\"", from_table.replace('"', "\"\""));
        let fk_rows = sqlx::query(&format!("PRAGMA foreign_key_list({tq})"))
            .fetch_all(pool).await.unwrap_or_default();
        let mut fk_map: std::collections::BTreeMap<i64, (Vec<String>, Vec<String>)> = Default::default();
        for r in &fk_rows {
            let id: i64 = r.try_get(0).unwrap_or(0);
            let ref_table: String = r.try_get::<Option<String>, _>(2).ok().flatten().unwrap_or_default();
            if !ref_table.eq_ignore_ascii_case(table) { continue; }
            let fc: String = r.try_get::<Option<String>, _>(3).ok().flatten().unwrap_or_default();
            let tc: String = r.try_get::<Option<String>, _>(4).ok().flatten().unwrap_or_default();
            let e = fk_map.entry(id).or_default(); e.0.push(fc); e.1.push(tc);
        }
        for (_, (from_columns, to_columns)) in fk_map {
            result.push(IncomingForeignKey {
                from_schema: "main".to_string(), from_table: from_table.clone(),
                from_columns, to_columns, constraint_name: String::new(),
            });
        }
    }
    Ok(result)
}

/// Group `PRAGMA foreign_key_list` JSON rows (id, seq, table, from, to, ...) whose
/// referenced `table` equals `target` into per-constraint IncomingForeignKey entries.
/// Shared by the SQLite-shaped-over-HTTP engines (D1, LibSQL).
fn incoming_fks_from_pragma_json(
    from_table: &str,
    fk_rows: &[Vec<serde_json::Value>],
    target: &str,
) -> Vec<IncomingForeignKey> {
    let mut fk_map: std::collections::BTreeMap<i64, (Vec<String>, Vec<String>)> = Default::default();
    for r in fk_rows {
        let ref_table = r.get(2).and_then(|v| v.as_str()).unwrap_or("");
        if !ref_table.eq_ignore_ascii_case(target) { continue; }
        let id = r.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
        let fc = r.get(3).and_then(|v| v.as_str()).unwrap_or("").to_string();
        let tc = r.get(4).and_then(|v| v.as_str()).unwrap_or("").to_string();
        let e = fk_map.entry(id).or_default(); e.0.push(fc); e.1.push(tc);
    }
    fk_map.into_iter().map(|(_, (from_columns, to_columns))| IncomingForeignKey {
        from_schema: "main".to_string(), from_table: from_table.to_string(),
        from_columns, to_columns, constraint_name: String::new(),
    }).collect()
}

async fn get_incoming_fks_d1(cfg: &super::connection::D1Config, table: &str) -> Result<Vec<IncomingForeignKey>, String> {
    let tables: Vec<String> = super::d1::query(
        cfg,
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        vec![],
    )
    .await
    .map_err(|e| format!("Failed to list tables: {e}"))?
    .rows.iter().filter_map(|r| r.first().and_then(|v| v.as_str()).map(String::from)).collect();

    let mut result = Vec::new();
    for from_table in tables {
        let tq = format!("\"{}\"", from_table.replace('"', "\"\""));
        let fk_rows = super::d1::query(cfg, &format!("PRAGMA foreign_key_list({tq})"), vec![])
            .await.map(|r| r.rows).unwrap_or_default();
        result.extend(incoming_fks_from_pragma_json(&from_table, &fk_rows, table));
    }
    Ok(result)
}

async fn get_incoming_fks_libsql(cfg: &super::connection::LibSqlConfig, table: &str) -> Result<Vec<IncomingForeignKey>, String> {
    let tables: Vec<String> = super::libsql::query(
        cfg,
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        vec![],
    )
    .await
    .map_err(|e| format!("Failed to list tables: {e}"))?
    .rows.iter().filter_map(|r| r.first().and_then(|v| v.as_str()).map(String::from)).collect();

    let mut result = Vec::new();
    for from_table in tables {
        let tq = format!("\"{}\"", from_table.replace('"', "\"\""));
        let fk_rows = super::libsql::query(cfg, &format!("PRAGMA foreign_key_list({tq})"), vec![])
            .await.map(|r| r.rows).unwrap_or_default();
        result.extend(incoming_fks_from_pragma_json(&from_table, &fk_rows, table));
    }
    Ok(result)
}

async fn get_incoming_fks_duckdb(handle: &super::connection::DuckdbHandle, table: &str) -> Result<Vec<IncomingForeignKey>, String> {
    let t = table.replace('\'', "''");
    let sql = format!(
        "SELECT schema_name, table_name, array_to_string(constraint_column_names, ','), \
                array_to_string(referenced_column_names, ','), constraint_name \
         FROM duckdb_constraints() \
         WHERE constraint_type = 'FOREIGN KEY' AND referenced_table = '{t}' \
         ORDER BY schema_name, table_name, constraint_name"
    );
    let rows = super::duckdb::execute_sql(handle, &sql)
        .await
        .map_err(|e| format!("Failed to get incoming foreign keys: {e}"))?
        .rows;
    Ok(rows.iter().filter_map(|r| Some(IncomingForeignKey {
        from_schema:  r.get(0).and_then(|v| v.as_str()).unwrap_or("main").to_string(),
        from_table:   r.get(1).and_then(|v| v.as_str())?.to_string(),
        from_columns: r.get(2).and_then(|v| v.as_str()).unwrap_or("").split(',').filter(|s| !s.is_empty()).map(String::from).collect(),
        to_columns:   r.get(3).and_then(|v| v.as_str()).unwrap_or("").split(',').filter(|s| !s.is_empty()).map(String::from).collect(),
        constraint_name: r.get(4).and_then(|v| v.as_str()).unwrap_or("").to_string(),
    })).collect())
}

async fn get_incoming_fks_mssql(handle: &super::connection::MssqlHandle, schema: &str, table: &str) -> Result<Vec<IncomingForeignKey>, String> {
    let s = schema.replace('\'', "''");
    let t = table.replace('\'', "''");
    let sql = format!(
        "SELECT sch.name, tp.name, cp.name, cr.name, fk.name \
         FROM sys.foreign_keys fk \
         JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id \
         JOIN sys.tables tp   ON tp.object_id  = fk.parent_object_id \
         JOIN sys.schemas sch ON sch.schema_id = tp.schema_id \
         JOIN sys.tables tr   ON tr.object_id  = fk.referenced_object_id \
         JOIN sys.schemas rsch ON rsch.schema_id = tr.schema_id \
         JOIN sys.columns cp ON cp.object_id = fkc.parent_object_id     AND cp.column_id = fkc.parent_column_id \
         JOIN sys.columns cr ON cr.object_id = fkc.referenced_object_id AND cr.column_id = fkc.referenced_column_id \
         WHERE rsch.name = '{s}' AND tr.name = '{t}' \
         ORDER BY sch.name, tp.name, fk.name, fkc.constraint_column_id"
    );
    let rows = super::mssql::execute_sql(handle, &sql)
        .await
        .map_err(|e| format!("Failed to get incoming foreign keys: {e}"))?
        .rows;

    let mut map: std::collections::BTreeMap<(String, String, String), (Vec<String>, Vec<String>)> = Default::default();
    for r in &rows {
        let fs: String = r.get(0).and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let ft: String = r.get(1).and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let fc: String = r.get(2).and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let tc: String = r.get(3).and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let cn: String = r.get(4).and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let e = map.entry((fs, ft, cn)).or_default();
        e.0.push(fc); e.1.push(tc);
    }
    Ok(map.into_iter().map(|((fs, ft, cn), (fc, tc))| IncomingForeignKey {
        from_schema: fs, from_table: ft, from_columns: fc, to_columns: tc, constraint_name: cn,
    }).collect())
}

pub async fn get_incoming_foreign_keys(
    state: State<'_, DbState>,
    schema: String,
    table: String,
) -> Result<Vec<IncomingForeignKey>, String> {
    validate_ident(&schema)?;
    validate_ident(&table)?;
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => get_incoming_fks_pg(&pool, &schema, &table).await,
        ActiveConnection::Mysql(pool)    => get_incoming_fks_mysql(&pool, &schema, &table).await,
        ActiveConnection::Sqlite(pool)   => get_incoming_fks_sqlite(&pool, &table).await,
        ActiveConnection::D1(cfg)        => get_incoming_fks_d1(&cfg, &table).await,
        ActiveConnection::LibSql(cfg)    => get_incoming_fks_libsql(&cfg, &table).await,
        ActiveConnection::Duckdb(h)      => get_incoming_fks_duckdb(&h, &table).await,
        ActiveConnection::Mssql(h)       => get_incoming_fks_mssql(&h, &schema, &table).await,
        // ClickHouse and Redis have no foreign keys.
        _                                => Ok(vec![]),
    }
}

// ── DDL reconstruction ────────────────────────────────────────────────────────

async fn get_ddl_pg(pool: &PgPool, schema: &str, table: &str) -> Result<String, String> {
    let col_rows = sqlx::query(
        r#"SELECT
            a.attname,
            pg_catalog.format_type(a.atttypid, a.atttypmod),
            NOT a.attnotnull,
            pg_catalog.pg_get_expr(d.adbin, d.adrelid)
        FROM pg_catalog.pg_attribute a
        LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = ('"' || $1 || '"."' || $2 || '"')::regclass
          AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum"#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("DDL columns query failed: {e}"))?;

    let pk_rows = sqlx::query(
        r#"SELECT a.attname
           FROM pg_catalog.pg_constraint c
           JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
           WHERE c.conrelid = ('"' || $1 || '"."' || $2 || '"')::regclass
             AND c.contype = 'p'
           ORDER BY array_position(c.conkey, a.attnum)"#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let pk_cols: Vec<String> = pk_rows
        .iter()
        .filter_map(|r| r.try_get::<Option<String>, _>(0).ok().flatten())
        .collect();

    let mut lines: Vec<String> = col_rows
        .iter()
        .filter_map(|r| {
            let name: String = r.try_get::<Option<String>, _>(0).ok().flatten()?;
            let typ: String = r
                .try_get::<Option<String>, _>(1)
                .ok()
                .flatten()
                .unwrap_or_else(|| "text".to_string());
            let nullable: bool = r
                .try_get::<Option<bool>, _>(2)
                .ok()
                .flatten()
                .unwrap_or(true);
            let default: Option<String> = r.try_get::<Option<String>, _>(3).ok().flatten();
            let mut col = format!("  \"{}\" {}", name, typ);
            if let Some(d) = default {
                col.push_str(&format!(" DEFAULT {}", d));
            }
            if !nullable {
                col.push_str(" NOT NULL");
            }
            Some(col)
        })
        .collect();

    if !pk_cols.is_empty() {
        let pk_list = pk_cols
            .iter()
            .map(|c| format!("\"{}\"", c))
            .collect::<Vec<_>>()
            .join(", ");
        lines.push(format!("  PRIMARY KEY ({})", pk_list));
    }

    Ok(format!(
        "CREATE TABLE \"{}\".\"{}\" (\n{}\n);",
        schema,
        table,
        lines.join(",\n")
    ))
}

async fn get_ddl_sqlite(pool: &sqlx::SqlitePool, table: &str) -> Result<String, String> {
    let row = sqlx::query("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
        .bind(table)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("DDL query failed: {e}"))?;
    Ok(row
        .try_get::<Option<String>, _>(0)
        .ok()
        .flatten()
        .unwrap_or_default())
}

async fn get_ddl_mysql(pool: &MySqlPool, schema: &str, table: &str) -> Result<String, String> {
    let sql = format!(
        "SHOW CREATE TABLE `{}`.`{}`",
        schema.replace('`', ""),
        table.replace('`', "")
    );
    let row = sqlx::query(&sql)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("SHOW CREATE TABLE failed: {e}"))?;
    Ok(row
        .try_get::<Option<String>, _>(1)
        .ok()
        .flatten()
        .unwrap_or_default())
}

async fn get_ddl_d1(cfg: &super::connection::D1Config, table: &str) -> Result<String, String> {
    let result = super::d1::query(
        cfg,
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
        vec![serde_json::Value::String(table.to_string())],
    )
    .await
    .map_err(|e| format!("D1 DDL query failed: {e}"))?;

    let sql_idx = result.columns.iter().position(|c| c.name == "sql").unwrap_or(0);
    Ok(result
        .rows
        .first()
        .and_then(|r| r.get(sql_idx))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string())
}

async fn get_ddl_libsql(
    cfg: &super::connection::LibSqlConfig,
    table: &str,
) -> Result<String, String> {
    let result = super::libsql::query(
        cfg,
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
        vec![serde_json::Value::String(table.to_string())],
    )
    .await
    .map_err(|e| format!("LibSQL DDL query failed: {e}"))?;

    let sql_idx = result.columns.iter().position(|c| c.name == "sql").unwrap_or(0);
    Ok(result
        .rows
        .first()
        .and_then(|r| r.get(sql_idx))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string())
}

pub async fn get_table_ddl(
    state: State<'_, DbState>,
    schema: String,
    table: String,
) -> Result<String, String> {
    validate_ident(&schema)?;
    validate_ident(&table)?;
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => get_ddl_pg(&pool, &schema, &table).await,
        ActiveConnection::Mysql(pool) => get_ddl_mysql(&pool, &schema, &table).await,
        ActiveConnection::Sqlite(pool) => get_ddl_sqlite(&pool, &table).await,
        ActiveConnection::D1(cfg) => get_ddl_d1(&cfg, &table).await,
        ActiveConnection::LibSql(cfg) => get_ddl_libsql(&cfg, &table).await,
        ActiveConnection::Clickhouse(cfg) => super::clickhouse::get_ddl(&cfg, &table).await,
        ActiveConnection::Redis(cfg) => super::redis::get_ddl(&cfg, &table).await,
        ActiveConnection::Duckdb(h) => super::duckdb::get_ddl(&h, &table).await,
        ActiveConnection::Mssql(h) => super::mssql::get_ddl(&h, &schema, &table).await,
    }
}

// ── Cross-connection introspection (for Data Diff) ────────────────────────────

/// List schemas for an arbitrary saved connection without changing global state.
pub async fn list_schemas_on_conn(config: AnyConnectionConfig) -> Result<Vec<String>, String> {
    use super::connection::{open_mysql, open_pg};
    match config {
        AnyConnectionConfig::Postgres(c) => {
            let pool = open_pg(&c).await?;
            let result = list_schemas_pg(&pool).await;
            pool.close().await;
            result
        }
        AnyConnectionConfig::Mysql(c) => {
            let pool = open_mysql(&c).await?;
            let result = list_schemas_mysql(&pool).await;
            pool.close().await;
            result
        }
        _ => Ok(vec!["main".to_string()]),
    }
}

/// List table names for an arbitrary saved connection without changing global state.
pub async fn list_tables_on_conn(
    config: AnyConnectionConfig,
    schema: String,
) -> Result<Vec<String>, String> {
    use super::connection::{open_mysql, open_pg, open_sqlite};
    let to_names = |ts: Vec<TableInfo>| ts.into_iter().map(|t| t.name).collect::<Vec<_>>();
    match config {
        AnyConnectionConfig::Postgres(c) => {
            validate_ident(&schema)?;
            let pool = open_pg(&c).await?;
            let result = list_tables_pg(&pool, &schema).await.map(to_names);
            pool.close().await;
            result
        }
        AnyConnectionConfig::Mysql(c) => {
            let pool = open_mysql(&c).await?;
            let result = list_tables_mysql(&pool, &schema).await.map(to_names);
            pool.close().await;
            result
        }
        AnyConnectionConfig::Sqlite(c) => {
            let pool = open_sqlite(&c).await?;
            let result = list_tables_sqlite(&pool).await.map(to_names);
            pool.close().await;
            result
        }
        AnyConnectionConfig::D1(c) => list_tables_d1(&c).await.map(to_names),
        AnyConnectionConfig::Libsql(c) => list_tables_libsql(&c).await.map(to_names),
        AnyConnectionConfig::Clickhouse(c) => super::clickhouse::list_tables(&c).await.map(to_names),
        AnyConnectionConfig::Redis(c) => super::redis::list_tables(&c).await.map(to_names),
        AnyConnectionConfig::Duckdb(c) => {
            let h = super::connection::open_duckdb(&c).await?;
            super::duckdb::list_tables(&h).await.map(to_names)
        }
        AnyConnectionConfig::Mssql(c) => {
            let h = super::connection::open_mssql(&c).await?;
            super::mssql::list_tables(&h, &schema).await.map(to_names)
        }
    }
}

/// Get CREATE TABLE DDL for a table on an arbitrary saved connection.
pub async fn get_table_ddl_on_conn(
    config: AnyConnectionConfig,
    schema: String,
    table: String,
) -> Result<String, String> {
    use super::connection::{open_mysql, open_pg, open_sqlite};
    validate_ident(&schema)?;
    validate_ident(&table)?;
    match config {
        AnyConnectionConfig::Postgres(c) => {
            let pool = open_pg(&c).await?;
            let result = get_ddl_pg(&pool, &schema, &table).await;
            pool.close().await;
            result
        }
        AnyConnectionConfig::Mysql(c) => {
            let pool = open_mysql(&c).await?;
            let result = get_ddl_mysql(&pool, &schema, &table).await;
            pool.close().await;
            result
        }
        AnyConnectionConfig::Sqlite(c) => {
            let pool = open_sqlite(&c).await?;
            let result = get_ddl_sqlite(&pool, &table).await;
            pool.close().await;
            result
        }
        AnyConnectionConfig::D1(c) => get_ddl_d1(&c, &table).await,
        AnyConnectionConfig::Libsql(c) => get_ddl_libsql(&c, &table).await,
        AnyConnectionConfig::Clickhouse(c) => super::clickhouse::get_ddl(&c, &table).await,
        AnyConnectionConfig::Redis(c) => super::redis::get_ddl(&c, &table).await,
        AnyConnectionConfig::Duckdb(c) => {
            let h = super::connection::open_duckdb(&c).await?;
            super::duckdb::get_ddl(&h, &table).await
        }
        AnyConnectionConfig::Mssql(c) => {
            let h = super::connection::open_mssql(&c).await?;
            super::mssql::get_ddl(&h, &schema, &table).await
        }
    }
}
