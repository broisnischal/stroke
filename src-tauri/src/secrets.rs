use std::collections::HashMap;
use tauri::Manager;

fn keys_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .expect("app data dir not found")
        .join("ai-keys.json")
}

fn read_all(app: &tauri::AppHandle) -> HashMap<String, String> {
    let path = keys_path(app);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<HashMap<String, String>>(&s).ok())
        .unwrap_or_default()
}

fn write_all(app: &tauri::AppHandle, map: &HashMap<String, String>) -> Result<(), String> {
    let path = keys_path(app);
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
