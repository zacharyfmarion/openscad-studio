import { pickOpenScadRenderTarget } from '../../../../packages/shared/src/openscadProjectFiles';
import { DEFAULT_OPENSCAD_CODE, DEFAULT_TAB_NAME } from '../stores/workspaceFactories';

export interface FolderImportResult {
  files: Record<string, string>;
  renderTargetPath: string;
}

export interface ResolveFolderImportOptions {
  createIfEmpty?: boolean;
  workspaceName?: string | null;
}

export function resolveFolderImport(
  files: Record<string, string>,
  options: ResolveFolderImportOptions = {}
): FolderImportResult | null {
  const filePaths = Object.keys(files);

  if (filePaths.length === 0) {
    if (!options.createIfEmpty) {
      return null;
    }

    return {
      files: {
        [DEFAULT_TAB_NAME]: DEFAULT_OPENSCAD_CODE,
      },
      renderTargetPath: DEFAULT_TAB_NAME,
    };
  }

  const renderTargetPath = pickOpenScadRenderTarget(filePaths, null, options.workspaceName);
  if (!renderTargetPath) {
    return null;
  }

  return {
    files,
    renderTargetPath,
  };
}
