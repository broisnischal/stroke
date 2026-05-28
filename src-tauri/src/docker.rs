use std::process::Stdio;
use tauri::Emitter;
use tokio::io::AsyncBufReadExt;
use tokio::process::Command as Cmd;

#[derive(serde::Serialize, Clone)]
pub struct DockerLog {
    pub line: String,
    pub kind: String,
}

#[derive(serde::Serialize, Clone)]
pub struct DockerConnInfo {
    pub db_type: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub database: String,
    pub name: String,
}

fn emit_log(app: &tauri::AppHandle, event: &str, line: &str, kind: &str) {
    let _ = app.emit(
        event,
        DockerLog {
            line: line.to_owned(),
            kind: kind.to_owned(),
        },
    );
}

#[tauri::command]
pub async fn docker_check() -> Result<String, String> {
    let out = Cmd::new("docker")
        .args(["version", "--format", "{{.Server.Version}}"])
        .output()
        .await
        .map_err(|_| {
            "Docker is not installed on this machine. Install Docker Desktop to use this feature."
                .to_string()
        })?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).to_lowercase();
        if err.contains("daemon")
            || err.contains("cannot connect")
            || err.contains("socket")
            || err.contains("pipe")
        {
            return Err(
                "Docker is installed but not running. Please start Docker Desktop.".to_string(),
            );
        }
        return Err(
            "Docker is not available. Please install Docker Desktop.".to_string(),
        );
    }

    let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
    Ok(if v.is_empty() { "ok".to_string() } else { v })
}

#[tauri::command]
pub async fn docker_run_db(
    app: tauri::AppHandle,
    db_type: String,
    event_id: String,
) -> Result<DockerConnInfo, String> {
    let evt = format!("docker-log:{event_id}");

    let (image, host_port, cont_port): (&str, u16, u16) = match db_type.as_str() {
        "postgres" => ("postgres:17-alpine", 5433, 5432),
        "mysql" => ("mysql:8.4", 3307, 3306),
        other => return Err(format!("Unsupported database type: {other}")),
    };

    let (user, password, database): (&str, &str, &str) = match db_type.as_str() {
        "postgres" => ("postgres", "postgres", "postgres"),
        "mysql" => ("root", "mysql", "mysql"),
        _ => unreachable!(),
    };

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let container_name = format!("db-studio-{db_type}-{ts}");
    let port_map = format!("{host_port}:{cont_port}");

    // ── Pull ──────────────────────────────────────────────────────────────────
    emit_log(&app, &evt, &format!("Pulling {image}…"), "info");

    let mut pull_child = Cmd::new("docker")
        .args(["pull", image])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start docker pull: {e}"))?;

    if let Some(stderr) = pull_child.stderr.take() {
        let mut lines = tokio::io::BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let t = line.trim();
            if !t.is_empty() {
                emit_log(&app, &evt, t, "info");
            }
        }
    }

    let pull_status = pull_child.wait().await.map_err(|e| e.to_string())?;
    if !pull_status.success() {
        return Err(format!(
            "docker pull {image} failed. Check your internet connection."
        ));
    }

    emit_log(&app, &evt, "Image ready. Starting container…", "info");

    // ── Run ───────────────────────────────────────────────────────────────────
    let mut run_cmd = Cmd::new("docker");
    run_cmd
        .arg("run")
        .arg("-d")
        .arg("--name")
        .arg(&container_name)
        .arg("-p")
        .arg(&port_map);

    match db_type.as_str() {
        "postgres" => {
            run_cmd
                .arg("-e")
                .arg("POSTGRES_PASSWORD=postgres")
                .arg("-e")
                .arg("POSTGRES_USER=postgres")
                .arg("-e")
                .arg("POSTGRES_DB=postgres");
        }
        "mysql" => {
            run_cmd
                .arg("-e")
                .arg("MYSQL_ROOT_PASSWORD=mysql")
                .arg("-e")
                .arg("MYSQL_DATABASE=mysql");
        }
        _ => {}
    }
    run_cmd.arg(image);

    let run_out = run_cmd
        .output()
        .await
        .map_err(|e| format!("Failed to launch container: {e}"))?;

    if !run_out.status.success() {
        let err = String::from_utf8_lossy(&run_out.stderr);
        let msg = if err.contains("port is already allocated")
            || err.contains("address already in use")
        {
            format!("Port {host_port} is already in use. Stop the existing service and try again.")
        } else {
            format!("Container failed to start: {err}")
        };
        return Err(msg);
    }

    let cid = String::from_utf8_lossy(&run_out.stdout).trim().to_string();
    let short = &cid[..cid.len().min(12)];
    emit_log(&app, &evt, &format!("Container {short} started."), "info");
    emit_log(
        &app,
        &evt,
        "Waiting for database to accept connections…",
        "info",
    );

    // ── Wait for ready (TCP poll) ──────────────────────────────────────────────
    let addr = format!("127.0.0.1:{host_port}");
    let mut ready = false;
    for attempt in 1..=30u32 {
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        if tokio::net::TcpStream::connect(&addr).await.is_ok() {
            emit_log(
                &app,
                &evt,
                &format!("Database ready after {attempt}s"),
                "info",
            );
            ready = true;
            break;
        }
    }

    if !ready {
        return Err(format!(
            "Database did not become ready within 30s. Container: {container_name}"
        ));
    }

    let label = if db_type == "postgres" {
        "PostgreSQL"
    } else {
        "MySQL"
    };

    Ok(DockerConnInfo {
        db_type,
        host: "127.0.0.1".to_string(),
        port: host_port,
        user: user.to_string(),
        password: password.to_string(),
        database: database.to_string(),
        name: format!("Docker {label} (:{host_port})"),
    })
}
