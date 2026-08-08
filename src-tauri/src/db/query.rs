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
    /// Exact SQL executed for this fetch, so the frontend query log can show it.
    /// When a COUNT(*) is also run, the row SELECT and the COUNT are joined with
    /// a newline (row SELECT first).
    pub sql: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlResult {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<Vec<Value>>,
    pub row_count: Option<i64>,
    pub message: Option<String>,
    pub query_ms: u64,
    /// Exact SQL statement that was executed, so the frontend query log can show
    /// it. Populated by the executing path (or the top-level dispatcher).
    pub sql: String,
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

/// Render a Postgres interval the way Postgres does: "1 year 2 mons 3 days 04:05:06".
/// Units are kept separate rather than normalised into seconds because months and
/// days are not fixed-length — collapsing them would change the value's meaning.
fn format_pg_interval(iv: &sqlx::postgres::types::PgInterval) -> String {
    let mut parts: Vec<String> = Vec::new();

    let years = iv.months / 12;
    let months = iv.months % 12;
    if years != 0 {
        parts.push(format!("{years} year{}", if years.abs() == 1 { "" } else { "s" }));
    }
    if months != 0 {
        parts.push(format!("{months} mon{}", if months.abs() == 1 { "" } else { "s" }));
    }
    if iv.days != 0 {
        parts.push(format!("{} day{}", iv.days, if iv.days.abs() == 1 { "" } else { "s" }));
    }

    let micros = iv.microseconds;
    if micros != 0 || parts.is_empty() {
        let neg = micros < 0;
        let abs = micros.unsigned_abs();
        let total_secs = abs / 1_000_000;
        let frac = abs % 1_000_000;
        let (h, m, sec) = (total_secs / 3600, (total_secs % 3600) / 60, total_secs % 60);
        let mut t = format!("{}{:02}:{:02}:{:02}", if neg { "-" } else { "" }, h, m, sec);
        if frac != 0 {
            // Trim trailing zeros so "1.500000" reads as "1.5", matching Postgres.
            t.push_str(format!(".{frac:06}").trim_end_matches('0'));
        }
        parts.push(t);
    }

    parts.join(" ")
}

pub(crate) fn cell_to_json(row: &sqlx::postgres::PgRow, idx: usize) -> Value {
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

    // Fast path: route the common built-in types by name so a cell doesn't pay
    // for a cascade of failed try_get attempts — every mismatch makes sqlx
    // allocate a formatted "mismatched types" error, up to 12 per cell on a
    // text column. A failed route falls through to the full chain below, so
    // alias/unmatched types behave exactly as before.
    match type_name {
        "BOOL" => try_get!(bool),
        "INT2" => try_get!(i16),
        "INT4" => try_get!(i32),
        "INT8" | "OID" => try_get!(i64),
        "FLOAT4" => try_get!(f32),
        "FLOAT8" => try_get!(f64),
        "NUMERIC" => try_get_string!(Decimal),
        "TIMESTAMPTZ" => try_get_string!(DateTime<Utc>),
        "TIMESTAMP" => try_get_string!(NaiveDateTime),
        "DATE" => try_get_string!(NaiveDate),
        "TIME" => try_get_string!(NaiveTime),
        "UUID" => try_get_string!(Uuid),
        _ => {}
    }

    // Known text types skip the scalar chain entirely: every arm below would
    // fail (allocating its error) before the raw-bytes branch decodes them.
    let known_text = matches!(type_name, "TEXT" | "VARCHAR" | "BPCHAR" | "CHAR" | "NAME");
    if !known_text {
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
    }

    if type_name == "JSON" || type_name == "JSONB" {
        if let Ok(raw) = row.try_get_raw(idx) {
            if raw.is_null() {
                return Value::Null;
            }
            // Peek the wire bytes before decoding: an oversized jsonb cell (e.g. a
            // file buffer serialized into JSON) would otherwise materialize millions
            // of serde_json nodes here and then freeze the webview during IPC parse.
            if let Ok(bytes) = raw.as_bytes() {
                // Binary-format jsonb = 1-byte version header + JSON text. JSON text
                // can never start with 0x01, so stripping it is unambiguous.
                let body = if bytes.first() == Some(&1) { &bytes[1..] } else { bytes };
                if body.len() > super::sql_util::CELL_VALUE_CAP {
                    return super::sql_util::oversize_cell(&type_name.to_lowercase(), body.len(), body);
                }
            }
        }
        if let Ok(v) = row.try_get::<Option<serde_json::Value>, _>(idx) {
            return v.unwrap_or(Value::Null);
        }
    }

    // Array types (varchar[]/text[]/int[]/…). Without this they fall through to the
    // raw-bytes branch below, which reinterprets Postgres's *binary array wire format*
    // (dimension/length header + element data) as lossy UTF-8 → garbage □ boxes.
    // Decode into a Vec and return a JSON array; the frontend renders it {a,b}-style.
    // sqlx validates the element PgType on each try_get, so only the matching arm
    // returns — numeric arms are tried before the String arm so text[] isn't misread.
    if type_name.ends_with("[]") {
        macro_rules! try_arr {
            ($t:ty) => {
                if let Ok(v) = row.try_get::<Option<Vec<Option<$t>>>, _>(idx) {
                    return match v {
                        Some(a) => json!(a),
                        None => Value::Null,
                    };
                }
            };
        }
        // Types that JSON can't hold natively (Decimal/dates/Uuid) → stringify each
        // element so it matches the scalar `to_string()` formatting above.
        macro_rules! try_arr_str {
            ($t:ty) => {
                if let Ok(v) = row.try_get::<Option<Vec<Option<$t>>>, _>(idx) {
                    return match v {
                        Some(a) => json!(a
                            .into_iter()
                            .map(|x| x.map(|y| y.to_string()))
                            .collect::<Vec<_>>()),
                        None => Value::Null,
                    };
                }
            };
        }
        try_arr!(bool);
        try_arr!(i16);
        try_arr!(i32);
        try_arr!(i64);
        try_arr!(f32);
        try_arr!(f64);
        try_arr_str!(Decimal);
        try_arr_str!(DateTime<Utc>);
        try_arr_str!(NaiveDateTime);
        try_arr_str!(NaiveDate);
        try_arr_str!(NaiveTime);
        try_arr_str!(Uuid);
        // Text-like arrays (varchar/text/char/name), tried last.
        if let Ok(v) = row.try_get::<Option<Vec<Option<String>>>, _>(idx) {
            return match v {
                Some(a) => json!(a),
                None => Value::Null,
            };
        }
        // Unknown element type (e.g. enum[]) — fall through to the raw branch.
    }

    // INTERVAL has no text-compatible decode, so without this it reached the raw
    // branch below and Postgres's 16-byte binary interval (months/days/micros) was
    // reinterpreted as UTF-8 — a row of NUL boxes plus whatever byte happened to be
    // printable ("□□□m"). Rebuild Postgres's own text rendering from the parts.
    if type_name == "INTERVAL" {
        if let Ok(v) = row.try_get::<Option<sqlx::postgres::types::PgInterval>, _>(idx) {
            return match v {
                Some(iv) => json!(format_pg_interval(&iv)),
                None => Value::Null,
            };
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
        // Oversize guard before allocating the String — text cells beyond the
        // cap ship as a sentinel + preview instead of the whole value. Non-UTF-8
        // payloads (bytea) fall through to the byte-count placeholder below.
        if let Ok(bytes) = raw.as_bytes() {
            if bytes.len() > super::sql_util::CELL_VALUE_CAP && std::str::from_utf8(bytes).is_ok() {
                return super::sql_util::oversize_cell(&type_name.to_lowercase(), bytes.len(), bytes);
            }
        }
        // Extension types the driver has no decoder for: pgvector, PostGIS, bit
        // strings. Their binary form is packed numbers, so the UTF-8 attempt
        // below can never reach them and the cell used to read `<VECTOR>`.
        // Both byte-level checks happen before `String::decode`, which consumes
        // `raw` — and neither copies the payload.
        if let Ok(bytes) = raw.as_bytes() {
            if let Some(text) = super::pg_ext_types::decode_ext_type(type_name, bytes) {
                return super::sql_util::cap_json_value(
                    &type_name.to_lowercase(),
                    Value::String(text),
                );
            }
            // Not text and not a type we model: show what the bytes are rather
            // than what they aren't. A hex preview is inspectable; `<TYPE>` isn't.
            if !bytes.is_empty()
                && type_name != "BYTEA"
                && std::str::from_utf8(bytes).is_err()
            {
                return json!(super::pg_ext_types::hex_preview(bytes, 64));
            }
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
    /// If this column is a Postgres array, return the quoted array type to cast a
    /// literal to (e.g. `"pg_catalog"."_varchar"`), else None. Array types are
    /// named with a leading underscore in pg_type; information_schema reports the
    /// data_type as the literal "ARRAY" with the array name in udt_name.
    fn array_cast_ref(&self) -> Result<Option<String>, String> {
        let is_array = self.data_type.starts_with('_') || self.data_type.eq_ignore_ascii_case("ARRAY");
        if !is_array {
            return Ok(None);
        }
        // Prefer udt_name when it's a real array name; fall back to data_type.
        let arr_name = self
            .udt_name
            .as_deref()
            .filter(|n| n.starts_with('_'))
            .unwrap_or(self.data_type.as_str());
        if !arr_name.starts_with('_') {
            return Ok(None); // couldn't resolve the concrete array type
        }
        let udt_schema = self.udt_schema.as_deref().unwrap_or("pg_catalog");
        Ok(Some(pg_cast_type_ref(udt_schema, arr_name)?))
    }

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
        // Array columns. PostgreSQL names every array type with a leading
        // underscore (_varchar, _int4, _text, …) — that's what pg_type.typname
        // returns here; information_schema instead reports the literal "ARRAY".
        // The editor sends a Postgres array literal ({"a","b"}); cast it to the
        // real array type so PostgreSQL parses it instead of rejecting it as text.
        if let Some(arr) = self.array_cast_ref()? {
            return Ok(format!(r#""{column}" = $1::{arr}"#));
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
        // Array columns — cast the array-literal string to the real array type.
        if let Some(arr) = self.array_cast_ref()? {
            return Ok(format!("${bind_idx}::{arr}"));
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

/// Keyset (cursor) pagination anchor. When present, the page is fetched with
/// `WHERE {column} {>|<} $val::{sql_type}` instead of OFFSET, so deep pages don't
/// scan-and-discard. The value binds as text and is cast to the column's type so
/// the column stays uncast and its index is usable. Postgres path only.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeysetCursor {
    /// The ordering column (a single-column primary key, or a timestamp for temporal).
    pub column: String,
    /// Last-seen value of `column` on the boundary row, as text.
    pub value: String,
    /// SQL type to cast the bound value to (e.g. "bigint", "uuid", "timestamptz", "text").
    pub sql_type: String,
    /// true = the page AFTER `value` (forward / next); false = BEFORE it (backward / prev).
    pub after: bool,
    /// Display ordering of `column`: false = ASC, true = DESC (temporal is newest-first).
    #[serde(default)]
    pub desc: bool,
}

pub(super) struct WhereClause {
    /// Leading " WHERE …", or empty when there is nothing to filter on.
    pub(super) sql: String,
    pub(super) binds: Vec<String>,
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

/// A column whose Postgres type has no binary output function.
struct TextOnlyColumn {
    name: String,
    type_name: String,
}

/// True when a Postgres error is the driver asking for a binary value the server
/// cannot produce. sqlx always requests binary results, so a single column of a
/// type without `typsend` (PostGIS `raster`, `box2d`, `box3d`, `spheroid`, and
/// plenty of other extension types) fails the *whole* `SELECT *` — the table
/// refuses to open rather than showing the columns it could have decoded.
fn is_missing_binary_output(err: &str) -> bool {
    err.contains("no binary output function available for type")
}

/// The columns of a table whose types have no binary output function, in
/// attribute order. Only consulted after a fetch has already failed with
/// `is_missing_binary_output`, so an ordinary table never pays for it.
async fn fetch_text_only_columns(
    pool: &sqlx::PgPool,
    schema: &str,
    table: &str,
) -> Result<Vec<TextOnlyColumn>, String> {
    validate_ident(schema)?;
    validate_ident(table)?;
    let rows = sqlx::query(
        r#"
        SELECT a.attname::text, t.typname::text
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
        LEFT JOIN pg_catalog.pg_type b ON b.oid = t.typbasetype
        WHERE n.nspname = $1 AND c.relname = $2
          AND a.attnum > 0 AND NOT a.attisdropped
          -- typsend = 0 renders as '-': no binary send function. A domain
          -- inherits its base type's, hence the COALESCE.
          AND COALESCE(NULLIF(t.typsend, 0), b.typsend, 0) = 0
        ORDER BY a.attnum
        "#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to inspect column types: {e}"))?;

    Ok(rows
        .iter()
        .filter_map(|r| {
            Some(TextOnlyColumn {
                name: r.try_get::<String, _>(0).ok()?,
                type_name: r.try_get::<String, _>(1).ok()?,
            })
        })
        .collect())
}

/// How to read a binary-less column as something a cell can hold.
///
/// `::text` is the general answer — it is what psql shows and it round-trips.
/// `raster` is the exception: its text form is the entire tile as WKB hex, which
/// is megabytes for any real raster and useless in a grid either way, so it gets
/// a description of the tile instead. That value is display-only, which costs
/// nothing that wasn't already lost — a type with no binary output cannot be
/// edited through the grid regardless.
fn text_projection(col: &TextOnlyColumn) -> Result<String, String> {
    let q = quoted_column(&col.name)?;
    let expr = match col.type_name.as_str() {
        "raster" => format!(
            "format('raster %sx%s · %s band(s) · SRID %s', \
             ST_Width({q}), ST_Height({q}), ST_NumBands({q}), ST_SRID({q}))"
        ),
        _ => format!("{q}::text"),
    };
    // Always alias: `format(...)` would otherwise report as a column named
    // "format", and the frontend matches cells to columns by name.
    Ok(format!("{expr} AS {q}"))
}

/// A `SELECT` list that reads `text_only` as text and every other column as
/// itself. `None` when the table has no such columns and `*` is already correct.
async fn text_safe_projection(
    pool: &sqlx::PgPool,
    schema: &str,
    table: &str,
) -> Result<Option<(String, Vec<TextOnlyColumn>)>, String> {
    let text_only = fetch_text_only_columns(pool, schema, table).await?;
    if text_only.is_empty() {
        return Ok(None);
    }
    let all = fetch_table_column_names(pool, schema, table).await?;
    let mut parts = Vec::with_capacity(all.len());
    for name in &all {
        match text_only.iter().find(|c| &c.name == name) {
            Some(col) => parts.push(text_projection(col)?),
            None => parts.push(quoted_column(name)?),
        }
    }
    Ok(Some((parts.join(", "), text_only)))
}

/// Which of `names` are types with no binary output function. Used to decide
/// what a hand-written query needs cast; asked only after one has already failed.
async fn types_without_binary_output(pool: &sqlx::PgPool, names: &[String]) -> Vec<String> {
    if names.is_empty() {
        return Vec::new();
    }
    sqlx::query_scalar::<_, String>(
        "SELECT typname::text FROM pg_catalog.pg_type
         WHERE typname = ANY($1) AND COALESCE(NULLIF(typsend, 0), 0) = 0",
    )
    .bind(names)
    .fetch_all(pool)
    .await
    .unwrap_or_default()
}

/// Rewrite a row-returning statement so its binary-less columns come back as
/// text: `SELECT a, b::text AS b FROM (<stmt>) _stroke_text`. This is what lets
/// a hand-written `SELECT * FROM tiles` return rows instead of an error.
///
/// `None` when the statement can't be wrapped without changing what it means —
/// unnamed columns (`?column?`), duplicate names, or nothing needing a cast.
/// The caller then surfaces the original error rather than a rewritten one.
async fn text_safe_wrap(pool: &sqlx::PgPool, stmt: &str) -> Option<String> {
    use sqlx::Executor;

    let inner = stmt.trim().trim_end_matches(';').trim();
    let described = pool.describe(inner).await.ok()?;
    let cols = described.columns();
    if cols.is_empty() {
        return None;
    }

    let type_names: Vec<String> =
        cols.iter().map(|c| c.type_info().name().to_ascii_lowercase()).collect();
    let mut distinct = type_names.clone();
    distinct.sort();
    distinct.dedup();
    let text_only = types_without_binary_output(pool, &distinct).await;
    if text_only.is_empty() {
        return None;
    }

    let mut seen = std::collections::HashSet::new();
    let mut parts = Vec::with_capacity(cols.len());
    for (col, type_name) in cols.iter().zip(&type_names) {
        let name = col.name();
        if name.is_empty() || !seen.insert(name.to_string()) {
            return None;
        }
        if text_only.iter().any(|t| t == type_name) {
            let spec = TextOnlyColumn { name: name.to_string(), type_name: type_name.clone() };
            parts.push(text_projection(&spec).ok()?);
        } else {
            parts.push(quoted_column(name).ok()?);
        }
    }
    Some(format!("SELECT {} FROM ({inner}) AS _stroke_text", parts.join(", ")))
}

pub(super) async fn fetch_table_column_names(
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

/// True for a bare `YYYY-MM-DD` value (no time-of-day). Such a value applied to
/// a timestamp column must match the whole calendar day `[date, date+1)` rather
/// than the midnight instant — otherwise `= '2026-07-06'` compiles to
/// `= '2026-07-06 00:00:00'` and never matches a real timestamp (the filter bug).
fn is_date_only(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b[..4].iter().all(u8::is_ascii_digit)
        && b[5..7].iter().all(u8::is_ascii_digit)
        && b[8..10].iter().all(u8::is_ascii_digit)
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
    // A bare date on a timestamp column means "the whole day", handled per-op
    // below (half-open [date, date+1) ranges). Pure `date`/`time` columns and
    // values that carry a time-of-day keep exact comparison.
    let ts = cast == "::timestamptz";
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
            let v = value.unwrap_or("");
            let day = ts && is_date_only(v);
            let p = builder.push_bind(v.to_string());
            let cond = if day { format!("({col} >= {p}{cast} AND {col} < {p}{cast} + interval '1 day')") }
                       else if typed { format!("{col} = {p}{cast}") }
                       else    { format!("{col}::text = {p}") };
            builder.push_condition(cond, conjunct);
        }
        "neq" => {
            let v = value.unwrap_or("");
            let day = ts && is_date_only(v);
            let p = builder.push_bind(v.to_string());
            let cond = if day { format!("({col} < {p}{cast} OR {col} >= {p}{cast} + interval '1 day')") }
                       else if typed { format!("{col} IS DISTINCT FROM {p}{cast}") }
                       else    { format!("{col}::text IS DISTINCT FROM {p}") };
            builder.push_condition(cond, conjunct);
        }
        "gt" => {
            let v = value.unwrap_or("");
            let day = ts && is_date_only(v);
            let p = builder.push_bind(v.to_string());
            // "after 2026-07-06" (whole day) means at/after the start of the next day.
            let cond = if day { format!("{col} >= {p}{cast} + interval '1 day'") }
                       else if typed { format!("{col} > {p}{cast}") }
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
            let v = value.unwrap_or("");
            let day = ts && is_date_only(v);
            let p = builder.push_bind(v.to_string());
            // "on or before 2026-07-06" (whole day) means before the next day starts.
            let cond = if day { format!("{col} < {p}{cast} + interval '1 day'") }
                       else if typed { format!("{col} <= {p}{cast}") }
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
            // A NULL cell contains nothing, so it satisfies "does not contain".
            builder.push_condition(format!("({col} IS NULL OR NOT ({col}::text ILIKE {p} ESCAPE '\\'))"), conjunct);
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
            match (from.is_empty(), to.is_empty()) {
                (true, true) => { /* both empty — nothing to filter on, skip */ }
                (false, true) => {
                    // only lower bound set
                    let p1 = builder.push_bind(from);
                    let cond = if typed { format!("{col} >= {p1}{cast}") }
                               else    { format!("{col}::text >= {p1}") };
                    builder.push_condition(cond, conjunct);
                }
                (true, false) => {
                    // only upper bound set
                    let to_day = ts && is_date_only(&to);
                    let p2 = builder.push_bind(to);
                    let cond = if to_day { format!("{col} < {p2}{cast} + interval '1 day'") }
                               else if typed { format!("{col} <= {p2}{cast}") }
                               else    { format!("{col}::text <= {p2}") };
                    builder.push_condition(cond, conjunct);
                }
                (false, false) => {
                    // Lower bound is a start-of-day, which is already correct; the
                    // upper bound must include the whole end day when it's a bare date.
                    let to_day = ts && is_date_only(&to);
                    let p1 = builder.push_bind(from);
                    let p2 = builder.push_bind(to);
                    let cond = if typed {
                        let upper = if to_day { format!("{col} < {p2}{cast} + interval '1 day'") }
                                    else { format!("{col} <= {p2}{cast}") };
                        format!("({col} >= {p1}{cast} AND {upper})")
                    } else {
                        format!("({col}::text >= {p1} AND {col}::text <= {p2})")
                    };
                    builder.push_condition(cond, conjunct);
                }
            }
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

pub(super) fn build_where(
    columns: &[String],
    search: Option<&str>,
    search_is_regex: bool,
    filters: &[RowFilter],
) -> Result<WhereClause, String> {
    let mut builder = QueryBuilder::new();

    if let Some(term) = search.map(str::trim).filter(|s| !s.is_empty()) {
        if search_is_regex {
            let pattern = builder.push_bind(term.to_string());
            let parts: Vec<String> = columns
                .iter()
                .filter_map(|c| quoted_column(c).ok().map(|col| format!("{col}::text ~* {pattern}")))
                .collect();
            if !parts.is_empty() {
                builder.push_condition(format!("({})", parts.join(" OR ")), None);
            }
        } else {
            let pattern = builder.push_bind(format!("%{}%", escape_ilike_pattern(term)));
            let parts: Vec<String> = columns
                .iter()
                .filter_map(|c| quoted_column(c).ok().map(|col| format!("{col}::text ILIKE {pattern} ESCAPE '\\'")))
                .collect();
            if !parts.is_empty() {
                builder.push_condition(format!("({})", parts.join(" OR ")), None);
            }
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
            // For "between", allow partial values (handled inside build_filter_condition).
            // For everything else, skip if the value is blank.
            if value.is_empty() && op != "between" {
                continue;
            }
            build_filter_condition(&mut builder, &filter.column, op, Some(value), conjunct, data_type)?;
        } else {
            build_filter_condition(&mut builder, &filter.column, op, None, conjunct, data_type)?;
        }
    }

    Ok(builder.build())
}

/// One key of a multi-column sort. Serialized camelCase from the frontend.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SortSpec {
    pub column: String,
    pub direction: Option<String>,
}

fn build_order_by(
    columns: &[String],
    sort_column: Option<&str>,
    sort_direction: Option<&str>,
    sorts: &[SortSpec],
    // Null placement for every ORDER BY term. `Some("first")`/`Some("last")` map
    // to the explicit clause; anything else (including None/"unset") keeps the
    // historical NULLS LAST default so existing behavior doesn't regress.
    nulls_order: Option<&str>,
) -> Result<String, String> {
    let nulls = match nulls_order {
        Some("first") => "NULLS FIRST",
        _ => "NULLS LAST",
    };
    // Multi-column sort (shift-click headers) takes precedence when present;
    // each key becomes an ORDER BY term in priority order.
    if !sorts.is_empty() {
        let mut parts = Vec::with_capacity(sorts.len());
        for s in sorts {
            let column = s.column.trim();
            if column.is_empty() {
                continue;
            }
            ensure_column(column, columns)?;
            let col = quoted_column(column)?;
            let dir = match s.direction.as_deref().unwrap_or("asc").to_ascii_lowercase().as_str() {
                "desc" => "DESC",
                "asc" => "ASC",
                other => return Err(format!("Invalid sort direction: {other}")),
            };
            parts.push(format!("{col} {dir} {nulls}"));
        }
        return Ok(if parts.is_empty() {
            String::new()
        } else {
            format!(" ORDER BY {}", parts.join(", "))
        });
    }

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
    Ok(format!(" ORDER BY {col} {dir} {nulls}"))
}

const MAX_PAGE_LIMIT: i64 = 5_000_000;

/// Bind a page query's parameters in the fixed order the SQL is built with:
/// WHERE binds, then either the keyset cursor + limit, or limit + offset. Taken
/// out of line so a page can be re-issued with a different SELECT list.
fn bind_page<'q>(
    sql: &'q str,
    where_binds: &'q [String],
    keyset_bind: Option<&'q String>,
    limit: i64,
    offset: i64,
) -> sqlx::query::Query<'q, sqlx::Postgres, sqlx::postgres::PgArguments> {
    let mut q = sqlx::query(sql);
    for value in where_binds {
        q = q.bind(value.as_str());
    }
    match keyset_bind {
        Some(v) => q.bind(v.as_str()).bind(limit),
        None => q.bind(limit).bind(offset),
    }
}

pub async fn get_table_rows(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    limit: i64,
    offset: i64,
    search: Option<String>,
    search_is_regex: bool,
    // Case-sensitive substring search (drops the default case-folding). Honored
    // by SQLite/D1/LibSQL/MySQL; Postgres bakes case into the pattern instead.
    search_case_sensitive: bool,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    filters: Option<Vec<RowFilter>>,
    // When false, skip the catalog metadata queries (enums/nullable/pk/fk) and
    // return only rows + column types. Used for repeat fetches of the same table
    // (pagination, sort, filter, live refresh) where that metadata is unchanged
    // and the frontend already holds it — cutting several round-trips per fetch.
    include_meta: bool,
    // When false, skip the row count entirely and return total = -1 (unknown).
    // The frontend then fetches the count in the background via `count_table_rows`
    // so opening a table / changing filters paints rows immediately instead of
    // waiting on COUNT(*). Postgres-only; other engines ignore it and always count.
    include_count: bool,
    // Multi-column sort keys (Postgres). When non-empty they override
    // sort_column/sort_direction; other engines ignore this and use the single
    // sort_column (the primary key), so multi-sort degrades gracefully.
    sorts: Vec<SortSpec>,
    // Keyset (cursor) pagination anchor. When Some, the page is fetched with a
    // keyset predicate instead of OFFSET (Postgres path only; other engines and
    // absent = classic OFFSET). The caller only sends this when it's safe
    // (single-column key, ordering by that key), else it falls back to offset.
    keyset: Option<KeysetCursor>,
    // Null placement for the ORDER BY ("first"/"last", or None to keep the
    // NULLS LAST default). Applied on the dialects that support explicit null
    // placement (Postgres, SQLite, D1/libSQL, MySQL); ignored by ClickHouse/etc.
    nulls_order: Option<String>,
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
                &pool, &table, limit, offset, search, search_case_sensitive, sort_column, sort_direction, filters, include_meta, nulls_order,
            ).await;
        }
        ActiveConnection::D1(cfg) => {
            return get_table_rows_remote(&cfg, &table, limit, offset, search, search_case_sensitive, sort_column, sort_direction, filters, include_meta, nulls_order).await;
        }
        ActiveConnection::LibSql(cfg) => {
            return get_table_rows_remote(&cfg, &table, limit, offset, search, search_case_sensitive, sort_column, sort_direction, filters, include_meta, nulls_order).await;
        }
        ActiveConnection::Mysql(pool) => {
            return super::mysql::get_table_rows(
                &pool, &schema, &table, limit, offset, search, search_is_regex, search_case_sensitive, sort_column, sort_direction, filters, include_meta, nulls_order,
            ).await;
        }
        ActiveConnection::Clickhouse(cfg) => {
            return super::clickhouse::get_table_rows(
                &cfg, &table, limit, offset, search, sort_column, sort_direction, filters, include_meta,
            ).await;
        }
        ActiveConnection::Redis(cfg) => {
            return super::redis::get_table_rows(
                &cfg, &table, limit, offset, search, sort_column, sort_direction, filters, include_meta,
            ).await;
        }
        ActiveConnection::Duckdb(h) => {
            return super::duckdb::get_table_rows(
                &h, &table, limit, offset, search, sort_column, sort_direction, filters, include_meta,
            ).await;
        }
        ActiveConnection::Mssql(h) => {
            return super::mssql::get_table_rows(
                &h, &schema, &table, limit, offset, search, sort_column, sort_direction, filters, include_meta,
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
    let has_sort = sort_column.as_deref().map(str::trim).is_some_and(|s| !s.is_empty()) || !sorts.is_empty();
    let table_columns = if has_search || has_sort || !filters.is_empty() {
        fetch_table_column_names(&pool, &schema, &table).await?
    } else {
        vec![]
    };
    let where_clause = build_where(&table_columns, search.as_deref(), search_is_regex, &filters)?;
    let order_by = build_order_by(
        &table_columns,
        sort_column.as_deref(),
        sort_direction.as_deref(),
        &sorts,
        nulls_order.as_deref(),
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

    // Keyset (cursor) page when a valid cursor is supplied, otherwise classic
    // OFFSET. The cursor's cast type is sanitized to a safe token subset so it
    // can be interpolated (bound params can't carry a type); an unsafe type falls
    // back to offset. Backward paging fetches in reverse then flips the rows.
    let keyset_ok = keyset.as_ref().filter(|k| {
        !k.sql_type.is_empty()
            && k.sql_type.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == ' ')
    });
    // The keyset predicate (`{col} >/< $val` + `ORDER BY {col}`) has no NULLS
    // handling, so on a NULLABLE ordering column it would skip/reorder NULL rows
    // relative to the OFFSET path (which emits explicit NULLS FIRST/LAST). Only
    // take the fast-path when the ordering column is provably NOT NULL; otherwise
    // fall back to OFFSET, which is always correct.
    let keyset_ok = match keyset_ok {
        Some(k) => {
            let nullable = fetch_table_column_nullable(&pool, &schema, &table).await?;
            // Require the column to be known AND non-nullable. Unknown column =>
            // don't fast-path (stay safe).
            match nullable.get(&k.column) {
                Some(false) => Some(k),
                _ => None,
            }
        }
        None => None,
    };
    let keyset_reverse;
    // Cursor value to bind after the WHERE binds (keyset), or None (offset). The
    // SQL string is built here in the outer scope so it outlives `data_query`.
    let keyset_bind: Option<String>;
    // Everything after the SELECT list, so the same page can be re-issued with a
    // different projection if a column turns out to have no binary output.
    let data_tail: String;
    if let Some(ks) = keyset_ok {
        let col = quoted_column(&ks.column)?;
        let op = if ks.after == !ks.desc { ">" } else { "<" };
        let fetch_desc = if ks.after { ks.desc } else { !ks.desc };
        let fetch_order = if fetch_desc { "DESC" } else { "ASC" };
        keyset_reverse = !ks.after;
        keyset_bind = Some(ks.value.clone());
        let ks_param = where_clause.binds.len() + 1;
        let limit_param = where_clause.binds.len() + 2;
        let connector = if where_clause.sql.is_empty() { " WHERE" } else { " AND" };
        data_tail = format!(
            "FROM {table_ref}{where}{connector} {col} {op} ${ks_param}::{cast} ORDER BY {col} {fetch_order} LIMIT ${limit_param}",
            where = where_clause.sql,
            cast = ks.sql_type,
        );
    } else {
        keyset_reverse = false;
        keyset_bind = None;
        let limit_param = where_clause.binds.len() + 1;
        let offset_param = where_clause.binds.len() + 2;
        data_tail = format!(
            "FROM {table_ref}{}{} LIMIT ${limit_param} OFFSET ${offset_param}",
            where_clause.sql,
            order_by
        );
    }
    let mut data_sql = format!("SELECT * {data_tail}");
    let data_query = bind_page(&data_sql, &where_clause.binds, keyset_bind.as_ref(), limit, offset);

    // Kick the catalog-metadata queries (enums/nullable/pk/fk) off NOW so they run
    // concurrently with the row + count fetch below, instead of as a second
    // round-trip *after* it. That serial second batch was the extra latency users
    // felt on the FIRST open of a table (repeat fetches skip metadata entirely and
    // are already single-round-trip). Spawned so it progresses while we await the
    // rows; joined once the columns are built.
    let meta_task = if include_meta {
        let pool = pool.clone();
        let schema = schema.clone();
        let table = table.clone();
        Some(tokio::spawn(async move {
            tokio::join!(
                fetch_table_column_enums(&pool, &schema, &table),
                fetch_table_column_nullable(&pool, &schema, &table),
                fetch_primary_key(&pool, &schema, &table),
                fetch_foreign_keys(&pool, &schema, &table),
            )
        }))
    } else {
        None
    };

    // For an unfiltered listing, COUNT(*) on a large table is a full sequential
    // scan that can take seconds — that's the "pause" when opening a big table.
    // Use the planner's row estimate (pg_class.reltuples) instead, which is
    // instant, and only fall back to an exact COUNT when the table is small
    // (estimate < threshold, where an exact count is sub-millisecond) or has
    // never been analyzed (reltuples = -1). Filtered/searched queries always use
    // an exact count since the WHERE clause bounds the scan and accuracy matters.
    const ESTIMATE_THRESHOLD: i64 = 100_000;
    let rows_res;
    let total: i64;
    if !include_count {
        // Non-blocking mode: fetch only the page of rows and defer the count.
        // total = -1 signals "unknown / counting" to the UI (same sentinel the
        // sidebar already uses); the frontend fills it in via count_table_rows.
        rows_res = data_query.fetch_all(&pool).await;
        total = -1;
    } else if where_clause.sql.is_empty() {
        // Estimate and data fetch are independent — run them together so the
        // planner estimate adds no extra round-trip in series.
        let estimate_query = sqlx::query_scalar::<_, i64>(
            "SELECT reltuples::bigint FROM pg_class WHERE oid = $1::regclass",
        )
        .bind(&table_ref);
        let (estimate_res, page_res) =
            tokio::join!(estimate_query.fetch_optional(&pool), data_query.fetch_all(&pool));
        rows_res = page_res;
        let estimate = estimate_res.ok().flatten();
        total = match estimate {
            Some(est) if est >= ESTIMATE_THRESHOLD => est,
            _ => count_query
                .fetch_one(&pool)
                .await
                .map_err(|e| format!("Failed to count rows: {e}"))?,
        };
    } else {
        // COUNT and data SELECT are independent — run both in parallel.
        let (total_result, page_res) = tokio::join!(
            count_query.fetch_one(&pool),
            data_query.fetch_all(&pool),
        );
        total = total_result.map_err(|e| format!("Failed to count rows: {e}"))?;
        rows_res = page_res;
    }

    // A single column of a type with no binary output (PostGIS `raster` and
    // friends) fails the whole `SELECT *`. Re-read the page with those columns
    // projected as text so the table opens with every other column intact,
    // rather than showing an error where the grid should be. Only reached on a
    // table that actually has one — the common path never runs these queries.
    let mut text_only: Vec<TextOnlyColumn> = Vec::new();
    let rows = match rows_res {
        Ok(rows) => rows,
        Err(err) => {
            let msg = err.to_string();
            if !is_missing_binary_output(&msg) {
                return Err(format!("Failed to fetch rows: {msg}"));
            }
            match text_safe_projection(&pool, &schema, &table).await? {
                Some((projection, cols)) => {
                    text_only = cols;
                    data_sql = format!("SELECT {projection} {data_tail}");
                    bind_page(&data_sql, &where_clause.binds, keyset_bind.as_ref(), limit, offset)
                        .fetch_all(&pool)
                        .await
                        .map_err(|e| format!("Failed to fetch rows: {e}"))?
                }
                None => return Err(format!("Failed to fetch rows: {msg}")),
            }
        }
    };

    // Column names + types come from the result set itself (free, always fresh).
    let mut columns: Vec<ColumnInfo> = if let Some(first) = rows.first() {
        first
            .columns()
            .iter()
            .map(|c| ColumnInfo::new(c.name(), pg_type_label(c.type_info().name())))
            .collect()
    } else if !include_meta {
        // Repeat fetch with an empty result page — frontend keeps its columns.
        Vec::new()
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

    // A re-read page reports its cast columns as `text`. Restore the real type
    // names so the header, the type filters and the cell viewers still see a
    // `raster`/`box2d` column rather than a string one.
    for col in &text_only {
        if let Some(info) = columns.iter_mut().find(|c| c.name == col.name) {
            info.data_type = pg_type_label(&col.type_name);
        }
    }

    // Build row data early so the borrow of `rows` doesn't outlive the join.
    let mut data: Vec<Vec<Value>> = rows
        .iter()
        .map(|row| (0..row.len()).map(|i| cell_to_json(row, i)).collect())
        .collect();
    // Backward keyset page was fetched in reverse order — flip it back to the
    // table's display order.
    if keyset_reverse {
        data.reverse();
    }

    // Catalog metadata (enums/nullable/pk/fk) is stable per table, so only fetch
    // it on the first load — repeat fetches (pagination/sort/filter/live) reuse
    // what the frontend already holds, saving four round-trips and connections.
    // Metadata was fired off above (concurrent with the row/count fetch); collect
    // it now that the columns are built so enum/nullable info can be applied.
    let (primary_key, foreign_keys) = if let Some(task) = meta_task {
        let (enums_result, nullable_result, pk_result, fk_result) =
            task.await.map_err(|e| format!("Failed to load table metadata: {e}"))?;
        if let Ok(enums) = enums_result { apply_column_enums(&mut columns, &enums); }
        if let Ok(nullable) = nullable_result { apply_column_nullable(&mut columns, &nullable); }
        (pk_result?, fk_result?)
    } else {
        (Vec::new(), Vec::new())
    };

    // Report the exact SQL run: the row SELECT always, plus the COUNT(*) as a
    // second line whenever a count was computed (include_count).
    let sql = if include_count {
        format!("{data_sql}\n{count_sql}")
    } else {
        data_sql.clone()
    };

    Ok(TableRows {
        columns,
        rows: data,
        total,
        query_ms: started.elapsed().as_millis() as u64,
        primary_key,
        foreign_keys,
        sql,
    })
}

/// Row count for the main grid, fetched separately so `get_table_rows` can
/// return rows immediately (include_count = false) while the UI fills the total
/// in asynchronously. Mirrors the count logic in `get_table_rows`: planner
/// estimate for a large *unfiltered* table (instant), exact `COUNT(*)` otherwise
/// (the WHERE clause bounds the scan). Non-Postgres engines return -1 — their
/// `get_table_rows` already carries a real total, so the UI keeps that.
pub async fn count_table_rows(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    search: Option<String>,
    search_is_regex: bool,
    filters: Option<Vec<RowFilter>>,
) -> Result<i64, String> {
    match require_conn(&state)? {
        ActiveConnection::Postgres(_) => {}
        _ => return Ok(-1),
    }
    let pool = require_pool(&state)?;
    validate_ident(&schema)?;
    validate_ident(&table)?;
    let filters = filters.unwrap_or_default();

    let has_search = search.as_deref().map(str::trim).is_some_and(|s| !s.is_empty());
    let table_columns = if has_search || !filters.is_empty() {
        fetch_table_column_names(&pool, &schema, &table).await?
    } else {
        vec![]
    };
    let where_clause = build_where(&table_columns, search.as_deref(), search_is_regex, &filters)?;
    let table_ref = format!(r#""{schema}"."{table}""#);

    const ESTIMATE_THRESHOLD: i64 = 100_000;
    if where_clause.sql.is_empty() {
        let estimate = sqlx::query_scalar::<_, i64>(
            "SELECT reltuples::bigint FROM pg_class WHERE oid = $1::regclass",
        )
        .bind(&table_ref)
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten();
        if let Some(est) = estimate {
            if est >= ESTIMATE_THRESHOLD {
                return Ok(est);
            }
        }
    }

    let count_sql = format!("SELECT COUNT(*)::bigint FROM {table_ref}{}", where_clause.sql);
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for value in &where_clause.binds {
        count_query = count_query.bind(value.as_str());
    }

    // This runs in the background, so it must not inherit the session's
    // 10-minute statement_timeout (see open_pg) — a filtered COUNT(*) on a big
    // table would pin a pooled connection for minutes, the exact starvation the
    // sidebar counts guard against (schema.rs). Budget is larger than the
    // sidebar's 4s since this count is user-visible in the grid. SET LOCAL
    // needs a transaction; rollback hands the connection back with the session
    // default intact.
    const GRID_COUNT_TIMEOUT: &str = "30s";
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to count rows: {e}"))?;
    let _ = sqlx::query(&format!("SET LOCAL statement_timeout = '{GRID_COUNT_TIMEOUT}'"))
        .execute(&mut *tx)
        .await;
    let count = count_query.fetch_one(&mut *tx).await;
    let _ = tx.rollback().await;
    match count {
        Ok(n) => Ok(n),
        // 57014 = query_canceled (statement timeout). A count that can't finish
        // in budget degrades to -1 ("unknown") instead of an error toast.
        Err(sqlx::Error::Database(db)) if db.code().as_deref() == Some("57014") => Ok(-1),
        Err(e) => Err(format!("Failed to count rows: {e}")),
    }
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
            return update_table_cell_remote(&cfg, &table, primary_key, &column, &value).await;
        }
        ActiveConnection::LibSql(cfg) => {
            return update_table_cell_remote(&cfg, &table, primary_key, &column, &value).await;
        }
        ActiveConnection::Mysql(pool) => {
            return super::mysql::update_table_cell(&pool, &schema, &table, primary_key, &column, &value).await;
        }
        ActiveConnection::Clickhouse(_) => {
            return Err("Inline row editing is not supported for ClickHouse (OLAP). Use ALTER TABLE … UPDATE in the SQL console.".into());
        }
        ActiveConnection::Redis(_) => {
            return Err("Editing is not supported on Redis".into());
        }
        ActiveConnection::Duckdb(h) => {
            return super::duckdb::update_table_cell(&h, &table, primary_key, &column, &value).await;
        }
        ActiveConnection::Mssql(h) => {
            return super::mssql::update_table_cell(&h, &schema, &table, primary_key, &column, &value).await;
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
            let row = insert_table_row_remote(&cfg, &table, values).await?;
            return Ok(InsertRowResult { row });
        }
        ActiveConnection::LibSql(cfg) => {
            let row = insert_table_row_remote(&cfg, &table, values).await?;
            return Ok(InsertRowResult { row });
        }
        ActiveConnection::Mysql(pool) => {
            let row = super::mysql::insert_table_row(&pool, &schema, &table, values).await?;
            return Ok(InsertRowResult { row });
        }
        ActiveConnection::Clickhouse(_) => {
            return Err("Row insertion via the grid is not supported for ClickHouse. Use INSERT INTO … in the SQL console.".into());
        }
        ActiveConnection::Redis(_) => {
            return Err("Editing is not supported on Redis".into());
        }
        ActiveConnection::Duckdb(h) => {
            let row = super::duckdb::insert_table_row(&h, &table, values).await?;
            return Ok(InsertRowResult { row });
        }
        ActiveConnection::Mssql(h) => {
            let row = super::mssql::insert_table_row(&h, &schema, &table, values).await?;
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
        let value = values
            .get(col_name)
            .ok_or_else(|| format!("Missing value for column: {col_name}"))?;
        q = bind_typed_value(q, &meta.data_type, value)?;
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
            return delete_table_rows_remote(&cfg, &table, primary_keys).await;
        }
        ActiveConnection::LibSql(cfg) => {
            return delete_table_rows_remote(&cfg, &table, primary_keys).await;
        }
        ActiveConnection::Mysql(pool) => {
            return super::mysql::delete_table_rows(&pool, &schema, &table, primary_keys).await;
        }
        ActiveConnection::Clickhouse(_) => {
            return Err("Row deletion via the grid is not supported for ClickHouse. Use ALTER TABLE … DELETE in the SQL console.".into());
        }
        ActiveConnection::Redis(_) => {
            return Err("Editing is not supported on Redis".into());
        }
        ActiveConnection::Duckdb(h) => {
            return super::duckdb::delete_table_rows(&h, &table, primary_keys).await;
        }
        ActiveConnection::Mssql(h) => {
            return super::mssql::delete_table_rows(&h, &schema, &table, primary_keys).await;
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
        // Bind a NULL whose parameter type matches the column family. The base
        // SET clause is `"col" = $1` with no cast, so a text-typed NULL against a
        // non-text column (e.g. int4) fails assignment-cast checking with
        // "column is of type integer but expression is of type text".
        if t.contains("int") || t == "serial" || t.ends_with("serial") || t == "oid" {
            return Ok(q.bind(None::<i64>));
        }
        if t == "bool" || t == "boolean" {
            return Ok(q.bind(None::<bool>));
        }
        if t == "uuid" {
            return Ok(q.bind(None::<Uuid>));
        }
        if t.contains("numeric")
            || t.contains("decimal")
            || t.contains("real")
            || t.contains("double")
            || t.contains("float")
        {
            return Ok(q.bind(None::<f64>));
        }
        // text/varchar/char, plus json/jsonb and datetime types whose SET clause
        // already carries an explicit `$1::type` cast that absorbs a text NULL.
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
    let head = super::sql_util::statement_head(sql);
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
    let sql_str = sql.trim().to_string();
    if sql_str.is_empty() {
        return Err("Query is empty".into());
    }
    let conn = require_conn(&state)?;
    let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel::<()>();
    *state.cancel_tx.lock().map_err(|e| e.to_string())? = Some(cancel_tx);
    // Kept for the query log — the per-dialect executor runs `sql_str` (which is
    // moved into the cancellable branch below), so stamp the executed SQL onto
    // the result after the match.
    let sql_out = sql_str.clone();
    let mut result = match conn {
        // Postgres and MySQL support real server-side cancellation: the engine
        // captures its backend/connection id and cancels the running statement
        // when the receiver fires.
        ActiveConnection::Postgres(pool) => execute_sql_pg(&pool, &sql_str, Some(cancel_rx)).await,
        ActiveConnection::Mysql(pool) => super::mysql::execute_sql(&pool, &sql_str, Some(cancel_rx)).await,
        // Engines without a server-side cancel primitive: abandon the future when
        // cancelled so the UI unblocks (the statement then finishes or times out
        // server-side). This preserves the previous behavior for these engines.
        other => tokio::select! {
            r = async move {
                match other {
                    ActiveConnection::Sqlite(pool) => super::sqlite::execute_sql(&pool, &sql_str).await,
                    ActiveConnection::D1(cfg) => super::d1::query(&cfg, &sql_str, vec![]).await,
                    ActiveConnection::LibSql(cfg) => super::libsql::query(&cfg, &sql_str, vec![]).await,
                    ActiveConnection::Clickhouse(cfg) => super::clickhouse::query(&cfg, &sql_str).await,
                    ActiveConnection::Redis(cfg) => super::redis::query(&cfg, &sql_str).await,
                    ActiveConnection::Duckdb(h) => super::duckdb::execute_sql(&h, &sql_str).await,
                    ActiveConnection::Mssql(h) => super::mssql::execute_sql(&h, &sql_str).await,
                    ActiveConnection::Postgres(_) | ActiveConnection::Mysql(_) => unreachable!(),
                }
            } => r,
            _ = async { let _ = cancel_rx.await; } => Err("Query cancelled".to_string()),
        },
    };
    if let Ok(r) = &mut result {
        r.sql = sql_out;
    }
    result
}

/// Execute a SQL query against an arbitrary saved connection without changing
/// the global active connection. Opens a temporary pool, runs the query, then
/// drops the pool. Used by the Data Diff feature for cross-host comparisons.
pub async fn execute_sql_on_conn(
    config: super::connection::AnyConnectionConfig,
    sql: &str,
) -> Result<SqlResult, String> {
    use super::connection::{open_mysql, open_pg, open_sqlite, AnyConnectionConfig};
    let sql = sql.trim();
    if sql.is_empty() {
        return Err("Query is empty".into());
    }
    let mut result = match config {
        AnyConnectionConfig::Postgres(c) => {
            let pool = open_pg(&c).await?;
            let result = execute_sql_pg(&pool, sql, None).await;
            pool.close().await;
            result
        }
        AnyConnectionConfig::Sqlite(c) => {
            let pool = open_sqlite(&c).await?;
            let result = super::sqlite::execute_sql(&pool, sql).await;
            pool.close().await;
            result
        }
        AnyConnectionConfig::D1(c) => super::d1::query(&c, sql, vec![]).await,
        AnyConnectionConfig::Mysql(c) => {
            let pool = open_mysql(&c).await?;
            let result = super::mysql::execute_sql(&pool, sql, None).await;
            pool.close().await;
            result
        }
        AnyConnectionConfig::Libsql(c) => super::libsql::query(&c, sql, vec![]).await,
        AnyConnectionConfig::Clickhouse(c) => super::clickhouse::query(&c, sql).await,
        AnyConnectionConfig::Redis(c) => super::redis::query(&c, sql).await,
        AnyConnectionConfig::Duckdb(c) => {
            let h = super::connection::open_duckdb(&c).await?;
            super::duckdb::execute_sql(&h, sql).await
        }
        AnyConnectionConfig::Mssql(c) => {
            let h = super::connection::open_mssql(&c).await?;
            super::mssql::execute_sql(&h, sql).await
        }
    };
    if let Ok(r) = &mut result {
        r.sql = sql.to_string();
    }
    result
}

/// Row cap for ad-hoc SQL execution. Deliberately set beyond any realistic
/// result (effectively uncapped — the user asked for these rows); it remains
/// only as a last-resort circuit breaker whose "add a LIMIT" message tells the
/// user what happened.
const EXECUTE_SQL_MAX_ROWS: usize = 1_000_000_000;
/// Statement timeout for ad-hoc queries (milliseconds). Generous enough for
/// heavier scans (e.g. tables with large TOASTed JSON columns) to finish.
const EXECUTE_SQL_TIMEOUT_MS: i64 = 60_000;

async fn execute_sql_pg(
    pool: &sqlx::PgPool,
    sql: &str,
    // When `Some`, real cancellation is armed: if the receiver fires we ask the
    // server to cancel this query's backend (so the statement actually stops)
    // rather than merely abandoning the future while the server keeps working.
    // Callers that can't be cancelled (diff/multi paths) pass `None`.
    cancel_rx: Option<tokio::sync::oneshot::Receiver<()>>,
) -> Result<SqlResult, String> {
    let started = std::time::Instant::now();
    let query_ms = || started.elapsed().as_millis() as u64;

    // Split into individual statements — the extended query protocol rejects multi-statement input.
    // Use the literal/comment/dollar-quote-aware splitter so `;` inside strings,
    // `--`/`/* */` comments, and `$$…$$` bodies don't cut a statement in half.
    let split = split_sql_statements(sql);
    let stmts: Vec<&str> = split
        .iter()
        .map(|s| s.trim())
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

    // Arm server-side cancellation. Capture the backend PID for THIS connection,
    // then watch the cancel channel on a background task; on cancel we run
    // pg_cancel_backend on a *separate* pooled connection, which makes the
    // in-flight statement error out. If the query finishes first the sender is
    // dropped and `rx.await` errors, so the watcher is a no-op.
    if let Some(rx) = cancel_rx {
        if let Ok(pid) = sqlx::query_scalar::<_, i32>("SELECT pg_backend_pid()")
            .fetch_one(&mut *tx)
            .await
        {
            let cancel_pool = pool.clone();
            tokio::spawn(async move {
                if rx.await.is_ok() {
                    let _ = sqlx::query("SELECT pg_cancel_backend($1)")
                        .bind(pid)
                        .execute(&cancel_pool)
                        .await;
                }
            });
        }
    }

    let last_idx = stmts.len() - 1;

    for (i, stmt) in stmts.iter().enumerate() {
        if i == last_idx && is_row_returning_sql(stmt) {
            // Last statement returns rows — stream and return. `executed` is the
            // statement actually run: the user's, or a text-projecting rewrite of
            // it after a column turned out to have no binary output. Each row is
            // converted to JSON as it streams in and the driver row dropped
            // immediately — retaining the full Vec<PgRow> alongside the JSON rows
            // would double peak memory on a large result.
            let mut executed = stmt.to_string();
            let mut columns: Vec<ColumnInfo> = Vec::new();
            let mut data: Vec<Vec<Value>> = Vec::new();
            let mut capped = false;
            let mut rewritten = false;

            loop {
                let mut stream = sqlx::query(&executed).fetch(&mut *tx);
                let mut failure = None;
                loop {
                    match stream.try_next().await {
                        Ok(Some(row)) => {
                            if data.is_empty() {
                                columns = row
                                    .columns()
                                    .iter()
                                    .map(|c| ColumnInfo::new(c.name(), pg_type_label(c.type_info().name())))
                                    .collect();
                            }
                            data.push((0..row.len()).map(|i| cell_to_json(&row, i)).collect());
                            if data.len() >= EXECUTE_SQL_MAX_ROWS {
                                capped = true;
                                break;
                            }
                        }
                        Ok(None) => break,
                        Err(e) => {
                            failure = Some(e.to_string());
                            break;
                        }
                    }
                }
                drop(stream);

                let Some(msg) = failure else { break };
                // The transaction is poisoned by the failed statement either way.
                let _ = tx.rollback().await;
                if rewritten || !is_missing_binary_output(&msg) {
                    return Err(format!("Query failed: {msg}"));
                }
                let Some(wrapped) = text_safe_wrap(pool, stmt).await else {
                    return Err(format!("Query failed: {msg}"));
                };
                executed = wrapped;
                rewritten = true;
                columns.clear();
                data.clear();
                capped = false;
                tx = pool
                    .begin()
                    .await
                    .map_err(|e| format!("Failed to begin transaction: {e}"))?;
                let _ = sqlx::query(&format!(
                    "SET LOCAL statement_timeout = {EXECUTE_SQL_TIMEOUT_MS}"
                ))
                .execute(&mut *tx)
                .await;
            }
            let _ = tx.rollback().await;

            let row_count = data.len() as i64;
            return Ok(SqlResult {
                columns,
                rows: data,
                row_count: Some(row_count),
                message: if capped {
                    Some(format!(
                        "Result capped at {EXECUTE_SQL_MAX_ROWS} rows — add a LIMIT clause to fetch a specific range."
                    ))
                } else {
                    None
                },
                query_ms: query_ms(),
                sql: stmt.to_string(),
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
                    sql: stmt.to_string(),
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
        sql: sql.to_string(),
    })
}

/// True if `s` contains anything besides whitespace, semicolons, and comments.
fn sql_fragment_is_meaningful(s: &str) -> bool {
    let b = s.as_bytes();
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'-' if i + 1 < b.len() && b[i + 1] == b'-' => {
                while i < b.len() && b[i] != b'\n' {
                    i += 1;
                }
            }
            b'/' if i + 1 < b.len() && b[i + 1] == b'*' => match s[i + 2..].find("*/") {
                Some(p) => i = i + 2 + p + 2,
                None => i = b.len(),
            },
            b';' | b' ' | b'\t' | b'\r' | b'\n' => i += 1,
            _ => return true,
        }
    }
    false
}

/// Split a SQL script into individual statements on `;`, without splitting
/// inside quoted strings (`'…'` with `''`/`\'` escapes, `"…"`, backticks),
/// line/block comments, or Postgres dollar-quoted bodies (`$$…$$`, `$tag$…$tag$`).
/// Comment-only fragments are dropped. Mirrors `src/lib/sql-statements.js`.
fn split_sql_statements(sql: &str) -> Vec<String> {
    let b = sql.as_bytes();
    let n = b.len();
    let mut out: Vec<String> = Vec::new();
    let mut i = 0usize;
    let mut start = 0usize;

    fn flush(sql: &str, start: &mut usize, end: usize, out: &mut Vec<String>) {
        let frag = sql[*start..end].trim();
        if sql_fragment_is_meaningful(frag) {
            out.push(frag.to_string());
        }
        *start = end;
    }

    while i < n {
        match b[i] {
            b'-' if i + 1 < n && b[i + 1] == b'-' => {
                while i < n && b[i] != b'\n' {
                    i += 1;
                }
            }
            b'/' if i + 1 < n && b[i + 1] == b'*' => match sql[i + 2..].find("*/") {
                Some(p) => i = i + 2 + p + 2,
                None => i = n,
            },
            quote @ (b'\'' | b'"' | b'`') => {
                i += 1;
                while i < n {
                    if quote == b'\'' && b[i] == b'\\' {
                        i += 2;
                        continue;
                    }
                    if b[i] == quote {
                        // '' inside a single-quoted string is an escaped quote
                        if quote == b'\'' && i + 1 < n && b[i + 1] == b'\'' {
                            i += 2;
                            continue;
                        }
                        i += 1;
                        break;
                    }
                    i += 1;
                }
            }
            b'$' => {
                // Dollar-quote opener: `$$` or `$tag$` where tag starts with alpha/_
                let mut j = i + 1;
                while j < n && (b[j] == b'_' || b[j].is_ascii_alphanumeric()) {
                    j += 1;
                }
                let tag_ok = j == i + 1 || b[i + 1] == b'_' || b[i + 1].is_ascii_alphabetic();
                if tag_ok && j < n && b[j] == b'$' {
                    let tag = &sql[i..=j];
                    match sql[j + 1..].find(tag) {
                        Some(p) => i = j + 1 + p + tag.len(),
                        None => i = n,
                    }
                } else {
                    i += 1;
                }
            }
            b';' => {
                i += 1;
                flush(sql, &mut start, i, &mut out);
            }
            _ => i += 1,
        }
    }
    flush(sql, &mut start, n, &mut out);
    out
}

async fn execute_sql_multi_pg(pool: &sqlx::PgPool, stmts: &[String]) -> Result<Vec<SqlResult>, String> {
    // Single statement — delegate to existing path (avoids code duplication)
    if stmts.len() == 1 {
        return execute_sql_pg(pool, &stmts[0], None).await.map(|r| vec![r]);
    }

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin transaction: {e}"))?;

    let _ = sqlx::query(&format!("SET LOCAL statement_timeout = {EXECUTE_SQL_TIMEOUT_MS}"))
        .execute(&mut *tx)
        .await;

    let mut results: Vec<SqlResult> = Vec::new();

    for stmt in stmts {
        let stmt_started = std::time::Instant::now();
        let stmt_ms = || stmt_started.elapsed().as_millis() as u64;

        if is_row_returning_sql(stmt) {
            let mut stream = sqlx::query(stmt).fetch(&mut *tx);
            // Stream-convert rows (see execute_sql_pg) so the driver rows aren't
            // retained alongside the JSON rows.
            let mut columns: Vec<ColumnInfo> = Vec::new();
            let mut data: Vec<Vec<Value>> = Vec::new();
            let mut capped = false;

            loop {
                match stream.try_next().await {
                    Ok(Some(row)) => {
                        if data.is_empty() {
                            columns = row
                                .columns()
                                .iter()
                                .map(|c| ColumnInfo::new(c.name(), pg_type_label(c.type_info().name())))
                                .collect();
                        }
                        data.push((0..row.len()).map(|i| cell_to_json(&row, i)).collect());
                        if data.len() >= EXECUTE_SQL_MAX_ROWS {
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

            let row_count = data.len() as i64;
            results.push(SqlResult {
                columns,
                rows: data,
                row_count: Some(row_count),
                message: if capped {
                    Some(format!("Result capped at {EXECUTE_SQL_MAX_ROWS} rows"))
                } else {
                    None
                },
                query_ms: stmt_ms(),
                sql: stmt.clone(),
            });
        } else {
            match sqlx::query(stmt).execute(&mut *tx).await {
                Ok(result) => {
                    let affected = result.rows_affected() as i64;
                    results.push(SqlResult {
                        columns: vec![],
                        rows: vec![],
                        row_count: Some(affected),
                        message: Some(format!("{affected} row(s) affected")),
                        query_ms: stmt_ms(),
                        sql: stmt.clone(),
                    });
                }
                Err(e) => {
                    let _ = tx.rollback().await;
                    return Err(format!("Statement failed: {e}"));
                }
            }
        }
    }

    let _ = tx.commit().await;
    Ok(results)
}

pub async fn execute_sql_multi(state: State<'_, DbState>, sql: String) -> Result<Vec<SqlResult>, String> {
    let sql_str = sql.trim().to_string();
    if sql_str.is_empty() {
        return Err("Query is empty".into());
    }
    let conn = require_conn(&state)?;
    let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel::<()>();
    *state.cancel_tx.lock().map_err(|e| e.to_string())? = Some(cancel_tx);
    let stmts = split_sql_statements(&sql_str);
    if stmts.is_empty() {
        return Err("Query is empty".into());
    }
    let result = tokio::select! {
        r = async move {
            // Postgres runs multi-statement scripts inside a single transaction
            if let ActiveConnection::Postgres(pool) = &conn {
                return execute_sql_multi_pg(pool, &stmts).await;
            }
            // Other engines: execute sequentially, one result set per statement.
            // Cancellation happens at the outer select! (the future is dropped),
            // so per-statement executors get no cancel receiver — same as the
            // other diff/multi callers.
            let multi = stmts.len() > 1;
            let mut results: Vec<SqlResult> = Vec::with_capacity(stmts.len());
            for (idx, stmt) in stmts.iter().enumerate() {
                let r = match &conn {
                    ActiveConnection::Postgres(_) => unreachable!("handled above"),
                    ActiveConnection::Sqlite(pool) => super::sqlite::execute_sql(pool, stmt).await,
                    ActiveConnection::D1(cfg) => super::d1::query(cfg, stmt, vec![]).await,
                    ActiveConnection::LibSql(cfg) => super::libsql::query(cfg, stmt, vec![]).await,
                    ActiveConnection::Mysql(pool) => super::mysql::execute_sql(pool, stmt, None).await,
                    ActiveConnection::Clickhouse(cfg) => super::clickhouse::query(cfg, stmt).await,
                    ActiveConnection::Redis(cfg) => super::redis::query(cfg, stmt).await,
                    ActiveConnection::Duckdb(h) => super::duckdb::execute_sql(h, stmt).await,
                    ActiveConnection::Mssql(h) => super::mssql::execute_sql(h, stmt).await,
                };
                match r {
                    Ok(res) => results.push(res),
                    Err(e) if multi => return Err(format!("Statement {} failed: {e}", idx + 1)),
                    Err(e) => return Err(e),
                }
            }
            Ok(results)
        } => r,
        _ = async { let _ = cancel_rx.await; } => Err("Query cancelled".to_string()),
    };
    result
}

// ── D1 / LibSQL helpers (SQLite-over-HTTP) ────────────────────────────────────
//
// Cloudflare D1 and Turso/LibSQL are both SQLite reached over HTTP with an
// identical `query(cfg, sql, params)` entry point and byte-identical row
// browsing/mutation logic. This trait lets the helpers below be written once and
// dispatched to either backend, instead of maintaining two verbatim copies.
#[allow(async_fn_in_trait)]
trait RemoteSqlite {
    async fn run(&self, sql: &str, params: Vec<Value>) -> Result<SqlResult, String>;
}

impl RemoteSqlite for super::connection::D1Config {
    async fn run(&self, sql: &str, params: Vec<Value>) -> Result<SqlResult, String> {
        super::d1::query(self, sql, params).await
    }
}

impl RemoteSqlite for super::connection::LibSqlConfig {
    async fn run(&self, sql: &str, params: Vec<Value>) -> Result<SqlResult, String> {
        super::libsql::query(self, sql, params).await
    }
}

async fn get_table_rows_remote<C: RemoteSqlite>(
    cfg: &C,
    table: &str,
    limit: i64,
    offset: i64,
    search: Option<String>,
    search_case_sensitive: bool,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    filters: Option<Vec<RowFilter>>,
    // When false, skip the PRAGMA round-trips (each is a full HTTPS request to
    // Cloudflare/Turso) — the frontend already holds PK/FK metadata on repeat
    // fetches (pagination/sort/filter/live) and keeps its cached values.
    include_meta: bool,
    nulls_order: Option<String>,
) -> Result<TableRows, String> {
    let t0 = std::time::Instant::now();
    let tq = format!("\"{}\"", table.replace('"', "\"\""));

    // ── Phase 1: PRAGMA queries ───────────────────────────────────────────────
    // table_info is also needed on metadata-skipping fetches whenever a search
    // or filter has to be built across the column list.
    let pragma_sql = format!("PRAGMA table_info({tq})");
    let fk_sql     = format!("PRAGMA foreign_key_list({tq})");
    let has_search  = search.as_ref().is_some_and(|s| !s.is_empty());
    let has_filters = filters.as_ref().is_some_and(|f| !f.is_empty());

    let extract_col_names = |pragma: &SqlResult| -> Vec<String> {
        let name_idx = pragma.columns.iter().position(|c| c.name == "name").unwrap_or(1);
        pragma.rows.iter()
            .filter_map(|r| r.get(name_idx)?.as_str().map(|s| s.to_string()))
            .collect()
    };

    let (col_names, primary_key, foreign_keys) = if include_meta {
        // Both are independent so we fire them at the same time. The shared HTTP
        // client reuses the pooled TLS connection for the second request.
        let (pragma_res, fk_res) = tokio::join!(
            cfg.run(&pragma_sql, vec![]),
            cfg.run(&fk_sql, vec![]),
        );
        let pragma = pragma_res?;
        let fk_res = fk_res?;

        let name_idx = pragma.columns.iter().position(|c| c.name == "name").unwrap_or(1);
        let pk_idx   = pragma.columns.iter().position(|c| c.name == "pk").unwrap_or(5);

        let col_names = extract_col_names(&pragma);

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
        (col_names, primary_key, fk_map.into_values().collect())
    } else if has_search || has_filters {
        let pragma = cfg.run(&pragma_sql, vec![]).await?;
        (extract_col_names(&pragma), Vec::new(), Vec::new())
    } else {
        (Vec::new(), Vec::new(), Vec::new())
    };

    // ── WHERE / ORDER build ───────────────────────────────────────────────────
    // Each entry: (conjunct — None for first, Some("AND"/"OR") for rest, condition SQL)
    let mut cond_parts: Vec<(Option<&'static str>, String)> = vec![];
    let mut params: Vec<Value> = vec![];

    if let Some(ref s) = search {
        if !s.is_empty() && !col_names.is_empty() {
            // Case-insensitive folds both operands with LOWER(); case-sensitive
            // compares the raw text. instr() has no LIKE pattern-length cap.
            let parts: Vec<String> = col_names.iter()
                .map(|c| {
                    let qc = c.replace('"', "\"\"");
                    if search_case_sensitive {
                        format!("instr(CAST(\"{qc}\" AS TEXT), ?) > 0")
                    } else {
                        format!("instr(LOWER(CAST(\"{qc}\" AS TEXT)), LOWER(?)) > 0")
                    }
                })
                .collect();
            cond_parts.push((None, format!("({})", parts.join(" OR "))));
            for _ in &col_names { params.push(Value::String(s.clone())); }
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
        // D1/libSQL are SQLite, so explicit null placement is honored here too.
        let nulls = match nulls_order.as_deref() {
            Some("first") => "NULLS FIRST",
            _ => "NULLS LAST",
        };
        format!("ORDER BY \"{}\" {dir} {nulls}", col.replace('"', "\"\""))
    } else { String::new() };

    // ── Phase 2: COUNT + rows — run concurrently ─────────────────────────────
    let count_sql = format!("SELECT COUNT(*) FROM {tq} {where_clause}");
    let rows_sql  = format!("SELECT * FROM {tq} {where_clause} {order_clause} LIMIT ? OFFSET ?");
    let mut row_params = params.clone();
    row_params.push(Value::Number(limit.into()));
    row_params.push(Value::Number(offset.into()));

    let (count_res, rows_res) = tokio::join!(
        cfg.run(&count_sql, params),
        cfg.run(&rows_sql, row_params),
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
        sql: format!("{rows_sql}\n{count_sql}"),
    })
}

async fn update_table_cell_remote<C: RemoteSqlite>(
    cfg: &C,
    table: &str,
    primary_key: HashMap<String, Value>,
    column: &str,
    value: &Value,
) -> Result<(), String> {
    let pragma = cfg.run(&format!("PRAGMA table_info(\"{}\")", table.replace('"', "\"\"")), vec![]).await?;
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
    cfg.run(&sql, params).await?;
    Ok(())
}

async fn insert_table_row_remote<C: RemoteSqlite>(
    cfg: &C,
    table: &str,
    values: HashMap<String, Value>,
) -> Result<Vec<Value>, String> {
    let tq = format!("\"{}\"", table.replace('"', "\"\""));
    let pragma = cfg.run(&format!("PRAGMA table_info({tq})"), vec![]).await?;
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
    let res = cfg.run(&sql, params).await?;
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

async fn delete_table_rows_remote<C: RemoteSqlite>(
    cfg: &C,
    table: &str,
    primary_keys: Vec<HashMap<String, Value>>,
) -> Result<u64, String> {
    if primary_keys.is_empty() { return Ok(0); }

    let pragma = cfg.run(&format!("PRAGMA table_info(\"{}\")", table.replace('"', "\"\"")), vec![]).await?;
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

    // Single-column PK: batch into `IN (…)` chunks — each request here is a full
    // HTTPS round-trip to Cloudflare/Turso, so deleting N selected rows must not
    // cost N requests. Composite PKs keep the per-row loop.
    if pk.len() == 1 {
        let col = &pk[0].1;
        let qcol = format!("\"{}\"", col.replace('"', "\"\""));
        let mut total = 0u64;
        for chunk in primary_keys.chunks(100) {
            let placeholders = vec!["?"; chunk.len()].join(", ");
            let sql = format!("DELETE FROM {tq} WHERE {qcol} IN ({placeholders})");
            let params: Vec<Value> = chunk.iter().map(|m| m.get(col).cloned().unwrap_or(Value::Null)).collect();
            let res = cfg.run(&sql, params).await?;
            total += res.row_count.unwrap_or(0).max(0) as u64;
        }
        return Ok(total);
    }

    let where_parts: Vec<String> = pk.iter().map(|(_, c)| format!("\"{}\" = ?", c.replace('"', "\"\""))).collect();
    let sql = format!("DELETE FROM {tq} WHERE {}", where_parts.join(" AND "));

    let mut total = 0u64;
    for pk_map in primary_keys {
        let params: Vec<Value> = pk.iter().map(|(_, c)| pk_map.get(c).cloned().unwrap_or(Value::Null)).collect();
        let res = cfg.run(&sql, params).await?;
        total += res.row_count.unwrap_or(0).max(0) as u64;
    }
    Ok(total)
}


// ── Column Stats ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnStats {
    pub column: String,
    pub count: i64,
    pub null_count: i64,
    pub distinct_count: Option<i64>,
    pub min: Option<Value>,
    pub max: Option<Value>,
    pub avg: Option<f64>,
}

pub async fn get_column_stats(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    column: String,
) -> Result<ColumnStats, String> {
    validate_ident(&schema).map_err(|e| e.to_string())?;
    validate_ident(&table).map_err(|e| e.to_string())?;
    validate_ident(&column).map_err(|e| e.to_string())?;

    // Non-PostgreSQL engines (SQLite, MySQL, D1, LibSQL, ClickHouse, DuckDB,
    // MSSQL): compute stats with a dialect-agnostic aggregate routed through
    // execute_sql, which decodes result rows for every driver. The tuned
    // PostgreSQL path below (array handling, ::numeric AVG) stays unchanged.
    if !matches!(require_conn(&state)?, ActiveConnection::Postgres(_)) {
        return column_stats_generic(state, schema, table, column).await;
    }

    let pool = require_pool(&state)?;

    let tq  = format!("\"{}\".\"{}\"", schema.replace('"', "\"\""), table.replace('"', "\"\""));
    let col = format!("\"{}\"", column.replace('"', "\"\""));

    let type_row = sqlx::query(
        "SELECT data_type FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2 AND column_name = $3 LIMIT 1"
    )
    .bind(&schema)
    .bind(&table)
    .bind(&column)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let data_type: String = type_row
        .as_ref()
        .and_then(|r| r.try_get::<String, _>(0).ok())
        .unwrap_or_default()
        .to_lowercase();

    let is_array = data_type == "array";
    let is_numeric = !is_array && ["int","numeric","decimal","real","double","float","money","serial"]
        .iter().any(|t| data_type.contains(t));

    // For array columns skip min/max/distinct/avg — PostgreSQL would return
    // array-literal strings like "{val1,val2}" which are meaningless here.
    if is_array {
        let count_sql = format!("SELECT COUNT(*) AS total, COUNT(*) - COUNT({col}) AS null_count FROM {tq}");
        let row = sqlx::query(&count_sql)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;
        let count: i64      = row.try_get("total").unwrap_or(0);
        let null_count: i64 = row.try_get("null_count").unwrap_or(0);
        return Ok(ColumnStats { column, count, null_count, distinct_count: None, min: None, max: None, avg: None });
    }

    let avg_expr = if is_numeric {
        format!("AVG({col}::numeric)")
    } else {
        "NULL::double precision".to_string()
    };

    let sql = format!(
        "SELECT COUNT(*) AS total,
                COUNT(*) - COUNT({col}) AS null_count,
                COUNT(DISTINCT {col}) AS distinct_count,
                MIN({col}::text) AS min_val,
                MAX({col}::text) AS max_val,
                {avg_expr} AS avg_val
         FROM {tq}"
    );

    let row = sqlx::query(&sql)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let count: i64      = row.try_get("total").unwrap_or(0);
    let null_count: i64 = row.try_get("null_count").unwrap_or(0);
    let distinct_count: Option<i64> = row.try_get("distinct_count").ok();
    let avg: Option<f64> = row.try_get::<Option<f64>, _>("avg_val").unwrap_or(None);
    let min: Option<Value> = row.try_get::<Option<String>, _>("min_val").ok().flatten().map(Value::String);
    let max: Option<Value> = row.try_get::<Option<String>, _>("max_val").ok().flatten().map(Value::String);

    Ok(ColumnStats { column, count, null_count, distinct_count, min, max, avg })
}

/// Cross-dialect column statistics for every non-PostgreSQL engine. Builds a
/// dialect-quoted aggregate and routes it through `execute_sql`, which already
/// decodes result rows for each driver (sqlx engines + the HTTP engines like D1,
/// LibSQL and ClickHouse). Falls back to a plain count when the engine rejects
/// MIN/MAX/DISTINCT on the column type (e.g. JSON/BLOB), so the panel still shows
/// total + null counts instead of erroring.
async fn column_stats_generic(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    column: String,
) -> Result<ColumnStats, String> {
    use super::sql_util::{quote_backtick, quote_bracket, quote_double};

    let conn = require_conn(&state)?;
    let (tref, col) = match &conn {
        // MySQL treats the schema as the database; ClickHouse likewise. Both
        // quote with backticks.
        ActiveConnection::Mysql(_) | ActiveConnection::Clickhouse(_) => {
            let t = if schema.is_empty() {
                quote_backtick(&table)
            } else {
                format!("{}.{}", quote_backtick(&schema), quote_backtick(&table))
            };
            (t, quote_backtick(&column))
        }
        ActiveConnection::Mssql(_) => {
            let t = if schema.is_empty() {
                quote_bracket(&table)
            } else {
                format!("{}.{}", quote_bracket(&schema), quote_bracket(&table))
            };
            (t, quote_bracket(&column))
        }
        // SQLite, D1, LibSQL, DuckDB — double-quoted, single-namespace (no
        // PostgreSQL-style schema qualifier).
        _ => (quote_double(&table), quote_double(&column)),
    };

    let full = format!(
        "SELECT COUNT(*) AS total, COUNT({col}) AS non_null, \
         COUNT(DISTINCT {col}) AS distinct_count, MIN({col}) AS min_val, MAX({col}) AS max_val \
         FROM {tref}"
    );
    let res = match dispatch_stats_sql(&conn, &full).await {
        Ok(r) => r,
        Err(_) => {
            let basic = format!("SELECT COUNT(*) AS total, COUNT({col}) AS non_null FROM {tref}");
            dispatch_stats_sql(&conn, &basic).await?
        }
    };

    let row = res.rows.into_iter().next().unwrap_or_default();
    let as_i64 = |v: Option<&Value>| -> i64 {
        match v {
            Some(Value::Number(n)) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)).unwrap_or(0),
            Some(Value::String(s)) => s.parse().unwrap_or(0),
            _ => 0,
        }
    };
    let total = as_i64(row.get(0));
    let non_null = as_i64(row.get(1));
    let distinct_count = row.get(2).filter(|v| !v.is_null()).map(|v| as_i64(Some(v)));
    let min = row.get(3).filter(|v| !v.is_null()).cloned();
    let max = row.get(4).filter(|v| !v.is_null()).cloned();

    Ok(ColumnStats {
        column,
        count: total,
        null_count: total - non_null,
        distinct_count,
        min,
        max,
        avg: None,
    })
}

/// Run a bounded read-only aggregate against a borrowed active connection (any
/// engine). Mirrors `execute_sql`'s per-driver dispatch minus the cancellation
/// plumbing — used by `column_stats_generic`, which needs to borrow the
/// connection (so it can retry with a fallback query) rather than move `State`.
async fn dispatch_stats_sql(conn: &ActiveConnection, sql: &str) -> Result<SqlResult, String> {
    match conn {
        ActiveConnection::Postgres(pool) => execute_sql_pg(pool, sql, None).await,
        ActiveConnection::Mysql(pool) => super::mysql::execute_sql(pool, sql, None).await,
        ActiveConnection::Sqlite(pool) => super::sqlite::execute_sql(pool, sql).await,
        ActiveConnection::D1(cfg) => super::d1::query(cfg, sql, vec![]).await,
        ActiveConnection::LibSql(cfg) => super::libsql::query(cfg, sql, vec![]).await,
        ActiveConnection::Clickhouse(cfg) => super::clickhouse::query(cfg, sql).await,
        ActiveConnection::Redis(_) => Err("Column statistics are not supported on Redis".into()),
        ActiveConnection::Duckdb(h) => super::duckdb::execute_sql(h, sql).await,
        ActiveConnection::Mssql(h) => super::mssql::execute_sql(h, sql).await,
    }
}

/// Lightweight connection health check — runs `SELECT 1` against the active
/// connection. HTTP-based engines (D1, LibSQL, Clickhouse) are stateless so we
/// return Ok immediately; a real request would validate their tokens but also
/// incur network cost every 30 s.
pub async fn ping_connection(state: State<'_, DbState>) -> Result<(), String> {
    let conn = require_conn(&state)?;
    match conn {
        ActiveConnection::Postgres(pool) => {
            sqlx::query("SELECT 1").execute(&pool).await.map(|_| ()).map_err(|e| e.to_string())
        }
        ActiveConnection::Sqlite(pool) => {
            sqlx::query("SELECT 1").execute(&pool).await.map(|_| ()).map_err(|e| e.to_string())
        }
        ActiveConnection::Mysql(pool) => {
            sqlx::query("SELECT 1").execute(&pool).await.map(|_| ()).map_err(|e| e.to_string())
        }
        // HTTP-based: stateless, no persistent TCP connection to validate
        ActiveConnection::D1(_) | ActiveConnection::LibSql(_) | ActiveConnection::Clickhouse(_) | ActiveConnection::Redis(_) => Ok(()),
        ActiveConnection::Duckdb(h) => super::duckdb::execute_sql(&h, "SELECT 1").await.map(|_| ()),
        ActiveConnection::Mssql(h) => super::mssql::execute_sql(&h, "SELECT 1").await.map(|_| ()),
    }
}

#[cfg(test)]
mod split_sql_tests {
    use super::split_sql_statements;

    #[test]
    fn splits_on_semicolons() {
        let s = split_sql_statements("select 1; select 2;");
        assert_eq!(s, vec!["select 1;", "select 2;"]);
    }

    #[test]
    fn ignores_semicolons_in_strings_and_comments() {
        let s = split_sql_statements(
            "select 'a;b', \"c;d\" -- not; here\nfrom t; /* nor; here */ select `e;f`;",
        );
        assert_eq!(s.len(), 2);
        assert!(s[0].starts_with("select 'a;b'"));
    }

    #[test]
    fn ignores_semicolons_in_dollar_quotes() {
        let s = split_sql_statements(
            "create function f() returns void as $body$ begin; end; $body$ language plpgsql; select 1;",
        );
        assert_eq!(s.len(), 2);
        assert!(s[1].starts_with("select 1"));
    }

    #[test]
    fn handles_escaped_quotes() {
        let s = split_sql_statements("select 'it''s; fine'; select 'a\\'; b';");
        assert_eq!(s.len(), 2);
    }

    #[test]
    fn drops_comment_only_fragments_and_empty_input() {
        assert_eq!(split_sql_statements("select 1; -- trailing").len(), 1);
        assert_eq!(split_sql_statements("  ;; -- nothing\n").len(), 0);
        assert_eq!(split_sql_statements("").len(), 0);
    }

    #[test]
    fn statement_without_trailing_semicolon() {
        let s = split_sql_statements("select 1;\nselect 2");
        assert_eq!(s, vec!["select 1;", "select 2"]);
    }
}
