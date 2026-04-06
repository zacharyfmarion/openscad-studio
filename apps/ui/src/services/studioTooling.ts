import { captureOffscreen, type CaptureOptions } from './offscreenRenderer';
import type { PreviewSceneStyle } from './previewSceneConfig';

const MAX_CONTEXT_LINES = 200;
const TRUNCATION_LINES = 150;

export interface ProjectContextOptions {
  renderTarget: string | null;
  renderTargetContent: string | null;
  allFiles: string[];
  includeTopLevelListing?: boolean;
}

export interface PreviewScreenshotOptions {
  captureCurrentView: () => Promise<string | null>;
  get3dPreviewUrl: () => string | null;
  getPreviewSceneStyle: () => PreviewSceneStyle;
  getUseModelColors: () => boolean;
  view?: 'current' | 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right' | 'isometric';
  azimuth?: number;
  elevation?: number;
}

/**
 * List files and subfolders at a specific directory level.
 * Returns a formatted string with entries like:
 *   📁 lib/
 *   main.scad (render target)
 *   utils.scad
 */
export function listFolderEntries(
  allFiles: string[],
  folder: string,
  renderTarget?: string | null
): string {
  const prefix = folder ? `${folder}/` : '';
  const folders = new Set<string>();
  const files: string[] = [];

  for (const filePath of allFiles) {
    if (!filePath.startsWith(prefix)) continue;
    const remainder = filePath.slice(prefix.length);
    const slashIdx = remainder.indexOf('/');
    if (slashIdx >= 0) {
      folders.add(remainder.slice(0, slashIdx));
    } else {
      files.push(remainder);
    }
  }

  const lines: string[] = [];
  for (const dir of [...folders].sort()) {
    lines.push(`  📁 ${dir}/`);
  }
  for (const file of files.sort()) {
    const fullPath = prefix + file;
    lines.push(fullPath === renderTarget ? `  ${file} (render target)` : `  ${file}`);
  }

  return lines.join('\n');
}

export function buildProjectContextSummary({
  renderTarget,
  renderTargetContent,
  allFiles,
  includeTopLevelListing = true,
}: ProjectContextOptions): string {
  const parts: string[] = [];

  if (renderTarget) {
    parts.push(`Render target: ${renderTarget}`);
    if (renderTargetContent) {
      const lines = renderTargetContent.split('\n');
      if (lines.length > MAX_CONTEXT_LINES) {
        const truncated = lines.slice(0, TRUNCATION_LINES).join('\n');
        parts.push(
          `\n--- ${renderTarget} (showing ${TRUNCATION_LINES} of ${lines.length} lines) ---\n${truncated}\n\n[Truncated.]`
        );
      } else {
        parts.push(`\n--- ${renderTarget} ---\n${renderTargetContent}`);
      }
    }
  } else {
    parts.push('No render target set.');
  }

  if (allFiles.length === 0) {
    parts.push('\nNo project files.');
    return parts.join('\n');
  }

  if (includeTopLevelListing) {
    const topLevel = listFolderEntries(allFiles, '', renderTarget);
    parts.push(`\nProject files (${allFiles.length} total):\n${topLevel}`);
  } else {
    parts.push(`\nProject files: ${allFiles.length} total`);
  }

  return parts.join('\n');
}

export async function capturePreviewScreenshot({
  captureCurrentView,
  get3dPreviewUrl,
  getPreviewSceneStyle,
  getUseModelColors,
  view = 'current',
  azimuth,
  elevation,
}: PreviewScreenshotOptions): Promise<{ image_data_url?: string; error?: string }> {
  const useOffscreen = view !== 'current' || azimuth !== undefined || elevation !== undefined;

  if (!useOffscreen) {
    const dataUrl = await captureCurrentView();
    if (dataUrl) {
      return { image_data_url: dataUrl };
    }
    return {
      error:
        'No preview available. The code may not have been rendered yet, or the preview panel is not visible.',
    };
  }

  const preview3dUrl = get3dPreviewUrl();
  if (!preview3dUrl) {
    return {
      error:
        'No 3D model available for angle-specific views. Render the code first, or use view="current" to capture the 2D SVG preview.',
    };
  }

  try {
    const opts: CaptureOptions = {};
    if (azimuth !== undefined || elevation !== undefined) {
      opts.azimuth = azimuth;
      opts.elevation = elevation;
    } else if (view !== 'current') {
      opts.view = view;
    }
    opts.sceneStyle = getPreviewSceneStyle();
    opts.useModelColors = getUseModelColors();
    const dataUrl = await captureOffscreen(preview3dUrl, opts);
    return { image_data_url: dataUrl };
  } catch (err) {
    return {
      error: `Failed to capture screenshot: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
