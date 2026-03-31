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
    captureCurrentView: async () => null,
    getStlBlobUrl: () => null,
    getPreviewSceneStyle: () => FALLBACK_PREVIEW_SCENE_STYLE,
    listProjectFiles: () => ['lib/utils.scad', 'main.scad', 'parts/base.scad', 'parts/lid.scad'],
    readProjectFile: (path: string) => {
      const files: Record<string, string> = {
        'main.scad': 'use <lib/utils.scad>\ncube(10);',
        'lib/utils.scad': 'module helper() { cube(5); }',
        'parts/base.scad': 'module base() { cube(20); }',
        'parts/lid.scad': 'module lid() { cube(5); }',
      };
      return files[path] ?? null;
    },
    getRenderTargetPath: () => 'main.scad',
    createProjectFile: () => true,
    editProjectFile: () => null,
    setRenderTarget: () => true,
    getMeasurementUnit: () => 'mm',
    setMeasurementUnit: () => {},
    ...overrides,
  };
}

describe('buildTools', () => {
  beforeAll(async () => {
    ({ buildTools } = await import('../aiService'));
  });

  describe('get_project_context', () => {
    it('returns render target path, code, and file listing', async () => {
      const tools = buildTools(createCallbacks()) as Record<string, ExecutableTool>;

      const result = (await tools.get_project_context.execute({})) as string;

      expect(result).toContain('Render target: main.scad');
      expect(result).toContain('cube(10)');
      expect(result).toContain('main.scad (render target)');
      expect(result).toContain('📁 lib/');
      expect(result).toContain('📁 parts/');
    });

    it('truncates large render target content', async () => {
      const longContent = Array.from({ length: 300 }, (_, i) => `// line ${i + 1}`).join('\n');
      const tools = buildTools(
        createCallbacks({
          readProjectFile: (path: string) => (path === 'main.scad' ? longContent : null),
        })
      ) as Record<string, ExecutableTool>;

      const result = (await tools.get_project_context.execute({})) as string;

      expect(result).toContain('showing 150 of 300 lines');
      expect(result).toContain('Use read_file to see the full content.');
      expect(result).not.toContain('// line 200');
    });

    it('handles no render target', async () => {
      const tools = buildTools(
        createCallbacks({ getRenderTargetPath: () => null })
      ) as Record<string, ExecutableTool>;

      const result = (await tools.get_project_context.execute({})) as string;

      expect(result).toContain('No render target set.');
    });

    it('handles empty project', async () => {
      const tools = buildTools(
        createCallbacks({
          listProjectFiles: () => [],
          getRenderTargetPath: () => null,
        })
      ) as Record<string, ExecutableTool>;

      const result = (await tools.get_project_context.execute({})) as string;

      expect(result).toContain('No project files.');
    });
  });

  describe('list_folder_contents', () => {
    it('lists root directory entries', async () => {
      const tools = buildTools(createCallbacks()) as Record<string, ExecutableTool>;

      const result = (await tools.list_folder_contents.execute({})) as string;

      expect(result).toContain('Project root:');
      expect(result).toContain('📁 lib/');
      expect(result).toContain('📁 parts/');
      expect(result).toContain('main.scad (render target)');
    });

    it('lists subdirectory contents', async () => {
      const tools = buildTools(createCallbacks()) as Record<string, ExecutableTool>;

      const result = (await tools.list_folder_contents.execute({ path: 'parts' })) as string;

      expect(result).toContain('Contents of parts/');
      expect(result).toContain('base.scad');
      expect(result).toContain('lid.scad');
      expect(result).not.toContain('main.scad');
      expect(result).not.toContain('📁');
    });

    it('strips trailing slash from path', async () => {
      const tools = buildTools(createCallbacks()) as Record<string, ExecutableTool>;

      const result = (await tools.list_folder_contents.execute({ path: 'parts/' })) as string;

      expect(result).toContain('Contents of parts/');
      expect(result).toContain('base.scad');
    });

    it('returns message for empty folder', async () => {
      const tools = buildTools(createCallbacks()) as Record<string, ExecutableTool>;

      const result = (await tools.list_folder_contents.execute({
        path: 'nonexistent',
      })) as string;

      expect(result).toContain('No files found');
    });

    it('returns message for empty project', async () => {
      const tools = buildTools(
        createCallbacks({ listProjectFiles: () => [] })
      ) as Record<string, ExecutableTool>;

      const result = (await tools.list_folder_contents.execute({})) as string;

      expect(result).toBe('No project files found.');
    });
  });

  describe('read_file', () => {
    it('reads project files by path', async () => {
      const tools = buildTools(createCallbacks()) as Record<string, ExecutableTool>;

      const result = await tools.read_file.execute({ path: 'lib/utils.scad' });

      expect(result).toBe('module helper() { cube(5); }');
    });

    it('includes available files when a file is missing', async () => {
      const tools = buildTools(createCallbacks()) as Record<string, ExecutableTool>;

      const result = (await tools.read_file.execute({ path: 'missing.scad' })) as string;

      expect(result).toContain('❌ File not found: missing.scad');
      expect(result).toContain('lib/utils.scad');
      expect(result).toContain('main.scad');
    });
  });

  describe('apply_edit', () => {
    it('edits non-render-target file via editProjectFile', async () => {
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

    it('returns error from editProjectFile', async () => {
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

    it('edits render target with checkpoint when file_path omitted', async () => {
      const tools = buildTools(createCallbacks()) as Record<string, ExecutableTool>;

      const result = (await tools.apply_edit.execute({
        old_string: 'cube(10)',
        new_string: 'cube(20)',
        rationale: 'make bigger',
      })) as string;

      expect(result).toContain('✅ Edit applied successfully');
    });

    it('reports error when old_string not found in render target', async () => {
      const tools = buildTools(createCallbacks()) as Record<string, ExecutableTool>;

      const result = (await tools.apply_edit.execute({
        old_string: 'nonexistent_string',
        new_string: 'replacement',
        rationale: 'test',
      })) as string;

      expect(result).toContain('❌ Failed to apply edit: old_string not found');
    });
  });

  describe('create_file', () => {
    it('creates a new project file', async () => {
      const createProjectFile = jest.fn(() => true);
      const tools = buildTools(
        createCallbacks({ createProjectFile: createProjectFile as never })
      ) as Record<string, ExecutableTool>;

      const result = await tools.create_file.execute({
        file_path: 'parts/base.scad',
        content: 'module base() { cube(20); }',
        rationale: 'split out base module',
      });

      expect(createProjectFile).toHaveBeenCalledWith(
        'parts/base.scad',
        'module base() { cube(20); }'
      );
      expect(result).toContain('✅ Created parts/base.scad');
    });

    it('returns error when file exists', async () => {
      const tools = buildTools(createCallbacks({ createProjectFile: () => false })) as Record<
        string,
        ExecutableTool
      >;

      const result = await tools.create_file.execute({
        file_path: 'main.scad',
        content: '// duplicate',
        rationale: 'test',
      });

      expect(result).toContain('❌ Failed to create main.scad');
    });
  });

  describe('set_render_target', () => {
    it('changes the render target', async () => {
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

    it('returns error for missing file', async () => {
      const tools = buildTools(createCallbacks({ setRenderTarget: () => false })) as Record<
        string,
        ExecutableTool
      >;

      const result = (await tools.set_render_target.execute({
        file_path: 'nonexistent.scad',
      })) as string;

      expect(result).toContain('❌ File not found: nonexistent.scad');
      expect(result).toContain('lib/utils.scad');
      expect(result).toContain('main.scad');
    });
  });

  describe('get_diagnostics', () => {
    it('returns success when no errors', async () => {
      const tools = buildTools(createCallbacks()) as Record<string, ExecutableTool>;

      const result = (await tools.get_diagnostics.execute({})) as string;

      expect(result).toContain('✅ No errors or warnings');
    });
  });
});
