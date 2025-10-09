mod cmd;
mod types;
mod utils;

use cmd::{detect_backend, locate_openscad, render_exact, render_preview};
use std::sync::Arc;
use utils::cache::RenderCache;

pub struct AppState {
    pub render_cache: Arc<RenderCache>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        render_cache: Arc::new(RenderCache::new()),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            locate_openscad,
            render_preview,
            render_exact,
            detect_backend,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
