//! Live mode — push table changes to the frontend so a viewed table refreshes
//! itself when the underlying data changes.
//!
//! Both engines use cheap **polling** (a background task per watched table) so
//! live mode needs no special privileges and works through connection poolers
//! (pgbouncer, Supabase, etc.) that break trigger DDL / `LISTEN`:
//!
//! - **SQLite**: `PRAGMA data_version` — an in-memory counter that bumps whenever
//!   *another* connection/process commits a change to the file.
//! - **Postgres**: the `n_tup_ins + n_tup_upd + n_tup_del` counters from
//!   `pg_stat_user_tables` — increments on every insert/update/delete, readable
//!   by any role, no table scan. (A ~1–2s stats-flush lag is fine for live view.)
//!
//! Only one table is watched at a time (the active tab). Starting a new watch
//! tears the previous one down first.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use sqlx::{PgPool, SqlitePool};
use tauri::{AppHandle, Emitter};

use super::connection::ActiveConnection;

/// Tauri event emitted to the frontend when the watched table changes.
pub const LIVE_EVENT: &str = "live-change";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveChange {
    pub schema: String,
    pub table: String,
}

struct Watcher {
    handle: tokio::task::JoinHandle<()>,
}

/// Tracks the single active live-watch task.
#[derive(Default)]
pub struct LiveState {
    inner: Arc<Mutex<Option<Watcher>>>,
}

impl LiveState {
    /// Swap in a new watcher (or `None`), returning the previous one.
    fn replace(&self, next: Option<Watcher>) -> Option<Watcher> {
        let mut guard = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        std::mem::replace(&mut *guard, next)
    }
}

// ── Public API ──────────────────────────────────────────────────────────────

/// Start (or restart) watching `schema.table` on the active connection.
pub fn start(
    app: AppHandle,
    conn: ActiveConnection,
    live: &LiveState,
    schema: String,
    table: String,
) -> Result<(), String> {
    stop(live); // tear down any previous watcher first

    let handle = match conn {
        ActiveConnection::Sqlite(pool) => spawn_sqlite(app, pool, schema, table),
        ActiveConnection::Postgres(pool) => spawn_pg(app, pool, schema, table),
        other => {
            return Err(format!(
                "Live mode isn't available for {} connections yet",
                other.driver()
            ))
        }
    };
    live.replace(Some(Watcher { handle }));
    Ok(())
}

/// Stop the active watcher.
pub fn stop(live: &LiveState) {
    if let Some(watcher) = live.replace(None) {
        watcher.handle.abort();
    }
}

// ── SQLite: poll PRAGMA data_version ──────────────────────────────────────────

fn spawn_sqlite(
    app: AppHandle,
    pool: SqlitePool,
    schema: String,
    table: String,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut last: Option<i64> = None;
        let mut ticker = tokio::time::interval(Duration::from_millis(1000));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            ticker.tick().await;
            // data_version only changes for commits made on *other* connections,
            // so the app's own edits (single pooled connection) never self-trigger.
            match sqlx::query_scalar::<_, i64>("PRAGMA data_version")
                .fetch_one(&pool)
                .await
            {
                Ok(v) => {
                    if last.is_some_and(|prev| prev != v) {
                        emit(&app, &schema, &table);
                    }
                    last = Some(v);
                }
                Err(_) => {} // transient (pool busy / closing) — retry next tick
            }
        }
    })
}

// ── Postgres: poll pg_stat_user_tables modification counters ───────────────────

fn spawn_pg(
    app: AppHandle,
    pool: PgPool,
    schema: String,
    table: String,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut last: Option<i64> = None;
        let mut ticker = tokio::time::interval(Duration::from_millis(1500));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            ticker.tick().await;
            let result = sqlx::query_scalar::<_, i64>(
                "SELECT (COALESCE(n_tup_ins, 0) + COALESCE(n_tup_upd, 0) + COALESCE(n_tup_del, 0))::bigint \
                 FROM pg_stat_user_tables WHERE schemaname = $1 AND relname = $2",
            )
            .bind(&schema)
            .bind(&table)
            .fetch_optional(&pool)
            .await;
            match result {
                Ok(Some(v)) => {
                    if last.is_some_and(|prev| prev != v) {
                        emit(&app, &schema, &table);
                    }
                    last = Some(v);
                }
                // No stats row yet (table never modified, or track_counts off) —
                // keep polling; the row appears once activity is recorded.
                Ok(None) => {}
                Err(_) => {}
            }
        }
    })
}

fn emit(app: &AppHandle, schema: &str, table: &str) {
    let _ = app.emit(
        LIVE_EVENT,
        LiveChange { schema: schema.to_string(), table: table.to_string() },
    );
}
