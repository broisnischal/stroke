/*!
Backup and restore for all supported database engines.

Export produces a plain SQL script that can be re-executed to restore.
Options control which object types are included (schema DDL, data, sequences,
enums, functions, triggers, views).
*/

use serde::{Deserialize, Serialize};
use sqlx::{Column, Decode, Row, TypeInfo, ValueRef};
use tauri::{AppHandle, Emitter, State};

use super::connection::{require_conn, ActiveConnection, DbState};

// ── Public types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub sql: String,
    pub table_count: usize,
    pub row_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub statements_ok: usize,
    pub statements_err: usize,
    pub errors: Vec<String>,
}

fn default_true() -> bool { true }

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    #[serde(default = "default_true")]
    pub include_schema: bool,
    #[serde(default = "default_true")]
    pub include_data: bool,
    #[serde(default = "default_true")]
    pub include_sequences: bool,
    #[serde(default = "default_true")]
    pub include_enums: bool,
    #[serde(default = "default_true")]
    pub include_functions: bool,
    #[serde(default = "default_true")]
    pub include_triggers: bool,
    #[serde(default = "default_true")]
    pub include_views: bool,
}

impl Default for ExportOptions {
    fn default() -> Self {
        Self {
            include_schema: true,
            include_data: true,
            include_sequences: true,
            include_enums: true,
            include_functions: true,
            include_triggers: true,
            include_views: true,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
struct BackupLog {
    level: &'static str,
    message: String,
}

fn emit_log(app: &AppHandle, event: &str, level: &'static str, message: impl Into<String>) {
    app.emit(event, BackupLog { level, message: message.into() }).ok();
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn backup_export(
    app: AppHandle,
    state: State<'_, DbState>,
    schema: Option<String>,
    tables: Option<Vec<String>>,
    options: Option<ExportOptions>,
) -> Result<ExportResult, String> {
    let opts = options.unwrap_or_default();
    match require_conn(&state)? {
        ActiveConnection::Sqlite(pool) => export_sqlite(&app, &pool, tables.as_deref(), &opts).await,
        ActiveConnection::Postgres(pool) => export_postgres(&app, &pool, schema.as_deref(), tables.as_deref(), &opts).await,
        ActiveConnection::Mysql(pool) => export_mysql(&app, &pool, schema.as_deref(), tables.as_deref(), &opts).await,
        ActiveConnection::D1(cfg) => export_d1(&app, &cfg, tables.as_deref(), &opts).await,
    }
}

#[tauri::command]
pub async fn backup_import(
    app: AppHandle,
    state: State<'_, DbState>,
    sql: String,
) -> Result<ImportResult, String> {
    match require_conn(&state)? {
        ActiveConnection::Sqlite(pool) => import_sqlite(&app, &pool, &sql).await,
        ActiveConnection::Postgres(pool) => import_postgres(&app, &pool, &sql).await,
        ActiveConnection::Mysql(pool) => import_mysql(&app, &pool, &sql).await,
        ActiveConnection::D1(cfg) => import_d1(&app, &cfg, &sql).await,
    }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

fn backup_header(engine: &str, schema: Option<&str>) -> String {
    let schema_line = schema.map_or_else(String::new, |s| format!("-- Schema   : {s}\n"));
    format!(
        "-- DB Studio Backup\n-- Engine   : {engine}\n{schema_line}-- Restore  : execute this file against a {engine} database\n\n"
    )
}

fn split_statements(sql: &str) -> Vec<String> {
    let mut stmts: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_single = false;
    let mut chars = sql.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '\'' if !in_single => { in_single = true; current.push(ch); }
            '\'' if in_single => {
                current.push(ch);
                if chars.peek() == Some(&'\'') {
                    current.push(chars.next().unwrap());
                } else {
                    in_single = false;
                }
            }
            '-' if !in_single && chars.peek() == Some(&'-') => {
                while let Some(c) = chars.next() { if c == '\n' { break; } }
                current.push('\n');
            }
            ';' if !in_single => {
                let s = current.trim().to_string();
                if !s.is_empty() { stmts.push(s); }
                current.clear();
            }
            _ => current.push(ch),
        }
    }
    let s = current.trim().to_string();
    if !s.is_empty() && !s.starts_with("--") { stmts.push(s); }
    stmts
}

// ── SQLite export ─────────────────────────────────────────────────────────────

async fn export_sqlite(
    app: &AppHandle,
    pool: &sqlx::SqlitePool,
    filter: Option<&[String]>,
    opts: &ExportOptions,
) -> Result<ExportResult, String> {
    emit_log(app, "backup-log", "info", "Starting SQLite export…");
    let mut out = backup_header("SQLite", None);
    out.push_str("PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n\n");

    let ddl_rows = sqlx::query(
        "SELECT type, name, sql FROM sqlite_master \
         WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' \
         ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END, name"
    )
    .fetch_all(pool).await.map_err(|e| e.to_string())?;

    let mut all_tables: Vec<String> = Vec::new();
    for row in &ddl_rows {
        let obj_type: String = row.try_get(0).unwrap_or_default();
        let name: String = row.try_get(1).unwrap_or_default();
        let sql: String = row.try_get(2).unwrap_or_default();

        if obj_type == "table" {
            all_tables.push(name.clone());
            if opts.include_schema && filter.map_or(true, |f| f.iter().any(|t| t == &name)) {
                out.push_str(sql.trim()); out.push_str(";\n");
            }
        } else if obj_type == "view" {
            if opts.include_views {
                out.push_str(sql.trim()); out.push_str(";\n");
            }
        } else if obj_type == "trigger" {
            if opts.include_triggers {
                out.push_str(sql.trim()); out.push_str(";\n");
            }
        } else {
            out.push_str(sql.trim()); out.push_str(";\n");
        }
    }

    let tables_to_dump: Vec<&String> = all_tables.iter()
        .filter(|t| filter.map_or(true, |f| f.iter().any(|ft| ft == *t)))
        .collect();

    if opts.include_data {
        emit_log(app, "backup-log", "info", format!("Exporting {} table(s)…", tables_to_dump.len()));
        let mut total_rows = 0usize;
        for table in &tables_to_dump {
            emit_log(app, "backup-log", "info", format!("  → {table}"));
            let q = format!("SELECT * FROM \"{}\"", table.replace('"', "\"\""));
            let rows = sqlx::query(&q).fetch_all(pool).await.map_err(|e| e.to_string())?;
            let n = rows.len();
            if !rows.is_empty() {
                let cols: Vec<String> = rows[0].columns().iter()
                    .map(|c| format!("\"{}\"", c.name().replace('"', "\"\"")))
                    .collect();
                let col_list = cols.join(", ");
                out.push('\n');
                for row in &rows {
                    let vals: Vec<String> = (0..row.len()).map(|i| sqlite_val(row, i)).collect();
                    out.push_str(&format!(
                        "INSERT OR REPLACE INTO \"{}\" ({}) VALUES ({});\n",
                        table.replace('"', "\"\""), col_list, vals.join(", ")
                    ));
                }
            }
            total_rows += n;
            emit_log(app, "backup-log", "ok", format!("  ✓ {table} — {n} rows"));
        }
        out.push_str("\nCOMMIT;\nPRAGMA foreign_keys=ON;\n");
        emit_log(app, "backup-log", "ok", format!("Export complete: {} tables, {} rows", tables_to_dump.len(), total_rows));
        Ok(ExportResult { sql: out, table_count: tables_to_dump.len(), row_count: total_rows })
    } else {
        out.push_str("\nCOMMIT;\nPRAGMA foreign_keys=ON;\n");
        emit_log(app, "backup-log", "ok", format!("Export complete: {} tables (schema only)", tables_to_dump.len()));
        Ok(ExportResult { sql: out, table_count: tables_to_dump.len(), row_count: 0 })
    }
}

fn sqlite_val(row: &sqlx::sqlite::SqliteRow, idx: usize) -> String {
    if let Ok(v) = row.try_get::<Option<i64>, _>(idx) {
        return v.map_or_else(|| "NULL".into(), |n| n.to_string());
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(idx) {
        return v.map_or_else(|| "NULL".into(), |n| n.to_string());
    }
    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return v.map_or_else(|| "NULL".into(), |s| format!("'{}'", s.replace('\'', "''")));
    }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(idx) {
        return v.map_or_else(|| "NULL".into(), |b| format!("X'{}'", hex::encode(b)));
    }
    "NULL".into()
}

// ── SQLite import ─────────────────────────────────────────────────────────────

async fn import_sqlite(app: &AppHandle, pool: &sqlx::SqlitePool, sql: &str) -> Result<ImportResult, String> {
    let stmts = split_statements(sql);
    let total = stmts.len();
    emit_log(app, "restore-log", "info", format!("Starting restore: {} statements…", total));
    let mut ok = 0usize;
    let mut errors: Vec<String> = Vec::new();

    for stmt in &stmts {
        let low = stmt.trim_start().to_lowercase();
        if low.starts_with("pragma foreign_keys") { ok += 1; continue; }
        match sqlx::query(stmt).execute(pool).await {
            Ok(_) => { ok += 1; }
            Err(e) => errors.push(format!("{e} — near: {}…", &stmt[..stmt.len().min(60)])),
        }
    }

    let msg = format!("Restore complete: {} ok, {} failed", ok, total - ok);
    if errors.is_empty() {
        emit_log(app, "restore-log", "ok", &msg);
    } else {
        emit_log(app, "restore-log", "warn", &msg);
    }
    Ok(ImportResult { statements_ok: ok, statements_err: total - ok, errors })
}

// ── PostgreSQL export ─────────────────────────────────────────────────────────

async fn export_postgres(
    app: &AppHandle,
    pool: &sqlx::PgPool,
    schema_filter: Option<&str>,
    table_filter: Option<&[String]>,
    opts: &ExportOptions,
) -> Result<ExportResult, String> {
    let schemas: Vec<String> = if let Some(s) = schema_filter {
        vec![s.to_string()]
    } else {
        sqlx::query_scalar(
            "SELECT nspname::text FROM pg_catalog.pg_namespace \
             WHERE nspname NOT IN ('pg_catalog','information_schema','pg_toast') \
               AND nspname NOT LIKE 'pg_temp_%' \
             ORDER BY nspname"
        )
        .fetch_all(pool).await.map_err(|e| e.to_string())?
    };

    emit_log(app, "backup-log", "info", format!("Starting PostgreSQL export ({} schema(s))…", schemas.len()));

    let mut out = backup_header("PostgreSQL", schema_filter);
    out.push_str("SET client_encoding = 'UTF8';\n");
    out.push_str("SET standard_conforming_strings = on;\n");
    out.push_str("SET session_replication_role = replica;\n\n");

    let mut total_tables = 0usize;
    let mut total_rows = 0usize;

    for schema in &schemas {
        out.push_str(&format!("-- ── Schema: {schema} ──────────────────────────────────────\n\n"));

        // ── Enums ──
        if opts.include_enums {
            let enums: Vec<(String, String)> = sqlx::query_as(
                "SELECT t.typname::text, \
                        string_agg(e.enumlabel::text, ',' ORDER BY e.enumsortorder) \
                 FROM pg_catalog.pg_type t \
                 JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid \
                 JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace \
                 WHERE n.nspname = $1 \
                 GROUP BY t.typname ORDER BY t.typname"
            )
            .bind(schema)
            .fetch_all(pool).await.unwrap_or_default();

            if !enums.is_empty() {
                emit_log(app, "backup-log", "info", format!("  Exporting {} enum(s) from {schema}…", enums.len()));
                out.push_str(&format!("-- Custom enum types — {schema}\n"));
                for (name, labels) in &enums {
                    let quoted: Vec<String> = labels.split(',').map(|l| format!("'{}'", l.replace('\'', "''"))).collect();
                    out.push_str(&format!(
                        "DO $$ BEGIN\n  CREATE TYPE \"{schema}\".\"{name}\" AS ENUM ({});\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;\n",
                        quoted.join(", ")
                    ));
                }
                out.push('\n');
            }
        }

        // ── Sequences ──
        if opts.include_sequences {
            let seqs: Vec<(String, String, i64, i64, i64, i64, bool)> = sqlx::query_as(
                "SELECT sequence_name::text, data_type::text, \
                        start_value::bigint, minimum_value::bigint, \
                        maximum_value::bigint, increment::bigint, \
                        (cycle_option = 'YES') \
                 FROM information_schema.sequences \
                 WHERE sequence_schema = $1 \
                 ORDER BY sequence_name"
            )
            .bind(schema)
            .fetch_all(pool).await.unwrap_or_default();

            if !seqs.is_empty() {
                emit_log(app, "backup-log", "info", format!("  Exporting {} sequence(s) from {schema}…", seqs.len()));
                out.push_str(&format!("-- Sequences — {schema}\n"));
                for (name, dtype, start, min, max, inc, cycle) in &seqs {
                    let cycle_str = if *cycle { "CYCLE" } else { "NO CYCLE" };
                    out.push_str(&format!(
                        "CREATE SEQUENCE IF NOT EXISTS \"{schema}\".\"{name}\"\n    AS {dtype}\n    START WITH {start}\n    INCREMENT BY {inc}\n    MINVALUE {min}\n    MAXVALUE {max}\n    {cycle_str};\n"
                    ));
                }
                out.push('\n');
            }
        }

        // ── Schema / Tables DDL ──
        if opts.include_schema {
            let all_tables: Vec<String> = sqlx::query_scalar(
                "SELECT c.relname::text FROM pg_catalog.pg_class c \
                 JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace \
                 WHERE n.nspname = $1 AND c.relkind = 'r' AND NOT c.relispartition \
                 ORDER BY c.relname"
            )
            .bind(schema).fetch_all(pool).await.map_err(|e| e.to_string())?;

            let tables_to_export: Vec<&String> = all_tables.iter()
                .filter(|t| table_filter.map_or(true, |f| f.iter().any(|ft| ft == *t)))
                .collect();

            if !tables_to_export.is_empty() {
                emit_log(app, "backup-log", "info", format!("  Schema {schema}: {} table(s)", tables_to_export.len()));

                for table in &tables_to_export {
                    emit_log(app, "backup-log", "info", format!("  → {schema}.{table}"));
                    match pg_dump_table(pool, schema, table, opts.include_data).await {
                        Ok((ddl, rows)) => {
                            out.push_str(&ddl);
                            total_rows += rows;
                            total_tables += 1;
                            emit_log(app, "backup-log", "ok", format!("  ✓ {table} — {rows} rows"));
                        }
                        Err(e) => {
                            out.push_str(&format!("-- ERROR exporting {schema}.{table}: {e}\n\n"));
                            emit_log(app, "backup-log", "error", format!("  ✗ {table}: {e}"));
                        }
                    }
                }

                // Foreign keys
                let fk_defs: Vec<String> = sqlx::query_scalar(
                    "SELECT format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s',\
                            n.nspname, t.relname, c.conname, pg_get_constraintdef(c.oid))\
                     FROM pg_catalog.pg_constraint c\
                     JOIN pg_catalog.pg_class t ON t.oid = c.conrelid\
                     JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace\
                     WHERE c.contype = 'f' AND n.nspname = $1\
                     ORDER BY t.relname, c.conname"
                )
                .bind(schema).fetch_all(pool).await.unwrap_or_default();

                if !fk_defs.is_empty() {
                    out.push_str(&format!("-- Foreign keys — {schema}\n"));
                    for fk in &fk_defs { out.push_str(fk); out.push_str(";\n"); }
                    out.push('\n');
                }
            }
        }

        // ── Views ──
        if opts.include_views {
            let views: Vec<(String, String)> = sqlx::query_as(
                "SELECT c.relname::text, pg_get_viewdef(c.oid, true) \
                 FROM pg_catalog.pg_class c \
                 JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace \
                 WHERE n.nspname = $1 AND c.relkind = 'v' \
                 ORDER BY c.relname"
            )
            .bind(schema).fetch_all(pool).await.unwrap_or_default();

            if !views.is_empty() {
                emit_log(app, "backup-log", "info", format!("  Exporting {} view(s) from {schema}…", views.len()));
                out.push_str(&format!("-- Views — {schema}\n"));
                for (name, def) in &views {
                    out.push_str(&format!(
                        "CREATE OR REPLACE VIEW \"{schema}\".\"{name}\" AS\n{def};\n"
                    ));
                }
                out.push('\n');
            }
        }

        // ── Functions & Procedures ──
        if opts.include_functions {
            let funcs: Vec<(String, String)> = sqlx::query_as(
                "SELECT p.proname::text, pg_get_functiondef(p.oid) \
                 FROM pg_catalog.pg_proc p \
                 JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace \
                 WHERE n.nspname = $1 AND p.prokind IN ('f', 'p') \
                 ORDER BY p.proname"
            )
            .bind(schema).fetch_all(pool).await.unwrap_or_default();

            if !funcs.is_empty() {
                emit_log(app, "backup-log", "info", format!("  Exporting {} function(s)/procedure(s) from {schema}…", funcs.len()));
                out.push_str(&format!("-- Functions & Procedures — {schema}\n"));
                for (_, def) in &funcs {
                    // pg_get_functiondef already includes CREATE OR REPLACE FUNCTION
                    out.push_str(def.trim());
                    if !def.trim().ends_with(';') { out.push(';'); }
                    out.push_str("\n\n");
                }
            }
        }

        // ── Triggers ──
        if opts.include_triggers {
            let triggers: Vec<String> = sqlx::query_scalar(
                "SELECT pg_get_triggerdef(t.oid) \
                 FROM pg_catalog.pg_trigger t \
                 JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid \
                 JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace \
                 WHERE n.nspname = $1 AND NOT t.tgisinternal \
                 ORDER BY c.relname, t.tgname"
            )
            .bind(schema).fetch_all(pool).await.unwrap_or_default();

            if !triggers.is_empty() {
                emit_log(app, "backup-log", "info", format!("  Exporting {} trigger(s) from {schema}…", triggers.len()));
                out.push_str(&format!("-- Triggers — {schema}\n"));
                for trig in &triggers {
                    out.push_str(trig.trim());
                    out.push_str(";\n");
                }
                out.push('\n');
            }
        }
    }

    out.push_str("SET session_replication_role = DEFAULT;\n");
    emit_log(app, "backup-log", "ok", format!("Export complete: {total_tables} tables, {total_rows} rows"));
    Ok(ExportResult { sql: out, table_count: total_tables, row_count: total_rows })
}

async fn pg_dump_table(
    pool: &sqlx::PgPool,
    schema: &str,
    table: &str,
    include_data: bool,
) -> Result<(String, usize), String> {
    let mut out = String::new();

    let col_rows = sqlx::query(r#"
        SELECT
            a.attname::text,
            format_type(a.atttypid, a.atttypmod),
            NOT a.attnotnull AS nullable,
            pg_get_expr(d.adbin, d.adrelid) AS col_default,
            a.attidentity IN ('a','d') AS is_identity
        FROM pg_catalog.pg_attribute a
        LEFT JOIN pg_catalog.pg_attrdef d
            ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2
          AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum
    "#)
    .bind(schema).bind(table).fetch_all(pool).await.map_err(|e| e.to_string())?;

    if col_rows.is_empty() { return Ok((String::new(), 0)); }

    let pk_cols: Vec<String> = sqlx::query_scalar(
        "SELECT a.attname::text \
         FROM pg_catalog.pg_constraint c \
         JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey) \
         JOIN pg_catalog.pg_class t ON t.oid = c.conrelid \
         JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace \
         WHERE c.contype = 'p' AND n.nspname = $1 AND t.relname = $2 \
         ORDER BY array_position(c.conkey, a.attnum)"
    )
    .bind(schema).bind(table).fetch_all(pool).await.unwrap_or_default();

    out.push_str(&format!("CREATE TABLE IF NOT EXISTS \"{schema}\".\"{table}\" (\n"));
    let mut col_defs: Vec<String> = Vec::new();

    for row in &col_rows {
        let name: String = row.try_get(0).unwrap_or_default();
        let typ: String = row.try_get(1).unwrap_or_default();
        let nullable: bool = row.try_get(2).unwrap_or(true);
        let default: Option<String> = row.try_get(3).ok().flatten();
        let is_identity: bool = row.try_get(4).unwrap_or(false);

        let mut def = format!("    \"{}\" {}", name, typ);
        if !nullable { def.push_str(" NOT NULL"); }
        if is_identity {
            def.push_str(" GENERATED BY DEFAULT AS IDENTITY");
        } else if let Some(d) = &default {
            def.push_str(&format!(" DEFAULT {}", d));
        }
        col_defs.push(def);
    }

    if !pk_cols.is_empty() {
        let pk_quoted = pk_cols.iter().map(|c| format!("\"{c}\"")).collect::<Vec<_>>().join(", ");
        col_defs.push(format!("    PRIMARY KEY ({})", pk_quoted));
    }

    out.push_str(&col_defs.join(",\n"));
    out.push_str("\n);\n");

    let indexes: Vec<String> = sqlx::query_scalar(
        "SELECT pg_get_indexdef(i.oid) \
         FROM pg_catalog.pg_index ix \
         JOIN pg_catalog.pg_class i ON i.oid = ix.indexrelid \
         JOIN pg_catalog.pg_class t ON t.oid = ix.indrelid \
         JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace \
         WHERE n.nspname = $1 AND t.relname = $2 AND NOT ix.indisprimary"
    )
    .bind(schema).bind(table).fetch_all(pool).await.unwrap_or_default();

    for idx_def in &indexes {
        let safe = idx_def
            .replacen("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ", 1)
            .replacen("CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ", 1);
        out.push_str(&safe);
        out.push_str(";\n");
    }

    if !include_data {
        out.push('\n');
        return Ok((out, 0));
    }

    let data_sql = format!("SELECT * FROM \"{schema}\".\"{table}\"");
    let rows = sqlx::query(&data_sql).fetch_all(pool).await.map_err(|e| e.to_string())?;
    let row_count = rows.len();

    if !rows.is_empty() {
        let col_names: Vec<String> = rows[0].columns().iter()
            .map(|c| format!("\"{}\"", c.name())).collect();
        let col_list = col_names.join(", ");
        let conflict_target = if pk_cols.is_empty() {
            "DO NOTHING".to_string()
        } else {
            let pk_q = pk_cols.iter().map(|c| format!("\"{c}\"")).collect::<Vec<_>>().join(", ");
            format!("({pk_q}) DO NOTHING")
        };

        out.push('\n');
        for row in &rows {
            let vals: Vec<String> = (0..row.len()).map(|i| pg_val(row, i)).collect();
            out.push_str(&format!(
                "INSERT INTO \"{schema}\".\"{table}\" ({col_list}) VALUES ({}) ON CONFLICT {conflict_target};\n",
                vals.join(", ")
            ));
        }
    }
    out.push('\n');

    Ok((out, row_count))
}

fn pg_val(row: &sqlx::postgres::PgRow, idx: usize) -> String {
    let col = row.column(idx);
    let type_name = col.type_info().name();

    if let Ok(raw) = row.try_get_raw(idx) {
        if raw.is_null() { return "NULL".into(); }
    } else {
        return "NULL".into();
    }

    match type_name {
        "BOOL" => return row.try_get::<bool, _>(idx)
            .map(|b| if b { "TRUE" } else { "FALSE" }.into())
            .unwrap_or_else(|_| "NULL".into()),
        "INT2" | "INT4" | "INT8" | "OID" => return row.try_get::<i64, _>(idx)
            .map(|n| n.to_string()).unwrap_or_else(|_| "NULL".into()),
        "FLOAT4" | "FLOAT8" | "NUMERIC" | "MONEY" => return row.try_get::<f64, _>(idx)
            .map(|n| n.to_string()).unwrap_or_else(|_| "NULL".into()),
        "JSON" | "JSONB" => return row.try_get::<serde_json::Value, _>(idx)
            .map(|v| format!("'{}'", v.to_string().replace('\'', "''")))
            .unwrap_or_else(|_| "NULL".into()),
        "BYTEA" => return row.try_get::<Vec<u8>, _>(idx)
            .map(|b| format!("'\\x{}'", hex::encode(b)))
            .unwrap_or_else(|_| "NULL".into()),
        _ => {}
    }

    if let Ok(raw) = row.try_get_raw(idx) {
        if let Ok(text) = <String as Decode<sqlx::Postgres>>::decode(raw) {
            return format!("'{}'", text.replace('\'', "''"));
        }
    }

    "NULL".into()
}

// ── PostgreSQL import ─────────────────────────────────────────────────────────

async fn import_postgres(app: &AppHandle, pool: &sqlx::PgPool, sql: &str) -> Result<ImportResult, String> {
    let stmts = split_statements(sql);
    let total = stmts.len();
    emit_log(app, "restore-log", "info", format!("Starting restore: {} statements…", total));

    let mut ok = 0usize;
    let mut errors: Vec<String> = Vec::new();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("SET session_replication_role = replica").execute(&mut *tx).await.ok();

    for (i, stmt) in stmts.iter().enumerate() {
        let low = stmt.trim_start().to_lowercase();
        if low.starts_with("set session_replication_role") { ok += 1; continue; }
        if low.starts_with("set client_encoding") || low.starts_with("set standard_conforming") { ok += 1; continue; }

        match sqlx::query(stmt).execute(&mut *tx).await {
            Ok(_) => {
                ok += 1;
                // Emit progress every 50 statements
                if (i + 1) % 50 == 0 {
                    emit_log(app, "restore-log", "info", format!("  {}/{} statements…", i + 1, total));
                }
            }
            Err(e) => errors.push(format!("{e} — near: {}…", &stmt[..stmt.len().min(80)])),
        }
    }

    sqlx::query("SET session_replication_role = DEFAULT").execute(&mut *tx).await.ok();
    tx.commit().await.map_err(|e| e.to_string())?;

    let msg = format!("Restore complete: {} ok, {} failed", ok, total - ok);
    if errors.is_empty() {
        emit_log(app, "restore-log", "ok", &msg);
    } else {
        emit_log(app, "restore-log", "warn", &msg);
    }
    Ok(ImportResult { statements_ok: ok, statements_err: total - ok, errors })
}

// ── MySQL export ──────────────────────────────────────────────────────────────

async fn export_mysql(
    app: &AppHandle,
    pool: &sqlx::MySqlPool,
    schema_filter: Option<&str>,
    table_filter: Option<&[String]>,
    opts: &ExportOptions,
) -> Result<ExportResult, String> {
    let schemas: Vec<String> = if let Some(s) = schema_filter {
        vec![s.to_string()]
    } else {
        sqlx::query_scalar::<_, String>(
            "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA \
             WHERE SCHEMA_NAME NOT IN ('information_schema','performance_schema','mysql','sys') \
             ORDER BY SCHEMA_NAME"
        )
        .fetch_all(pool).await.map_err(|e| e.to_string())?
    };

    emit_log(app, "backup-log", "info", format!("Starting MySQL export ({} schema(s))…", schemas.len()));

    let mut out = backup_header("MySQL", schema_filter);
    out.push_str("SET FOREIGN_KEY_CHECKS=0;\nSET UNIQUE_CHECKS=0;\nSET AUTOCOMMIT=0;\n\n");

    let mut total_tables = 0usize;
    let mut total_rows = 0usize;

    for schema in &schemas {
        out.push_str(&format!("USE `{schema}`;\n\n"));

        // ── Tables ──
        if opts.include_schema {
            let all_tables: Vec<String> = sqlx::query_scalar::<_, String>(
                "SELECT TABLE_NAME FROM information_schema.TABLES \
                 WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' \
                 ORDER BY TABLE_NAME"
            )
            .bind(schema).fetch_all(pool).await.map_err(|e| e.to_string())?;

            let tables_to_export: Vec<&String> = all_tables.iter()
                .filter(|t| table_filter.map_or(true, |f| f.iter().any(|ft| ft == *t)))
                .collect();

            if !tables_to_export.is_empty() {
                emit_log(app, "backup-log", "info", format!("Schema {schema}: {} table(s)", tables_to_export.len()));

                for table in &tables_to_export {
                    emit_log(app, "backup-log", "info", format!("  → {schema}.{table}"));
                    let create_row = sqlx::query(&format!("SHOW CREATE TABLE `{schema}`.`{table}`"))
                        .fetch_one(pool).await
                        .map_err(|e| format!("SHOW CREATE TABLE `{table}` failed: {e}"))?;
                    let create_sql: String = create_row.try_get(1).unwrap_or_default();
                    out.push_str(&create_sql.replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS "));
                    out.push_str(";\n\n");

                    if opts.include_data {
                        let rows = sqlx::query(&format!("SELECT * FROM `{schema}`.`{table}`"))
                            .fetch_all(pool).await.map_err(|e| e.to_string())?;
                        let n = rows.len();
                        if !rows.is_empty() {
                            let cols: Vec<String> = rows[0].columns().iter().map(|c| format!("`{}`", c.name())).collect();
                            let col_list = cols.join(", ");
                            for row in &rows {
                                let vals: Vec<String> = (0..row.len()).map(|i| mysql_val(&row, i)).collect();
                                out.push_str(&format!("INSERT IGNORE INTO `{schema}`.`{table}` ({col_list}) VALUES ({});\n", vals.join(", ")));
                            }
                            out.push('\n');
                        }
                        total_rows += n;
                        emit_log(app, "backup-log", "ok", format!("  ✓ {table} — {n} rows"));
                    } else {
                        emit_log(app, "backup-log", "ok", format!("  ✓ {table} (schema only)"));
                    }
                    total_tables += 1;
                }
            }
        }

        // ── Views ──
        if opts.include_views {
            let view_names: Vec<String> = sqlx::query_scalar::<_, String>(
                "SELECT TABLE_NAME FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME"
            )
            .bind(schema).fetch_all(pool).await.unwrap_or_default();

            if !view_names.is_empty() {
                emit_log(app, "backup-log", "info", format!("  Exporting {} view(s) from {schema}…", view_names.len()));
                out.push_str(&format!("-- Views — {schema}\n"));
                for view in &view_names {
                    if let Ok(row) = sqlx::query(&format!("SHOW CREATE VIEW `{schema}`.`{view}`")).fetch_one(pool).await {
                        let create: String = row.try_get(1).unwrap_or_default();
                        out.push_str(&create.replace("CREATE ", "CREATE OR REPLACE "));
                        out.push_str(";\n");
                    }
                }
                out.push('\n');
            }
        }

        // ── Functions & Procedures ──
        if opts.include_functions {
            let routines: Vec<(String, String)> = sqlx::query_as::<_, (String, String)>(
                "SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES \
                 WHERE ROUTINE_SCHEMA = ? \
                 ORDER BY ROUTINE_TYPE, ROUTINE_NAME"
            )
            .bind(schema).fetch_all(pool).await.unwrap_or_default();

            if !routines.is_empty() {
                emit_log(app, "backup-log", "info", format!("  Exporting {} function(s)/procedure(s) from {schema}…", routines.len()));
                out.push_str(&format!("-- Functions & Procedures — {schema}\nDELIMITER //\n"));
                for (name, rtype) in &routines {
                    let keyword = if rtype == "FUNCTION" { "FUNCTION" } else { "PROCEDURE" };
                    if let Ok(row) = sqlx::query(&format!("SHOW CREATE {keyword} `{schema}`.`{name}`")).fetch_one(pool).await {
                        let col_idx: usize = if rtype == "FUNCTION" { 2 } else { 2 };
                        let create: String = row.try_get(col_idx).unwrap_or_default();
                        out.push_str(&create);
                        out.push_str("//\n\n");
                    }
                }
                out.push_str("DELIMITER ;\n\n");
            }
        }

        // ── Triggers ──
        if opts.include_triggers {
            let trigger_names: Vec<String> = sqlx::query_scalar::<_, String>(
                "SELECT TRIGGER_NAME FROM information_schema.TRIGGERS \
                 WHERE TRIGGER_SCHEMA = ? ORDER BY TRIGGER_NAME"
            )
            .bind(schema).fetch_all(pool).await.unwrap_or_default();

            if !trigger_names.is_empty() {
                emit_log(app, "backup-log", "info", format!("  Exporting {} trigger(s) from {schema}…", trigger_names.len()));
                out.push_str(&format!("-- Triggers — {schema}\nDELIMITER //\n"));
                for trig in &trigger_names {
                    if let Ok(row) = sqlx::query(&format!("SHOW CREATE TRIGGER `{schema}`.`{trig}`")).fetch_one(pool).await {
                        let create: String = row.try_get(2).unwrap_or_default();
                        out.push_str(&create);
                        out.push_str("//\n\n");
                    }
                }
                out.push_str("DELIMITER ;\n\n");
            }
        }
    }

    out.push_str("\nSET FOREIGN_KEY_CHECKS=1;\nSET UNIQUE_CHECKS=1;\nCOMMIT;\n");
    emit_log(app, "backup-log", "ok", format!("Export complete: {total_tables} tables, {total_rows} rows"));
    Ok(ExportResult { sql: out, table_count: total_tables, row_count: total_rows })
}

fn mysql_val(row: &sqlx::mysql::MySqlRow, idx: usize) -> String {
    if let Ok(v) = row.try_get::<Option<i64>, _>(idx) {
        return v.map_or_else(|| "NULL".into(), |n| n.to_string());
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(idx) {
        return v.map_or_else(|| "NULL".into(), |n| n.to_string());
    }
    if let Ok(v) = row.try_get::<Option<bool>, _>(idx) {
        return v.map_or_else(|| "NULL".into(), |b| if b { "1" } else { "0" }.into());
    }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(idx) {
        return v.map_or_else(|| "NULL".into(), |b| {
            if let Ok(s) = String::from_utf8(b.clone()) {
                format!("'{}'", s.replace('\\', "\\\\").replace('\'', "\\'"))
            } else {
                format!("0x{}", hex::encode(b))
            }
        });
    }
    "NULL".into()
}

// ── MySQL import ──────────────────────────────────────────────────────────────

async fn import_mysql(app: &AppHandle, pool: &sqlx::MySqlPool, sql: &str) -> Result<ImportResult, String> {
    let stmts = split_statements(sql);
    let total = stmts.len();
    emit_log(app, "restore-log", "info", format!("Starting restore: {} statements…", total));
    let mut ok = 0usize;
    let mut errors: Vec<String> = Vec::new();

    for (i, stmt) in stmts.iter().enumerate() {
        match sqlx::query(stmt).execute(pool).await {
            Ok(_) => {
                ok += 1;
                if (i + 1) % 50 == 0 {
                    emit_log(app, "restore-log", "info", format!("  {}/{} statements…", i + 1, total));
                }
            }
            Err(e) => errors.push(format!("{e} — near: {}…", &stmt[..stmt.len().min(80)])),
        }
    }

    let msg = format!("Restore complete: {} ok, {} failed", ok, total - ok);
    if errors.is_empty() {
        emit_log(app, "restore-log", "ok", &msg);
    } else {
        emit_log(app, "restore-log", "warn", &msg);
    }
    Ok(ImportResult { statements_ok: ok, statements_err: total - ok, errors })
}

// ── D1 export ─────────────────────────────────────────────────────────────────

async fn export_d1(
    app: &AppHandle,
    cfg: &super::connection::D1Config,
    filter: Option<&[String]>,
    opts: &ExportOptions,
) -> Result<ExportResult, String> {
    emit_log(app, "backup-log", "info", "Starting Cloudflare D1 export…");
    let mut out = backup_header("Cloudflare D1 (SQLite)", None);
    out.push_str("PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n\n");

    let ddl_result = super::d1::query(
        cfg,
        "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END, name",
        vec![],
    ).await?;

    let type_idx = ddl_result.columns.iter().position(|c| c.name == "type").unwrap_or(0);
    let name_idx = ddl_result.columns.iter().position(|c| c.name == "name").unwrap_or(1);
    let sql_idx  = ddl_result.columns.iter().position(|c| c.name == "sql").unwrap_or(2);

    let mut all_tables: Vec<String> = Vec::new();
    for row in &ddl_result.rows {
        let obj_type = row.get(type_idx).and_then(|v| v.as_str()).unwrap_or("");
        let name     = row.get(name_idx).and_then(|v| v.as_str()).unwrap_or("");
        let ddl_sql  = row.get(sql_idx).and_then(|v| v.as_str()).unwrap_or("");

        if obj_type == "table" {
            all_tables.push(name.to_string());
            if opts.include_schema && filter.map_or(true, |f| f.iter().any(|t| t == name)) {
                out.push_str(ddl_sql.trim()); out.push_str(";\n");
            }
        } else if obj_type == "view" {
            if opts.include_views { out.push_str(ddl_sql.trim()); out.push_str(";\n"); }
        } else if obj_type == "trigger" {
            if opts.include_triggers { out.push_str(ddl_sql.trim()); out.push_str(";\n"); }
        } else {
            out.push_str(ddl_sql.trim()); out.push_str(";\n");
        }
    }

    let tables_to_dump: Vec<&String> = all_tables.iter()
        .filter(|t| filter.map_or(true, |f| f.iter().any(|ft| ft == *t)))
        .collect();

    let mut total_rows = 0usize;
    if opts.include_data {
        emit_log(app, "backup-log", "info", format!("Exporting {} table(s)…", tables_to_dump.len()));
        for table in &tables_to_dump {
            emit_log(app, "backup-log", "info", format!("  → {table}"));
            let data_result = super::d1::query(cfg,
                &format!("SELECT * FROM \"{}\"", table.replace('"', "\"\"")), vec![]).await?;
            let n = data_result.rows.len();
            if !data_result.rows.is_empty() {
                let col_names: Vec<String> = data_result.columns.iter()
                    .map(|c| format!("\"{}\"", c.name.replace('"', "\"\"")))
                    .collect();
                let col_list = col_names.join(", ");
                out.push('\n');
                for row in &data_result.rows {
                    let vals: Vec<String> = data_result.columns.iter().enumerate()
                        .map(|(i, _)| row.get(i).map_or("NULL".into(), json_to_sql_val))
                        .collect();
                    out.push_str(&format!("INSERT OR REPLACE INTO \"{}\" ({}) VALUES ({});\n",
                        table.replace('"', "\"\""), col_list, vals.join(", ")));
                }
            }
            total_rows += n;
            emit_log(app, "backup-log", "ok", format!("  ✓ {table} — {n} rows"));
        }
    }

    out.push_str("\nCOMMIT;\nPRAGMA foreign_keys=ON;\n");
    emit_log(app, "backup-log", "ok", format!("Export complete: {} tables, {total_rows} rows", tables_to_dump.len()));
    Ok(ExportResult { sql: out, table_count: tables_to_dump.len(), row_count: total_rows })
}

fn json_to_sql_val(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Null => "NULL".into(),
        serde_json::Value::Bool(b) => if *b { "1" } else { "0" }.into(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => format!("'{}'", s.replace('\'', "''")),
        other => format!("'{}'", other.to_string().replace('\'', "''")),
    }
}

// ── D1 import ────────────────────────────────────────────────────────────────

async fn import_d1(app: &AppHandle, cfg: &super::connection::D1Config, sql: &str) -> Result<ImportResult, String> {
    let stmts = split_statements(sql);
    let total = stmts.len();
    emit_log(app, "restore-log", "info", format!("Starting restore: {} statements…", total));
    let mut ok = 0usize;
    let mut errors: Vec<String> = Vec::new();

    for (i, stmt) in stmts.iter().enumerate() {
        let low = stmt.trim_start().to_lowercase();
        if low.starts_with("pragma foreign_keys") { ok += 1; continue; }
        match super::d1::query(cfg, stmt, vec![]).await {
            Ok(_) => {
                ok += 1;
                if (i + 1) % 50 == 0 {
                    emit_log(app, "restore-log", "info", format!("  {}/{} statements…", i + 1, total));
                }
            }
            Err(e) => errors.push(format!("{e} — near: {}…", &stmt[..stmt.len().min(60)])),
        }
    }

    let msg = format!("Restore complete: {} ok, {} failed", ok, total - ok);
    if errors.is_empty() {
        emit_log(app, "restore-log", "ok", &msg);
    } else {
        emit_log(app, "restore-log", "warn", &msg);
    }
    Ok(ImportResult { statements_ok: ok, statements_err: total - ok, errors })
}
