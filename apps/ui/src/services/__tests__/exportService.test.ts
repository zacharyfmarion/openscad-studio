import { jest } from '@jest/globals';
import { exportModelWithContext } from '../exportService';
import type { ProjectStoreState } from '../../stores/projectTypes';

function createState(overrides: Partial<ProjectStoreState> = {}): ProjectStoreState {
  return {
    projectRoot: '/project',
    renderTargetPath: 'models/main.scad',
    contentVersion: 0,
    emptyFolders: [],
    files: {
      'models/main.scad': {
        content: 'use <shared/utils.scad>\ninclude <BOSL2/std.scad>\ncube(size);',
        savedContent: 'use <shared/utils.scad>\ninclude <BOSL2/std.scad>\ncube(size);',
        isDirty: false,
        isVirtual: false,
        customizerBaseContent: 'use <shared/utils.scad>\ninclude <BOSL2/std.scad>\ncube(size);',
      },
      'models/shared/utils.scad': {
        content: 'size = 24;',
        savedContent: 'size = 24;',
        isDirty: false,
        isVirtual: false,
        customizerBaseContent: 'size = 24;',
      },
    },
    ...overrides,
  };
}

describe('exportService', () => {
  it('exports with shared project and library render inputs', async () => {
    const exportModel = jest.fn(async () => new Uint8Array([1, 2, 3]));
    const getLibraryPaths = jest.fn(async () => ['/lib/system']);
    const readDirectoryFiles = jest
      .fn()
      .mockResolvedValueOnce({ 'BOSL2/std.scad': 'module std() {}' })
      .mockResolvedValueOnce({ 'custom/std.scad': 'module custom() {}' });
    const readTextFile = jest.fn(async () => null);

    const result = await exportModelWithContext({
      format: 'stl',
      library: {
        autoDiscoverSystem: true,
        customPaths: ['/lib/custom'],
      },
      state: createState(),
      renderService: { exportModel } as never,
      platform: {
        getLibraryPaths,
        readDirectoryFiles,
        readTextFile,
      } as never,
    });

    expect(result).toEqual(new Uint8Array([1, 2, 3]));
    expect(exportModel).toHaveBeenCalledWith(
      'use <shared/utils.scad>\ninclude <BOSL2/std.scad>\ncube(size);',
      'stl',
      {
        backend: 'manifold',
        auxiliaryFiles: {
          'BOSL2/std.scad': 'module std() {}',
          'custom/std.scad': 'module custom() {}',
          'models/shared/utils.scad': 'size = 24;',
        },
        inputPath: 'models/main.scad',
        libraryFiles: {
          'BOSL2/std.scad': 'module std() {}',
          'custom/std.scad': 'module custom() {}',
        },
        libraryPaths: ['/lib/system', '/lib/custom'],
        workingDir: '/project',
      }
    );
  });
});
