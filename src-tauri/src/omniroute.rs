// OmniRoute: an OpenAI-compatible proxy the user runs locally. Installing it by
// hand means finding Node, running a global npm install and keeping a terminal
// open, so the app can do all three - but only ever on an explicit click, and
// only for this one well-known package.
//
// Every failure here is reported with the specific missing piece (Node absent,
// npm absent, install rejected, port busy) because "could not start OmniRoute"
// gives the user nothing to act on.

use std::process::Stdio;
use std::sync::Mutex;
use tauri::Emitter;
use tokio::io::AsyncBufReadExt;
use tokio::process::{Child, Command as Cmd};

/// The running server, if this app started it. Kept so Stop can reach the child
/// and so quitting the app does not leave an orphaned proxy behind.
#[derive(Default)]
pub struct OmniRouteState {
    child: Mutex<Option<Child>>,
}

impl OmniRouteState {
    pub fn new() -> Self {
        Self::default()
    }
}

#[derive(serde::Serialize, Clone)]
pub struct OmniLog {
    pub line: String,
    pub kind: String,
}

fn emit(app: &tauri::AppHandle, line: &str, kind: &str) {
    let _ = app.emit(
        "omniroute-log",
        OmniLog {
            line: line.to_owned(),
            kind: kind.to_owned(),
        },
    );
}

/// npm ships as a shell script on Windows, so it is not directly executable
/// there - it has to go through cmd.exe. Everything else runs it directly.
fn npm_command() -> Cmd {
    #[cfg(target_os = "windows")]
    {
        let mut c = Cmd::new("cmd");
        c.args(["/C", "npm"]);
        c
    }
    #[cfg(not(target_os = "windows"))]
    {
        Cmd::new("npm")
    }
}

fn omniroute_command() -> Cmd {
    #[cfg(target_os = "windows")]
    {
        let mut c = Cmd::new("cmd");
        c.args(["/C", "omniroute"]);
        c
    }
    #[cfg(not(target_os = "windows"))]
    {
        Cmd::new("omniroute")
    }
}

#[derive(serde::Serialize)]
pub struct NodeStatus {
    pub node: Option<String>,
    pub npm: Option<String>,
    pub omniroute: Option<String>,
}

/// What is present on this machine. Never errors: the UI needs to render the
/// gaps, not a failure.
#[tauri::command]
pub async fn omniroute_env() -> Result<NodeStatus, String> {
    async fn version(mut cmd: Cmd) -> Option<String> {
        let out = cmd.arg("--version").output().await.ok()?;
        if !out.status.success() {
            return None;
        }
        let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if v.is_empty() { None } else { Some(v) }
    }

    Ok(NodeStatus {
        node: version(Cmd::new("node")).await,
        npm: version(npm_command()).await,
        omniroute: version(omniroute_command()).await,
    })
}

/// `npm i -g omniroute`, streaming npm's output to the UI as it goes.
#[tauri::command]
pub async fn omniroute_install(app: tauri::AppHandle) -> Result<String, String> {
    let env = omniroute_env().await?;
    if env.node.is_none() {
        return Err(
            "Node.js is not installed. OmniRoute runs on Node - install it from nodejs.org (or your package manager), then try again."
                .to_string(),
        );
    }
    if env.npm.is_none() {
        return Err(
            "npm was not found even though Node.js is installed. Reinstall Node.js so npm comes with it, or install OmniRoute yourself and use the Custom provider."
                .to_string(),
        );
    }

    emit(&app, "npm install -g omniroute", "cmd");
    let mut child = npm_command()
        .args(["install", "-g", "omniroute"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not run npm: {e}"))?;

    if let Some(out) = child.stdout.take() {
        let app = app.clone();
        tokio::spawn(async move {
            let mut lines = tokio::io::BufReader::new(out).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                emit(&app, &l, "out");
            }
        });
    }
    if let Some(err) = child.stderr.take() {
        let app = app.clone();
        tokio::spawn(async move {
            let mut lines = tokio::io::BufReader::new(err).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                emit(&app, &l, "err");
            }
        });
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("npm install failed: {e}"))?;
    if !status.success() {
        return Err(
            "npm install failed. A global install may need elevated permissions - run `npm install -g omniroute` in a terminal to see the full error."
                .to_string(),
        );
    }

    let v = omniroute_env().await?.omniroute;
    Ok(v.unwrap_or_else(|| "installed".to_string()))
}

/// Is the GATEWAY answering - not merely "is the port open".
///
/// A bare TCP connect was not enough: any unrelated dev server on the port
/// answered the handshake and the UI then claimed OmniRoute was running while
/// every model request 404'd. Ask for the endpoint the app actually uses.
async fn gateway_answers(port: u16) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(1500))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    match client
        .get(format!("http://127.0.0.1:{port}/v1/models"))
        .send()
        .await
    {
        // 401/403 still means an OpenAI-compatible server is there, just gated.
        Ok(r) => r.status().is_success() || r.status().as_u16() == 401 || r.status().as_u16() == 403,
        Err(_) => false,
    }
}

/// Start the proxy and wait until the port actually accepts connections -
/// spawning the process only proves it launched, not that it is serving.
#[tauri::command]
pub async fn omniroute_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, OmniRouteState>,
    port: u16,
) -> Result<String, String> {
    if gateway_answers(port).await {
        // Already serving: either we started it earlier or the user runs their
        // own. Either way there is nothing to do, and starting a second copy
        // would just fail on the bound port.
        return Ok(format!("http://127.0.0.1:{port}"));
    }

    if omniroute_env().await?.omniroute.is_none() {
        return Err("OmniRoute is not installed yet. Install it first.".to_string());
    }

    emit(&app, &format!("omniroute --port {port}"), "cmd");
    let mut child = omniroute_command()
        .args(["--port", &port.to_string()])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start OmniRoute: {e}"))?;

    if let Some(out) = child.stdout.take() {
        let app = app.clone();
        tokio::spawn(async move {
            let mut lines = tokio::io::BufReader::new(out).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                emit(&app, &l, "out");
            }
        });
    }
    if let Some(err) = child.stderr.take() {
        let app = app.clone();
        tokio::spawn(async move {
            let mut lines = tokio::io::BufReader::new(err).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                emit(&app, &l, "err");
            }
        });
    }

    // Take ownership before waiting, so a Stop during startup still finds it.
    // The lock is released immediately - never held across the await below.
    {
        let mut slot = state.child.lock().map_err(|_| "OmniRoute state poisoned")?;
        if let Some(mut old) = slot.take() {
            let _ = old.start_kill();
        }
        *slot = Some(child);
    }

    for _ in 0..40u32 {
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        if gateway_answers(port).await {
            return Ok(format!("http://127.0.0.1:{port}"));
        }
    }
    Err(format!(
        "Started, but the gateway did not answer on port {port} within 10s. It may still be booting, or another process is holding the port."
    ))
}

#[tauri::command]
pub async fn omniroute_stop(state: tauri::State<'_, OmniRouteState>) -> Result<(), String> {
    let child = {
        let mut slot = state.child.lock().map_err(|_| "OmniRoute state poisoned")?;
        slot.take()
    };
    if let Some(mut c) = child {
        let _ = c.kill().await;
    }
    Ok(())
}

/// True when the port is serving, regardless of who started it.
#[tauri::command]
pub async fn omniroute_running(port: u16) -> Result<bool, String> {
    Ok(gateway_answers(port).await)
}
