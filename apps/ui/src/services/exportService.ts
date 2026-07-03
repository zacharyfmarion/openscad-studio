import { getPlatform } from '../platform';
import type { PlatformBridge } from '../platform/types';
import { getProjectState } from '../stores/projectStore';
import type { ProjectStoreState } from '../stores/projectTypes';
import type { LibrarySettings } from '../stores/settingsStore';
import { buildProjectRenderInputs, loadConfiguredLibraryAssets } from './projectRenderInputs';
import { getRenderService, type ExportFormat, type IRenderService } from './renderService';

interface ExportModelWithContextOptions {
  format: ExportFormat;
  library: LibrarySettings;
  source?: string | null;
  state?: ProjectStoreState;
  workingDir?: string | null;
  platform?: PlatformBridge;
  renderService?: Pick<IRenderService, 'exportModel'>;
}

export async function exportModelWithContext(
  options: ExportModelWithContextOptions
): Promise<Uint8Array> {
  const state = options.state ?? getProjectState();
  const workingDir = options.workingDir ?? state.projectRoot;
  const platform = options.platform ?? getPlatform();
  const renderService = options.renderService ?? getRenderService();
  const { libraryFiles, libraryPaths } = await loadConfiguredLibraryAssets(
    options.library,
    platform
  );
  const renderInputs = await buildProjectRenderInputs({
    state,
    code: options.source,
    workingDir,
    libraryFiles,
    libraryPaths,
    platform: workingDir ? platform : undefined,
  });

  try {
    return await renderService.exportModel(renderInputs.code, options.format, {
      backend: 'manifold',
      ...renderInputs.renderOptions,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('indirect call signature mismatch')) {
      return await renderService.exportModel(renderInputs.code, options.format, {
        backend: 'cgal',
        ...renderInputs.renderOptions,
      });
    }
    throw err;
  }
}
