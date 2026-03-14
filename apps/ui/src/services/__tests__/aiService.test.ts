import { jest } from '@jest/globals';

jest.mock('../renderService', () => ({
  RenderService: {
    getInstance: () => ({
      checkSyntax: async () => ({ diagnostics: [] }),
    }),
  },
}));

import { buildTools, type AiToolCallbacks } from '../aiService';
import { FALLBACK_PREVIEW_SCENE_STYLE } from '../previewSceneConfig';

type ExecutableTool = {
  execute: (input: unknown) => Promise<unknown>;
};

function createCallbacks(overrides: Partial<AiToolCallbacks> = {}): AiToolCallbacks {
  return {
    getCurrentCode: () => 'cube(10);',
    captureCurrentView: async () => null,
    getStlBlobUrl: () => null,
    getPreviewSceneStyle: () => FALLBACK_PREVIEW_SCENE_STYLE,
    hasProjectFileAccess: () => true,
    getCurrentFileRelativePath: () => 'main.scad',
    listProjectFiles: async () => ['lib/utils.scad', 'main.scad'],
    readProjectFile: async (path: string) =>
      path === 'lib/utils.scad' ? 'module helper() { cube(5); }' : null,
    ...overrides,
  };
}

describe('buildTools project file tools', () => {
  it('lists project files from the desktop project tree', async () => {
    const tools = buildTools(createCallbacks()) as Record<string, ExecutableTool>;

    const result = await tools.list_project_files.execute({});

    expect(result).toBe('Project files (2):\n  lib/utils.scad\n  main.scad');
  });

  it('returns an unavailable message in web mode or for unsaved files', async () => {
    const tools = buildTools(
      createCallbacks({
        hasProjectFileAccess: () => false,
        listProjectFiles: async () => null,
      })
    ) as Record<string, ExecutableTool>;

    const result = await tools.list_project_files.execute({});

    expect(result).toBe(
      'Project file browsing is unavailable in web mode or for unsaved files. Save the file to disk in the desktop app to let the AI inspect sibling project files.'
    );
  });

  it('reads sibling lib files without relying on render auxiliary files', async () => {
    const tools = buildTools(createCallbacks()) as Record<string, ExecutableTool>;

    const result = await tools.read_file.execute({ path: 'lib/utils.scad' });

    expect(result).toBe('module helper() { cube(5); }');
  });

  it('returns the in-editor buffer for the active file path', async () => {
    const tools = buildTools(
      createCallbacks({
        getCurrentCode: () => 'cube(42);',
      })
    ) as Record<string, ExecutableTool>;

    const result = await tools.read_file.execute({ path: 'main.scad' });

    expect(result).toBe('cube(42);');
  });

  it('includes available files when a desktop file is missing', async () => {
    const tools = buildTools(createCallbacks()) as Record<string, ExecutableTool>;

    const result = await tools.read_file.execute({ path: 'missing.scad' });

    expect(result).toBe(
      '❌ File not found: missing.scad\n\nAvailable files:\n  lib/utils.scad\n  main.scad'
    );
  });

  it('returns an unavailable message when trying to read files in web mode', async () => {
    const tools = buildTools(
      createCallbacks({
        hasProjectFileAccess: () => false,
        readProjectFile: async () => null,
      })
    ) as Record<string, ExecutableTool>;

    const result = await tools.read_file.execute({ path: 'lib/utils.scad' });

    expect(result).toBe(
      '❌ Unable to read file: lib/utils.scad\n\nProject file browsing is unavailable in web mode or for unsaved files. Save the file to disk in the desktop app to let the AI inspect sibling project files.'
    );
  });
});
