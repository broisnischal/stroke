use super::connection::{require_conn, require_pool, ActiveConnection, DbState};
use super::schema::validate_ident;
use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use futures::TryStreamExt;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{Column, Decode, Postgres, Row, TypeInfo, ValueRef};
use std::collections::HashMap;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    /// false when the column has a NOT NULL constraint
    pub nullable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enum_values: Option<Vec<String>>,
}

impl ColumnInfo {
    pub(crate) fn new(name: impl Into<String>, data_type: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            data_type: data_type.into(),
            nullable: true,
            enum_values: None,
        }
    }
}

async fn fetch_table_column_nullable(
    pool: &sqlx::PgPool,
    schema: &str,
    table: &str,
) -> Result<HashMap<String, bool>, String> {
    // pg_attribute is much faster than information_schema.columns for this lookup
    let rows = sqlx::query(
        r#"
        SELECT a.attname::text, NOT a.attnotnull AS is_nullable
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
        "#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to load nullable info: {e}"))?;

    let mut map: HashMap<String, bool> = HashMap::new();
    for row in rows {
        if let (Ok(name), Ok(is_nullable)) = (
            row.try_get::<String, _>(0),
            row.try_get::<bool, _>(1),
        ) {
            map.insert(name, is_nullable);
        }
    }
    Ok(map)
}

fn apply_column_nullable(columns: &mut [ColumnInfo], nullable: &HashMap<String, bool>) {
    for col in columns.iter_mut() {
        if let Some(&is_nullable) = nullable.get(&col.name) {
            col.nullable = is_nullable;
        }
    }
}

async fn fetch_table_column_enums(
    pool: &sqlx::PgPool,
    schema: &str,
    table: &str,
) -> Result<HashMap<String, Vec<String>>, String> {
    // pg_attribute is far faster than information_schema.columns here — the view
    // scans many system tables with multiple joins; pg_attribute is a direct heap scan.
    let rows = sqlx::query(
        r#"
        SELECT a.attname::text, e.enumlabel::text
        FROM pg_attribute a
        JOIN pg_type t ON t.oid = a.atttypid AND t.typtype = 'e'
        JOIN pg_enum e ON e.enumtypid = t.oid
        JOIN pg_class cl ON cl.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE n.nspname = $1
          AND cl.relname = $2
          AND a.attnum > 0
          AND NOT a.attisdropped
        ORDER BY a.attname, e.enumsortorder
        "#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to load enum values: {e}"))?;

    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for row in rows {
        let column: String = row
            .try_get(0)
            .map_err(|e| format!("Invalid enum column name: {e}"))?;
        let label: String = row
            .try_get(1)
            .map_err(|e| format!("Invalid enum label: {e}"))?;
        map.entry(column).or_default().push(label);
    }
    Ok(map)
}

fn apply_column_enums(columns: &mut [ColumnInfo], enums: &HashMap<String, Vec<String>>) {
    for col in columns.iter_mut() {
        if let Some(values) = enums.get(&col.name) {
            if !values.is_empty() {
                col.enum_values = Some(values.clone());
            }
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKeyInfo {
    pub columns: Vec<String>,
    pub referenced_schema: String,
    pub referenced_table: String,
    pub referenced_columns: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableRows {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<Vec<Value>>,
    pub total: i64,
    pub query_ms: u64,
    pub primary_key: Vec<String>,
    pub foreign_keys: Vec<ForeignKeyInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlResult {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<Vec<Value>>,
    pub row_count: Option<i64>,
    pub message: Option<String>,
    pub query_ms: u64,
}

fn pg_type_label(type_name: &str) -> String {
    let name = type_name;
    match name {
        "VARCHAR" | "CHAR" | "BPCHAR" => {
            format!("{}(...)", name.to_lowercase())
        }
        _ => name.to_lowercase(),
    }
}

fn cell_to_json(row: &sqlx::postgres::PgRow, idx: usize) -> Value {
    let col = row.column(idx);
    let type_name = col.type_info().name();

    macro_rules! try_get {
        ($t:ty) => {
            if let Ok(v) = row.try_get::<Option<$t>, _>(idx) {
                return match v {
                    Some(x) => json!(x),
                    None => Value::Null,
                };
            }
        };
    }

    macro_rules! try_get_string {
        ($t:ty) => {
            if let Ok(v) = row.try_get::<Option<$t>, _>(idx) {
                return match v {
                    Some(x) => json!(x.to_string()),
                    None => Value::Null,
                };
            }
        };
    }

    try_get!(bool);
    try_get!(i16);
    try_get!(i32);
    try_get!(i64);
    try_get!(f32);
    try_get!(f64);
    try_get_string!(Decimal);
    try_get_string!(DateTime<Utc>);
    try_get_string!(NaiveDateTime);
    try_get_string!(NaiveDate);
    try_get_string!(NaiveTime);
    try_get_string!(Uuid);

    if type_name == "JSON" || type_name == "JSONB" {
        if let Ok(v) = row.try_get::<Option<serde_json::Value>, _>(idx) {
            return v.unwrap_or(Value::Null);
        }
    }

    // Use raw wire-protocol bytes for all remaining types (TEXT, VARCHAR, enums, domains…).
    // Skipping try_get::<String>() avoids sqlx's runtime pg_catalog introspection for
    // custom/enum types, which would fire a `SELECT enumlabel FROM pg_enum WHERE …` query
    // per unique enum OID encountered — each one a full network round-trip.
    if let Ok(raw) = row.try_get_raw(idx) {
        if raw.is_null() {
            return Value::Null;
        }
        if let Ok(text) = <String as Decode<Postgres>>::decode(raw) {
            return json!(text);
        }
    }

    // Binary types (bytea) that aren't text-decodable.
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(idx) {
        return match v {
            Some(bytes) => json!(format!("[{} bytes]", bytes.len())),
            None => Value::Null,
        };
    }

    Value::String(format!("<{type_name}>"))
}

async fn fetch_foreign_keys(
    pool: &sqlx::PgPool,
    schema: &str,
    table: &str,
) -> Result<Vec<ForeignKeyInfo>, String> {
    // Use pg_catalog directly: information_schema.constraint_column_usage has privilege quirks
    // and produces a cross-product for composite FKs. pg_constraint with LATERAL unnest
    // preserves positional pairing between local and referenced columns.
    let rows = sqlx::query(
        r#"
        SELECT
            c.conname::text,
            a.attname::text,
            fn.nspname::text,
            f.relname::text,
            fa.attname::text
        FROM pg_constraint c
        JOIN pg_class t  ON t.oid = c.conrelid
        JOIN pg_namespace n  ON n.oid = t.relnamespace
        JOIN pg_class f  ON f.oid = c.confrelid
        JOIN pg_namespace fn ON fn.oid = f.relnamespace
        JOIN LATERAL unnest(c.conkey)  WITH ORDINALITY AS pos(attnum, ord) ON true
        JOIN pg_attribute a  ON a.attrelid = t.oid AND a.attnum = pos.attnum
        JOIN LATERAL unnest(c.confkey) WITH ORDINALITY AS fpos(attnum, ord) ON pos.ord = fpos.ord
        JOIN pg_attribute fa ON fa.attrelid = f.oid AND fa.attnum = fpos.attnum
        WHERE c.contype = 'f'
          AND n.nspname = $1
          AND t.relname = $2
        ORDER BY c.conname, pos.ord
        "#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to load foreign keys: {e}"))?;

    group_foreign_key_rows(&rows)
}

fn group_foreign_key_rows(
    rows: &[sqlx::postgres::PgRow],
) -> Result<Vec<ForeignKeyInfo>, String> {
    let mut out: Vec<ForeignKeyInfo> = Vec::new();
    let mut current_constraint: Option<String> = None;

    for row in rows {
        let constraint = row.try_get::<String, _>(0).unwrap_or_default();
        let column = row
            .try_get::<String, _>(1)
            .map_err(|e| format!("Invalid FK column: {e}"))?;
        let ref_schema = row
            .try_get::<String, _>(2)
            .map_err(|e| format!("Invalid FK schema: {e}"))?;
        let ref_table = row
            .try_get::<String, _>(3)
            .map_err(|e| format!("Invalid FK table: {e}"))?;
        let ref_column = row
            .try_get::<String, _>(4)
            .map_err(|e| format!("Invalid FK referenced column: {e}"))?;

        if current_constraint.as_deref() == Some(constraint.as_str()) {
            if let Some(fk) = out.last_mut() {
                fk.columns.push(column);
                fk.referenced_columns.push(ref_column);
            }
        } else {
            current_constraint = Some(constraint);
            out.push(ForeignKeyInfo {
                columns: vec![column],
                referenced_schema: ref_schema,
                referenced_table: ref_table,
                referenced_columns: vec![ref_column],
            });
        }
    }

    Ok(out)
}

async fn fetch_primary_key(
    pool: &sqlx::PgPool,
    schema: &str,
    table: &str,
) -> Result<Vec<String>, String> {
    // pg_constraint is faster than information_schema for primary key lookups
    let rows = sqlx::query(
        r#"
        SELECT a.attname::text
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.contype = 'p' AND n.nspname = $1 AND t.relname = $2
        ORDER BY array_position(c.conkey, a.attnum)
        "#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to load primary key: {e}"))?;

    Ok(rows
        .iter()
        .filter_map(|r| r.try_get::<String, _>(0).ok())
        .collect())
}

fn normalize_pg_type(data_type: &str) -> String {
    data_type
        .to_lowercase()
        .split('(')
        .next()
        .unwrap_or(data_type)
        .trim()
        .to_string()
}

/// Quoted PostgreSQL type reference for casts, e.g. `"public"."UserGenderEnum"`.
fn pg_cast_type_ref(udt_schema: &str, udt_name: &str) -> Result<String, String> {
    validate_ident(udt_schema)?;
    validate_ident(udt_name)?;
    Ok(format!(r#""{udt_schema}"."{udt_name}""#))
}

/// Returns the PostgreSQL cast keyword for datetime/date/time types so that
/// string bindings are explicitly cast rather than rejected as `text`.
fn pg_datetime_cast(data_type: &str) -> Option<&'static str> {
    match normalize_pg_type(data_type).as_str() {
        "timestamp with time zone" | "timestamptz" => Some("timestamptz"),
        "timestamp without time zone" | "timestamp" => Some("timestamp"),
        "time with time zone" | "timetz" => Some("timetz"),
        "time without time zone" | "time" => Some("time"),
        "date" => Some("date"),
        _ => None,
    }
}

#[derive(Debug, Clone)]
struct PgColumnMeta {
    data_type: String,
    udt_schema: Option<String>,
    udt_name: Option<String>,
}

impl PgColumnMeta {
    fn set_assignment_sql(&self, column: &str) -> Result<String, String> {
        validate_ident(column)?;
        if self.data_type.eq_ignore_ascii_case("USER-DEFINED") {
            let udt_name = self
                .udt_name
                .as_deref()
                .ok_or_else(|| format!("Missing UDT name for column: {column}"))?;
            let udt_schema = self.udt_schema.as_deref().unwrap_or("public");
            let type_ref = pg_cast_type_ref(udt_schema, udt_name)?;
            return Ok(format!(r#""{column}" = $1::{type_ref}"#));
        }
        // json/jsonb bindings arrive as text strings; an explicit cast tells
        // PostgreSQL to interpret the parameter as json/jsonb instead of text.
        let norm = normalize_pg_type(&self.data_type);
        if norm == "json" || norm == "jsonb" {
            return Ok(format!(r#""{column}" = $1::{norm}"#));
        }
        if let Some(cast) = pg_datetime_cast(&self.data_type) {
            return Ok(format!(r#""{column}" = $1::{cast}"#));
        }
        Ok(format!(r#""{column}" = $1"#))
    }

    fn insert_value_sql(&self, bind_idx: u32) -> Result<String, String> {
        if self.data_type.eq_ignore_ascii_case("USER-DEFINED") {
            let udt_name = self
                .udt_name
                .as_deref()
                .ok_or_else(|| "Missing UDT name for insert".to_string())?;
            let udt_schema = self.udt_schema.as_deref().unwrap_or("public");
            let type_ref = pg_cast_type_ref(udt_schema, udt_name)?;
            return Ok(format!("${bind_idx}::{type_ref}"));
        }
        let norm = normalize_pg_type(&self.data_type);
        if norm == "json" || norm == "jsonb" {
            return Ok(format!("${bind_idx}::{norm}"));
        }
        if let Some(cast) = pg_datetime_cast(&self.data_type) {
            return Ok(format!("${bind_idx}::{cast}"));
        }
        Ok(format!("${bind_idx}"))
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InsertRowResult {
    pub row: Vec<Value>,
}

struct PgInsertColumnMeta {
    name: String,
    data_type: String,
    optional_when_omitted: bool,
    pg: PgColumnMeta,
}

fn pg_column_optional_when_omitted(
    nullable: bool,
    column_default: Option<&str>,
    is_identity: bool,
    data_type: &str,
) -> bool {
    if is_identity {
        return true;
    }
    if column_default.is_some() {
        return true;
    }
    let t = normalize_pg_type(data_type);
    if t == "serial" || t == "bigserial" || t == "smallserial" {
        return true;
    }
    nullable
}

fn is_bytea_type(data_type: &str) -> bool {
    normalize_pg_type(data_type).contains("bytea")
}

fn validate_typed_value(data_type: &str, value: &Value) -> Result<(), String> {
    let t = normalize_pg_type(data_type);

    match value {
        Value::Null => return Ok(()),
        Value::Bool(_) if t == "boolean" => return Ok(()),
        Value::Number(n) if t.contains("int") || t == "serial" || t.ends_with("serial") => {
            if !n.is_i64() && !n.is_u64() {
                return Err(format!("Invalid integer for {data_type}"));
            }
            Ok(())
        }
        Value::Number(_) if t.contains("numeric") || t.contains("decimal") || t.contains("real") || t.contains("double") || t == "money" => Ok(()),
        Value::String(s) if t.contains("int") || t == "serial" || t.ends_with("serial") => {
            if s.parse::<i64>().is_err() {
                Err(format!("Invalid integer for {data_type}: \"{s}\""))
            } else {
                Ok(())
            }
        }
        Value::String(_) => Ok(()),
        Value::Object(_) | Value::Array(_) if t == "json" || t == "jsonb" => Ok(()),
        Value::Object(_) | Value::Array(_) => Err(format!("Expected scalar for {data_type}")),
        _ => Ok(()),
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowFilter {
    pub column: String,
    pub op: String,
    #[serde(default)]
    pub value: Option<String>,
    /// How this filter joins to the previous one. None / "and" → AND, "or" → OR.
    #[serde(default)]
    pub conjunct: Option<String>,
    /// PostgreSQL column data type (e.g. "integer", "timestamptz").
    /// When present, the query casts the *parameter* (`$1::integer`) instead of the
    /// *column* (`col::text`), enabling index scans on typed columns.
    #[serde(default)]
    pub data_type: Option<String>,
}

struct WhereClause {
    sql: String,
    binds: Vec<String>,
}

struct QueryBuilder {
    /// (conjunct, sql_fragment) — conjunct is None for the first condition.
    /// Using &'static str avoids a String allocation per filter for "AND"/"OR".
    conditions: Vec<(Option<&'static str>, String)>,
    binds: Vec<String>,
}

impl QueryBuilder {
    fn new() -> Self {
        Self { conditions: Vec::new(), binds: Vec::new() }
    }

    fn push_bind(&mut self, value: String) -> String {
        self.binds.push(value);
        format!("${}", self.binds.len())
    }

    /// Push a condition with an explicit conjunct (AND/OR). The first condition
    /// always uses None so it becomes the bare first term after WHERE.
    fn push_condition(&mut self, cond: String, conjunct: Option<&str>) {
        let c = if self.conditions.is_empty() {
            None
        } else {
            Some(if conjunct.is_some_and(|s| s.eq_ignore_ascii_case("or")) { "OR" } else { "AND" })
        };
        self.conditions.push((c, cond));
    }

    fn build(self) -> WhereClause {
        let sql = if self.conditions.is_empty() {
            String::new()
        } else {
            let mut out = String::from(" WHERE ");
            for (i, (conj, cond)) in self.conditions.into_iter().enumerate() {
                if i > 0 {
                    out.push(' ');
                    out.push_str(conj.unwrap_or("AND"));
                    out.push(' ');
                }
                out.push_str(&cond);
            }
            out
        };
        WhereClause { sql, binds: self.binds }
    }
}

fn escape_ilike_pattern(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn quoted_column(column: &str) -> Result<String, String> {
    validate_ident(column)?;
    Ok(format!(r#""{column}""#))
}

async fn fetch_table_column_names(
    pool: &sqlx::PgPool,
    schema: &str,
    table: &str,
) -> Result<Vec<String>, String> {
    validate_ident(schema)?;
    validate_ident(table)?;
    // pg_attribute is faster than information_schema.columns
    let rows = sqlx::query(
        r#"
        SELECT a.attname::text
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum
        "#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to load columns: {e}"))?;

    Ok(rows
        .iter()
        .filter_map(|r| r.try_get::<String, _>(0).ok())
        .collect())
}

fn ensure_column(column: &str, allowed: &[String]) -> Result<(), String> {
    if allowed.iter().any(|c| c == column) {
        Ok(())
    } else {
        Err(format!("Unknown column: {column}"))
    }
}

/// Map a PostgreSQL data type name to the cast suffix for a bound `TEXT` parameter.
/// Casting the *parameter* (`$1::integer`) lets the query planner use indexes on
/// the column; casting the *column* (`col::text`) makes every condition non-SARGable.
fn pg_param_cast(data_type: Option<&str>) -> &'static str {
    match data_type.unwrap_or("").to_lowercase().as_str() {
        "integer" | "int" | "int2" | "int4" | "int8" | "smallint" | "bigint"
        | "serial" | "smallserial" | "bigserial" => "::bigint",
        "real" | "float4" | "float8" | "double precision" => "::float8",
        "numeric" | "decimal" | "money" => "::numeric",
        "date" => "::date",
        "timestamp" | "timestamp without time zone" | "timestamp with time zone"
        | "timestamptz" => "::timestamptz",
        "time" | "time without time zone" | "time with time zone" | "timetz" => "::timetz",
        "boolean" | "bool" => "::boolean",
        "uuid" => "::uuid",
        _ => "", // text / varchar / unknown: bind as text, compare as text
    }
}

fn build_filter_condition(
    builder: &mut QueryBuilder,
    column: &str,
    op: &str,
    value: Option<&str>,
    conjunct: Option<&str>,
    data_type: Option<&str>,
) -> Result<(), String> {
    let col = quoted_column(column)?;
    let cast = pg_param_cast(data_type);
    // When the column type is known we can cast the *parameter* and leave the
    // column uncast, making the condition SARGable (index-eligible).
    // For unknown types we fall back to casting the column to text.
    let typed = !cast.is_empty();
    match op {
        "is_null" => {
            builder.push_condition(format!("{col} IS NULL"), conjunct);
        }
        "is_not_null" => {
            builder.push_condition(format!("{col} IS NOT NULL"), conjunct);
        }
        "eq" => {
            let p = builder.push_bind(value.unwrap_or("").to_string());
            let cond = if typed { format!("{col} = {p}{cast}") }
                       else    { format!("{col}::text = {p}") };
            builder.push_condition(cond, conjunct);
        }
        "neq" => {
            let p = builder.push_bind(value.unwrap_or("").to_string());
            let cond = if typed { format!("{col} IS DISTINCT FROM {p}{cast}") }
                       else    { format!("{col}::text IS DISTINCT FROM {p}") };
            builder.push_condition(cond, conjunct);
        }
        "gt" => {
            let p = builder.push_bind(value.unwrap_or("").to_string());
            let cond = if typed { format!("{col} > {p}{cast}") }
                       else    { format!("{col}::text > {p}") };
            builder.push_condition(cond, conjunct);
        }
        "gte" => {
            let p = builder.push_bind(value.unwrap_or("").to_string());
            let cond = if typed { format!("{col} >= {p}{cast}") }
                       else    { format!("{col}::text >= {p}") };
            builder.push_condition(cond, conjunct);
        }
        "lt" => {
            let p = builder.push_bind(value.unwrap_or("").to_string());
            let cond = if typed { format!("{col} < {p}{cast}") }
                       else    { format!("{col}::text < {p}") };
            builder.push_condition(cond, conjunct);
        }
        "lte" => {
            let p = builder.push_bind(value.unwrap_or("").to_string());
            let cond = if typed { format!("{col} <= {p}{cast}") }
                       else    { format!("{col}::text <= {p}") };
            builder.push_condition(cond, conjunct);
        }
        "contains" => {
            let raw = value.unwrap_or("");
            let p = builder.push_bind(format!("%{}%", escape_ilike_pattern(raw)));
            builder.push_condition(format!("{col}::text ILIKE {p} ESCAPE '\\'"), conjunct);
        }
        "not_contains" => {
            let raw = value.unwrap_or("");
            let p = builder.push_bind(format!("%{}%", escape_ilike_pattern(raw)));
            builder.push_condition(format!("NOT ({col}::text ILIKE {p} ESCAPE '\\')"), conjunct);
        }
        "starts_with" => {
            let raw = value.unwrap_or("");
            let p = builder.push_bind(format!("{}%", escape_ilike_pattern(raw)));
            builder.push_condition(format!("{col}::text ILIKE {p} ESCAPE '\\'"), conjunct);
        }
        "ends_with" => {
            let raw = value.unwrap_or("");
            let p = builder.push_bind(format!("%{}", escape_ilike_pattern(raw)));
            builder.push_condition(format!("{col}::text ILIKE {p} ESCAPE '\\'"), conjunct);
        }
        "between" => {
            let raw = value.unwrap_or("");
            let mut parts = raw.splitn(2, ',');
            let from = parts.next().unwrap_or("").trim().to_string();
            let to   = parts.next().unwrap_or("").trim().to_string();
            let p1 = builder.push_bind(from);
            let p2 = builder.push_bind(to);
            let cond = if typed {
                format!("({col} >= {p1}{cast} AND {col} <= {p2}{cast})")
            } else {
                format!("({col}::text >= {p1} AND {col}::text <= {p2})")
            };
            builder.push_condition(cond, conjunct);
        }
        _ => return Err(format!("Unsupported filter operator: {op}")),
    }
    Ok(())
}

/// Build an OR-across-all-columns condition for the `__any__` sentinel.
/// Binds the pattern value once and references it in every column condition.
fn build_any_column_condition(
    builder: &mut QueryBuilder,
    columns: &[String],
    op: &str,
    value: &str,
    conjunct: Option<&str>,
) -> Result<(), String> {
    if columns.is_empty() || value.is_empty() {
        return Ok(());
    }
    let parts: Vec<String> = match op {
        "contains" => {
            let p = builder.push_bind(format!("%{}%", escape_ilike_pattern(value)));
            columns.iter().filter_map(|c| quoted_column(c).ok())
                .map(|col| format!("{col}::text ILIKE {p} ESCAPE '\\'")).collect()
        }
        "starts_with" => {
            let p = builder.push_bind(format!("{}%", escape_ilike_pattern(value)));
            columns.iter().filter_map(|c| quoted_column(c).ok())
                .map(|col| format!("{col}::text ILIKE {p} ESCAPE '\\'")).collect()
        }
        "ends_with" => {
            let p = builder.push_bind(format!("%{}", escape_ilike_pattern(value)));
            columns.iter().filter_map(|c| quoted_column(c).ok())
                .map(|col| format!("{col}::text ILIKE {p} ESCAPE '\\'")).collect()
        }
        "eq" => {
            let p = builder.push_bind(value.to_string());
            columns.iter().filter_map(|c| quoted_column(c).ok())
                .map(|col| format!("{col}::text = {p}")).collect()
        }
        _ => return Err(format!("Unsupported operator for any-column filter: {op}")),
    };
    if !parts.is_empty() {
        builder.push_condition(format!("({})", parts.join(" OR ")), conjunct);
    }
    Ok(())
}

fn build_where(
    columns: &[String],
    search: Option<&str>,
    filters: &[RowFilter],
) -> Result<WhereClause, String> {
    let mut builder = QueryBuilder::new();

    if let Some(term) = search.map(str::trim).filter(|s| !s.is_empty()) {
        let pattern = builder.push_bind(format!("%{}%", escape_ilike_pattern(term)));
        let parts: Vec<String> = columns
            .iter()
            .filter_map(|c| quoted_column(c).ok().map(|col| format!("{col}::text ILIKE {pattern} ESCAPE '\\'")))
            .collect();
        if !parts.is_empty() {
            builder.push_condition(format!("({})", parts.join(" OR ")), None);
        }
    }

    for filter in filters {
        let op = filter.op.as_str();
        let conjunct = filter.conjunct.as_deref();

        if filter.column == "__any__" {
            let value = filter.value.as_deref().unwrap_or("").trim();
            if !value.is_empty() {
                build_any_column_condition(&mut builder, columns, op, value, conjunct)?;
            }
            continue;
        }

        ensure_column(&filter.column, columns)?;
        let data_type = filter.data_type.as_deref();
        if op != "is_null" && op != "is_not_null" {
            let value = filter.value.as_deref().unwrap_or("").trim();
            if value.is_empty() {
                continue;
            }
            build_filter_condition(&mut builder, &filter.column, op, Some(value), conjunct, data_type)?;
        } else {
            build_filter_condition(&mut builder, &filter.column, op, None, conjunct, data_type)?;
        }
    }

    Ok(builder.build())
}

fn build_order_by(
    columns: &[String],
    sort_column: Option<&str>,
    sort_direction: Option<&str>,
) -> Result<String, String> {
    let Some(column) = sort_column.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(String::new());
    };
    ensure_column(column, columns)?;
    let col = quoted_column(column)?;
    let dir = match sort_direction.unwrap_or("asc").to_ascii_lowercase().as_str() {
        "desc" => "DESC",
        "asc" => "ASC",
        other => return Err(format!("Invalid sort direction: {other}")),
    };
    Ok(format!(" ORDER BY {col} {dir} NULLS LAST"))
}

const MAX_PAGE_LIMIT: i64 = 2000;

pub async fn get_table_rows(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    limit: i64,
    offset: i64,
    search: Option<String>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    filters: Option<Vec<RowFilter>>,
) -> Result<TableRows, String> {
    if limit > MAX_PAGE_LIMIT {
        return Err(format!("Limit {limit} exceeds the maximum of {MAX_PAGE_LIMIT} rows per page"));
    }
    if limit <= 0 {
        return Err("Limit must be at least 1".to_string());
    }
    if offset < 0 {
        return Err("Offset must be 0 or greater".to_string());
    }

    match require_conn(&state)? {
        ActiveConnection::Sqlite(pool) => {
            return super::sqlite::get_table_rows(
                &pool, &table, limit, offset, search, sort_column, sort_direction, filters,
            ).await;
        }
        ActiveConnection::D1(cfg) => {
            return get_table_rows_d1(&cfg, &table, limit, offset, search, sort_column, sort_direction, filters).await;
        }
        ActiveConnection::Mysql(pool) => {
            return super::mysql::get_table_rows(
                &pool, &schema, &table, limit, offset, search, sort_column, sort_direction, filters,
            ).await;
        }
        ActiveConnection::Postgres(_) => {}
    }
    let pool = require_pool(&state)?;
    let started = std::time::Instant::now();

    validate_ident(&schema)?;
    validate_ident(&table)?;
    let filters = filters.unwrap_or_default();

    let has_search = search.as_deref().map(str::trim).is_some_and(|s| !s.is_empty());
    let has_sort = sort_column.as_deref().map(str::trim).is_some_and(|s| !s.is_empty());
    let table_columns = if has_search || has_sort || !filters.is_empty() {
        fetch_table_column_names(&pool, &schema, &table).await?
    } else {
        vec![]
    };
    let where_clause = build_where(&table_columns, search.as_deref(), &filters)?;
    let order_by = build_order_by(
        &table_columns,
        sort_column.as_deref(),
        sort_direction.as_deref(),
    )?;
    let table_ref = format!(r#""{schema}"."{table}""#);

    let count_sql = format!(
        "SELECT COUNT(*)::bigint FROM {table_ref}{}",
        where_clause.sql
    );
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for value in &where_clause.binds {
        count_query = count_query.bind(value.as_str());
    }

    let limit_param = where_clause.binds.len() + 1;
    let offset_param = where_clause.binds.len() + 2;
    let data_sql = format!(
        "SELECT * FROM {table_ref}{}{} LIMIT ${limit_param} OFFSET ${offset_param}",
        where_clause.sql,
        order_by
    );
    let mut data_query = sqlx::query(&data_sql);
    for value in &where_clause.binds {
        data_query = data_query.bind(value.as_str());
    }
    data_query = data_query.bind(limit).bind(offset);

    // COUNT and data SELECT are independent — run both in parallel.
    let (total_result, rows_result) = tokio::join!(
        count_query.fetch_one(&pool),
        data_query.fetch_all(&pool),
    );
    let total: i64 = total_result.map_err(|e| format!("Failed to count rows: {e}"))?;
    let rows = rows_result.map_err(|e| format!("Failed to fetch rows: {e}"))?;

    let mut columns: Vec<ColumnInfo> = if let Some(first) = rows.first() {
        first
            .columns()
            .iter()
            .map(|c| ColumnInfo::new(c.name(), pg_type_label(c.type_info().name())))
            .collect()
    } else {
        let meta = sqlx::query(
            r#"
            SELECT a.attname::text, t.typname::text
            FROM pg_catalog.pg_attribute a
            JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
            WHERE n.nspname = $1 AND c.relname = $2
              AND a.attnum > 0 AND NOT a.attisdropped
            ORDER BY a.attnum
            "#
        )
        .bind(&schema)
        .bind(&table)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to load columns: {e}"))?;

        meta.iter()
            .filter_map(|r| {
                Some(ColumnInfo::new(
                    r.try_get::<String, _>(0).ok()?,
                    r.try_get::<String, _>(1).ok()?,
                ))
            })
            .collect()
    };

    // Build row data early so the borrow of `rows` doesn't outlive the join.
    let data: Vec<Vec<Value>> = rows
        .iter()
        .map(|row| (0..row.len()).map(|i| cell_to_json(row, i)).collect())
        .collect();

    // All four metadata queries are independent — run them in parallel to halve
    // the number of sequential round-trips and release connections faster.
    let (enums_result, nullable_result, pk_result, fk_result) = tokio::join!(
        fetch_table_column_enums(&pool, &schema, &table),
        fetch_table_column_nullable(&pool, &schema, &table),
        fetch_primary_key(&pool, &schema, &table),
        fetch_foreign_keys(&pool, &schema, &table),
    );
    if let Ok(enums) = enums_result { apply_column_enums(&mut columns, &enums); }
    if let Ok(nullable) = nullable_result { apply_column_nullable(&mut columns, &nullable); }
    let primary_key = pk_result?;
    let foreign_keys = fk_result?;

    Ok(TableRows {
        columns,
        rows: data,
        total,
        query_ms: started.elapsed().as_millis() as u64,
        primary_key,
        foreign_keys,
    })
}

pub async fn update_table_cell(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    primary_key: HashMap<String, Value>,
    column: String,
    value: Value,
) -> Result<(), String> {
    match require_conn(&state)? {
        ActiveConnection::Sqlite(pool) => {
            return super::sqlite::update_table_cell(&pool, &table, primary_key, &column, &value).await;
        }
        ActiveConnection::D1(cfg) => {
            return update_table_cell_d1(&cfg, &table, primary_key, &column, &value).await;
        }
        ActiveConnection::Mysql(pool) => {
            return super::mysql::update_table_cell(&pool, &schema, &table, primary_key, &column, &value).await;
        }
        ActiveConnection::Postgres(_) => {}
    }
    let pool = require_pool(&state)?;

    if primary_key.is_empty() {
        return Err("Cannot update row: table has no primary key".into());
    }

    let pk_columns = fetch_primary_key(&pool, &schema, &table).await?;
    if pk_columns.is_empty() {
        return Err("Cannot update row: table has no primary key".into());
    }

    for pk_col in &pk_columns {
        if !primary_key.contains_key(pk_col) {
            return Err(format!("Missing primary key column: {pk_col}"));
        }
    }

    let meta_rows = sqlx::query(
        r#"
        SELECT
            a.attname::text,
            CASE WHEN t.typtype IN ('e','c','d') THEN 'USER-DEFINED' ELSE t.typname::text END,
            tn.nspname::text,
            t.typname::text
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
        JOIN pg_catalog.pg_namespace tn ON tn.oid = t.typnamespace
        WHERE n.nspname = $1 AND c.relname = $2
          AND a.attnum > 0 AND NOT a.attisdropped
        "#,
    )
    .bind(&schema)
    .bind(&table)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to load column metadata: {e}"))?;

    let mut column_meta: HashMap<String, PgColumnMeta> = HashMap::new();
    for row in &meta_rows {
        if let (Ok(name), Ok(dt)) = (
            row.try_get::<String, _>(0),
            row.try_get::<String, _>(1),
        ) {
            column_meta.insert(
                name,
                PgColumnMeta {
                    data_type: dt,
                    udt_schema: row.try_get(2).ok(),
                    udt_name: row.try_get(3).ok(),
                },
            );
        }
    }

    let col_meta = column_meta
        .get(&column)
        .ok_or_else(|| format!("Unknown column: {column}"))?;

    if normalize_pg_type(&col_meta.data_type).contains("bytea") {
        return Err("Cannot edit bytea columns".into());
    }

    validate_typed_value(&col_meta.data_type, &value)?;

    let mut where_parts = Vec::new();
    let mut bind_idx = 2_u32;

    for pk_col in &pk_columns {
        where_parts.push(format!(r#""{pk_col}" = ${bind_idx}"#));
        bind_idx += 1;
    }

    let set_clause = col_meta.set_assignment_sql(&column)?;
    let sql = format!(
        r#"UPDATE "{schema}"."{table}" SET {set_clause} WHERE {}"#,
        where_parts.join(" AND ")
    );

    let mut q = sqlx::query(&sql);
    q = bind_typed_value(q, &col_meta.data_type, &value)?;
    for pk_col in &pk_columns {
        let pk_val = primary_key
            .get(pk_col)
            .ok_or_else(|| format!("Missing primary key: {pk_col}"))?;
        let pk_meta = column_meta
            .get(pk_col)
            .ok_or_else(|| format!("Missing PK metadata: {pk_col}"))?;
        q = bind_typed_value(q, &pk_meta.data_type, pk_val)?;
    }

    q.execute(&pool)
        .await
        .map_err(|e| format!("Update failed: {e}"))?;

    Ok(())
}

pub async fn insert_table_row(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    values: HashMap<String, Value>,
) -> Result<InsertRowResult, String> {
    if values.is_empty() {
        return Err("Provide at least one column value".into());
    }

    match require_conn(&state)? {
        ActiveConnection::Sqlite(pool) => {
            let row = super::sqlite::insert_table_row(&pool, &table, values).await?;
            return Ok(InsertRowResult { row });
        }
        ActiveConnection::D1(cfg) => {
            let row = insert_table_row_d1(&cfg, &table, values).await?;
            return Ok(InsertRowResult { row });
        }
        ActiveConnection::Mysql(pool) => {
            let row = super::mysql::insert_table_row(&pool, &schema, &table, values).await?;
            return Ok(InsertRowResult { row });
        }
        ActiveConnection::Postgres(_) => {}
    }

    let pool = require_pool(&state)?;
    validate_ident(&schema)?;
    validate_ident(&table)?;

    let meta_rows = sqlx::query(
        r#"
        SELECT
            a.attname::text,
            CASE WHEN t.typtype IN ('e','c','d') THEN 'USER-DEFINED' ELSE t.typname::text END,
            NOT a.attnotnull,
            pg_get_expr(ad.adbin, ad.adrelid),
            a.attidentity IN ('a', 'd'),
            tn.nspname::text,
            t.typname::text
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
        JOIN pg_catalog.pg_namespace tn ON tn.oid = t.typnamespace
        LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
        WHERE n.nspname = $1 AND c.relname = $2
          AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum
        "#,
    )
    .bind(&schema)
    .bind(&table)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to load column metadata: {e}"))?;

    if meta_rows.is_empty() {
        return Err(format!("Table not found: {schema}.{table}"));
    }

    let mut column_order: Vec<String> = Vec::new();
    let mut insert_meta: HashMap<String, PgInsertColumnMeta> = HashMap::new();

    for row in &meta_rows {
        let name: String = row
            .try_get(0)
            .map_err(|e| format!("Invalid column name: {e}"))?;
        let data_type: String = row.try_get(1).unwrap_or_else(|_| "text".into());
        let is_nullable = row.try_get::<bool, _>(2).unwrap_or(true);
        let column_default: Option<String> = row.try_get(3).ok();
        let is_identity = row.try_get::<bool, _>(4).unwrap_or(false);
        let optional =
            pg_column_optional_when_omitted(is_nullable, column_default.as_deref(), is_identity, &data_type);

        column_order.push(name.clone());
        insert_meta.insert(
            name.clone(),
            PgInsertColumnMeta {
                name,
                data_type: data_type.clone(),
                optional_when_omitted: optional,
                pg: PgColumnMeta {
                    data_type,
                    udt_schema: row.try_get(5).ok(),
                    udt_name: row.try_get(6).ok(),
                },
            },
        );
    }

    let mut col_names: Vec<String> = values.keys().cloned().collect();
    col_names.sort();

    let mut insert_cols: Vec<String> = Vec::new();
    let mut placeholders: Vec<String> = Vec::new();
    let mut bind_idx = 1_u32;

    for col_name in &col_names {
        let value = values
            .get(col_name)
            .ok_or_else(|| format!("Missing value for column: {col_name}"))?;
        let meta = insert_meta
            .get(col_name)
            .ok_or_else(|| format!("Unknown column: {col_name}"))?;
        if is_bytea_type(&meta.data_type) {
            return Err(format!("Cannot insert into bytea column: {col_name}"));
        }
        validate_typed_value(&meta.data_type, value)?;
        validate_ident(col_name)?;
        insert_cols.push(format!(r#""{col_name}""#));
        placeholders.push(meta.pg.insert_value_sql(bind_idx)?);
        bind_idx += 1;
    }

    for meta in insert_meta.values() {
        if meta.optional_when_omitted {
            continue;
        }
        if !values.contains_key(&meta.name) {
            return Err(format!(
                "Column \"{}\" is required (NOT NULL, no default)",
                meta.name
            ));
        }
    }

    let cols_sql = insert_cols.join(", ");
    let vals_sql = placeholders.join(", ");
    let sql = format!(
        r#"INSERT INTO "{schema}"."{table}" ({cols_sql}) VALUES ({vals_sql}) RETURNING *"#
    );

    let mut q = sqlx::query(&sql);
    for col_name in &col_names {
        let meta = insert_meta
            .get(col_name)
            .ok_or_else(|| format!("Unknown column: {col_name}"))?;
        q = bind_typed_value(q, &meta.data_type, values.get(col_name).unwrap())?;
    }

    let inserted = q
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("Insert failed: {e}"))?;

    let mut row_out: Vec<Value> = Vec::with_capacity(column_order.len());
    for col_name in &column_order {
        let idx = inserted
            .columns()
            .iter()
            .position(|c| c.name() == col_name.as_str())
            .ok_or_else(|| format!("RETURNING missing column: {col_name}"))?;
        row_out.push(cell_to_json(&inserted, idx));
    }

    Ok(InsertRowResult { row: row_out })
}

pub async fn delete_table_row(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    primary_key: HashMap<String, Value>,
) -> Result<(), String> {
    let deleted = delete_table_rows(state, schema, table, vec![primary_key]).await?;
    if deleted == 0 {
        return Err("No row deleted (row may have changed)".into());
    }
    Ok(())
}

pub async fn delete_table_rows(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    primary_keys: Vec<HashMap<String, Value>>,
) -> Result<u64, String> {
    match require_conn(&state)? {
        ActiveConnection::Sqlite(pool) => {
            return super::sqlite::delete_table_rows(&pool, &table, primary_keys).await;
        }
        ActiveConnection::D1(cfg) => {
            return delete_table_rows_d1(&cfg, &table, primary_keys).await;
        }
        ActiveConnection::Mysql(pool) => {
            return super::mysql::delete_table_rows(&pool, &schema, &table, primary_keys).await;
        }
        ActiveConnection::Postgres(_) => {}
    }
    let pool = require_pool(&state)?;

    if primary_keys.is_empty() {
        return Ok(0);
    }

    let pk_columns = fetch_primary_key(&pool, &schema, &table).await?;
    if pk_columns.is_empty() {
        return Err("Cannot delete rows: table has no primary key".into());
    }

    for (i, primary_key) in primary_keys.iter().enumerate() {
        if primary_key.is_empty() {
            return Err(format!("Row {i} has empty primary key"));
        }
        for pk_col in &pk_columns {
            if !primary_key.contains_key(pk_col) {
                return Err(format!("Row {i} is missing primary key column: {pk_col}"));
            }
        }
    }

    let meta_rows = sqlx::query(
        r#"
        SELECT a.attname::text, t.typname::text
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
        WHERE n.nspname = $1 AND c.relname = $2
          AND a.attnum > 0 AND NOT a.attisdropped
        "#,
    )
    .bind(&schema)
    .bind(&table)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to load column metadata: {e}"))?;

    let mut column_types: HashMap<String, String> = HashMap::new();
    for row in &meta_rows {
        if let (Ok(name), Ok(dt)) = (
            row.try_get::<String, _>(0),
            row.try_get::<String, _>(1),
        ) {
            column_types.insert(name, dt);
        }
    }

    let sql = if pk_columns.len() == 1 {
        let pk_col = &pk_columns[0];
        let placeholders: Vec<String> = (1..=primary_keys.len()).map(|i| format!("${i}")).collect();
        format!(
            r#"DELETE FROM "{schema}"."{table}" WHERE "{pk_col}" IN ({})"#,
            placeholders.join(", ")
        )
    } else {
        let quoted_cols: Vec<String> = pk_columns
            .iter()
            .map(|c| format!(r#""{c}""#))
            .collect();
        let value_rows: Vec<String> = primary_keys
            .iter()
            .enumerate()
            .map(|(row_i, _)| {
                let start = row_i * pk_columns.len() + 1;
                let placeholders: Vec<String> = (0..pk_columns.len())
                    .map(|j| format!("${}", start + j))
                    .collect();
                format!("({})", placeholders.join(", "))
            })
            .collect();
        let match_cols: Vec<String> = pk_columns
            .iter()
            .map(|c| format!(r#"t."{c}" = v."{c}""#))
            .collect();
        format!(
            r#"DELETE FROM "{schema}"."{table}" AS t
USING (VALUES {value_rows}) AS v({quoted_cols})
WHERE {match_cols}"#,
            value_rows = value_rows.join(", "),
            quoted_cols = quoted_cols.join(", "),
            match_cols = match_cols.join(" AND ")
        )
    };

    let mut q = sqlx::query(&sql);
    if pk_columns.len() == 1 {
        let pk_col = &pk_columns[0];
        let pk_type = column_types
            .get(pk_col)
            .ok_or_else(|| format!("Missing PK metadata: {pk_col}"))?;
        for primary_key in &primary_keys {
            let pk_val = primary_key
                .get(pk_col)
                .ok_or_else(|| format!("Missing primary key: {pk_col}"))?;
            q = bind_typed_value(q, pk_type, pk_val)?;
        }
    } else {
        for primary_key in &primary_keys {
            for pk_col in &pk_columns {
                let pk_val = primary_key
                    .get(pk_col)
                    .ok_or_else(|| format!("Missing primary key: {pk_col}"))?;
                let pk_type = column_types
                    .get(pk_col)
                    .ok_or_else(|| format!("Missing PK metadata: {pk_col}"))?;
                q = bind_typed_value(q, pk_type, pk_val)?;
            }
        }
    }

    let result = q
        .execute(&pool)
        .await
        .map_err(|e| format!("Delete failed: {e}"))?;

    Ok(result.rows_affected())
}

fn bind_typed_value<'a>(
    q: sqlx::query::Query<'a, sqlx::Postgres, sqlx::postgres::PgArguments>,
    data_type: &str,
    value: &Value,
) -> Result<sqlx::query::Query<'a, sqlx::Postgres, sqlx::postgres::PgArguments>, String> {
    let t = normalize_pg_type(data_type);

    if value.is_null() {
        return Ok(q.bind(None::<String>));
    }

    match value {
        Value::Bool(b) => Ok(q.bind(*b)),
        Value::Number(n) if n.is_i64() => Ok(q.bind(n.as_i64().unwrap())),
        Value::Number(n) if n.is_u64() => Ok(q.bind(n.as_u64().unwrap() as i64)),
        Value::Number(n) if n.is_f64() => Ok(q.bind(n.as_f64().unwrap())),
        Value::String(s) if t.contains("int") || t == "serial" || t.ends_with("serial") => {
            let parsed = s
                .parse::<i64>()
                .map_err(|_| format!("Invalid integer: {s}"))?;
            Ok(q.bind(parsed))
        }
        Value::String(s) if t == "uuid" => {
            let parsed = s
                .parse::<Uuid>()
                .map_err(|_| format!("Invalid UUID: {s}"))?;
            Ok(q.bind(parsed))
        }
        Value::String(s) if t.contains("numeric") || t.contains("decimal") || t.contains("real") || t.contains("double") => {
            Ok(q.bind(s.clone()))
        }
        Value::String(s) => Ok(q.bind(s.clone())),
        Value::Object(_) | Value::Array(_) if t == "json" || t == "jsonb" => {
            let json_str =
                serde_json::to_string(value).map_err(|e| format!("Invalid JSON value: {e}"))?;
            Ok(q.bind(json_str))
        }
        Value::Number(n) => Ok(q.bind(
            n.as_f64()
                .or_else(|| n.as_i64().map(|v| v as f64))
                .ok_or_else(|| "Invalid number".to_string())?,
        )),
        _ => Err(format!("Unsupported value for {data_type}")),
    }
}

fn is_row_returning_sql(sql: &str) -> bool {
    let head = sql
        .trim_start()
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    matches!(
        head.as_str(),
        "select" | "with" | "show" | "explain" | "values" | "table"
    )
}

/// Execute a single DDL statement that must run outside a transaction (e.g. CREATE DATABASE).
/// Only supported on PostgreSQL and MySQL; executes directly on the connection pool.
pub async fn execute_ddl(state: State<'_, DbState>, sql: String) -> Result<(), String> {
    let sql_str = sql.trim();
    if sql_str.is_empty() {
        return Err("Statement is empty".into());
    }
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => {
            sqlx::query(sql_str)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        ActiveConnection::Mysql(pool) => {
            sqlx::query(sql_str)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        _ => Err("DDL execution outside a transaction is only supported for PostgreSQL and MySQL".into()),
    }
}

pub async fn execute_sql(state: State<'_, DbState>, sql: String) -> Result<SqlResult, String> {
    let sql_str = sql.trim();
    if sql_str.is_empty() {
        return Err("Query is empty".into());
    }
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => execute_sql_pg(&pool, sql_str).await,
        ActiveConnection::Sqlite(pool) => super::sqlite::execute_sql(&pool, sql_str).await,
        ActiveConnection::D1(cfg) => super::d1::query(&cfg, sql_str, vec![]).await,
        ActiveConnection::Mysql(pool) => super::mysql::execute_sql(&pool, sql_str).await,
    }
}

/// Hard row cap for ad-hoc SQL execution. Prevents OOM on tables with millions of rows.
const EXECUTE_SQL_MAX_ROWS: usize = 5_000;
/// Statement timeout for ad-hoc queries (milliseconds).
const EXECUTE_SQL_TIMEOUT_MS: i64 = 30_000;

async fn execute_sql_pg(pool: &sqlx::PgPool, sql: &str) -> Result<SqlResult, String> {
    let started = std::time::Instant::now();
    let query_ms = || started.elapsed().as_millis() as u64;

    // Split into individual statements — the extended query protocol rejects multi-statement input.
    let stmts: Vec<&str> = sql
        .split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();

    if stmts.is_empty() {
        return Err("Query is empty".into());
    }

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin transaction: {e}"))?;

    let _ = sqlx::query(&format!("SET LOCAL statement_timeout = {EXECUTE_SQL_TIMEOUT_MS}"))
        .execute(&mut *tx)
        .await;

    let last_idx = stmts.len() - 1;

    for (i, stmt) in stmts.iter().enumerate() {
        if i == last_idx && is_row_returning_sql(stmt) {
            // Last statement returns rows — stream and return.
            let mut stream = sqlx::query(stmt).fetch(&mut *tx);
            let mut pg_rows: Vec<sqlx::postgres::PgRow> = Vec::new();
            let mut capped = false;

            loop {
                match stream.try_next().await {
                    Ok(Some(row)) => {
                        pg_rows.push(row);
                        if pg_rows.len() >= EXECUTE_SQL_MAX_ROWS {
                            capped = true;
                            break;
                        }
                    }
                    Ok(None) => break,
                    Err(e) => {
                        drop(stream);
                        let _ = tx.rollback().await;
                        return Err(format!("Query failed: {e}"));
                    }
                }
            }
            drop(stream);
            let _ = tx.rollback().await;

            let columns: Vec<ColumnInfo> = pg_rows
                .first()
                .map(|r| {
                    r.columns()
                        .iter()
                        .map(|c| ColumnInfo::new(c.name(), pg_type_label(c.type_info().name())))
                        .collect()
                })
                .unwrap_or_default();

            let data: Vec<Vec<Value>> = pg_rows
                .iter()
                .map(|row| (0..row.len()).map(|i| cell_to_json(row, i)).collect())
                .collect();

            let row_count = data.len() as i64;
            return Ok(SqlResult {
                columns,
                rows: data,
                row_count: Some(row_count),
                message: if capped {
                    Some(format!(
                        "Showing first {EXECUTE_SQL_MAX_ROWS} rows — query returned more. Add a LIMIT clause to fetch a specific range."
                    ))
                } else {
                    None
                },
                query_ms: query_ms(),
            });
        } else {
            let result = sqlx::query(stmt)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Statement {} failed: {e}", i + 1))?;

            if i == last_idx {
                let affected = result.rows_affected() as i64;
                let _ = tx.commit().await;
                return Ok(SqlResult {
                    columns: vec![],
                    rows: vec![],
                    row_count: Some(affected),
                    message: Some(format!("{affected} row(s) affected")),
                    query_ms: query_ms(),
                });
            }
        }
    }

    let _ = tx.commit().await;
    Ok(SqlResult {
        columns: vec![],
        rows: vec![],
        row_count: Some(0),
        message: Some("Done".into()),
        query_ms: query_ms(),
    })
}

// ── D1 helpers (thin wrappers that build SQLite-compatible SQL) ───────────────

async fn get_table_rows_d1(
    cfg: &super::connection::D1Config,
    table: &str,
    limit: i64,
    offset: i64,
    search: Option<String>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    filters: Option<Vec<RowFilter>>,
) -> Result<TableRows, String> {
    let t0 = std::time::Instant::now();
    let tq = format!("\"{}\"", table.replace('"', "\"\""));

    // ── Phase 1: PRAGMA queries — run concurrently ────────────────────────────
    // Both are independent so we fire them at the same time. The shared HTTP
    // client reuses the pooled TLS connection for the second request.
    let pragma_sql = format!("PRAGMA table_info({tq})");
    let fk_sql     = format!("PRAGMA foreign_key_list({tq})");
    let (pragma_res, fk_res) = tokio::join!(
        super::d1::query(cfg, &pragma_sql, vec![]),
        super::d1::query(cfg, &fk_sql, vec![]),
    );
    let pragma = pragma_res?;
    let fk_res = fk_res?;

    let name_idx = pragma.columns.iter().position(|c| c.name == "name").unwrap_or(1);
    let pk_idx   = pragma.columns.iter().position(|c| c.name == "pk").unwrap_or(5);

    let col_names: Vec<String> = pragma.rows.iter()
        .filter_map(|r| r.get(name_idx)?.as_str().map(|s| s.to_string()))
        .collect();

    let mut pk: Vec<(i64, String)> = pragma.rows.iter().filter_map(|r| {
        let pos = r.get(pk_idx)?.as_i64().unwrap_or(0);
        if pos == 0 { return None; }
        let n = r.get(name_idx)?.as_str()?.to_string();
        Some((pos, n))
    }).collect();
    pk.sort_by_key(|(p, _)| *p);
    let primary_key: Vec<String> = pk.into_iter().map(|(_, n)| n).collect();

    let mut fk_map: std::collections::BTreeMap<i64, ForeignKeyInfo> = Default::default();
    if let (Some(id_col), Some(tbl_col), Some(from_col), Some(to_col)) = (
        fk_res.columns.iter().position(|c| c.name == "id"),
        fk_res.columns.iter().position(|c| c.name == "table"),
        fk_res.columns.iter().position(|c| c.name == "from"),
        fk_res.columns.iter().position(|c| c.name == "to"),
    ) {
        for r in &fk_res.rows {
            let id = r.get(id_col).and_then(|v| v.as_i64()).unwrap_or(0);
            let ref_tbl = r.get(tbl_col).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let from = r.get(from_col).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let to = r.get(to_col).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let e = fk_map.entry(id).or_insert(ForeignKeyInfo {
                columns: vec![], referenced_schema: "main".to_string(),
                referenced_table: ref_tbl, referenced_columns: vec![],
            });
            e.columns.push(from);
            e.referenced_columns.push(to);
        }
    }
    let foreign_keys: Vec<ForeignKeyInfo> = fk_map.into_values().collect();

    // ── WHERE / ORDER build ───────────────────────────────────────────────────
    // Each entry: (conjunct — None for first, Some("AND"/"OR") for rest, condition SQL)
    let mut cond_parts: Vec<(Option<&'static str>, String)> = vec![];
    let mut params: Vec<Value> = vec![];

    if let Some(ref s) = search {
        if !s.is_empty() && !col_names.is_empty() {
            let escaped = super::sqlite::escape_like(s);
            let parts: Vec<String> = col_names.iter()
                .map(|c| format!("LOWER(CAST(\"{}\" AS TEXT)) LIKE LOWER(?) ESCAPE '\\'", c.replace('"', "\"\"")))
                .collect();
            cond_parts.push((None, format!("({})", parts.join(" OR "))));
            for _ in &col_names { params.push(Value::String(format!("%{escaped}%"))); }
        }
    }
    if let Some(ref fs) = filters {
        for f in fs {
            let conj: Option<&'static str> = if cond_parts.is_empty() { None }
                else if f.conjunct.as_deref().is_some_and(|s| s.eq_ignore_ascii_case("or")) { Some("OR") }
                else { Some("AND") };

            if f.column == "__any__" {
                if let Some(ref v) = f.value {
                    let v = v.trim();
                    if !v.is_empty() && !col_names.is_empty() {
                        let (parts, extra) = super::sqlite::build_any_column_d1(&col_names, &f.op, v);
                        if !parts.is_empty() {
                            cond_parts.push((conj, format!("({})", parts.join(" OR "))));
                            params.extend(extra);
                        }
                    }
                }
                continue;
            }

            let qcol = format!("\"{}\"", f.column.replace('"', "\"\""));
            match f.op.as_str() {
                "is_null"     => cond_parts.push((conj, format!("{qcol} IS NULL"))),
                "is_not_null" => cond_parts.push((conj, format!("{qcol} IS NOT NULL"))),
                _ => if let Some(ref v) = f.value {
                    let (cond, bp) = super::sqlite::build_d1_filter(&qcol, &f.op, v);
                    cond_parts.push((conj, cond));
                    params.extend(bp);
                },
            }
        }
    }
    let where_clause = if cond_parts.is_empty() { String::new() } else {
        let mut out = String::from("WHERE ");
        for (i, (conj, cond)) in cond_parts.into_iter().enumerate() {
            if i > 0 { out.push(' '); out.push_str(conj.unwrap_or("AND")); out.push(' '); }
            out.push_str(&cond);
        }
        out
    };

    let order_clause = if let Some(col) = sort_column {
        let dir = match sort_direction.as_deref() { Some("desc") => "DESC", _ => "ASC" };
        format!("ORDER BY \"{}\" {dir}", col.replace('"', "\"\""))
    } else { String::new() };

    // ── Phase 2: COUNT + rows — run concurrently ─────────────────────────────
    let count_sql = format!("SELECT COUNT(*) FROM {tq} {where_clause}");
    let rows_sql  = format!("SELECT * FROM {tq} {where_clause} {order_clause} LIMIT ? OFFSET ?");
    let mut row_params = params.clone();
    row_params.push(Value::Number(limit.into()));
    row_params.push(Value::Number(offset.into()));

    let (count_res, rows_res) = tokio::join!(
        super::d1::query(cfg, &count_sql, params),
        super::d1::query(cfg, &rows_sql, row_params),
    );
    let count_res = count_res?;
    let rows_res  = rows_res?;

    let total = count_res.rows.first().and_then(|r| r.first()).and_then(|v| v.as_i64()).unwrap_or(0);

    Ok(TableRows {
        columns: rows_res.columns,
        rows: rows_res.rows,
        total,
        query_ms: t0.elapsed().as_millis() as u64,
        primary_key,
        foreign_keys,
    })
}

async fn update_table_cell_d1(
    cfg: &super::connection::D1Config,
    table: &str,
    primary_key: HashMap<String, Value>,
    column: &str,
    value: &Value,
) -> Result<(), String> {
    use super::d1::query as d1q;

    let pragma = d1q(cfg, &format!("PRAGMA table_info(\"{}\")", table.replace('"', "\"\"")), vec![]).await?;
    let name_idx = pragma.columns.iter().position(|c| c.name == "name").unwrap_or(1);
    let pk_idx   = pragma.columns.iter().position(|c| c.name == "pk").unwrap_or(5);
    let mut pk: Vec<(i64, String)> = pragma.rows.iter().filter_map(|r| {
        let pos = r.get(pk_idx)?.as_i64().unwrap_or(0);
        if pos == 0 { return None; }
        Some((pos, r.get(name_idx)?.as_str()?.to_string()))
    }).collect();
    pk.sort_by_key(|(p, _)| *p);
    if pk.is_empty() { return Err("Cannot update row: table has no primary key".into()); }

    let tq = format!("\"{}\"", table.replace('"', "\"\""));
    let set_col = format!("\"{}\"", column.replace('"', "\"\""));
    let where_parts: Vec<String> = pk.iter().map(|(_, c)| format!("\"{}\" = ?", c.replace('"', "\"\""))).collect();
    let sql = format!("UPDATE {tq} SET {set_col} = ? WHERE {}", where_parts.join(" AND "));

    let mut params = vec![value.clone()];
    for (_, col) in &pk {
        params.push(primary_key.get(col).cloned().unwrap_or(Value::Null));
    }
    d1q(cfg, &sql, params).await?;
    Ok(())
}

async fn insert_table_row_d1(
    cfg: &super::connection::D1Config,
    table: &str,
    values: HashMap<String, Value>,
) -> Result<Vec<Value>, String> {
    use super::d1::query as d1q;

    let tq = format!("\"{}\"", table.replace('"', "\"\""));
    let pragma = d1q(cfg, &format!("PRAGMA table_info({tq})"), vec![]).await?;
    let name_idx = pragma.columns.iter().position(|c| c.name == "name").unwrap_or(1);
    let type_idx = pragma.columns.iter().position(|c| c.name == "type").unwrap_or(2);
    let notnull_idx = pragma.columns.iter().position(|c| c.name == "notnull").unwrap_or(3);
    let dflt_idx = pragma.columns.iter().position(|c| c.name == "dflt_value").unwrap_or(4);
    let pk_idx = pragma.columns.iter().position(|c| c.name == "pk").unwrap_or(5);

    let mut column_order: Vec<String> = Vec::new();
    let mut optional: HashMap<String, bool> = HashMap::new();

    for r in &pragma.rows {
        let name = r
            .get(name_idx)
            .and_then(|v| v.as_str())
            .ok_or("Invalid PRAGMA row")?
            .to_string();
        let col_type = r
            .get(type_idx)
            .and_then(|v| v.as_str())
            .unwrap_or("text");
        let notnull = r.get(notnull_idx).and_then(|v| v.as_i64()).unwrap_or(0) != 0;
        let dflt = r.get(dflt_idx).and_then(|v| v.as_str());
        let pk = r.get(pk_idx).and_then(|v| v.as_i64()).unwrap_or(0);
        let opt = super::sqlite::sqlite_column_optional_when_omitted(notnull, dflt, pk, col_type);
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

    let params: Vec<Value> = col_names
        .iter()
        .map(|c| values.get(c).cloned().unwrap_or(Value::Null))
        .collect();
    let res = d1q(cfg, &sql, params).await?;
    let row = res
        .rows
        .first()
        .ok_or_else(|| "Insert succeeded but RETURNING returned no row".to_string())?;

    Ok(column_order
        .iter()
        .map(|name| {
            let idx = res
                .columns
                .iter()
                .position(|c| c.name == *name)
                .unwrap_or(0);
            row.get(idx).cloned().unwrap_or(Value::Null)
        })
        .collect())
}

async fn delete_table_rows_d1(
    cfg: &super::connection::D1Config,
    table: &str,
    primary_keys: Vec<HashMap<String, Value>>,
) -> Result<u64, String> {
    use super::d1::query as d1q;
    if primary_keys.is_empty() { return Ok(0); }

    let pragma = d1q(cfg, &format!("PRAGMA table_info(\"{}\")", table.replace('"', "\"\"")), vec![]).await?;
    let name_idx = pragma.columns.iter().position(|c| c.name == "name").unwrap_or(1);
    let pk_idx   = pragma.columns.iter().position(|c| c.name == "pk").unwrap_or(5);
    let mut pk: Vec<(i64, String)> = pragma.rows.iter().filter_map(|r| {
        let pos = r.get(pk_idx)?.as_i64().unwrap_or(0);
        if pos == 0 { return None; }
        Some((pos, r.get(name_idx)?.as_str()?.to_string()))
    }).collect();
    pk.sort_by_key(|(p, _)| *p);
    if pk.is_empty() { return Err("Cannot delete rows: table has no primary key".into()); }

    let tq = format!("\"{}\"", table.replace('"', "\"\""));
    let where_parts: Vec<String> = pk.iter().map(|(_, c)| format!("\"{}\" = ?", c.replace('"', "\"\""))).collect();
    let sql = format!("DELETE FROM {tq} WHERE {}", where_parts.join(" AND "));

    let mut total = 0u64;
    for pk_map in primary_keys {
        let params: Vec<Value> = pk.iter().map(|(_, c)| pk_map.get(c).cloned().unwrap_or(Value::Null)).collect();
        let res = d1q(cfg, &sql, params).await?;
        total += res.row_count.unwrap_or(0).max(0) as u64;
    }
    Ok(total)
}
