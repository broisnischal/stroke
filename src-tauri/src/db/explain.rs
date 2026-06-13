use serde::Serialize;
use sqlx::Row;

#[derive(Debug, Serialize)]
pub struct ExplainResult {
    /// The root Plan node (PostgreSQL) or equivalent tree (MySQL/SQLite).
    pub plan: serde_json::Value,
    /// Milliseconds spent planning (PostgreSQL only; 0 for others).
    pub planning_time: f64,
    /// Milliseconds spent executing (PostgreSQL only; 0 for others).
    pub execution_time: f64,
    /// Which driver produced this result — helps the frontend pick the renderer.
    pub driver: String,
}

fn strip_sql(sql: &str) -> &str {
    let s = sql.trim().trim_end_matches(';').trim();
    // Strip any existing EXPLAIN prefix so callers never double-wrap
    let upper = s.to_ascii_uppercase();
    if upper.starts_with("EXPLAIN") {
        let rest = &s[7..].trim_start();
        // Skip optional ANALYZE / QUERY PLAN / FORMAT ... words
        let upper_rest = rest.to_ascii_uppercase();
        let rest = if upper_rest.starts_with("ANALYZE") {
            rest[7..].trim_start()
        } else if upper_rest.starts_with("QUERY PLAN") {
            rest[10..].trim_start()
        } else if upper_rest.starts_with('(') {
            // EXPLAIN (ANALYZE, ...) — skip to closing paren
            rest.find(')').map(|i| rest[i + 1..].trim_start()).unwrap_or(rest)
        } else {
            rest
        };
        return rest;
    }
    s
}

pub async fn explain_pg(pool: &sqlx::PgPool, sql: &str) -> Result<ExplainResult, String> {
    let sql = strip_sql(sql);
    let q = format!("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {sql}");

    let row: (serde_json::Value,) = sqlx::query_as(&q)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("EXPLAIN failed: {e}"))?;

    // PG returns [{Plan: {...}, "Planning Time": x, "Execution Time": y}]
    let arr = row.0;
    let entry = arr
        .as_array()
        .and_then(|a| a.first())
        .cloned()
        .ok_or_else(|| "Empty EXPLAIN result".to_string())?;

    let plan = entry["Plan"].clone();
    let planning_time = entry["Planning Time"].as_f64().unwrap_or(0.0);
    let execution_time = entry["Execution Time"].as_f64().unwrap_or(0.0);

    Ok(ExplainResult {
        plan,
        planning_time,
        execution_time,
        driver: "postgres".into(),
    })
}

pub async fn explain_mysql(pool: &sqlx::MySqlPool, sql: &str) -> Result<ExplainResult, String> {
    let sql = strip_sql(sql);
    let q = format!("EXPLAIN FORMAT=JSON {sql}");

    let row: (String,) = sqlx::query_as(&q)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("EXPLAIN failed: {e}"))?;

    let plan: serde_json::Value =
        serde_json::from_str(&row.0).map_err(|e| format!("Failed to parse EXPLAIN: {e}"))?;

    Ok(ExplainResult {
        plan,
        planning_time: 0.0,
        execution_time: 0.0,
        driver: "mysql".into(),
    })
}

pub async fn explain_sqlite(pool: &sqlx::SqlitePool, sql: &str) -> Result<ExplainResult, String> {
    let sql = strip_sql(sql);
    let q = format!("EXPLAIN QUERY PLAN {sql}");

    let rows = sqlx::query(&q)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("EXPLAIN failed: {e}"))?;

    // SQLite returns (id, parent, notused, detail)
    let flat: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id":     r.try_get::<i64, _>(0).unwrap_or(0),
                "parent": r.try_get::<i64, _>(1).unwrap_or(0),
                "detail": r.try_get::<String, _>(3).unwrap_or_default(),
            })
        })
        .collect();

    let plan = build_sqlite_tree(&flat);

    Ok(ExplainResult {
        plan,
        planning_time: 0.0,
        execution_time: 0.0,
        driver: "sqlite".into(),
    })
}

/// Convert SQLite's flat (id, parent, detail) rows into a nested plan tree
/// matching the shape of a PostgreSQL plan node so the same renderer handles both.
fn build_sqlite_tree(nodes: &[serde_json::Value]) -> serde_json::Value {
    fn children(all: &[serde_json::Value], parent_id: i64) -> Vec<serde_json::Value> {
        all.iter()
            .filter(|n| n["parent"].as_i64().unwrap_or(0) == parent_id)
            .map(|n| {
                let id = n["id"].as_i64().unwrap_or(0);
                let detail = n["detail"].as_str().unwrap_or("").to_string();
                let kids = children(all, id);
                let mut obj = serde_json::json!({
                    "Node Type": detail,
                    "Total Cost": 0.0,
                    "Startup Cost": 0.0,
                    "Plan Rows": 0,
                });
                if !kids.is_empty() {
                    obj["Plans"] = serde_json::Value::Array(kids);
                }
                obj
            })
            .collect()
    }

    let roots = children(nodes, 0);
    match roots.len() {
        1 => roots.into_iter().next().unwrap(),
        _ => serde_json::json!({
            "Node Type": "Query Plan",
            "Total Cost": 0.0,
            "Startup Cost": 0.0,
            "Plan Rows": 0,
            "Plans": roots,
        }),
    }
}
