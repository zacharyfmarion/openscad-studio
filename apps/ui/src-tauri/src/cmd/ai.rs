use keyring::Entry;

const SERVICE_NAME: &str = "openscad-copilot";
const KEY_NAME: &str = "anthropic-api-key";

#[tauri::command]
pub fn store_api_key(key: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, KEY_NAME)
        .map_err(|e| format!("Keyring error: {}", e))?;

    entry
        .set_password(&key)
        .map_err(|e| format!("Failed to store API key: {}", e))
}

#[tauri::command]
pub fn get_api_key() -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, KEY_NAME)
        .map_err(|e| format!("Keyring error: {}", e))?;

    entry
        .get_password()
        .map_err(|e| format!("No API key found. Please set your Anthropic API key in Settings: {}", e))
}

#[tauri::command]
pub fn clear_api_key() -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, KEY_NAME)
        .map_err(|e| format!("Keyring error: {}", e))?;

    entry
        .delete_password()
        .map_err(|e| format!("Failed to clear API key: {}", e))
}

#[tauri::command]
pub fn has_api_key() -> bool {
    match Entry::new(SERVICE_NAME, KEY_NAME) {
        Ok(entry) => entry.get_password().is_ok(),
        Err(_) => false,
    }
}
