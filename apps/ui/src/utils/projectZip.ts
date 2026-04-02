import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

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
 * Falls back to the first .scad file if no manifest is present.
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

    // Only import .scad files
    if (path.endsWith('.scad')) {
      files[path] = strFromU8(data);
    }
  }

  const scadFiles = Object.keys(files);
  if (scadFiles.length === 0) {
    throw new Error('ZIP contains no .scad files');
  }

  // Determine render target
  let renderTargetPath: string;
  if (manifest?.renderTarget && manifest.renderTarget in files) {
    renderTargetPath = manifest.renderTarget;
  } else {
    // Prefer main.scad, otherwise first alphabetically
    renderTargetPath =
      scadFiles.find((p) => p === 'main.scad') ?? scadFiles.sort((a, b) => a.localeCompare(b))[0];
  }

  return { files, renderTargetPath };
}
