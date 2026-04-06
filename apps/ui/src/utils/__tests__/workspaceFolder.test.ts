/** @jest-environment jsdom */

import { jest } from '@jest/globals';
import { findEmptyFolders, loadWorkspaceFolder } from '../workspaceFolder';
import { DEFAULT_OPENSCAD_CODE, DEFAULT_TAB_NAME } from '../../stores/workspaceFactories';

describe('workspaceFolder', () => {
  it('finds directories that have no file descendants', () => {
    expect(
      findEmptyFolders(['lib', 'lib/generated', 'parts', 'parts/full'], ['parts/full/main.scad'])
    ).toEqual(['lib', 'lib/generated']);
  });

  it('loads a workspace folder and prefers main.scad as the render target', async () => {
    const platform = {
      createDirectory: jest.fn(),
      readDirectoryFiles: jest.fn(async () => ({
        'lib/helper.scad': '// helper',
        'main.scad': 'cube(1);',
      })),
      readSubdirectories: jest.fn(async () => ['lib', 'empty']),
      writeTextFile: jest.fn(),
    };

    const result = await loadWorkspaceFolder(platform, '/tmp/project');

    expect(result).toEqual({
      files: {
        'lib/helper.scad': '// helper',
        'main.scad': 'cube(1);',
      },
      renderTargetPath: 'main.scad',
      emptyFolders: ['empty'],
      createdDefaultFile: false,
    });
    expect(platform.writeTextFile).not.toHaveBeenCalled();
  });

  it('creates a default main.scad file when opening an empty folder in create mode', async () => {
    const platform = {
      createDirectory: jest.fn(async () => {}),
      readDirectoryFiles: jest.fn(async () => ({})),
      readSubdirectories: jest.fn(async () => []),
      writeTextFile: jest.fn(async () => {}),
    };

    const result = await loadWorkspaceFolder(platform, '/tmp/empty', {
      createIfEmpty: true,
    });

    expect(platform.createDirectory).toHaveBeenCalledWith('/tmp/empty');
    expect(platform.writeTextFile).toHaveBeenCalledWith(
      '/tmp/empty/main.scad',
      DEFAULT_OPENSCAD_CODE
    );
    expect(result).toEqual({
      files: {
        [DEFAULT_TAB_NAME]: DEFAULT_OPENSCAD_CODE,
      },
      renderTargetPath: DEFAULT_TAB_NAME,
      emptyFolders: [],
      createdDefaultFile: true,
    });
  });
});
