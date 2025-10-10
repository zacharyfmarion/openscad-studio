mod agent_sidecar;
mod cmd;
mod types;
mod utils;

use agent_sidecar::{cancel_agent_stream, send_agent_query, start_agent_sidecar, stop_agent_sidecar, AgentSidecarState};
use cmd::{
    apply_diff, clear_api_key, detect_backend, get_api_key, get_current_code, get_diagnostics,
    get_preview_screenshot, has_api_key, locate_openscad, render_exact, render_preview,
    store_api_key, trigger_render, validate_diff, EditorState,
};
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use utils::cache::RenderCache;

pub struct AppState {
    pub render_cache: Arc<RenderCache>,
}

pub struct AppStates {
    pub app_state: AppState,
    pub editor_state: EditorState,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        render_cache: Arc::new(RenderCache::new()),
    };
    let editor_state = EditorState::default();
    let agent_sidecar_state = AgentSidecarState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .manage(editor_state)
        .manage(agent_sidecar_state)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            locate_openscad,
            render_preview,
            render_exact,
            detect_backend,
            store_api_key,
            get_api_key,
            clear_api_key,
            has_api_key,
            get_current_code,
            get_preview_screenshot,
            validate_diff,
            apply_diff,
            get_diagnostics,
            trigger_render,
            start_agent_sidecar,
            stop_agent_sidecar,
            send_agent_query,
            cancel_agent_stream,
        ])
        .setup(|app| {
            // Create app menu (About, Hide, Quit, etc.)
            let app_menu = SubmenuBuilder::new(app, "OpenSCAD Copilot")
                .about(None)
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            // Create File menu
            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&MenuItemBuilder::with_id("new", "New").accelerator("CmdOrCtrl+N").build(app)?)
                .item(&MenuItemBuilder::with_id("open", "Open...").accelerator("CmdOrCtrl+O").build(app)?)
                .separator()
                .item(&MenuItemBuilder::with_id("save", "Save").accelerator("CmdOrCtrl+S").build(app)?)
                .item(&MenuItemBuilder::with_id("save_as", "Save As...").accelerator("CmdOrCtrl+Shift+S").build(app)?)
                .separator()
                .item(&MenuItemBuilder::with_id("export_stl", "Export as STL...").build(app)?)
                .item(&MenuItemBuilder::with_id("export_obj", "Export as OBJ...").build(app)?)
                .item(&MenuItemBuilder::with_id("export_amf", "Export as AMF...").build(app)?)
                .item(&MenuItemBuilder::with_id("export_3mf", "Export as 3MF...").build(app)?)
                .item(&MenuItemBuilder::with_id("export_png", "Export as PNG...").build(app)?)
                .item(&MenuItemBuilder::with_id("export_svg", "Export as SVG...").build(app)?)
                .item(&MenuItemBuilder::with_id("export_dxf", "Export as DXF...").build(app)?)
                .build()?;

            // Create Edit menu
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .separator()
                .select_all()
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&file_menu)
                .item(&edit_menu)
                .build()?;

            app.set_menu(menu)?;

            Ok(())
        })
        .on_menu_event(|app, event| {
            // Emit events to frontend to handle the menu actions
            let window = app.get_webview_window("main").unwrap();
            match event.id().as_ref() {
                "new" => { window.emit("menu:file:new", ()).unwrap(); },
                "open" => { window.emit("menu:file:open", ()).unwrap(); },
                "save" => { window.emit("menu:file:save", ()).unwrap(); },
                "save_as" => { window.emit("menu:file:save_as", ()).unwrap(); },
                "export_stl" => { window.emit("menu:file:export", "stl").unwrap(); },
                "export_obj" => { window.emit("menu:file:export", "obj").unwrap(); },
                "export_amf" => { window.emit("menu:file:export", "amf").unwrap(); },
                "export_3mf" => { window.emit("menu:file:export", "3mf").unwrap(); },
                "export_png" => { window.emit("menu:file:export", "png").unwrap(); },
                "export_svg" => { window.emit("menu:file:export", "svg").unwrap(); },
                "export_dxf" => { window.emit("menu:file:export", "dxf").unwrap(); },
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
