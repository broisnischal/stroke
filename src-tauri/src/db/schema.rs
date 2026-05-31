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
    let sql = format!(r#"SELECT COUNT(*)::bigint FROM "{schema}"."{table}""#);
    sqlx::query_scalar(&sql)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to count rows for {table}: {e}"))
}

async fn resolve_unknown_row_counts(pool: &PgPool, schema: &str, tables: &mut [TableInfo]) {
    // Zero out view/foreign-table entries immediately (no COUNT needed).
    for t in tables.iter_mut() {
        if t.row_count < 0 && (t.kind == "view" || t.kind == "foreign_table") {
            t.row_count = 0;
        }
    }

    // Collect indices of materialized views / tables that still need an exact count.
    let needs_count: Vec<usize> = tables
        .iter()
        .enumerate()
        .filter(|(_, t)| t.row_count < 0)
        .map(|(i, _)| i)
        .collect();

    if needs_count.is_empty() {
        return;
    }

    // Fire all COUNT(*) queries in parallel — one round-trip instead of N.
    let futs: Vec<_> = needs_count
        .iter()
        .map(|&i| exact_row_count(pool, schema, &tables[i].name))
        .collect();
    let counts = futures::future::join_all(futs).await;

    for (&idx, result) in needs_count.iter().zip(counts.iter()) {
        tables[idx].row_count = result.as_ref().copied().unwrap_or(0);
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
                condition: None,
                comment: None,
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
            // TABLE_ROWS is BIGINT UNSIGNED. COALESCE makes it non-nullable so
            // decode as u64 directly; Option<u64> can silently fail on non-null columns.
            let row_count: i64 = r.try_get::<u64, _>(2).unwrap_or(0) as i64;
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
        _ => Ok(vec![]),
    }
}

pub async fn list_triggers(state: State<'_, DbState>, schema: String) -> Result<Vec<TriggerInfo>, String> {
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => {
            validate_ident(&schema)?;
            list_triggers_pg(&pool, &schema).await
        }
        _ => Ok(vec![]),
    }
}

pub async fn list_sequences(state: State<'_, DbState>, schema: String) -> Result<Vec<SequenceInfo>, String> {
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => {
            validate_ident(&schema)?;
            list_sequences_pg(&pool, &schema).await
        }
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
        _ => Err("Structure view is only supported for PostgreSQL".to_string()),
    }
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
