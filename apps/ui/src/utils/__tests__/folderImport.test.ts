import { resolveFolderImport } from '../folderImport';
import { DEFAULT_OPENSCAD_CODE, DEFAULT_TAB_NAME } from '../../stores/workspaceFactories';

describe('resolveFolderImport', () => {
  it('selects the preferred render target from imported files', () => {
    expect(
      resolveFolderImport(
        {
          'lib/helper.scad': '// helper',
          'main.scad': 'cube(10);',
        },
        { workspaceName: 'widgets', createIfEmpty: true }
      )
    ).toEqual({
      files: {
        'lib/helper.scad': '// helper',
        'main.scad': 'cube(10);',
      },
      renderTargetPath: 'main.scad',
    });
  });

  it('creates a default main.scad file for empty folder imports when enabled', () => {
    expect(resolveFolderImport({}, { createIfEmpty: true, workspaceName: 'empty-folder' })).toEqual(
      {
        files: {
          [DEFAULT_TAB_NAME]: DEFAULT_OPENSCAD_CODE,
        },
        renderTargetPath: DEFAULT_TAB_NAME,
      }
    );
  });

  it('returns null for empty folder imports when creation is disabled', () => {
    expect(resolveFolderImport({}, { createIfEmpty: false, workspaceName: 'empty-folder' })).toBe(
      null
    );
  });
});
