use crate::types::{
    BackendType, RenderKind, RenderPreviewRequest, RenderPreviewResponse, ViewMode,
};
use crate::utils::cache::RenderCache;
use crate::utils::parser::parse_openscad_stderr;
use std::process::Command;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn render_preview(
    app: AppHandle,
    state: State<'_, crate::AppState>,
    editor_state: State<'_, crate::cmd::EditorState>,
    openscad_path: String,
    request: RenderPreviewRequest,
) -> Result<RenderPreviewResponse, String> {
    // Get temporary directory
    let app_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to get app cache directory: {e}"))?;

    // Ensure temp directory exists
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create cache directory: {e}"))?;

    // Determine render parameters
    let view = request.view.as_ref().unwrap_or(&ViewMode::ThreeD);
    let render_mesh = request.render_mesh.unwrap_or(false);
    let backend = request.backend.as_ref().unwrap_or(&BackendType::Auto);

    // Generate cache key
    let view_str = match view {
        ViewMode::ThreeD => "3d",
        ViewMode::TwoD => "2d",
    };
    let backend_str = match backend {
        BackendType::Manifold => "manifold",
        BackendType::Cgal => "cgal",
        BackendType::Auto => "auto",
    };
    let cache_key = RenderCache::generate_key(&request.source, backend_str, view_str, render_mesh);

    // Check cache
    if let Some(cached_entry) = state.render_cache.get(&cache_key) {
        println!("Cache HIT for key: {cache_key}");
        return Ok(RenderPreviewResponse {
            kind: match cached_entry.kind.as_str() {
                "mesh" => RenderKind::Mesh,
                "png" => RenderKind::Png,
                "svg" => RenderKind::Svg,
                _ => RenderKind::Png,
            },
            path: cached_entry.output_path.to_string_lossy().to_string(),
            diagnostics: cached_entry.diagnostics.clone(),
        });
    }

    println!("Cache MISS for key: {cache_key}");

    // Write source to temp file
    // If working_dir is provided, write temp file there so relative imports work
    let scad_path = if let Some(working_dir) = &request.working_dir {
        let work_path = std::path::PathBuf::from(working_dir);
        work_path.join(".openscad_temp_preview.scad")
    } else {
        app_dir.join("preview.scad")
    };

    std::fs::write(&scad_path, &request.source)
        .map_err(|e| format!("Failed to write temp .scad file: {e}"))?;

    // Determine output file and kind based on view mode and mesh flag
    // Use cache key in filename to avoid overwriting cached files
    let (out_path, kind) = if render_mesh && matches!(view, ViewMode::ThreeD) {
        (
            app_dir.join(format!("render_{}.stl", &cache_key[..16])),
            RenderKind::Mesh,
        )
    } else {
        match view {
            ViewMode::TwoD => (
                app_dir.join(format!("render_{}.svg", &cache_key[..16])),
                RenderKind::Svg,
            ),
            ViewMode::ThreeD => (
                app_dir.join(format!("render_{}.png", &cache_key[..16])),
                RenderKind::Png,
            ),
        }
    };

    // Build command arguments
    let mut args: Vec<String> = vec![
        "-o".to_string(),
        out_path.to_string_lossy().to_string(),
        scad_path.to_string_lossy().to_string(),
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

    // Execute OpenSCAD with working directory if provided
    let mut command = Command::new(&openscad_path);
    command.args(&args);

    // Set working directory if provided (for resolving relative imports)
    if let Some(working_dir) = &request.working_dir {
        command.current_dir(working_dir);
    }

    let output = command.output().map_err(|e| {
        format!("Failed to execute OpenSCAD: {e}. Is OpenSCAD installed at {openscad_path}?")
    })?;

    // Parse diagnostics from stderr
    let stderr = String::from_utf8_lossy(&output.stderr);
    let diagnostics = parse_openscad_stderr(&stderr);

    // Check if output file was created
    if !out_path.exists() {
        // Check if there were any errors in diagnostics
        let has_errors = diagnostics
            .iter()
            .any(|d| matches!(d.severity, crate::types::DiagnosticSeverity::Error));

        if has_errors {
            // Update EditorState with diagnostics so they show in the editor even when render fails
            *editor_state.diagnostics.lock().unwrap() = diagnostics.clone();

            // Build error message with diagnostic details
            let mut error_msg = String::from("OpenSCAD failed to render due to errors:\n\n");
            for diag in &diagnostics {
                if matches!(diag.severity, crate::types::DiagnosticSeverity::Error) {
                    if let Some(line) = diag.line {
                        error_msg.push_str(&format!("Line {}: {}\n", line, diag.message));
                    } else {
                        error_msg.push_str(&format!("{}\n", diag.message));
                    }
                }
            }
            return Err(error_msg);
        } else {
            // Check for common dimension mismatch issues
            let error_msg = if matches!(view, ViewMode::TwoD)
                && (stderr.contains("3D object") || stderr.contains("not a 2D object"))
            {
                "Cannot render 3D objects in 2D mode. Switch to 3D mode or use a 2D shape (e.g., square, circle, polygon).".to_string()
            } else if matches!(view, ViewMode::ThreeD)
                && (stderr.contains("not a 3D object") || stderr.contains("2D object"))
            {
                "Cannot render 2D objects in 3D mode. Switch to 2D mode or use a 3D shape (e.g., cube, sphere, cylinder).".to_string()
            } else if stderr.contains("WARNING: Can't convert") {
                "OpenSCAD cannot convert this geometry. Try switching between 2D and 3D modes."
                    .to_string()
            } else {
                // For debugging, include full stderr
                let stderr_preview = if stderr.len() > 1000 {
                    format!(
                        "{}...\n\n(Output truncated. Full output in console.)",
                        &stderr[..1000]
                    )
                } else {
                    stderr.to_string()
                };

                format!("OpenSCAD failed to create output file.\n\nThis usually means the geometry doesn't match the current mode (2D/3D).\n\nOpenSCAD output:\n{stderr_preview}")
            };

            return Err(error_msg);
        }
    }

    // Store successful render in cache
    let kind_str = match kind {
        RenderKind::Mesh => "mesh",
        RenderKind::Png => "png",
        RenderKind::Svg => "svg",
    };
    state.render_cache.set(
        cache_key,
        out_path.clone(),
        kind_str.to_string(),
        diagnostics.clone(),
    );

    // Update EditorState with render results
    *editor_state.current_code.lock().unwrap() = request.source.clone();
    *editor_state.diagnostics.lock().unwrap() = diagnostics.clone();
    *editor_state.last_preview_path.lock().unwrap() = out_path.to_string_lossy().to_string();

    Ok(RenderPreviewResponse {
        kind,
        path: out_path.to_string_lossy().to_string(),
        diagnostics,
    })
}

#[tauri::command]
pub async fn render_exact(
    app: AppHandle,
    openscad_path: String,
    request: crate::types::RenderExactRequest,
) -> Result<crate::types::RenderExactResponse, String> {
    // Determine where to write temp file
    // If working_dir is provided, write the temp file there so relative imports work
    // Otherwise use cache directory
    let scad_path = if let Some(working_dir) = &request.working_dir {
        let work_path = std::path::PathBuf::from(working_dir);
        work_path.join(".openscad_temp_export.scad")
    } else {
        let app_dir = app
            .path()
            .app_cache_dir()
            .map_err(|e| format!("Failed to get app cache directory: {e}"))?;
        std::fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create cache directory: {e}"))?;
        app_dir.join("export.scad")
    };

    // Write source to temp file
    std::fs::write(&scad_path, &request.source)
        .map_err(|e| format!("Failed to write temp .scad file: {e}"))?;

    // Determine file extension from format
    let extension = match request.format {
        crate::types::ExportFormat::Stl => "stl",
        crate::types::ExportFormat::Obj => "obj",
        crate::types::ExportFormat::Amf => "amf",
        crate::types::ExportFormat::ThreeMf => "3mf",
        crate::types::ExportFormat::Png => "png",
        crate::types::ExportFormat::Svg => "svg",
        crate::types::ExportFormat::Dxf => "dxf",
    };

    // Validate output path has correct extension
    let out_path = std::path::PathBuf::from(&request.out_path);
    if !request.out_path.ends_with(&format!(".{extension}")) {
        return Err(format!(
            "Output path must end with .{extension} for this format"
        ));
    }

    // Ensure output directory exists
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output directory: {e}"))?;
    }

    // Build command arguments
    let mut args: Vec<String> = vec![
        "-o".to_string(),
        request.out_path.clone(),
        scad_path.to_string_lossy().to_string(),
    ];

    // Add backend flag if specified
    if let Some(backend) = &request.backend {
        match backend {
            crate::types::BackendType::Manifold => args.push("--backend=manifold".to_string()),
            crate::types::BackendType::Cgal => args.push("--backend=cgal".to_string()),
            crate::types::BackendType::Auto => {} // Let OpenSCAD choose
        }
    }

    // For image exports, add size (high quality default)
    if matches!(request.format, crate::types::ExportFormat::Png) {
        args.push("--imgsize=1920,1440".to_string());
        args.push("--preview".to_string());
    }

    println!(
        "[render_exact] Format: {:?}, Output: {}",
        request.format, request.out_path
    );
    println!("[render_exact] Working dir: {:?}", request.working_dir);

    // Execute OpenSCAD with working directory if provided
    let mut command = Command::new(&openscad_path);
    command.args(&args);

    // Set working directory if provided (for resolving relative imports)
    if let Some(working_dir) = &request.working_dir {
        println!("[render_exact] Setting working directory to: {working_dir}");
        command.current_dir(working_dir);
    } else {
        println!("[render_exact] WARNING: No working directory provided!");
    }

    println!("[render_exact] Executing: {openscad_path} {args:?}");

    let output = command.output().map_err(|e| {
        format!("Failed to execute OpenSCAD: {e}. Is OpenSCAD installed at {openscad_path}?")
    })?;

    // Parse diagnostics from stderr
    let stderr = String::from_utf8_lossy(&output.stderr);
    let exit_status = output.status;
    println!("[render_exact] OpenSCAD stderr:\n{stderr}");
    println!("[render_exact] OpenSCAD exit status: {exit_status}");
    let diagnostics = parse_openscad_stderr(&stderr);

    // Check if output file was created
    if !out_path.exists() {
        let has_errors = diagnostics
            .iter()
            .any(|d| matches!(d.severity, crate::types::DiagnosticSeverity::Error));

        if has_errors {
            // Build error message with diagnostic details
            let mut error_msg = String::from("OpenSCAD failed to render due to errors:\n\n");
            for diag in &diagnostics {
                if matches!(diag.severity, crate::types::DiagnosticSeverity::Error) {
                    if let Some(line) = diag.line {
                        error_msg.push_str(&format!("Line {}: {}\n", line, diag.message));
                    } else {
                        error_msg.push_str(&format!("{}\n", diag.message));
                    }
                }
            }
            return Err(error_msg);
        } else {
            // Check for dimension mismatch issues
            let is_3d_format = matches!(
                request.format,
                crate::types::ExportFormat::Stl
                    | crate::types::ExportFormat::Obj
                    | crate::types::ExportFormat::Amf
                    | crate::types::ExportFormat::ThreeMf
            );
            let is_2d_format = matches!(
                request.format,
                crate::types::ExportFormat::Svg | crate::types::ExportFormat::Dxf
            );

            let error_msg = if is_2d_format
                && (stderr.contains("3D object") || stderr.contains("not a 2D object"))
            {
                format!("Cannot export 3D objects as {}. Use a 2D shape (e.g., square, circle, polygon) or choose a 3D export format (STL, OBJ, etc.).", extension.to_uppercase())
            } else if is_3d_format
                && (stderr.contains("not a 3D object") || stderr.contains("2D object"))
            {
                format!("Cannot export 2D objects as {}. Use a 3D shape (e.g., cube, sphere, cylinder) or choose a 2D export format (SVG, DXF).", extension.to_uppercase())
            } else {
                let stderr_preview = if stderr.len() > 1000 {
                    format!("{}...\n\n(Output truncated)", &stderr[..1000])
                } else {
                    stderr.to_string()
                };
                format!(
                    "OpenSCAD failed to create output file.\n\nOpenSCAD output:\n{stderr_preview}"
                )
            };

            return Err(error_msg);
        }
    }

    Ok(crate::types::RenderExactResponse {
        path: request.out_path,
        diagnostics,
    })
}

#[tauri::command]
pub async fn detect_backend(
    openscad_path: String,
) -> Result<crate::types::DetectBackendResponse, String> {
    // First, get version
    let version_output = Command::new(&openscad_path)
        .arg("--version")
        .output()
        .map_err(|e| format!("Failed to execute OpenSCAD: {e}"))?;

    let version_str = String::from_utf8_lossy(&version_output.stdout);
    let version = version_str.lines().next().unwrap_or("unknown").to_string();

    // Try to detect Manifold support by checking if --backend=manifold is accepted
    // We'll do a dry run with a trivial file
    let test_output = Command::new(&openscad_path)
        .args(["--backend=manifold", "--help"])
        .output()
        .map_err(|e| format!("Failed to check Manifold support: {e}"))?;

    // If the command succeeded (exit code 0), manifold is likely supported
    // This is a heuristic - newer OpenSCAD versions support manifold
    let has_manifold = test_output.status.success();

    Ok(crate::types::DetectBackendResponse {
        has_manifold,
        version,
    })
}
