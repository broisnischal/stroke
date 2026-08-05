use log::LevelFilter;
use serde::{Deserialize, Serialize};
use sqlx::mysql::{MySqlConnectOptions, MySqlPoolOptions};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{ConnectOptions, MySqlPool, PgPool, SqlitePool};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::State;
use tokio::sync::oneshot;

use super::ssh_tunnel::{SshConfig, SshTunnel, TunnelState};

// ── PostgreSQL ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PgConfig {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    pub ssl: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssh: Option<SshConfig>,
    /// Session time zone applied on every pooled connection (IANA name, e.g.
    /// "America/New_York"). `None`/"SYSTEM" leaves the server default in place.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
}

impl PgConfig {
    pub fn connection_url(&self) -> String {
        let ssl = if self.ssl { "?sslmode=require" } else { "" };
        format!(
            "postgres://{}:{}@{}:{}/{}{}",
            urlencoding::encode(&self.user),
            urlencoding::encode(&self.password),
            self.host,
            self.port,
            self.database,
            ssl
        )
    }
}

/// Kept for backward-compat with all existing code that uses `ConnectionConfig`.
pub type ConnectionConfig = PgConfig;

// ── SQLite ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqliteConfig {
    pub name: String,
    /// Absolute file path, or `:memory:` for an in-memory database.
    pub file_path: String,
}

// ── MySQL ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MysqlConfig {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    pub ssl: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssh: Option<SshConfig>,
    /// Session time zone applied on connect (`SET time_zone`). `None`/"SYSTEM"
    /// leaves the server default in place.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
}

impl MysqlConfig {
    pub fn connection_url(&self) -> String {
        let ssl_mode = if self.ssl { "ssl-mode=required" } else { "ssl-mode=disabled" };
        format!(
            "mysql://{}:{}@{}:{}/{}?{}",
            urlencoding::encode(&self.user),
            urlencoding::encode(&self.password),
            self.host,
            self.port,
            self.database,
            ssl_mode
        )
    }
}

// ── Cloudflare D1 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct D1Config {
    pub name: String,
    pub account_id: String,
    pub database_id: String,
    pub api_token: String,
}

// ── LibSQL / Turso ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibSqlConfig {
    pub name: String,
    /// Database URL: libsql://*.turso.io, https://*.turso.io, or http://localhost:PORT
    pub url: String,
    /// Auth token (Turso). Leave None/empty for local unauthenticated libsql-server.
    pub auth_token: Option<String>,
}

// ── ClickHouse ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickhouseConfig {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    /// Use HTTPS (port 8443) instead of plain HTTP (port 8123).
    #[serde(default)]
    pub secure: bool,
}

impl ClickhouseConfig {
    /// Base HTTP(S) URL for the ClickHouse HTTP interface, no trailing slash.
    pub fn base_url(&self) -> String {
        let scheme = if self.secure { "https" } else { "http" };
        format!("{scheme}://{}:{}", self.host, self.port)
    }
}

// ── Redis ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisConfig {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub password: Option<String>,
    /// Logical database index (0–15 by default).
    #[serde(default)]
    pub db: u8,
    /// Use TLS (rediss://) instead of plain TCP (redis://).
    #[serde(default)]
    pub tls: bool,
}

// ── DuckDB ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuckdbConfig {
    pub name: String,
    /// Absolute file path, or `:memory:` for an in-memory database.
    pub file_path: String,
}

/// DuckDB's `Connection` is synchronous and not clonable, so we wrap it in an
/// `Arc<Mutex<…>>`. All access happens inside `spawn_blocking` to keep the async
/// runtime free; the lock is held only for the duration of a single statement.
pub type DuckdbHandle = Arc<Mutex<duckdb::Connection>>;

// ── MS SQL Server ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MssqlConfig {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    /// Negotiate TLS encryption for the connection.
    #[serde(default)]
    pub encrypt: bool,
    /// Skip TLS certificate validation (self-signed dev servers).
    #[serde(default)]
    pub trust_cert: bool,
}

/// tiberius `Client` is async and not clonable; share it behind an async mutex.
/// Only one desktop connection is ever live, so lock contention is a non-issue.
pub type MssqlHandle = Arc<tokio::sync::Mutex<crate::db::mssql::MssqlClient>>;

// ── Any-connection config for cross-connection queries ────────────────────────

/// Accepts the full saved-connection JSON from the frontend and routes to the
/// correct backend without touching the global active-connection state.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "type")]
pub enum AnyConnectionConfig {
    #[serde(rename = "postgres")]
    Postgres(PgConfig),
    #[serde(rename = "sqlite")]
    Sqlite(SqliteConfig),
    #[serde(rename = "d1")]
    D1(D1Config),
    #[serde(rename = "mysql")]
    Mysql(MysqlConfig),
    #[serde(rename = "libsql")]
    Libsql(LibSqlConfig),
    #[serde(rename = "clickhouse")]
    Clickhouse(ClickhouseConfig),
    #[serde(rename = "redis")]
    Redis(RedisConfig),
    #[serde(rename = "duckdb")]
    Duckdb(DuckdbConfig),
    #[serde(rename = "mssql")]
    Mssql(MssqlConfig),
}

// ── Active connection ─────────────────────────────────────────────────────────

#[derive(Clone)]
pub enum ActiveConnection {
    Postgres(PgPool),
    Sqlite(SqlitePool),
    Mysql(MySqlPool),
    D1(D1Config),
    LibSql(LibSqlConfig),
    Clickhouse(ClickhouseConfig),
    Redis(RedisConfig),
    Duckdb(DuckdbHandle),
    Mssql(MssqlHandle),
}

impl ActiveConnection {
    pub fn driver(&self) -> &'static str {
        match self {
            Self::Postgres(_) => "postgres",
            Self::Sqlite(_) => "sqlite",
            Self::Mysql(_) => "mysql",
            Self::D1(_) => "d1",
            Self::LibSql(_) => "libsql",
            Self::Clickhouse(_) => "clickhouse",
            Self::Redis(_) => "redis",
            Self::Duckdb(_) => "duckdb",
            Self::Mssql(_) => "mssql",
        }
    }
}

// ── DbState ───────────────────────────────────────────────────────────────────

pub struct DbState {
    pub conn: Arc<Mutex<Option<ActiveConnection>>>,
    pub cancel_tx: Arc<Mutex<Option<oneshot::Sender<()>>>>,
}

impl Default for DbState {
    fn default() -> Self {
        Self {
            conn: Arc::new(Mutex::new(None)),
            cancel_tx: Arc::new(Mutex::new(None)),
        }
    }
}

/// Returns a clone of the active connection, or an error if disconnected.
pub fn require_conn(state: &State<'_, DbState>) -> Result<ActiveConnection, String> {
    state
        .conn
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "Not connected to a database".to_string())
}

/// Convenience helper kept for all existing PostgreSQL-specific code.
pub fn require_pool(state: &State<'_, DbState>) -> Result<PgPool, String> {
    match require_conn(state)? {
        ActiveConnection::Postgres(pool) => Ok(pool),
        other => Err(format!(
            "Expected a PostgreSQL connection, got {}",
            other.driver()
        )),
    }
}

/// The same `Arc` that `DbState` and `McpState` share, parked so code without a
/// `State` handle can reach the live connection. Set once from `setup()`.
static ACTIVE: std::sync::OnceLock<Arc<Mutex<Option<ActiveConnection>>>> = std::sync::OnceLock::new();

/// Called once from `setup()`. Later calls are ignored.
pub fn register_active_conn(conn: Arc<Mutex<Option<ActiveConnection>>>) {
    let _ = ACTIVE.set(conn);
}

/// Swap in a newly-refreshed Cloudflare token on the live D1 connection.
///
/// Without this, a refresh fixes only the one request that triggered it: the
/// connection still holds the dead token, so the *next* query 401s and pays for
/// its own refresh round trip, forever. No-op unless a D1 connection is open.
pub fn update_d1_token(token: &str) {
    let Some(slot) = ACTIVE.get() else { return };
    let Ok(mut guard) = slot.lock() else { return };
    if let Some(ActiveConnection::D1(cfg)) = guard.as_mut() {
        cfg.api_token = token.to_string();
    }
}

fn set_conn(state: &State<'_, DbState>, conn: Option<ActiveConnection>) -> Result<(), String> {
    *state.conn.lock().map_err(|e| e.to_string())? = conn;
    Ok(())
}

async fn close_existing(state: &State<'_, DbState>) {
    let old = state.conn.lock().ok().and_then(|mut g| g.take());
    let Some(conn) = old else { return };
    // Drain the old pool in the background. Pool::close() waits for every
    // connection to be handed back — and against a dead peer (sleep/wake,
    // network change: exactly the state a reconnect follows) that stalls for
    // seconds. Nothing downstream needs the drain to finish — the state slot
    // is already empty — so never make connect/switch wait on it. The timeout
    // caps the drain; after that the OS cleans up the sockets.
    tokio::spawn(async move {
        let timeout = std::time::Duration::from_secs(3);
        match conn {
            ActiveConnection::Postgres(p) => {
                let _ = tokio::time::timeout(timeout, p.close()).await;
            }
            ActiveConnection::Sqlite(p) => {
                let _ = tokio::time::timeout(timeout, p.close()).await;
            }
            ActiveConnection::Mysql(p) => {
                let _ = tokio::time::timeout(timeout, p.close()).await;
            }
            // Handle-based engines (DuckDB, MSSQL) and HTTP configs clean up in Drop.
            _ => {}
        }
    });
}

// ── Reachability preflight ────────────────────────────────────────────────────

/// Name-resolution budget. Split from the TCP budget because a stalled resolver
/// (VPN split-DNS, an unreachable DNS server) is a distinct failure from a
/// stalled handshake and must not eat the whole probe window.
const DNS_BUDGET: Duration = Duration::from_secs(5);
/// Per-address TCP handshake budget for the probe.
const TCP_BUDGET: Duration = Duration::from_secs(6);
/// Hard ceiling on one whole connect attempt (probe + handshake + auth). Exists
/// so an indeterminate stall surfaces a real error instead of spinning: a
/// blackholed route gives no reply at all, and the OS SYN-retry window is ~21 s
/// on Windows, well past any point where waiting is still useful.
const CONNECT_DEADLINE: Duration = Duration::from_secs(20);

/// What the pre-connect probe learned about `host:port`.
enum Preflight {
    /// A candidate address completed a TCP handshake. Drivers dial it directly:
    /// that skips a second name lookup and, on a dual-stack host, skips the
    /// address family that is blackholed.
    Reachable(std::net::SocketAddr),
    /// Definitive answer: the name doesn't resolve, nothing is listening, or
    /// there is no route. Waiting longer or retrying cannot change it.
    Unreachable(String),
    /// Indeterminate: candidates were still in flight when the budget ran out.
    /// A slow VPN/satellite link looks exactly like this, so this must NEVER
    /// veto the real connect — it only supplies the message if that stalls too.
    Inconclusive(String),
}

/// Probe `host:port` before building a pool so unreachable hosts and wrong ports
/// fail with a clear message instead of stalling on the pool's acquire timeout.
async fn preflight(host: &str, port: u16) -> Preflight {
    let host = host.trim();
    if host.is_empty() {
        return Preflight::Unreachable("Host is empty".to_string());
    }
    let target = format!("{host}:{port}");

    let addrs = match tokio::time::timeout(DNS_BUDGET, tokio::net::lookup_host(&target)).await {
        Ok(Ok(it)) => it.collect::<Vec<_>>(),
        Ok(Err(e)) => return Preflight::Unreachable(format!("Can't resolve host {host}: {e}")),
        Err(_) => {
            return Preflight::Inconclusive(format!(
                "Name lookup for {host} didn't answer within {}s",
                DNS_BUDGET.as_secs()
            ))
        }
    };
    if addrs.is_empty() {
        return Preflight::Unreachable(format!("Host {host} didn't resolve to any address"));
    }

    // Happy eyeballs: probe every resolved address CONCURRENTLY and take the
    // first that completes. Both `TcpStream::connect(host_str)` and the sqlx /
    // tiberius drivers walk the address list SEQUENTIALLY, so a host whose AAAA
    // record has no working route stalls on IPv6 for the full OS SYN-retry
    // window (~21 s on Windows, where an unroutable v6 destination black-holes
    // instead of returning ENETUNREACH like Linux usually does) before the
    // working IPv4 address is ever tried. Racing them removes that stall and
    // hands the driver the address we know answers.
    let mut probes = tokio::task::JoinSet::new();
    for addr in addrs {
        probes.spawn(async move {
            let r = tokio::time::timeout(TCP_BUDGET, tokio::net::TcpStream::connect(addr)).await;
            (addr, r)
        });
    }

    let mut last_err: Option<String> = None;
    let mut stalled = false;
    while let Some(joined) = probes.join_next().await {
        match joined {
            // Dropping `probes` here aborts the remaining in-flight probes.
            Ok((addr, Ok(Ok(_stream)))) => return Preflight::Reachable(addr),
            Ok((addr, Ok(Err(e)))) => last_err = Some(format!("{addr}: {e}")),
            Ok((_, Err(_))) => stalled = true,
            Err(_) => {} // probe task panicked or was cancelled - ignore
        }
    }

    if stalled {
        // Some address never answered. Could be a slow link, so stay advisory.
        Preflight::Inconclusive(format!(
            "Can't reach {target} — no response within {}s. Check the host/port, and whether a firewall or VPN is blocking it.",
            TCP_BUDGET.as_secs()
        ))
    } else {
        Preflight::Unreachable(format!(
            "Can't reach {target} ({})",
            last_err.unwrap_or_else(|| "no route to host".to_string())
        ))
    }
}

/// Race the driver's real connect against the reachability probe.
///
/// The probe NEVER vetoes a connect that could still succeed. It only
/// short-circuits on a *definitive* answer (the name doesn't resolve, nothing is
/// listening, no route). Two separate failure modes forced this shape, both
/// observed against a real remote database:
///
///   • Probing *before* connecting adds the probe's full cost to every connect.
///     On a lossy link a dropped SYN is retried at 1s/2s/4s, so the probe can
///     burn 6s for a database that then completes its handshake in 335ms.
///   • Treating an inconclusive probe as failure aborts the connect for hosts
///     that are merely slow to answer. That is the "can't connect at all on some
///     machines" report: the app returned "Can't reach host" having never
///     attempted a handshake, and the frontend then retried that same verdict.
///
/// Racing gives all three properties at once: no added latency on the happy
/// path, a fast clear error for genuinely dead hosts, and a slow-but-reachable
/// host still connects.
///
/// Phase timings are logged at info level. "Connecting is slow" is otherwise
/// unattributable from the outside — name lookup, TCP, and TLS+auth stall for
/// completely different reasons, and the machines where this reproduces (Windows
/// behind a VPN, corporate DNS) are rarely the machine doing the debugging.
async fn connect_racing_probe<T>(
    host: &str,
    port: u16,
    connect: impl std::future::Future<Output = Result<T, String>>,
) -> Result<T, String> {
    let t0 = std::time::Instant::now();
    let probe = preflight(host, port);
    let deadline = tokio::time::sleep(CONNECT_DEADLINE);
    tokio::pin!(probe);
    tokio::pin!(connect);
    tokio::pin!(deadline);

    // Diagnosis to report if the handshake never finishes. Only an inconclusive
    // probe produces one; a definitive failure returns immediately instead.
    let mut hint: Option<String> = None;
    let mut probe_pending = true;

    loop {
        tokio::select! {
            // `probe_pending` stops select! from polling an already-completed
            // future on the next loop iteration.
            outcome = &mut probe, if probe_pending => {
                probe_pending = false;
                let ms = t0.elapsed().as_millis();
                match outcome {
                    Preflight::Reachable(addr) => {
                        log::info!("preflight {host}:{port} -> {addr} reachable in {ms}ms");
                    }
                    Preflight::Unreachable(msg) => {
                        log::warn!("preflight {host}:{port} definitively unreachable in {ms}ms: {msg}");
                        return Err(msg);
                    }
                    Preflight::Inconclusive(h) => {
                        log::warn!("preflight {host}:{port} inconclusive after {ms}ms - still waiting on the handshake");
                        hint = Some(h);
                    }
                }
            }
            result = &mut connect => {
                let ms = t0.elapsed().as_millis();
                match &result {
                    Ok(_) => log::info!("connected to {host}:{port} in {ms}ms"),
                    Err(e) => log::warn!("connect to {host}:{port} failed after {ms}ms: {e}"),
                }
                return result;
            }
            _ = &mut deadline => {
                let ms = t0.elapsed().as_millis();
                log::warn!("connect to {host}:{port} gave up after {ms}ms");
                return Err(hint.unwrap_or_else(|| {
                    format!("Connection timed out after {}s", CONNECT_DEADLINE.as_secs())
                }));
            }
        }
    }
}

// ── PostgreSQL connect / test ─────────────────────────────────────────────────

fn pg_pool_builder() -> PgPoolOptions {
    PgPoolOptions::new()
        // Desktop app: steady-state use only needs ~4 connections. But the FIRST
        // open of a table bursts 6 concurrent queries — rows + count + the four
        // catalog-metadata lookups (enums/nullable/pk/fk), which now run in
        // parallel with the row fetch. Cap at 8 so that burst never queues behind
        // a 4-connection ceiling (which would serialize metadata after the rows
        // and stall the first open); the extras stay idle and close after
        // idle_timeout, so steady state still settles back to ~4.
        .max_connections(8)
        // No min_connections: keeping idle connections alive causes ping failures
        // after network changes or laptop sleep/wake (os error 60), then a 27 s
        // stall while the pool replaces the dead connection.
        // The preflight already filtered definitively unreachable hosts, so a
        // short acquire timeout keeps auth/handshake failures snappy. It must
        // still clear a cold-pool handshake on a slow remote link (TCP + TLS +
        // auth is ~6 round trips), hence 10 s rather than something tighter —
        // warm_pool below is what keeps the common path off this ceiling.
        .acquire_timeout(Duration::from_secs(10))
        // Keep connections warm for the whole active session. A short idle_timeout
        // (was 30 s) meant any pause longer than that forced a full TCP+TLS+auth
        // re-handshake on the next query — on a remote/SSL host that's seconds of
        // latency per connection, and a single table open opens several. 10 min
        // keeps the pool warm between interactions so repeat fetches stay fast;
        // test_before_acquire (sqlx default) still drops connections killed by
        // sleep/wake. max_lifetime caps server-side staleness.
        .idle_timeout(Duration::from_secs(600))
        .max_lifetime(Duration::from_secs(1800))
}

/// How many connections to have standing by before the user's first query.
/// The first table open bursts rows + four catalog lookups; anything the pool
/// hasn't already opened is a TCP + TLS + auth handshake on the critical path.
const PG_WARM_CONNECTIONS: usize = 5;

/// Open `PG_WARM_CONNECTIONS` connections in parallel and release them straight
/// back to the pool.
///
/// `min_connections` is deliberately 0 (see `pg_pool_builder`: idle connections
/// held across a sleep/wake come back dead and cost a 27 s stall), so the pool
/// starts with exactly the one connection the handshake produced. That left the
/// first table open paying for four more handshakes at once — several seconds on
/// a remote host. Filling the pool here moves that cost into the connect step,
/// where the user is already waiting on a progress indicator, and it stays
/// filled for `idle_timeout`.
///
/// Best effort: a failure here is not a connection failure. The pool opens the
/// connection on demand later exactly as it did before.
async fn warm_pool(pool: &PgPool) {
    let handles: Vec<_> = (0..PG_WARM_CONNECTIONS).map(|_| pool.acquire()).collect();
    // Held until the end of the statement, so the pool has to open a distinct
    // connection for each rather than handing the same one out five times.
    let _ = futures::future::join_all(handles).await;
}

/// Turn sqlx's `PoolTimedOut` into the error that actually caused it.
///
/// A pool `acquire()` retries internally and reports only "pool timed out while
/// waiting for an open connection" — which says nothing about *why* no
/// connection could be established (bad password, server at max_connections, TLS
/// refused). One direct connection attempt surfaces the real message. Runs only
/// on the failure path, so a successful connect pays nothing.
async fn explain_pg_failure(opts: &PgConnectOptions, pool_err: String) -> String {
    if !pool_err.contains("pool timed out") {
        return pool_err;
    }
    use sqlx::Connection;
    match tokio::time::timeout(
        Duration::from_secs(10),
        sqlx::postgres::PgConnection::connect_with(opts),
    )
    .await
    {
        Ok(Ok(c)) => {
            // A direct connection works, so the pool timeout was contention or a
            // transient stall rather than a broken configuration.
            let _ = c.close().await;
            // A single connection works, so this is contention, not configuration:
            // either the server is at its connection limit, or the pool's own
            // connections are all tied up in long-running queries.
            format!("{pool_err} (a direct connection did succeed, so the server is reachable - the pool's connections are all busy, or the server is at its connection limit)")
        }
        Ok(Err(e)) => format!("Connection failed: {e}"),
        Err(_) => pool_err,
    }
}

pub(crate) async fn open_pg(config: &PgConfig) -> Result<PgPool, String> {
    let opts: PgConnectOptions = config
        .connection_url()
        .parse()
        .map_err(|e| format!("Connection failed: {e}"))?;
    // The hostname is deliberately kept rather than swapped for the probed IP:
    // the driver needs it for TLS SNI (managed Postgres behind a proxy routes on
    // it) and the OS resolver caches the lookup anyway.
    let opts = opts.log_slow_statements(LevelFilter::Debug, Duration::from_secs(5));

    // Kill truly runaway queries. 10 min covers bulk inserts / migrations while
    // still bounding accidental full-table scans that would pin a connection.
    //
    // Preferred path: ride statement_timeout in the startup packet (`options=`),
    // which saves one round trip per pooled connection vs an after_connect SET —
    // on a remote host that's a full RTT for every connection the pool opens.
    // Optional session time zone (Settings → Database). Ride it in the startup
    // packet next to statement_timeout so the whole pool inherits it with no
    // extra round trip; "SYSTEM"/empty leaves the server default untouched.
    let tz: Option<String> = config
        .timezone
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty() && !t.eq_ignore_ascii_case("SYSTEM"))
        .map(|t| t.to_string());

    let mut startup: Vec<(&str, String)> = vec![("statement_timeout", "10min".to_string())];
    if let Some(ref tz) = tz {
        startup.push(("TimeZone", tz.clone()));
    }
    let fast_opts = opts.clone().options(startup);

    // Fallback SET (single-quote-escaped) for poolers that reject the `options`
    // startup parameter; run per connection in after_connect below.
    let tz_set: Option<String> = tz
        .as_ref()
        .map(|t| format!("SET TIME ZONE '{}'", t.replace('\'', "''")));

    let explain_opts = opts.clone();
    let connect = async {
        match pg_pool_builder().connect_with(fast_opts).await {
            Ok(pool) => Ok(pool),
            // Some poolers (PgBouncer without `ignore_startup_parameters=options`)
            // reject the `options` startup parameter outright. Fall back to the
            // slower after_connect SET so those hosts still connect.
            Err(e) if e.to_string().contains("unsupported startup parameter") => {
                pg_pool_builder()
                    .after_connect(move |conn, _meta| {
                        let tz_set = tz_set.clone();
                        Box::pin(async move {
                            sqlx::query("SET statement_timeout = '10min'")
                                .execute(&mut *conn)
                                .await?;
                            if let Some(stmt) = tz_set {
                                sqlx::query(&stmt).execute(&mut *conn).await?;
                            }
                            Ok(())
                        })
                    })
                    .connect_with(opts)
                    .await
                    .map_err(|e| format!("Connection failed: {e}"))
            }
            Err(e) => Err(explain_pg_failure(&explain_opts, format!("Connection failed: {e}")).await),
        }
    };

    connect_racing_probe(&config.host, config.port, connect).await
}

pub async fn test_connection(config: PgConfig) -> Result<(), String> {
    let (effective, _tunnel) = resolve_pg_ssh(config).await?;
    let pool = open_pg(&effective).await?;
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .map_err(|e| format!("Query failed: {e}"))?;
    pool.close().await;
    Ok(())
}

pub async fn connect(
    state: State<'_, DbState>,
    tunnel_state: State<'_, TunnelState>,
    config: PgConfig,
) -> Result<(), String> {
    tunnel_state.clear();
    let (effective, tunnel) = resolve_pg_ssh(config).await?;
    let pool = open_pg(&effective).await?;
    warm_pool(&pool).await;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::Postgres(pool)))?;
    tunnel_state.set(tunnel);
    Ok(())
}

/// Establish an SSH tunnel if `config.ssh` is set, return a direct config pointing
/// at the local forwarded port. The tunnel's lifetime must outlive the connection.
async fn resolve_pg_ssh(config: PgConfig) -> Result<(PgConfig, Option<SshTunnel>), String> {
    if let Some(ref ssh_cfg) = config.ssh {
        let tunnel = SshTunnel::establish(ssh_cfg, &config.host, config.port).await?;
        let local_port = tunnel.local_port;
        let mut direct = config.clone();
        direct.host = "127.0.0.1".to_string();
        direct.port = local_port;
        direct.ssh = None;
        Ok((direct, Some(tunnel)))
    } else {
        Ok((config, None))
    }
}

// ── SQLite connect / test ─────────────────────────────────────────────────────

fn sqlite_url(path: &str) -> String {
    if path == ":memory:" {
        "sqlite::memory:".to_string()
    } else {
        format!("sqlite:{path}")
    }
}

pub(crate) async fn open_sqlite(config: &SqliteConfig) -> Result<SqlitePool, String> {
    let opts: SqliteConnectOptions = sqlite_url(&config.file_path)
        .parse()
        .map_err(|e| format!("SQLite connection failed: {e}"))?;
    let opts = opts.log_slow_statements(LevelFilter::Debug, Duration::from_secs(5));

    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .map_err(|e| format!("SQLite connection failed: {e}"))
}

pub async fn test_sqlite_connection(config: SqliteConfig) -> Result<(), String> {
    let pool = open_sqlite(&config).await?;
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .map_err(|e| format!("Query failed: {e}"))?;
    pool.close().await;
    Ok(())
}

pub async fn connect_sqlite(state: State<'_, DbState>, config: SqliteConfig) -> Result<(), String> {
    let pool = open_sqlite(&config).await?;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::Sqlite(pool)))
}

// ── MySQL connect / test ──────────────────────────────────────────────────────

pub(crate) async fn open_mysql(config: &MysqlConfig) -> Result<MySqlPool, String> {
    let opts: MySqlConnectOptions = config
        .connection_url()
        .parse()
        .map_err(|e| format!("Connection failed: {e}"))?;
    let opts = opts.log_slow_statements(LevelFilter::Debug, Duration::from_secs(5));

    // Optional session time zone (Settings → Database), applied per connection
    // below; "SYSTEM"/empty leaves the server default in place.
    let tz: Option<String> = config
        .timezone
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty() && !t.eq_ignore_ascii_case("SYSTEM"))
        .map(|t| format!("SET time_zone = '{}'", t.replace('\'', "''")));

    let connect = MySqlPoolOptions::new()
        // Same rationale as PG: 4 is the real-world ceiling for a desktop app.
        .max_connections(4)
        // See pg_pool_builder: must clear a cold-pool handshake on a slow link.
        .acquire_timeout(Duration::from_secs(10))
        // Keep connections warm for the session (see open_pg for the full rationale)
        // so repeat fetches don't pay a fresh TCP+TLS+auth handshake.
        .idle_timeout(Duration::from_secs(600))
        .max_lifetime(Duration::from_secs(1800))
        // Enable ANSI_QUOTES on every connection so double-quoted identifiers
        // ("col") work the same as backtick identifiers (`col`). This makes
        // standard SQL and AI-generated queries work without rewriting syntax.
        .after_connect(move |conn, _meta| {
            let tz = tz.clone();
            Box::pin(async move {
                sqlx::query("SET sql_mode = CONCAT(@@sql_mode, ',ANSI_QUOTES')")
                    .execute(&mut *conn)
                    .await?;
                if let Some(stmt) = tz {
                    sqlx::query(&stmt).execute(&mut *conn).await?;
                }
                Ok(())
            })
        })
        .connect_with(opts);

    connect_racing_probe(
        &config.host,
        config.port,
        async { connect.await.map_err(|e| format!("Connection failed: {e}")) },
    )
    .await
}

pub async fn test_mysql_connection(config: MysqlConfig) -> Result<(), String> {
    let (effective, _tunnel) = resolve_mysql_ssh(config).await?;
    let pool = open_mysql(&effective).await?;
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .map_err(|e| format!("Query failed: {e}"))?;
    pool.close().await;
    Ok(())
}

pub async fn connect_mysql(
    state: State<'_, DbState>,
    tunnel_state: State<'_, TunnelState>,
    config: MysqlConfig,
) -> Result<(), String> {
    tunnel_state.clear();
    let (effective, tunnel) = resolve_mysql_ssh(config).await?;
    let pool = open_mysql(&effective).await?;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::Mysql(pool)))?;
    tunnel_state.set(tunnel);
    Ok(())
}

async fn resolve_mysql_ssh(config: MysqlConfig) -> Result<(MysqlConfig, Option<SshTunnel>), String> {
    if let Some(ref ssh_cfg) = config.ssh {
        let tunnel = SshTunnel::establish(ssh_cfg, &config.host, config.port).await?;
        let local_port = tunnel.local_port;
        let mut direct = config.clone();
        direct.host = "127.0.0.1".to_string();
        direct.port = local_port;
        direct.ssh = None;
        Ok((direct, Some(tunnel)))
    } else {
        Ok((config, None))
    }
}

// ── D1 connect / test ─────────────────────────────────────────────────────────

pub async fn test_d1_connection(config: D1Config) -> Result<(), String> {
    crate::db::d1::query(&config, "SELECT 1", vec![]).await?;
    Ok(())
}

pub async fn connect_d1(state: State<'_, DbState>, config: D1Config) -> Result<(), String> {
    // Validate credentials before storing
    test_d1_connection(config.clone()).await?;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::D1(config)))
}

// ── LibSQL / Turso connect / test ─────────────────────────────────────────────

pub async fn test_libsql_connection(config: LibSqlConfig) -> Result<(), String> {
    crate::db::libsql::query(&config, "SELECT 1", vec![]).await?;
    Ok(())
}

pub async fn connect_libsql(state: State<'_, DbState>, config: LibSqlConfig) -> Result<(), String> {
    test_libsql_connection(config.clone()).await?;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::LibSql(config)))
}

// ── ClickHouse connect / test ─────────────────────────────────────────────────

pub async fn test_clickhouse_connection(config: ClickhouseConfig) -> Result<(), String> {
    let (host, port) = (config.host.clone(), config.port);
    connect_racing_probe(&host, port, async move {
        crate::db::clickhouse::query(&config, "SELECT 1").await?;
        Ok(())
    })
    .await
}

pub async fn connect_clickhouse(state: State<'_, DbState>, config: ClickhouseConfig) -> Result<(), String> {
    // Validate credentials/reachability before storing.
    test_clickhouse_connection(config.clone()).await?;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::Clickhouse(config)))
}

// ── Redis connect / test ──────────────────────────────────────────────────────

pub async fn test_redis_connection(config: RedisConfig) -> Result<(), String> {
    let (host, port) = (config.host.clone(), config.port);
    connect_racing_probe(&host, port, crate::db::redis::ping(&config)).await
}

pub async fn connect_redis(state: State<'_, DbState>, config: RedisConfig) -> Result<(), String> {
    // Validate credentials/reachability before storing.
    test_redis_connection(config.clone()).await?;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::Redis(config)))
}

// ── DuckDB connect / test ──────────────────────────────────────────────────────

/// Open a DuckDB connection on a blocking thread (the driver is synchronous).
pub(crate) async fn open_duckdb(config: &DuckdbConfig) -> Result<DuckdbHandle, String> {
    let path = config.file_path.clone();
    tokio::task::spawn_blocking(move || {
        let conn = if path == ":memory:" || path.is_empty() {
            duckdb::Connection::open_in_memory()
        } else {
            duckdb::Connection::open(&path)
        }
        .map_err(|e| format!("DuckDB connection failed: {e}"))?;
        Ok::<DuckdbHandle, String>(Arc::new(Mutex::new(conn)))
    })
    .await
    .map_err(|e| format!("DuckDB open task failed: {e}"))?
}

pub async fn test_duckdb_connection(config: DuckdbConfig) -> Result<(), String> {
    let handle = open_duckdb(&config).await?;
    crate::db::duckdb::ping(&handle).await
}

pub async fn connect_duckdb(state: State<'_, DbState>, config: DuckdbConfig) -> Result<(), String> {
    let handle = open_duckdb(&config).await?;
    crate::db::duckdb::ping(&handle).await?;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::Duckdb(handle)))
}

// ── MS SQL Server connect / test ────────────────────────────────────────────────

pub(crate) async fn open_mssql(config: &MssqlConfig) -> Result<MssqlHandle, String> {
    let client =
        connect_racing_probe(&config.host, config.port, crate::db::mssql::connect(config)).await?;
    Ok(Arc::new(tokio::sync::Mutex::new(client)))
}

pub async fn test_mssql_connection(config: MssqlConfig) -> Result<(), String> {
    let handle = open_mssql(&config).await?;
    crate::db::mssql::ping(&handle).await
}

pub async fn connect_mssql(state: State<'_, DbState>, config: MssqlConfig) -> Result<(), String> {
    let handle = open_mssql(&config).await?;
    close_existing(&state).await;
    set_conn(&state, Some(ActiveConnection::Mssql(handle)))
}

// ── Disconnect ────────────────────────────────────────────────────────────────

pub async fn disconnect(
    state: State<'_, DbState>,
    tunnel_state: State<'_, TunnelState>,
) -> Result<(), String> {
    // close_existing already sets state to None atomically via take() before
    // starting the (potentially slow) pool close. Calling set_conn(None) again
    // after the async close would race with any concurrent connect_* call that
    // set a new connection while the pool was draining, wiping it out.
    close_existing(&state).await;
    // Kill the SSH tunnel (if any) after the pool is closed.
    tunnel_state.clear();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Nothing listening is a definitive answer: it must fail fast rather than
    /// come back Inconclusive (which the caller treats as "keep waiting") or be
    /// retried by the frontend.
    #[tokio::test]
    async fn refused_port_is_definitive() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener); // free the port so connects are refused

        let started = std::time::Instant::now();
        match preflight("127.0.0.1", port).await {
            Preflight::Unreachable(msg) => assert!(msg.contains("Can't reach"), "{msg}"),
            Preflight::Reachable(a) => panic!("closed port reported reachable: {a}"),
            Preflight::Inconclusive(m) => panic!("closed port must be definitive, got: {m}"),
        }
        assert!(started.elapsed() < TCP_BUDGET, "refusal should not burn the probe budget");
    }

    #[tokio::test]
    async fn open_port_returns_the_probed_address() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let want = listener.local_addr().unwrap();
        match preflight("127.0.0.1", want.port()).await {
            Preflight::Reachable(addr) => assert_eq!(addr, want),
            Preflight::Unreachable(m) | Preflight::Inconclusive(m) => panic!("{m}"),
        }
    }

    #[tokio::test]
    async fn unresolvable_host_is_definitive() {
        // .invalid is reserved by RFC 2606 and never resolves.
        match preflight("stroke-no-such-host.invalid", 5432).await {
            Preflight::Unreachable(_) => {}
            Preflight::Reachable(a) => panic!("bogus host resolved to {a}"),
            Preflight::Inconclusive(m) => panic!("DNS failure must be definitive, got: {m}"),
        }
    }

    #[tokio::test]
    async fn empty_host_fails_without_a_lookup() {
        assert!(matches!(preflight("   ", 5432).await, Preflight::Unreachable(_)));
    }

    /// A dual-stack name where one family is dead must still resolve to the live
    /// one. `localhost` is the portable stand-in: it resolves to both ::1 and
    /// 127.0.0.1, and only one of them has a listener here.
    #[tokio::test]
    async fn dual_stack_picks_the_family_that_answers() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let addrs: Vec<_> = tokio::net::lookup_host(format!("localhost:{port}"))
            .await
            .map(|it| it.collect())
            .unwrap_or_default();
        if addrs.len() < 2 {
            return; // single-stack resolver - nothing to prove
        }
        match preflight("localhost", port).await {
            Preflight::Reachable(addr) => assert!(addr.is_ipv4(), "expected the IPv4 listener, got {addr}"),
            Preflight::Unreachable(m) | Preflight::Inconclusive(m) => panic!("{m}"),
        }
    }

    /// The regression that made databases unconnectable: an inconclusive probe
    /// (host slow to answer) must NOT abort a handshake that then succeeds.
    /// 127.0.0.1:<closed port> can't be used here - that's *definitive* - so this
    /// drives the race with a host that swallows SYNs. 192.0.2.0/24 (RFC 5737
    /// TEST-NET-1) is reserved and unrouteable, so the probe stalls.
    #[tokio::test]
    async fn slow_probe_does_not_veto_a_successful_connect() {
        let connect = async {
            tokio::time::sleep(Duration::from_millis(50)).await;
            Ok::<u8, String>(7)
        };
        // The probe is still in flight (or inconclusive) when connect resolves.
        let got = connect_racing_probe("192.0.2.1", 5432, connect).await;
        assert_eq!(got, Ok(7), "a completed handshake must win over a stalled probe");
    }

    /// A definitively dead host short-circuits instead of waiting out the
    /// connect: that's what keeps a wrong port from spinning for 20s.
    #[tokio::test]
    async fn definitive_probe_failure_short_circuits() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        let started = std::time::Instant::now();
        // A connect that would never finish on its own.
        let never = async {
            tokio::time::sleep(CONNECT_DEADLINE * 2).await;
            Ok::<u8, String>(0)
        };
        let got = connect_racing_probe("127.0.0.1", port, never).await;
        assert!(got.is_err(), "closed port must fail, got {got:?}");
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "should fail fast, took {:?}",
            started.elapsed()
        );
    }

    /// The whole attempt is bounded, and the probe's diagnosis is what surfaces.
    /// Paused clock so the deadline fires without waiting CONNECT_DEADLINE.
    #[tokio::test(start_paused = true)]
    async fn deadline_bounds_a_stalled_connect() {
        let never = async {
            tokio::time::sleep(CONNECT_DEADLINE * 3).await;
            Ok::<u8, String>(0)
        };
        let got = connect_racing_probe("192.0.2.1", 5432, never).await;
        assert!(got.is_err(), "a stalled connect must not hang forever");
    }
}
