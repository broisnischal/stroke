/*!
 * Cloudflare OAuth 2.0 + PKCE flow for DB Studio.
 *
 * Uses the same public client_id as the Wrangler CLI — Cloudflare's official
 * developer tool — which accepts localhost redirect URIs for desktop apps.
 *
 * Flow:
 *   1. Generate PKCE verifier/challenge + random state
 *   2. Spin up a temporary local HTTP server on a random port
 *   3. Open the Cloudflare auth page in the system browser
 *   4. Cloudflare redirects to http://localhost:{port}/oauth/callback?code=...
 *   5. Exchange the code + verifier for access + refresh tokens
 *   6. Store tokens in the app keychain (secrets module)
 */

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::OnceLock;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

// ── Cloudflare OAuth constants ────────────────────────────────────────────────

// Public client_id used by Wrangler CLI and other official Cloudflare tooling.
const CF_CLIENT_ID: &str = "54d11594-84e4-41aa-b438-e81b8fa78ee7";
const CF_AUTH_URL: &str = "https://dash.cloudflare.com/oauth2/auth";
const CF_TOKEN_URL: &str = "https://dash.cloudflare.com/oauth2/token";
const CF_REVOKE_URL: &str = "https://dash.cloudflare.com/oauth2/revoke";
// Scopes: account listing + D1 read/write + offline refresh tokens
const CF_SCOPES: &str = "account:read user:read d1:write offline_access";
// How long to wait for the user to authorize before giving up
const AUTH_TIMEOUT_SECS: u64 = 300;
// Cloudflare has pre-registered http://localhost:{PORT}/oauth/callback for this
// client ID — the exact same ports Wrangler CLI uses. A random port is rejected.
const CF_CALLBACK_PORTS: &[u16] = &[8976, 8977, 8978, 8979, 8980];

// ── Keychain keys ─────────────────────────────────────────────────────────────

const KEY_ACCESS: &str = "__cf_access_token__";
const KEY_REFRESH: &str = "__cf_refresh_token__";
const KEY_EXPIRES: &str = "__cf_token_expires__"; // unix seconds as string
const KEY_EMAIL: &str = "__cf_user_email__";

// ── Shared HTTP client ────────────────────────────────────────────────────────

static CF_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn http() -> &'static reqwest::Client {
    CF_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("db-studio/1.0")
            .tcp_keepalive(std::time::Duration::from_secs(60))
            .pool_max_idle_per_host(4)
            .build()
            .expect("failed to build CF HTTP client")
    })
}

// ── Public API structs ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CfAccount {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CfD1Database {
    pub uuid: String,
    pub name: String,
    pub created_at: Option<String>,
    pub num_tables: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CfOAuthStatus {
    pub connected: bool,
    pub email: Option<String>,
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────

fn random_base64url(n: usize) -> String {
    let mut bytes = vec![0u8; n];
    getrandom::getrandom(&mut bytes).expect("getrandom failed");
    URL_SAFE_NO_PAD.encode(&bytes)
}

/// Returns (verifier, challenge) where challenge = BASE64URL(SHA256(verifier)).
fn pkce_pair() -> (String, String) {
    let verifier = random_base64url(32);
    let hash = Sha256::digest(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hash);
    (verifier, challenge)
}

// ── Local callback server ─────────────────────────────────────────────────────

/// Try to bind to one of the pre-registered Cloudflare callback ports.
/// Returns (listener, redirect_uri) on success.
async fn bind_callback_listener() -> Result<(TcpListener, String), String> {
    for &port in CF_CALLBACK_PORTS {
        if let Ok(listener) = TcpListener::bind(format!("127.0.0.1:{port}")).await {
            let redirect_uri = format!("http://localhost:{port}/oauth/callback");
            return Ok((listener, redirect_uri));
        }
    }
    Err(format!(
        "Could not bind to any of the pre-registered callback ports ({}-{}). \
         Close other Wrangler or DB Studio processes and try again.",
        CF_CALLBACK_PORTS[0],
        CF_CALLBACK_PORTS[CF_CALLBACK_PORTS.len() - 1]
    ))
}

/// Wait for one OAuth callback on the listener and return the authorization code.
async fn await_oauth_callback(
    listener: TcpListener,
    expected_state: &str,
) -> Result<String, String> {
    let success_html = r#"<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>DB Studio — authorized</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0d0d0d;color:#eee}
.card{text-align:center;padding:48px;border-radius:16px;border:1px solid #333;background:#111}
h2{color:#22c55e;margin-bottom:12px}p{color:#888;margin:0}</style></head>
<body><div class="card">
<h2>Authorization successful</h2>
<p>You can close this tab and return to DB Studio.</p>
</div></body></html>"#;

    let error_html = r#"<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>DB Studio — error</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0d0d0d;color:#eee}
.card{text-align:center;padding:48px;border-radius:16px;border:1px solid #4b1c1c;background:#1a0f0f}
h2{color:#ef4444;margin-bottom:12px}p{color:#888;margin:0}</style></head>
<body><div class="card">
<h2>Authorization failed</h2>
<p>You can close this tab and try again in DB Studio.</p>
</div></body></html>"#;

    let send_html = |html: &str| -> String {
        format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            html.len(),
            html
        )
    };

    let (mut stream, _) = listener
        .accept()
        .await
        .map_err(|e| format!("Callback accept failed: {e}"))?;

    let mut buf = vec![0u8; 8192];
    let n = stream
        .read(&mut buf)
        .await
        .map_err(|e| format!("Callback read failed: {e}"))?;
    let req = String::from_utf8_lossy(&buf[..n]);

    // Parse the first line: GET /oauth/callback?code=...&state=... HTTP/1.1
    let first_line = req.lines().next().unwrap_or("");
    let path = first_line.split_whitespace().nth(1).unwrap_or("");
    let query = path.split('?').nth(1).unwrap_or("");

    let mut code = None;
    let mut state = None;
    let mut error: Option<String> = None;

    for pair in query.split('&') {
        let mut kv = pair.splitn(2, '=');
        let key = kv.next().unwrap_or("");
        let val = kv
            .next()
            .map(|v| urlencoding::decode(v).unwrap_or_default().into_owned())
            .unwrap_or_default();
        match key {
            "code" => code = Some(val),
            "state" => state = Some(val),
            "error" => error = Some(val),
            "error_description" => {
                if error.is_none() {
                    error = Some(val)
                }
            }
            _ => {}
        }
    }

    if let Some(err) = &error {
        let _ = stream
            .write_all(send_html(error_html).as_bytes())
            .await;
        return Err(format!("Cloudflare denied authorization: {err}"));
    }

    let code = match code {
        Some(c) if !c.is_empty() => c,
        _ => {
            let _ = stream
                .write_all(send_html(error_html).as_bytes())
                .await;
            return Err("No authorization code in callback".to_string());
        }
    };

    if state.as_deref() != Some(expected_state) {
        let _ = stream
            .write_all(send_html(error_html).as_bytes())
            .await;
        return Err("OAuth state mismatch — possible CSRF".to_string());
    }

    let _ = stream
        .write_all(send_html(success_html).as_bytes())
        .await;
    let _ = stream.flush().await;

    Ok(code)
}

// ── Token exchange ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
}

async fn exchange_code(
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<TokenResponse, String> {
    let params = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("client_id", CF_CLIENT_ID),
        ("code_verifier", verifier),
    ];

    let resp = http()
        .post(CF_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange request failed: {e}"))?;

    let status = resp.status().as_u16();
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {e}"))?;

    if status != 200 {
        let msg = body["error_description"]
            .as_str()
            .or_else(|| body["error"].as_str())
            .unwrap_or("Token exchange failed");
        return Err(format!("Cloudflare token error ({status}): {msg}"));
    }

    let access_token = body["access_token"]
        .as_str()
        .ok_or("Missing access_token")?
        .to_string();

    Ok(TokenResponse {
        access_token,
        refresh_token: body["refresh_token"].as_str().map(|s| s.to_string()),
        expires_in: body["expires_in"].as_u64(),
    })
}

async fn refresh_access_token(refresh_token: &str) -> Result<TokenResponse, String> {
    let params = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", CF_CLIENT_ID),
    ];

    let resp = http()
        .post(CF_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Refresh request failed: {e}"))?;

    let status = resp.status().as_u16();
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {e}"))?;

    if status != 200 {
        let msg = body["error_description"]
            .as_str()
            .or_else(|| body["error"].as_str())
            .unwrap_or("Refresh failed");
        return Err(format!("Token refresh error ({status}): {msg}"));
    }

    let access_token = body["access_token"]
        .as_str()
        .ok_or("Missing access_token in refresh response")?
        .to_string();

    Ok(TokenResponse {
        access_token,
        refresh_token: body["refresh_token"].as_str().map(|s| s.to_string()),
        expires_in: body["expires_in"].as_u64(),
    })
}

// ── Fetch user email ──────────────────────────────────────────────────────────

async fn fetch_user_email(access_token: &str) -> Option<String> {
    let resp = http()
        .get("https://api.cloudflare.com/client/v4/user")
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .await
        .ok()?;
    let body: serde_json::Value = resp.json().await.ok()?;
    body["result"]["email"].as_str().map(|s| s.to_string())
}

// ── Token storage helpers ─────────────────────────────────────────────────────

fn store_tokens(
    app: &tauri::AppHandle,
    access: &str,
    refresh: Option<&str>,
    expires_in: Option<u64>,
    email: Option<&str>,
) -> Result<(), String> {
    let mut map = crate::secrets::read_all(app);
    map.insert(KEY_ACCESS.to_string(), access.to_string());
    if let Some(r) = refresh {
        map.insert(KEY_REFRESH.to_string(), r.to_string());
    }
    if let Some(exp) = expires_in {
        let expires_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            + exp
            - 30; // 30s buffer
        map.insert(KEY_EXPIRES.to_string(), expires_at.to_string());
    }
    if let Some(e) = email {
        map.insert(KEY_EMAIL.to_string(), e.to_string());
    }
    crate::secrets::write_all(app, &map)
}

fn clear_tokens(app: &tauri::AppHandle) -> Result<(), String> {
    let mut map = crate::secrets::read_all(app);
    map.remove(KEY_ACCESS);
    map.remove(KEY_REFRESH);
    map.remove(KEY_EXPIRES);
    map.remove(KEY_EMAIL);
    crate::secrets::write_all(app, &map)
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Start the OAuth flow: open browser, wait for callback, exchange code, store tokens.
/// Returns the user's email address on success.
#[tauri::command]
pub async fn cloudflare_start_oauth(app: tauri::AppHandle) -> Result<CfOAuthStatus, String> {
    let (verifier, challenge) = pkce_pair();
    let state = random_base64url(16);

    // Bind one of the pre-registered callback ports (Wrangler-compatible)
    let (listener, redirect_uri) = bind_callback_listener().await?;

    // Build the authorization URL
    let auth_url = format!(
        "{CF_AUTH_URL}?response_type=code&client_id={CF_CLIENT_ID}&redirect_uri={}&scope={}&state={}&code_challenge={}&code_challenge_method=S256",
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(CF_SCOPES),
        state,
        challenge,
    );

    // Open in system browser
    tauri_plugin_opener::open_url(&auth_url, None::<&str>)
        .map_err(|e| format!("Failed to open browser: {e}"))?;

    // Wait for callback (with timeout)
    let code = tokio::time::timeout(
        std::time::Duration::from_secs(AUTH_TIMEOUT_SECS),
        await_oauth_callback(listener, &state),
    )
    .await
    .map_err(|_| "Authorization timed out — please try again.".to_string())??;

    // Exchange code for tokens
    let token = exchange_code(&code, &verifier, &redirect_uri).await?;

    // Fetch user email for display
    let email = fetch_user_email(&token.access_token).await;

    // Persist to keychain
    store_tokens(
        &app,
        &token.access_token,
        token.refresh_token.as_deref(),
        token.expires_in,
        email.as_deref(),
    )?;

    Ok(CfOAuthStatus {
        connected: true,
        email,
    })
}

/// Returns the current OAuth status (connected + email) without side effects.
#[tauri::command]
pub fn cloudflare_oauth_status(app: tauri::AppHandle) -> CfOAuthStatus {
    let map = crate::secrets::read_all(&app);
    let access = map.get(KEY_ACCESS).cloned().unwrap_or_default();
    if access.is_empty() {
        return CfOAuthStatus { connected: false, email: None };
    }
    CfOAuthStatus {
        connected: true,
        email: map.get(KEY_EMAIL).cloned(),
    }
}

/// Return a valid access token, transparently refreshing via the refresh token if needed.
#[tauri::command]
pub async fn cloudflare_get_valid_token(app: tauri::AppHandle) -> Result<String, String> {
    let map = crate::secrets::read_all(&app);
    let access = map.get(KEY_ACCESS).cloned().unwrap_or_default();

    if access.is_empty() {
        return Err("Not connected to Cloudflare — please authorize first.".to_string());
    }

    // Check expiry
    let expires_at = map
        .get(KEY_EXPIRES)
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(u64::MAX);

    if now_secs() < expires_at {
        return Ok(access);
    }

    // Token expired — try to refresh
    let refresh = map.get(KEY_REFRESH).cloned().unwrap_or_default();
    if refresh.is_empty() {
        return Err(
            "Cloudflare session expired. Please re-authorize in the connection dialog.".to_string(),
        );
    }

    let new_token = refresh_access_token(&refresh).await?;
    let email = map.get(KEY_EMAIL).cloned();

    store_tokens(
        &app,
        &new_token.access_token,
        new_token.refresh_token.as_deref().or(Some(&refresh)),
        new_token.expires_in,
        email.as_deref(),
    )?;

    Ok(new_token.access_token)
}

/// Revoke the stored tokens and clear them from the keychain.
#[tauri::command]
pub async fn cloudflare_logout(app: tauri::AppHandle) -> Result<(), String> {
    let map = crate::secrets::read_all(&app);
    let token = map.get(KEY_ACCESS).cloned().unwrap_or_default();

    // Best-effort revoke
    if !token.is_empty() {
        let _ = http()
            .post(CF_REVOKE_URL)
            .form(&[("client_id", CF_CLIENT_ID), ("token", &token)])
            .send()
            .await;
    }

    clear_tokens(&app)
}

// ── Discovery commands (reused from before) ───────────────────────────────────

/// List all Cloudflare accounts accessible with the given API token.
#[tauri::command]
pub async fn cloudflare_list_accounts(api_token: String) -> Result<Vec<CfAccount>, String> {
    let resp = http()
        .get("https://api.cloudflare.com/client/v4/accounts?per_page=50")
        .header("Authorization", format!("Bearer {}", api_token.trim()))
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    let status = resp.status().as_u16();
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    if status == 401 || status == 403 {
        return Err("Invalid or expired token.".to_string());
    }
    if status != 200 {
        let msg = body["errors"]
            .as_array()
            .and_then(|e| e.first())
            .and_then(|e| e["message"].as_str())
            .unwrap_or("Unknown error");
        return Err(format!("Cloudflare error {status}: {msg}"));
    }

    let accounts: Vec<CfAccount> = body["result"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(|a| {
            Some(CfAccount {
                id: a["id"].as_str()?.to_string(),
                name: a["name"].as_str().unwrap_or("Unnamed").to_string(),
            })
        })
        .collect();

    if accounts.is_empty() {
        return Err("No Cloudflare accounts found for this token.".to_string());
    }
    Ok(accounts)
}

/// List all D1 databases for a given Cloudflare account.
#[tauri::command]
pub async fn cloudflare_list_d1_databases(
    api_token: String,
    account_id: String,
) -> Result<Vec<CfD1Database>, String> {
    let url = format!(
        "https://api.cloudflare.com/client/v4/accounts/{}/d1/database?per_page=100",
        account_id.trim()
    );

    let resp = http()
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_token.trim()))
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    let status = resp.status().as_u16();
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    if status == 401 || status == 403 {
        return Err("Token lacks D1:Read permission for this account.".to_string());
    }
    if status != 200 {
        let msg = body["errors"]
            .as_array()
            .and_then(|e| e.first())
            .and_then(|e| e["message"].as_str())
            .unwrap_or("Unknown error");
        return Err(format!("Cloudflare error {status}: {msg}"));
    }

    Ok(body["result"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(|d| {
            Some(CfD1Database {
                uuid: d["uuid"].as_str()?.to_string(),
                name: d["name"].as_str().unwrap_or("Unnamed").to_string(),
                created_at: d["created_at"].as_str().map(|s| s.to_string()),
                num_tables: d["num_tables"].as_u64(),
            })
        })
        .collect())
}
