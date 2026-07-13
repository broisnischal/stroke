/*!
 * Database provider adapters — sign in to a hosting provider (Neon, Supabase,
 * PlanetScale, Prisma Postgres) with OAuth, list every database on the account,
 * and connect in one click without hunting for connection strings.
 *
 * Design: this module owns the shared OAuth 2.0 + PKCE machinery (mirrors
 * `cloudflare.rs`, kept separate so the working D1 flow is untouched) and
 * dispatches provider-specific work — listing databases, building a connectable
 * spec — to the per-provider submodules via a `Provider` enum. Every provider is
 * a *public* PKCE client: no client secret is shipped in the binary.
 *
 * Adding a provider = add an enum variant, its `OAuthConfig`, and a submodule
 * with `list_databases()` + `build_connection()`.
 */

mod neon;
mod planetscale;
mod prisma;
mod supabase;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::OnceLock;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

// ── How long to wait for the user to authorize before giving up ────────────────
const AUTH_TIMEOUT_SECS: u64 = 300;

// Localhost callback ports Stroke registers as redirect URIs on each provider's
// OAuth app: http://localhost:{port}/oauth/callback. Any one that is free is used.
const CALLBACK_PORTS: &[u16] = &[8989, 8990, 8991, 8992, 8993];

// Token-exchange proxy. Neon/Supabase/PlanetScale are confidential OAuth clients
// whose token endpoint requires a client_secret — which must never ship in a
// desktop binary. The stroke-web app (TanStack Start on Cloudflare Workers)
// hosts a server route that holds the secrets, injects them server-side, and
// forwards to the real provider token endpoint. The app sends only the public
// client_id + PKCE verifier. See stroke-web: src/routes/api/oauth/token.ts.
const TOKEN_PROXY: &str = "https://stroke.click/api/oauth/token";

// Lets the frontend abort an in-flight OAuth wait (Cancel button). Notifying it
// drops the callback listener future, which frees the localhost port instead of
// holding it until the 5-minute timeout.
static OAUTH_CANCEL: OnceLock<tokio::sync::Notify> = OnceLock::new();
fn oauth_cancel() -> &'static tokio::sync::Notify {
    OAUTH_CANCEL.get_or_init(tokio::sync::Notify::new)
}

// ── Provider registry ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    Neon,
    Supabase,
    PlanetScale,
    Prisma,
}

impl Provider {
    fn parse(s: &str) -> Result<Self, String> {
        match s {
            "neon" => Ok(Self::Neon),
            "supabase" => Ok(Self::Supabase),
            "planetscale" => Ok(Self::PlanetScale),
            "prisma" => Ok(Self::Prisma),
            other => Err(format!("Unknown provider: {other}")),
        }
    }

    /// Stable key used to namespace stored tokens (`__{key}_refresh__`, …).
    fn key(&self) -> &'static str {
        match self {
            Self::Neon => "neon",
            Self::Supabase => "supabase",
            Self::PlanetScale => "planetscale",
            Self::Prisma => "prisma",
        }
    }

    fn oauth(&self) -> OAuthConfig {
        match self {
            Self::Neon => neon::OAUTH,
            Self::Supabase => supabase::OAUTH,
            Self::PlanetScale => planetscale::OAUTH,
            Self::Prisma => prisma::OAUTH,
        }
    }

    /// Whether a provider uses a pasted API token instead of the browser OAuth
    /// dance. None currently do (Prisma moved to Management-API OAuth), but the
    /// hook stays so a future token-only provider can opt in.
    fn is_token_based(&self) -> bool {
        false
    }

    /// Localhost callback ports to try, in order. PlanetScale accepts only ONE
    /// registered redirect URI, so it must always land on a fixed port (8989) or
    /// the redirect_uri won't match. Providers that allow multiple registered
    /// redirects use the full range so a busy port can fall back.
    fn callback_ports(&self) -> &'static [u16] {
        match self {
            Self::PlanetScale => &[8989],
            _ => CALLBACK_PORTS,
        }
    }

    /// Whether the provider's authorize/token endpoints support PKCE. PlanetScale
    /// does NOT — sending code_challenge makes it reject the request — so it uses
    /// a plain confidential authorization-code flow (secret only, via the proxy).
    fn uses_pkce(&self) -> bool {
        !matches!(self, Self::PlanetScale)
    }

    /// Public PKCE clients ship no secret, so the token exchange goes DIRECTLY to
    /// the provider (no stroke.click proxy). Neon reuses neonctl's public client.
    fn is_public_client(&self) -> bool {
        matches!(self, Self::Neon)
    }

    /// The loopback redirect URI. Most providers registered
    /// `http://localhost:{port}/oauth/callback`; Neon reuses neonctl's client,
    /// which registered `http://127.0.0.1:{port}/callback`.
    fn redirect_uri(&self, port: u16) -> String {
        match self {
            Self::Neon => format!("http://127.0.0.1:{port}/callback"),
            _ => format!("http://localhost:{port}/oauth/callback"),
        }
    }

    async fn list_databases(&self, token: &str) -> Result<Vec<ProviderDatabase>, String> {
        match self {
            Self::Neon => neon::list_databases(token).await,
            Self::Supabase => supabase::list_databases(token).await,
            Self::PlanetScale => planetscale::list_databases(token).await,
            Self::Prisma => prisma::list_databases(token).await,
        }
    }

    async fn build_connection(
        &self,
        token: &str,
        db_ref: &str,
    ) -> Result<ProviderConnection, String> {
        match self {
            Self::Neon => neon::build_connection(token, db_ref).await,
            Self::Supabase => supabase::build_connection(token, db_ref).await,
            Self::PlanetScale => planetscale::build_connection(token, db_ref).await,
            Self::Prisma => prisma::build_connection(token, db_ref).await,
        }
    }
}

/// Per-provider OAuth endpoints. `client_id` is a public identifier registered
/// with the provider; there is intentionally no secret (public PKCE client).
#[derive(Clone, Copy)]
pub struct OAuthConfig {
    pub client_id: &'static str,
    pub auth_url: &'static str,
    // Kept for documentation/parity; the real exchange happens in the proxy.
    #[allow(dead_code)]
    pub token_url: &'static str,
    pub scopes: &'static str,
}

// ── Shared types returned to the frontend ───────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProviderDatabase {
    /// Opaque reference (often JSON) consumed by `build_connection`.
    pub db_ref: String,
    pub name: String,
    pub region: Option<String>,
    /// Kind label shown in the UI, e.g. "Project", "Branch", "Database".
    pub kind: Option<String>,
    /// Host preview for the list row, when cheaply available.
    pub host: Option<String>,
}

/// Everything the frontend needs to construct a `SavedConnection` and connect.
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ProviderConnection {
    pub db_type: String, // "postgres" | "mysql"
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub database: String,
    pub ssl: bool,
    /// True when the provider will not expose a password (Supabase). The UI must
    /// prompt the user for it; every other field is prefilled.
    pub needs_password: bool,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProviderOAuthStatus {
    pub connected: bool,
    pub email: Option<String>,
}

// ── Shared HTTP client ──────────────────────────────────────────────────────────

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

pub(crate) fn http() -> &'static reqwest::Client {
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("stroke/1.0")
            .tcp_keepalive(std::time::Duration::from_secs(60))
            .pool_max_idle_per_host(4)
            .build()
            .expect("failed to build provider HTTP client")
    })
}

// ── PKCE helpers ─────────────────────────────────────────────────────────────────

fn random_base64url(n: usize) -> String {
    let mut bytes = vec![0u8; n];
    getrandom::getrandom(&mut bytes).expect("getrandom failed");
    URL_SAFE_NO_PAD.encode(&bytes)
}

/// (verifier, challenge) where challenge = BASE64URL(SHA256(verifier)).
fn pkce_pair() -> (String, String) {
    let verifier = random_base64url(32);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

// ── Local callback server ────────────────────────────────────────────────────────

async fn bind_callback_listener(ports: &[u16]) -> Result<(TcpListener, u16), String> {
    for &port in ports {
        if let Ok(listener) = TcpListener::bind(format!("127.0.0.1:{port}")).await {
            return Ok((listener, port));
        }
    }
    if ports.len() == 1 {
        return Err(format!(
            "Port {} is in use — this provider requires that exact port for its OAuth redirect. \
             Close whatever is using it (another Stroke window or dev server) and retry.",
            ports[0]
        ));
    }
    Err(format!(
        "Could not bind any callback port ({}-{}). Close other apps using them and retry.",
        ports[0],
        ports[ports.len() - 1]
    ))
}

const OK_HTML: &str = r#"<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Stroke — authorized</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0d0d0d;color:#eee}
.card{text-align:center;padding:48px;border-radius:16px;border:1px solid #333;background:#111}h2{color:#22c55e;margin-bottom:12px}p{color:#888;margin:0}</style></head>
<body><div class="card"><h2>Authorization successful</h2><p>You can close this tab and return to Stroke.</p></div></body></html>"#;

const ERR_HTML: &str = r#"<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Stroke — error</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0d0d0d;color:#eee}
.card{text-align:center;padding:48px;border-radius:16px;border:1px solid #4b1c1c;background:#1a0f0f}h2{color:#ef4444;margin-bottom:12px}p{color:#888;margin:0}</style></head>
<body><div class="card"><h2>Authorization failed</h2><p>You can close this tab and try again in Stroke.</p></div></body></html>"#;

/// Wait for one OAuth redirect and return the authorization code.
async fn await_oauth_callback(listener: TcpListener, expected_state: &str) -> Result<String, String> {
    let send = |html: &str| {
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

    let first_line = req.lines().next().unwrap_or("");
    let query = first_line
        .split_whitespace()
        .nth(1)
        .unwrap_or("")
        .split('?')
        .nth(1)
        .unwrap_or("");

    let (mut code, mut state, mut error) = (None, None, None);
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
            "error_description" if error.is_none() => error = Some(val),
            _ => {}
        }
    }

    if let Some(err) = error {
        let _ = stream.write_all(send(ERR_HTML).as_bytes()).await;
        return Err(format!("Provider denied authorization: {err}"));
    }
    let code = match code {
        Some(c) if !c.is_empty() => c,
        _ => {
            let _ = stream.write_all(send(ERR_HTML).as_bytes()).await;
            return Err("No authorization code in callback".into());
        }
    };
    if state.as_deref() != Some(expected_state) {
        let _ = stream.write_all(send(ERR_HTML).as_bytes()).await;
        return Err("OAuth state mismatch — possible CSRF".into());
    }

    let _ = stream.write_all(send(OK_HTML).as_bytes()).await;
    let _ = stream.flush().await;
    Ok(code)
}

// ── Token exchange / refresh ─────────────────────────────────────────────────────

struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
}

/// POST a token request to `url` — either the real provider token endpoint
/// (public clients) or the stroke.click proxy (confidential clients, where the
/// proxy injects the secret and `params` includes `provider`).
async fn post_token(url: &str, params: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let resp = http()
        .post(url)
        .form(params)
        .send()
        .await
        .map_err(|e| format!("Token request failed: {e}"))?;
    let status = resp.status().as_u16();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Token request failed: {e}"))?;
    // A non-JSON body from the proxy usually means it isn't deployed (the request
    // hit the marketing site's HTML). Surface that clearly.
    let body: serde_json::Value = serde_json::from_str(&text).map_err(|_| {
        let snippet: String = text.chars().take(160).collect();
        let hint = if url == TOKEN_PROXY {
            " (is the stroke.click/api/oauth/token proxy deployed?)"
        } else {
            ""
        };
        format!("Token exchange returned a non-JSON response (HTTP {status}){hint}: {snippet}")
    })?;
    if status != 200 {
        let msg = body["error_description"]
            .as_str()
            .or_else(|| body["error"].as_str())
            .unwrap_or("Token request failed");
        return Err(format!("OAuth token error ({status}): {msg}"));
    }
    Ok(TokenResponse {
        access_token: body["access_token"]
            .as_str()
            .ok_or("Missing access_token")?
            .to_string(),
        refresh_token: body["refresh_token"].as_str().map(String::from),
        expires_in: body["expires_in"].as_u64(),
    })
}

async fn exchange_code(
    cfg: &OAuthConfig,
    provider_key: &str,
    is_public: bool,
    code: &str,
    verifier: Option<&str>,
    redirect_uri: &str,
) -> Result<TokenResponse, String> {
    let mut params = vec![
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("client_id", cfg.client_id),
    ];
    if let Some(v) = verifier {
        params.push(("code_verifier", v));
    }
    if is_public {
        // Direct to the provider — no secret, no proxy.
        post_token(cfg.token_url, &params).await
    } else {
        // Via the proxy, which injects the client_secret.
        params.insert(0, ("provider", provider_key));
        post_token(TOKEN_PROXY, &params).await
    }
}

async fn refresh_token(
    cfg: &OAuthConfig,
    provider_key: &str,
    is_public: bool,
    refresh: &str,
) -> Result<TokenResponse, String> {
    let mut params = vec![
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh),
        ("client_id", cfg.client_id),
    ];
    if is_public {
        post_token(cfg.token_url, &params).await
    } else {
        params.insert(0, ("provider", provider_key));
        post_token(TOKEN_PROXY, &params).await
    }
}

// ── Token storage (namespaced per provider in the secrets store) ─────────────────

fn store_tokens(
    app: &tauri::AppHandle,
    p: Provider,
    access: &str,
    refresh: Option<&str>,
    expires_in: Option<u64>,
    email: Option<&str>,
) -> Result<(), String> {
    let k = p.key();
    let mut map = crate::secrets::read_all(app);
    map.insert(format!("__{k}_access__"), access.to_string());
    if let Some(r) = refresh {
        map.insert(format!("__{k}_refresh__"), r.to_string());
    }
    if let Some(exp) = expires_in {
        map.insert(format!("__{k}_expires__"), (now_secs() + exp - 30).to_string());
    }
    if let Some(e) = email {
        map.insert(format!("__{k}_email__"), e.to_string());
    }
    crate::secrets::write_all(app, &map)
}

fn clear_tokens(app: &tauri::AppHandle, p: Provider) -> Result<(), String> {
    let k = p.key();
    let mut map = crate::secrets::read_all(app);
    for suffix in ["access", "refresh", "expires", "email"] {
        map.remove(&format!("__{k}_{suffix}__"));
    }
    crate::secrets::write_all(app, &map)
}

/// A valid access token, refreshing transparently if the stored one expired.
/// For token-based providers, the "access token" is the pasted API key.
async fn valid_token(app: &tauri::AppHandle, p: Provider) -> Result<String, String> {
    let k = p.key();
    let map = crate::secrets::read_all(app);
    let access = map
        .get(&format!("__{k}_access__"))
        .cloned()
        .ok_or("Not signed in to this provider")?;

    if p.is_token_based() {
        return Ok(access);
    }

    // Missing expiry => assume the token is long-lived and valid, mirroring the
    // Cloudflare flow (`unwrap_or(u64::MAX)`). A `0` default treated every such
    // token as already expired and forced a needless re-login on every call —
    // the main cause of "it asks me to sign in again each day".
    let expires = map
        .get(&format!("__{k}_expires__"))
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(u64::MAX);
    if now_secs() < expires {
        return Ok(access);
    }

    // Past the stored expiry: try to renew silently with the refresh token. If we
    // can't — no refresh token, or the refresh call fails (e.g. a transient proxy
    // hiccup) — fall back to the existing access token instead of forcing a
    // re-login. The downstream API call is the real arbiter: a genuinely dead
    // token surfaces a clear auth error there (and the UI offers reconnect), while
    // a still-valid or barely-past-buffer token keeps working. This favours long
    // session persistence over eager sign-out.
    let refresh = match map.get(&format!("__{k}_refresh__")).cloned() {
        Some(r) => r,
        None => return Ok(access),
    };
    let cfg = p.oauth();
    match refresh_token(&cfg, p.key(), p.is_public_client(), &refresh).await {
        Ok(t) => {
            store_tokens(
                app,
                p,
                &t.access_token,
                t.refresh_token.as_deref().or(Some(&refresh)),
                t.expires_in,
                None,
            )?;
            Ok(t.access_token)
        }
        Err(_) => Ok(access),
    }
}

// ── Tauri commands ───────────────────────────────────────────────────────────────

/// Start the browser OAuth flow for a provider and store the resulting tokens.
#[tauri::command]
pub async fn provider_start_oauth(
    app: tauri::AppHandle,
    provider: String,
) -> Result<ProviderOAuthStatus, String> {
    let p = Provider::parse(&provider)?;
    if p.is_token_based() {
        return Err("This provider uses an API token, not OAuth".into());
    }
    let cfg = p.oauth();
    let (verifier, challenge) = pkce_pair();
    let state = random_base64url(16);

    // Abort any prior in-flight OAuth wait (e.g. a sign-in the user abandoned in
    // the browser) so its callback listener is dropped and the port is freed
    // before we bind. Otherwise a stuck flow holding 8989 forces this one onto a
    // different port, which won't match the redirect URI registered with the
    // provider ("Invalid Redirect URI"). The short pause lets the listener drop.
    oauth_cancel().notify_waiters();
    tokio::time::sleep(std::time::Duration::from_millis(150)).await;

    let (listener, port) = bind_callback_listener(p.callback_ports()).await?;
    let redirect_uri = p.redirect_uri(port);

    // Only include &scope= when the provider uses request-time scopes.
    let scope_param = if cfg.scopes.is_empty() {
        String::new()
    } else {
        format!("&scope={}", urlencoding::encode(cfg.scopes))
    };
    // Only include PKCE params for providers that support it (PlanetScale doesn't).
    let pkce_param = if p.uses_pkce() {
        format!("&code_challenge={}&code_challenge_method=S256", urlencoding::encode(&challenge))
    } else {
        String::new()
    };
    let auth_url = format!(
        "{}?response_type=code&client_id={}&redirect_uri={}{}&state={}{}",
        cfg.auth_url,
        urlencoding::encode(cfg.client_id),
        urlencoding::encode(&redirect_uri),
        scope_param,
        urlencoding::encode(&state),
        pkce_param,
    );

    eprintln!("[provider oauth] {} authorize URL: {auth_url}", p.key());
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_url(auth_url, None::<&str>)
        .map_err(|e| format!("Could not open browser: {e}"))?;

    // Register the cancel waiter BEFORE awaiting so a Cancel click can't slip
    // through between opening the browser and starting to wait.
    let cancelled = oauth_cancel().notified();
    let code = tokio::select! {
        r = tokio::time::timeout(
            std::time::Duration::from_secs(AUTH_TIMEOUT_SECS),
            await_oauth_callback(listener, &state),
        ) => r.map_err(|_| "Authorization timed out".to_string())??,
        // Dropping the other branch's future here drops `listener` → port freed.
        _ = cancelled => return Err("cancelled".to_string()),
    };

    let verifier_opt = if p.uses_pkce() { Some(verifier.as_str()) } else { None };
    let t = exchange_code(&cfg, p.key(), p.is_public_client(), &code, verifier_opt, &redirect_uri).await?;
    store_tokens(
        &app,
        p,
        &t.access_token,
        t.refresh_token.as_deref(),
        t.expires_in,
        None,
    )?;

    Ok(ProviderOAuthStatus {
        connected: true,
        email: None,
    })
}

/// Abort an in-flight OAuth wait (Cancel button) — frees the callback port.
#[tauri::command]
pub fn provider_cancel_oauth() {
    oauth_cancel().notify_waiters();
}

/// Store a pasted API token for a token-based provider (e.g. Prisma).
#[tauri::command]
pub fn provider_store_token(
    app: tauri::AppHandle,
    provider: String,
    token: String,
) -> Result<(), String> {
    let p = Provider::parse(&provider)?;
    if token.trim().is_empty() {
        return clear_tokens(&app, p);
    }
    store_tokens(&app, p, token.trim(), None, None, None)
}

#[tauri::command]
pub fn provider_oauth_status(
    app: tauri::AppHandle,
    provider: String,
) -> Result<ProviderOAuthStatus, String> {
    let p = Provider::parse(&provider)?;
    let map = crate::secrets::read_all(&app);
    let k = p.key();
    Ok(ProviderOAuthStatus {
        connected: map.contains_key(&format!("__{k}_access__")),
        email: map.get(&format!("__{k}_email__")).cloned(),
    })
}

#[tauri::command]
pub fn provider_logout(app: tauri::AppHandle, provider: String) -> Result<(), String> {
    clear_tokens(&app, Provider::parse(&provider)?)
}

#[tauri::command]
pub async fn provider_list_databases(
    app: tauri::AppHandle,
    provider: String,
) -> Result<Vec<ProviderDatabase>, String> {
    let p = Provider::parse(&provider)?;
    let token = valid_token(&app, p).await?;
    p.list_databases(&token).await
}

#[tauri::command]
pub async fn provider_build_connection(
    app: tauri::AppHandle,
    provider: String,
    db_ref: String,
) -> Result<ProviderConnection, String> {
    let p = Provider::parse(&provider)?;
    let token = valid_token(&app, p).await?;
    p.build_connection(&token, &db_ref).await
}
