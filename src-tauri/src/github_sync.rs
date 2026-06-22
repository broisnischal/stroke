use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

const CLIENT_ID: &str = env!("GITHUB_CLIENT_ID");
const CLIENT_SECRET: &str = env!("GITHUB_CLIENT_SECRET");

static GH_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn http() -> &'static reqwest::Client {
    GH_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("stroke-db-app/1.0")
            .tcp_keepalive(std::time::Duration::from_secs(60))
            .pool_max_idle_per_host(4)
            .build()
            .expect("failed to build GitHub HTTP client")
    })
}

const TOKEN_KEY: &str = "__github_oauth_token";
const GIST_ID_KEY: &str = "__github_gist_id";
const GIST_FILENAME: &str = "stroke-connections.json";
const GIST_DESCRIPTION: &str = "Stroke — saved connections (managed automatically)";

fn read_secrets(app: &tauri::AppHandle) -> HashMap<String, String> {
    crate::secrets::read_all(app)
}

fn write_secrets(app: &tauri::AppHandle, map: &HashMap<String, String>) -> Result<(), String> {
    crate::secrets::write_all(app, map)
}

fn store_kv(app: &tauri::AppHandle, key: &str, value: &str) -> Result<(), String> {
    let mut map = read_secrets(app);
    map.insert(key.to_string(), value.to_string());
    write_secrets(app, &map)
}

fn load_kv(app: &tauri::AppHandle, key: &str) -> Option<String> {
    read_secrets(app).get(key).cloned()
}

fn remove_kv(app: &tauri::AppHandle, key: &str) -> Result<(), String> {
    let mut map = read_secrets(app);
    map.remove(key);
    write_secrets(app, &map)
}

// ── Device flow ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitHubUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
    pub id: u64,
}

/// Returned by `github_auth_poll` on success — carries both the user profile
/// and the token so the frontend can set both in one shot without a second roundtrip.
#[derive(Debug, Serialize)]
pub struct AuthSuccess {
    pub user: GitHubUser,
    pub token: String,
}

/// Request a device code from GitHub to start the device authorization flow.
#[tauri::command]
pub async fn github_auth_start() -> Result<DeviceCodeResponse, String> {
    let client = http();
    let resp = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .json(&serde_json::json!({ "client_id": CLIENT_ID, "scope": "gist" }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("GitHub returned {}", resp.status()));
    }

    resp.json::<DeviceCodeResponse>()
        .await
        .map_err(|e| format!("Failed to parse device code response: {}", e))
}

/// Poll GitHub for an access token. Returns `Some(AuthSuccess)` when the user
/// has authorized (token stored to disk + returned directly), `None` when still
/// pending, or an error string for terminal failures (expired, denied, etc.).
#[tauri::command]
pub async fn github_auth_poll(
    app: tauri::AppHandle,
    device_code: String,
) -> Result<Option<AuthSuccess>, String> {
    let client = http();
    let resp = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "device_code": device_code,
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<TokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    match resp.access_token {
        Some(token) if !token.is_empty() => {
            let user = fetch_user(&token).await?;
            store_kv(&app, TOKEN_KEY, &token)?;
            Ok(Some(AuthSuccess { user, token }))
        }
        _ => match resp.error.as_deref() {
            Some("authorization_pending") | Some("slow_down") | None => Ok(None),
            Some(err) => Err(err.to_string()),
        },
    }
}

async fn fetch_user(token: &str) -> Result<GitHubUser, String> {
    let client = http();
    client
        .get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "stroke-db-app")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json::<GitHubUser>()
        .await
        .map_err(|e| format!("Failed to parse GitHub user: {}", e))
}

/// Load the stored OAuth token (returns null if not logged in).
#[tauri::command]
pub fn github_auth_load_token(app: tauri::AppHandle) -> Option<String> {
    load_kv(&app, TOKEN_KEY)
}

/// Fetch the GitHub user for a given token.
#[tauri::command]
pub async fn github_auth_get_user(token: String) -> Result<GitHubUser, String> {
    fetch_user(&token).await
}

/// Remove stored token and gist ID (logout).
#[tauri::command]
pub fn github_auth_logout(app: tauri::AppHandle) -> Result<(), String> {
    remove_kv(&app, TOKEN_KEY)?;
    remove_kv(&app, GIST_ID_KEY)
}

// ── Gist sync ─────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct GistFile {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GistResponse {
    id: String,
    files: HashMap<String, GistFile>,
}

/// Push a JSON payload to the user's private Stroke Gist (creates it on first
/// push; updates it on subsequent pushes using the stored gist ID).
#[tauri::command]
pub async fn github_gist_push(
    app: tauri::AppHandle,
    token: String,
    payload: String,
) -> Result<String, String> {
    let client = http();
    let existing_id = load_kv(&app, GIST_ID_KEY);

    let resp: GistResponse = if let Some(ref gist_id) = existing_id {
        client
            .patch(format!("https://api.github.com/gists/{}", gist_id))
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "stroke-db-app")
            .json(&serde_json::json!({
                "files": { GIST_FILENAME: { "content": payload } }
            }))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| format!("Gist update failed: {}", e))?
    } else {
        client
            .post("https://api.github.com/gists")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "stroke-db-app")
            .json(&serde_json::json!({
                "description": GIST_DESCRIPTION,
                "public": false,
                "files": { GIST_FILENAME: { "content": payload } }
            }))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| format!("Gist create failed: {}", e))?
    };

    store_kv(&app, GIST_ID_KEY, &resp.id)?;
    Ok(resp.id)
}

/// Pull the JSON payload from the user's Stroke Gist. Returns null if the
/// gist has not been created yet (first login on a new machine).
#[tauri::command]
pub async fn github_gist_pull(
    app: tauri::AppHandle,
    token: String,
) -> Result<Option<String>, String> {
    let client = http();

    let gist_id = if let Some(id) = load_kv(&app, GIST_ID_KEY) {
        id
    } else {
        // No locally-stored ID — scan the user's gist list for ours.
        let gists: Vec<serde_json::Value> = client
            .get("https://api.github.com/gists")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "stroke-db-app")
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| format!("Failed to list gists: {}", e))?;

        let found = gists.iter().find(|g| {
            g["description"].as_str() == Some(GIST_DESCRIPTION)
                && g["files"]
                    .as_object()
                    .is_some_and(|f| f.contains_key(GIST_FILENAME))
        });

        match found {
            Some(g) => {
                let id = g["id"].as_str().unwrap_or("").to_string();
                store_kv(&app, GIST_ID_KEY, &id)?;
                id
            }
            None => return Ok(None),
        }
    };

    let gist: GistResponse = client
        .get(format!("https://api.github.com/gists/{}", gist_id))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "stroke-db-app")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| format!("Failed to fetch gist content: {}", e))?;

    Ok(gist.files.get(GIST_FILENAME).and_then(|f| f.content.clone()))
}
