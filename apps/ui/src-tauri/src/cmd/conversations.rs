use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub role: String,
    pub content: String,
    pub timestamp: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub timestamp: u64,
    pub messages: Vec<Message>,
}

const CONVERSATIONS_KEY: &str = "conversations";

#[tauri::command]
pub fn save_conversation(app: AppHandle, conversation: Conversation) -> Result<(), String> {
    let store = app
        .store("conversations.json")
        .map_err(|e| format!("Failed to access store: {e}"))?;

    // Get existing conversations
    let mut conversations: Vec<Conversation> = store
        .get(CONVERSATIONS_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_else(Vec::new);

    // Update or add conversation
    if let Some(index) = conversations.iter().position(|c| c.id == conversation.id) {
        conversations[index] = conversation;
    } else {
        conversations.push(conversation);
    }

    // Save back to store
    store.set(
        CONVERSATIONS_KEY,
        serde_json::to_value(&conversations).unwrap(),
    );
    store
        .save()
        .map_err(|e| format!("Failed to save store: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn load_conversations(app: AppHandle) -> Result<Vec<Conversation>, String> {
    let store = app
        .store("conversations.json")
        .map_err(|e| format!("Failed to access store: {e}"))?;

    let conversations: Vec<Conversation> = store
        .get(CONVERSATIONS_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_else(Vec::new);

    Ok(conversations)
}

#[tauri::command]
pub fn delete_conversation(app: AppHandle, conversation_id: String) -> Result<(), String> {
    let store = app
        .store("conversations.json")
        .map_err(|e| format!("Failed to access store: {e}"))?;

    // Get existing conversations
    let mut conversations: Vec<Conversation> = store
        .get(CONVERSATIONS_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_else(Vec::new);

    // Remove conversation
    conversations.retain(|c| c.id != conversation_id);

    // Save back to store
    store.set(
        CONVERSATIONS_KEY,
        serde_json::to_value(&conversations).unwrap(),
    );
    store
        .save()
        .map_err(|e| format!("Failed to save store: {e}"))?;

    Ok(())
}
