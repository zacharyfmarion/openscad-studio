use keyring::Entry;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const SERVICE_NAME: &str = "openscad-copilot";
const KEY_NAME: &str = "anthropic-api-key";
const STORE_KEY: &str = "anthropic_api_key";

// Try keychain first, fall back to encrypted store for dev mode
#[tauri::command]
pub fn store_api_key(app: AppHandle, key: String) -> Result<(), String> {
    // Try system keychain first (production)
    match Entry::new(SERVICE_NAME, KEY_NAME) {
        Ok(entry) => {
            if let Ok(()) = entry.set_password(&key) {
                return Ok(());
            }
        }
        Err(_) => {}
    }

    // Fallback to Tauri store (development/unsigned builds)
    println!("[API Key] Keychain unavailable, using encrypted store fallback");
    let store = app
        .store("api-keys.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    store.set(STORE_KEY, key);

    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn get_api_key(app: AppHandle) -> Result<String, String> {
    // Try system keychain first
    if let Ok(entry) = Entry::new(SERVICE_NAME, KEY_NAME) {
        if let Ok(password) = entry.get_password() {
            return Ok(password);
        }
    }

    // Fallback to Tauri store
    let store = app
        .store("api-keys.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    let key = store
        .get(STORE_KEY)
        .and_then(|v| v.as_str().map(String::from))
        .ok_or_else(|| {
            "No API key found. Please set your Anthropic API key in Settings".to_string()
        })?;

    Ok(key)
}

#[tauri::command]
pub fn clear_api_key(app: AppHandle) -> Result<(), String> {
    // Clear from keychain
    if let Ok(entry) = Entry::new(SERVICE_NAME, KEY_NAME) {
        let _ = entry.delete_password();
    }

    // Clear from store
    let store = app
        .store("api-keys.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    store.delete(STORE_KEY);
    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn has_api_key(app: AppHandle) -> bool {
    // Check keychain
    if let Ok(entry) = Entry::new(SERVICE_NAME, KEY_NAME) {
        if entry.get_password().is_ok() {
            return true;
        }
    }

    // Check store
    if let Ok(store) = app.store("api-keys.json") {
        if store.get(STORE_KEY).is_some() {
            return true;
        }
    }

    false
}
