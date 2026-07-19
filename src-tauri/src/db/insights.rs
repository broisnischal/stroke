//! Instance Insights — read-only database-monitoring snapshots.
//!
//! Powers the frontend "Instance Insights" dashboard (Activity / State / Config /
//! Replication tabs plus a cheap version header). Supported on PostgreSQL and
//! MySQL only; every other dialect returns [`UNSUPPORTED`].
//!
//! Design notes:
//! - All queries are parameterless catalog reads — no user input, no injection surface.
//! - Every section degrades gracefully: a catalog view that is missing or
//!   permission-denied yields empty rows / zeroed counters for that section rather
//!   than failing the whole command. The dashboard must never hard-fail because,
//!   e.g., `pg_stat_replication` requires a privileged role.

use super::connection::{require_conn, ActiveConnection, DbState};
use serde::Serialize;
use serde_json::{Map, Value};
use sqlx::{Column, MySqlPool, PgPool, Row};
use std::collections::HashMap;
use tauri::State;

/// Returned when Instance Insights is requested on an unsupported engine.
const UNSUPPORTED: &str = "Instance Insights is only available for PostgreSQL and MySQL";

// ── Row → JSON object helpers ──────────────────────────────────────────────────

/// Build a JSON object per row, keyed by the (aliased) SQL column names, using the
/// engine-specific cell decoder so all catalog types serialize cleanly.
fn pg_rows_to_objects(rows: &[sqlx::postgres::PgRow]) -> Vec<Value> {
    rows.iter()
        .map(|row| {
            let mut obj = Map::new();
            for (i, col) in row.columns().iter().enumerate() {
                obj.insert(col.name().to_string(), super::query::cell_to_json(row, i));
            }
            Value::Object(obj)
        })
        .collect()
}

fn mysql_rows_to_objects(rows: &[sqlx::mysql::MySqlRow]) -> Vec<Value> {
    rows.iter()
        .map(|row| {
            let mut obj = Map::new();
            for (i, col) in row.columns().iter().enumerate() {
                obj.insert(col.name().to_string(), super::mysql::cell_to_json(row, i));
            }
            Value::Object(obj)
        })
        .collect()
}

/// Run a catalog query and return one JSON object per row, or an empty vec if the
/// query fails (missing view / insufficient privilege). Never propagates the error.
async fn pg_query_objects(pool: &PgPool, sql: &str) -> Vec<Value> {
    match sqlx::query(sql).fetch_all(pool).await {
        Ok(rows) => pg_rows_to_objects(&rows),
        Err(_) => Vec::new(),
    }
}

async fn mysql_query_objects(pool: &MySqlPool, sql: &str) -> Vec<Value> {
    match sqlx::query(sql).fetch_all(pool).await {
        Ok(rows) => mysql_rows_to_objects(&rows),
        Err(_) => Vec::new(),
    }
}

// ══ 1. Version ═════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceVersion {
    /// "postgres" | "mysql"
    pub engine: String,
    pub version: String,
}

/// Cheap engine + version lookup so the dashboard header can render immediately.
pub async fn instance_version(state: State<'_, DbState>) -> Result<InstanceVersion, String> {
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => {
            let version = sqlx::query("SHOW server_version")
                .fetch_one(&pool)
                .await
                .ok()
                .and_then(|r| r.try_get::<String, _>(0).ok())
                .unwrap_or_default();
            Ok(InstanceVersion { engine: "postgres".into(), version })
        }
        ActiveConnection::Mysql(pool) => {
            let version = sqlx::query("SELECT VERSION()")
                .fetch_one(&pool)
                .await
                .ok()
                .and_then(|r| r.try_get::<String, _>(0).ok())
                .unwrap_or_default();
            Ok(InstanceVersion { engine: "mysql".into(), version })
        }
        _ => Err(UNSUPPORTED.into()),
    }
}

// ══ 2. Activity ════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCounts {
    pub total: i64,
    pub active: i64,
    pub idle: i64,
    pub max: i64,
    /// total / max * 100, clamped to 0 when max is unknown.
    pub usage_pct: f64,
}

/// Cumulative counters. The frontend diffs successive snapshots to derive
/// per-second rates, so these are raw monotonic totals — do not reset them here.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityCounters {
    pub commits: i64,
    pub rollbacks: i64,
    pub tup_updated: i64,
    pub tup_deleted: i64,
    pub tup_fetched: i64,
    pub tup_returned: i64,
    pub blks_read: i64,
    pub blks_hit: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceActivity {
    pub engine: String,
    pub sessions: SessionCounts,
    pub counters: ActivityCounters,
    /// blks_hit / (blks_hit + blks_read); 0 when there has been no I/O yet.
    pub buffer_hit_ratio: f64,
}

fn hit_ratio(blks_hit: i64, blks_read: i64) -> f64 {
    let total = blks_hit + blks_read;
    if total > 0 {
        blks_hit as f64 / total as f64
    } else {
        0.0
    }
}

fn usage_pct(total: i64, max: i64) -> f64 {
    if max > 0 {
        total as f64 / max as f64 * 100.0
    } else {
        0.0
    }
}

pub async fn instance_activity(state: State<'_, DbState>) -> Result<InstanceActivity, String> {
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => Ok(pg_activity(&pool).await),
        ActiveConnection::Mysql(pool) => Ok(mysql_activity(&pool).await),
        _ => Err(UNSUPPORTED.into()),
    }
}

async fn pg_activity(pool: &PgPool) -> InstanceActivity {
    // Sessions — count total / active / idle from pg_stat_activity.
    let (total, active, idle) = match sqlx::query(
        "SELECT count(*) AS total,
                count(*) FILTER (WHERE state = 'active') AS active,
                count(*) FILTER (WHERE state = 'idle')   AS idle
         FROM pg_stat_activity",
    )
    .fetch_one(pool)
    .await
    {
        Ok(r) => (
            r.try_get::<i64, _>("total").unwrap_or(0),
            r.try_get::<i64, _>("active").unwrap_or(0),
            r.try_get::<i64, _>("idle").unwrap_or(0),
        ),
        Err(_) => (0, 0, 0),
    };

    let max = sqlx::query("SHOW max_connections")
        .fetch_one(pool)
        .await
        .ok()
        .and_then(|r| r.try_get::<String, _>(0).ok())
        .and_then(|s| s.trim().parse::<i64>().ok())
        .unwrap_or(0);

    // Cumulative counters aggregated across all databases.
    let counters = match sqlx::query(
        "SELECT COALESCE(sum(xact_commit),0)::bigint   AS commits,
                COALESCE(sum(xact_rollback),0)::bigint AS rollbacks,
                COALESCE(sum(tup_updated),0)::bigint   AS tup_updated,
                COALESCE(sum(tup_deleted),0)::bigint   AS tup_deleted,
                COALESCE(sum(tup_fetched),0)::bigint   AS tup_fetched,
                COALESCE(sum(tup_returned),0)::bigint  AS tup_returned,
                COALESCE(sum(blks_read),0)::bigint     AS blks_read,
                COALESCE(sum(blks_hit),0)::bigint      AS blks_hit
         FROM pg_stat_database",
    )
    .fetch_one(pool)
    .await
    {
        Ok(r) => ActivityCounters {
            commits: r.try_get("commits").unwrap_or(0),
            rollbacks: r.try_get("rollbacks").unwrap_or(0),
            tup_updated: r.try_get("tup_updated").unwrap_or(0),
            tup_deleted: r.try_get("tup_deleted").unwrap_or(0),
            tup_fetched: r.try_get("tup_fetched").unwrap_or(0),
            tup_returned: r.try_get("tup_returned").unwrap_or(0),
            blks_read: r.try_get("blks_read").unwrap_or(0),
            blks_hit: r.try_get("blks_hit").unwrap_or(0),
        },
        Err(_) => zero_counters(),
    };

    let buffer_hit_ratio = hit_ratio(counters.blks_hit, counters.blks_read);
    InstanceActivity {
        engine: "postgres".into(),
        sessions: SessionCounts { total, active, idle, max, usage_pct: usage_pct(total, max) },
        counters,
        buffer_hit_ratio,
    }
}

async fn mysql_activity(pool: &MySqlPool) -> InstanceActivity {
    // Sessions — 'Sleep' command == idle connection.
    let (total, active, idle) = match sqlx::query(
        "SELECT COUNT(*) AS total,
                CAST(SUM(COMMAND <> 'Sleep') AS SIGNED) AS active,
                CAST(SUM(COMMAND =  'Sleep') AS SIGNED) AS idle
         FROM information_schema.PROCESSLIST",
    )
    .fetch_one(pool)
    .await
    {
        Ok(r) => (
            r.try_get::<i64, _>("total").unwrap_or(0),
            r.try_get::<Option<i64>, _>("active").ok().flatten().unwrap_or(0),
            r.try_get::<Option<i64>, _>("idle").ok().flatten().unwrap_or(0),
        ),
        Err(_) => (0, 0, 0),
    };

    let max = match sqlx::query("SHOW VARIABLES LIKE 'max_connections'")
        .fetch_one(pool)
        .await
    {
        Ok(r) => r
            .try_get::<String, _>(1)
            .ok()
            .and_then(|s| s.trim().parse::<i64>().ok())
            .unwrap_or(0),
        Err(_) => 0,
    };

    // Global status counters → name/value map.
    let status = mysql_status_map(
        pool,
        &[
            "Com_commit",
            "Com_rollback",
            "Innodb_rows_updated",
            "Innodb_rows_deleted",
            "Innodb_rows_read",
            "Innodb_buffer_pool_read_requests",
            "Innodb_buffer_pool_reads",
        ],
    )
    .await;
    let g = |k: &str| -> i64 { status.get(k).copied().unwrap_or(0) };

    // InnoDB exposes logical read requests and physical (disk) reads. Map onto the
    // PostgreSQL buffer-cache model: hits = requests - physical reads (pages served
    // from the pool), reads = physical reads (pages fetched from disk). MySQL has no
    // separate "returned" tuple counter, so tup_returned mirrors rows_read.
    let read_requests = g("Innodb_buffer_pool_read_requests");
    let disk_reads = g("Innodb_buffer_pool_reads");
    let blks_hit = (read_requests - disk_reads).max(0);
    let counters = ActivityCounters {
        commits: g("Com_commit"),
        rollbacks: g("Com_rollback"),
        tup_updated: g("Innodb_rows_updated"),
        tup_deleted: g("Innodb_rows_deleted"),
        tup_fetched: g("Innodb_rows_read"),
        tup_returned: g("Innodb_rows_read"),
        blks_read: disk_reads,
        blks_hit,
    };

    let buffer_hit_ratio = hit_ratio(counters.blks_hit, counters.blks_read);
    InstanceActivity {
        engine: "mysql".into(),
        sessions: SessionCounts { total, active, idle, max, usage_pct: usage_pct(total, max) },
        counters,
        buffer_hit_ratio,
    }
}

fn zero_counters() -> ActivityCounters {
    ActivityCounters {
        commits: 0,
        rollbacks: 0,
        tup_updated: 0,
        tup_deleted: 0,
        tup_fetched: 0,
        tup_returned: 0,
        blks_read: 0,
        blks_hit: 0,
    }
}

/// Fetch the requested `SHOW GLOBAL STATUS` variables into a name→value map.
/// Values are string integers; unparseable / missing entries are simply absent.
async fn mysql_status_map(pool: &MySqlPool, names: &[&str]) -> HashMap<String, i64> {
    let list = names
        .iter()
        .map(|n| format!("'{n}'"))
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!("SHOW GLOBAL STATUS WHERE Variable_name IN ({list})");
    let mut map = HashMap::new();
    if let Ok(rows) = sqlx::query(&sql).fetch_all(pool).await {
        for r in &rows {
            let name = r.try_get::<String, _>(0).unwrap_or_default();
            let value = r
                .try_get::<String, _>(1)
                .ok()
                .and_then(|s| s.trim().parse::<i64>().ok())
                .unwrap_or(0);
            if !name.is_empty() {
                map.insert(name, value);
            }
        }
    }
    map
}

// ══ 3. State ═══════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceState {
    pub engine: String,
    pub sessions: Vec<Value>,
    pub locks: Vec<Value>,
    pub prepared_transactions: Vec<Value>,
}

pub async fn instance_state(state: State<'_, DbState>) -> Result<InstanceState, String> {
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => {
            let sessions = pg_query_objects(
                &pool,
                "SELECT pid,
                        usename          AS \"user\",
                        application_name AS application,
                        client_addr::text AS client,
                        state,
                        wait_event,
                        pg_blocking_pids(pid) AS blocking_pids
                 FROM pg_stat_activity
                 ORDER BY pid",
            )
            .await;
            let locks = pg_query_objects(
                &pool,
                "SELECT l.locktype       AS lock_type,
                        c.relname::text  AS target_relation
                 FROM pg_locks l
                 LEFT JOIN pg_class c ON c.oid = l.relation
                 LIMIT 200",
            )
            .await;
            let prepared_transactions =
                pg_query_objects(&pool, "SELECT * FROM pg_prepared_xacts").await;
            Ok(InstanceState { engine: "postgres".into(), sessions, locks, prepared_transactions })
        }
        ActiveConnection::Mysql(pool) => {
            let sessions = mysql_query_objects(
                &pool,
                "SELECT ID AS id, USER AS user, HOST AS host, DB AS db,
                        COMMAND AS command, STATE AS state, INFO AS info
                 FROM information_schema.PROCESSLIST
                 ORDER BY ID",
            )
            .await;
            // performance_schema.data_locks may be disabled or unavailable → empty.
            let locks = mysql_query_objects(
                &pool,
                "SELECT * FROM performance_schema.data_locks LIMIT 200",
            )
            .await;
            // MySQL has no queryable prepared-transaction catalog (XA RECOVER only).
            Ok(InstanceState {
                engine: "mysql".into(),
                sessions,
                locks,
                prepared_transactions: Vec::new(),
            })
        }
        _ => Err(UNSUPPORTED.into()),
    }
}

// ══ 4. Config ══════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigSetting {
    pub name: String,
    pub category: String,
    pub value: String,
    pub unit: String,
    pub requires_restart: bool,
    pub description: String,
}

pub async fn instance_config(state: State<'_, DbState>) -> Result<Vec<ConfigSetting>, String> {
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => {
            let rows = sqlx::query(
                "SELECT name,
                        category,
                        setting AS value,
                        unit,
                        (context = 'postmaster') AS requires_restart,
                        short_desc AS description
                 FROM pg_settings
                 ORDER BY name",
            )
            .fetch_all(&pool)
            .await
            .unwrap_or_default();
            let opt = |r: &sqlx::postgres::PgRow, c: &str| -> String {
                r.try_get::<Option<String>, _>(c).ok().flatten().unwrap_or_default()
            };
            Ok(rows
                .iter()
                .map(|r| ConfigSetting {
                    name: r.try_get::<String, _>("name").unwrap_or_default(),
                    category: opt(r, "category"),
                    value: opt(r, "value"),
                    unit: opt(r, "unit"),
                    requires_restart: r
                        .try_get::<Option<bool>, _>("requires_restart")
                        .ok()
                        .flatten()
                        .unwrap_or(false),
                    description: opt(r, "description"),
                })
                .collect())
        }
        ActiveConnection::Mysql(pool) => {
            let rows = sqlx::query("SHOW VARIABLES").fetch_all(&pool).await.unwrap_or_default();
            Ok(rows
                .iter()
                .map(|r| ConfigSetting {
                    name: r.try_get::<String, _>(0).unwrap_or_default(),
                    category: String::new(),
                    value: r.try_get::<String, _>(1).unwrap_or_default(),
                    unit: String::new(),
                    requires_restart: false,
                    description: String::new(),
                })
                .collect())
        }
        _ => Err(UNSUPPORTED.into()),
    }
}

// ══ 5. Replication ═════════════════════════════════════════════════════════════

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceReplication {
    pub engine: String,
    pub stats: Vec<Value>,
    pub slots: Vec<Value>,
}

pub async fn instance_replication(state: State<'_, DbState>) -> Result<InstanceReplication, String> {
    match require_conn(&state)? {
        ActiveConnection::Postgres(pool) => {
            let stats = pg_query_objects(
                &pool,
                "SELECT pid,
                        client_addr::text AS client_addr,
                        application_name,
                        state,
                        sync_state,
                        reply_time,
                        write_lag::text  AS write_lag,
                        flush_lag::text  AS flush_lag,
                        replay_lag::text AS replay_lag
                 FROM pg_stat_replication",
            )
            .await;
            let slots = pg_query_objects(&pool, "SELECT * FROM pg_replication_slots").await;
            Ok(InstanceReplication { engine: "postgres".into(), stats, slots })
        }
        ActiveConnection::Mysql(pool) => {
            // MySQL 8.0.22+ renamed SHOW SLAVE STATUS → SHOW REPLICA STATUS. Try the
            // new name, fall back to the legacy one, and if neither applies (not a
            // replica / not permitted) return empty rather than erroring.
            let stats = match sqlx::query("SHOW REPLICA STATUS").fetch_all(&pool).await {
                Ok(rows) => mysql_rows_to_objects(&rows),
                Err(_) => match sqlx::query("SHOW SLAVE STATUS").fetch_all(&pool).await {
                    Ok(rows) => mysql_rows_to_objects(&rows),
                    Err(_) => Vec::new(),
                },
            };
            // No slot concept in MySQL replication.
            Ok(InstanceReplication { engine: "mysql".into(), stats, slots: Vec::new() })
        }
        _ => Err(UNSUPPORTED.into()),
    }
}
