/*!
 * Supabase adapter - sign in via the Management API (OAuth2 + PKCE) and list
 * every project. The database password is never exposed by the API for security,
 * so `build_connection` prefills host/port/user/database and sets
 * `needs_password = true`; the UI prompts for the password once.
 */

use super::{http, OAuthConfig, ProviderConnection, ProviderDatabase};
use serde_json::Value;

pub const OAUTH: OAuthConfig = OAuthConfig {
    // Public client_id (safe to embed). The client SECRET is held only by the
    // stroke.click proxy as SUPABASE_CLIENT_SECRET - never in this binary.
    client_id: "77c997a8-fd73-4eff-8b6b-1123182ef16a",
    auth_url: "https://api.supabase.com/v1/oauth/authorize",
    // token_url is used by the proxy, not the app (the app posts to TOKEN_PROXY).
    token_url: "https://api.supabase.com/v1/oauth/token",
    scopes: "all",
};

const API: &str = "https://api.supabase.com/v1";

async fn get(token: &str, path: &str) -> Result<Value, String> {
    let resp = http()
        .get(format!("{API}{path}"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("Supabase request failed: {e}"))?;
    let status = resp.status().as_u16();
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Supabase: bad JSON: {e}"))?;
    if status != 200 {
        let msg = body["message"].as_str().unwrap_or("request failed");
        return Err(format!("Supabase API error ({status}): {msg}"));
    }
    Ok(body)
}

pub async fn list_databases(token: &str) -> Result<Vec<ProviderDatabase>, String> {
    // /v1/projects returns a top-level array.
    let body = get(token, "/projects").await?;
    Ok(body
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|p| {
            let id = p["id"].as_str()?; // project ref
            Some(ProviderDatabase {
                db_ref: id.to_string(),
                name: p["name"].as_str().unwrap_or(id).to_string(),
                region: p["region"].as_str().map(String::from),
                kind: Some("Project".into()),
                host: p["database"]["host"].as_str().map(String::from),
            })
        })
        .collect())
}

pub async fn build_connection(token: &str, project_ref: &str) -> Result<ProviderConnection, String> {
    let proj = get(token, &format!("/projects/{project_ref}")).await?;
    let name = proj["name"].as_str().unwrap_or(project_ref);

    // Use the Supavisor pooler, NOT the direct host. The direct connection
    // `db.<ref>.supabase.co:5432` is IPv6-only, so it fails with "network
    // unreachable" on the many networks without IPv6. The shared pooler is
    // IPv4-compatible on every tier. Its username embeds the project ref
    // (`postgres.<ref>`), and session mode (port 5432) behaves like a normal
    // Postgres connection - the right choice for a GUI client.
    //
    // Ask the Management API for the exact pooler host - never guess the region
    // prefix (aws-0 vs aws-1), since a wrong host connects to a pooler node that
    // doesn't host this project's tenant → "tenant/user … not found".
    let pooler = get(token, &format!("/projects/{project_ref}/config/database/pooler"))
        .await
        .map_err(|e| {
            if e.contains("scope") || e.contains("403") {
                "Your Supabase OAuth app is missing the \"Database Pooling Config: Read\" scope, \
                 which Stroke needs to find the correct pooler host. Fix: in the Supabase \
                 dashboard open your OAuth app → Scopes → enable Database Pooling Config (Read) \
                 (enabling all Read scopes is fine), save, then Disconnect here and sign in again \
                 to re-authorize."
                    .to_string()
            } else {
                format!("Couldn't fetch Supabase pooler config (needed for a working host): {e}")
            }
        })?;
    let obj = pooler.as_array().and_then(|a| a.first()).unwrap_or(&pooler);

    let mut host = String::new();
    let mut user = format!("postgres.{project_ref}");
    // The connection_string carries the exact pooler host + tenant user - parse it.
    if let Some(cs) = obj["connection_string"].as_str().or_else(|| obj["connectionString"].as_str()) {
        if let Ok((h, _p, u, _pw, _d)) = super::neon::parse_pg_uri(cs) {
            if !h.is_empty() {
                host = h;
            }
            if !u.is_empty() {
                user = u;
            }
        }
    }
    if host.is_empty() {
        if let Some(h) = obj["db_host"].as_str() {
            host = h.to_string();
        }
    }
    if let Some(u) = obj["db_user"].as_str() {
        if !u.is_empty() {
            user = u.to_string();
        }
    }
    if host.is_empty() {
        let shape: String = serde_json::to_string(obj).unwrap_or_default().chars().take(400).collect();
        return Err(format!(
            "Supabase didn't return a pooler host for this project. Pooler config: {shape}"
        ));
    }

    Ok(ProviderConnection {
        db_type: "postgres".into(),
        host,
        port: 5432, // session mode - normal Postgres semantics, best for a GUI
        username: user,
        password: String::new(),
        database: "postgres".into(),
        ssl: true,
        needs_password: true, // Supabase never returns the DB password
        name: format!("Supabase · {name}"),
    })
}
