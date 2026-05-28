use super::connection::{require_conn, ActiveConnection, DbState};
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
            WHEN s.n_live_tup IS NOT NULL THEN GREATEST(s.n_live_tup::bigint, 0)
            WHEN c.reltuples >= 0 THEN c.reltuples::bigint
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
      AND NOT c.relispartition
    ORDER BY c.relkind, c.relname
    "#;

const LIST_INDEXES_SQL: &str = r#"
    SELECT
        i.relname::text AS name,
        t.relname::text AS table_name,
        COALESCE(string_agg(a.attname, ', ' ORDER BY x.ordinality), '') AS columns,
        am.amname::text AS index_type,
        ix.indisunique AS is_unique,
        ix.indisprimary AS is_primary
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
    GROUP BY i.relname, t.relname, am.amname, ix.indisunique, ix.indisprimary
    ORDER BY t.relname, ix.indisprimary DESC, i.relname
    "#;

async fn exact_row_count(pool: &PgPool, schema: &str, table: &str) -> Result<i64, String> {
    let sql = format!(r#"SELECT COUNT(*)::bigint FROM "{schema}"."{table}""#);
    sqlx::query_scalar(&sql)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to count rows for {table}: {e}"))
}

async fn resolve_unknown_row_counts(pool: &PgPool, schema: &str, tables: &mut [TableInfo]) {
    for table in tables.iter_mut() {
        if table.row_count >= 0 {
            continue;
        }
        // Views and foreign tables don't have reliable stats; skip exact count
        if table.kind == "view" || table.kind == "foreign_table" {
            table.row_count = 0;
            continue;
        }
        table.row_count = exact_row_count(pool, schema, &table.name).await.unwrap_or(0);
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

    resolve_unknown_row_counts(pool, schema, &mut tables).await;
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

    for t in tables.iter_mut() {
        if t.kind == "view" {
            t.row_count = 0;
            continue;
        }
        let sql = format!("SELECT COUNT(*) FROM \"{}\"", t.name.replace('"', "\"\""));
        if let Ok(row) = sqlx::query(&sql).fetch_one(pool).await {
            t.row_count = row.try_get::<Option<i64>, _>(0).ok().flatten().unwrap_or(0);
        }
    }
    Ok(tables)
}

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
            let ty = r.get(type_idx).and_then(|v| v.as_str()).unwrap_or("table");
            let kind = if ty == "view" { "view".to_string() } else { "table".to_string() };
            Some(TableInfo { name, kind, row_count: -1, rls_enabled: None })
        })
        .collect();

    for t in tables.iter_mut() {
        if t.kind == "view" {
            t.row_count = 0;
            continue;
        }
        let sql = format!("SELECT COUNT(*) FROM \"{}\"", t.name.replace('"', "\"\""));
        if let Ok(res) = super::d1::query(cfg, &sql, vec![]).await {
            if let Some(row) = res.rows.first() {
                t.row_count = row.first().and_then(|v| v.as_i64()).unwrap_or(0);
            }
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
            })
        })
        .collect())
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

    Ok(rows
        .iter()
        .filter_map(|r| {
            let name: String = r.try_get(0).ok()?;
            let ty: String = r.try_get(1).unwrap_or_else(|_| "BASE TABLE".to_string());
            let row_count: i64 = r.try_get::<Option<u64>, _>(2).ok().flatten().unwrap_or(0) as i64;
            let kind = if ty == "VIEW" { "view" } else { "table" }.to_string();
            Some(TableInfo { name, kind, row_count, rls_enabled: None })
        })
        .collect())
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
}

async fn list_enums_pg(pool: &PgPool, schema: &str) -> Result<Vec<EnumInfo>, String> {
    let rows = sqlx::query(
        r#"
        SELECT t.typname::text AS name,
               array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS values
        FROM pg_catalog.pg_type t
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid
        WHERE n.nspname = $1
        GROUP BY t.typname
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
            Ok(EnumInfo { name, values })
        })
        .collect()
}

// ── Public dispatch ───────────────────────────────────────────────────────────

pub async fn list_schemas(state: State<'_, DbState>) -> Result<Vec<String>, String> {
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => list_schemas_pg(&pool).await,
        ActiveConnection::Mysql(pool) => list_schemas_mysql(&pool).await,
        ActiveConnection::Sqlite(_) | ActiveConnection::D1(_) => Ok(vec!["main".to_string()]),
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
    }
}

pub async fn list_enums(state: State<'_, DbState>, schema: String) -> Result<Vec<EnumInfo>, String> {
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => {
            validate_ident(&schema)?;
            list_enums_pg(&pool, &schema).await
        }
        // MySQL / SQLite / D1 have no enum types accessible this way
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
