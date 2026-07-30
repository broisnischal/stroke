use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

// Session cache: once loaded (or written) it is authoritative for the process,
// so a value is always readable immediately after it is stored — even if the OS
// keychain read-back is flaky, unavailable, or (mis)configured as the mock store.
// Durable persistence still goes to the keychain/file below; this only guarantees
// read-after-write within a run.
static CACHE: OnceLock<Mutex<Option<HashMap<String, String>>>> = OnceLock::new();
fn cache() -> &'static Mutex<Option<HashMap<String, String>>> {
    CACHE.get_or_init(|| Mutex::new(None))
}

// All secrets (AI keys, provider OAuth tokens, Cloudflare tokens) live in a
// single JSON blob stored in the OS keychain — macOS Keychain, Windows
// Credential Manager, or Linux Secret Service. A legacy plaintext file
// (`ai-keys.json`) is migrated in on first read and then deleted; it also
// remains the fallback store if the keychain is unavailable, so credentials are
// never lost or unreadable.
const KEYCHAIN_SERVICE: &str = "app.stroke.desktop";
const KEYCHAIN_ACCOUNT: &str = "secrets-vault";

fn legacy_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .expect("app data dir not found")
        .join("ai-keys.json")
}

fn keychain_entry() -> Option<keyring::Entry> {
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).ok()
}

fn parse_map(s: &str) -> HashMap<String, String> {
    serde_json::from_str::<HashMap<String, String>>(s).unwrap_or_default()
}

fn write_keychain(map: &HashMap<String, String>) -> Result<(), String> {
    let entry = keychain_entry().ok_or_else(|| "keychain unavailable".to_string())?;
    let json = serde_json::to_string(map).map_err(|e| e.to_string())?;
    entry.set_password(&json).map_err(|e| e.to_string())
}

/// Read the keychain back and confirm it holds exactly what we intended to store.
/// This is what makes a silently-non-persisting backend (e.g. keyring's mock
/// store) detectable: a write can "succeed" yet not round-trip, in which case we
/// must keep the plaintext file rather than delete it and lose the data.
fn keychain_holds(expected: &HashMap<String, String>) -> bool {
    keychain_entry()
        .and_then(|e| e.get_password().ok())
        .map(|json| parse_map(&json) == *expected)
        .unwrap_or(false)
}

/// Load the durable store: keychain first (encrypted at rest), then the legacy
/// plaintext file, migrating the file into the keychain when that round-trips.
fn load_durable(app: &tauri::AppHandle) -> HashMap<String, String> {
    if let Some(entry) = keychain_entry() {
        if let Ok(json) = entry.get_password() {
            let map = parse_map(&json);
            if !map.is_empty() {
                return map;
            }
        }
    }
    // Legacy plaintext file: the fallback store, and the pre-keychain format.
    let path = legacy_path(app);
    let map = std::fs::read_to_string(&path)
        .ok()
        .map(|s| parse_map(&s))
        .unwrap_or_default();
    // Migrate into the keychain only if it verifiably persisted; otherwise leave
    // the file exactly where it is.
    if !map.is_empty() && write_keychain(&map).is_ok() && keychain_holds(&map) {
        let _ = std::fs::remove_file(&path);
    }
    map
}

pub(crate) fn read_all(app: &tauri::AppHandle) -> HashMap<String, String> {
    let mut guard = cache().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(map) = guard.as_ref() {
        return map.clone();
    }
    let map = load_durable(app);
    *guard = Some(map.clone());
    map
}

pub(crate) fn write_all(app: &tauri::AppHandle, map: &HashMap<String, String>) -> Result<(), String> {
    // Session cache is authoritative first, so reads right after this always see
    // the new value regardless of what the durable backend does.
    *cache().lock().unwrap_or_else(|e| e.into_inner()) = Some(map.clone());

    // Prefer the keychain, but only trust it — and drop the plaintext copy — once
    // a read-back proves the data actually persisted.
    if write_keychain(map).is_ok() && keychain_holds(map) {
        let _ = std::fs::remove_file(legacy_path(app));
        return Ok(());
    }
    // Keychain missing, mock, or not round-tripping — persist to the file so
    // secrets survive a restart.
    let path = legacy_path(app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string(map).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

// ── Keychain access must never run on the caller's thread ────────────────────
//
// A keychain call blocks for an unbounded time: the first one of a run can put
// the OS "<app> wants to use your confidential information" prompt on screen and
// only returns once the user answers it. Tauri runs a command *without* `async`
// on the main thread (see "Async Commands" in the Tauri docs), and blocking the
// main thread stalls the event loop — the window stops compositing and shows an
// unpainted surface (pure white) for as long as the prompt is up. Inside an
// async command the same call instead parks a runtime worker, stalling unrelated
// queries.
//
// So every path that can reach the keychain goes through `read_all_async` /
// `write_all_async`, which move the blocking work to the dedicated blocking
// pool. The sync `read_all`/`write_all` stay for use *inside* those closures.
async fn off_thread<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())
}

pub(crate) async fn read_all_async(app: &tauri::AppHandle) -> HashMap<String, String> {
    let app = app.clone();
    // A join error here means the closure panicked; an empty vault is the same
    // answer callers already handle for "nothing stored yet".
    off_thread(move || read_all(&app)).await.unwrap_or_default()
}

pub(crate) async fn write_all_async(
    app: &tauri::AppHandle,
    map: HashMap<String, String>,
) -> Result<(), String> {
    let app = app.clone();
    off_thread(move || write_all(&app, &map)).await?
}

#[tauri::command]
pub async fn ai_store_key(
    app: tauri::AppHandle,
    profile_id: String,
    api_key: String,
) -> Result<(), String> {
    // Read and write in one hop so the pair shares a single keychain unlock.
    off_thread(move || {
        let mut map = read_all(&app);
        if api_key.is_empty() {
            map.remove(&profile_id);
        } else {
            map.insert(profile_id, api_key);
        }
        write_all(&app, &map)
    })
    .await?
}

#[tauri::command]
pub async fn ai_load_key(app: tauri::AppHandle, profile_id: String) -> Result<String, String> {
    Ok(read_all_async(&app)
        .await
        .get(&profile_id)
        .cloned()
        .unwrap_or_default())
}

#[tauri::command]
pub async fn ai_delete_key(app: tauri::AppHandle, profile_id: String) -> Result<(), String> {
    off_thread(move || {
        let mut map = read_all(&app);
        map.remove(&profile_id);
        write_all(&app, &map)
    })
    .await?
}
