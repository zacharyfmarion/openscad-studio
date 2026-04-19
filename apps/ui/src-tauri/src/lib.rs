mod cmd;
mod history;
mod mcp;
mod types;

use cmd::{update_editor_state, update_working_dir, EditorState, OpenScadBinaryState};
use history::HistoryState;
use mcp::{
    record_window_startup_phase, remove_window, update_window_focus, McpServerState,
    WindowLaunchIntent,
};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

pub(crate) fn create_new_window_with_launch_intent(
    app: &tauri::AppHandle,
    intent: WindowLaunchIntent,
) -> tauri::Result<String> {
    let label = format!("window-{}", Uuid::new_v4());

    // Window creation MUST happen on the main thread so that the IPC response
    // handler is properly registered for the new webview. When called from a
    // background thread (e.g. the MCP HTTP server), dispatching via
    // run_on_main_thread ensures the window is created correctly.
    let app_clone = app.clone();
    let label_clone = label.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let result = build_window_with_label(&app_clone, &label_clone, &intent);
        let _ = tx.send(result);
    })?;

    rx.recv().map_err(|e| tauri::Error::Anyhow(e.into()))??;
    Ok(label)
}

fn build_window_with_label(
    app: &tauri::AppHandle,
    label: &str,
    intent: &WindowLaunchIntent,
) -> tauri::Result<()> {
    let launch_intent = serde_json::to_string(intent).expect("serializable window launch intent");
    let initialization_script =
        format!("window.__OPENSCAD_STUDIO_BOOTSTRAP__ = {{ launchIntent: {launch_intent} }};");
    let mcp_state = app.state::<McpServerState>();
    record_window_startup_phase(&mcp_state, label, "window_created", None);

    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("OpenSCAD Studio")
        .inner_size(1400.0, 900.0)
        .initialization_script(&initialization_script)
        .build()?;
    Ok(())
}

fn emit_to_focused_window<T: serde::Serialize + Clone>(
    app: &tauri::AppHandle,
    event: &str,
    payload: T,
) {
    if let Some((_, window)) = app
        .webview_windows()
        .into_iter()
        .find(|(_, window)| window.is_focused().unwrap_or(false))
    {
        let _ = window.emit(event, payload.clone());
        return;
    }

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit(event, payload);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let editor_state = EditorState::default();
    let history_state = HistoryState::new();
    let openscad_state = OpenScadBinaryState::default();
    let mcp_state = McpServerState::default();
    let window_mcp_state = mcp_state.clone();

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
            mcp::mcp_mark_window_bridge_ready,
            mcp::mcp_report_window_startup_phase,
            mcp::report_window_open_result,
            mcp::mcp_update_window_context,
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
                    &MenuItemBuilder::with_id("new_window", "New Window")
                        .accelerator("CmdOrCtrl+Shift+N")
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
                .item(
                    &MenuItemBuilder::with_id("file_settings", "Settings")
                        .accelerator("CmdOrCtrl+,")
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
                .item(
                    &MenuItemBuilder::with_id("edit_undo", "Undo")
                        .accelerator("CmdOrCtrl+Z")
                        .build(app)?,
                )
                .item(
                    &MenuItemBuilder::with_id("edit_redo", "Redo")
                        .accelerator("CmdOrCtrl+Shift+Z")
                        .build(app)?,
                )
                .separator()
                .cut()
                .copy()
                .paste()
                .separator()
                .select_all()
                .build()?;

            let help_menu = SubmenuBuilder::new(app, "Help")
                .item(
                    &MenuItemBuilder::with_id("help_keyboard_shortcuts", "Keyboard Shortcuts")
                        .build(app)?,
                )
                .separator()
                .item(&MenuItemBuilder::with_id("help_about", "About OpenSCAD Studio").build(app)?)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&help_menu)
                .build()?;

            app.set_menu(menu)?;

            Ok(())
        })
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "new" => {
                emit_to_focused_window(app, "menu:file:new", ());
            }
            "new_window" => {
                let _ = create_new_window_with_launch_intent(app, WindowLaunchIntent::Welcome);
            }
            "open" => {
                emit_to_focused_window(app, "menu:file:open", ());
            }
            "open_folder" => {
                emit_to_focused_window(app, "menu:file:open_folder", ());
            }
            "save" => {
                emit_to_focused_window(app, "menu:file:save", ());
            }
            "save_as" => {
                emit_to_focused_window(app, "menu:file:save_as", ());
            }
            "save_all" => {
                emit_to_focused_window(app, "menu:file:save_all", ());
            }
            "file_settings" => {
                emit_to_focused_window(app, "menu:file:settings", ());
            }
            "edit_undo" => {
                emit_to_focused_window(app, "menu:edit:undo", ());
            }
            "edit_redo" => {
                emit_to_focused_window(app, "menu:edit:redo", ());
            }
            "export_stl" => {
                emit_to_focused_window(app, "menu:file:export", "stl");
            }
            "export_obj" => {
                emit_to_focused_window(app, "menu:file:export", "obj");
            }
            "export_amf" => {
                emit_to_focused_window(app, "menu:file:export", "amf");
            }
            "export_3mf" => {
                emit_to_focused_window(app, "menu:file:export", "3mf");
            }
            "export_png" => {
                emit_to_focused_window(app, "menu:file:export", "png");
            }
            "export_svg" => {
                emit_to_focused_window(app, "menu:file:export", "svg");
            }
            "export_dxf" => {
                emit_to_focused_window(app, "menu:file:export", "dxf");
            }
            "help_keyboard_shortcuts" => {
                emit_to_focused_window(app, "menu:help:shortcuts", ());
            }
            "help_about" => {
                emit_to_focused_window(app, "menu:help:about", ());
            }
            _ => {}
        })
        .on_window_event(move |window, event| match event {
            tauri::WindowEvent::Focused(focused) => {
                update_window_focus(&window_mcp_state, window.label(), *focused);
            }
            tauri::WindowEvent::Destroyed => {
                remove_window(&window_mcp_state, window.label());
            }
            tauri::WindowEvent::CloseRequested { .. } => {}
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
