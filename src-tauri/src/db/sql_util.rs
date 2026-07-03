//! Shared SQL string helpers used across the engine backends.
//!
//! Consolidates the identifier quoting, LIKE-pattern escaping, string-literal
//! escaping, and statement-head parsing that were previously copy-pasted in
//! nearly identical form across `mysql.rs`, `sqlite.rs`, `mssql.rs`,
//! `clickhouse.rs`, `duckdb.rs`, and `query.rs`.
//!
//! Dialect-specific *keyword sets* (e.g. MSSQL `exec`, SQLite `pragma`) stay in
//! each engine; only the mechanical, byte-for-byte identical logic lives here.

/// Lowercased first token of a statement, splitting on whitespace or `(`.
/// Used to classify a statement's kind (`select`, `insert`, …).
pub fn statement_head(sql: &str) -> String {
    sql.trim_start()
        .split(|c: char| c.is_whitespace() || c == '(')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
}

/// Quote an identifier for double-quote dialects (`"id"`), doubling embedded
/// quotes. (PostgreSQL, SQLite, DuckDB, D1/LibSQL.)
pub fn quote_double(ident: &str) -> String {
    format!("\"{}\"", ident.replace('"', "\"\""))
}

/// Quote an identifier with backticks (`` `id` ``), doubling embedded backticks.
/// (MySQL, ClickHouse.)
pub fn quote_backtick(ident: &str) -> String {
    format!("`{}`", ident.replace('`', "``"))
}

/// Quote an identifier with square brackets (`[id]`), doubling embedded `]`.
/// (SQL Server.)
pub fn quote_bracket(ident: &str) -> String {
    format!("[{}]", ident.replace(']', "]]"))
}

/// Escape a `LIKE` pattern using `\` as the escape character (used with
/// `ESCAPE '\'`). (MySQL, SQLite, D1.)
pub fn escape_like_backslash(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// Escape a string literal by doubling single quotes (`'` → `''`). (SQL Server,
/// ANSI SQL.)
pub fn esc_single_quote(s: &str) -> String {
    s.replace('\'', "''")
}

/// Escape a string literal with backslash escapes (`\` → `\\`, `'` → `\'`).
/// (ClickHouse.)
pub fn esc_backslash_quote(s: &str) -> String {
    s.replace('\\', "\\\\").replace('\'', "\\'")
}

// ── Oversized-cell capping ────────────────────────────────────────────────────
//
// Cells whose payload exceeds `CELL_VALUE_CAP` are replaced with a small
// sentinel object instead of being shipped to the webview whole. Multi-MB
// cells (file buffers stored in jsonb/text/blob columns) otherwise freeze the
// app: the IPC JSON payload, the webview-side parse, and the grid's per-cell
// stringify all scale with cell size (GitHub issue: "App freezes").
// The frontend detects the sentinel via `__strokeOversize` (see
// `src/lib/cell-value.js`), renders the preview, and blocks editing so a
// truncated value can never be written back.

/// Per-cell payload cap, in bytes of serialized text.
pub const CELL_VALUE_CAP: usize = 256 * 1024;

/// How much of an oversized cell ships as a preview (grid text + JSON lightbox).
pub const CELL_PREVIEW_BYTES: usize = 16 * 1024;

/// Build the oversize sentinel for a cell too large to ship. `body` is the
/// value's UTF-8 text (JSON text, plain text, or hex for blobs).
pub fn oversize_cell(data_type: &str, total_bytes: usize, body: &[u8]) -> serde_json::Value {
    let end = CELL_PREVIEW_BYTES.min(body.len());
    let preview = String::from_utf8_lossy(&body[..end]);
    serde_json::json!({
        "__strokeOversize": true,
        "dataType": data_type,
        "bytes": total_bytes,
        "preview": preview,
    })
}

/// Cap an already-decoded JSON value (engines where the raw wire bytes can't
/// be peeked cheaply). Containers are measured by serializing; oversized ones
/// collapse to the sentinel. Scalars below the cap pass through untouched.
pub fn cap_json_value(data_type: &str, v: serde_json::Value) -> serde_json::Value {
    match &v {
        serde_json::Value::Object(_) | serde_json::Value::Array(_) => {
            let text = v.to_string();
            if text.len() > CELL_VALUE_CAP {
                return oversize_cell(data_type, text.len(), text.as_bytes());
            }
            v
        }
        serde_json::Value::String(s) if s.len() > CELL_VALUE_CAP => {
            oversize_cell(data_type, s.len(), s.as_bytes())
        }
        _ => v,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn statement_head_handles_paren_and_whitespace() {
        assert_eq!(statement_head("  SELECT * FROM t"), "select");
        assert_eq!(statement_head("WITH(x) AS ..."), "with");
        assert_eq!(statement_head("insert(into"), "insert");
        assert_eq!(statement_head(""), "");
    }

    #[test]
    fn quoting_doubles_delimiters() {
        assert_eq!(quote_double(r#"a"b"#), r#""a""b""#);
        assert_eq!(quote_backtick("a`b"), "`a``b`");
        assert_eq!(quote_bracket("a]b"), "[a]]b]");
    }

    #[test]
    fn like_and_literal_escaping() {
        assert_eq!(escape_like_backslash("50%_x\\"), "50\\%\\_x\\\\");
        assert_eq!(esc_single_quote("O'Brien"), "O''Brien");
        assert_eq!(esc_backslash_quote("a'b\\c"), "a\\'b\\\\c");
    }
}
