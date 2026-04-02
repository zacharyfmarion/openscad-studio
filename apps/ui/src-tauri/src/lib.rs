mod cmd;
mod history;
mod mcp;
mod types;

use cmd::{update_editor_state, update_working_dir, EditorState, OpenScadBinaryState};
use history::HistoryState;
use mcp::{shutdown_mcp_server, McpServerState};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let editor_state = EditorState::default();
    let history_state = HistoryState::new();
    let openscad_state = OpenScadBinaryState::default();
    let mcp_state = McpServerState::default();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .manage(editor_state)
        .manage(history_state)
        .manage(openscad_state)
        .manage(mcp_state.clone())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            update_editor_state,
            update_working_dir,
            cmd::history::create_checkpoint,
            cmd::history::undo,
            cmd::history::redo,
            cmd::history::get_history,
            cmd::history::restore_to_checkpoint,
            cmd::history::get_checkpoint_diff,
            cmd::history::can_undo,
            cmd::history::can_redo,
            cmd::history::get_checkpoint_by_id,
            cmd::render::render_init,
            cmd::render::render_native,
            cmd::render::render_cancel,
            mcp::configure_mcp_server,
            mcp::get_mcp_server_status,
            mcp::mcp_submit_tool_response,
        ])
        .setup(|app| {
            // Create app menu (About, Hide, Quit, etc.)
            let app_menu = SubmenuBuilder::new(app, "OpenSCAD Studio")
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
                .item(
                    &MenuItemBuilder::with_id("new", "New")
                        .accelerator("CmdOrCtrl+N")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("open", "Open...")
                        .accelerator("CmdOrCtrl+O")
                        .build(app)?,
                )
                .item(&MenuItemBuilder::with_id("open_folder", "Open Folder...").build(app)?)
                .separator()
                .item(
                    &MenuItemBuilder::with_id("save", "Save")
                        .accelerator("CmdOrCtrl+S")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("save_as", "Save As...")
                        .accelerator("CmdOrCtrl+Shift+S")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("save_all", "Save All")
                        .accelerator("CmdOrCtrl+Alt+S")
                        .build(app)?,
                )
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
                "new" => {
                    window.emit("menu:file:new", ()).unwrap();
                }
                "open" => {
                    window.emit("menu:file:open", ()).unwrap();
                }
                "open_folder" => {
                    window.emit("menu:file:open_folder", ()).unwrap();
                }
                "save" => {
                    window.emit("menu:file:save", ()).unwrap();
                }
                "save_as" => {
                    window.emit("menu:file:save_as", ()).unwrap();
                }
                "save_all" => {
                    window.emit("menu:file:save_all", ()).unwrap();
                }
                "export_stl" => {
                    window.emit("menu:file:export", "stl").unwrap();
                }
                "export_obj" => {
                    window.emit("menu:file:export", "obj").unwrap();
                }
                "export_amf" => {
                    window.emit("menu:file:export", "amf").unwrap();
                }
                "export_3mf" => {
                    window.emit("menu:file:export", "3mf").unwrap();
                }
                "export_png" => {
                    window.emit("menu:file:export", "png").unwrap();
                }
                "export_svg" => {
                    window.emit("menu:file:export", "svg").unwrap();
                }
                "export_dxf" => {
                    window.emit("menu:file:export", "dxf").unwrap();
                }
                _ => {}
            }
        })
        .on_window_event(move |_window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                shutdown_mcp_server(&mcp_state);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
