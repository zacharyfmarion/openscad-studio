use crate::types::{LocateOpenScadRequest, LocateOpenScadResponse};
use std::process::Command;

#[tauri::command]
pub async fn locate_openscad(
    request: LocateOpenScadRequest,
) -> Result<LocateOpenScadResponse, String> {
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
            if cfg!(target_os = "macos") {
                // Check common OpenSCAD.app paths (including versioned installs)
                let app_candidates = vec![
                    "/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD",
                    "/Applications/OpenSCAD-2021.01.app/Contents/MacOS/OpenSCAD",
                    "/Applications/OpenSCAD-2024.12.app/Contents/MacOS/OpenSCAD",
                    "/Applications/OpenSCAD-nightly.app/Contents/MacOS/OpenSCAD",
                ];

                for path in app_candidates {
                    if std::path::Path::new(path).exists() {
                        return Ok(LocateOpenScadResponse {
                            exe_path: path.to_string(),
                        });
                    }
                }

                // Check Homebrew paths
                let homebrew_paths = vec![
                    "/opt/homebrew/bin/openscad",
                    "/usr/local/bin/openscad",
                ];

                for path in homebrew_paths {
                    if std::path::Path::new(path).exists() {
                        return Ok(LocateOpenScadResponse {
                            exe_path: path.to_string(),
                        });
                    }
                }

                // Try scanning /Applications as last resort
                if let Ok(entries) = std::fs::read_dir("/Applications") {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if let Some(name) = path.file_name() {
                            let name_str = name.to_string_lossy();
                            if name_str.starts_with("OpenSCAD")
                                && name_str.ends_with(".app") {
                                let exe_path = path.join("Contents/MacOS/OpenSCAD");
                                if exe_path.exists() {
                                    return Ok(LocateOpenScadResponse {
                                        exe_path: exe_path.to_string_lossy().to_string(),
                                    });
                                }
                            }
                        }
                    }
                }
            } else if cfg!(target_os = "windows") {
                let common_paths = vec![
                    "C:\\Program Files\\OpenSCAD\\openscad.exe",
                    "C:\\Program Files (x86)\\OpenSCAD\\openscad.exe",
                ];

                for path in common_paths {
                    if std::path::Path::new(path).exists() {
                        return Ok(LocateOpenScadResponse {
                            exe_path: path.to_string(),
                        });
                    }
                }
            } else {
                let common_paths = vec!["/usr/bin/openscad", "/usr/local/bin/openscad"];

                for path in common_paths {
                    if std::path::Path::new(path).exists() {
                        return Ok(LocateOpenScadResponse {
                            exe_path: path.to_string(),
                        });
                    }
                }
            }

            Err("OpenSCAD not found. Please install OpenSCAD from https://openscad.org/ and ensure it's in your PATH, or specify the path manually in settings.".to_string())
        }
    }
}
