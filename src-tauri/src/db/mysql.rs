use super::query::{ColumnInfo, ForeignKeyInfo, RowFilter, SqlResult, TableRows};
use chrono::{NaiveDate, NaiveDateTime, NaiveTime};
use futures::TryStreamExt;
use rust_decimal::Decimal;
use serde_json::{json, Value};
use sqlx::{Column, MySqlPool, Row, TypeInfo};
use std::collections::HashMap;
use std::time::Instant;

const EXECUTE_SQL_MAX_ROWS: usize = 5_000;

fn bt(s: &str) -> String {
    format!("`{}`", s.replace('`', "``"))
}

pub fn cell_to_json(row: &sqlx::mysql::MySqlRow, idx: usize) -> Value {
    if let Ok(v) = row.try_get::<Option<i64>, _>(idx) {
        return v.map(|n| json!(n)).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<u64>, _>(idx) {
        return v.map(|n| json!(n)).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<bool>, _>(idx) {
        return v.map(|b| json!(b)).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(idx) {
        return v.map(|n| json!(n)).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<Decimal>, _>(idx) {
        return v.map(|d| json!(d.to_string())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<NaiveDateTime>, _>(idx) {
        return v.map(|d| json!(d.to_string())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<NaiveDate>, _>(idx) {
        return v.map(|d| json!(d.to_string())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<NaiveTime>, _>(idx) {
        return v.map(|t| json!(t.to_string())).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<serde_json::Value>, _>(idx) {
        return v.unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return v.map(|s| json!(s)).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(idx) {
        return v.map(|b| json!(format!("[{} bytes]", b.len()))).unwrap_or(Value::Null);
    }
    Value::Null
}

pub async fn fetch_primary_key(pool: &MySqlPool, schema: &str, table: &str) -> Result<Vec<String>, String> {
    let rows = sqlx::query(
        "SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE \
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' \
         ORDER BY ORDINAL_POSITION",
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to load primary key: {e}"))?;
    Ok(rows.iter().filter_map(|r| r.try_get::<String, _>(0).ok()).collect())
}

async fn fetch_column_names(pool: &MySqlPool, schema: &str, table: &str) -> Result<Vec<String>, String> {
    let rows = sqlx::query(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS \
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? \
         ORDER BY ORDINAL_POSITION",
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to load columns: {e}"))?;
    Ok(rows.iter().filter_map(|r| r.try_get::<String, _>(0).ok()).collect())
}

fn escape_like(input: &str) -> String {
    input.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

struct WhereClause {
    sql: String,
    binds: Vec<String>,
}

fn build_where(columns: &[String], search: Option<&str>, filters: &[RowFilter]) -> Result<WhereClause, String> {
    // (conjunct — None for first condition, Some("AND"/"OR") for subsequent)
    let mut cond_parts: Vec<(Option<&'static str>, String)> = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(term) = search.map(str::trim).filter(|s| !s.is_empty()) {
        let pattern = format!("%{}%", escape_like(term));
        // CAST to CHAR is required for LIKE since MySQL LIKE only works on strings.
        let parts: Vec<String> = columns
            .iter()
            .map(|c| format!("CAST({} AS CHAR) LIKE ? ESCAPE '\\\\'", bt(c)))
            .collect();
        if !parts.is_empty() {
            cond_parts.push((None, format!("({})", parts.join(" OR "))));
            for _ in columns { binds.push(pattern.clone()); }
        }
    }

    for f in filters {
        let conj: Option<&'static str> = if cond_parts.is_empty() { None }
            else if f.conjunct.as_deref().is_some_and(|s| s.eq_ignore_ascii_case("or")) { Some("OR") }
            else { Some("AND") };

        if f.column == "__any__" {
            let v = f.value.as_deref().unwrap_or("").trim();
            if !v.is_empty() && !columns.is_empty() {
                let (pattern, like_op) = match f.op.as_str() {
                    "contains"    => (format!("%{}%", escape_like(v)), "LIKE"),
                    "starts_with" => (format!("{}%",  escape_like(v)), "LIKE"),
                    "ends_with"   => (format!("%{}",  escape_like(v)), "LIKE"),
                    "eq"          => (v.to_string(), "="),
                    _             => { continue; }
                };
                let parts: Vec<String> = columns.iter().map(|c| {
                    let qc = bt(c);
                    if like_op == "=" { format!("CAST({qc} AS CHAR) = ?") }
                    else              { format!("CAST({qc} AS CHAR) {like_op} ? ESCAPE '\\\\'") }
                }).collect();
                cond_parts.push((conj, format!("({})", parts.join(" OR "))));
                for _ in columns { binds.push(pattern.clone()); }
            }
            continue;
        }

        let col = bt(&f.column);
        match f.op.as_str() {
            "is_null"     => cond_parts.push((conj, format!("{col} IS NULL"))),
            "is_not_null" => cond_parts.push((conj, format!("{col} IS NOT NULL"))),
            op => {
                let v = f.value.as_deref().unwrap_or("").trim();
                if v.is_empty() { continue; }
                // Comparison operators: NO CAST — MySQL performs implicit type coercion
                // from the string parameter to the column's actual type, which means the
                // database can use indexes on typed columns (INT, DECIMAL, DATETIME, etc.).
                // Only text-search ops (LIKE) need CAST since LIKE is inherently string-only.
                match op {
                    "eq"  => { cond_parts.push((conj, format!("{col} = ?"))); binds.push(v.to_string()); }
                    "neq" => { cond_parts.push((conj, format!("{col} != ?"))); binds.push(v.to_string()); }
                    "gt"  => { cond_parts.push((conj, format!("{col} > ?"))); binds.push(v.to_string()); }
                    "gte" => { cond_parts.push((conj, format!("{col} >= ?"))); binds.push(v.to_string()); }
                    "lt"  => { cond_parts.push((conj, format!("{col} < ?"))); binds.push(v.to_string()); }
                    "lte" => { cond_parts.push((conj, format!("{col} <= ?"))); binds.push(v.to_string()); }
                    "contains" => {
                        cond_parts.push((conj, format!("CAST({col} AS CHAR) LIKE ? ESCAPE '\\\\'")));
                        binds.push(format!("%{}%", escape_like(v)));
                    }
                    "not_contains" => {
                        cond_parts.push((conj, format!("CAST({col} AS CHAR) NOT LIKE ? ESCAPE '\\\\'")));
                        binds.push(format!("%{}%", escape_like(v)));
                    }
                    "starts_with" => {
                        cond_parts.push((conj, format!("CAST({col} AS CHAR) LIKE ? ESCAPE '\\\\'")));
                        binds.push(format!("{}%", escape_like(v)));
                    }
                    "ends_with" => {
                        cond_parts.push((conj, format!("CAST({col} AS CHAR) LIKE ? ESCAPE '\\\\'")));
                        binds.push(format!("%{}", escape_like(v)));
                    }
                    "between" => {
                        let mut parts = v.splitn(2, ',');
                        let from = parts.next().unwrap_or("").trim().to_string();
                        let to   = parts.next().unwrap_or("").trim().to_string();
                        cond_parts.push((conj, format!("({col} >= ? AND {col} <= ?)")));
                        binds.push(from);
                        binds.push(to);
                    }
                    _ => return Err(format!("Unsupported filter operator: {op}")),
                }
            }
        }
    }

    let sql = if cond_parts.is_empty() { String::new() } else {
        let mut out = String::from(" WHERE ");
        for (i, (conj, cond)) in cond_parts.into_iter().enumerate() {
            if i > 0 { out.push(' '); out.push_str(conj.unwrap_or("AND")); out.push(' '); }
            out.push_str(&cond);
        }
        out
    };
    Ok(WhereClause { sql, binds })
}

pub async fn get_table_rows(
    pool: &MySqlPool,
    schema: &str,
    table: &str,
    limit: i64,
    offset: i64,
    search: Option<String>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    filters: Option<Vec<RowFilter>>,
) -> Result<TableRows, String> {
    let started = Instant::now();
    let table_columns = fetch_column_names(pool, schema, table).await?;
    let filters = filters.unwrap_or_default();
    let where_clause = build_where(&table_columns, search.as_deref(), &filters)?;

    let order_by = if let Some(col) = sort_column.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let dir = match sort_direction.as_deref().unwrap_or("asc") {
            "desc" => "DESC",
            _ => "ASC",
        };
        // NULLS LAST (MySQL 8.0.22+) keeps NULL rows at the bottom for both ASC and DESC.
        format!(" ORDER BY {} {dir} NULLS LAST", bt(col))
    } else {
        String::new()
    };

    let table_ref = format!("{}.{}", bt(schema), bt(table));
    let count_sql = format!("SELECT COUNT(*) FROM {table_ref}{}", where_clause.sql);
    // MySQL returns COUNT(*) as BIGINT UNSIGNED (u64). Decoding as i64 causes a
    // type-mismatch error; fetch as u64 then cast.
    let mut count_q = sqlx::query_scalar::<_, u64>(&count_sql);
    for b in &where_clause.binds {
        count_q = count_q.bind(b.as_str());
    }

    let data_sql = format!("SELECT * FROM {table_ref}{}{} LIMIT ? OFFSET ?", where_clause.sql, order_by);
    let mut data_q = sqlx::query(&data_sql);
    for b in &where_clause.binds {
        data_q = data_q.bind(b.as_str());
    }
    data_q = data_q.bind(limit).bind(offset);

    let meta_q = sqlx::query(
        "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS \
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
    )
    .bind(schema)
    .bind(table);

    let (total_res, rows_res, meta_res) = tokio::join!(
        count_q.fetch_one(pool),
        data_q.fetch_all(pool),
        meta_q.fetch_all(pool),
    );
    let total: i64 = total_res.map_err(|e| format!("Failed to count rows: {e}"))? as i64;
    let rows = rows_res.map_err(|e| format!("Failed to fetch rows: {e}"))?;
    let meta_rows = meta_res.unwrap_or_default();

    // Build nullable map from information_schema
    let nullable_map: HashMap<String, bool> = meta_rows
        .iter()
        .filter_map(|r| {
            let name = r.try_get::<String, _>(0).ok()?;
            let nullable = r.try_get::<String, _>(2).ok()?;
            Some((name, nullable.eq_ignore_ascii_case("YES")))
        })
        .collect();

    let mut columns: Vec<ColumnInfo> = if let Some(first) = rows.first() {
        first
            .columns()
            .iter()
            .map(|c| ColumnInfo::new(c.name(), c.type_info().name().to_lowercase()))
            .collect()
    } else {
        // Empty table: derive column definitions from information_schema
        meta_rows
            .iter()
            .filter_map(|r| {
                Some(ColumnInfo::new(
                    r.try_get::<String, _>(0).ok()?,
                    r.try_get::<String, _>(1).ok()?.to_lowercase(),
                ))
            })
            .collect()
    };

    // Apply nullable info
    for col in &mut columns {
        if let Some(&is_nullable) = nullable_map.get(&col.name) {
            col.nullable = is_nullable;
        }
    }

    let data: Vec<Vec<Value>> = rows
        .iter()
        .map(|row| (0..row.len()).map(|i| cell_to_json(row, i)).collect())
        .collect();

    let pk = fetch_primary_key(pool, schema, table).await.unwrap_or_default();
    let fks = fetch_foreign_keys(pool, schema, table).await.unwrap_or_default();

    Ok(TableRows {
        columns,
        rows: data,
        total,
        query_ms: started.elapsed().as_millis() as u64,
        primary_key: pk,
        foreign_keys: fks,
    })
}

async fn fetch_foreign_keys(pool: &MySqlPool, schema: &str, table: &str) -> Result<Vec<ForeignKeyInfo>, String> {
    let rows = sqlx::query(
        "SELECT kcu.CONSTRAINT_NAME, kcu.COLUMN_NAME, \
                kcu.REFERENCED_TABLE_SCHEMA, kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME \
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
    .map_err(|e| format!("Failed to load foreign keys: {e}"))?;

    let mut out: Vec<ForeignKeyInfo> = Vec::new();
    let mut current: Option<String> = None;
    for row in &rows {
        let constraint: String = row.try_get(0).unwrap_or_default();
        let column: String = row.try_get(1).unwrap_or_default();
        let ref_schema: String = row.try_get(2).unwrap_or_default();
        let ref_table: String = row.try_get(3).unwrap_or_default();
        let ref_col: String = row.try_get(4).unwrap_or_default();
        if current.as_deref() == Some(&constraint) {
            if let Some(fk) = out.last_mut() {
                fk.columns.push(column);
                fk.referenced_columns.push(ref_col);
            }
        } else {
            current = Some(constraint);
            out.push(ForeignKeyInfo {
                columns: vec![column],
                referenced_schema: ref_schema,
                referenced_table: ref_table,
                referenced_columns: vec![ref_col],
            });
        }
    }
    Ok(out)
}

pub async fn execute_sql(pool: &MySqlPool, sql: &str) -> Result<SqlResult, String> {
    let started = Instant::now();
    let query_ms = || started.elapsed().as_millis() as u64;

    let head = sql.trim_start().split_whitespace().next().unwrap_or("").to_ascii_lowercase();
    let is_select = matches!(head.as_str(), "select" | "show" | "explain" | "describe" | "desc" | "with" | "call");

    if is_select {
        let mut stream = sqlx::query(sql).fetch(pool);
        let mut mysql_rows: Vec<sqlx::mysql::MySqlRow> = Vec::new();
        let mut capped = false;

        loop {
            match stream.try_next().await {
                Ok(Some(row)) => {
                    mysql_rows.push(row);
                    if mysql_rows.len() >= EXECUTE_SQL_MAX_ROWS {
                        capped = true;
                        break;
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    drop(stream);
                    return Err(format!("Query failed: {e}"));
                }
            }
        }
        drop(stream);

        let columns: Vec<ColumnInfo> = mysql_rows
            .first()
            .map(|r| {
                r.columns()
                    .iter()
                    .map(|c| ColumnInfo::new(c.name(), c.type_info().name().to_lowercase()))
                    .collect()
            })
            .unwrap_or_default();
        let data: Vec<Vec<Value>> = mysql_rows
            .iter()
            .map(|row| (0..row.len()).map(|i| cell_to_json(row, i)).collect())
            .collect();
        let row_count = data.len() as i64;
        return Ok(SqlResult {
            columns,
            rows: data,
            row_count: Some(row_count),
            message: if capped {
                Some(format!("Showing first {EXECUTE_SQL_MAX_ROWS} rows. Add LIMIT to fetch a specific range."))
            } else {
                None
            },
            query_ms: query_ms(),
        });
    }

    let result = sqlx::query(sql).execute(pool).await.map_err(|e| format!("Statement failed: {e}"))?;
    let affected = result.rows_affected() as i64;
    Ok(SqlResult {
        columns: vec![],
        rows: vec![],
        row_count: Some(affected),
        message: Some(format!("{affected} row(s) affected")),
        query_ms: query_ms(),
    })
}

pub async fn update_table_cell(
    pool: &MySqlPool,
    schema: &str,
    table: &str,
    primary_key: HashMap<String, Value>,
    column: &str,
    value: &Value,
) -> Result<(), String> {
    let pk_columns = fetch_primary_key(pool, schema, table).await?;
    if pk_columns.is_empty() {
        return Err("Cannot update row: table has no primary key".into());
    }
    let pk_parts: Vec<String> = pk_columns.iter().map(|c| format!("{} = ?", bt(c))).collect();
    let sql = format!("UPDATE {}.{} SET {} = ? WHERE {}", bt(schema), bt(table), bt(column), pk_parts.join(" AND "));

    let mut q = sqlx::query(&sql);
    q = bind_value(q, value);
    for col in &pk_columns {
        let pk_val = primary_key.get(col).ok_or_else(|| format!("Missing primary key column: {col}"))?;
        q = bind_value(q, pk_val);
    }
    q.execute(pool).await.map_err(|e| format!("Update failed: {e}"))?;
    Ok(())
}

pub async fn insert_table_row(
    pool: &MySqlPool,
    schema: &str,
    table: &str,
    values: HashMap<String, Value>,
) -> Result<Vec<Value>, String> {
    let meta_rows = sqlx::query(
        "SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, EXTRA \
         FROM information_schema.COLUMNS \
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? \
         ORDER BY ORDINAL_POSITION",
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to load column metadata: {e}"))?;

    if meta_rows.is_empty() {
        return Err(format!("Table not found: {schema}.{table}"));
    }

    let mut column_order: Vec<String> = Vec::new();
    let mut optional: HashMap<String, bool> = HashMap::new();
    let mut auto_increment_col: Option<String> = None;

    for row in &meta_rows {
        let name: String = row.try_get(0).map_err(|e| format!("Invalid column name: {e}"))?;
        let is_nullable: String = row.try_get(1).unwrap_or_else(|_| "NO".to_string());
        let default_val: Option<String> = row.try_get::<Option<String>, _>(2).ok().flatten();
        let extra: String = row.try_get::<Option<String>, _>(3).ok().flatten().unwrap_or_default();
        let is_auto = extra.to_lowercase().contains("auto_increment");
        let opt = is_auto || default_val.is_some() || is_nullable.eq_ignore_ascii_case("YES");
        if is_auto {
            auto_increment_col = Some(name.clone());
        }
        column_order.push(name.clone());
        optional.insert(name, opt);
    }

    for col in values.keys() {
        if !optional.contains_key(col) {
            return Err(format!("Unknown column: {col}"));
        }
    }
    for (name, &opt) in &optional {
        if !opt && !values.contains_key(name) {
            return Err(format!("Column \"{name}\" is required (NOT NULL, no default)"));
        }
    }

    let mut col_names: Vec<String> = values.keys().cloned().collect();
    col_names.sort();

    let cols: Vec<String> = col_names.iter().map(|c| bt(c)).collect();
    let placeholders: Vec<&str> = col_names.iter().map(|_| "?").collect();
    let sql = format!("INSERT INTO {}.{} ({}) VALUES ({})", bt(schema), bt(table), cols.join(", "), placeholders.join(", "));

    let mut q = sqlx::query(&sql);
    for col in &col_names {
        q = bind_value(q, values.get(col).unwrap());
    }
    q.execute(pool).await.map_err(|e| format!("Insert failed: {e}"))?;

    // Re-fetch the inserted row
    let fetched = if let Some(ai_col) = &auto_increment_col {
        let last_id: u64 = sqlx::query_scalar("SELECT LAST_INSERT_ID()")
            .fetch_one(pool)
            .await
            .map_err(|e| format!("Failed to get last insert ID: {e}"))?;
        let sel = format!("SELECT * FROM {}.{} WHERE {} = ? LIMIT 1", bt(schema), bt(table), bt(ai_col));
        sqlx::query(&sel).bind(last_id as i64).fetch_optional(pool).await
            .map_err(|e| format!("Failed to fetch inserted row: {e}"))?
    } else {
        let pk_cols = fetch_primary_key(pool, schema, table).await.unwrap_or_default();
        if !pk_cols.is_empty() && pk_cols.iter().all(|c| values.contains_key(c)) {
            let where_parts: Vec<String> = pk_cols.iter().map(|c| format!("{} = ?", bt(c))).collect();
            let sel = format!("SELECT * FROM {}.{} WHERE {} LIMIT 1", bt(schema), bt(table), where_parts.join(" AND "));
            let mut sel_q = sqlx::query(&sel);
            for pk_col in &pk_cols {
                sel_q = bind_value(sel_q, values.get(pk_col).unwrap());
            }
            sel_q.fetch_optional(pool).await.map_err(|e| format!("Failed to fetch inserted row: {e}"))?
        } else {
            None
        }
    };

    if let Some(row) = fetched {
        Ok(column_order
            .iter()
            .map(|name| {
                let idx = row.columns().iter().position(|c| c.name() == name.as_str()).unwrap_or(0);
                cell_to_json(&row, idx)
            })
            .collect())
    } else {
        Ok(column_order.iter().map(|name| values.get(name).cloned().unwrap_or(Value::Null)).collect())
    }
}

pub async fn delete_table_rows(
    pool: &MySqlPool,
    schema: &str,
    table: &str,
    primary_keys: Vec<HashMap<String, Value>>,
) -> Result<u64, String> {
    if primary_keys.is_empty() {
        return Ok(0);
    }
    let pk_columns = fetch_primary_key(pool, schema, table).await?;
    if pk_columns.is_empty() {
        return Err("Cannot delete rows: table has no primary key".into());
    }

    let where_parts: Vec<String> = pk_columns.iter().map(|c| format!("{} = ?", bt(c))).collect();
    let sql = format!("DELETE FROM {}.{} WHERE {}", bt(schema), bt(table), where_parts.join(" AND "));

    let mut total = 0u64;
    for pk_map in primary_keys {
        let mut q = sqlx::query(&sql);
        for col in &pk_columns {
            let val = pk_map.get(col).ok_or_else(|| format!("Missing primary key: {col}"))?;
            q = bind_value(q, val);
        }
        let res = q.execute(pool).await.map_err(|e| format!("Delete failed: {e}"))?;
        total += res.rows_affected();
    }
    Ok(total)
}

fn bind_value<'q>(
    q: sqlx::query::Query<'q, sqlx::MySql, sqlx::mysql::MySqlArguments>,
    value: &'q Value,
) -> sqlx::query::Query<'q, sqlx::MySql, sqlx::mysql::MySqlArguments> {
    match value {
        Value::Null => q.bind(None::<String>),
        Value::Bool(b) => q.bind(*b as i64),
        Value::Number(n) if n.is_i64() => q.bind(n.as_i64().unwrap()),
        Value::Number(n) if n.is_u64() => q.bind(n.as_u64().unwrap() as i64),
        Value::Number(n) => q.bind(n.as_f64().unwrap_or(0.0)),
        Value::String(s) => q.bind(s.as_str()),
        other => q.bind(other.to_string()),
    }
}
