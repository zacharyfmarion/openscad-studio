import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import {
  isOpenScadProjectFilePath,
  pickOpenScadRenderTarget,
} from '../../../../packages/shared/src/openscadProjectFiles';

const MANIFEST_FILENAME = '.openscad-studio.json';

interface ProjectManifest {
  version: 1;
  renderTarget: string;
}

export interface ProjectExportData {
  files: Record<string, string>;
  renderTargetPath: string;
}

export interface ProjectImportResult {
  files: Record<string, string>;
  renderTargetPath: string;
}

/**
 * Export project files as a ZIP blob.
 * Includes a manifest with the render target path.
 */
export function exportProjectZip(data: ProjectExportData): Blob {
  const zipData: Record<string, Uint8Array> = {};

  // Add all project files
  for (const [path, content] of Object.entries(data.files)) {
    zipData[path] = strToU8(content);
  }

  // Add manifest
  const manifest: ProjectManifest = {
    version: 1,
    renderTarget: data.renderTargetPath,
  };
  zipData[MANIFEST_FILENAME] = strToU8(JSON.stringify(manifest, null, 2));

  const zipped = zipSync(zipData);
  return new Blob([zipped], { type: 'application/zip' });
}

/**
 * Import a project from a ZIP blob.
 * Reads the manifest to determine the render target.
 * Falls back to the first renderable `.scad` file if no manifest is present.
 */
export async function importProjectZip(blob: Blob): Promise<ProjectImportResult> {
  const buffer = await blob.arrayBuffer();
  const unzipped = unzipSync(new Uint8Array(buffer));

  const files: Record<string, string> = {};
  let manifest: ProjectManifest | null = null;

  for (const [path, data] of Object.entries(unzipped)) {
    // Skip macOS resource fork files and hidden OS files
    if (path.startsWith('__MACOSX/') || path.startsWith('.DS_Store')) continue;

    if (path === MANIFEST_FILENAME) {
      try {
        manifest = JSON.parse(strFromU8(data));
      } catch {
        // Ignore malformed manifest
      }
      continue;
    }

    if (isOpenScadProjectFilePath(path)) {
      files[path] = strFromU8(data);
    }
  }

  const renderTargetPath =
    (manifest?.renderTarget && manifest.renderTarget in files ? manifest.renderTarget : null) ??
    pickOpenScadRenderTarget(Object.keys(files));

  if (!renderTargetPath) {
    throw new Error('ZIP contains no renderable .scad files');
  }

  return { files, renderTargetPath };
}
