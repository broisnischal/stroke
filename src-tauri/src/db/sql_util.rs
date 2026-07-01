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
