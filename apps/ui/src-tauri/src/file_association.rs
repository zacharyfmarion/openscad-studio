//! `.scad` file association support.
//!
//! - Routes `.scad` files opened by the OS (Finder double-click, "Open With",
//!   or command-line arguments) into Studio windows.
//! - Lets the user make Studio the default handler for `.scad` files (macOS).

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_fs::FsExt;

use crate::mcp::{open_file_from_os, McpServerState};

/// Files opened by the OS before the first window claimed them at startup.
#[derive(Default)]
pub struct OsOpenFileState {
    inner: Mutex<OsOpenFileInner>,
}

#[derive(Default)]
struct OsOpenFileInner {
    pending: Vec<String>,
    startup_claimed: bool,
}

fn is_scad_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("scad"))
        && path.is_file()
}

/// The user picked this file in the OS, like a dialog pick, so grant the fs
/// scope for its folder: Studio loads the parent directory as the project.
fn allow_project_dir(app: &AppHandle, path: &Path) {
    if let Some(dir) = path.parent() {
        if let Err(error) = app.fs_scope().allow_directory(dir, true) {
            eprintln!(
                "[file_association] Failed to allow {}: {error}",
                dir.display()
            );
        }
    }
}

/// Queues the files until the startup window claims them, then routes any
/// later ones to a blank welcome window or a new window.
pub fn handle_os_open_paths(app: &AppHandle, paths: Vec<PathBuf>) {
    let paths: Vec<String> = paths
        .into_iter()
        .filter(|path| is_scad_file(path))
        .inspect(|path| allow_project_dir(app, path))
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    if paths.is_empty() {
        return;
    }

    let state = app.state::<OsOpenFileState>();
    let mut inner = state.inner.lock().unwrap();
    if !inner.startup_claimed {
        inner.pending.extend(paths);
        return;
    }
    drop(inner);
    route_paths(app.clone(), paths);
}

fn route_paths(app: AppHandle, paths: Vec<String>) {
    // Window opening blocks until the frontend reports back, so keep it off
    // the main thread.
    std::thread::spawn(move || {
        let mcp_state = app.state::<McpServerState>();
        for path in paths {
            if let Err(error) = open_file_from_os(&app, &mcp_state, &path) {
                eprintln!("[file_association] Failed to open {path}: {error}");
            }
        }
    });
}

/// Called once by the startup window: returns the first file the OS asked to
/// open (to load in that window) and opens the rest in new windows.
#[tauri::command]
pub fn take_startup_open_file(app: AppHandle, state: State<'_, OsOpenFileState>) -> Option<String> {
    let mut inner = state.inner.lock().unwrap();
    if inner.startup_claimed {
        return None;
    }
    inner.startup_claimed = true;
    let mut pending = std::mem::take(&mut inner.pending);
    drop(inner);

    if pending.is_empty() {
        return None;
    }
    let first = pending.remove(0);
    if !pending.is_empty() {
        route_paths(app, pending);
    }
    Some(first)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScadDefaultHandlerStatus {
    /// False when the platform is unsupported or the app is not running from
    /// an installed bundle (e.g. `tauri dev`).
    supported: bool,
    is_default: bool,
}

#[tauri::command]
pub fn get_scad_default_handler_status(app: AppHandle) -> ScadDefaultHandlerStatus {
    platform::status(&app.config().identifier)
}

#[tauri::command]
pub fn set_as_default_scad_handler(app: AppHandle) -> Result<(), String> {
    platform::set_default(&app.config().identifier)
}

#[cfg(target_os = "macos")]
mod platform {
    use super::ScadDefaultHandlerStatus;
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};

    const LS_ROLES_ALL: u32 = 0xFFFF_FFFF;

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        static kUTTagClassFilenameExtension: CFStringRef;
        static kUTTypeData: CFStringRef;
        fn UTTypeCreatePreferredIdentifierForTag(
            tag_class: CFStringRef,
            tag: CFStringRef,
            conforming_to_uti: CFStringRef,
        ) -> CFStringRef;
        fn LSCopyDefaultRoleHandlerForContentType(
            content_type: CFStringRef,
            role: u32,
        ) -> CFStringRef;
        fn LSSetDefaultRoleHandlerForContentType(
            content_type: CFStringRef,
            role: u32,
            handler_bundle_id: CFStringRef,
        ) -> i32;
    }

    /// LaunchServices only knows the app by bundle id, so a non-bundled dev
    /// binary would point the association at another installed copy.
    fn running_from_bundle() -> bool {
        std::env::current_exe()
            .map(|exe| exe.to_string_lossy().contains(".app/Contents/MacOS/"))
            .unwrap_or(false)
    }

    /// Resolves the content type (UTI) the system uses for `.scad` files.
    /// No app declares one, so it is a dynamic UTI; it must conform to
    /// `public.data` to match the type Finder assigns to the files (an
    /// unconstrained lookup yields a different dynamic UTI that LaunchServices
    /// rejects with paramErr).
    fn scad_content_type() -> Option<CFString> {
        let ext = CFString::from_static_string("scad");
        let uti = unsafe {
            UTTypeCreatePreferredIdentifierForTag(
                kUTTagClassFilenameExtension,
                ext.as_concrete_TypeRef(),
                kUTTypeData,
            )
        };
        (!uti.is_null()).then(|| unsafe { CFString::wrap_under_create_rule(uti) })
    }

    fn current_handler() -> Option<String> {
        let content_type = scad_content_type()?;
        let handler = unsafe {
            LSCopyDefaultRoleHandlerForContentType(content_type.as_concrete_TypeRef(), LS_ROLES_ALL)
        };
        (!handler.is_null())
            .then(|| unsafe { CFString::wrap_under_create_rule(handler) }.to_string())
    }

    pub fn status(bundle_id: &str) -> ScadDefaultHandlerStatus {
        if !running_from_bundle() {
            return ScadDefaultHandlerStatus {
                supported: false,
                is_default: false,
            };
        }
        ScadDefaultHandlerStatus {
            supported: true,
            is_default: current_handler().is_some_and(|id| id.eq_ignore_ascii_case(bundle_id)),
        }
    }

    pub fn set_default(bundle_id: &str) -> Result<(), String> {
        if !running_from_bundle() {
            return Err("Setting the default app requires the installed app bundle.".into());
        }
        let content_type =
            scad_content_type().ok_or("Could not resolve the content type for .scad files.")?;
        let handler = CFString::new(bundle_id);
        let status = unsafe {
            LSSetDefaultRoleHandlerForContentType(
                content_type.as_concrete_TypeRef(),
                LS_ROLES_ALL,
                handler.as_concrete_TypeRef(),
            )
        };
        if status == 0 {
            Ok(())
        } else {
            Err(format!(
                "macOS refused to change the default app (LaunchServices error {status})."
            ))
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::ScadDefaultHandlerStatus;

    pub fn status(_bundle_id: &str) -> ScadDefaultHandlerStatus {
        ScadDefaultHandlerStatus {
            supported: false,
            is_default: false,
        }
    }

    pub fn set_default(_bundle_id: &str) -> Result<(), String> {
        Err("Setting the default app is only supported on macOS.".into())
    }
}
