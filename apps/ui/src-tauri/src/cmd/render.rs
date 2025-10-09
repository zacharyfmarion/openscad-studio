use crate::types::{BackendType, RenderKind, RenderPreviewRequest, RenderPreviewResponse, ViewMode};
use crate::utils::parser::parse_openscad_stderr;
use std::process::Command;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn render_preview(
    app: AppHandle,
    openscad_path: String,
    request: RenderPreviewRequest,
) -> Result<RenderPreviewResponse, String> {
    // Get temporary directory
    let app_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to get app cache directory: {}", e))?;

    // Ensure temp directory exists
    std::fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create cache directory: {}", e))?;

    // Write source to temp file
    let scad_path = app_dir.join("preview.scad");
    std::fs::write(&scad_path, &request.source)
        .map_err(|e| format!("Failed to write temp .scad file: {}", e))?;

    // Determine output file and kind based on view mode and mesh flag
    let view = request.view.as_ref().unwrap_or(&ViewMode::ThreeD);
    let render_mesh = request.render_mesh.unwrap_or(false);

    let (out_path, kind) = if render_mesh && matches!(view, ViewMode::ThreeD) {
        (app_dir.join("preview.stl"), RenderKind::Mesh)
    } else {
        match view {
            ViewMode::TwoD => (app_dir.join("preview.svg"), RenderKind::Svg),
            ViewMode::ThreeD => (app_dir.join("preview.png"), RenderKind::Png),
        }
    };

    // Build command arguments
    let mut args: Vec<String> = vec![
        "-o".to_string(),
        out_path.to_string_lossy().to_string(),
        scad_path.to_string_lossy().to_string(),
        "--hardwarnings".to_string(),
    ];

    // Add backend flag if specified
    if let Some(backend) = &request.backend {
        match backend {
            BackendType::Manifold => args.push("--backend=manifold".to_string()),
            BackendType::Cgal => args.push("--backend=cgal".to_string()),
            BackendType::Auto => {} // Let OpenSCAD choose
        }
    }

    // Add render settings based on view mode and output type
    if render_mesh {
        // For STL export, we don't need --preview or --imgsize
        // OpenSCAD will do a full render automatically
    } else {
        match view {
            ViewMode::ThreeD => {
                // Add image size if specified
                if let Some(size) = &request.size {
                    args.push(format!("--imgsize={},{}", size.w, size.h));
                } else {
                    args.push("--imgsize=800,600".to_string());
                }
                // Force render for preview (faster, lower quality)
                args.push("--preview".to_string());
            }
            ViewMode::TwoD => {
                // 2D mode - SVG output, no special render flags needed
            }
        }
    }

    // Execute OpenSCAD
    let output = Command::new(&openscad_path)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute OpenSCAD: {}. Is OpenSCAD installed at {}?", e, openscad_path))?;

    // Parse diagnostics from stderr
    let stderr = String::from_utf8_lossy(&output.stderr);
    let diagnostics = parse_openscad_stderr(&stderr);

    // Check if output file was created
    if !out_path.exists() {
        // Check if there were any errors in diagnostics
        let has_errors = diagnostics.iter().any(|d| {
            matches!(
                d.severity,
                crate::types::DiagnosticSeverity::Error
            )
        });

        if has_errors {
            return Err("OpenSCAD failed to render due to errors in your code. Check diagnostics for details.".to_string());
        } else {
            return Err("OpenSCAD failed to create output file for unknown reasons.".to_string());
        }
    }

    Ok(RenderPreviewResponse {
        kind,
        path: out_path.to_string_lossy().to_string(),
        diagnostics,
    })
}

#[tauri::command]
pub async fn detect_backend(openscad_path: String) -> Result<crate::types::DetectBackendResponse, String> {
    // First, get version
    let version_output = Command::new(&openscad_path)
        .arg("--version")
        .output()
        .map_err(|e| format!("Failed to execute OpenSCAD: {}", e))?;

    let version_str = String::from_utf8_lossy(&version_output.stdout);
    let version = version_str
        .lines()
        .next()
        .unwrap_or("unknown")
        .to_string();

    // Try to detect Manifold support by checking if --backend=manifold is accepted
    // We'll do a dry run with a trivial file
    let test_output = Command::new(&openscad_path)
        .args(&["--backend=manifold", "--help"])
        .output()
        .map_err(|e| format!("Failed to check Manifold support: {}", e))?;

    // If the command succeeded (exit code 0), manifold is likely supported
    // This is a heuristic - newer OpenSCAD versions support manifold
    let has_manifold = test_output.status.success();

    Ok(crate::types::DetectBackendResponse {
        has_manifold,
        version,
    })
}
