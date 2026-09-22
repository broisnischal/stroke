//! Does every dialect actually work?
//!
//! A MySQL connection with tables in it listed an empty sidebar for weeks: the
//! catalog hands `TABLE_NAME` back as VARBINARY, `try_get::<String>` was refused
//! and `filter_map(…ok()?)` dropped the row. No error, nothing in a log, and no
//! test - because every test in this crate either ran against SQLite or asserted
//! on a string of SQL rather than on what a server sends back.
//!
//! This walks each engine through the same three calls the sidebar makes, over
//! the fixtures in `docker/dialects.yml`:
//!
//! ```sh
//! scripts/dialects.sh up
//! scripts/dialects.sh verify        # or: cargo test --lib dialect_matrix -- --ignored --nocapture
//! ```
//!
//! `#[ignore]`d, because it needs those containers. An engine that is not
//! running is reported as skipped rather than failed; an engine that IS running
//! and answers wrongly fails the test.

#![cfg(test)]

use super::connection::AnyConnectionConfig;
use super::schema::{list_schemas_on_conn, list_tables_on_conn};

/// What one engine is expected to show.
struct Case {
    engine: &'static str,
    /// The config the frontend would send, as JSON.
    config: serde_json::Value,
    /// The schema whose tables the sidebar would ask for.
    schema: &'static str,
    /// A table that must appear in that schema.
    expect_table: &'static str,
}

fn cases() -> Vec<Case> {
    use serde_json::json;
    let sql_server_password = "Stroke!passw0rd";
    vec![
        Case {
            engine: "postgres",
            config: json!({ "type": "postgres", "name": "fixture", "host": "127.0.0.1",
                            "port": 55432, "database": "shop", "user": "stroke",
                            "password": "stroke", "ssl": false }),
            schema: "shop",
            expect_table: "products",
        },
        Case {
            engine: "cockroachdb",
            // Wire-compatible, so it connects as Postgres - which is exactly how
            // the app models it.
            config: json!({ "type": "postgres", "name": "fixture", "host": "127.0.0.1",
                            "port": 56257, "database": "defaultdb", "user": "root",
                            "password": "", "ssl": false }),
            schema: "shop",
            expect_table: "products",
        },
        Case {
            engine: "mysql",
            config: json!({ "type": "mysql", "name": "fixture", "host": "127.0.0.1",
                            "port": 53306, "database": "shop", "user": "root",
                            "password": "stroke", "ssl": false }),
            schema: "shop",
            expect_table: "products",
        },
        Case {
            engine: "mariadb",
            config: json!({ "type": "mysql", "name": "fixture", "host": "127.0.0.1",
                            "port": 53307, "database": "shop", "user": "root",
                            "password": "stroke", "ssl": false }),
            schema: "shop",
            expect_table: "products",
        },
        Case {
            engine: "clickhouse",
            config: json!({ "type": "clickhouse", "name": "fixture", "host": "127.0.0.1",
                            "port": 58123, "database": "shop", "user": "stroke",
                            "password": "stroke", "secure": false }),
            schema: "shop",
            expect_table: "products",
        },
        Case {
            engine: "clickhouse*",
            // Connected on `default`, browsing `shop`. This is the case that was
            // broken: `list_schemas` returned only the connection's own database,
            // so a connection opened on `default` could never reach the one with
            // the tables in it.
            config: json!({ "type": "clickhouse", "name": "fixture", "host": "127.0.0.1",
                            "port": 58123, "database": "default", "user": "stroke",
                            "password": "stroke", "secure": false }),
            schema: "shop",
            expect_table: "products",
        },
        Case {
            engine: "redis",
            // Redis connects and answers, but `db::redis::list_tables` is a
            // documented stub - keyspace browsing is not built yet, so an empty
            // table list is the correct answer here rather than a failure. The
            // fixture still seeds `shop:*` keys of every Redis type, so the day
            // that lands there is something to browse.
            config: json!({ "type": "redis", "name": "fixture", "host": "127.0.0.1",
                            "port": 56379, "password": null, "db": 0, "tls": false }),
            schema: "0",
            expect_table: "",
        },
        Case {
            engine: "mssql",
            config: json!({ "type": "mssql", "name": "fixture", "host": "127.0.0.1",
                            "port": 51433, "database": "shop", "user": "sa",
                            "password": sql_server_password, "encrypt": false,
                            // Not `encrypt: true`: see `explain_connect_error`
                            // in db/mssql.rs. An encrypted handshake against
                            // this server's self-signed certificate is refused
                            // even with trust_cert on; the login packet is
                            // encrypted either way.
                            "trust_cert": true }),
            schema: "dbo",
            expect_table: "products",
        },
    ]
}

/// True when the failure is "nothing is listening", which is a skip - as opposed
/// to a server that answered something wrong, which is a failure.
fn is_unreachable(err: &str) -> bool {
    let e = err.to_ascii_lowercase();
    [
        "connection refused",
        "connection reset",
        "no route to host",
        "timed out",
        "timeout",
        "os error 61",
        "os error 111",
        "failed to lookup",
        "error sending request",
        "tcp connect error",
        "broken pipe",
    ]
    .iter()
    .any(|needle| e.contains(needle))
}

#[tokio::test]
#[ignore]
async fn every_dialect_lists_its_schema_and_tables() {
    let mut skipped: Vec<&str> = Vec::new();
    let mut failures: Vec<String> = Vec::new();

    println!("\n{:<12} {:<8} {:<10} {}", "ENGINE", "SCHEMAS", "TABLES", "RESULT");
    for case in cases() {
        let config: AnyConnectionConfig = match serde_json::from_value(case.config.clone()) {
            Ok(c) => c,
            Err(e) => {
                failures.push(format!("{}: config does not deserialize: {e}", case.engine));
                continue;
            }
        };

        // 1 · the schema switcher.
        let schemas = match list_schemas_on_conn(config.clone()).await {
            Ok(s) => s,
            Err(e) if is_unreachable(&e) => {
                println!("{:<12} {:<8} {:<10} skipped (not running)", case.engine, "-", "-");
                skipped.push(case.engine);
                continue;
            }
            Err(e) => {
                println!("{:<12} {:<8} {:<10} FAIL list_schemas: {e}", case.engine, "-", "-");
                failures.push(format!("{}: list_schemas: {e}", case.engine));
                continue;
            }
        };

        // 2 · the sidebar's table list, for the schema the sidebar would use.
        let tables = match list_tables_on_conn(config.clone(), case.schema.to_string()).await {
            Ok(t) => t,
            Err(e) => {
                println!(
                    "{:<12} {:<8} {:<10} FAIL list_tables: {e}",
                    case.engine,
                    schemas.len(),
                    "-"
                );
                failures.push(format!("{}: list_tables({}): {e}", case.engine, case.schema));
                continue;
            }
        };

        // `expect_table: ""` means "connects, and has no table list by design".
        let found = case.expect_table.is_empty() || tables.iter().any(|t| t == case.expect_table);
        println!(
            "{:<12} {:<8} {:<10} {}",
            case.engine,
            schemas.len(),
            tables.len(),
            if case.expect_table.is_empty() {
                "ok (no table list by design)".to_string()
            } else if found {
                "ok".to_string()
            } else {
                format!("FAIL: no `{}` in {tables:?}", case.expect_table)
            }
        );
        if !found {
            failures.push(format!(
                "{}: list_tables({}) returned {:?}, expected `{}` among them",
                case.engine, case.schema, tables, case.expect_table
            ));
        }
    }

    println!();
    if !skipped.is_empty() {
        println!("skipped (start them with scripts/dialects.sh up): {}", skipped.join(", "));
    }
    assert!(failures.is_empty(), "\n  - {}\n", failures.join("\n  - "));
}
