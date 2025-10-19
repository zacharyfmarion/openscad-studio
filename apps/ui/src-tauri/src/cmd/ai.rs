use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const ANTHROPIC_API_KEY: &str = "anthropic_api_key";
const OPENAI_API_KEY: &str = "openai_api_key";
const AI_PROVIDER: &str = "ai_provider";
const AI_MODEL: &str = "ai_model";

// Use Tauri encrypted store for API key and provider storage
// Simpler than keychain, no permission prompts in dev mode
#[tauri::command]
pub fn store_api_key(app: AppHandle, provider: String, key: String) -> Result<(), String> {
    let store = app
        .store("ai-settings.json")
        .map_err(|e| format!("Failed to access store: {e}"))?;

    let store_key = match provider.as_str() {
        "anthropic" => ANTHROPIC_API_KEY,
        "openai" => OPENAI_API_KEY,
        _ => return Err(format!("Unknown provider: {provider}")),
    };

    store.set(store_key, key);
    store.set(AI_PROVIDER, provider.clone());

    store
        .save()
        .map_err(|e| format!("Failed to save store: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn get_api_key(app: AppHandle) -> Result<String, String> {
    let store = app
        .store("ai-settings.json")
        .map_err(|e| format!("Failed to access store: {e}"))?;

    let provider = store
        .get(AI_PROVIDER)
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "anthropic".to_string());

    let store_key = match provider.as_str() {
        "anthropic" => ANTHROPIC_API_KEY,
        "openai" => OPENAI_API_KEY,
        _ => ANTHROPIC_API_KEY,
    };

    let key = store
        .get(store_key)
        .and_then(|v| v.as_str().map(String::from))
        .ok_or_else(|| {
            format!("No API key found for {provider}. Please set your API key in Settings")
        })?;

    Ok(key)
}

#[tauri::command]
pub fn get_ai_provider(app: AppHandle) -> String {
    if let Ok(store) = app.store("ai-settings.json") {
        if let Some(provider) = store
            .get(AI_PROVIDER)
            .and_then(|v| v.as_str().map(String::from))
        {
            return provider;
        }
    }
    "anthropic".to_string()
}

#[tauri::command]
pub fn clear_api_key(app: AppHandle) -> Result<(), String> {
    let store = app
        .store("ai-settings.json")
        .map_err(|e| format!("Failed to access store: {e}"))?;

    store.delete(ANTHROPIC_API_KEY);
    store.delete(OPENAI_API_KEY);
    store.delete(AI_PROVIDER);
    store
        .save()
        .map_err(|e| format!("Failed to save store: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn has_api_key(app: AppHandle) -> bool {
    if let Ok(store) = app.store("ai-settings.json") {
        let provider = store
            .get(AI_PROVIDER)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "anthropic".to_string());

        let store_key = match provider.as_str() {
            "anthropic" => ANTHROPIC_API_KEY,
            "openai" => OPENAI_API_KEY,
            _ => ANTHROPIC_API_KEY,
        };

        if store.get(store_key).is_some() {
            return true;
        }
    }

    false
}

#[tauri::command]
pub fn get_ai_model(app: AppHandle) -> Result<String, String> {
    // Default to Claude Sonnet 4.5 for best coding experience
    const DEFAULT_MODEL: &str = "claude-sonnet-4-5-20250929";

    let store = app
        .store("ai-settings.json")
        .map_err(|e| format!("Failed to access store: {e}"))?;

    // Check if a model is explicitly stored
    if let Some(stored_model) = store
        .get(AI_MODEL)
        .and_then(|v| v.as_str().map(String::from))
    {
        return Ok(stored_model);
    }

    // No model stored - return default based on provider
    let provider = store
        .get(AI_PROVIDER)
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "anthropic".to_string());

    let default_model = match provider.as_str() {
        "openai" => "gpt-5".to_string(),
        "anthropic" => DEFAULT_MODEL.to_string(),
        _ => DEFAULT_MODEL.to_string(), // Default to Claude Sonnet 4.5 for unknown providers
    };

    Ok(default_model)
}

#[tauri::command]
pub fn set_ai_model(app: AppHandle, model: String) -> Result<(), String> {
    let store = app
        .store("ai-settings.json")
        .map_err(|e| format!("Failed to access store: {e}"))?;

    store.set(AI_MODEL, model);
    store
        .save()
        .map_err(|e| format!("Failed to save store: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn get_available_providers(app: AppHandle) -> Vec<String> {
    let mut providers = Vec::new();

    if let Ok(store) = app.store("ai-settings.json") {
        // Check for Anthropic key
        if store.get(ANTHROPIC_API_KEY).is_some() {
            providers.push("anthropic".to_string());
        }

        // Check for OpenAI key
        if store.get(OPENAI_API_KEY).is_some() {
            providers.push("openai".to_string());
        }
    }

    providers
}

/// Get API key for a specific provider (used by AI agent)
pub fn get_api_key_for_provider(app: AppHandle, provider: &str) -> Result<String, String> {
    let store = app
        .store("ai-settings.json")
        .map_err(|e| format!("Failed to access store: {e}"))?;

    let store_key = match provider {
        "anthropic" => ANTHROPIC_API_KEY,
        "openai" => OPENAI_API_KEY,
        _ => return Err(format!("Unknown provider: {provider}")),
    };

    let key = store
        .get(store_key)
        .and_then(|v| v.as_str().map(String::from))
        .ok_or_else(|| {
            format!("No API key found for {provider}. Please set your API key in Settings")
        })?;

    Ok(key)
}
