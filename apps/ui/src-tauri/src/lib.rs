mod cmd;
mod types;
mod utils;

use cmd::{detect_backend, locate_openscad, render_preview};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            locate_openscad,
            render_preview,
            detect_backend,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
