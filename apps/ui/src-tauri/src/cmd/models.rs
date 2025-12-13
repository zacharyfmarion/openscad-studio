use crate::types::{CachedModels, FetchModelsResponse, ModelInfo, ModelValidation};
use serde::Deserialize;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use super::ai::get_api_key_for_provider;

// Cache configuration
const MODELS_CACHE_FILE: &str = "models-cache.json";
const DEFAULT_TTL_HOURS: u32 = 4;

// Default aliases that always work - shown before first fetch
const DEFAULT_ALIASES: &[(&str, &str, &str)] = &[
    ("claude-sonnet-4-5", "Claude Sonnet 4.5 (Latest)", "anthropic"),
    ("claude-opus-4", "Claude Opus 4 (Latest)", "anthropic"),
    ("claude-haiku-3-5", "Claude Haiku 3.5 (Latest)", "anthropic"),
    ("o1", "o1 (Latest)", "openai"),
    ("o3-mini", "o3 Mini (Latest)", "openai"),
    ("gpt-5", "GPT-5 (Latest)", "openai"),
];

// Known model metadata for enrichment
lazy_static::lazy_static! {
    static ref KNOWN_MODELS: HashMap<&'static str, ModelMetadata> = {
        let mut m = HashMap::new();

        // Anthropic aliases
        m.insert("claude-sonnet-4-5", ModelMetadata {
            display_name: "Claude Sonnet 4.5 (Latest)",
            context_window: Some(200_000),
        });
        m.insert("claude-opus-4", ModelMetadata {
            display_name: "Claude Opus 4 (Latest)",
            context_window: Some(200_000),
        });
        m.insert("claude-haiku-3-5", ModelMetadata {
            display_name: "Claude Haiku 3.5 (Latest)",
            context_window: Some(200_000),
        });

        // Anthropic snapshots (common ones)
        m.insert("claude-sonnet-4-5-20250929", ModelMetadata {
            display_name: "Claude Sonnet 4.5 (Sep 2025)",
            context_window: Some(200_000),
        });
        m.insert("claude-opus-4-1-20250805", ModelMetadata {
            display_name: "Claude Opus 4.1 (Aug 2025)",
            context_window: Some(200_000),
        });
        m.insert("claude-3-5-sonnet-20241022", ModelMetadata {
            display_name: "Claude 3.5 Sonnet (Oct 2024)",
            context_window: Some(200_000),
        });
        m.insert("claude-3-5-haiku-20241022", ModelMetadata {
            display_name: "Claude 3.5 Haiku (Oct 2024)",
            context_window: Some(200_000),
        });

        // OpenAI models
        m.insert("gpt-4o", ModelMetadata {
            display_name: "GPT-4o",
            context_window: Some(128_000),
        });
        m.insert("gpt-4o-mini", ModelMetadata {
            display_name: "GPT-4o Mini",
            context_window: Some(128_000),
        });
        m.insert("o1", ModelMetadata {
            display_name: "o1",
            context_window: Some(200_000),
        });
        m.insert("o1-mini", ModelMetadata {
            display_name: "o1 Mini",
            context_window: Some(128_000),
        });
        m.insert("o1-preview", ModelMetadata {
            display_name: "o1 Preview",
            context_window: Some(128_000),
        });
        m.insert("o3-mini", ModelMetadata {
            display_name: "o3 Mini",
            context_window: Some(200_000),
        });
        m.insert("gpt-4-turbo", ModelMetadata {
            display_name: "GPT-4 Turbo",
            context_window: Some(128_000),
        });

        m
    };
}

struct ModelMetadata {
    display_name: &'static str,
    context_window: Option<u32>,
}

// Anthropic API response types
#[derive(Debug, Deserialize)]
struct AnthropicModelsResponse {
    data: Vec<AnthropicModel>,
    has_more: bool,
    #[serde(default)]
    last_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicModel {
    id: String,
    display_name: String,
    created_at: Option<String>,
}

// OpenAI API response types
#[derive(Debug, Deserialize)]
struct OpenAiModelsResponse {
    data: Vec<OpenAiModel>,
}

#[derive(Debug, Deserialize)]
struct OpenAiModel {
    id: String,
    created: Option<i64>,
    #[allow(dead_code)]
    owned_by: Option<String>,
}

fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

fn is_cache_valid(cached: &CachedModels) -> bool {
    let now = current_timestamp();
    let expires_at = cached.fetched_at + (cached.ttl_hours as i64 * 3600);
    now < expires_at
}

fn get_cached_models_for_provider(
    app: &AppHandle,
    provider: &str,
) -> Option<CachedModels> {
    let store = app.store(MODELS_CACHE_FILE).ok()?;
    let value = store.get(provider)?;
    serde_json::from_value(value.clone()).ok()
}

fn save_cached_models(
    app: &AppHandle,
    provider: &str,
    models: &[ModelInfo],
) -> Result<(), String> {
    let store = app
        .store(MODELS_CACHE_FILE)
        .map_err(|e| format!("Failed to access cache store: {e}"))?;

    let cached = CachedModels {
        models: models.to_vec(),
        fetched_at: current_timestamp(),
        ttl_hours: DEFAULT_TTL_HOURS,
    };

    store.set(provider, serde_json::to_value(&cached).unwrap());
    store
        .save()
        .map_err(|e| format!("Failed to save cache: {e}"))?;

    Ok(())
}

fn is_alias(model_id: &str) -> bool {
    // Aliases don't have date suffixes like -20250929
    // Check if the model ID ends with a date pattern
    let parts: Vec<&str> = model_id.split('-').collect();
    if let Some(last) = parts.last() {
        // Date pattern is 8 digits (YYYYMMDD)
        if last.len() == 8 && last.chars().all(|c| c.is_ascii_digit()) {
            return false;
        }
    }
    true
}

fn normalize_anthropic_model(model: AnthropicModel) -> ModelInfo {
    let metadata = KNOWN_MODELS.get(model.id.as_str());

    let display_name = metadata
        .map(|m| m.display_name.to_string())
        .unwrap_or_else(|| model.display_name);

    let context_window = metadata.and_then(|m| m.context_window);

    let created_at = model.created_at.and_then(|s| {
        // Parse RFC 3339 timestamp to Unix timestamp
        chrono::DateTime::parse_from_rfc3339(&s)
            .ok()
            .map(|dt| dt.timestamp())
    });

    ModelInfo {
        id: model.id.clone(),
        display_name,
        provider: "anthropic".to_string(),
        model_type: if is_alias(&model.id) { "alias" } else { "snapshot" }.to_string(),
        context_window,
        created_at,
    }
}

fn normalize_openai_model(model: OpenAiModel) -> ModelInfo {
    let metadata = KNOWN_MODELS.get(model.id.as_str());

    let display_name = metadata
        .map(|m| m.display_name.to_string())
        .unwrap_or_else(|| model.id.clone());

    let context_window = metadata.and_then(|m| m.context_window);

    ModelInfo {
        id: model.id.clone(),
        display_name,
        provider: "openai".to_string(),
        model_type: if is_alias(&model.id) { "alias" } else { "snapshot" }.to_string(),
        context_window,
        created_at: model.created,
    }
}

fn is_relevant_openai_model(model: &OpenAiModel) -> bool {
    let id = &model.id;

    // Exclude models with search or chat in the name
    if id.contains("search") || id.contains("chat") {
        return false;
    }

    // Only include o-series (o1, o3, o4, etc.) and gpt-5 models
    let is_o_series = id.starts_with("o")
        && id.chars().nth(1).map_or(false, |c| c.is_ascii_digit());

    is_o_series || id.starts_with("gpt-5")
}

async fn fetch_anthropic_models(api_key: &str) -> Result<Vec<ModelInfo>, String> {
    let client = reqwest::Client::new();
    let mut all_models = Vec::new();
    let mut after_id: Option<String> = None;

    // Paginate through all models
    loop {
        let mut url = "https://api.anthropic.com/v1/models?limit=100".to_string();
        if let Some(ref id) = after_id {
            url.push_str(&format!("&after_id={}", id));
        }

        let response = client
            .get(&url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Anthropic models: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!(
                "Anthropic API error ({}): {}",
                status,
                body
            ));
        }

        let models_response: AnthropicModelsResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Anthropic response: {e}"))?;

        for model in models_response.data {
            all_models.push(normalize_anthropic_model(model));
        }

        if !models_response.has_more {
            break;
        }

        after_id = models_response.last_id;
    }

    Ok(all_models)
}

async fn fetch_openai_models(api_key: &str) -> Result<Vec<ModelInfo>, String> {
    let client = reqwest::Client::new();

    let response = client
        .get("https://api.openai.com/v1/models")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch OpenAI models: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "OpenAI API error ({}): {}",
            status,
            body
        ));
    }

    let models_response: OpenAiModelsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse OpenAI response: {e}"))?;

    let models: Vec<ModelInfo> = models_response
        .data
        .into_iter()
        .filter(|m| is_relevant_openai_model(m))
        .map(normalize_openai_model)
        .collect();

    Ok(models)
}

fn get_default_aliases(providers: &[String]) -> Vec<ModelInfo> {
    DEFAULT_ALIASES
        .iter()
        .filter(|(_, _, provider)| providers.contains(&provider.to_string()))
        .map(|(id, name, provider)| ModelInfo {
            id: id.to_string(),
            display_name: name.to_string(),
            provider: provider.to_string(),
            model_type: "alias".to_string(),
            context_window: KNOWN_MODELS.get(*id).and_then(|m| m.context_window),
            created_at: None,
        })
        .collect()
}

#[tauri::command]
pub async fn fetch_models(
    app: AppHandle,
    force_refresh: bool,
) -> Result<FetchModelsResponse, String> {
    let available_providers = super::ai::get_available_providers(app.clone());

    if available_providers.is_empty() {
        // No API keys configured - return empty list
        return Ok(FetchModelsResponse {
            models: Vec::new(),
            from_cache: false,
            cache_age_minutes: None,
        });
    }

    let mut all_models = Vec::new();
    let mut any_from_cache = false;
    let mut oldest_cache_age: Option<u64> = None;

    for provider in &available_providers {
        // Check cache first (unless force_refresh)
        if !force_refresh {
            if let Some(cached) = get_cached_models_for_provider(&app, provider) {
                if is_cache_valid(&cached) {
                    let age_minutes = ((current_timestamp() - cached.fetched_at) / 60) as u64;
                    oldest_cache_age = Some(oldest_cache_age.map_or(age_minutes, |a| a.max(age_minutes)));
                    all_models.extend(cached.models);
                    any_from_cache = true;
                    continue;
                }
            }
        }

        // Fetch fresh models
        let api_key = match get_api_key_for_provider(app.clone(), provider) {
            Ok(key) => key,
            Err(e) => {
                eprintln!("Failed to get API key for {}: {}", provider, e);
                // Try to use cached models as fallback
                if let Some(cached) = get_cached_models_for_provider(&app, provider) {
                    all_models.extend(cached.models);
                    any_from_cache = true;
                }
                continue;
            }
        };

        let result = match provider.as_str() {
            "anthropic" => fetch_anthropic_models(&api_key).await,
            "openai" => fetch_openai_models(&api_key).await,
            _ => continue,
        };

        match result {
            Ok(models) => {
                // Cache the fresh results
                if let Err(e) = save_cached_models(&app, provider, &models) {
                    eprintln!("Failed to cache models for {}: {}", provider, e);
                }
                all_models.extend(models);
            }
            Err(e) => {
                eprintln!("Failed to fetch models for {}: {}", provider, e);
                // Try to use cached models as fallback
                if let Some(cached) = get_cached_models_for_provider(&app, provider) {
                    all_models.extend(cached.models);
                    any_from_cache = true;
                }
            }
        }
    }

    // If we have no models at all, return default aliases
    if all_models.is_empty() {
        all_models = get_default_aliases(&available_providers);
    }

    // Sort models: aliases first, then by provider, then by name
    all_models.sort_by(|a, b| {
        // First by provider (group together)
        if a.provider != b.provider {
            return a.provider.cmp(&b.provider);
        }
        // Aliases first within each provider
        let a_is_alias = a.model_type == "alias";
        let b_is_alias = b.model_type == "alias";
        if a_is_alias != b_is_alias {
            return b_is_alias.cmp(&a_is_alias);
        }
        // Then by created_at (newest first)
        match (b.created_at, a.created_at) {
            (Some(b_time), Some(a_time)) => b_time.cmp(&a_time),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.display_name.cmp(&b.display_name),
        }
    });

    Ok(FetchModelsResponse {
        models: all_models,
        from_cache: any_from_cache,
        cache_age_minutes: oldest_cache_age,
    })
}

#[tauri::command]
pub fn get_cached_models(app: AppHandle) -> Result<FetchModelsResponse, String> {
    let available_providers = super::ai::get_available_providers(app.clone());

    let mut all_models = Vec::new();
    let mut oldest_cache_age: Option<u64> = None;

    for provider in &available_providers {
        if let Some(cached) = get_cached_models_for_provider(&app, provider) {
            let age_minutes = ((current_timestamp() - cached.fetched_at) / 60) as u64;
            oldest_cache_age = Some(oldest_cache_age.map_or(age_minutes, |a| a.max(age_minutes)));
            all_models.extend(cached.models);
        }
    }

    // If no cache, return default aliases
    if all_models.is_empty() {
        all_models = get_default_aliases(&available_providers);
    }

    Ok(FetchModelsResponse {
        models: all_models,
        from_cache: true,
        cache_age_minutes: oldest_cache_age,
    })
}

#[tauri::command]
pub async fn validate_model(
    app: AppHandle,
    model_id: String,
) -> Result<ModelValidation, String> {
    // First check if the model is a known alias - these always work
    if DEFAULT_ALIASES.iter().any(|(id, _, _)| *id == model_id) {
        return Ok(ModelValidation {
            is_valid: true,
            model_id,
            fallback_model: None,
            message: None,
        });
    }

    // Check if the model is in our cached list
    let available_providers = super::ai::get_available_providers(app.clone());
    let mut found = false;
    let mut model_provider: Option<String> = None;

    for provider in &available_providers {
        if let Some(cached) = get_cached_models_for_provider(&app, provider) {
            if cached.models.iter().any(|m| m.id == model_id) {
                found = true;
                model_provider = Some(provider.clone());
                break;
            }
        }
    }

    if found {
        return Ok(ModelValidation {
            is_valid: true,
            model_id,
            fallback_model: None,
            message: None,
        });
    }

    // Model not found in cache - try refreshing
    let fresh_response = fetch_models(app.clone(), true).await?;

    if fresh_response.models.iter().any(|m| m.id == model_id) {
        return Ok(ModelValidation {
            is_valid: true,
            model_id,
            fallback_model: None,
            message: None,
        });
    }

    // Model truly not found - suggest a fallback
    // Determine provider from model ID prefix
    let provider = if model_id.starts_with("claude") || model_id.starts_with("anthropic") {
        "anthropic"
    } else if model_id.starts_with("gpt") || model_id.starts_with("o1") || model_id.starts_with("o3") {
        "openai"
    } else {
        model_provider.as_deref().unwrap_or("anthropic")
    };

    let fallback = match provider {
        "openai" => "gpt-4o",
        _ => "claude-sonnet-4-5",
    };

    Ok(ModelValidation {
        is_valid: false,
        model_id,
        fallback_model: Some(fallback.to_string()),
        message: Some(format!(
            "Model not found or no longer available. Suggested fallback: {}",
            fallback
        )),
    })
}
