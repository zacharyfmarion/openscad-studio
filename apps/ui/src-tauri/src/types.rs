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
#[serde(rename_all = "kebab-case")]
pub enum CameraView {
    Front,
    Back,
    Left,
    Right,
    Top,
    Bottom,
    FrontLeft,
    FrontRight,
    BackLeft,
    BackRight,
}

impl CameraView {
    pub fn to_camera_args(&self) -> Vec<String> {
        let rotation = match self {
            CameraView::Front => "0,0,0",
            CameraView::Back => "0,0,180",
            CameraView::Left => "0,0,90",
            CameraView::Right => "0,0,270",
            CameraView::Top => "90,0,0",
            CameraView::Bottom => "-90,0,0",
            CameraView::FrontLeft => "55,0,45",
            CameraView::FrontRight => "55,0,315",
            CameraView::BackLeft => "55,0,135",
            CameraView::BackRight => "55,0,225",
        };
        vec![
            format!("--camera=0,0,0,{}", rotation),
            "--viewall".to_string(),
            "--autocenter".to_string(),
        ]
    }

    pub fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "front" => Ok(CameraView::Front),
            "back" => Ok(CameraView::Back),
            "left" => Ok(CameraView::Left),
            "right" => Ok(CameraView::Right),
            "top" => Ok(CameraView::Top),
            "bottom" => Ok(CameraView::Bottom),
            "front-left" => Ok(CameraView::FrontLeft),
            "front-right" => Ok(CameraView::FrontRight),
            "back-left" => Ok(CameraView::BackLeft),
            "back-right" => Ok(CameraView::BackRight),
            _ => Err(format!("Unknown camera view: {}", s)),
        }
    }
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

// ============================================================================
// AI Model Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub display_name: String,
    pub provider: String,   // "anthropic" | "openai"
    pub model_type: String, // "alias" | "snapshot"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedModels {
    pub models: Vec<ModelInfo>,
    pub fetched_at: i64,
    pub ttl_hours: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchModelsResponse {
    pub models: Vec<ModelInfo>,
    pub from_cache: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_age_minutes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelValidation {
    pub is_valid: bool,
    pub model_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}
