use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnostic {
    pub severity: DiagnosticSeverity,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub col: Option<i32>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
    Info,
}

impl DiagnosticSeverity {
    pub fn is_error(&self) -> bool {
        matches!(self, DiagnosticSeverity::Error)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BackendType {
    Manifold,
    Cgal,
    Auto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ViewMode {
    #[serde(rename = "3d")]
    ThreeD,
    #[serde(rename = "2d")]
    TwoD,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RenderKind {
    Png,
    Svg,
    Mesh,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Stl,
    Obj,
    Amf,
    #[serde(rename = "3mf")]
    ThreeMf,
    Png,
    Svg,
    Dxf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Size {
    pub w: u32,
    pub h: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderPreviewRequest {
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backend: Option<BackendType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub view: Option<ViewMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<Size>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub render_mesh: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub working_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderPreviewResponse {
    pub kind: RenderKind,
    pub path: String,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectBackendResponse {
    pub has_manifold: bool,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocateOpenScadRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub explicit_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocateOpenScadResponse {
    pub exe_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderExactRequest {
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backend: Option<BackendType>,
    pub format: ExportFormat,
    pub out_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub working_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderExactResponse {
    pub path: String,
    pub diagnostics: Vec<Diagnostic>,
}

// ============================================================================
// Editor History Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ChangeType {
    User,
    Ai,
    FileLoad,
    Undo,
    Redo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorCheckpoint {
    pub id: String,
    pub timestamp: i64,
    pub code: String,
    pub diagnostics: Vec<Diagnostic>,
    pub description: String,
    pub change_type: ChangeType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointDiff {
    pub from_id: String,
    pub to_id: String,
    pub diff: String,
    pub added_lines: usize,
    pub removed_lines: usize,
}
