use std::collections::HashMap;
use tauri::Manager;

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

pub(crate) fn read_all(app: &tauri::AppHandle) -> HashMap<String, String> {
    // 1) Preferred: the OS keychain (encrypted at rest).
    if let Some(entry) = keychain_entry() {
        match entry.get_password() {
            Ok(json) => return parse_map(&json),
            // No keychain entry yet → fall through to migrate any legacy file.
            Err(keyring::Error::NoEntry) => {}
            // Keychain unavailable this session → fall through to the file store.
            Err(_) => {}
        }
    }
    // 2) Legacy plaintext file: read it, migrate into the keychain, remove the
    //    plaintext copy. Also the fallback store when the keychain is absent.
    let path = legacy_path(app);
    let map = std::fs::read_to_string(&path)
        .ok()
        .map(|s| parse_map(&s))
        .unwrap_or_default();
    if !map.is_empty() && write_keychain(&map).is_ok() {
        let _ = std::fs::remove_file(&path);
    }
    map
}

pub(crate) fn write_all(app: &tauri::AppHandle, map: &HashMap<String, String>) -> Result<(), String> {
    // Prefer the keychain; on success make sure no plaintext copy lingers.
    if write_keychain(map).is_ok() {
        let _ = std::fs::remove_file(legacy_path(app));
        return Ok(());
    }
    // Keychain unavailable — fall back to the file so secrets aren't lost.
    let path = legacy_path(app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string(map).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_store_key(app: tauri::AppHandle, profile_id: String, api_key: String) -> Result<(), String> {
    let mut map = read_all(&app);
    if api_key.is_empty() {
        map.remove(&profile_id);
    } else {
        map.insert(profile_id, api_key);
    }
    write_all(&app, &map)
}

#[tauri::command]
pub fn ai_load_key(app: tauri::AppHandle, profile_id: String) -> Result<String, String> {
    Ok(read_all(&app).get(&profile_id).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn ai_delete_key(app: tauri::AppHandle, profile_id: String) -> Result<(), String> {
    let mut map = read_all(&app);
    map.remove(&profile_id);
    write_all(&app, &map)
}
