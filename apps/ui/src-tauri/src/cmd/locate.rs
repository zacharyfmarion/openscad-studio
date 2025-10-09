use crate::types::{LocateOpenScadRequest, LocateOpenScadResponse};
use std::process::Command;

#[tauri::command]
pub async fn locate_openscad(request: LocateOpenScadRequest) -> Result<LocateOpenScadResponse, String> {
    // If user provided an explicit path, validate it
    if let Some(path) = request.explicit_path {
        if std::path::Path::new(&path).exists() {
            return Ok(LocateOpenScadResponse { exe_path: path });
        } else {
            return Err(format!("Provided path does not exist: {}", path));
        }
    }

    // Try to find openscad in PATH
    let exe_name = if cfg!(target_os = "windows") {
        "openscad.exe"
    } else {
        "openscad"
    };

    // Use `which` command on Unix-like systems or `where` on Windows
    let find_cmd = if cfg!(target_os = "windows") {
        Command::new("where").arg(exe_name).output()
    } else {
        Command::new("which").arg(exe_name).output()
    };

    match find_cmd {
        Ok(output) if output.status.success() => {
            let path = String::from_utf8_lossy(&output.stdout)
                .trim()
                .lines()
                .next()
                .unwrap_or("")
                .to_string();

            if path.is_empty() {
                Err("OpenSCAD not found in PATH. Please install OpenSCAD and add it to your PATH, or specify the path manually in settings.".to_string())
            } else {
                Ok(LocateOpenScadResponse { exe_path: path })
            }
        }
        _ => {
            // Fallback: try common installation paths
            let common_paths = if cfg!(target_os = "macos") {
                vec![
                    "/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD",
                    "/usr/local/bin/openscad",
                ]
            } else if cfg!(target_os = "windows") {
                vec![
                    "C:\\Program Files\\OpenSCAD\\openscad.exe",
                    "C:\\Program Files (x86)\\OpenSCAD\\openscad.exe",
                ]
            } else {
                vec![
                    "/usr/bin/openscad",
                    "/usr/local/bin/openscad",
                ]
            };

            for path in common_paths {
                if std::path::Path::new(path).exists() {
                    return Ok(LocateOpenScadResponse {
                        exe_path: path.to_string(),
                    });
                }
            }

            Err("OpenSCAD not found. Please install OpenSCAD from https://openscad.org/ and ensure it's in your PATH, or specify the path manually in settings.".to_string())
        }
    }
}
