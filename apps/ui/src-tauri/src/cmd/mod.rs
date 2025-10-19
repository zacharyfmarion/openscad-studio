pub mod ai;
pub mod ai_tools;
pub mod conversations;
pub mod history;
pub mod locate;
pub mod render;

pub use ai::{clear_api_key, get_ai_model, get_ai_provider, get_api_key, get_api_key_for_provider, get_available_providers, has_api_key, set_ai_model, store_api_key};
pub use ai_tools::{
    apply_edit, get_current_code, get_diagnostics, get_preview_screenshot, trigger_render,
    update_editor_state, update_openscad_path, validate_edit, EditorState,
};
pub use conversations::{delete_conversation, load_conversations, save_conversation};
pub use locate::locate_openscad;
pub use render::{detect_backend, render_exact, render_preview};
