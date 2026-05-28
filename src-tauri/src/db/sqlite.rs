use super::query::{ColumnInfo, ForeignKeyInfo, SqlResult, TableRows};
use futures::TryStreamExt;
use serde_json::{json, Value};
use sqlx::{Column, Row, SqlitePool, TypeInfo};
use std::time::Instant;

const EXECUTE_SQL_MAX_ROWS: usize = 5_000;

// ── Cell conversion ───────────────────────────────────────────────────────────

pub fn cell_to_json(row: &sqlx::sqlite::SqliteRow, idx: usize) -> Value {
    // Try types in order matching SQLite's type affinity rules
    if let Ok(v) = row.try_get::<Option<i64>, _>(idx) {
        return v.map(|n| json!(n)).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(idx) {
        return v.map(|n| json!(n)).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return v.map(|s| json!(s)).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(idx) {
        return v
            .map(|b| Value::String(b.iter().map(|x| format!("{x:02x}")).collect()))
            .unwrap_or(Value::Null);
    }
    Value::Null
}

#[allow(dead_code)]
fn col_type(row: &sqlx::sqlite::SqliteRow, idx: usize) -> String {
    row.column(idx).type_info().name().to_lowercase()
}

// ── Primary-key helpers ───────────────────────────────────────────────────────

/// Returns PK column names in key-sequence order using PRAGMA table_info.
pub async fn fetch_primary_key(pool: &SqlitePool, table: &str) -> Result<Vec<String>, String> {
    let sql = format!("PRAGMA table_info(\"{}\")", table.replace('"', "\"\""));
    let rows = sqlx::query(&sql)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("PRAGMA table_info failed: {e}"))?;

    let mut pk: Vec<(i64, String)> = rows
        .iter()
        .filter_map(|r| {
            let pk_pos: i64 = r.try_get::<Option<i64>, _>(5).ok().flatten().unwrap_or(0);
            if pk_pos == 0 {
                return None;
            }
            let name: String = r.try_get::<Option<String>, _>(1).ok().flatten()?;
            Some((pk_pos, name))
        })
        .collect();

    pk.sort_by_key(|(pos, _)| *pos);
    Ok(pk.into_iter().map(|(_, n)| n).collect())
}

/// Returns FK info using PRAGMA foreign_key_list.
pub async fn fetch_foreign_keys(pool: &SqlitePool, table: &str) -> Result<Vec<ForeignKeyInfo>, String> {
    let sql = format!("PRAGMA foreign_key_list(\"{}\")", table.replace('"', "\"\""));
    let rows = sqlx::query(&sql)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("PRAGMA foreign_key_list failed: {e}"))?;

    // Group by FK id (first column)
    let mut map: std::collections::BTreeMap<i64, ForeignKeyInfo> = Default::default();
    for r in &rows {
        let id: i64 = r.try_get::<Option<i64>, _>(0).ok().flatten().unwrap_or(0);
        let ref_table: String = r.try_get::<Option<String>, _>(2).ok().flatten().unwrap_or_default();
        let from_col: String = r.try_get::<Option<String>, _>(3).ok().flatten().unwrap_or_default();
        let to_col: String = r.try_get::<Option<String>, _>(4).ok().flatten().unwrap_or_default();

        let entry = map.entry(id).or_insert(ForeignKeyInfo {
            columns: vec![],
            referenced_schema: "main".to_string(),
            referenced_table: ref_table,
            referenced_columns: vec![],
        });
        entry.columns.push(from_col);
        entry.referenced_columns.push(to_col);
    }
    Ok(map.into_values().collect())
}

// ── execute_sql ───────────────────────────────────────────────────────────────

pub async fn execute_sql(pool: &SqlitePool, sql: &str) -> Result<SqlResult, String> {
    let t0 = Instant::now();
    let sql = sql.trim();

    let head = sql
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();

    if matches!(head.as_str(), "select" | "with" | "pragma" | "explain" | "values") {
        let mut stream = sqlx::query(sql).fetch(pool);
        let mut sqlite_rows: Vec<sqlx::sqlite::SqliteRow> = Vec::new();
        let mut capped = false;

        loop {
            match stream.try_next().await {
                Ok(Some(row)) => {
                    sqlite_rows.push(row);
                    if sqlite_rows.len() >= EXECUTE_SQL_MAX_ROWS {
                        capped = true;
                        break;
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    drop(stream);
                    return Err(format!("{e}"));
                }
            }
        }
        drop(stream);

        let columns: Vec<ColumnInfo> = sqlite_rows
            .first()
            .map(|r| {
                r.columns()
                    .iter()
                    .map(|c| ColumnInfo::new(c.name(), c.type_info().name().to_lowercase()))
                    .collect()
            })
            .unwrap_or_default();

        let data: Vec<Vec<Value>> = sqlite_rows
            .iter()
            .map(|r| (0..columns.len()).map(|i| cell_to_json(r, i)).collect())
            .collect();

        let n = data.len() as i64;
        Ok(SqlResult {
            columns,
            rows: data,
            row_count: Some(n),
            message: if capped {
                Some(format!(
                    "Showing first {EXECUTE_SQL_MAX_ROWS} rows — query returned more. Add a LIMIT clause to fetch a specific range."
                ))
            } else {
                None
            },
            query_ms: t0.elapsed().as_millis() as u64,
        })
    } else {
        let res = sqlx::query(sql)
            .execute(pool)
            .await
            .map_err(|e| format!("{e}"))?;

        let affected = res.rows_affected() as i64;
        Ok(SqlResult {
            columns: vec![],
            rows: vec![],
            row_count: Some(affected),
            message: Some(format!("{affected} row(s) affected")),
            query_ms: t0.elapsed().as_millis() as u64,
        })
    }
}

// ── get_table_rows ────────────────────────────────────────────────────────────

pub async fn get_table_rows(
    pool: &SqlitePool,
    table: &str,
    limit: i64,
    offset: i64,
    search: Option<String>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    filters: Option<Vec<crate::db::RowFilter>>,
) -> Result<TableRows, String> {
    let t0 = Instant::now();
    let tq = format!("\"{}\"", table.replace('"', "\"\""));

    // Column info from PRAGMA
    let pragma_sql = format!("PRAGMA table_info({tq})");
    let pragma_rows = sqlx::query(&pragma_sql)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("PRAGMA table_info: {e}"))?;

    // col_name -> nullable (notnull=0 means nullable)
    let pragma_nullable: std::collections::HashMap<String, bool> = pragma_rows
        .iter()
        .filter_map(|r| {
            let name = r.try_get::<Option<String>, _>(1).ok().flatten()?;
            let notnull: i64 = r.try_get(3).ok()?;
            Some((name, notnull == 0))
        })
        .collect();

    let col_names: Vec<String> = pragma_rows
        .iter()
        .filter_map(|r| r.try_get::<Option<String>, _>(1).ok().flatten())
        .collect();

    // Build WHERE clause (using ? placeholders)
    // Each entry: (conjunct — None for first, Some("AND"/"OR") for rest, condition SQL, binds)
    let mut cond_parts: Vec<(Option<String>, String)> = vec![];
    let mut binds: Vec<String> = vec![];

    if let Some(ref s) = search {
        if !s.is_empty() && !col_names.is_empty() {
            let escaped = escape_like(s);
            let pattern = format!("%{escaped}%");
            let parts: Vec<String> = col_names
                .iter()
                .map(|c| format!("LOWER(CAST(\"{}\" AS TEXT)) LIKE LOWER(?) ESCAPE '\\'", c.replace('"', "\"\"")))
                .collect();
            cond_parts.push((None, format!("({})", parts.join(" OR "))));
            for _ in &col_names { binds.push(pattern.clone()); }
        }
    }

    if let Some(ref fs) = filters {
        for f in fs {
            let qcol = format!("\"{}\"", f.column.replace('"', "\"\""));
            let conj = if cond_parts.is_empty() { None }
                       else { Some(f.conjunct.as_deref().unwrap_or("and").to_uppercase()) };
            match f.op.as_str() {
                "is_null"     => cond_parts.push((conj, format!("{qcol} IS NULL"))),
                "is_not_null" => cond_parts.push((conj, format!("{qcol} IS NOT NULL"))),
                _ => if let Some(ref v) = f.value {
                    let (cond, extra_binds) = build_filter_condition(&qcol, &f.op, v);
                    cond_parts.push((conj, cond));
                    binds.extend(extra_binds);
                },
            }
        }
    }

    let where_clause = if cond_parts.is_empty() { String::new() } else {
        let parts: Vec<String> = cond_parts.into_iter().map(|(c, s)| {
            match c { None => s, Some(conj) => format!("{conj} {s}") }
        }).collect();
        format!("WHERE {}", parts.join(" "))
    };

    // ORDER BY — NULLS LAST ensures consistent ordering when column has NULLs
    let order_clause = if let Some(col) = sort_column {
        let dir = sort_direction.as_deref().unwrap_or("asc").to_ascii_uppercase();
        let dir = if dir == "DESC" { "DESC" } else { "ASC" };
        format!("ORDER BY \"{}\" {dir} NULLS LAST", col.replace('"', "\"\""))
    } else {
        String::new()
    };

    // COUNT
    let count_sql = format!("SELECT COUNT(*) FROM {tq} {where_clause}");
    let mut count_q = sqlx::query(&count_sql);
    for b in &binds {
        count_q = count_q.bind(b.clone());
    }
    let count_row = count_q
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Count failed: {e}"))?;
    let total: i64 = count_row.try_get::<Option<i64>, _>(0).ok().flatten().unwrap_or(0);

    // ROWS
    let rows_sql = format!("SELECT * FROM {tq} {where_clause} {order_clause} LIMIT ? OFFSET ?");
    let mut rows_q = sqlx::query(&rows_sql);
    for b in &binds {
        rows_q = rows_q.bind(b.clone());
    }
    rows_q = rows_q.bind(limit).bind(offset);

    let fetched = rows_q
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Query failed: {e}"))?;

    let columns: Vec<ColumnInfo> = fetched
        .first()
        .map(|r| {
            r.columns()
                .iter()
                .map(|c| {
                    let mut col = ColumnInfo::new(c.name(), c.type_info().name().to_lowercase());
                    if let Some(&nullable) = pragma_nullable.get(c.name()) {
                        col.nullable = nullable;
                    }
                    col
                })
                .collect()
        })
        .unwrap_or_else(|| {
            col_names
                .iter()
                .map(|n| {
                    let mut col = ColumnInfo::new(n.clone(), "text");
                    if let Some(&nullable) = pragma_nullable.get(n.as_str()) {
                        col.nullable = nullable;
                    }
                    col
                })
                .collect()
        });

    let rows: Vec<Vec<Value>> = fetched
        .iter()
        .map(|r| (0..columns.len()).map(|i| cell_to_json(r, i)).collect())
        .collect();

    let primary_key = fetch_primary_key(pool, table).await.unwrap_or_default();
    let foreign_keys = fetch_foreign_keys(pool, table).await.unwrap_or_default();

    Ok(TableRows {
        columns,
        rows,
        total,
        query_ms: t0.elapsed().as_millis() as u64,
        primary_key,
        foreign_keys,
    })
}

/// Escape special characters in a SQLite/D1 LIKE pattern.
/// The escape character used is `\` (set via `ESCAPE '\'` in the query).
pub fn escape_like(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('%',  "\\%")
        .replace('_',  "\\_")
}

/// Same logic as build_filter_condition but returns JSON Values for D1 HTTP params.
pub fn build_d1_filter(qcol: &str, op: &str, val: &str) -> (String, Vec<serde_json::Value>) {
    let (cond, binds) = build_filter_condition(qcol, op, val);
    (cond, binds.into_iter().map(serde_json::Value::String).collect())
}

fn build_filter_condition(qcol: &str, op: &str, val: &str) -> (String, Vec<String>) {
    match op {
        // Comparison operators: SQLite is dynamically typed — no cast needed.
        // Direct comparison works correctly for integers, reals, and text alike.
        "eq"  => (format!("{qcol} = ?"),  vec![val.to_string()]),
        "neq" => (format!("{qcol} != ?"), vec![val.to_string()]),
        "gt"  => (format!("{qcol} > ?"),  vec![val.to_string()]),
        "gte" => (format!("{qcol} >= ?"), vec![val.to_string()]),
        "lt"  => (format!("{qcol} < ?"),  vec![val.to_string()]),
        "lte" => (format!("{qcol} <= ?"), vec![val.to_string()]),
        // Text-search operators: cast to TEXT for LIKE, escape wildcards so user
        // input containing `%` or `_` is treated as literals, not LIKE wildcards.
        "contains" => (
            format!("LOWER(CAST({qcol} AS TEXT)) LIKE LOWER(?) ESCAPE '\\'"),
            vec![format!("%{}%", escape_like(val))],
        ),
        "not_contains" => (
            format!("LOWER(CAST({qcol} AS TEXT)) NOT LIKE LOWER(?) ESCAPE '\\'"),
            vec![format!("%{}%", escape_like(val))],
        ),
        "starts_with" => (
            format!("LOWER(CAST({qcol} AS TEXT)) LIKE LOWER(?) ESCAPE '\\'"),
            vec![format!("{}%", escape_like(val))],
        ),
        "ends_with" => (
            format!("LOWER(CAST({qcol} AS TEXT)) LIKE LOWER(?) ESCAPE '\\'"),
            vec![format!("%{}", escape_like(val))],
        ),
        "between" => {
            let mut parts = val.splitn(2, ',');
            let from = parts.next().unwrap_or("").trim().to_string();
            let to   = parts.next().unwrap_or("").trim().to_string();
            (format!("({qcol} >= ? AND {qcol} <= ?)"), vec![from, to])
        }
        _ => (format!("{qcol} = ?"), vec![val.to_string()]),
    }
}

// ── insert_table_row ──────────────────────────────────────────────────────────

pub fn sqlite_column_optional_when_omitted(
    notnull: bool,
    dflt_value: Option<&str>,
    pk: i64,
    col_type: &str,
) -> bool {
    if dflt_value.is_some() {
        return true;
    }
    let t = col_type.to_ascii_lowercase();
    if t.contains("serial") || t.ends_with("serial") {
        return true;
    }
    if pk > 0 && t.contains("int") {
        return true;
    }
    !notnull
}

pub async fn insert_table_row(
    pool: &SqlitePool,
    table: &str,
    values: std::collections::HashMap<String, Value>,
) -> Result<Vec<Value>, String> {
    let tq = format!("\"{}\"", table.replace('"', "\"\""));
    let pragma_sql = format!("PRAGMA table_info({tq})");
    let pragma_rows = sqlx::query(&pragma_sql)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("PRAGMA table_info: {e}"))?;

    let mut column_order: Vec<String> = Vec::new();
    let mut optional: std::collections::HashMap<String, bool> = std::collections::HashMap::new();

    for r in &pragma_rows {
        let name = r
            .try_get::<Option<String>, _>(1)
            .ok()
            .flatten()
            .ok_or("Invalid PRAGMA column name")?;
        let col_type = r
            .try_get::<Option<String>, _>(2)
            .ok()
            .flatten()
            .unwrap_or_else(|| "text".into());
        let notnull: i64 = r.try_get(3).ok().unwrap_or(0);
        let dflt: Option<String> = r.try_get(4).ok().flatten();
        let pk: i64 = r.try_get(5).ok().unwrap_or(0);
        let opt = sqlite_column_optional_when_omitted(notnull != 0, dflt.as_deref(), pk, &col_type);
        column_order.push(name.clone());
        optional.insert(name, opt);
    }

    for col in values.keys() {
        if !optional.contains_key(col) {
            return Err(format!("Unknown column: {col}"));
        }
    }

    for (name, opt) in &optional {
        if !opt && !values.contains_key(name) {
            return Err(format!(
                "Column \"{name}\" is required (NOT NULL, no default)"
            ));
        }
    }

    let mut col_names: Vec<String> = values.keys().cloned().collect();
    col_names.sort();

    let cols: Vec<String> = col_names
        .iter()
        .map(|c| format!("\"{}\"", c.replace('"', "\"\"")))
        .collect();
    let placeholders: Vec<String> = (0..col_names.len()).map(|_| "?".to_string()).collect();
    let sql = format!(
        "INSERT INTO {tq} ({}) VALUES ({}) RETURNING *",
        cols.join(", "),
        placeholders.join(", ")
    );

    let mut q = sqlx::query(&sql);
    for col in &col_names {
        let v = values.get(col).ok_or_else(|| format!("Missing value for {col}"))?;
        q = bind_value(q, v);
    }

    let inserted = q
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Insert failed: {e}"))?;

    let returning_cols: Vec<String> = inserted
        .columns()
        .iter()
        .map(|c| c.name().to_string())
        .collect();

    Ok(column_order
        .iter()
        .map(|name| {
            let idx = returning_cols
                .iter()
                .position(|n| n == name)
                .unwrap_or(0);
            cell_to_json(&inserted, idx)
        })
        .collect())
}

// ── update_table_cell ─────────────────────────────────────────────────────────

pub async fn update_table_cell(
    pool: &SqlitePool,
    table: &str,
    primary_key: std::collections::HashMap<String, Value>,
    column: &str,
    value: &Value,
) -> Result<(), String> {
    let pk_columns = fetch_primary_key(pool, table).await?;
    if pk_columns.is_empty() {
        return Err("Cannot update row: table has no primary key".into());
    }

    let tq = format!("\"{}\"", table.replace('"', "\"\""));
    let set_col = format!("\"{}\"", column.replace('"', "\"\""));

    let where_parts: Vec<String> = pk_columns
        .iter()
        .map(|c| format!("\"{}\" = ?", c.replace('"', "\"\"")))
        .collect();

    let sql = format!("UPDATE {tq} SET {set_col} = ? WHERE {}", where_parts.join(" AND "));
    let mut q = sqlx::query(&sql);
    q = bind_value(q, value);
    for pk_col in &pk_columns {
        let v = primary_key.get(pk_col).ok_or_else(|| format!("Missing PK: {pk_col}"))?;
        q = bind_value(q, v);
    }

    q.execute(pool)
        .await
        .map_err(|e| format!("Update failed: {e}"))?;
    Ok(())
}

// ── delete_table_rows ─────────────────────────────────────────────────────────

pub async fn delete_table_rows(
    pool: &SqlitePool,
    table: &str,
    primary_keys: Vec<std::collections::HashMap<String, Value>>,
) -> Result<u64, String> {
    if primary_keys.is_empty() {
        return Ok(0);
    }
    let pk_columns = fetch_primary_key(pool, table).await?;
    if pk_columns.is_empty() {
        return Err("Cannot delete rows: table has no primary key".into());
    }

    let tq = format!("\"{}\"", table.replace('"', "\"\""));
    let mut total: u64 = 0;

    for pk_map in primary_keys {
        let where_parts: Vec<String> = pk_columns
            .iter()
            .map(|c| format!("\"{}\" = ?", c.replace('"', "\"\"")))
            .collect();
        let sql = format!("DELETE FROM {tq} WHERE {}", where_parts.join(" AND "));
        let mut q = sqlx::query(&sql);
        for col in &pk_columns {
            let v = pk_map.get(col).ok_or_else(|| format!("Missing PK: {col}"))?;
            q = bind_value(q, v);
        }
        let res = q.execute(pool).await.map_err(|e| format!("Delete failed: {e}"))?;
        total += res.rows_affected();
    }
    Ok(total)
}

// ── value binding ─────────────────────────────────────────────────────────────

fn bind_value<'a>(
    q: sqlx::query::Query<'a, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'a>>,
    value: &Value,
) -> sqlx::query::Query<'a, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'a>> {
    match value {
        Value::Null => q.bind(None::<String>),
        Value::Bool(b) => q.bind(*b as i64),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                q.bind(i)
            } else if let Some(f) = n.as_f64() {
                q.bind(f)
            } else {
                q.bind(n.to_string())
            }
        }
        Value::String(s) => q.bind(s.clone()),
        other => q.bind(other.to_string()),
    }
}
