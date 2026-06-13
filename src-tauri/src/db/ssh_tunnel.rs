use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::process::{Child, Command};

/// SSH tunnel configuration — serialized alongside saved connections.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfig {
    pub host: String,
    #[serde(default = "default_ssh_port")]
    pub port: u16,
    pub username: String,
    /// Path to an identity file (e.g. `~/.ssh/id_rsa`).
    /// Leave empty to rely on the system SSH agent.
    #[serde(default)]
    pub private_key_path: String,
}

fn default_ssh_port() -> u16 {
    22
}

// ── SshTunnel ─────────────────────────────────────────────────────────────────

/// A live SSH local-port-forward tunnel backed by a system `ssh -N -L` process.
/// Dropping the struct kills the SSH process automatically.
pub struct SshTunnel {
    pub local_port: u16,
    child: Child,
}

impl Drop for SshTunnel {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
    }
}

fn find_free_port() -> Result<u16, String> {
    // Bind to :0 — the OS assigns an ephemeral port — then release the listener.
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Cannot find a free local port: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();
    Ok(port)
}

impl SshTunnel {
    /// Spawn `ssh -N -L {local_port}:{db_host}:{db_port} …` and block until
    /// the forwarded port is reachable (or the 10 s deadline is hit).
    pub async fn establish(ssh: &SshConfig, db_host: &str, db_port: u16) -> Result<Self, String> {
        let local_port = find_free_port()?;
        let forward = format!("{local_port}:{db_host}:{db_port}");
        let dest = format!("{}@{}", ssh.username, ssh.host);

        let mut args: Vec<String> = vec![
            "-N".into(),
            // Kill immediately if port-forward binding fails
            "-o".into(), "ExitOnForwardFailure=yes".into(),
            // Accept new hosts but reject changed fingerprints
            "-o".into(), "StrictHostKeyChecking=accept-new".into(),
            // Keep-alive so long-idle tunnels don't stall the pool
            "-o".into(), "ServerAliveInterval=30".into(),
            "-o".into(), "ServerAliveCountMax=3".into(),
            "-o".into(), "ConnectTimeout=10".into(),
            "-p".into(), ssh.port.to_string(),
            "-L".into(), forward,
        ];

        if !ssh.private_key_path.trim().is_empty() {
            args.push("-i".into());
            args.push(ssh.private_key_path.clone());
        }

        args.push(dest);

        let child = Command::new("ssh")
            .args(&args)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| {
                format!(
                    "Failed to launch SSH: {e}. \
                     Ensure the 'ssh' binary is on your PATH."
                )
            })?;

        // Poll until the forwarded port accepts connections (up to 10 s).
        let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
        loop {
            if tokio::net::TcpStream::connect(format!("127.0.0.1:{local_port}"))
                .await
                .is_ok()
            {
                break;
            }
            if tokio::time::Instant::now() >= deadline {
                return Err(format!(
                    "SSH tunnel to {}@{} timed out — \
                     check credentials, host reachability, and that port {} is not blocked",
                    ssh.username, ssh.host, ssh.port
                ));
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }

        Ok(SshTunnel { local_port, child })
    }
}

// ── TunnelState ───────────────────────────────────────────────────────────────

/// Tauri-managed state holding the currently active SSH tunnel (if any).
/// Set on connect, cleared on disconnect; Drop kills the ssh process.
pub struct TunnelState {
    inner: std::sync::Mutex<Option<SshTunnel>>,
}

impl TunnelState {
    pub fn new() -> Self {
        Self {
            inner: std::sync::Mutex::new(None),
        }
    }

    pub fn set(&self, tunnel: Option<SshTunnel>) {
        if let Ok(mut g) = self.inner.lock() {
            *g = tunnel;
        }
    }

    pub fn clear(&self) {
        self.set(None);
    }
}
