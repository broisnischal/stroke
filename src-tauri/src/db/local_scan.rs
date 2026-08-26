/*!
Zero-config discovery of the databases already running on this machine - the ORM
studios pointed at one, and the database servers installed natively.

`prisma studio` and `drizzle-kit studio` are already pointed at a database: the
project's `schema.prisma` / `drizzle.config.ts` says which one, and the running
process tells us where that project lives. So rather than asking someone to
retype a connection string their machine already knows, we find the studio, read
the project's own config, and hand the frontend a ready-to-use connection.

Discovery is by *process*, not by HTTP. Both studios speak private, unversioned
HTTP APIs that would break on any upgrade, whereas a command line, a cwd and an
environment are stable - and they yield the real database URL, so a click opens a
native Stroke session (editing, SQL, AI, exports) instead of proxying every query
through someone else's dev server.

Nothing here leaves the machine and no credential is logged.
*/

use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System};

const PRISMA_PORT: u16 = 5555;
const DRIZZLE_PORT: u16 = 4983;
/// How far past the default port to look when neither the command line nor the
/// process's own sockets told us which port it took.
const PORT_PROBE_SPAN: u16 = 6;

// ── Wire type ─────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DetectedStudio {
    /// Stable across scans, so the UI can key rows without them flickering.
    pub id: String,
    /// `prisma` | `drizzle` - also a `DbIcon` brand id.
    pub tool: String,
    pub tool_label: String,
    pub pid: u32,
    pub port: u16,
    /// False when the port stopped answering between the process scan and now.
    pub listening: bool,
    /// True when the CLI didn't name a port, so `probe_port` may walk forward.
    #[serde(skip)]
    port_guessed: bool,
    pub project_dir: String,
    pub project_name: String,
    /// Stroke driver id, when we worked out what the studio is pointed at.
    pub engine: Option<String>,
    /// Connection string, for the engines the frontend URI parser handles.
    pub url: Option<String>,
    /// Absolute path, for file-backed engines (SQLite).
    pub file_path: Option<String>,
    /// Turso / libSQL.
    pub auth_token: Option<String>,
    /// Cloudflare D1 over HTTP.
    pub account_id: Option<String>,
    pub database_id: Option<String>,
    pub api_token: Option<String>,
    /// Password-free label for the row, e.g. `localhost:5432/app`.
    pub target: String,
    /// Which file the credentials came from, so the row can be trusted at a glance.
    pub source: String,
    /// Set when the studio was found but isn't connectable; says what to fix.
    pub reason: Option<String>,
}

// ── Command ───────────────────────────────────────────────────────────────────

/// Every Prisma / Drizzle studio running on this machine, with the database each
/// one is pointed at. Never errors on a hostile environment: an unreadable
/// process, a missing config or an unresolvable env var comes back as a row with
/// `engine: None` and a `reason`, so the UI can still show what it found.
#[tauri::command]
pub async fn scan_local_studios() -> Result<Vec<DetectedStudio>, String> {
    let mut studios = tokio::task::spawn_blocking(collect_studios)
        .await
        .map_err(|e| format!("Studio scan failed: {e}"))?;

    for s in &mut studios {
        let (port, listening) = probe_port(s.port, s.port_guessed).await;
        s.port = port;
        s.listening = listening;
    }
    // A studio that is no longer listening is a stale process, not a target.
    studios.retain(|s| s.listening);
    studios.sort_by(|a, b| a.tool.cmp(&b.tool).then(a.port.cmp(&b.port)));
    Ok(studios)
}

/// TCP-connect to `127.0.0.1:port`. When the port was a guess rather than
/// something the CLI told us, walk forward a few ports to find the one it took.
async fn probe_port(port: u16, guessed: bool) -> (u16, bool) {
    let span = if guessed { PORT_PROBE_SPAN } else { 1 };
    for p in port..port.saturating_add(span) {
        let connect = tokio::net::TcpStream::connect(("127.0.0.1", p));
        if let Ok(Ok(_)) = tokio::time::timeout(Duration::from_millis(300), connect).await {
            return (p, true);
        }
    }
    (port, false)
}

// ── Process scan ──────────────────────────────────────────────────────────────

struct StudioProcess {
    tool: &'static str,
    pid: u32,
    /// The port this studio is actually serving on. None only when the process's
    /// own sockets were unreadable and the command line didn't say.
    known_port: Option<u16>,
    cwd: PathBuf,
    args: Vec<String>,
    env: HashMap<String, String>,
}

fn collect_studios() -> Vec<DetectedStudio> {
    let mut sys = System::new_with_specifics(
        RefreshKind::nothing().with_processes(ProcessRefreshKind::everything()),
    );
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::everything(),
    );

    let mut out: Vec<DetectedStudio> = Vec::new();
    for proc in sys.processes().values() {
        let args: Vec<String> = proc
            .cmd()
            .iter()
            .map(|a| a.to_string_lossy().to_string())
            .collect();
        let Some(tool) = classify(&args) else { continue };
        let Some(cwd) = proc.cwd().map(Path::to_path_buf) else { continue };

        let env = proc
            .environ()
            .iter()
            .filter_map(|e| {
                let e = e.to_string_lossy();
                e.split_once('=').map(|(k, v)| (k.to_string(), v.to_string()))
            })
            .collect();

        let pid = proc.pid().as_u32();
        let found = StudioProcess {
            tool,
            pid,
            known_port: serving_port(pid, arg_port(&args), tool),
            cwd,
            args,
            env,
        };
        let studio = describe(found);
        // `npx`/`bunx prisma studio` shows up twice - once as the launcher, once
        // as the process it spawned - and only the child holds the socket. One
        // row per project, preferring the entry that knows a real port and
        // resolved a database.
        match out
            .iter()
            .position(|s| s.tool == studio.tool && s.project_dir == studio.project_dir)
        {
            Some(i) => {
                let better = (out[i].port_guessed && !studio.port_guessed)
                    || (out[i].engine.is_none() && studio.engine.is_some());
                if better {
                    out[i] = studio;
                }
            }
            None => out.push(studio),
        }
    }
    out
}

/// Which studio (if any) a command line belongs to. Requires the literal
/// `studio` subcommand so an editor or a shell holding the word "prisma" in a
/// path can't masquerade as one.
fn classify(args: &[String]) -> Option<&'static str> {
    if !args.iter().any(|a| a == "studio") {
        return None;
    }
    let joined = args.join(" ").to_lowercase();
    if joined.contains("drizzle") {
        Some("drizzle")
    } else if joined.contains("prisma") {
        Some("prisma")
    } else {
        None
    }
}

/// The port a studio is really serving on.
///
/// Current Prisma Studio takes a *random high port* and prints it, so neither the
/// default nor the command line can be trusted - the process's own listening
/// sockets are the only ground truth. Among several (a debugger, a query engine),
/// prefer what the CLI asked for, then the tool's default, then the lowest.
fn serving_port(pid: u32, arg: Option<u16>, tool: &str) -> Option<u16> {
    let default = if tool == "prisma" { PRISMA_PORT } else { DRIZZLE_PORT };
    pick_port(listening_ports(pid), arg, default)
}

fn pick_port(mut ports: Vec<u16>, arg: Option<u16>, default: u16) -> Option<u16> {
    ports.sort_unstable();
    if let Some(p) = arg {
        if ports.is_empty() || ports.contains(&p) {
            return Some(p);
        }
    }
    if ports.contains(&default) {
        return Some(default);
    }
    ports.first().copied().or(arg)
}

/// TCP ports a process is listening on.
#[cfg(target_os = "linux")]
fn listening_ports(pid: u32) -> Vec<u16> {
    // /proc/<pid>/fd holds `socket:[inode]` links; /proc/net/tcp maps an inode
    // back to the local port it is listening on (state 0A == LISTEN).
    let Ok(fds) = std::fs::read_dir(format!("/proc/{pid}/fd")) else { return Vec::new() };
    let inodes: std::collections::HashSet<String> = fds
        .flatten()
        .filter_map(|e| std::fs::read_link(e.path()).ok())
        .filter_map(|target| {
            let t = target.to_string_lossy();
            t.strip_prefix("socket:[")
                .and_then(|r| r.strip_suffix(']'))
                .map(str::to_string)
        })
        .collect();
    if inodes.is_empty() {
        return Vec::new();
    }

    let mut ports = Vec::new();
    for table in ["/proc/net/tcp", "/proc/net/tcp6"] {
        let Ok(text) = std::fs::read_to_string(table) else { continue };
        for line in text.lines().skip(1) {
            let f: Vec<&str> = line.split_whitespace().collect();
            // local_address, state, …, inode
            let (Some(local), Some(state), Some(inode)) = (f.get(1), f.get(3), f.get(9)) else {
                continue;
            };
            if *state != "0A" || !inodes.contains(*inode) {
                continue;
            }
            if let Some(port) = local.split(':').nth(1).and_then(|h| u16::from_str_radix(h, 16).ok()) {
                if port > 0 && !ports.contains(&port) {
                    ports.push(port);
                }
            }
        }
    }
    ports
}

#[cfg(target_os = "macos")]
fn listening_ports(pid: u32) -> Vec<u16> {
    let Ok(out) = std::process::Command::new("lsof")
        .args(["-nP", "-a", "-iTCP", "-sTCP:LISTEN", "-Fn", "-p"])
        .arg(pid.to_string())
        .output()
    else {
        return Vec::new();
    };
    let mut ports = Vec::new();
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        // `n127.0.0.1:5555` / `n*:5555`
        let Some(addr) = line.strip_prefix('n') else { continue };
        if let Some(port) = addr.rsplit(':').next().and_then(|p| p.parse::<u16>().ok()) {
            if port > 0 && !ports.contains(&port) {
                ports.push(port);
            }
        }
    }
    ports
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn listening_ports(pid: u32) -> Vec<u16> {
    // quiet_std: the local-database scan runs on the connection screen, so a bare
    // spawn flashed a console window over the app on Windows.
    let Ok(out) = crate::proc::quiet_std(
        std::process::Command::new("netstat").args(["-ano", "-p", "TCP"]),
    )
    .output() else {
        return Vec::new();
    };
    let pid = pid.to_string();
    let mut ports = Vec::new();
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        let f: Vec<&str> = line.split_whitespace().collect();
        // Proto  Local            Foreign  State       PID
        if f.len() < 5 || !f[3].eq_ignore_ascii_case("LISTENING") || f[4] != pid {
            continue;
        }
        if let Some(port) = f[1].rsplit(':').next().and_then(|p| p.parse::<u16>().ok()) {
            if port > 0 && !ports.contains(&port) {
                ports.push(port);
            }
        }
    }
    ports
}

/// `--port 5556` / `--port=5556` / `-p 5556`.
fn arg_port(args: &[String]) -> Option<u16> {
    for (i, a) in args.iter().enumerate() {
        let val = if let Some(v) = a.strip_prefix("--port=") {
            Some(v.to_string())
        } else if a == "--port" || a == "-p" {
            args.get(i + 1).cloned()
        } else {
            None
        };
        if let Some(v) = val {
            if let Ok(p) = v.trim().parse::<u16>() {
                if p > 0 {
                    return Some(p);
                }
            }
        }
    }
    None
}

// ── Resolution ────────────────────────────────────────────────────────────────

/// What a project's config said the studio is pointed at.
#[derive(Default)]
struct Target {
    engine: Option<String>,
    url: Option<String>,
    file_path: Option<String>,
    auth_token: Option<String>,
    account_id: Option<String>,
    database_id: Option<String>,
    api_token: Option<String>,
    source: String,
    reason: Option<String>,
}

impl Target {
    fn failed(source: impl Into<String>, reason: impl Into<String>) -> Self {
        Self {
            source: source.into(),
            reason: Some(reason.into()),
            ..Default::default()
        }
    }
}

fn describe(p: StudioProcess) -> DetectedStudio {
    let default_port = if p.tool == "prisma" { PRISMA_PORT } else { DRIZZLE_PORT };
    let port = p.known_port.unwrap_or(default_port);
    let project_name = p
        .cwd
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| p.cwd.to_string_lossy().to_string());

    let env = env_layers(&p);
    let t = if p.tool == "prisma" {
        resolve_prisma(&p, &env)
    } else {
        resolve_drizzle(&p, &env)
    };

    let target = match (&t.file_path, &t.url) {
        (Some(f), _) => Path::new(f)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| f.clone()),
        (_, Some(u)) => redact_target(u),
        _ => String::new(),
    };

    DetectedStudio {
        id: format!("{}:{}", p.tool, p.pid),
        tool: p.tool.to_string(),
        tool_label: if p.tool == "prisma" { "Prisma Studio" } else { "Drizzle Studio" }.to_string(),
        pid: p.pid,
        port,
        listening: false,
        port_guessed: p.known_port.is_none(),
        project_dir: p.cwd.to_string_lossy().to_string(),
        project_name,
        engine: t.engine,
        url: t.url,
        file_path: t.file_path,
        auth_token: t.auth_token,
        account_id: t.account_id,
        database_id: t.database_id,
        api_token: t.api_token,
        target,
        source: t.source,
        reason: t.reason,
    }
}

/// Env vars visible to the studio, in the precedence `dotenv` gives them: a real
/// exported variable wins, then `.env` files in the order the tools load them.
/// `or_insert` therefore means "first layer wins".
fn env_layers(p: &StudioProcess) -> HashMap<String, String> {
    let mut env = p.env.clone();
    for rel in [".env", ".env.local", ".env.development.local", ".env.development", "prisma/.env"] {
        if let Ok(text) = std::fs::read_to_string(p.cwd.join(rel)) {
            merge_env_file(&text, &mut env);
        }
    }
    env
}

fn merge_env_file(text: &str, out: &mut HashMap<String, String>) {
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line);
        let Some((k, v)) = line.split_once('=') else { continue };
        let key = k.trim();
        if key.is_empty() {
            continue;
        }
        let mut val = v.trim();
        let quoted = val.starts_with('"') || val.starts_with('\'');
        if !quoted {
            // `KEY=value # note` - a trailing comment is not part of the value.
            if let Some(i) = val.find(" #") {
                val = val[..i].trim_end();
            }
        } else {
            let q = val.chars().next().unwrap_or('"');
            val = val.trim_start_matches(q);
            if let Some(i) = val.find(q) {
                val = &val[..i];
            }
        }
        // dotenv-expand: `DATABASE_URL=postgres://${PGUSER}@host/db`.
        let val = if val.contains("${") { interpolate(val, out) } else { val.to_string() };
        out.entry(key.to_string()).or_insert(val);
    }
}

// ── Prisma ────────────────────────────────────────────────────────────────────

/// A URL the project pointed us at, and where it was written down.
struct Candidate {
    url: String,
    /// Relative `file:` URLs resolve against the file that declared them.
    base: PathBuf,
    source: String,
}

fn resolve_prisma(p: &StudioProcess, env: &HashMap<String, String>) -> Target {
    let config = prisma_config_path(p);
    let schema = prisma_schema_path(p, config.as_deref());
    let mut provider = String::new();
    let mut candidates: Vec<Candidate> = Vec::new();

    // 1. The classic home of the URL: the schema's own datasource block.
    if let Some(schema) = &schema {
        if let Ok(text) = std::fs::read_to_string(schema) {
            if let Some(block) = block_after(&text, "datasource") {
                provider = assign_value(&block, "provider", env).unwrap_or_default();
                // Prisma resolves a relative `file:` URL against the schema's dir.
                let base = schema.parent().unwrap_or(&p.cwd).to_path_buf();
                let source = display_rel(&p.cwd, schema);
                // `url` can be a Prisma Postgres / Accelerate proxy string that no
                // driver can open - `directUrl` is the real database in that case.
                for key in ["url", "directUrl"] {
                    if let Some(url) = assign_value(&block, key, env) {
                        candidates.push(Candidate { url, base: base.clone(), source: source.clone() });
                    }
                }
            }
        }
    }

    // 2. Prisma 6 moved the datasource url into `prisma.config.ts`, so a modern
    //    schema often carries nothing but the provider.
    if let Some(cfg) = &config {
        if let Ok(text) = std::fs::read_to_string(cfg) {
            let scope = block_after(&text, "datasource").unwrap_or(text);
            let base = cfg.parent().unwrap_or(&p.cwd).to_path_buf();
            let source = display_rel(&p.cwd, cfg);
            for key in ["url", "directUrl"] {
                if let Some(url) = assign_value(&scope, key, env) {
                    candidates.push(Candidate { url, base: base.clone(), source: source.clone() });
                }
            }
        }
    }

    // 3. Prisma's own default, then the names the hosted providers use. A driver
    //    adapter (Turso, Neon, Vercel, D1) leaves the datasource block with a
    //    provider and nothing else, so the URL only ever exists in the
    //    environment - which is exactly the remote case.
    if candidates.is_empty() {
        for key in [
            "DATABASE_URL",
            "POSTGRES_URL",
            "POSTGRES_PRISMA_URL",
            "DATABASE_URL_UNPOOLED",
            "POSTGRES_URL_NON_POOLING",
            "TURSO_DATABASE_URL",
            "LIBSQL_URL",
            "MYSQL_URL",
        ] {
            if let Some(url) = env.get(key) {
                candidates.push(Candidate {
                    url: url.clone(),
                    base: p.cwd.clone(),
                    source: format!("{key} in .env"),
                });
            }
        }
    }

    let fallback_source = schema
        .as_ref()
        .map(|s| display_rel(&p.cwd, s))
        .unwrap_or_else(|| "prisma/schema.prisma".to_string());
    let Some(first) = candidates.first() else {
        return Target::failed(
            fallback_source,
            "Couldn't work out this project's database URL - no datasource url, and DATABASE_URL isn't set in its .env.",
        );
    };
    for c in &candidates {
        if let Some(mut t) = target_from_url(&c.url, &provider, &c.base) {
            // Turso over Prisma's adapter keeps its token in the environment.
            if t.engine.as_deref() == Some("libsql") {
                t.auth_token = auth_token_from_env(env);
            }
            t.source = c.source.clone();
            return t;
        }
    }
    let scheme = short_scheme(&first.url);
    Target::failed(
        first.source.clone(),
        if scheme.starts_with("prisma") {
            // Accelerate/Prisma Postgres URLs are an API endpoint, not a wire
            // protocol - but the app can reach the same database another way.
            "This is a Prisma Postgres URL, which no driver can open directly. Connect it from Hosting providers → Prisma Postgres, or add a `directUrl` to the datasource block.".to_string()
        } else {
            format!("Stroke can't open a `{scheme}` datasource URL directly - add a `directUrl` pointing at the database itself.")
        },
    )
}

/// A Turso / libSQL token, wherever the project happens to keep it.
fn auth_token_from_env(env: &HashMap<String, String>) -> Option<String> {
    [
        "TURSO_AUTH_TOKEN",
        "TURSO_DATABASE_AUTH_TOKEN",
        "DATABASE_AUTH_TOKEN",
        "LIBSQL_AUTH_TOKEN",
    ]
    .iter()
    .find_map(|k| env.get(*k))
    .cloned()
}

/// `prisma.config.ts` and friends - where Prisma 6 keeps the datasource url.
fn prisma_config_path(p: &StudioProcess) -> Option<PathBuf> {
    if let Some(arg) = flag_value(&p.args, "--config") {
        let path = p.cwd.join(arg);
        if path.is_file() {
            return Some(path);
        }
    }
    ["ts", "mts", "cts", "js", "mjs", "cjs"]
        .iter()
        .map(|ext| p.cwd.join(format!("prisma.config.{ext}")))
        .find(|path| path.is_file())
}

fn prisma_schema_path(p: &StudioProcess, config: Option<&Path>) -> Option<PathBuf> {
    if let Some(arg) = flag_value(&p.args, "--schema") {
        let path = p.cwd.join(arg);
        if path.is_file() {
            return Some(path);
        }
    }
    // The config file names the schema when it lives somewhere unusual.
    if let Some(cfg) = config {
        if let Ok(text) = std::fs::read_to_string(cfg) {
            if let Some(rel) = assign_value(&text, "schema", &HashMap::new()) {
                let path = p.cwd.join(rel);
                if path.is_file() {
                    return Some(path);
                }
            }
        }
    }
    for rel in ["prisma/schema.prisma", "schema.prisma", "src/prisma/schema.prisma"] {
        let path = p.cwd.join(rel);
        if path.is_file() {
            return Some(path);
        }
    }
    // Prisma 5.15+ multi-file schemas: the datasource lives in one of them.
    let dir = p.cwd.join("prisma/schema");
    let entries = std::fs::read_dir(dir).ok()?;
    let mut files: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|f| f.extension().is_some_and(|e| e == "prisma"))
        .collect();
    files.sort();
    files.into_iter().find(|f| {
        std::fs::read_to_string(f).is_ok_and(|t| t.contains("datasource"))
    })
}

// ── Drizzle ───────────────────────────────────────────────────────────────────

fn resolve_drizzle(p: &StudioProcess, env: &HashMap<String, String>) -> Target {
    let Some(cfg) = drizzle_config_path(p) else {
        return Target::failed("drizzle.config.ts", "Couldn't find a drizzle config in this project.");
    };
    let Ok(text) = std::fs::read_to_string(&cfg) else {
        return Target::failed(display_rel(&p.cwd, &cfg), "The drizzle config could not be read.");
    };
    let source = display_rel(&p.cwd, &cfg);
    // `dialect` and `driver` are separate keys and BOTH matter: a D1 config reads
    // `dialect: 'sqlite', driver: 'd1-http'`, so trusting the dialect alone sends
    // a Cloudflare database down the local-file path and it never opens.
    let declared = assign_value(&text, "dialect", env).unwrap_or_default();
    let driver = assign_value(&text, "driver", env).unwrap_or_default();
    let dialect = if driver.is_empty() { declared.clone() } else { format!("{declared} {driver}") };

    // Drivers that need credentials this scan can't reach.
    if driver.contains("aws-data-api") {
        return Target::failed(source, "This config uses the AWS Data API, which needs AWS credentials Stroke can't read from here.");
    }
    if driver.contains("expo") || declared.contains("pglite") || declared.contains("gel") {
        return Target::failed(
            source,
            format!("`{}` runs inside the app process - there's no server here to connect to.", if driver.is_empty() { &declared } else { &driver }),
        );
    }

    // Cloudflare D1 over HTTP carries three credentials instead of a URL.
    if dialect.contains("d1") {
        let account_id = assign_value(&text, "accountId", env);
        let database_id = assign_value(&text, "databaseId", env);
        let api_token = assign_value(&text, "token", env);
        if account_id.is_some() && database_id.is_some() && api_token.is_some() {
            return Target {
                engine: Some("d1".into()),
                account_id,
                database_id,
                api_token,
                source,
                ..Default::default()
            };
        }
        return Target::failed(
            source,
            "This D1 config is missing an accountId, databaseId or token that Stroke can resolve - set them in the project's .env.",
        );
    }

    let url = assign_value(&text, "url", env)
        .or_else(|| assign_value(&text, "connectionString", env))
        .or_else(|| drizzle_url_from_parts(&text, &dialect, env));
    let Some(url) = url else {
        // A sqlite `url` computed by a helper (the Cloudflare D1 local-dev
        // pattern: `url: localD1File()`, resolved at runtime from the file
        // miniflare creates) can't be evaluated without a JS runtime. The
        // location is fixed, so find the file the way the tooling does.
        if dialect.contains("sqlite") {
            if let Some(file) = resolve_local_d1_sqlite(&p.cwd) {
                return Target {
                    engine: Some("sqlite".into()),
                    file_path: Some(file),
                    source,
                    ..Default::default()
                };
            }
            if text.contains("miniflare-D1DatabaseObject") || text.contains(".wrangler") {
                return Target::failed(
                    source,
                    "This is a Cloudflare D1 local database, but miniflare hasn't created its SQLite file yet - start your dev server (or run `wrangler d1 migrations apply <db> --local`), then refresh.",
                );
            }
        }
        return Target::failed(
            source,
            "Couldn't resolve dbCredentials - the env var this config points at isn't set in the project's .env.",
        );
    };

    match target_from_url(&url, &dialect, &p.cwd) {
        Some(mut t) => {
            t.auth_token = t
                .auth_token
                .or_else(|| assign_value(&text, "authToken", env))
                .or_else(|| auth_token_from_env(env));
            t.source = source;
            t
        }
        None => Target::failed(
            source,
            format!("Stroke can't open a `{}` URL directly.", short_scheme(&url)),
        ),
    }
}

/// The SQLite file `wrangler ... --local` (miniflare) creates for a D1 binding.
/// Configs that read this at runtime - a helper returning the path - can't be
/// evaluated statically, but the location is fixed relative to the project, so
/// resolve it directly.
///
/// The directory holds the user's database as `<sha256>.sqlite` alongside
/// miniflare's own `metadata.sqlite` (internal `_cf_*` bookkeeping). Selecting
/// by name - the hash-stemmed file - is what avoids opening the metadata store
/// and showing empty `_cf_ALARM` tables instead of the real data.
fn resolve_local_d1_sqlite(cwd: &Path) -> Option<String> {
    let dir = cwd.join(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
    let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|f| {
            f.extension().is_some_and(|e| e == "sqlite")
                && f.file_stem()
                    .and_then(|s| s.to_str())
                    .is_some_and(is_d1_database_name)
        })
        .collect();
    // One per binding in practice; if miniflare kept several, the one holding
    // the most data is the one being used. A just-written database can have a
    // near-empty main file with every row still in its `-wal`, so weigh the
    // sidecar too - otherwise an idle binding outranks the live one. SQLite
    // merges the WAL on open, so the main file is still the path to hand back.
    files.sort_by_key(|f| d1_stored_bytes(f));
    files.pop().map(|f| f.to_string_lossy().to_string())
}

/// Bytes a SQLite database occupies: the main file plus its write-ahead log.
fn d1_stored_bytes(main: &Path) -> u64 {
    let len = |p: &Path| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
    len(main) + len(&PathBuf::from(format!("{}-wal", main.display())))
}

/// A miniflare D1 database file is stemmed with the database's SHA-256 hash;
/// `metadata.sqlite` and any other named file is miniflare's own, not the data.
fn is_d1_database_name(stem: &str) -> bool {
    stem.len() >= 16 && stem.bytes().all(|b| b.is_ascii_hexdigit())
}

/// `dbCredentials: { host, port, user, password, database }` - the field form.
fn drizzle_url_from_parts(
    text: &str,
    dialect: &str,
    env: &HashMap<String, String>,
) -> Option<String> {
    let host = assign_value(text, "host", env)?;
    let scheme = if dialect.contains("mysql") || dialect.contains("single") {
        "mysql"
    } else {
        "postgresql"
    };
    let user = assign_value(text, "user", env).unwrap_or_default();
    let password = assign_value(text, "password", env).unwrap_or_default();
    let port = assign_value(text, "port", env).unwrap_or_default();
    let database = assign_value(text, "database", env).unwrap_or_default();

    let mut url = format!("{scheme}://");
    if !user.is_empty() {
        url.push_str(&urlencoding::encode(&user));
        if !password.is_empty() {
            url.push(':');
            url.push_str(&urlencoding::encode(&password));
        }
        url.push('@');
    }
    url.push_str(&host);
    if !port.is_empty() {
        url.push(':');
        url.push_str(&port);
    }
    url.push('/');
    url.push_str(&database);
    Some(url)
}

fn drizzle_config_path(p: &StudioProcess) -> Option<PathBuf> {
    if let Some(arg) = flag_value(&p.args, "--config") {
        let path = p.cwd.join(arg);
        if path.is_file() {
            return Some(path);
        }
    }
    for ext in ["ts", "mts", "cts", "js", "mjs", "cjs", "json"] {
        let path = p.cwd.join(format!("drizzle.config.{ext}"));
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

// ── URL → Stroke driver ───────────────────────────────────────────────────────

/// Maps a resolved URL (plus whatever the config called its dialect) onto a
/// Stroke driver id. Returns None when no driver can open it - a Prisma Postgres
/// proxy string, an Expo/React-Native SQLite binding, and so on.
fn target_from_url(url: &str, dialect: &str, base: &Path) -> Option<Target> {
    let raw = url.trim();
    let lower = raw.to_lowercase();
    let d = dialect.to_lowercase();

    let file_backed = lower.starts_with("file:")
        || (!lower.contains("://") && (d.contains("sqlite") || d.contains("better-sqlite")));
    if file_backed {
        let path = raw.trim_start_matches("file:");
        // `:memory:` is the studio's own process memory - nothing to attach to.
        if path.is_empty() || path.contains(":memory:") {
            return None;
        }
        let abs = if Path::new(path).is_absolute() {
            PathBuf::from(path)
        } else {
            normalize(&base.join(path))
        };
        return Some(Target {
            engine: Some("sqlite".into()),
            file_path: Some(abs.to_string_lossy().to_string()),
            ..Default::default()
        });
    }

    let engine = if lower.starts_with("postgres://") || lower.starts_with("postgresql://") {
        if lower.contains("cockroachlabs.cloud") { "cockroachdb" } else { "postgres" }
    } else if lower.starts_with("mysql://") || lower.starts_with("mariadb://") {
        "mysql"
    } else if lower.starts_with("libsql://")
        || lower.starts_with("wss://")
        || lower.starts_with("ws://")
        || lower.starts_with("http://127.0.0.1:8080")
    {
        "libsql"
    } else if lower.starts_with("sqlserver://") || lower.starts_with("mssql://") {
        "mssql"
    } else if lower.starts_with("mongodb") || lower.starts_with("prisma+") || lower.starts_with("prisma:") {
        return None;
    } else {
        // No recognisable scheme: trust the dialect the config declared.
        match () {
            _ if d.contains("postgres") || d == "pg" => "postgres",
            _ if d.contains("mysql") || d.contains("single") => "mysql",
            _ if d.contains("turso") || d.contains("libsql") => "libsql",
            _ if d.contains("sqlserver") || d.contains("mssql") => "mssql",
            _ => return None,
        }
    };

    Some(Target {
        engine: Some(engine.to_string()),
        url: Some(raw.to_string()),
        ..Default::default()
    })
}

// ── Small parsers ─────────────────────────────────────────────────────────────

/// `--flag value` / `--flag=value`.
fn flag_value(args: &[String], flag: &str) -> Option<String> {
    let eq = format!("{flag}=");
    for (i, a) in args.iter().enumerate() {
        if let Some(v) = a.strip_prefix(eq.as_str()) {
            return Some(v.to_string());
        }
        if a == flag {
            return args.get(i + 1).cloned();
        }
    }
    None
}

/// The `{ … }` body that follows `keyword`, used to scope a Prisma
/// `datasource` block so a `url` in the generator block can't leak in.
fn block_after(text: &str, keyword: &str) -> Option<String> {
    let at = text.find(keyword)?;
    let open = text[at..].find('{')? + at;
    let close = text[open..].find('}')? + open;
    Some(text[open + 1..close].to_string())
}

/// Reads `key = <value>` (Prisma) or `key: <value>` (JS/TS config) and resolves
/// it: string literals come back as-is, `env("X")` / `process.env.X` are looked
/// up, and `${…}` inside a template literal is expanded. Returns None when the
/// key is absent or points at something we can't evaluate without a JS runtime.
fn assign_value(text: &str, key: &str, env: &HashMap<String, String>) -> Option<String> {
    let bytes = text.as_bytes();
    let mut from = 0usize;
    while let Some(rel) = text[from..].find(key) {
        let at = from + rel;
        from = at + key.len();
        // Whole-word only: `url` must not match inside `directUrl`.
        if at > 0 && is_ident_byte(bytes[at - 1]) {
            continue;
        }
        if line_is_comment(text, at) {
            continue;
        }
        let rest = text[at + key.len()..].trim_start();
        // A quoted key (`"url": …`) leaves its closing quote here.
        let rest = rest.strip_prefix('"').unwrap_or(rest);
        let rest = rest.strip_prefix('\'').unwrap_or(rest).trim_start();
        let Some(rest) = rest.strip_prefix(':').or_else(|| rest.strip_prefix('=')) else {
            continue;
        };
        if rest.starts_with('=') {
            continue; // `key == x`, a comparison rather than an assignment
        }
        if let Some(v) = read_value(rest.trim_start(), env) {
            if !v.trim().is_empty() {
                return Some(v);
            }
        }
    }
    None
}

fn read_value(rest: &str, env: &HashMap<String, String>) -> Option<String> {
    let quote = rest.chars().next()?;
    if quote == '"' || quote == '\'' || quote == '`' {
        let body = &rest[quote.len_utf8()..];
        let end = body.find(quote)?;
        return Some(interpolate(&body[..end], env));
    }
    let end = rest
        .find(|c: char| matches!(c, ',' | '}' | '\n' | ';'))
        .unwrap_or(rest.len());
    let expr = rest[..end].trim();
    resolve_expr(expr, env)
}

/// `${process.env.PGHOST}` inside a template literal.
fn interpolate(text: &str, env: &HashMap<String, String>) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("${") {
        out.push_str(&rest[..start]);
        let tail = &rest[start + 2..];
        let Some(end) = tail.find('}') else {
            out.push_str(&rest[start..]);
            return out;
        };
        // `${DATABASE_URL}` - inside an interpolation a bare name is a variable
        // reference, which is what dotenv-expand means by it too.
        let inner = tail[..end].trim();
        let value = resolve_expr(inner, env).or_else(|| env.get(inner).cloned());
        out.push_str(&value.unwrap_or_default());
        rest = &tail[end + 1..];
    }
    out.push_str(rest);
    out
}

/// Evaluates the handful of expressions real configs use for a URL:
/// `env("DATABASE_URL")`, `process.env.DATABASE_URL!`, `process.env["X"]`,
/// `env.DATABASE_URL`, `Deno.env.get("X")`. Anything else is unresolvable
/// without running the project's own code, and comes back as None.
fn resolve_expr(expr: &str, env: &HashMap<String, String>) -> Option<String> {
    let expr = expr.trim();
    if expr.is_empty() {
        return None;
    }
    // An unquoted number is a literal (`port: 3306`), not a lookup.
    if expr.chars().all(|c| c.is_ascii_digit()) {
        return Some(expr.to_string());
    }
    // Quoted inside an expression (`env("X")`, or a defaulted `?? "postgres://…"`).
    let name = env_var_name(expr)?;
    env.get(&name).cloned()
}

/// The variable name out of an env lookup expression.
fn env_var_name(expr: &str) -> Option<String> {
    let at = expr.to_lowercase().rfind("env")?;
    let after = &expr[at + 3..];
    let mut chars = after.char_indices().peekable();
    // Skip the accessor: `.` `(` `[` `"` `'` `get` and whitespace.
    let mut start = None;
    while let Some((i, c)) = chars.peek().copied() {
        if c.is_ascii_alphanumeric() || c == '_' {
            start = Some(i);
            break;
        }
        if matches!(c, '.' | '(' | '[' | '"' | '\'' | ' ' | ')') {
            chars.next();
            continue;
        }
        return None;
    }
    let start = start?;
    let tail = &after[start..];
    // `env.get("X")` - step over the `get` and keep looking.
    if tail.starts_with("get") && !tail[3..].starts_with(|c: char| c.is_ascii_alphanumeric() || c == '_') {
        return env_var_name(&format!("env{}", &tail[3..]));
    }
    let end = tail
        .find(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
        .unwrap_or(tail.len());
    let name = &tail[..end];
    if name.is_empty() {
        None
    } else {
        Some(name.to_string())
    }
}

/// Lexically resolves `.` and `..` - `canonicalize` can't be used because the
/// SQLite file may not exist yet (a fresh `drizzle-kit push` hasn't run).
fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for part in path.components() {
        match part {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                if !out.pop() {
                    out.push("..");
                }
            }
            other => out.push(other),
        }
    }
    out
}

fn is_ident_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
}

/// True when the byte offset sits on a `//` or `#` comment line - a commented-out
/// `url` must not win over the live one below it.
fn line_is_comment(text: &str, at: usize) -> bool {
    let line_start = text[..at].rfind('\n').map(|i| i + 1).unwrap_or(0);
    let head = text[line_start..at].trim_start();
    head.starts_with("//") || head.starts_with('#') || head.starts_with('*')
}

/// `postgres://user:secret@db.host:5432/app?ssl=true` → `db.host:5432/app`.
fn redact_target(url: &str) -> String {
    let after_scheme = url.split_once("://").map(|(_, r)| r).unwrap_or(url);
    let host_part = match after_scheme.split_once('@') {
        // Only credentials sit before an `@` that precedes the first `/`.
        Some((creds, rest)) if !creds.contains('/') => rest,
        _ => after_scheme,
    };
    host_part
        .split(['?', '#'])
        .next()
        .unwrap_or(host_part)
        .trim_end_matches('/')
        .to_string()
}

fn short_scheme(url: &str) -> String {
    url.split_once("://")
        .map(|(s, _)| s.to_string())
        .unwrap_or_else(|| url.chars().take(12).collect())
}

/// A config path shown relative to the project, so rows stay readable.
fn display_rel(cwd: &Path, path: &Path) -> String {
    path.strip_prefix(cwd)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn classifies_only_real_studios() {
        let prisma = vec!["node".into(), "/p/node_modules/prisma/build/index.js".into(), "studio".into()];
        let drizzle = vec!["node".into(), "/p/node_modules/drizzle-kit/bin.cjs".into(), "studio".into()];
        let editor = vec!["code".into(), "/p/prisma/schema.prisma".into()];
        assert_eq!(classify(&prisma), Some("prisma"));
        assert_eq!(classify(&drizzle), Some("drizzle"));
        assert_eq!(classify(&editor), None);
    }

    #[test]
    fn prefers_the_port_the_process_actually_holds() {
        // Current Prisma Studio takes a random high port, so a listening socket
        // outranks both the default and an unused `--port`.
        assert_eq!(pick_port(vec![51212], None, PRISMA_PORT), Some(51212));
        // Several sockets (debugger, query engine): the tool's default wins.
        assert_eq!(pick_port(vec![9229, PRISMA_PORT], None, PRISMA_PORT), Some(PRISMA_PORT));
        // …and an explicit `--port` outranks the default when it's really held.
        assert_eq!(pick_port(vec![9229, 5601], Some(5601), PRISMA_PORT), Some(5601));
        // Unreadable sockets: fall back to the command line, else the default.
        assert_eq!(pick_port(vec![], Some(5601), PRISMA_PORT), Some(5601));
        assert_eq!(pick_port(vec![], None, PRISMA_PORT), None);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn reads_listening_ports_from_procfs() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(listening_ports(std::process::id()).contains(&port));
    }

    #[test]
    fn reads_port_from_either_flag_form() {
        assert_eq!(arg_port(&["studio".into(), "--port=5601".into()]), Some(5601));
        assert_eq!(arg_port(&["studio".into(), "-p".into(), "5602".into()]), Some(5602));
        assert_eq!(arg_port(&["studio".into()]), None);
    }

    #[test]
    fn resolves_prisma_datasource_through_env() {
        let schema = r#"
            generator client { provider = "prisma-client-js" }
            datasource db {
              provider = "postgresql"
              url      = env("DATABASE_URL")
            }
        "#;
        let block = block_after(schema, "datasource").unwrap();
        let e = env(&[("DATABASE_URL", "postgres://u:p@localhost:5432/app")]);
        assert_eq!(assign_value(&block, "provider", &e).unwrap(), "postgresql");
        assert_eq!(assign_value(&block, "url", &e).unwrap(), "postgres://u:p@localhost:5432/app");
    }

    #[test]
    fn datasource_block_scopes_the_url() {
        // The generator block above must not contribute an `output` or a `url`.
        let schema = r#"
            datasource db { provider = "sqlite" url = "file:./dev.db" }
            generator client { url = "https://example.invalid" }
        "#;
        let block = block_after(schema, "datasource").unwrap();
        assert_eq!(assign_value(&block, "url", &HashMap::new()).unwrap(), "file:./dev.db");
    }

    #[test]
    fn url_key_is_not_matched_inside_direct_url() {
        let block = r#" directUrl = "postgres://direct/db" "#;
        assert!(assign_value(block, "url", &HashMap::new()).is_none());
        assert_eq!(
            assign_value(block, "directUrl", &HashMap::new()).unwrap(),
            "postgres://direct/db"
        );
    }

    #[test]
    fn skips_commented_out_values() {
        let cfg = r#"
            // url: process.env.OLD_URL,
            url: process.env.DATABASE_URL,
        "#;
        let e = env(&[("OLD_URL", "postgres://old/db"), ("DATABASE_URL", "postgres://new/db")]);
        assert_eq!(assign_value(cfg, "url", &e).unwrap(), "postgres://new/db");
    }

    #[test]
    fn resolves_js_env_expressions() {
        let e = env(&[("DATABASE_URL", "mysql://root@127.0.0.1:3306/shop")]);
        for expr in [
            "process.env.DATABASE_URL!",
            "process.env[\"DATABASE_URL\"]",
            "env.DATABASE_URL",
            "Deno.env.get(\"DATABASE_URL\")",
        ] {
            assert_eq!(resolve_expr(expr, &e).as_deref(), Some("mysql://root@127.0.0.1:3306/shop"), "{expr}");
        }
        assert_eq!(resolve_expr("someLocalVariable", &e), None);
    }

    #[test]
    fn expands_template_literals() {
        let e = env(&[("PGHOST", "db.internal"), ("PGDB", "app")]);
        assert_eq!(
            interpolate("postgres://u@${PGHOST}:5432/${PGDB}", &e),
            "postgres://u@db.internal:5432/app"
        );
    }

    #[test]
    fn env_file_precedence_keeps_the_first_layer() {
        let mut e = env(&[("DATABASE_URL", "postgres://exported/db")]);
        merge_env_file("DATABASE_URL=postgres://dotenv/db\nOTHER=\"quoted # not-comment\"", &mut e);
        assert_eq!(e["DATABASE_URL"], "postgres://exported/db");
        assert_eq!(e["OTHER"], "quoted # not-comment");
    }

    #[test]
    fn env_file_strips_comments_and_export() {
        let mut e = HashMap::new();
        merge_env_file("# comment\nexport A=1 # trailing\nB='two'\n", &mut e);
        assert_eq!(e["A"], "1");
        assert_eq!(e["B"], "two");
    }

    /// Studios are local; the databases behind them usually are not. Every
    /// hosted shape has to come back as something the app can open.
    #[test]
    fn resolves_remote_dialects() {
        let base = Path::new("/proj");
        for (url, dialect, engine) in [
            ("postgresql://u:p@ep-cool.eu-central-1.aws.neon.tech/neondb?sslmode=require", "postgresql", "postgres"),
            ("postgres://postgres.abc:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres", "postgresql", "postgres"),
            ("mysql://user:pw@aws.connect.psdb.cloud/app?ssl={\"rejectUnauthorized\":true}", "mysql", "mysql"),
            ("libsql://app-org.turso.io", "turso", "libsql"),
            ("sqlserver://db.example.com:1433;database=app", "sqlserver", "mssql"),
            ("postgresql://root@free-tier.gcp.cockroachlabs.cloud:26257/defaultdb", "postgresql", "cockroachdb"),
        ] {
            let t = target_from_url(url, dialect, base)
                .unwrap_or_else(|| panic!("no target for {url}"));
            assert_eq!(t.engine.as_deref(), Some(engine), "{url}");
            assert_eq!(t.url.as_deref(), Some(url), "{url}");
        }
    }

    #[test]
    fn finds_a_turso_token_wherever_the_project_keeps_it() {
        assert_eq!(auth_token_from_env(&env(&[("TURSO_AUTH_TOKEN", "tok-a")])).as_deref(), Some("tok-a"));
        assert_eq!(auth_token_from_env(&env(&[("DATABASE_AUTH_TOKEN", "tok-b")])).as_deref(), Some("tok-b"));
        assert_eq!(auth_token_from_env(&env(&[("UNRELATED", "x")])), None);
    }

    #[test]
    fn a_d1_config_is_not_mistaken_for_local_sqlite() {
        // Current drizzle D1: the dialect says sqlite, only the driver says D1.
        let cfg = r#"
            export default defineConfig({
              dialect: 'sqlite',
              driver: 'd1-http',
              dbCredentials: {
                accountId: process.env.CF_ACCOUNT_ID,
                databaseId: process.env.CF_DATABASE_ID,
                token: process.env.CF_TOKEN,
              },
            })
        "#;
        let e = env(&[("CF_ACCOUNT_ID", "acc"), ("CF_DATABASE_ID", "db"), ("CF_TOKEN", "tok")]);
        let declared = assign_value(cfg, "dialect", &e).unwrap_or_default();
        let driver = assign_value(cfg, "driver", &e).unwrap_or_default();
        assert_eq!(declared, "sqlite");
        assert_eq!(driver, "d1-http");
        // The combined dialect is what the D1 branch matches on.
        let combined = format!("{declared} {driver}");
        assert!(combined.contains("d1"));
        // Left to the dialect alone this would have gone down the file path.
        assert!(target_from_url("", "sqlite", Path::new("/proj")).is_none());
    }

    #[test]
    fn resolves_the_local_d1_sqlite_file_for_a_helper_computed_url() {
        // The Cloudflare D1 local-dev config from the wild: `url: localD1File()`
        // computes the miniflare path at runtime. Static parsing can't reach it,
        // so the fallback must find the file itself - under whatever name
        // miniflare gave it, since the stem is a hash of the user's database.
        let root = std::env::temp_dir().join(format!("stroke_d1_scan_{}", std::process::id()));
        let d1_dir = root.join(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
        std::fs::create_dir_all(&d1_dir).unwrap();

        // A second binding, idle but with a fatter main file.
        let idle = d1_dir.join(format!("{}.sqlite", "e4".repeat(32)));
        std::fs::write(&idle, vec![0u8; 16384]).unwrap();
        // The live one: header-sized main file, every row still in the WAL.
        let db = d1_dir.join("0f3b9c7e2d1a4b56.sqlite");
        std::fs::write(&db, b"the real database with user tables").unwrap();
        std::fs::write(format!("{}-wal", db.display()), vec![0u8; 65536]).unwrap();
        // miniflare's own metadata store must NOT be picked, even though it
        // outweighs both - its stem isn't a hash.
        std::fs::write(d1_dir.join("metadata.sqlite"), vec![0u8; 1 << 20]).unwrap();

        let found = resolve_local_d1_sqlite(&root);
        assert_eq!(found.as_deref(), Some(db.to_string_lossy().as_ref()));

        // Missing directory (db not created yet) resolves to nothing, so the
        // caller can show the "start your dev server" hint instead.
        assert!(resolve_local_d1_sqlite(Path::new("/no/such/project")).is_none());

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn maps_urls_onto_drivers() {
        let base = Path::new("/proj");
        let pg = target_from_url("postgres://u@h:5432/d", "postgresql", base).unwrap();
        assert_eq!(pg.engine.as_deref(), Some("postgres"));
        let my = target_from_url("mysql://u@h:3306/d", "mysql", base).unwrap();
        assert_eq!(my.engine.as_deref(), Some("mysql"));
        let lite = target_from_url("file:./dev.db", "sqlite", base).unwrap();
        assert_eq!(lite.file_path.as_deref(), Some("/proj/dev.db"));
        let bare = target_from_url("./local.sqlite", "sqlite", base).unwrap();
        assert_eq!(bare.file_path.as_deref(), Some("/proj/local.sqlite"));
        let turso = target_from_url("libsql://app-org.turso.io", "turso", base).unwrap();
        assert_eq!(turso.engine.as_deref(), Some("libsql"));
        // Prisma Postgres proxy strings and in-memory SQLite have nothing to open.
        assert!(target_from_url("prisma+postgres://accelerate.prisma-data.net/?api_key=x", "postgresql", base).is_none());
        assert!(target_from_url("file::memory:", "sqlite", base).is_none());
    }

    #[test]
    fn builds_a_url_from_credential_fields() {
        let cfg = r#"
            dbCredentials: { host: "127.0.0.1", port: 3306, user: "root", password: "p@ss", database: "shop" }
        "#;
        let url = drizzle_url_from_parts(cfg, "mysql", &HashMap::new()).unwrap();
        assert_eq!(url, "mysql://root:p%40ss@127.0.0.1:3306/shop");
    }

    #[test]
    fn redacts_credentials_from_the_row_label() {
        assert_eq!(redact_target("postgres://u:secret@db.host:5432/app?ssl=true"), "db.host:5432/app");
        assert_eq!(redact_target("libsql://app-org.turso.io"), "app-org.turso.io");
    }
}

// ── Database servers installed on this machine ────────────────────────────────
// A Postgres from the package manager has no compose file and no schema to read,
// so there is nothing to recover a password from. What it does have is a process
// and a port, which is enough to offer the connection with the engine's own
// conventional superuser - the case that actually works on a dev box.

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MachineDatabase {
    pub id: String,
    /// Process name, e.g. `postgres`, `mysqld`, `redis-server`.
    pub name: String,
    pub pid: u32,
    pub engine: String,
    pub host: String,
    pub port: u16,
    /// The engine's conventional local superuser; there is no password to find.
    pub user: String,
    pub database: String,
    pub target: String,
}

/// Engine for a server process, matched on the executable rather than the whole
/// command line - `psql`, `pg_dump` and an editor holding "postgres" in a path
/// are all clients, not servers.
fn engine_for_process(exe: &str, args: &[String]) -> Option<&'static str> {
    let name = exe.rsplit('/').next().unwrap_or(exe).to_lowercase();
    let engine = match name.as_str() {
        "postgres" | "postmaster" => "postgres",
        "mysqld" => "mysql",
        "mariadbd" => "mariadb",
        "redis-server" | "valkey-server" => "redis",
        "clickhouse-server" => "clickhouse",
        "sqlservr" => "mssql",
        "cockroach" => "cockroachdb",
        // `redis-server` often reports as `redis-server *:6379`.
        other if other.starts_with("redis-server") => "redis",
        "clickhouse" if args.iter().any(|a| a == "server") => "clickhouse",
        _ => return None,
    };
    Some(engine)
}

/// The conventional local superuser and starting database for each engine.
fn machine_defaults(engine: &str) -> (&'static str, &'static str) {
    match engine {
        "mysql" | "mariadb" => ("root", "mysql"),
        "clickhouse" => ("default", "default"),
        "mssql" => ("sa", "master"),
        "cockroachdb" => ("root", "defaultdb"),
        "redis" => ("", ""),
        _ => ("postgres", "postgres"),
    }
}

/// Database servers running natively on this machine (not in a container).
///
/// A container's server process is visible in the host process list too, but its
/// listening socket lives in the container's own network namespace, so it never
/// matches the host's socket table and drops out here - which is what keeps it
/// from being listed twice alongside its Docker row.
#[tauri::command]
pub async fn scan_machine_databases() -> Result<Vec<MachineDatabase>, String> {
    tokio::task::spawn_blocking(collect_machine_databases)
        .await
        .map_err(|e| format!("Machine scan failed: {e}"))
}

fn collect_machine_databases() -> Vec<MachineDatabase> {
    let mut sys = System::new_with_specifics(
        RefreshKind::nothing().with_processes(ProcessRefreshKind::everything()),
    );
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::everything(),
    );

    let mut out: Vec<MachineDatabase> = Vec::new();
    for proc in sys.processes().values() {
        let args: Vec<String> = proc.cmd().iter().map(|a| a.to_string_lossy().to_string()).collect();
        let exe = proc
            .exe()
            .map(|p| p.to_string_lossy().to_string())
            .or_else(|| args.first().cloned())
            .unwrap_or_else(|| proc.name().to_string_lossy().to_string());
        let Some(engine) = engine_for_process(&exe, &args) else { continue };

        // Only the process that actually holds the socket counts: a Postgres
        // cluster forks a dozen workers under the same name, and every one of
        // them would otherwise become a row.
        let ports = listening_ports(proc.pid().as_u32());
        let Some(port) = pick_port(ports, None, engine_port_for(engine)) else { continue };
        if out.iter().any(|d| d.port == port) {
            continue;
        }

        let (user, database) = machine_defaults(engine);
        let host = "127.0.0.1".to_string();
        let target = if database.is_empty() {
            format!("{host}:{port}")
        } else {
            format!("{host}:{port}/{database}")
        };
        out.push(MachineDatabase {
            id: format!("machine:{engine}:{port}"),
            name: exe.rsplit('/').next().unwrap_or(&exe).to_string(),
            pid: proc.pid().as_u32(),
            engine: engine.to_string(),
            host,
            port,
            user: user.to_string(),
            database: database.to_string(),
            target,
        });
    }
    out.sort_by(|a, b| a.engine.cmp(&b.engine).then(a.port.cmp(&b.port)));
    out
}

/// Default listening port per engine, used to choose among several sockets.
fn engine_port_for(engine: &str) -> u16 {
    match engine {
        "mysql" | "mariadb" => 3306,
        "redis" => 6379,
        "clickhouse" => 9000,
        "mssql" => 1433,
        "cockroachdb" => 26257,
        _ => 5432,
    }
}

#[cfg(test)]
mod machine_tests {
    use super::*;

    #[test]
    fn matches_servers_and_ignores_their_clients() {
        assert_eq!(engine_for_process("/usr/bin/postgres", &[]), Some("postgres"));
        assert_eq!(engine_for_process("/usr/sbin/mysqld", &[]), Some("mysql"));
        assert_eq!(engine_for_process("/usr/bin/redis-server", &[]), Some("redis"));
        assert_eq!(engine_for_process("/usr/bin/mariadbd", &[]), Some("mariadb"));
        // Clients and tools are not servers.
        assert_eq!(engine_for_process("/usr/bin/psql", &[]), None);
        assert_eq!(engine_for_process("/usr/bin/pg_dump", &[]), None);
        assert_eq!(engine_for_process("/usr/bin/redis-cli", &[]), None);
        // `clickhouse` is one binary for both roles; the subcommand decides.
        assert_eq!(engine_for_process("/usr/bin/clickhouse", &[]), None);
        assert_eq!(engine_for_process("/usr/bin/clickhouse", &["server".into()]), Some("clickhouse"));
    }

    #[test]
    fn offers_the_engines_conventional_local_superuser() {
        assert_eq!(machine_defaults("postgres"), ("postgres", "postgres"));
        assert_eq!(machine_defaults("mysql"), ("root", "mysql"));
        assert_eq!(machine_defaults("redis"), ("", ""));
    }
}
