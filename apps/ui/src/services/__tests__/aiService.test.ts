import { jest } from '@jest/globals';

jest.unstable_mockModule('@/services/renderService', () => ({
  RenderService: {
    getInstance: () => ({
      checkSyntax: async () => ({ diagnostics: [] }),
    }),
  },
}));

import { FALLBACK_PREVIEW_SCENE_STYLE } from '../previewSceneConfig';
import type { AiToolCallbacks } from '../aiService';

let buildTools: typeof import('../aiService').buildTools;

type ExecutableTool = {
  execute: (input: unknown) => Promise<unknown>;
};

function createCallbacks(overrides: Partial<AiToolCallbacks> = {}): AiToolCallbacks {
  return {
    getCurrentCode: () => 'cube(10);',
    captureCurrentView: async () => null,
    getStlBlobUrl: () => null,
    getPreviewSceneStyle: () => FALLBACK_PREVIEW_SCENE_STYLE,
    listProjectFiles: () => ['lib/utils.scad', 'main.scad'],
    readProjectFile: (path: string) =>
      path === 'lib/utils.scad' ? 'module helper() { cube(5); }' : null,
    getRenderTargetPath: () => 'main.scad',
    getFileContent: (path: string) =>
      path === 'main.scad'
        ? 'cube(10);'
        : path === 'lib/utils.scad'
          ? 'module helper() { cube(5); }'
          : null,
    createProjectFile: () => true,
    editProjectFile: () => null,
    setRenderTarget: () => true,
    getMeasurementUnit: () => 'mm',
    setMeasurementUnit: () => {},
    ...overrides,
  };
}

describe('buildTools project file tools', () => {
  beforeAll(async () => {
    ({ buildTools } = await import('../aiService'));
  });

  it('lists project files and marks the render target', async () => {
    const tools = buildTools(createCallbacks()) as Record<string, ExecutableTool>;

    const result = await tools.list_project_files.execute({});

    expect(result).toContain('lib/utils.scad');
    expect(result).toContain('main.scad');
    expect(result).toContain('render target');
  });

  it('returns no files message when project is empty', async () => {
    const tools = buildTools(
      createCallbacks({
        listProjectFiles: () => [],
      })
    ) as Record<string, ExecutableTool>;

    const result = await tools.list_project_files.execute({});

    expect(result).toBe('No project files found.');
  });

  it('reads project files via readProjectFile callback', async () => {
    const tools = buildTools(createCallbacks()) as Record<string, ExecutableTool>;

    const result = await tools.read_file.execute({ path: 'lib/utils.scad' });

    expect(result).toBe('module helper() { cube(5); }');
  });

  it('includes available files when a file is missing', async () => {
    const tools = buildTools(createCallbacks()) as Record<string, ExecutableTool>;

    const result = await tools.read_file.execute({ path: 'missing.scad' });

    expect(result).toBe(
      '❌ File not found: missing.scad\n\nAvailable files:\n  lib/utils.scad\n  main.scad'
    );
  });

  it('apply_edit with file_path delegates to editProjectFile', async () => {
    const editProjectFile = jest.fn(() => null);
    const tools = buildTools(
      createCallbacks({ editProjectFile: editProjectFile as never })
    ) as Record<string, ExecutableTool>;

    const result = await tools.apply_edit.execute({
      file_path: 'lib/utils.scad',
      old_string: 'cube(5)',
      new_string: 'cube(10)',
      rationale: 'resize helper',
    });

    expect(editProjectFile).toHaveBeenCalledWith('lib/utils.scad', 'cube(5)', 'cube(10)');
    expect(result).toContain('✅ Edit applied to lib/utils.scad');
  });

  it('apply_edit with file_path returns error from editProjectFile', async () => {
    const tools = buildTools(
      createCallbacks({
        editProjectFile: () => 'old_string not found in the file',
      })
    ) as Record<string, ExecutableTool>;

    const result = await tools.apply_edit.execute({
      file_path: 'lib/utils.scad',
      old_string: 'nonexistent',
      new_string: 'replaced',
      rationale: 'test',
    });

    expect(result).toContain('❌ Failed to apply edit to lib/utils.scad');
  });

  it('create_file creates a new project file', async () => {
    const createProjectFile = jest.fn(() => true);
    const tools = buildTools(
      createCallbacks({ createProjectFile: createProjectFile as never })
    ) as Record<string, ExecutableTool>;

    const result = await tools.create_file.execute({
      file_path: 'parts/base.scad',
      content: 'module base() { cube(20); }',
      rationale: 'split out base module',
    });

    expect(createProjectFile).toHaveBeenCalledWith('parts/base.scad', 'module base() { cube(20); }');
    expect(result).toContain('✅ Created parts/base.scad');
  });

  it('create_file returns error when file exists', async () => {
    const tools = buildTools(
      createCallbacks({ createProjectFile: () => false })
    ) as Record<string, ExecutableTool>;

    const result = await tools.create_file.execute({
      file_path: 'main.scad',
      content: '// duplicate',
      rationale: 'test',
    });

    expect(result).toContain('❌ Failed to create main.scad');
  });

  it('set_render_target changes the render target', async () => {
    const setRenderTarget = jest.fn(() => true);
    const tools = buildTools(
      createCallbacks({ setRenderTarget: setRenderTarget as never })
    ) as Record<string, ExecutableTool>;

    const result = await tools.set_render_target.execute({
      file_path: 'lib/utils.scad',
    });

    expect(setRenderTarget).toHaveBeenCalledWith('lib/utils.scad');
    expect(result).toContain('✅ Render target changed to lib/utils.scad');
  });

  it('set_render_target returns error for missing file', async () => {
    const tools = buildTools(
      createCallbacks({ setRenderTarget: () => false })
    ) as Record<string, ExecutableTool>;

    const result = await tools.set_render_target.execute({
      file_path: 'nonexistent.scad',
    });

    expect(result).toContain('❌ File not found: nonexistent.scad');
    expect(result).toContain('lib/utils.scad');
    expect(result).toContain('main.scad');
  });
});
