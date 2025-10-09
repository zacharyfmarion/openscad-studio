import { z } from 'zod';

// Diagnostic severity levels
export const DiagnosticSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  line: z.number().int().optional(),
  col: z.number().int().optional(),
  message: z.string(),
});

export type Diagnostic = z.infer<typeof DiagnosticSchema>;

// Backend types
export const BackendTypeSchema = z.enum(['manifold', 'cgal', 'auto']);
export type BackendType = z.infer<typeof BackendTypeSchema>;

// View modes
export const ViewModeSchema = z.enum(['3d', '2d']);
export type ViewMode = z.infer<typeof ViewModeSchema>;

// Export formats
export const ExportFormatSchema = z.enum(['stl', 'obj', 'amf', '3mf', 'png', 'svg', 'dxf']);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

// Render kind
export const RenderKindSchema = z.enum(['png', 'svg', 'mesh']);
export type RenderKind = z.infer<typeof RenderKindSchema>;

// Size
export const SizeSchema = z.object({
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});

export type Size = z.infer<typeof SizeSchema>;

// --- IPC Commands ---

// Render preview request
export const RenderPreviewRequestSchema = z.object({
  source: z.string(),
  backend: BackendTypeSchema.optional(),
  view: ViewModeSchema.optional(),
  size: SizeSchema.optional(),
  render_mesh: z.boolean().optional(),
});

export type RenderPreviewRequest = z.infer<typeof RenderPreviewRequestSchema>;

// Render preview response
export const RenderPreviewResponseSchema = z.object({
  kind: RenderKindSchema,
  path: z.string(),
  diagnostics: z.array(DiagnosticSchema),
});

export type RenderPreviewResponse = z.infer<typeof RenderPreviewResponseSchema>;

// Render exact request
export const RenderExactRequestSchema = z.object({
  source: z.string(),
  backend: BackendTypeSchema.optional(),
  format: ExportFormatSchema,
});

export type RenderExactRequest = z.infer<typeof RenderExactRequestSchema>;

// Render exact response
export const RenderExactResponseSchema = z.object({
  path: z.string(),
  diagnostics: z.array(DiagnosticSchema),
});

export type RenderExactResponse = z.infer<typeof RenderExactResponseSchema>;

// Detect backend response
export const DetectBackendResponseSchema = z.object({
  hasManifold: z.boolean(),
  version: z.string(),
});

export type DetectBackendResponse = z.infer<typeof DetectBackendResponseSchema>;

// LLM intent types
export const LlmIntentSchema = z.enum(['add', 'modify', 'explain']);
export type LlmIntent = z.infer<typeof LlmIntentSchema>;

// Cursor position
export const CursorPositionSchema = z.object({
  line: z.number().int(),
  col: z.number().int(),
});

export type CursorPosition = z.infer<typeof CursorPositionSchema>;

// LLM suggest request
export const LlmSuggestRequestSchema = z.object({
  source: z.string(),
  intent: LlmIntentSchema,
  prompt: z.string(),
  cursor: CursorPositionSchema.optional(),
});

export type LlmSuggestRequest = z.infer<typeof LlmSuggestRequestSchema>;

// LLM suggest response
export const LlmSuggestResponseSchema = z.object({
  patch: z.string(), // unified diff format
  rationale: z.string(),
});

export type LlmSuggestResponse = z.infer<typeof LlmSuggestResponseSchema>;

// Lint request
export const LintRequestSchema = z.object({
  source: z.string(),
});

export type LintRequest = z.infer<typeof LintRequestSchema>;

// Lint response
export const LintResponseSchema = z.object({
  diagnostics: z.array(DiagnosticSchema),
});

export type LintResponse = z.infer<typeof LintResponseSchema>;

// Export request
export const ExportRequestSchema = z.object({
  source: z.string(),
  format: ExportFormatSchema,
  outPath: z.string(),
});

export type ExportRequest = z.infer<typeof ExportRequestSchema>;

// Export response
export const ExportResponseSchema = z.object({
  path: z.string(),
});

export type ExportResponse = z.infer<typeof ExportResponseSchema>;

// Locate OpenSCAD request
export const LocateOpenScadRequestSchema = z.object({
  explicitPath: z.string().optional(),
});

export type LocateOpenScadRequest = z.infer<typeof LocateOpenScadRequestSchema>;

// Locate OpenSCAD response
export const LocateOpenScadResponseSchema = z.object({
  exePath: z.string(),
});

export type LocateOpenScadResponse = z.infer<typeof LocateOpenScadResponseSchema>;
